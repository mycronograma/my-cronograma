'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, X, Filter, Calendar, Clock, TrendingUp, Target, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Layers, RotateCw, Navigation, Check, Plus, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn, getWeekStart, timeToMinutes, minutesToTime, parseLocalDateKey, parseBlockDate, toLocalDateKey } from '@/lib/utils';
import { getStudyBlockTypeLabel } from '@/lib/studyBlockLabels';
import { isEnemGoal, upgradeSubjectsToOfficialEnemStructure } from '@/lib/enemCatalog';
import { generateChronologicalSchedule, getPhaseForDate } from '@/services/roadmapEngine';
import { resolveScheduleConstraints } from '@/services/scheduleConstraints';
import { buildSubjectPerformanceProfiles, inferUserLearningLevel } from '@/services/adaptiveStudyIntelligence';
import { useLocalStorage } from '@/hooks';
import { useBacklogRescheduler } from '@/hooks/useBacklogRescheduler';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import type {
  AnalyticsStore,
  StudyBlock,
  Subject,
  StudyPreferences,
  UserSettings,
  WeekdayKey,
  AIDifficulty,
} from '@/types';
import { defaultSettings } from '@/lib/defaultSettings';

const weekDayKeys: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

// Fonte única: defaultSettings.dailyHoursByWeekday. Antes o planner tinha o
// próprio default (17h/semana) divergindo do restante do app (24h/semana), o que
// fazia a mesma configuração gerar cargas diferentes em telas distintas.
const DEFAULT_DAILY_HOURS_BY_WEEKDAY = defaultSettings.dailyHoursByWeekday;
const DEFAULT_DAILY_AVAILABILITY_BY_WEEKDAY: UserSettings['dailyAvailabilityByWeekday'] = {
  dom: { start: '', end: '' }, seg: { start: '', end: '' }, ter: { start: '', end: '' }, qua: { start: '', end: '' }, qui: { start: '', end: '' }, sex: { start: '', end: '' }, sab: { start: '', end: '' },
};

const toLocalKey = (date: Date) => toLocalDateKey(date);
const parseLocalKey = (value: string) => parseLocalDateKey(value);

const getHoursForDate = (
  date: Date,
  dailyHoursByWeekday: UserSettings['dailyHoursByWeekday'],
  fallbackHours: number
) => {
  if (!dailyHoursByWeekday) return fallbackHours;
  const key = weekDayKeys[date.getDay()];
  const value = dailyHoursByWeekday[key];
  return typeof value === 'number' ? value : fallbackHours;
};

const buildDailyLimitByDate = (
  startDate: Date,
  endDate: Date,
  dailyHoursByWeekday: UserSettings['dailyHoursByWeekday'],
  fallbackHours: number
) => {
  const limits: Record<string, number> = {};
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const hours = getHoursForDate(cursor, dailyHoursByWeekday, fallbackHours);
    limits[toLocalKey(cursor)] = Math.max(0, Math.round(hours * 60));
    cursor.setDate(cursor.getDate() + 1);
  }
  return limits;
};

const buildDailyTimeWindowByDate = (
  startDate: Date,
  endDate: Date,
  dailyAvailabilityByWeekday: UserSettings['dailyAvailabilityByWeekday']
) => {
  const windows: Record<string, { start: string; end: string }> = {};
  if (!dailyAvailabilityByWeekday) return windows;
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = weekDayKeys[cursor.getDay()];
    const dayWindow = dailyAvailabilityByWeekday[key];
    if (
      dayWindow?.start &&
      dayWindow?.end &&
      timeToMinutes(dayWindow.end) > timeToMinutes(dayWindow.start)
    ) {
      windows[toLocalKey(cursor)] = { start: dayWindow.start, end: dayWindow.end };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
};

const MapStatsCard = ({ title, value, subvalue, icon: Icon, trend, trendColor }: {
  title: string;
  value: string | number;
  subvalue?: string;
  icon?: React.ElementType;
  trend?: string;
  trendColor?: string;
}) => (
  <div className="p-4 rounded-2xl border border-card-border bg-card-bg backdrop-blur-sm">
    <div className="flex items-start justify-between mb-2">
      <div>
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-text-primary">{value}</h3>
        {subvalue && <p className="text-xs text-text-muted mt-0.5">{subvalue}</p>}
      </div>
      {Icon && (
        <div className="h-10 w-10 rounded-xl bg-neon-purple/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-neon-purple" />
        </div>
      )}
    </div>
    {trend && (
      <div className={cn('flex items-center gap-1.5 mt-3 text-xs font-medium', trendColor || 'text-emerald-500')}>
        <TrendingUp className="h-3.5 w-3.5" />
        <span>{trend}</span>
      </div>
    )}
  </div>
);

const Tooltip = ({ children, content, position = 'top' }: {
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
        {children}
      </div>
      <div
        className={cn(
          'absolute z-50 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-medium whitespace-nowrap pointer-events-none transition-opacity duration-200',
          position === 'top' && 'bottom-full mb-2 left-1/2 -translate-x-1/2',
          position === 'bottom' && 'top-full mt-2 left-1/2 -translate-x-1/2',
          position === 'left' && 'right-full top-1/2 -translate-y-1/2 ml-2',
          position === 'right' && 'left-full top-1/2 -translate-y-1/2 mr-2',
          show ? 'opacity-100' : 'opacity-0'
        )}
      >
        {content}
        <div
          className={cn(
            'absolute w-2 h-2 bg-slate-900 border-slate-700 transform rotate-45',
            position === 'top' && 'top-full left-1/2 -translate-x-1/2 -mt-1',
            position === 'bottom' && 'bottom-full left-1/2 -translate-x-1/2 -mb-1',
            position === 'left' && 'left-full top-1/2 -translate-y-1/2 -ml-1',
            position === 'right' && 'right-full top-1/2 -translate-y-1/2 -mr-1'
          )}
        />
      </div>
    </div>
  );
};

export default function PlannerPage() {
  const [subjects, setSubjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [studyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', {
    hoursPerDay: 2,
    daysOfWeek: [1, 2, 3, 4, 5],
    mode: 'random',
    examDate: '',
  });
  const [blocks, setBlocks] = useLocalStorage<StudyBlock[]>('nexora_planner_blocks', []);
  const [scheduleRange, setScheduleRange] = useLocalStorage<{ startDate: string; endDate: string } | null>(
    'nexora_schedule_range',
    null
  );
  const [userSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [dailyLimits] = useLocalStorage<Record<string, number>>('nexora_daily_limits', {});
  // #6d/#6c: blocos não cumpridos são empurrados para o próximo dia com horário
  // livre e a semana é recalculada. Roda no máximo 1x por dia (gate interno).
  const allowedStudyDays = useMemo(() => {
    const hours = userSettings?.dailyHoursByWeekday;
    if (!hours) return undefined;
    const WEEKDAY_KEYS_LOCAL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    return WEEKDAY_KEYS_LOCAL.map((key, index) => ((hours as Record<string, number>)[key] > 0 ? index : -1))
      .filter((index) => index >= 0);
  }, [userSettings?.dailyHoursByWeekday]);
  const [analytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', { daily: {} });
  const [isGenerating, setIsGenerating] = useState(false);
  const [plannerNotice, setPlannerNotice] = useState<string | null>(null);
  // #6d/#6c: blocos não cumpridos são empurrados para o próximo dia com horário
  // livre e a semana é recalculada. Roda 1x por dia sozinho; o botão abaixo
  // permite disparar na hora.
  const { pendingCount, runNow: runBacklogNow } = useBacklogRescheduler({
    blocks,
    setBlocks,
    allowedDays: allowedStudyDays,
    dailyLimitByDate: dailyLimits,
    breakMinutes: userSettings?.breakMinutes,
  });
  const [backlogFeedback, setBacklogFeedback] = useState<string | null>(null);

  const handleRecalculateBacklog = () => {
    const result = runBacklogNow();
    if (result.movedCount === 0) {
      setBacklogFeedback(
        pendingCount === 0 ? 'Nenhum bloco atrasado.' : 'Não havia espaço nos próximos dias.'
      );
      return;
    }
    setBacklogFeedback(
      `${result.movedCount} ${result.movedCount === 1 ? 'bloco remarcado' : 'blocos remarcados'} para os próximos dias.`
    );
  };

  const [firstCycleAllSubjects, setFirstCycleAllSubjects] = useLocalStorage<boolean>(
    'nexora_first_cycle_all_subjects',
    true
  );
  const scheduleStartDate = useMemo(
    () => (scheduleRange?.startDate ? parseLocalKey(scheduleRange.startDate) : null),
    [scheduleRange?.startDate]
  );
  const scheduleEndDate = useMemo(
    () => (scheduleRange?.endDate ? parseLocalKey(scheduleRange.endDate) : null),
    [scheduleRange?.endDate]
  );

  const [showMapFilter, setShowMapFilter] = useState(false);
  const [mapFilterSubject, setMapFilterSubject] = useState<string | null>(null);
  const [mapFilterPhase, setMapFilterPhase] = useState<string | null>(null);
  const [mapFilterStatus, setMapFilterStatus] = useState<string | null>(null);

  const [displayedWeekStart, setDisplayedWeekStart] = useState(() => getWeekStart(new Date()));
  const [plannerEndDate, setPlannerEndDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  // Add Block Modal state
  const [addBlockModal, setAddBlockModal] = useState<{ open: boolean; date: Date | null }>({
    open: false,
    date: null,
  });
  const [newBlockSubjectId, setNewBlockSubjectId] = useState('');
  const [newBlockType, setNewBlockType] = useState<StudyBlock['type']>('AULA');
  const [newBlockStart, setNewBlockStart] = useState('09:00');
  const configuredBlockMinutes = studyPrefs?.focusBlockMinutes ?? studyPrefs?.blockDurationMinutes ?? 50;
  const [newBlockDuration, setNewBlockDuration] = useState(configuredBlockMinutes);
  const durationOptions = useMemo(
    () =>
      Array.from(new Set([30, 45, configuredBlockMinutes, 60, 90, 120]))
        .filter((v) => Number.isFinite(v) && v >= 15 && v <= 240)
        .sort((a, b) => a - b),
    [configuredBlockMinutes]
  );

  // A11y dos três diálogos do planner: role/aria-modal, Escape e prisão de foco.
  const addBlockDialog = useDialogA11y({
    open: addBlockModal.open,
    onClose: () => setAddBlockModal({ open: false, date: null }),
    ariaLabel: 'Adicionar bloco de estudo',
  });
  const mapFilterDialog = useDialogA11y({
    open: showMapFilter,
    onClose: () => setShowMapFilter(false),
    ariaLabel: 'Filtros do mapa de estudos',
  });
  const roadmapDialog = useDialogA11y({
    open: showRoadmap,
    onClose: () => setShowRoadmap(false),
    ariaLabel: 'Roadmap de estudos',
  });

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(displayedWeekStart);
      date.setDate(displayedWeekStart.getDate() + index);
      const key = weekDayKeys[date.getDay()];
      return { key, date, label: key.substring(0, 3) };
    });
  }, [displayedWeekStart]);

  const currentMonthLabel = useMemo(() => {
    return displayedWeekStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [displayedWeekStart]);

  const monthGrid = useMemo(() => {
    const year = displayedWeekStart.getFullYear();
    const month = displayedWeekStart.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [displayedWeekStart]);

  const dailyHoursByWeekday = useMemo(
    () => userSettings?.dailyHoursByWeekday ?? DEFAULT_DAILY_HOURS_BY_WEEKDAY,
    [userSettings?.dailyHoursByWeekday]
  );
  const dailyAvailabilityByWeekday = useMemo(
    () => userSettings?.dailyAvailabilityByWeekday ?? DEFAULT_DAILY_AVAILABILITY_BY_WEEKDAY,
    [userSettings?.dailyAvailabilityByWeekday]
  );

  const safeDailyHoursByWeekday = (dailyHoursByWeekday ?? DEFAULT_DAILY_HOURS_BY_WEEKDAY) as NonNullable<UserSettings['dailyHoursByWeekday']>;
  const safeDailyAvailabilityByWeekday = (dailyAvailabilityByWeekday ?? DEFAULT_DAILY_AVAILABILITY_BY_WEEKDAY) as NonNullable<UserSettings['dailyAvailabilityByWeekday']>;

  const dailyLimitsByDate = useMemo(() => {
    if (!scheduleStartDate || !scheduleEndDate) return {};
    return buildDailyLimitByDate(scheduleStartDate, scheduleEndDate, safeDailyHoursByWeekday, safeDailyHoursByWeekday.seg);
  }, [scheduleStartDate, scheduleEndDate, safeDailyHoursByWeekday]);

  const dailyTimeWindowsByDate = useMemo(() => {
    if (!scheduleStartDate || !scheduleEndDate) return {};
    return buildDailyTimeWindowByDate(scheduleStartDate, scheduleEndDate, safeDailyAvailabilityByWeekday);
  }, [scheduleStartDate, scheduleEndDate, safeDailyAvailabilityByWeekday]);

  const hoursByDate = useMemo(() => {
    const hours: Record<string, number> = {};
    weekDays.forEach(({ date, key }) => {
      const baseHours = safeDailyHoursByWeekday[key] || 0;
      const dayKey = toLocalKey(date);
      const limit = dailyLimitsByDate[dayKey];
      hours[dayKey] = limit !== undefined ? Math.min(limit / 60, baseHours) : baseHours;
      const window = dailyTimeWindowsByDate[dayKey];
      if (window?.start && window?.end) {
        const windowHours = (timeToMinutes(window.end) - timeToMinutes(window.start)) / 60;
        hours[dayKey] = Math.min(hours[dayKey], windowHours);
      }
    });
    return hours;
  }, [safeDailyHoursByWeekday, dailyLimitsByDate, dailyTimeWindowsByDate, weekDays]);

  const blocksForMap = useMemo(() => {
    return blocks
      .filter((block) => {
        if (mapFilterSubject && block.subjectId !== mapFilterSubject) return false;
        if (mapFilterPhase && String(block.pedagogicalStepIndex ?? '') !== mapFilterPhase) return false;
        if (mapFilterStatus && block.status !== mapFilterStatus) return false;
        return true;
      })
      .map((block) => ({
        ...block,
        displayDate: toLocalDateKey(parseBlockDate(block.date)!),
      }));
  }, [blocks, mapFilterSubject, mapFilterPhase, mapFilterStatus]);

  const availablePhases = useMemo(() => {
    const phases = new Set<number>();
    blocks.forEach((block) => {
      if (block.pedagogicalStepIndex !== undefined) phases.add(block.pedagogicalStepIndex);
    });
    return Array.from(phases).sort((a, b) => a - b);
  }, [blocks]);

  const activeSubjects = subjects.filter((s) => s.isActive);

  const handleGenerateSchedule = useCallback(async () => {
    if (subjects.length === 0) {
      setPlannerNotice('Adicione pelo menos uma matéria para gerar um cronograma.');
      return;
    }
    if (plannerEndDate && plannerEndDate < displayedWeekStart) {
      setPlannerNotice('A data de fim não pode ser antes do início.');
      return;
    }
    const diffDays = Math.ceil(((plannerEndDate ?? new Date(displayedWeekStart.getTime() + 6*86400000)).getTime() - displayedWeekStart.getTime()) / 86400000) + 1;
    if (diffDays > 730) {
      setPlannerNotice('Período muito longo (máximo 2 anos / 730 dias).');
      return;
    }
    setIsGenerating(true);
    setPlannerNotice(null);

    try {
      const weekStart = displayedWeekStart;
      const weekEnd = plannerEndDate ?? (() => { const d = new Date(displayedWeekStart); d.setDate(d.getDate() + 6); return d; })();
      // As mesmas restrições que o Mapa de Carga exibe e que a API
      // /api/planner/generate aplica. Antes o botão gerava sem restDays,
      // dailyLimitByDate, janelas de disponibilidade e regras de simulado:
      // para 3h seg-sex + 2h sab o botão produzia 22,8h/semana contra 17h da API.
      const constraints = resolveScheduleConstraints({
        userSettings: {
          ...userSettings,
          dailyHoursByWeekday:
            userSettings.dailyHoursByWeekday ?? DEFAULT_DAILY_HOURS_BY_WEEKDAY,
          dailyAvailabilityByWeekday:
            userSettings.dailyAvailabilityByWeekday ?? DEFAULT_DAILY_AVAILABILITY_BY_WEEKDAY,
        },
        studyPrefs,
        startDate: weekStart,
        endDate: weekEnd,
        dailyLimitsOverride: dailyLimits,
      });

      const schedule = await generateChronologicalSchedule({
        subjects,
        preferences: studyPrefs,
        startDate: weekStart,
        endDate: weekEnd,
        preferredStart: constraints.preferredStart,
        preferredEnd: constraints.preferredEnd,
        maxBlockMinutes: constraints.maxBlockMinutes,
        breakMinutes: constraints.breakMinutes,
        restDays: constraints.restDays,
        dailyLimitByDate: constraints.dailyLimitByDate,
        dailyTimeWindowByDate: constraints.dailyTimeWindowByDate,
        simuladoRules: constraints.simuladoRules,
        firstCycleAllSubjects,
      });

      const enrichedBlocks = schedule.blocks.map((block) => ({
        ...block,
        id: `${block.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date: parseBlockDate(block.date),
        originalDate: block.originalDate ? parseBlockDate(block.originalDate) : block.originalDate,
      }));

      setBlocks(enrichedBlocks);
      setPlannerNotice(`✅ Cronograma gerado de ${toLocalKey(weekStart)} até ${toLocalKey(weekEnd)}!`);

      setScheduleRange({
        startDate: toLocalKey(weekStart),
        endDate: toLocalKey(weekEnd),
      });
    } catch (error) {
      console.error('Erro ao gerar cronograma:', error);
      setPlannerNotice('❌ Erro ao gerar cronograma.');
    } finally {
      setIsGenerating(false);
    }
  }, [subjects, studyPrefs, userSettings, dailyLimits, firstCycleAllSubjects, setBlocks, setScheduleRange, displayedWeekStart, plannerEndDate]);

  const handleResetPlanner = () => {
    setBlocks([]);
    setScheduleRange(null);
    setPlannerNotice('🗑️ Cronograma limpo — pronto para recomecar!');
  };

  const handleOpenAddBlock = (date: Date) => {
    setAddBlockModal({ open: true, date });
    setNewBlockSubjectId(activeSubjects[0]?.id || '');
    setNewBlockType('AULA');
    setNewBlockStart('09:00');
    setNewBlockDuration(60);
  };

  const handleSaveNewBlock = () => {
    const date = addBlockModal.date;
    if (!date || !newBlockSubjectId) return;
    const subject = activeSubjects.find((s) => s.id === newBlockSubjectId);
    const startMins = timeToMinutes(newBlockStart);
    const endMins = startMins + newBlockDuration;
    const endTime = minutesToTime(endMins);
    const newBlock: StudyBlock = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: 'local',
      subjectId: newBlockSubjectId,
      subject,
      date: new Date(date),
      startTime: newBlockStart,
      endTime,
      durationMinutes: newBlockDuration,
      status: 'scheduled',
      isBreak: false,
      isAutoGenerated: false,
      type: newBlockType,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const breakLen = userSettings?.breakMinutes ?? 10;
    setBlocks((prev) => {
      const dayKey = toLocalDateKey(new Date(date));
      const isSameDay = (b: StudyBlock) => toLocalDateKey(parseBlockDate(b.date) ?? b.date) === dayKey;
      const dayStudy = prev
        .filter((b) => isSameDay(b) && !b.isBreak)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      // Anti-empilhamento: se o horário escolhido colide, encaixa após o último
      // bloco conflitante + intervalo.
      let start = startMins;
      for (const b of dayStudy) {
        const bStart = timeToMinutes(b.startTime);
        if (start < bStart + b.durationMinutes && bStart < start + newBlockDuration) {
          start = bStart + b.durationMinutes + breakLen;
        }
      }
      const end = start + newBlockDuration;
      const adjusted: StudyBlock = { ...newBlock, startTime: minutesToTime(start), endTime: minutesToTime(end) };

      const abutting = dayStudy.find((b) => timeToMinutes(b.startTime) === end);
      if (!abutting || breakLen <= 0) {
        return [...prev, adjusted];
      }

      // Intervalo obrigatório entre o bloco novo e o seguinte encostado,
      // empurrando a cadeia consecutiva do dia para abrir espaço.
      const breakBlock: StudyBlock = {
        ...adjusted,
        id: `manual-break-${Date.now()}`,
        isBreak: true,
        durationMinutes: breakLen,
        startTime: minutesToTime(end),
        endTime: minutesToTime(end + breakLen),
        description: 'Intervalo',
        type: undefined,
      };
      let cursor = end + breakLen;
      const shifted = prev.map((b) => {
        if (!isSameDay(b) || b.isBreak) return b;
        const bStart = timeToMinutes(b.startTime);
        if (bStart < end) return b;
        const delta = Math.max(0, cursor - bStart);
        const moved = {
          ...b,
          startTime: minutesToTime(bStart + delta),
          endTime: minutesToTime(bStart + delta + b.durationMinutes),
        };
        cursor = bStart + delta + b.durationMinutes + breakLen;
        return moved;
      });
      return [...shifted, adjusted, breakBlock];
    });
    setAddBlockModal({ open: false, date: null });
    setPlannerNotice(`✅ Bloco de ${subject?.name || 'estudo'} adicionado com intervalo automático!`);
  };

  const getBlockStatusInfo = (block: StudyBlock) => {
    if (block.pedagogicalStepIndex !== undefined && block.pedagogicalStepTotal) {
      return { icon: BookOpen, label: `Fase ${block.pedagogicalStepIndex}/${block.pedagogicalStepTotal}`, variant: 'scheduled' as const };
    }
    return { icon: Clock, label: getStudyBlockTypeLabel(block.type), variant: 'scheduled' as const };
  };

  const AddBlockModal = () => (
    <AnimatePresence>
      {addBlockModal.open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          ref={addBlockDialog.dialogRef}
          {...addBlockDialog.dialogProps}
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setAddBlockModal({ open: false, date: null })}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            className="bg-card-bg rounded-3xl border border-card-border p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-neon-purple/15 border border-neon-purple/20 flex items-center justify-center">
                  <Plus className="h-5 w-5 text-neon-purple" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary">Novo Bloco de Estudo</h3>
                  <p className="text-xs text-text-muted">
                    {addBlockModal.date?.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAddBlockModal({ open: false, date: null })}
                className="h-9 w-9 rounded-full bg-surface-panel hover:bg-card-border text-text-muted hover:text-text-primary transition-colors flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Subject */}
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-2">
                  Matéria
                </label>
                {activeSubjects.length === 0 ? (
                  <p className="text-sm text-text-muted p-3 rounded-xl bg-surface-panel border border-card-border">
                    Nenhuma matéria ativa. Adicione matérias em Matérias.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activeSubjects.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setNewBlockSubjectId(s.id)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border',
                          newBlockSubjectId === s.id
                            ? 'border-current'
                            : 'bg-surface-panel border-border-subtle text-text-secondary hover:border-card-border'
                        )}
                        style={newBlockSubjectId === s.id ? {
                          backgroundColor: `${s.color}20`,
                          borderColor: `${s.color}60`,
                          color: s.color,
                        } : {}}
                      >
                        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-2">
                  Tipo de Sessão
                </label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: 'AULA', label: 'Aula' },
                    { value: 'EXERCICIOS', label: 'Exercícios' },
                    { value: 'REVISAO', label: 'Revisão' },
                    { value: 'SIMULADO_AREA', label: 'Simulado' },
                    { value: 'ANALISE', label: 'Análise' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setNewBlockType(value)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-sm font-medium transition-all border',
                        newBlockType === value
                          ? 'bg-neon-blue/15 text-neon-blue border-neon-blue/40'
                          : 'bg-surface-panel border-border-subtle text-text-secondary hover:border-card-border'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time + Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-text-primary mb-2">
                    Horário de Início
                  </label>
                  <input
                    type="time"
                    value={newBlockStart}
                    onChange={(e) => setNewBlockStart(e.target.value)}
                    className="w-full h-10 rounded-xl bg-surface-panel border border-border-subtle px-3 text-sm font-semibold text-text-primary focus:outline-none focus:border-neon-purple/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-text-primary mb-2">
                    Duração
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {durationOptions.map((d) => (
                      <button
                        key={d}
                        onClick={() => setNewBlockDuration(d)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border',
                          newBlockDuration === d
                            ? 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/40'
                            : 'bg-surface-panel border-border-subtle text-text-muted hover:text-text-secondary'
                        )}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              {newBlockSubjectId && (() => {
                const s = activeSubjects.find(sub => sub.id === newBlockSubjectId);
                const endTime = minutesToTime(timeToMinutes(newBlockStart) + newBlockDuration);
                return s ? (
                  <div
                    className="rounded-xl p-3 border"
                    style={{
                      background: `linear-gradient(135deg, ${s.color}15 0%, ${s.color}05 100%)`,
                      borderColor: `${s.color}30`,
                    }}
                  >
                    <p className="text-xs text-text-muted mb-1">Preview</p>
                    <p className="font-bold text-sm" style={{ color: s.color }}>{s.name}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{newBlockStart} – {endTime} · {newBlockDuration} min</p>
                  </div>
                ) : null;
              })()}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setAddBlockModal({ open: false, date: null })}
                className="flex-1 h-11 rounded-xl bg-surface-panel border border-border-subtle text-text-secondary hover:text-text-primary hover:border-card-border text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveNewBlock}
                disabled={!newBlockSubjectId}
                className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-semibold shadow-lg shadow-violet-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Adicionar Bloco
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const MapModal = () => (
    <AnimatePresence>
      {showMapFilter && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          ref={mapFilterDialog.dialogRef}
          {...mapFilterDialog.dialogProps}
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowMapFilter(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-card-bg rounded-3xl border border-card-border p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <MapIcon className="h-5 w-5 text-neon-purple" />
                Filtros do Mapa de Tempo
              </h3>
              <button
                onClick={() => setShowMapFilter(false)}
                className="h-9 w-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-neon-purple" />
                  Matéria
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setMapFilterSubject(null)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                      !mapFilterSubject
                        ? 'bg-violet-600 text-white'
                        : 'bg-card-bg text-text-secondary border border-card-border hover:border-neon-purple/40'
                    )}
                  >
                    Todas as Matérias
                  </button>
                  {activeSubjects.map((subject) => (
                    <button
                      key={subject.id}
                      onClick={() => setMapFilterSubject(subject.id)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border',
                        mapFilterSubject === subject.id
                          ? 'bg-neon-purple/15 text-neon-purple border-neon-purple/40'
                          : 'bg-card-bg text-text-secondary border-card-border hover:border-neon-purple/40'
                      )}
                    >
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
                      <span>{subject.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-neon-cyan" />
                  Fase Pedagógica
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setMapFilterPhase(null)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                      !mapFilterPhase
                        ? 'bg-cyan-600 text-white'
                        : 'bg-card-bg text-text-secondary border border-card-border hover:border-neon-purple/40'
                    )}
                  >
                    Todas as Fases
                  </button>
                  {availablePhases.map((phase) => (
                    <button
                      key={phase}
                      onClick={() => setMapFilterPhase(phase.toString())}
                      className={cn(
                        'px-4 py-2 rounded-xl text-sm font-medium transition-all border',
                        mapFilterPhase === phase.toString()
                          ? 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/40'
                          : 'bg-card-bg text-text-secondary border-card-border hover:border-neon-purple/40'
                      )}
                    >
                      Fase {phase}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'scheduled', label: 'Agendado' },
                    { value: 'in-progress', label: 'Em Andamento' },
                    { value: 'completed', label: 'Concluído' },
                    { value: 'rescheduled', label: 'Reagendado' },
                    { value: 'skipped', label: 'Pulado' },
                  ].map((status) => (
                    <button
                      key={status.value}
                      onClick={() => setMapFilterStatus(status.value)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border',
                        mapFilterStatus === status.value
                          ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                          : 'bg-card-bg text-text-secondary border-card-border hover:border-neon-purple/40'
                      )}
                    >
                      <span>{status.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-card-border flex gap-3">
                <button
                  onClick={() => {
                    setMapFilterSubject(null);
                    setMapFilterPhase(null);
                    setMapFilterStatus(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
                >
                  Limpar filtros
                </button>
                <button
                  onClick={() => setShowMapFilter(false)}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
                >
                  Aplicar filtros
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const RoadmapModal = () => (
    <AnimatePresence>
      {showRoadmap && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          ref={roadmapDialog.dialogRef}
          {...roadmapDialog.dialogProps}
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowRoadmap(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-card-bg rounded-3xl border border-card-border p-6 w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                  <Navigation className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-text-primary">Roadmap Semanal Inteligente</h3>
                  <p className="text-sm text-text-secondary">Planejamento estratégico com IA para otimizar seu progresso</p>
                </div>
              </div>
              <button
                onClick={() => setShowRoadmap(false)}
                className="h-9 w-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MapStatsCard
                title="Total de horas"
                value={`${Object.values(hoursByDate).reduce((a, b) => a + b, 0).toFixed(1)}`}
                subvalue="Meta semanal vs disponível"
                icon={Clock}
                trend="+12% esta semana"
              />
              <MapStatsCard
                title="Matérias ativas"
                value={subjects.filter((s) => s.isActive).length}
                subvalue={`${subjects.length} total`}
                icon={BookOpen}
                trend="+1 esta semana"
              />
              <MapStatsCard
                title="Blocos planejados"
                value={blocks.length}
                subvalue="Horários ocupados"
                icon={Target}
                trend="+3 hoje"
              />
              <MapStatsCard
                title="Taxa de conclusão"
                value={`${((blocks.filter((b) => b.status === 'completed').length / Math.max(blocks.length, 1)) * 100).toFixed(0)}%`}
                subvalue="Esta semana"
                icon={TrendingUp}
                trend="+5% geral"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="w-full min-w-0 bg-background text-text-primary pb-20 lg:pb-0 overflow-x-hidden">
      <div className="w-full min-w-0 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Navigation className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-text-primary truncate">Planner Semanal Inteligente</h1>
                <p className="text-xs sm:text-sm text-text-secondary truncate">Visualize, organize e otimize seus blocos de estudo</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              {plannerNotice && (
                <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-900/30 border border-emerald-500/30 text-emerald-300 text-xs lg:text-sm">
                  <Check className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate max-w-[200px]">{plannerNotice}</span>
                </div>
              )}
              <button
                onClick={() => setShowMapFilter(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all text-xs sm:text-sm font-medium"
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filtrar</span>
              </button>
              <button
                onClick={() => setShowRoadmap(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-medium shadow-lg shadow-violet-600/20"
              >
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Ver Roadmap</span>
                <span className="sm:hidden">Roadmap</span>
              </button>
            </div>
          </div>
        </motion.div>

        {plannerNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-emerald-900/20 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3 md:hidden"
          >
            <Check className="h-5 w-5 flex-shrink-0" />
            <span>{plannerNotice}</span>
          </motion.div>
        )}

        <div className="bg-card-bg rounded-3xl border border-card-border shadow-xl overflow-hidden">
          {/* Header organizado: título + controles */}
          <div className="p-3 sm:p-4 lg:p-6 pb-3 sm:pb-4">
            <div className="flex flex-col gap-4">
              {/* Linha 1: Título e ações primárias */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg lg:text-xl font-bold text-text-primary leading-tight">Visualização Semanal do Tempo</h2>
                  <p className="text-xs sm:text-sm text-text-secondary mt-0.5 truncate">
                    {scheduleRange ? `Período gerado: ${(() => { const f = (k: string) => { const d = parseLocalKey(k); return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : k; }; return `${f(scheduleRange.startDate)} — ${f(scheduleRange.endDate)}`; })()}` : 'Distribuição dos blocos e horários ao longo da semana'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 self-start lg:self-center">
                  <button
                    onClick={handleRecalculateBacklog}
                    disabled={pendingCount === 0}
                    title={
                      pendingCount === 0
                        ? 'Nenhum bloco atrasado'
                        : `${pendingCount} bloco(s) pendente(s) de reagendar`
                    }
                    className="h-9 px-4 rounded-xl bg-card-bg border border-card-border text-text-secondary hover:text-text-primary hover:border-neon-blue/40 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5', pendingCount > 0 && 'text-amber-400')} />
                    Recalcular atrasados{pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </button>
                  <button onClick={handleResetPlanner} className="h-9 px-4 rounded-xl bg-card-bg border border-card-border text-text-secondary hover:text-text-primary hover:border-card-border text-sm font-medium transition-colors">Limpar tudo</button>
                  <button onClick={handleGenerateSchedule} disabled={isGenerating} className="h-9 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-semibold shadow-lg shadow-violet-600/20 disabled:opacity-50 flex items-center gap-2">{isGenerating ? 'Gerando...' : 'Gerar com IA'}</button>
                </div>
              </div>

              {backlogFeedback && (
                <p className="text-xs text-text-secondary flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {backlogFeedback}
                </p>
              )}

              {/* Linha 2: Controles de período - layout idêntico à referência */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-background-light border border-card-border px-3 py-2.5">
                <div className="flex items-center gap-1.5 rounded-xl bg-surface-panel border border-border-subtle px-2.5 py-1">
                  <Calendar className="h-3.5 w-3.5 text-text-muted" />
                  <span className="text-xs font-medium text-text-secondary">Início</span>
                  <input type="date" value={toLocalKey(displayedWeekStart)} onChange={(e) => { const d = parseLocalKey(e.target.value); if (d) setDisplayedWeekStart(getWeekStart(d)); }} className="h-6 rounded-lg bg-transparent border-0 px-1 text-xs font-semibold text-text-primary focus:outline-none focus:ring-0" />
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-surface-panel border border-border-subtle px-2.5 py-1">
                  <Calendar className="h-3.5 w-3.5 text-text-muted" />
                  <span className="text-xs font-medium text-text-secondary">Fim</span>
                  <input type="date" value={plannerEndDate ? toLocalKey(plannerEndDate) : toLocalKey(new Date(displayedWeekStart.getTime() + 6*86400000))} onChange={(e) => { const d = parseLocalKey(e.target.value); if (d) setPlannerEndDate(d); }} min={toLocalKey(displayedWeekStart)} className="h-6 rounded-lg bg-transparent border-0 px-1 text-xs font-semibold text-text-primary focus:outline-none focus:ring-0" />
                </div>
                <span className="inline-flex items-center rounded-full bg-neon-purple/15 border border-neon-purple/20 px-2.5 py-1 text-xs font-bold text-neon-purple">{(() => { const end = plannerEndDate ?? new Date(displayedWeekStart.getTime() + 6*86400000); const diff = Math.ceil((end.getTime() - displayedWeekStart.getTime())/86400000)+1; return `${diff} dias`; })()}</span>

                <span className="hidden sm:inline h-4 w-px bg-card-border" />

                <div className="flex items-center gap-1">
                  <button onClick={() => setDisplayedWeekStart(getWeekStart(new Date()))} className="h-7 px-3 rounded-full bg-surface-panel border border-border-subtle text-xs font-semibold text-text-secondary hover:text-text-primary">Hoje</button>
                  <button onClick={() => setDisplayedWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })} className="h-7 w-7 grid place-items-center rounded-full bg-surface-panel border border-border-subtle text-text-secondary hover:text-text-primary"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDisplayedWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })} className="h-7 w-7 grid place-items-center rounded-full bg-surface-panel border border-border-subtle text-text-secondary hover:text-text-primary"><ChevronRight className="h-3.5 w-3.5" /></button>
                  <div className="relative">
                    <button onClick={() => setShowCalendar(v => !v)} className="h-7 px-3 rounded-full bg-surface-panel border border-border-subtle text-xs font-semibold text-text-secondary hover:text-text-primary flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{currentMonthLabel}</button>
                    {showCalendar && (
                      <div className="absolute right-0 xl:left-0 xl:right-auto top-[calc(100%+8px)] z-40 w-[300px] rounded-2xl border border-card-border bg-card-bg shadow-xl p-3">
                        <div className="flex items-center justify-between mb-3">
                          <button onClick={() => setDisplayedWeekStart(d => { const n = new Date(d); n.setMonth(d.getMonth() - 1); return n; })} className="h-7 w-7 grid place-items-center rounded-lg hover:bg-black/5"><ChevronLeft className="h-4 w-4" /></button>
                          <span className="text-sm font-bold text-text-primary capitalize">{currentMonthLabel}</span>
                          <button onClick={() => setDisplayedWeekStart(d => { const n = new Date(d); n.setMonth(d.getMonth() + 1); return n; })} className="h-7 w-7 grid place-items-center rounded-lg hover:bg-black/5"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 mb-1">
                          {['SEG','TER','QUA','QUI','SEX','SAB','DOM'].map(d => <span key={d} className="text-[10px] font-bold text-text-muted text-center py-1">{d}</span>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {monthGrid.map((date, idx) => {
                            if (!date) return <span key={idx} />;
                            const isToday = date.toDateString() === new Date().toDateString();
                            const isSelectedWeek = weekDays.some(w => w.date.toDateString() === date.toDateString());
                            const isPast = date < new Date(new Date().setHours(0,0,0,0));
                            return (
                              <button key={idx} onClick={() => { setDisplayedWeekStart(getWeekStart(date)); setShowCalendar(false); }} className={cn('h-8 w-8 rounded-xl text-xs font-medium grid place-items-center transition-colors', isSelectedWeek ? 'bg-neon-purple text-white font-bold' : isToday ? 'bg-neon-blue/15 text-neon-blue border border-neon-blue/30' : 'text-text-secondary hover:bg-black/5', isPast && !isSelectedWeek ? 'opacity-50' : '')}>{date.getDate()}</button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4 lg:pb-6 overflow-x-auto">
            <div className="grid grid-cols-7 gap-1.5 lg:gap-2 min-w-[840px] items-start">
                {weekDays.map(({ date, key }) => {
                  const dateKey = toLocalKey(date);
                  const dayBlocks = blocksForMap.filter((block) => block.displayDate === dateKey);
                  const isToday = date.toDateString() === new Date().toDateString();
                  return (
                    <div key={key} className={cn(
                      "flex flex-col rounded-2xl border p-2 gap-1 min-w-0 transition-colors",
                      isToday
                        ? "bg-neon-purple/5 border-neon-purple/25"
                        : "bg-transparent border-transparent"
                    )}>
                      {/* Day Header */}
                      <div className={cn(
                        "flex flex-col items-center justify-center py-2 rounded-xl mb-1 flex-shrink-0",
                        isToday ? "bg-neon-purple text-white" : "bg-transparent"
                      )}>
                        <span className={cn(
                          "text-[10px] font-black tracking-widest uppercase",
                          isToday ? "text-white/80" : "text-text-muted"
                        )}>{key}</span>
                        <span className={cn(
                          "text-lg font-extrabold leading-none mt-0.5",
                          isToday ? "text-white" : "text-text-secondary"
                        )}>{date.getDate()}</span>
                        <span className={cn(
                          "text-[9px] font-medium",
                          isToday ? "text-white/70" : "text-text-muted"
                        )}>{date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                      </div>

                      {/* Blocks */}
                      <div className="space-y-1.5 min-h-[80px]">
                        {dayBlocks.map((block) => {
                          const subject = activeSubjects.find((s) => s.id === block.subjectId);
                          const displayName = subject?.name || block.subject?.name || block.type;
                          const isBreak = block.isBreak;
                          const subjectColor = subject?.color || '#6366F1';

                          if (isBreak) {
                            // Breaks: subtle separator, much less visual weight
                            return (
                              <div key={block.id} className="flex items-center gap-1.5 px-1 py-0.5 my-0.5">
                                <div className="flex-1 h-px bg-border-subtle" />
                                <span className="text-[9px] text-text-muted font-medium whitespace-nowrap flex items-center gap-0.5">
                                  ☕ {block.durationMinutes}m
                                </span>
                                <div className="flex-1 h-px bg-border-subtle" />
                              </div>
                            );
                          }

                          // Study blocks: premium card with color integration
                          return (
                            <div
                              key={block.id}
                              className="relative rounded-xl overflow-hidden cursor-default group transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
                              style={{
                                background: `linear-gradient(135deg, ${subjectColor}18 0%, ${subjectColor}08 100%)`,
                                borderWidth: '1px',
                                borderStyle: 'solid',
                                borderColor: `${subjectColor}35`,
                              }}
                            >
                              {/* Top accent line */}
                              <div className="h-[2px] w-full" style={{ backgroundColor: subjectColor }} />
                              <div className="p-2 pt-1.5">
                                <p
                                  className="font-bold text-text-primary truncate text-[11px] leading-snug group-hover:text-text-primary"
                                  title={displayName}
                                  style={{ color: subjectColor }}
                                >
                                  {displayName}
                                </p>
                                <div className="flex items-center justify-between mt-1.5 gap-1">
                                  <span className="text-[10px] text-text-muted font-medium">{block.startTime}</span>
                                  <span
                                    className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                    style={{
                                      color: subjectColor,
                                      backgroundColor: `${subjectColor}20`,
                                    }}
                                  >
                                    {block.durationMinutes}m
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {dayBlocks.length === 0 && (
                          <div className="grid place-items-center py-8 text-text-muted text-[11px] border border-dashed border-border-subtle rounded-xl">
                            <span className="opacity-50">—</span>
                          </div>
                        )}
                        <button
                          onClick={() => handleOpenAddBlock(date)}
                          className="w-full h-7 mt-0.5 rounded-xl border border-dashed border-border-subtle bg-transparent hover:bg-surface-panel text-[10px] font-medium text-text-muted hover:text-text-secondary flex items-center justify-center gap-1 transition-colors"
                        >
                          <Plus className="h-3 w-3" /> Adicionar
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Rodapé de métricas - igual à referência */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-1 pt-1">
            {(() => {
              const all = blocks.length;
              const done = blocks.filter(b => b.status === 'completed').length;
              const pending = all - done;
              const totalMins = blocks.filter(b => !b.isBreak).reduce((s,b) => s + b.durationMinutes, 0);
              const totalHours = (totalMins/60).toFixed(1);
              const doneMins = blocks.filter(b => b.status === 'completed' && !b.isBreak).reduce((s,b)=> s+b.durationMinutes,0);
              const doneHours = (doneMins/60).toFixed(1);
              const pct = all ? Math.round(done/all*100) : 0;
              const topSubjects = Array.from(new Set(blocks.filter(b=>!b.isBreak).map(b=> subjects.find(s=>s.id===b.subjectId)?.name).filter(Boolean) as string[])).slice(0,2);
              return (
                <>
                  <div className="rounded-2xl bg-background-light border border-card-border p-3">
                    <p className="text-[11px] font-bold tracking-widest text-text-muted uppercase">Total Planejado</p>
                    <p className="text-lg font-extrabold text-text-primary mt-1">{totalHours}h</p>
                    <p className="text-xs text-text-muted">{all} blocos • {pending} pendentes</p>
                  </div>
                  <div className="rounded-2xl bg-background-light border border-card-border p-3">
                    <p className="text-[11px] font-bold tracking-widest text-text-muted uppercase">Concluído até agora</p>
                    <p className="text-lg font-extrabold text-neon-blue mt-1">{doneHours}h <span className="text-xs font-bold text-neon-blue/60">({pct}%)</span></p>
                    <p className="text-xs text-text-muted">{all - done} blocos restantes</p>
                  </div>
                  <div className="rounded-2xl bg-background-light border border-card-border p-3">
                    <p className="text-[11px] font-bold tracking-widest text-text-muted uppercase">Aderência aos Blocos</p>
                    <p className="text-lg font-extrabold text-emerald-400 mt-1">{pct}%</p>
                    <p className="text-xs text-emerald-400/70">Desempenho excelente</p>
                  </div>
                  <div className="rounded-2xl bg-background-light border border-card-border p-3">
                    <p className="text-[11px] font-bold tracking-widest text-text-muted uppercase">Disciplinas Prioritárias</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {topSubjects.length ? topSubjects.map(n => <span key={n} className="px-2 py-1 rounded-full bg-neon-purple/15 border border-neon-purple/20 text-xs font-semibold text-neon-purple">{n}</span>) : <span className="text-xs text-text-muted">Nenhuma ainda</span>}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          </div>

        <MapModal />
        <RoadmapModal />
        <AddBlockModal />
      </div>
    </div>
    );
  }

