import type {
  AnalyticsStore,
  PerformanceMetricsSnapshot,
  StudyBlock,
  StudyPreferences,
  Subject,
  SubjectPerformanceProfile,
  TopicProgress,
  UserLearningLevel,
} from '@/types';
import { getEnemDisciplineByName, normalizeEnemText } from '@/lib/enemCatalog';
import { parseBlockDate, toLocalDateKey } from '@/lib/utils';
import { computeSessionScores } from '@/services/sessionScoring';

export interface AdaptiveScoreFactors {
  weight: number;
  difficultyFactor: number;
  timeWithoutStudyFactor: number;
  errorRateFactor: number;
  examProximityFactor: number;
}

export interface AdaptiveSchedulingContext {
  subject: Subject;
  profile?: SubjectPerformanceProfile;
  now: Date;
  examDate?: string;
  userLevel: UserLearningLevel;
}

export interface IntelligentAnalyticsSummary {
  avgAccuracyRate: number;
  weakestSubject?: { id: string; name: string; accuracyRate: number };
  strongestSubject?: { id: string; name: string; accuracyRate: number };
  projectedImprovement30d: number;
  consistencyRate: number;
  avgFocusScore: number;
  avgProductivityScore: number;
}

const DEFAULT_AREA_WEIGHT: Record<string, number> = {
  matematica: 1.0,
  linguagens: 0.5,
  natureza: 0.75,
  humanas: 0.7,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function avg(prev: number | undefined, next: number, countBefore: number) {
  if (!Number.isFinite(prev as number)) return next;
  const safePrev = prev ?? next;
  return (safePrev * countBefore + next) / (countBefore + 1);
}

function normalizeDateString(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function getEnemWeightForSubject(subject: Subject): number {
  if (typeof subject.enemWeight === 'number') {
    return clamp(subject.enemWeight, 0.1, 1);
  }

  const normalized = normalizeEnemText(subject.name);
  if (normalized.includes('matematica')) return 1.0;
  if (normalized.includes('portugues')) return 0.95;
  if (normalized.includes('redacao')) return 0.9;

  const catalog = getEnemDisciplineByName(subject.name);
  if (catalog && typeof catalog.enemWeight === 'number') {
    return clamp(catalog.enemWeight, 0.1, 1);
  }

  const area = normalizeEnemText(subject.area || '');
  if (area.includes('natureza')) return 0.75;
  if (area.includes('human')) return 0.7;
  if (area.includes('matematica') || area.includes('exatas')) return 1.0;
  if (area.includes('ling')) return 0.5;

  return DEFAULT_AREA_WEIGHT[catalog?.area || ''] ?? 0.5;
}

export function inferUserLearningLevel(
  studyPrefs: StudyPreferences | undefined,
  subjects: Subject[],
  analytics?: AnalyticsStore
): UserLearningLevel {
  if (studyPrefs?.userLevel) return studyPrefs.userLevel;

  const profiles = analytics?.performance?.subjects
    ? Object.values(analytics.performance.subjects)
    : [];
  const avgAccuracy =
    profiles.length > 0
      ? profiles.reduce((sum, profile) => sum + (profile.accuracyRate || 0), 0) / profiles.length
      : 0;
  const avgDifficulty =
    subjects.length > 0
      ? subjects.reduce((sum, subject) => sum + (subject.difficulty || 5), 0) / subjects.length
      : 5;

  if (avgAccuracy >= 0.78 && avgDifficulty >= 6) return 'avancado';
  if (avgAccuracy > 0 && avgAccuracy < 0.55) return 'iniciante';
  return 'intermediario';
}

export function getDifficultyFactor(
  subjectDifficulty: number,
  userLevel: UserLearningLevel
): number {
  const difficulty = clamp(subjectDifficulty || 5, 1, 10);
  const base = 0.7 + difficulty / 10; // 0.8 - 1.7
  const levelModifier =
    userLevel === 'iniciante' ? 1.08 : userLevel === 'avancado' ? 0.95 : 1;
  return Number((base * levelModifier).toFixed(3));
}

export function getTimeWithoutStudyFactor(lastStudiedAt: string | undefined, now: Date): number {
  if (!lastStudiedAt) return 1.35;
  const last = new Date(lastStudiedAt);
  if (Number.isNaN(last.getTime())) return 1.2;
  const diffDays = Math.max(
    0,
    Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  );
  return Number((1 + Math.min(diffDays, 14) * 0.08).toFixed(3));
}

export function getErrorRateFactor(profile?: SubjectPerformanceProfile): number {
  const errorRate =
    typeof profile?.errorRate === 'number'
      ? clamp(profile.errorRate, 0.05, 1)
      : profile?.accuracyRate !== undefined
      ? clamp(1 - profile.accuracyRate, 0.05, 1)
      : 0.45;
  return Number((0.8 + errorRate * 1.2).toFixed(3)); // 0.86 - 2.0
}

export function getExamProximityFactor(examDate: string | undefined, now: Date): number {
  if (!examDate) return 1;
  const target = new Date(examDate);
  if (Number.isNaN(target.getTime())) return 1;
  const daysLeft = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return 1.35;
  if (daysLeft <= 30) return 1.3;
  if (daysLeft <= 60) return 1.2;
  if (daysLeft <= 90) return 1.12;
  if (daysLeft <= 180) return 1.05;
  return 1;
}

export function computeAdaptiveScoreFactors(context: AdaptiveSchedulingContext): AdaptiveScoreFactors {
  const weight = getEnemWeightForSubject(context.subject);
  const difficultyFactor = getDifficultyFactor(context.subject.difficulty || 5, context.userLevel);
  const timeWithoutStudyFactor = getTimeWithoutStudyFactor(context.profile?.lastStudiedAt, context.now);
  const errorRateFactor = getErrorRateFactor(context.profile);
  const examProximityFactor = getExamProximityFactor(context.examDate, context.now);
  return {
    weight,
    difficultyFactor,
    timeWithoutStudyFactor,
    errorRateFactor,
    examProximityFactor,
  };
}

export function computeAdaptivePriorityScore(context: AdaptiveSchedulingContext): number {
  const factors = computeAdaptiveScoreFactors(context);
  const score =
    factors.weight *
    factors.difficultyFactor *
    factors.timeWithoutStudyFactor *
    factors.errorRateFactor *
    factors.examProximityFactor;
  return Number(score.toFixed(4));
}

export function buildSubjectPerformanceProfiles(
  subjects: Subject[],
  analytics: AnalyticsStore | undefined,
  now: Date
): Record<string, SubjectPerformanceProfile> {
  const stored = analytics?.performance?.subjects ?? {};
  const output: Record<string, SubjectPerformanceProfile> = {};

  for (const subject of subjects) {
    const existing = stored[subject.id];
    const lastStudiedAt = existing?.lastStudiedAt;
    const daysWithoutStudy = lastStudiedAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastStudiedAt).getTime()) / (1000 * 60 * 60 * 24)))
      : undefined;

    output[subject.id] = {
      subjectId: subject.id,
      subjectName: subject.name,
      area: subject.area,
      accuracyRate: existing?.accuracyRate ?? (subject.averageScore > 0 ? subject.averageScore / 100 : 0.6),
      errorRate:
        existing?.errorRate ??
        (subject.averageScore > 0 ? 1 - clamp(subject.averageScore / 100, 0, 1) : 0.4),
      averageFocusScore: existing?.averageFocusScore ?? 75,
      averageProductivityScore: existing?.averageProductivityScore ?? 72,
      averageDifficultyScore: existing?.averageDifficultyScore ?? clamp(subject.difficulty || 5, 1, 10),
      lastStudiedAt,
      daysWithoutStudy,
      totalSessions: existing?.totalSessions ?? subject.sessionsCount ?? 0,
      lessonSessions: existing?.lessonSessions ?? 0,
      exerciseSessions: existing?.exerciseSessions ?? 0,
      reviewSessions: existing?.reviewSessions ?? 0,
      simulatedSessions: existing?.simulatedSessions ?? 0,
      trend7d: existing?.trend7d ?? 0,
      topicProgress: existing?.topicProgress ?? {},
      weightedNeedScore: existing?.weightedNeedScore,
    };
  }

  return output;
}

function resolveSessionKind(block: StudyBlock): PerformanceMetricsSnapshot['sessionType'] {
  if (block.type === 'AULA' || block.sessionType === 'teoria') return 'AULA';
  if (block.type === 'EXERCICIOS' || block.sessionType === 'pratica') return 'EXERCICIOS';
  if (block.type === 'REVISAO' || block.sessionType === 'revisao') return 'REVISAO';
  if (block.type === 'SIMULADO_AREA' || block.type === 'SIMULADO_COMPLETO' || block.sessionType === 'simulado') {
    return 'SIMULADO';
  }
  if (block.type === 'ANALISE') return 'ANALISE';
  return 'LIVRE';
}

function nextTopicReviewDate(sessionType: PerformanceMetricsSnapshot['sessionType'], now: Date): string | undefined {
  if (sessionType === 'AULA') {
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    return next.toISOString();
  }
  if (sessionType === 'REVISAO') {
    const next = new Date(now);
    next.setDate(now.getDate() + 7);
    return next.toISOString();
  }
  return undefined;
}

export function applyBlockCompletionMetrics(params: {
  analytics: AnalyticsStore;
  block: StudyBlock;
  subject?: Subject;
  minutesSpent: number;
  correctAnswers?: number;
  totalQuestions?: number;
  now?: Date;
}): {
  analytics: AnalyticsStore;
  snapshot?: PerformanceMetricsSnapshot;
  subjectRollingAccuracy?: number;
} {
  const { analytics, block, subject, minutesSpent } = params;
  const now = params.now ?? new Date();
  if (block.isBreak || !subject) {
    return { analytics };
  }

  const sessionType = resolveSessionKind(block);
  const totalQuestions =
    typeof params.totalQuestions === 'number' && Number.isFinite(params.totalQuestions)
      ? Math.max(0, Math.round(params.totalQuestions))
      : 0;
  const correctAnswers =
    typeof params.correctAnswers === 'number' && Number.isFinite(params.correctAnswers)
      ? Math.min(totalQuestions, Math.max(0, Math.round(params.correctAnswers)))
      : undefined;
  const hasRealAccuracy = totalQuestions > 0 && typeof correctAnswers === 'number';
  // FIX: foco/produtividade eram constantes disfarçadas (74 ou 82 de foco, 68 +
  // acurácia de produtividade) e a acurácia era inventada por tipo de bloco
  // quando não havia respostas. Agora tudo deriva de dados reais e a acurácia
  // fica `null` quando não foi medida — sem contaminar perfil, tópicos e
  // tendência.
  const scores = computeSessionScores({
    plannedMinutes: Math.max(1, block.durationMinutes),
    actualMinutes: minutesSpent,
    correctAnswers,
    totalQuestions,
  });
  const accuracyRate = scores.accuracyRate;
  const errorRate = scores.errorRate;
  const focusScore = scores.focusScore;
  const productivityScore = scores.productivityScore;
  const difficultyScore = clamp(subject.difficulty || 5, 1, 10);
  const dateKey = toLocalDateKey(parseBlockDate(block.date));

  const snapshot: PerformanceMetricsSnapshot = {
    date: now.toISOString(),
    subjectId: subject.id,
    sessionType,
    minutes: Math.round(minutesSpent),
    correctAnswers: hasRealAccuracy ? correctAnswers : undefined,
    totalQuestions: hasRealAccuracy ? totalQuestions : undefined,
    accuracyRate: accuracyRate ?? undefined,
    errorRate: errorRate ?? undefined,
    accuracyEstimated: !hasRealAccuracy,
    focusScore,
    productivityScore,
    difficultyScore,
    topicName: block.topicName,
    blockId: block.id,
  };

  const previousDaily = analytics.daily[dateKey] || { hours: 0, sessions: 0 };
  const subjectDaily = previousDaily.bySubject?.[subject.id] || { hours: 0, sessions: 0 };
  const addedHours = minutesSpent / 60;
  const nextDailySessions = previousDaily.sessions + 1;
  const nextSubjectDailySessions = subjectDaily.sessions + 1;

  const performance = analytics.performance ?? {
    subjects: {},
    sessionHistory: [],
    topicProgress: {},
    lastUpdatedAt: now.toISOString(),
  };

  const existingProfile = performance.subjects[subject.id] || {
    subjectId: subject.id,
    subjectName: subject.name,
    area: subject.area,
    accuracyRate: 0.6,
    errorRate: 0.4,
    averageFocusScore: 75,
    averageProductivityScore: 72,
    averageDifficultyScore: difficultyScore,
    totalSessions: 0,
    lessonSessions: 0,
    exerciseSessions: 0,
    reviewSessions: 0,
    simulatedSessions: 0,
    topicProgress: {},
  };

  const totalBefore = existingProfile.totalSessions || 0;
  const nextTotal = totalBefore + 1;
  const updatedProfile: SubjectPerformanceProfile = {
    ...existingProfile,
    subjectName: subject.name,
    area: subject.area,
    totalSessions: nextTotal,
    accuracyRate: Number(
      (accuracyRate === null
        ? existingProfile.accuracyRate
        : avg(existingProfile.accuracyRate, accuracyRate, totalBefore)
      ).toFixed(4)
    ),
    errorRate: Number(
      (errorRate === null
        ? existingProfile.errorRate
        : avg(existingProfile.errorRate, errorRate, totalBefore)
      ).toFixed(4)
    ),
    averageFocusScore: Math.round(avg(existingProfile.averageFocusScore, focusScore, totalBefore)),
    averageProductivityScore: Math.round(
      avg(existingProfile.averageProductivityScore, productivityScore, totalBefore)
    ),
    averageDifficultyScore: Number(avg(existingProfile.averageDifficultyScore, difficultyScore, totalBefore).toFixed(2)),
    lastStudiedAt: now.toISOString(),
    daysWithoutStudy: 0,
    lessonSessions:
      existingProfile.lessonSessions + (sessionType === 'AULA' ? 1 : 0),
    exerciseSessions:
      existingProfile.exerciseSessions + (sessionType === 'EXERCICIOS' ? 1 : 0),
    reviewSessions:
      existingProfile.reviewSessions + (sessionType === 'REVISAO' ? 1 : 0),
    simulatedSessions:
      existingProfile.simulatedSessions + (sessionType === 'SIMULADO' ? 1 : 0),
    topicProgress: { ...(existingProfile.topicProgress || {}) },
  };

  if (block.topicName) {
    const topicKey = `${subject.id}::${block.topicName}`;
    const existingTopic =
      updatedProfile.topicProgress?.[topicKey] ||
      performance.topicProgress?.[topicKey] || {
        topicName: block.topicName,
        mastery: 0,
        accuracyRate: 0.5,
        sessionsCount: 0,
        disciplineName: subject.name,
      };

    const topicSessionsBefore = existingTopic.sessionsCount || 0;
    // Sem acurácia medida creditamos apenas participação (valores baixos),
    // em vez de multiplicar um índice inventado.
    const masteryDelta =
      sessionType === 'AULA'
        ? 8
        : sessionType === 'EXERCICIOS'
        ? accuracyRate === null
          ? 6
          : 14 * accuracyRate
        : sessionType === 'REVISAO'
        ? accuracyRate === null
          ? 5
          : 10 * accuracyRate
        : sessionType === 'SIMULADO'
        ? accuracyRate === null
          ? 7
          : 16 * accuracyRate
        : 6;

    const updatedTopic: TopicProgress = {
      ...existingTopic,
      topicName: block.topicName,
      disciplineName: subject.name,
      sessionsCount: topicSessionsBefore + 1,
      mastery: Number(clamp((existingTopic.mastery || 0) + masteryDelta, 0, 100).toFixed(1)),
      accuracyRate: Number(
        (accuracyRate === null
          ? existingTopic.accuracyRate
          : avg(existingTopic.accuracyRate, accuracyRate, topicSessionsBefore)
        ).toFixed(4)
      ),
      lastStudiedAt: now.toISOString(),
      nextReviewDate: nextTopicReviewDate(sessionType, now),
    };

    updatedProfile.topicProgress = {
      ...(updatedProfile.topicProgress || {}),
      [topicKey]: updatedTopic,
    };
    performance.topicProgress = {
      ...(performance.topicProgress || {}),
      [topicKey]: updatedTopic,
    };
  }

  /**
   * FIX: trend7d comparava as duas metades das últimas 14 SESSÕES — nada a ver
   * com 7 dias (14 sessões podem caber em 2 dias) — e usava acurácia inventada.
   * Agora é a diferença entre a acurácia média dos últimos 7 dias e a dos 7 dias
   * anteriores, considerando apenas sessões com respostas registradas. Sem
   * dados suficientes nas duas janelas, o valor anterior é preservado.
   */
  const subjectHistory = [...(performance.sessionHistory || []), snapshot].filter(
    (entry) => entry.subjectId === subject.id
  );
  const measuredHistory = subjectHistory.filter(
    (entry) => !entry.accuracyEstimated && typeof entry.accuracyRate === 'number'
  );
  const windowAverage = (fromDaysAgo: number, toDaysAgo: number): number | null => {
    const from = now.getTime() - fromDaysAgo * 86_400_000;
    const to = now.getTime() - toDaysAgo * 86_400_000;
    const entries = measuredHistory.filter((entry) => {
      const at = Date.parse(entry.date);
      return Number.isFinite(at) && at >= to && at < from;
    });
    if (entries.length === 0) return null;
    return (
      entries.reduce((sum, entry) => sum + (entry.accuracyRate as number), 0) / entries.length
    );
  };
  const recentWindowAvg = windowAverage(7, 0);
  const previousWindowAvg = windowAverage(14, 7);
  updatedProfile.trend7d =
    recentWindowAvg !== null && previousWindowAvg !== null
      ? Number((recentWindowAvg - previousWindowAvg).toFixed(4))
      : existingProfile.trend7d ?? 0;

  const updatedPerformance = {
    ...performance,
    subjects: {
      ...performance.subjects,
      [subject.id]: updatedProfile,
    },
    sessionHistory: [...(performance.sessionHistory || []), snapshot].slice(-500),
    topicProgress: performance.topicProgress || {},
    lastUpdatedAt: now.toISOString(),
  };

  const updatedAnalytics: AnalyticsStore = {
    ...analytics,
    daily: {
      ...analytics.daily,
      [dateKey]: {
        ...previousDaily,
        hours: Number((previousDaily.hours + addedHours).toFixed(2)),
        sessions: nextDailySessions,
        focusScoreAvg: Number(avg(previousDaily.focusScoreAvg, focusScore, previousDaily.sessions || 0).toFixed(2)),
        productivityScoreAvg: Number(
          avg(previousDaily.productivityScoreAvg, productivityScore, previousDaily.sessions || 0).toFixed(2)
        ),
        accuracyRateAvg:
          accuracyRate === null
            ? previousDaily.accuracyRateAvg
            : Number(
                avg(previousDaily.accuracyRateAvg, accuracyRate, previousDaily.sessions || 0).toFixed(4)
              ),
        bySubject: {
          ...(previousDaily.bySubject || {}),
          [subject.id]: {
            ...subjectDaily,
            hours: Number((subjectDaily.hours + addedHours).toFixed(2)),
            sessions: nextSubjectDailySessions,
            accuracyRateAvg:
              accuracyRate === null
                ? subjectDaily.accuracyRateAvg
                : Number(
                    avg(subjectDaily.accuracyRateAvg, accuracyRate, subjectDaily.sessions || 0).toFixed(4)
                  ),
            focusScoreAvg: Number(avg(subjectDaily.focusScoreAvg, focusScore, subjectDaily.sessions || 0).toFixed(2)),
            productivityScoreAvg: Number(
              avg(subjectDaily.productivityScoreAvg, productivityScore, subjectDaily.sessions || 0).toFixed(2)
            ),
          },
        },
      },
    },
    performance: updatedPerformance,
  };

  return {
    analytics: updatedAnalytics,
    snapshot,
    // Só propaga para a matéria quando houve medição real nesta sessão.
    subjectRollingAccuracy: accuracyRate === null ? undefined : updatedProfile.accuracyRate,
  };
}

export function computeIntelligentAnalyticsSummary(params: {
  analytics: AnalyticsStore;
  subjects: Subject[];
  studyPrefs?: StudyPreferences;
  now?: Date;
}): IntelligentAnalyticsSummary {
  const { analytics, subjects, studyPrefs } = params;
  const now = params.now ?? new Date();
  const profiles = buildSubjectPerformanceProfiles(subjects, analytics, now);
  const list = Object.values(profiles).filter((profile) => profile.totalSessions > 0);

  const avgAccuracyRate =
    list.length > 0 ? list.reduce((sum, profile) => sum + profile.accuracyRate, 0) / list.length : 0;
  const avgFocusScore =
    list.length > 0 ? list.reduce((sum, profile) => sum + profile.averageFocusScore, 0) / list.length : 0;
  const avgProductivityScore =
    list.length > 0
      ? list.reduce((sum, profile) => sum + profile.averageProductivityScore, 0) / list.length
      : 0;

  const weakest = [...list].sort((a, b) => a.accuracyRate - b.accuracyRate)[0];
  const strongest = [...list].sort((a, b) => b.accuracyRate - a.accuracyRate)[0];

  const last30DayRecords = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    const dateKey = toLocalDateKey(date);
    return analytics.daily[dateKey] || { hours: 0, sessions: 0 };
  });
  const studyDays = last30DayRecords.filter((record) => (record.hours || 0) > 0).length;
  // FIX: o denominador era sempre 30, então quem começou ontem aparecia com
  // 3% de consistência. A janela real é o menor valor entre 30 dias e o tempo
  // desde o primeiro registro local.
  const firstRecordTime = Object.keys(analytics.daily || {})
    .map((key) => Date.parse(`${key}T00:00:00`))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b)[0];
  const daysSinceFirstRecord = Number.isFinite(firstRecordTime)
    ? Math.floor((now.getTime() - (firstRecordTime as number)) / 86_400_000) + 1
    : 1;
  const consistencyWindow = Math.min(30, Math.max(1, daysSinceFirstRecord));
  const consistencyRate = studyDays / consistencyWindow;

  const avgTrend = list.length > 0 ? list.reduce((sum, profile) => sum + (profile.trend7d || 0), 0) / list.length : 0;
  const projectedImprovement30d =
    list.length > 0
      ? clamp(
          avgTrend * 100 * 4 +
            consistencyRate * 6 +
            getExamProximityFactor(studyPrefs?.examDate, now) * 2,
          -10,
          30
        )
      : 0;

  return {
    avgAccuracyRate: Number(avgAccuracyRate.toFixed(4)),
    weakestSubject: weakest
      ? { id: weakest.subjectId, name: weakest.subjectName || weakest.subjectId, accuracyRate: weakest.accuracyRate }
      : undefined,
    strongestSubject: strongest
      ? {
          id: strongest.subjectId,
          name: strongest.subjectName || strongest.subjectId,
          accuracyRate: strongest.accuracyRate,
        }
      : undefined,
    projectedImprovement30d: Number(projectedImprovement30d.toFixed(1)),
    consistencyRate: Number(consistencyRate.toFixed(4)),
    avgFocusScore: Math.round(avgFocusScore),
    avgProductivityScore: Math.round(avgProductivityScore),
  };
}

export function buildScheduleComputationFingerprint(input: unknown): string {
  const seen = new WeakSet<object>();
  const stable = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      if (seen.has(value as object)) return '[Circular]';
      seen.add(value as object);
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = stable((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  };

  return JSON.stringify(stable(input));
}

/**
 * Registra um lote de questões respondidas (fora de uma sessão de blocos).
 *
 * #10 — os cards "Acerto" e "Mapa de Atividades" não tinham de onde vir: a
 * acurácia só existia quando o usuário respondia dentro do cronômetro. Este
 * registro avulso alimenta o perfil da matéria com contadores reais, para a
 * taxa de acerto ser recalculada de verdade (e não estimada).
 */
export function applyQuestionBatch(params: {
  analytics: AnalyticsStore;
  subject: Subject;
  totalQuestions: number;
  correctAnswers: number;
  date?: Date;
  sessionType?: PerformanceMetricsSnapshot['sessionType'];
}): AnalyticsStore {
  const { analytics, subject } = params;
  const now = params.date ?? new Date();
  const totalQuestions = Math.max(0, Math.round(params.totalQuestions));
  if (totalQuestions <= 0) return analytics;

  const correctAnswers = Math.min(totalQuestions, Math.max(0, Math.round(params.correctAnswers)));
  const accuracyRate = correctAnswers / totalQuestions;
  const dateKey = toLocalDateKey(now);
  const sessionType = params.sessionType ?? 'EXERCICIOS';

  const performance = analytics.performance ?? { subjects: {}, sessionHistory: [], topicProgress: {} };
  const existing = performance.subjects[subject.id];

  const prevTotal = existing?.questionsTotal ?? 0;
  const prevCorrect = existing?.questionsCorrect ?? 0;
  const nextTotal = prevTotal + totalQuestions;
  const nextCorrect = prevCorrect + correctAnswers;

  const snapshot: PerformanceMetricsSnapshot = {
    date: now.toISOString(),
    subjectId: subject.id,
    sessionType,
    minutes: 0,
    correctAnswers,
    totalQuestions,
    accuracyRate,
    errorRate: 1 - accuracyRate,
    accuracyEstimated: false,
    focusScore: existing?.averageFocusScore ?? 0,
    productivityScore: existing?.averageProductivityScore ?? 0,
    difficultyScore: clamp(subject.difficulty || 5, 1, 10),
  };

  const profile: SubjectPerformanceProfile = {
    ...(existing ?? {
      subjectId: subject.id,
      subjectName: subject.name,
      area: subject.area,
      accuracyRate,
      errorRate: 1 - accuracyRate,
      averageFocusScore: 0,
      averageProductivityScore: 0,
      averageDifficultyScore: clamp(subject.difficulty || 5, 1, 10),
      totalSessions: 0,
      lessonSessions: 0,
      exerciseSessions: 0,
      reviewSessions: 0,
      simulatedSessions: 0,
    }),
    accuracyRate,
    errorRate: 1 - accuracyRate,
    questionsTotal: nextTotal,
    questionsCorrect: nextCorrect,
    lastQuestionLogAt: now.toISOString(),
    lastStudiedAt: now.toISOString(),
    exerciseSessions:
      (existing?.exerciseSessions ?? 0) + (sessionType === 'EXERCICIOS' ? 1 : 0),
    simulatedSessions:
      (existing?.simulatedSessions ?? 0) + (sessionType === 'SIMULADO' ? 1 : 0),
  };

  return {
    ...analytics,
    performance: {
      ...performance,
      subjects: { ...performance.subjects, [subject.id]: profile },
      sessionHistory: [...(performance.sessionHistory ?? []), snapshot].slice(-500),
      lastUpdatedAt: now.toISOString(),
    },
    daily: {
      ...analytics.daily,
      [dateKey]: {
        ...(analytics.daily[dateKey] ?? { hours: 0, sessions: 0 }),
        questions: (analytics.daily[dateKey]?.questions ?? 0) + totalQuestions,
      },
    },
  };
}
