/**
 * Registro de estudos por matéria (página /estudos).
 *
 * Cada entrada guarda "o que estudou + onde parou" em uma frase só,
 * separados por modo (conteúdo da matéria vs revisão). A próxima revisão
 * é calculada por regra inteligente baseada no % de acerto, mas pode ser
 * sobrescrita manualmente por matéria.
 */

export type StudyLogKind = 'conteudo' | 'revisao';

export interface StudyLogEntry {
  id: string;
  subjectId: string;
  kind: StudyLogKind;
  /** Frase única: "o que estudou — onde parou" (ex.: "ortografia, aula 1.6") */
  note: string;
  correctAnswers: number | null;
  totalQuestions: number | null;
  createdAt: string; // ISO
}

export interface ReviewOverride {
  date: string; // ISO date (yyyy-mm-dd)
  setAt: string; // ISO
}

export const STUDY_LOG_KEY = 'nexora_study_log';
export const REVIEW_OVERRIDE_KEY = 'nexora_review_overrides';

export function readStudyLog(): StudyLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STUDY_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeStudyLog(entries: StudyLogEntry[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STUDY_LOG_KEY, JSON.stringify(entries));
}

export function readReviewOverrides(): Record<string, ReviewOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(REVIEW_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeReviewOverrides(overrides: Record<string, ReviewOverride>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REVIEW_OVERRIDE_KEY, JSON.stringify(overrides));
}

export function addStudyLogEntry(entry: Omit<StudyLogEntry, 'id' | 'createdAt'>): StudyLogEntry {
  const full: StudyLogEntry = {
    ...entry,
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `sl_${crypto.randomUUID()}`
        : `sl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const entries = readStudyLog();
  entries.push(full);
  writeStudyLog(entries);
  return full;
}

export function updateStudyLogEntry(id: string, patch: Partial<Omit<StudyLogEntry, 'id' | 'subjectId' | 'createdAt'>>) {
  const entries = readStudyLog();
  const next = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  writeStudyLog(next);
}

export function deleteStudyLogEntry(id: string) {
  writeStudyLog(readStudyLog().filter((e) => e.id !== id));
}

/** Intervalo inteligente (em dias) conforme o % de acerto. */
export function smartReviewIntervalDays(accuracy: number | null): number {
  if (accuracy === null) return 1; // aula nova / sem questões
  if (accuracy >= 0.9) return 14;
  if (accuracy >= 0.7) return 7;
  if (accuracy >= 0.5) return 3;
  return 1;
}

export function accuracyOf(entry: StudyLogEntry): number | null {
  if (entry.totalQuestions === null || entry.totalQuestions <= 0) return null;
  return (entry.correctAnswers ?? 0) / entry.totalQuestions;
}

export interface SubjectStudySummary {
  lastContent: StudyLogEntry | null;
  lastReview: StudyLogEntry | null;
  /** Entradas com questões, mais recentes primeiro (para tendência). */
  questionEntries: StudyLogEntry[];
  totalQuestions: number;
  correctQuestions: number;
  rollingAccuracy: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  nextReviewDate: Date | null;
  nextReviewManual: boolean;
  history: StudyLogEntry[];
}

export function summarizeSubject(
  subjectId: string,
  entries: StudyLogEntry[] = readStudyLog(),
  overrides: Record<string, ReviewOverride> = readReviewOverrides(),
): SubjectStudySummary {
  const mine = entries
    .filter((e) => e.subjectId === subjectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const lastContent = mine.find((e) => e.kind === 'conteudo') ?? null;
  const lastReview = mine.find((e) => e.kind === 'revisao') ?? null;
  const questionEntries = mine.filter((e) => e.totalQuestions !== null && e.totalQuestions > 0);

  const totalQuestions = questionEntries.reduce((s, e) => s + (e.totalQuestions ?? 0), 0);
  const correctQuestions = questionEntries.reduce((s, e) => s + (e.correctAnswers ?? 0), 0);
  // Média ponderada dando mais peso às entradas recentes (decaimento pela metade a cada 3 entradas).
  let weightSum = 0;
  let accSum = 0;
  questionEntries.forEach((e, i) => {
    const w = Math.pow(0.5, Math.floor(i / 3));
    const acc = accuracyOf(e);
    if (acc !== null) {
      accSum += acc * w;
      weightSum += w;
    }
  });
  const rollingAccuracy = weightSum > 0 ? accSum / weightSum : null;

  let trend: SubjectStudySummary['trend'] = null;
  if (questionEntries.length >= 2) {
    const a = accuracyOf(questionEntries[0]);
    const b = accuracyOf(questionEntries[1]);
    if (a !== null && b !== null) {
      if (a > b + 0.001) trend = 'up';
      else if (a < b - 0.001) trend = 'down';
      else trend = 'flat';
    }
  }

  const override = overrides[subjectId];
  let nextReviewDate: Date | null = null;
  let nextReviewManual = false;
  if (override) {
    // Constrói a data no fuso local a partir de yyyy-mm-dd (sem hack de meio-dia UTC).
    const [y, m, d] = override.date.split('-').map(Number);
    nextReviewDate =
      y && m && d ? new Date(y, m - 1, d) : new Date(`${override.date}T12:00:00`);
    nextReviewManual = true;
  } else {
    const base = lastReview ?? lastContent;
    if (base) {
      const acc = accuracyOf(base) ?? rollingAccuracy;
      const days = smartReviewIntervalDays(acc);
      nextReviewDate = new Date(new Date(base.createdAt).getTime() + days * 24 * 60 * 60 * 1000);
    }
  }

  return {
    lastContent,
    lastReview,
    questionEntries,
    totalQuestions,
    correctQuestions,
    rollingAccuracy,
    trend,
    nextReviewDate,
    nextReviewManual,
    history: mine,
  };
}

export function setReviewOverride(subjectId: string, dateISO: string | null) {
  const overrides = readReviewOverrides();
  if (dateISO) {
    overrides[subjectId] = { date: dateISO, setAt: new Date().toISOString() };
  } else {
    delete overrides[subjectId];
  }
  writeReviewOverrides(overrides);
}

export function formatRelativeReview(date: Date, now: Date = new Date()): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / dayMs);
  if (diffDays < 0) {
    const atraso = Math.abs(diffDays);
    return `atrasada em ${atraso} dia${atraso === 1 ? '' : 's'}`;
  }
  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'amanhã';
  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `em ${diffDays} dias (${dateStr})`;
}
