'use client';

/**
 * Dashboard Component
 * Visão geral principal do sistema com métricas, agendamentos, sugestões adaptativas e gamificação
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Play,
  CheckCircle2,
  SkipForward,
  Coffee,
  ChevronRight,
  Calendar,
  TrendingUp,
  Flame,
  Target,
  Sparkles,
  BookOpen,
  Zap,
  Award,
} from 'lucide-react';
import { cn, formatDuration, formatDate, toLocalDateKey, parseBlockDate, getWeekStart, timeToMinutes, minutesToTime } from '@/lib/utils';
import { getStudyBlockTypeLabel } from '@/lib/studyBlockLabels';
import { computeGamificationSnapshot } from '@/lib/progressSnapshot';
import { applyBlockCompletionMetrics } from '@/services/adaptiveStudyIntelligence';
import { getStudyBlockDisplayTitle } from '@/lib/studyBlockLabels';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { StudyBlockSessionModal } from '@/components/session';
import { StatsCard, ProgressBar } from '@/components/ui';
import { LevelProgress } from '@/components/dashboard';
import { TodayPlan } from '@/components/dashboard';
import { WeeklyChart } from '@/components/dashboard';
import type { StudyBlock, Subject, AnalyticsStore, StudyPreferences, UserSettings } from '@/types';
import { useOnboarding, useLocalStorage } from '@/hooks';
import { defaultTrainerTips } from '@/services/studyTrainer';

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

export default function Dashboard() {
  const router = useRouter();
  const [isSuggestionApplied, setIsSuggestionApplied] = useState(false);
  const [showAllTips, setShowAllTips] = useState(false);
  const { hasCompletedWelcome } = useOnboarding();
  const [plannerBlocks, setPlannerBlocks] = useLocalStorage<StudyBlock[]>('nexora_planner_blocks', []);
  const [subjects, setSubjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [analytics, setAnalytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', { daily: {} });
  const [studyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', {
    hoursPerDay: 2,
    daysOfWeek: [1, 2, 3, 4, 5],
    mode: 'random',
    examDate: '',
  });
  const [userSettings] = useLocalStorage<UserSettings>('nexora_user_settings', {
    excludeDays: [] as number[],
    name: '',
    email: '',
    theme: 'dark',
    dailyGoalHours: 3,
    preferredStart: '08:00',
    preferredEnd: '22:00',
    maxBlockMinutes: 120,
    breakMinutes: 15,
    aiDifficulty: 'adaptive',
    focusMode: true,
    autoSchedule: false,
    smartBreaks: false,
    dailyReminder: false,
    streakReminder: false,
    achievementAlerts: false,
    weeklyReport: false,
    notificationsEnabled: true,
    notificationMinutesBefore: 5,
    notificationSoundEnabled: true,
    backlogReminderEnabled: true,
    allowSundayBacklog: false,
  });

  const todayKey = toLocalDateKey(new Date());
  const today = todayKey;
  const currentTime = new Date().toTimeString().slice(0, 5);
  const dailyAnalytics = useMemo(() => analytics.daily[todayKey] || { hours: 0, sessions: 0, blocks: 0, correctAnswers: 0, totalQuestions: 0 }, [analytics.daily, todayKey]);
  const todayBlocks = plannerBlocks.filter(
    (block) => {
      const blockDateKey = toLocalDateKey(parseBlockDate(block.date));
      return blockDateKey === todayKey && (block.status === 'scheduled' || block.status === 'rescheduled' || block.status === 'in-progress');
    }
  );

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

  const weeklyData = useMemo(() => {
    const dayLabels = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const weekStart = getWeekStart(new Date());

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
        target: studyPrefs.hoursPerDay,
      };
    });
  }, [analytics, studyPrefs]);

  const totalWeeklyHours = weeklyData.reduce((sum, day) => sum + day.hours, 0);
  const completedWeeklySessions = weeklyData.reduce((sum, day) => sum + day.sessions, 0);

  const weeklyGoalHours = Math.max(studyPrefs.hoursPerDay * 7, 1);
  const weeklyProgressPercent = Math.round((totalWeeklyHours / weeklyGoalHours) * 100);

  const gamificationSnapshot = useMemo(
    () => computeGamificationSnapshot({ plannerBlocks, analytics }),
    [plannerBlocks, analytics]
  );
  const streak = gamificationSnapshot.streak;

  const [activeSessionBlock, setActiveSessionBlock] = useState<StudyBlock | null>(null);

  const recommendedBlock = useMemo(() => {
    return todayBlocks.find((block) => !block.isBreak) ?? null;
  }, [todayBlocks]);

  const aiSuggestion = useMemo(() => {
    if (subjects.length === 0) return null;
    
    // Find subject with lowest accuracy rate or least studied
    const subjectPerformance = subjects.map((s) => {
      const profile = analytics.performance?.subjects?.[s.id];
      const accuracyRate = profile?.accuracyRate ?? 0.5;
      const daysWithoutStudy = profile?.daysWithoutStudy ?? 30;
      return { subject: s, accuracyRate, daysWithoutStudy };
    });
    
    // Sort by lowest accuracy first, then by days without study
    subjectPerformance.sort((a, b) => {
      if (a.accuracyRate !== b.accuracyRate) return a.accuracyRate - b.accuracyRate;
      return b.daysWithoutStudy - a.daysWithoutStudy;
    });
    
    const weakest = subjectPerformance[0];
    if (!weakest) return null;
    
    return {
      title: 'Reforço com base na IA',
      text: `${weakest.subject.name} - ${weakest.subject.area || 'Tópico principal'}`,
      reason: `Baixo desempenho recente (${Math.round((1 - weakest.accuracyRate) * 100)}% de erros estimados)`,
      action: '+2 sessões p/ semana',
      priority: 'high',
    };
  }, [subjects, analytics]);

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
    const updatedBlocks = plannerBlocks.map((b) =>
      b.id === block.id ? { ...b, status: 'in-progress' as const, startTime: currentTime } : b
    );
    setPlannerBlocks(updatedBlocks);
    setActiveSessionBlock({ ...block, status: 'in-progress' as const, startTime: currentTime });
  };

const handleCompleteBlock = (
    blockId: string,
    minutesSpent?: number,
    performance?: { correctAnswers?: number; totalQuestions?: number }
  ) => {
    const blockRef = plannerBlocks.find((b) => b.id === blockId) ?? (activeSessionBlock?.id === blockId ? activeSessionBlock : undefined);
    if (!blockRef || blockRef.status === 'completed') return;
    const now = new Date();
    const completedTime = now.toTimeString().slice(0, 5);
    const effectiveMinutes = minutesSpent || blockRef.durationMinutes;
    const hours = effectiveMinutes / 60;
    const updatedBlocks = plannerBlocks.map((block) => {
      if (block.id === blockId) {
        const updatedBlock = { ...block, status: 'completed' as const, endTime: completedTime, completedAt: now, updatedAt: now };
        if (minutesSpent) updatedBlock.durationMinutes = minutesSpent;
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
    setActiveSessionBlock(null);
  };

  const handlePostponeBlock = (block: StudyBlock) => {
    const shift = (time: string) => minutesToTime(timeToMinutes(time) + 15);
    setPlannerBlocks((prev) =>
      prev.map((b) =>
        b.id === block.id ? { ...b, startTime: shift(b.startTime), endTime: shift(b.endTime) } : b
      )
    );
    setActiveSessionBlock((prev) =>
      prev && prev.id === block.id ? { ...prev, startTime: shift(prev.startTime), endTime: shift(prev.endTime) } : prev
    );
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
        {!hasCompletedWelcome && (
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
                    Olá, Lucas! 🎓
                  </h1>
                  <p className="text-text-secondary mt-1">
                    {formatDate(new Date())}, dia {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][new Date().getDay()]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs text-text-muted">Meta Semanal</p>
                      <p className="text-sm font-bold text-neon-blue">
                        {totalWeeklyHours}h / {studyPrefs.hoursPerDay * 7}h
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
                  <div className="absolute top-0 right-0 rounded-bl-2xl bg-neon-purple/20 px-3 py-1.5 backdrop-blur-sm border-b border-l border-neon-purple/20">
                    <span className="text-[10px] font-bold tracking-widest text-neon-purple uppercase flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-neon-purple animate-pulse-slow" />
                      Recomendado Agora
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 pr-28 sm:pr-0">
                        <Zap className="w-4 h-4 text-neon-purple flex-shrink-0" />
                        <span className="text-xs font-bold tracking-widest text-neon-purple uppercase truncate">SESSÃO RECOMENDADA AGORA</span>
                      </div>
                      <h2 className="text-xl font-heading font-bold text-text-primary mb-2 pr-24 sm:pr-0">
                        {getStudyBlockDisplayTitle(recommendedBlock)}
                      </h2>
                      <p className="text-text-secondary mb-4 line-clamp-2 pr-0 sm:pr-0">
                        Reforço de prioridade alta baseado no seu ritmo de estudo recente
                      </p>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-4">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-text-muted" />
                          <span className="text-lg font-bold text-text-primary">{formatDuration(recommendedBlock.durationMinutes)}</span>
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
                    <div className="ml-0 mt-6 sm:mt-0 sm:ml-6 flex flex-col gap-3 w-full sm:w-auto flex-shrink-0 justify-center">
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

              <div className="mt-6">
                <TodayPlan
                  blocks={todayBlocks}
                  onStartSession={(blockId) => {
                    const block = todayBlocks.find((b) => b.id === blockId);
                    if (block) handleStartBlock(block);
                  }}
                  onSkipBlock={handleSkipBlock}
                  onCompleteBlock={handleCompleteBlock}
                  onStartBlock={handleStartBlock}
                  title="Agenda de Hoje"
                  subtitle={`${todayBlocks.filter((b) => b.status === 'completed').length} de ${todayBlocks.length} concluídos`}
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
                    <p className="text-xs text-text-muted">Meta: {weeklyGoalHours}h</p>
                    <p className="text-lg font-bold text-neon-blue">
                      {totalWeeklyHours}h / {weeklyGoalHours}h
                    </p>
                  </div>
                </div>
                <WeeklyChart data={weeklyData} compact />
                <div className="mt-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-neon-blue to-neon-purple" />
                    <span className="text-text-secondary">Realizado</span>
                  </div>
                  <span className="font-medium text-text-primary">{weeklyProgressPercent}%</span>
                </div>
                <ProgressBar value={totalWeeklyHours} max={weeklyGoalHours} className="h-2 mt-2" />
              </Card>
            </motion.div>

            {aiSuggestion && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent p-5 backdrop-blur-glass"
              >
                <div className="absolute top-0 right-0 rounded-bl-xl bg-amber-500/10 px-2.5 py-1 border-b border-l border-amber-500/20">
                  <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <div className="w-1 h-1 rounded-full bg-amber-400 animate-pulse-slow" />
                    IA Ativa
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className={cn("w-10 h-10 rounded-full border flex items-center justify-center flex-shrink-0 mt-1 transition-colors", isSuggestionApplied ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/20")}>
                    {isSuggestionApplied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Zap className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-bold text-text-primary mb-0.5 text-base">
                      {isSuggestionApplied ? "Sugestão Aplicada!" : "Sugestão Adaptativa"}
                    </h3>
                    
                    {isSuggestionApplied ? (
                      <p className="text-sm text-emerald-400/90 mt-2 leading-relaxed">
                        O seu cronograma foi ajustado com sucesso pela inteligência artificial. Bons estudos!
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-text-secondary mb-3 leading-relaxed">
                          <strong className="text-amber-400/90 font-medium">{aiSuggestion.title}</strong><br/>
                          {aiSuggestion.text}
                        </p>
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mt-4 pt-3 border-t border-amber-500/10">
                          <span className="text-xs text-text-muted leading-tight max-w-[200px]">
                            Motivo: {aiSuggestion.reason}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-xs h-8 px-4 w-full xl:w-auto bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 border border-amber-500/20 transition-all flex-shrink-0 whitespace-nowrap"
                            onClick={() => setIsSuggestionApplied(true)}
                          >
                            {aiSuggestion.action}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-heading font-bold text-text-primary">Nível e XP</h3>
                    <p className="text-sm text-text-secondary">Continue estudando para subir de nível!</p>
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
                    <span className="font-bold text-amber-400">3</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-text-secondary">Conquistas desbloqueadas</span>
                    <span className="font-bold text-neon-purple">Nv. 12</span>
                  </div>
                </div>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <Card className="p-5">
                <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Dicas do Study Trainer</h3>
                <div className="space-y-3">
                  {defaultTrainerTips.slice(0, showAllTips ? undefined : 2).map((tip, index) => (
                    <div key={tip.id} className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-neon-blue/20 text-neon-blue font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary mb-1">{tip.title}</p>
                        <p className={cn("text-xs text-text-secondary", !showAllTips && "line-clamp-2")}>{tip.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {defaultTrainerTips.length > 2 && (
                  <Button variant="secondary" size="sm" className="w-full mt-4" onClick={() => setShowAllTips(!showAllTips)}>
                    {showAllTips ? "Mostrar Menos" : "Ver Todas as Dicas"}
                  </Button>
                )}
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