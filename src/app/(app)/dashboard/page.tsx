'use client';

/**
 * Dashboard Component
 * Visão geral principal do sistema com métricas, agendamentos, sugestões adaptativas e gamificação
 */

import { useMemo, useState } from 'react';
import { repairCompletedBlockTimesOnce } from '@/lib/blockTimes';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Play,
  CheckCircle2,
  SkipForward,
  TrendingUp,
  Flame,
  Target,
  Sparkles,
  BookOpen,
  Zap,
  Lock,
} from 'lucide-react';
import {
  cn,
  formatDate,
  formatDuration,
  formatHoursDuration,
  getHoursForDate,
  getWeekStart,
  getWeeklyGoalHours,
  minutesToTime,
  parseBlockDate,
  parseLocalDateKey,
  plannedMinutes,
  studiedMinutes,
  timeToMinutes,
  toLocalDateKey,
} from '@/lib/utils';
import { getStudyBlockTypeLabel } from '@/lib/studyBlockLabels';
import { computeGamificationSnapshot } from '@/lib/progressSnapshot';
import { applyBlockCompletionMetrics } from '@/services/adaptiveStudyIntelligence';
import { checkSequentialLock } from '@/services/sequentialLock';
import { reportCompletedSession } from '@/lib/sessionSync';
import { getStudyBlockDisplayTitle } from '@/lib/studyBlockLabels';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { StudyBlockSessionModal } from '@/components/session';
import { StatsCard, ProgressBar } from '@/components/ui';
import { LevelProgress } from '@/components/dashboard';
import { BacklogWarning, PassProjection, TodayPlan } from '@/components/dashboard';
import { WeeklyChart } from '@/components/dashboard';
import type { StudyBlock, Subject, AnalyticsStore, StudyPreferences, UserSettings, DailyHoursByWeekday, WeekdayKey } from '@/types';
import { useSession } from 'next-auth/react';
import { useOnboarding, useLocalStorage, useClientNow } from '@/hooks';
import { defaultSettings } from '@/lib/defaultSettings';

interface DashboardProps {
  className?: string;
}

const statusConfig = {
  scheduled: { badge: 'default', icon: Clock, label: 'Agendado' },
  rescheduled: { badge: 'warning', icon: Clock, label: 'Reagendado' },
  'in-progress': { badge: 'warning', icon: Play, label: 'Em Andamento' },
  completed: { badge: 'success', icon: CheckCircle2, label: 'Concluído' },
  skipped: { badge: 'danger', icon: SkipForward, label: 'Pulado' },
} as const;

// Valores neutros e determinísticos (independentes de fuso) usados apenas no
// HTML servido / primeira renderização, antes do relógio do cliente existir.
const NEUTRAL_DATE_KEY = '1970-01-01';
const NEUTRAL_WEEKDAY_DATE = new Date(2024, 0, 1); // segunda-feira em qualquer fuso

export default function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  // Aviso da trava sequencial (#6e): aparece quando a pessoa tenta estudar
  // matéria de dia futuro com o dia de hoje ainda pendente.
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const { hasCompletedWelcome } = useOnboarding();
  const [plannerBlocksRaw, setPlannerBlocks] = useLocalStorage<StudyBlock[]>('nexora_planner_blocks', []);
  // Reparo único dos blocos que a versão anterior salvou com horário distorcido.
  const plannerBlocks = useMemo(
    () => repairCompletedBlockTimesOnce(plannerBlocksRaw),
    [plannerBlocksRaw]
  );
  const [subjects, setSubjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [analytics, setAnalytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', { daily: {} });
  const [studyPrefs, setStudyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', {
    hoursPerDay: 2,
    daysOfWeek: [1, 2, 3, 4, 5],
    mode: 'random',
    examDate: '',
  });
  // Usa os mesmos defaults globais das demais telas: fallbacks divergentes
  // faziam o snapshot enviado ao servidor depender da página visitada primeiro.
  const [userSettings, setUserSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);


  // Banner de "complete seu perfil" só faz sentido sem nenhum setup realizado:
  // com matérias ou blocos já existentes, o perfil já foi configurado.
  const setupConcluido = subjects.length > 0 || plannerBlocks.length > 0;

  // Mesma ordem usada no TopBar/MainLayout para o nome não divergir entre telas.
  const displayName =
    (userSettings.name || session?.user?.name || '').trim() || 'Estudante';

  // "Agora" só após hidratar: servidor (UTC) e navegador (fuso local) podem
  // estar em datas diferentes e new Date() em renderização quebra hidratação.
  const clientNow = useClientNow();
  const todayKey = clientNow ? toLocalDateKey(clientNow) : NEUTRAL_DATE_KEY;
  const today = todayKey;
  const currentTime = clientNow ? clientNow.toTimeString().slice(0, 5) : '00:00';
  const dailyAnalytics = useMemo(() => analytics.daily[todayKey] || { hours: 0, sessions: 0, blocks: 0, correctAnswers: 0, totalQuestions: 0 }, [analytics.daily, todayKey]);
  const todayBlocksAll = plannerBlocks
    .filter((block) => toLocalDateKey(parseBlockDate(block.date)) === todayKey)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // Blocos ainda pendentes/em andamento (usados para "recomendado agora").
  const todayBlocks = todayBlocksAll.filter(
    (block) => block.status === 'scheduled' || block.status === 'rescheduled' || block.status === 'in-progress'
  );
  const completedTodayCount = todayBlocksAll.filter((block) => block.status === 'completed').length;

  const currentBlockIndex = todayBlocks.findIndex(
    (block) =>
      (block.status === 'scheduled' || block.status === 'rescheduled') &&
      block.startTime <= currentTime &&
      block.endTime > currentTime
  );
  const nextBlockIndex = todayBlocks.findIndex(
    (block) => (block.status === 'scheduled' || block.status === 'rescheduled') && block.startTime > currentTime
  );

  const currentBlock = currentBlockIndex >= 0 ? todayBlocks[currentBlockIndex] : null;
  const nextBlock = nextBlockIndex >= 0 ? todayBlocks[nextBlockIndex] : null;

  const getSubjectById = (id: string) => subjects.find((s) => s.id === id) || null;

  // Chave do início da semana: dependência estável do useMemo abaixo. O relógio
  // (`clientNow`) muda a cada minuto, mas a semana só virou à meia-noite — sem
  // isso o lint acusava dependência faltando e corrigir com `clientNow` faria o
  // gráfico ser recalculado (e re-renderizado) a cada minuto sem motivo.
  const weekStartKey = clientNow
    ? toLocalDateKey(getWeekStart(clientNow))
    : toLocalDateKey(NEUTRAL_WEEKDAY_DATE);

  const weeklyData = useMemo(() => {
    const dayLabels = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const weekStart = parseLocalDateKey(weekStartKey) ?? getWeekStart(NEUTRAL_WEEKDAY_DATE);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const dayKey = toLocalDateKey(date);
      const dayAnalytics = analytics.daily[dayKey] || { hours: 0, sessions: 0, blocks: 0 };
      return {
        day: dayLabels[date.getDay()],
        date: dayKey,
        hours: dayAnalytics.hours,
        sessions: dayAnalytics.sessions,
        // Respeita a carga configurada por dia da semana (dias de descanso = 0).
        target: getHoursForDate(date, userSettings.dailyHoursByWeekday, studyPrefs.hoursPerDay),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weekStartKey é a
    // data (estável); `getSubjectById`/helpers puros não entram na lista.
  }, [analytics, studyPrefs, userSettings.dailyHoursByWeekday, weekStartKey]);

  const totalWeeklyHours = weeklyData.reduce((sum, day) => sum + day.hours, 0);
  // Dias da semana em que a pessoa estuda (0 = domingo).
  const diasDeEstudo = useMemo(() => {
    const excluidos = new Set(userSettings.excludeDays ?? []);
    return [0, 1, 2, 3, 4, 5, 6].filter((dia) => !excluidos.has(dia));
  }, [userSettings.excludeDays]);

  // Total já estudado (todas as semanas), pelo tempo REAL de cada bloco.
  const totalStudiedHours = useMemo(
    () =>
      plannerBlocks
        .filter((block) => !block.isBreak && block.status === 'completed')
        .reduce((sum, block) => sum + studiedMinutes(block) / 60, 0),
    [plannerBlocks]
  );
  const completedWeeklySessions = weeklyData.reduce((sum, day) => sum + day.sessions, 0);

  const weeklyGoalHours = Math.max(
    getWeeklyGoalHours(userSettings.dailyHoursByWeekday, studyPrefs.hoursPerDay),
    1
  );
  const weeklyProgressPercent = Math.min(
    100,
    Math.round((totalWeeklyHours / weeklyGoalHours) * 100)
  );

  const todayTargetHours = getHoursForDate(
    clientNow ?? NEUTRAL_WEEKDAY_DATE,
    userSettings.dailyHoursByWeekday,
    studyPrefs.hoursPerDay
  );

  // Revisões pendentes = blocos de revisão (hoje ou atrasados) ainda não feitos.
  const pendingReviewsCount = useMemo(
    () =>
      plannerBlocks.filter((block) => {
        if (block.isBreak) return false;
        if (block.status === 'completed' || block.status === 'skipped') return false;
        const isReview = block.type === 'REVISAO' || block.sessionType === 'revisao';
        if (!isReview) return false;
        return toLocalDateKey(parseBlockDate(block.date)) <= todayKey;
      }).length,
    [plannerBlocks, todayKey]
  );

  const gamificationSnapshot = useMemo(
    () => computeGamificationSnapshot({ plannerBlocks, analytics }),
    [plannerBlocks, analytics]
  );
  const streak = gamificationSnapshot.streak;

  const [activeSessionBlock, setActiveSessionBlock] = useState<StudyBlock | null>(null);

  // Regra de intervalo que a pessoa configurou em Ajustes (bloco / descanso).
  const breakRule = useMemo(() => {
    // `maxBlockMinutes` (Ajustes) é o teto do bloco; `blockDurationMinutes`
    // (assistente) é o tamanho escolhido. Fica o que estiver preenchido.
    const bloco =
      studyPrefs.blockDurationMinutes || userSettings.maxBlockMinutes || 0;
    const descanso = userSettings.breakMinutes || studyPrefs.breakDurationMinutes || 0;
    return { bloco, descanso };
  }, [userSettings, studyPrefs]);

  const recommendedBlock = useMemo(() => {
    if (todayBlocks.length === 0) return null;

    // Ordem do dia: em andamento > cobrindo o horário atual > o próximo.
    // Intervalos ENTRAM na fila de propósito: antes eles eram filtrados fora e o
    // card só recomendava matéria, então o descanso nunca aparecia como passo.
    const candidatos = todayBlocks.filter(
      (block) => block.status === 'scheduled' || block.status === 'rescheduled' || block.status === 'in-progress'
    );
    if (candidatos.length === 0) return null;

    return (
      candidatos.find((block) => block.status === 'in-progress') ??
      candidatos.find(
        (block) =>
          block.startTime <= currentTime &&
          block.endTime > currentTime
      ) ??
      candidatos.find((block) => block.startTime > currentTime) ??
      candidatos[0]
    );
  }, [currentTime, todayBlocks]);

  // O que vem imediatamente depois da recomendação — para o card mostrar o
  // ritmo do dia ("depois: intervalo de 10 min às 11:50") em vez de só a matéria.
  const blockAfterRecommended = useMemo(() => {
    if (!recommendedBlock) return null;
    const ordenados = [...todayBlocks].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );
    const indice = ordenados.findIndex((b) => b.id === recommendedBlock.id);
    if (indice < 0) return null;
    for (let i = indice + 1; i < ordenados.length; i++) {
      const proximo = ordenados[i];
      if (proximo.status === 'completed' || proximo.status === 'skipped') continue;
      return proximo;
    }
    return null;
  }, [recommendedBlock, todayBlocks]);

  const gamificationData = useMemo(() => {
    const todayXP = Math.max(0, Math.round((dailyAnalytics.hours || 0) * 60));

    return {
      level: gamificationSnapshot.level,
      xp: gamificationSnapshot.xpInCurrentLevel,
      levelUpXP: gamificationSnapshot.xpToNextLevel,
      streakDays: gamificationSnapshot.streak,
      longestStreak: gamificationSnapshot.longestStreak,
      todayXP,
      todaySessions: dailyAnalytics.sessions,
    };
  }, [gamificationSnapshot, dailyAnalytics]);



  const handleStartBlock = (block: StudyBlock) => {
    // Blocos concluídos/pulados não podem voltar a "em andamento": isso permitia
    // concluir duas vezes e contar horas/XP em duplicidade.
    if (block.status === 'completed' || block.status === 'skipped') return;

    // #6e: sem furar a fila — dia futuro só depois que hoje estiver resolvido.
    const lock = checkSequentialLock(block, plannerBlocks);
    if (!lock.allowed) {
      setLockNotice(lock.message);
      return;
    }
    setLockNotice(null);

    // O horário planejado é preservado (antes era substituído pelo horário atual,
    // o que podia gerar endTime anterior ao startTime ao iniciar com atraso).
    const updatedBlocks = plannerBlocks.map((b) =>
      b.id === block.id ? { ...b, status: 'in-progress' as const } : b
    );
    setPlannerBlocks(updatedBlocks);
    setActiveSessionBlock({ ...block, status: 'in-progress' as const });
  };

const handleCompleteBlock = (
    blockId: string,
    minutesSpent?: number,
    performance?: { correctAnswers?: number; totalQuestions?: number }
  ) => {
    const blockRef = plannerBlocks.find((b) => b.id === blockId) ?? (activeSessionBlock?.id === blockId ? activeSessionBlock : undefined);
    if (!blockRef || blockRef.status === 'completed') return;
    const now = new Date();
    // Quem chamou sem dizer os minutos estudados assume o planejado — é o
    // caminho do botão "Concluir", que passa a perguntar antes (ver
    // TodayPlan). O modal da sessão já manda o tempo real do cronômetro.
    const effectiveMinutes = minutesSpent ?? blockRef.durationMinutes;
    const hours = effectiveMinutes / 60;
    const updatedBlocks = plannerBlocks.map((block) => {
      if (block.id === blockId) {
        // O plano NÃO é sobrescrito: `startTime`, `endTime` e
        // `durationMinutes` continuam sendo o que foi agendado, e o tempo
        // realmente estudado vai em `actualMinutes`. Antes o app gravava a
        // hora do relógio em `endTime` e os minutos reais em
        // `durationMinutes`, e a agenda mostrava "09:00 - 19:08" para um
        // bloco de 50 minutos.
        const updatedBlock = {
          ...block,
          status: 'completed' as const,
          completedAt: now,
          updatedAt: now,
          actualMinutes: effectiveMinutes,
        };
        return updatedBlock;
      }
      return block;
    });
    setPlannerBlocks(updatedBlocks);
    const subject = subjects.find((s) => s.id === blockRef.subjectId);
    if (subject && !blockRef.isBreak) {
      const metricsUpdate = applyBlockCompletionMetrics({
        analytics,
        block: blockRef,
        subject,
        minutesSpent: effectiveMinutes,
        correctAnswers: performance?.correctAnswers,
        totalQuestions: performance?.totalQuestions,
      });
      setAnalytics(metricsUpdate.analytics);
      setSubjects((prev) =>
        prev.map((s) =>
          s.id === subject.id
            ? {
                ...s,
                completedHours: Number((s.completedHours + hours).toFixed(4)),
                totalHours: Number((s.totalHours + hours).toFixed(4)),
                sessionsCount: s.sessionsCount + 1,
                averageScore:
                  metricsUpdate?.subjectRollingAccuracy !== undefined
                    ? Math.round(metricsUpdate.subjectRollingAccuracy * 100)
                    : s.averageScore,
              }
            : s
        )
      );
    } else if (!blockRef.isBreak) {
      const dateKey = toLocalDateKey(parseBlockDate(blockRef.date));
      setAnalytics((prev) => {
        const current = prev.daily[dateKey] || { hours: 0, sessions: 0 };
        return {
          ...prev,
          daily: {
            ...prev.daily,
            [dateKey]: {
              ...current,
              hours: Number((current.hours + hours).toFixed(2)),
              sessions: current.sessions + 1,
            },
          },
        };
      });
    }
    // Registra a sessão concluída no servidor (XP/streak/conquistas,
    // notificações e relatório semanal). Fire-and-forget: falha de rede não
    // altera o estado local, que continua sendo a fonte de verdade da UI.
    if (!blockRef.isBreak) {
      const plannedStart = parseBlockDate(blockRef.date);
      const startMinutes = blockRef.startTime ? timeToMinutes(blockRef.startTime) : NaN;
      if (Number.isFinite(startMinutes)) {
        plannedStart.setHours(Math.floor(startMinutes / 60), Math.round(startMinutes % 60), 0, 0);
      }
      const startedAt = Number.isNaN(plannedStart.getTime())
        ? new Date(now.getTime() - effectiveMinutes * 60_000)
        : plannedStart;

      reportCompletedSession({
        subjectId: blockRef.subjectId,
        blockId: blockRef.id,
        startedAt,
        endedAt: now,
        plannedMinutes: Math.max(1, blockRef.durationMinutes),
        actualMinutes: Math.max(1, effectiveMinutes),
        correctAnswers: performance?.correctAnswers ?? null,
        totalQuestions: performance?.totalQuestions ?? null,
        source: 'block',
      });
    }

    setActiveSessionBlock(null);
  };

  const handlePostponeBlock = (block: StudyBlock) => {
    const END_OF_DAY_MINUTES = 24 * 60 - 1;
    const duration = Math.max(1, block.durationMinutes || timeToMinutes(block.endTime) - timeToMinutes(block.startTime));
    const nextStart = Math.min(
      timeToMinutes(block.startTime) + 15,
      Math.max(0, END_OF_DAY_MINUTES - duration)
    );
    const shifted = {
      ...block,
      startTime: minutesToTime(nextStart),
      endTime: minutesToTime(nextStart + duration),
    };

    setPlannerBlocks((prev) => prev.map((b) => (b.id === block.id ? shifted : b)));
    setActiveSessionBlock((prev) => (prev && prev.id === block.id ? shifted : prev));
  };

  const handleSkipBlock = (blockId: string) => {
    const updatedBlocks = plannerBlocks.map((block) =>
      block.id === blockId ? { ...block, status: 'skipped' as const } : block
    );
    setPlannerBlocks(updatedBlocks);
  };

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {!hasCompletedWelcome && !setupConcluido && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-auto max-w-4xl"
          >
            <Card className="relative overflow-hidden border border-neon-blue/20 bg-gradient-to-r from-neon-blue/10 to-transparent p-5 backdrop-blur-md shadow-glow transition-all hover:border-neon-blue/40">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-neon-blue/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-neon-blue" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-text-primary">
                    Complete seu perfil para desbloquear o poder total da otimização com IA!
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Levará apenas alguns minutos.
                  </p>
                </div>
                <Button variant="secondary" size="sm" className="ml-auto border-neon-blue/30 hover:bg-neon-blue/20 hover:text-white transition-all" onClick={() => router.push('/settings')}>
                  Configurar Perfil
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-heading font-bold text-text-primary">
                    Olá, {displayName}! 🎓
                  </h1>
                  <p className="text-text-secondary mt-1">
                    {clientNow
                      ? `${formatDate(clientNow)}, dia ${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][clientNow.getDay()]}`
                      : '\u00A0'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs text-text-muted">Meta Semanal</p>
                      <p className="text-sm font-bold text-neon-blue">
                        {formatHoursDuration(totalWeeklyHours)} / {formatHoursDuration(weeklyGoalHours)}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-bold text-orange-400">🔥 {gamificationData.streakDays} dias</span>
                  </div>
                </div>
              </div>

              {recommendedBlock && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="relative overflow-hidden rounded-2xl border border-neon-purple/20 bg-gradient-to-br from-neon-purple/10 to-transparent p-5 sm:p-7 backdrop-blur-glass shadow-lg"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Zap className="w-4 h-4 text-neon-purple flex-shrink-0" />
                      <span className="text-xs font-bold tracking-widest text-neon-purple uppercase truncate">
                        {recommendedBlock.isBreak ? 'INTERVALO' : 'SESSÃO RECOMENDADA'}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-neon-purple/20 px-2.5 py-1 text-[10px] font-bold tracking-widest text-neon-purple uppercase flex items-center gap-1.5 border-b border-l border-neon-purple/20 backdrop-blur-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-neon-purple animate-pulse-slow" />
                      Agora
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-heading font-bold text-text-primary mb-2">
                        {getStudyBlockDisplayTitle(recommendedBlock)}
                      </h2>
                      <p className="text-sm text-text-secondary mb-4 line-clamp-2">
                        {recommendedBlock.isBreak
                          ? 'Descanse agora: o intervalo faz o próximo bloco render mais. Ele já está reservado no seu plano.'
                          : 'Reforço de prioridade alta baseado no seu ritmo de estudo recente'}
                      </p>
                      {/* Ritmo do dia: o que vem depois, e a regra de bloco/intervalo. */}
                      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
                        {blockAfterRecommended && (
                          <span>
                            depois:{' '}
                            <strong className="font-semibold text-text-secondary">
                              {blockAfterRecommended.isBreak ? 'intervalo' : getStudyBlockDisplayTitle(blockAfterRecommended)}
                            </strong>{' '}
                            às {blockAfterRecommended.startTime} · {formatDuration(plannedMinutes(blockAfterRecommended))}
                          </span>
                        )}
                        {breakRule.bloco > 0 && breakRule.descanso > 0 && (
                          <span>
                            a cada {formatDuration(breakRule.bloco)} de estudo vem {formatDuration(breakRule.descanso)} de intervalo
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-text-muted" />
                          <span className="text-lg font-bold text-text-primary">
                            {formatDuration(plannedMinutes(recommendedBlock))}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-text-muted" />
                          <span className="text-sm text-text-secondary">
                            {getSubjectById(recommendedBlock.subjectId)?.name || '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-text-muted" />
                          <span className="text-sm text-text-secondary">
                            {recommendedBlock.pedagogicalStepIndex !== undefined && recommendedBlock.pedagogicalStepTotal
                              ? `Ciclo ${recommendedBlock.pedagogicalStepIndex}/${recommendedBlock.pedagogicalStepTotal}`
                              : getStudyBlockTypeLabel(recommendedBlock.type)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 w-full sm:w-auto flex-shrink-0 sm:self-center">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => handleStartBlock(recommendedBlock)}
                        className="shadow-neon-purple w-full sm:w-auto bg-gradient-to-r from-neon-purple to-neon-blue hover:opacity-90 transition-opacity border-none font-bold"
                      >
                        <Play className="w-4 h-4 mr-2 fill-current" />
                        Começar Sessão
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs w-full sm:w-auto text-text-secondary hover:text-white transition-colors" onClick={() => handlePostponeBlock(recommendedBlock)}>
                        Adiar 15 min
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {lockNotice && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 flex flex-col gap-2 rounded-xl border border-warning bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between"
                  role="status"
                >
                  <p className="flex items-start gap-2 text-sm text-warning-strong">
                    <Lock className="mt-0.5 w-4 h-4 shrink-0" />
                    {lockNotice}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full shrink-0 text-text-muted hover:text-text-secondary sm:w-auto"
                    onClick={() => setLockNotice(null)}
                  >
                    Entendi
                  </Button>
                </motion.div>
              )}

              <div className="mt-6">
                <BacklogWarning
                  blocks={plannerBlocks}
                  dailyHoursByWeekday={userSettings.dailyHoursByWeekday}
                  allowedDays={diasDeEstudo}
                  examDate={userSettings.examDate}
                />

                <PassProjection
                  examDate={studyPrefs.examDate}
                  totalHours={userSettings.totalHours}
                  daily={userSettings.dailyHoursByWeekday}
                  fallbackHoursPerDay={studyPrefs.hoursPerDay}
                  studiedHours={totalStudiedHours}
                />
              </div>

              <div className="mt-6">
                <TodayPlan
                  blocks={todayBlocksAll}
                  onStartSession={(blockId) => {
                    const block = todayBlocksAll.find((b) => b.id === blockId);
                    if (block) handleStartBlock(block);
                  }}
                  onSkipBlock={handleSkipBlock}
                  onCompleteBlock={handleCompleteBlock}
                  onStartBlock={handleStartBlock}
                  title="Agenda de Hoje"
                  subtitle={`${completedTodayCount} de ${todayBlocksAll.length} concluídos`}
                />
              </div>
            </motion.div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="space-y-6 sticky top-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-heading font-bold text-text-primary">Progresso Semanal</h3>
                    <p className="text-sm text-text-secondary">Horas de estudo esta semana</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-muted">Meta: {formatHoursDuration(weeklyGoalHours)}</p>
                    <p className="text-lg font-bold text-neon-blue">
                      {formatHoursDuration(totalWeeklyHours)} / {formatHoursDuration(weeklyGoalHours)}
                    </p>
                  </div>
                </div>
                <WeeklyChart data={weeklyData} compact />
                <div className="mt-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-neon-blue to-neon-purple" />
                    <span className="text-text-secondary">Percentual da meta</span>
                  </div>
                  <span className="font-medium text-text-primary">{weeklyProgressPercent}%</span>
                </div>
                <ProgressBar value={totalWeeklyHours} max={weeklyGoalHours} className="h-2 mt-2" />
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-heading font-bold text-text-primary">Nível e XP</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-muted">Estudado hoje</p>
                    <p className="text-sm font-bold text-neon-cyan">+{gamificationData.todayXP} XP</p>
                  </div>
                </div>
                <LevelProgress
                  level={gamificationData.level}
                  xp={gamificationData.xp}
                  levelUpXP={gamificationData.levelUpXP}
                  streakDays={gamificationData.streakDays}
                  longestStreak={gamificationData.longestStreak}
                  todaySessions={gamificationData.todaySessions}
                  className="mt-4"
                />
                <div className="mt-4 pt-4 border-t border-card-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Revisões pendentes</span>
                    <span className="font-bold text-amber-400">{pendingReviewsCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-text-secondary">Meta de hoje</span>
                    <span className="font-bold text-neon-purple">
                      {formatHoursDuration(dailyAnalytics.hours)} / {formatHoursDuration(todayTargetHours)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-text-secondary">Blocos concluídos hoje</span>
                    <span className="font-bold text-neon-cyan">{completedTodayCount}</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>


      <StudyBlockSessionModal
        block={activeSessionBlock}
        isOpen={!!activeSessionBlock}
        onClose={() => setActiveSessionBlock(null)}
        onComplete={(blockId, minutesSpent, performance) =>
          handleCompleteBlock(blockId, minutesSpent, performance)
        }
      />
    </div>
  );
}