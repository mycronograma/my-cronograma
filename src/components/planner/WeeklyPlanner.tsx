'use client';

/**
 * WeeklyPlanner Component
 * Grade principal do planner com funcionalidade de arrastar e soltar
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  ArrowRightLeft,
  ListTodo,
  AlertTriangle,
  Flame,
  BellOff,
} from 'lucide-react';
import {
  getWeekStart,
  getWeekDates,
  formatDate,
  formatDuration,
  isSameDay,
  generateId,
  parseBlockDate,
  timeToMinutes,
  minutesToTime,
} from '@/lib/utils';
import { Button, Card } from '@/components/ui';
import { useLocalStorage } from '@/hooks';
import { defaultSettings } from '@/lib/defaultSettings';
import { getStudyBlockDisplayTitle } from '@/lib/studyBlockLabels';
import DayColumn from './DayColumn';
import TimeBlock from './TimeBlock';
import BlockFormModal, { type BlockFormData } from './BlockFormModal';
import { StudyBlockSessionModal } from '@/components/session';
import type {
  AnalyticsStore,
  DailyHoursByWeekday,
  StudyBlock,
  Subject,
  UserSettings,
  WeekdayKey,
} from '@/types';
import { autoRescheduleBacklog, getBacklogEntries } from '@/services/backlogRescheduler';
import { applyBlockCompletionMetrics } from '@/services/adaptiveStudyIntelligence';

const emptyAnalytics: AnalyticsStore = { daily: {} };

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const parseLocalDateKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const hasManualSequence = (block: StudyBlock) =>
  typeof block.sequenceIndex === 'number' && Number.isFinite(block.sequenceIndex);

const isLockedScheduleBlock = (block: StudyBlock) =>
  block.status === 'completed' || block.status === 'in-progress';

const isPendingStudyBlock = (block: StudyBlock) =>
  !block.isBreak && block.status !== 'completed' && block.status !== 'skipped';

const isCapacityStudyBlock = (block: StudyBlock) =>
  !block.isBreak && block.status !== 'skipped';

const compareDayBlocks = (a: StudyBlock, b: StudyBlock) => {
  const aHasSequence = hasManualSequence(a);
  const bHasSequence = hasManualSequence(b);

  if (aHasSequence && bHasSequence) {
    const sequenceDiff = (a.sequenceIndex as number) - (b.sequenceIndex as number);
    if (sequenceDiff !== 0) return sequenceDiff;
  } else if (aHasSequence !== bHasSequence) {
    return aHasSequence ? -1 : 1;
  }

  return a.startTime.localeCompare(b.startTime);
};

const sortBlocksChronologically = (blocks: StudyBlock[]) =>
  [...blocks].sort((a, b) => {
    const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.startTime.localeCompare(b.startTime);
  });

const areBlocksEquivalent = (a: StudyBlock[], b: StudyBlock[]) => {
  if (a.length !== b.length) return false;
  const first = sortBlocksChronologically(a);
  const second = sortBlocksChronologically(b);
  for (let i = 0; i < first.length; i += 1) {
    const one = first[i];
    const two = second[i];
    if (one.id !== two.id) return false;
    if (parseBlockDate(one.date).getTime() !== parseBlockDate(two.date).getTime()) return false;
    if (one.startTime !== two.startTime || one.endTime !== two.endTime) return false;
    if (one.durationMinutes !== two.durationMinutes) return false;
    if (one.status !== two.status) return false;
    if ((one.rescheduleCount || 0) !== (two.rescheduleCount || 0)) return false;
  }
  return true;
};

interface WeeklyPlannerProps {
  initialBlocks: StudyBlock[];
  onBlocksChange: (blocks: StudyBlock[]) => void;
  onGenerateSchedule: (range?: { startDate: Date; endDate: Date }) => void;
  isGenerating?: boolean;
  subjects?: Subject[];
  defaultDailyLimitMinutes?: number;
  defaultDailyLimitsByDate?: Record<string, number>;
  dailyHoursByWeekday?: DailyHoursByWeekday;
  allowedDays?: number[];
  selectedScheduleStartDate?: string | null;
  selectedScheduleEndDate?: string | null;
}

export default function WeeklyPlanner({
  initialBlocks,
  onBlocksChange,
  onGenerateSchedule,
  isGenerating = false,
  subjects = [],
  defaultDailyLimitMinutes = 0,
  defaultDailyLimitsByDate,
  dailyHoursByWeekday,
  allowedDays = [],
  selectedScheduleStartDate,
  selectedScheduleEndDate,
}: WeeklyPlannerProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const selectedStart = selectedScheduleStartDate
      ? parseLocalDateKey(selectedScheduleStartDate)
      : null;
    return getWeekStart(selectedStart ?? new Date());
  });
  const [blocks, setBlocks] = useState(initialBlocks);
  const [isMobile, setIsMobile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [mobileDayIndex, setMobileDayIndex] = useState(0);

  // Sincronizar quando o pai atualizar os blocos (ex: após gerar agenda)
  useEffect(() => {
    setBlocks((prev) => {
      if (prev.length !== initialBlocks.length) return initialBlocks;
      for (let i = 0; i < prev.length; i++) {
        const a = prev[i];
        const b = initialBlocks[i];
        if (
          a.id !== b.id ||
          a.status !== b.status ||
          a.subjectId !== b.subjectId ||
          a.startTime !== b.startTime ||
          a.endTime !== b.endTime
        ) {
          return initialBlocks;
        }
      }
      return prev;
    });
  }, [initialBlocks]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermissionBlocked(false);
      return;
    }

    const refreshPermissionState = () => {
      setNotificationPermissionBlocked(Notification.permission === 'denied');
    };

    refreshPermissionState();
    document.addEventListener('visibilitychange', refreshPermissionState);
    window.addEventListener('focus', refreshPermissionState);

    return () => {
      document.removeEventListener('visibilitychange', refreshPermissionState);
      window.removeEventListener('focus', refreshPermissionState);
    };
  }, []);
  const [activeBlock, setActiveBlock] = useState<StudyBlock | null>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<StudyBlock | null>(null);
  const [blockModalDate, setBlockModalDate] = useState<Date>(new Date());
  const [blockModalDefaults, setBlockModalDefaults] = useState({
    startTime: '09:00',
    durationMinutes: 60,
  });
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleStartDate, setScheduleStartDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [rescheduleSourceDate, setRescheduleSourceDate] = useState('');
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSingleBlockId, setRescheduleSingleBlockId] = useState<string | null>(null);
  const [isBacklogModalOpen, setIsBacklogModalOpen] = useState(false);
  const [backlogNotice, setBacklogNotice] = useState('');
  const [backlogAutoState, setBacklogAutoState] = useState<{
    movedCount: number;
    insertedTodayCount: number;
    backlogBefore: number;
    backlogAfter: number;
    suggestedExtraMinutesPerDay: number;
    shouldSuggestReplan: boolean;
    shouldSuggestRecoveryMode: boolean;
    suggestedReduceNewContent: boolean;
  } | null>(null);
  const [dailyLimits, setDailyLimits] = useLocalStorage<Record<string, number>>(
    'nexora_daily_limits',
    {}
  );
  const [userSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);
  const [storedSubjects, setStoredSubjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [analytics, setAnalytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', emptyAnalytics);
  const [lastBacklogAutoRunDay, setLastBacklogAutoRunDay] = useLocalStorage<string>(
    'nexora_backlog_last_auto_run_day',
    ''
  );
  const [sessionBlock, setSessionBlock] = useState<StudyBlock | null>(null);
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [notificationPermissionBlocked, setNotificationPermissionBlocked] = useState(false);
  const autoBacklogRunRef = useRef<string>('');
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const boardContentRef = useRef<HTMLDivElement | null>(null);
  const [boardScrollWidth, setBoardScrollWidth] = useState(0);
  const weekDayKeys: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const weekIndexFromDate = (date: Date) => (date.getDay() + 6) % 7;

  // Obter datas da semana
  const weekDates = useMemo(
    () => getWeekDates(currentWeekStart),
    [currentWeekStart]
  );
  useEffect(() => {
    if (!isMobile) return;
    const today = new Date();
    const todayIndex = weekDates.findIndex((date) => isSameDay(date, today));
    if (todayIndex >= 0) {
      setMobileDayIndex(todayIndex);
    }
  }, [isMobile, weekDates]);

  useEffect(() => {
    if (!isMobile || !selectedScheduleStartDate) return;
    const selectedStart = parseLocalDateKey(selectedScheduleStartDate);
    if (!selectedStart) return;
    const selectedIndex = weekDates.findIndex((date) => isSameDay(date, selectedStart));
    if (selectedIndex >= 0) {
      setMobileDayIndex(selectedIndex);
    }
  }, [isMobile, weekDates, selectedScheduleStartDate]);

  useEffect(() => {
    if (!isMounted) return;
    if (!isScheduleModalOpen && !isRescheduleModalOpen && !isBacklogModalOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isMounted, isScheduleModalOpen, isRescheduleModalOpen, isBacklogModalOpen]);

  const formatDatePt = (date: Date) =>
    date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  const toLocalKey = toLocalDateKey;
  const parseLocalKey = (value: string) => {
    return parseLocalDateKey(value) ?? new Date(Number.NaN);
  };
  const allowSundayBacklog = Boolean(userSettings.allowSundayBacklog);
  const backlogAllowedDays = useMemo(() => {
    if (!allowSundayBacklog) return allowedDays;
    if (allowedDays.length === 0 || allowedDays.includes(0)) return allowedDays;
    return [...allowedDays, 0].sort((a, b) => a - b);
  }, [allowSundayBacklog, allowedDays]);
  const isAllowedBacklogDay = (date: Date) =>
    backlogAllowedDays.length === 0 || backlogAllowedDays.includes(date.getDay());

  useEffect(() => {
    if (!selectedScheduleStartDate) return;
    const selectedStart = parseLocalDateKey(selectedScheduleStartDate);
    if (!selectedStart) return;
    setCurrentWeekStart(getWeekStart(selectedStart));
  }, [selectedScheduleStartDate]);

  useEffect(() => {
    if (!isScheduleModalOpen) return;
    const todayKey = toLocalDateKey(new Date());
    const selectedStart = selectedScheduleStartDate
      ? parseLocalDateKey(selectedScheduleStartDate)
      : null;
    const defaultStart = selectedStart ?? parseLocalDateKey(todayKey) ?? new Date();
    const defaultStartKey = toLocalDateKey(defaultStart);

    let defaultEnd = selectedScheduleEndDate ? parseLocalDateKey(selectedScheduleEndDate) : null;
    if (!defaultEnd || defaultEnd < defaultStart) {
      defaultEnd = new Date(defaultStart);
      defaultEnd.setDate(defaultEnd.getDate() + 6);
    }

    setScheduleStartDate(defaultStartKey);
    setScheduleEndDate(toLocalDateKey(defaultEnd));
    setScheduleError('');
  }, [isScheduleModalOpen, selectedScheduleStartDate, selectedScheduleEndDate]);

  useEffect(() => {
    if (!isRescheduleModalOpen) return;
    if (rescheduleSingleBlockId) {
      setRescheduleError('');
      return;
    }
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const defaultSource = toLocalDateKey(today);
    const defaultTarget = toLocalDateKey(tomorrow);
    setRescheduleSourceDate(defaultSource);
    setRescheduleTargetDate(defaultTarget);
    setRescheduleError('');
  }, [isRescheduleModalOpen, rescheduleSingleBlockId]);

  // Configurar sensores de arrastar
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Agrupar blocos por dia
  const blocksByDay = useMemo(() => {
    const grouped = new Map<string, StudyBlock[]>();
    
    weekDates.forEach((date) => {
      const dateKey = toLocalDateKey(date);
      grouped.set(
        dateKey,
        blocks
          .filter((b) => isSameDay(parseBlockDate(b.date), date))
          .sort(compareDayBlocks)
      );
    });
    
    return grouped;
  }, [blocks, weekDates]);

  const mobileDay = weekDates[mobileDayIndex] ?? weekDates[0];
  const mobileDayKey = mobileDay ? toLocalDateKey(mobileDay) : '';
  const mobileDayBlocks = mobileDayKey ? blocksByDay.get(mobileDayKey) ?? [] : [];
  const mobileStudyMinutes = mobileDayBlocks
    .filter((block) => isPendingStudyBlock(block))
    .reduce((sum, block) => sum + block.durationMinutes, 0);
  const mobileSessions = mobileDayBlocks.filter((block) => isPendingStudyBlock(block)).length;
  const visibleDates = isMobile ? [mobileDay] : weekDates;
  const todayKey = useMemo(() => toLocalDateKey(new Date()), []);

  useEffect(() => {
    const content = boardContentRef.current;
    if (!content || isMobile) {
      setBoardScrollWidth(0);
      return;
    }

    const updateWidth = () => setBoardScrollWidth(content.scrollWidth);
    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(content);
    return () => observer.disconnect();
  }, [isMobile, visibleDates.length, blocks.length]);

  useEffect(() => {
    if (isMobile) return;
    const topScroll = topScrollRef.current;
    const boardScroll = boardScrollRef.current;
    if (!topScroll || !boardScroll) return;

    let lock = false;
    const syncFromTop = () => {
      if (lock) return;
      lock = true;
      boardScroll.scrollLeft = topScroll.scrollLeft;
      lock = false;
    };
    const syncFromBoard = () => {
      if (lock) return;
      lock = true;
      topScroll.scrollLeft = boardScroll.scrollLeft;
      lock = false;
    };

    topScroll.addEventListener('scroll', syncFromTop, { passive: true });
    boardScroll.addEventListener('scroll', syncFromBoard, { passive: true });
    topScroll.scrollLeft = boardScroll.scrollLeft;

    return () => {
      topScroll.removeEventListener('scroll', syncFromTop);
      boardScroll.removeEventListener('scroll', syncFromBoard);
    };
  }, [isMobile, boardScrollWidth]);

  const backlogEntries = useMemo(() => getBacklogEntries(blocks, new Date()), [blocks]);
  const overdueBacklogCount = backlogEntries.filter((entry) => entry.dateKey < todayKey).length;
  const todaysSkippedBacklogCount = backlogEntries.filter((entry) => entry.dateKey === todayKey).length;
  const backlogHigh = backlogEntries.length >= 6;
  const backlogRecoveryCount = backlogEntries.filter(
    (entry) => (entry.block.rescheduleCount || 0) >= 3
  ).length;

  const streakDays = useMemo(() => {
    const completedKeys = new Set(
      blocks
        .filter((block) => !block.isBreak && block.status === 'completed')
        .map((block) =>
          block.completedAt ? toLocalDateKey(new Date(block.completedAt)) : toLocalDateKey(parseBlockDate(block.date))
        )
    );
    if (completedKeys.size === 0) return 0;

    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    const todayCompleted = completedKeys.has(toLocalDateKey(cursor));
    if (!todayCompleted) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (completedKeys.has(toLocalDateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [blocks]);

  // run once per day after opening the planner, avoiding repeated auto-reschedules in the same session/day
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (overdueBacklogCount <= 0) return;
    if (lastBacklogAutoRunDay === todayKey) return;
    if (autoBacklogRunRef.current === todayKey) return;

    autoBacklogRunRef.current = todayKey;
    const result = runAutoBacklogReschedule('startup');
    setLastBacklogAutoRunDay(todayKey);

    if (result.changedBlockIds.length > 0) {
      setBacklogNotice(
        `Pendências detectadas: ${result.backlogBefore}. Replanejamento automático executado (${result.movedCount} movimentados).`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdueBacklogCount, lastBacklogAutoRunDay, todayKey]);

  useEffect(() => {
    if (blocks.length === 0) return;
    const weekHasBlocks = blocks.some((block) =>
      weekDates.some((date) => isSameDay(parseBlockDate(block.date), date))
    );
    if (weekHasBlocks) return;

    const sortedBlocks = [...blocks].sort((a, b) => {
      const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.startTime.localeCompare(b.startTime);
    });
    const firstDate = parseBlockDate(sortedBlocks[0].date);
    const nextWeekStart = getWeekStart(firstDate);
    if (!isSameDay(nextWeekStart, currentWeekStart)) {
      setCurrentWeekStart(nextWeekStart);
    }
  }, [blocks, weekDates, currentWeekStart]);

  const getDailyLimitMinutes = (date: Date) => {
    const key = toLocalKey(date);
    const stored = dailyLimits[key];
    if (typeof stored === 'number') return stored;
    const fallback = defaultDailyLimitsByDate?.[key];
    if (typeof fallback === 'number') return fallback;
    if (dailyHoursByWeekday) {
      const dayKey = weekDayKeys[date.getDay()];
      const hours = dailyHoursByWeekday[dayKey];
      if (typeof hours === 'number') return Math.max(0, Math.round(hours * 60));
    }
    return defaultDailyLimitMinutes;
  };

  const getDayStudyMinutesForCapacity = (dayBlocks: StudyBlock[]) =>
    dayBlocks.reduce(
      (sum, block) => (isCapacityStudyBlock(block) ? sum + block.durationMinutes : sum),
      0
    );

  const getPlannerWindowBounds = () => {
    const start = timeToMinutes(userSettings.preferredStart || '09:00');
    const configuredEnd = timeToMinutes(userSettings.preferredEnd || '18:00');
    const end = Math.max(start + 60, configuredEnd);
    return { start, end };
  };
  const getBreakGapMinutes = () => Math.max(0, Math.round(userSettings.breakMinutes || 0));

  const moveBlocksToNextAllowedDayInternal = (
    sourceDate: Date,
    blocksToMove: StudyBlock[],
    sourceBlocks: StudyBlock[]
  ) => {
    if (blocksToMove.length === 0) return { blocks: sourceBlocks, moved: false };
    const { start: defaultStart, end: defaultEnd } = getPlannerWindowBounds();
    const breakGapMinutes = getBreakGapMinutes();
    const idsToMove = new Set(blocksToMove.map((block) => block.id));
    const baseBlocks = sourceBlocks.filter((block) => !idsToMove.has(block.id));

    const blocksMap = new Map<string, StudyBlock[]>();
    for (const block of baseBlocks) {
      const key = toLocalKey(parseBlockDate(block.date));
      const list = blocksMap.get(key) ?? [];
      list.push(block);
      blocksMap.set(key, list);
    }

    const sortedToMove = [...blocksToMove].sort(compareDayBlocks);
    const sourceBaseDate = new Date(sourceDate);
    sourceBaseDate.setHours(0, 0, 0, 0);

    let cursorDate = new Date(sourceBaseDate);
    cursorDate.setDate(cursorDate.getDate() + 1);
    while (!isAllowedBacklogDay(cursorDate)) {
      cursorDate.setDate(cursorDate.getDate() + 1);
    }

    const movedBlocks: StudyBlock[] = [];
    let hasMutation = false;

    for (const block of sortedToMove) {
      let placed = false;
      let guard = 0;
      while (!placed && guard < 90) {
        const key = toLocalKey(cursorDate);
        const dayBlocks = [...(blocksMap.get(key) ?? [])].sort(compareDayBlocks);
        const dayStudyBlocks = dayBlocks.filter((item) => !item.isBreak);
        const dayLimit = getDailyLimitMinutes(cursorDate);
        const dayStudyMinutes = getDayStudyMinutesForCapacity(dayStudyBlocks);
        const lastStudyEnd = dayStudyBlocks.reduce(
          (max, item) => Math.max(max, timeToMinutes(item.endTime)),
          defaultStart
        );
        const startMinutes =
          dayStudyBlocks.length > 0
            ? Math.max(lastStudyEnd + breakGapMinutes, defaultStart)
            : Math.max(lastStudyEnd, defaultStart);
        const endMinutes = startMinutes + block.durationMinutes;
        const exceedsDailyLimit =
          !block.isBreak && dayLimit > 0 && dayStudyMinutes + block.durationMinutes > dayLimit;

        if (endMinutes <= defaultEnd && !exceedsDailyLimit) {
          const originalDate = block.originalDate ? parseBlockDate(block.originalDate) : parseBlockDate(block.date);
          originalDate.setHours(0, 0, 0, 0);

          const moved: StudyBlock = {
            ...block,
            date: new Date(cursorDate),
            startTime: minutesToTime(startMinutes),
            endTime: minutesToTime(endMinutes),
            status:
              block.isBreak || isLockedScheduleBlock(block) ? block.status : ('rescheduled' as const),
            originalDate: block.isBreak ? block.originalDate : originalDate,
            rescheduleCount:
              block.isBreak || isLockedScheduleBlock(block)
                ? block.rescheduleCount
                : (block.rescheduleCount || 0) + 1,
            updatedAt: new Date(),
          };
          movedBlocks.push(moved);
          dayBlocks.push(moved);
          blocksMap.set(key, dayBlocks);
          placed = true;

          if (
            parseBlockDate(moved.date).getTime() !== parseBlockDate(block.date).getTime() ||
            moved.startTime !== block.startTime ||
            moved.endTime !== block.endTime ||
            moved.status !== block.status
          ) {
            hasMutation = true;
          }
        } else {
          cursorDate.setDate(cursorDate.getDate() + 1);
          while (!isAllowedBacklogDay(cursorDate)) {
            cursorDate.setDate(cursorDate.getDate() + 1);
          }
        }
        guard += 1;
      }

      if (!placed) {
        movedBlocks.push(block);
      }
    }

    const updatedBlocks = sortBlocksChronologically([...baseBlocks, ...movedBlocks]);
    return { blocks: updatedBlocks, moved: hasMutation };
  };

  const moveBlocksToNextAllowedDay = (
    sourceDate: Date,
    blocksToMove: StudyBlock[]
  ) => {
    const result = moveBlocksToNextAllowedDayInternal(sourceDate, blocksToMove, blocks);
    if (!result.moved || areBlocksEquivalent(result.blocks, blocks)) {
      return false;
    }

    setBlocks(result.blocks);
    onBlocksChange(result.blocks);
    return true;
  };

  const pullBlocksToDay = (targetDate: Date, availableStudyMinutes: number) => {
    if (availableStudyMinutes <= 0) return;
    const { start: DEFAULT_START, end: DEFAULT_END } = getPlannerWindowBounds();
    const breakGapMinutes = getBreakGapMinutes();
    const targetKey = toLocalKey(targetDate);

    const existingBlocks = blocks
      .filter((block) => toLocalKey(parseBlockDate(block.date)) === targetKey)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const existingStudyBlocks = existingBlocks.filter((block) => !block.isBreak);
    let cursorMinutes = existingStudyBlocks.reduce(
      (max, block) => Math.max(max, timeToMinutes(block.endTime)),
      DEFAULT_START
    );
    if (existingStudyBlocks.length > 0) {
      cursorMinutes += breakGapMinutes;
    }

    const candidates = blocks
      .filter((block) => {
        const blockDate = parseBlockDate(block.date);
        blockDate.setHours(0, 0, 0, 0);
        return (
          !block.isBreak &&
          blockDate > targetDate &&
          block.status !== 'completed' &&
          block.status !== 'skipped'
        );
      })
      .sort((a, b) => {
        const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return a.startTime.localeCompare(b.startTime);
      });

    if (candidates.length === 0) return;

    let studyMinutesMoved = 0;
    const movedBlocks: StudyBlock[] = [];
    const movedIds = new Set<string>();

    for (let i = 0; i < candidates.length; i++) {
      const block = candidates[i];
      if (studyMinutesMoved + block.durationMinutes > availableStudyMinutes) {
        break;
      }

      const nextEnd = cursorMinutes + block.durationMinutes;
      if (nextEnd > DEFAULT_END) break;

      movedBlocks.push({
        ...block,
        date: new Date(targetDate),
        startTime: minutesToTime(cursorMinutes),
        endTime: minutesToTime(nextEnd),
        status: 'rescheduled' as const,
        originalDate: block.originalDate ? parseBlockDate(block.originalDate) : parseBlockDate(block.date),
        rescheduleCount: (block.rescheduleCount || 0) + 1,
        updatedAt: new Date(),
      });
      movedIds.add(block.id);
      cursorMinutes = nextEnd + breakGapMinutes;
      studyMinutesMoved += block.durationMinutes;
    }

    if (movedBlocks.length === 0) return;

    const movedMap = new Map(movedBlocks.map((block) => [block.id, block]));
    const updatedBlocks = blocks.map((block) => movedMap.get(block.id) ?? block);

    updatedBlocks.sort((a, b) => {
      const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.startTime.localeCompare(b.startTime);
    });

    setBlocks(updatedBlocks);
    onBlocksChange(updatedBlocks);
  };

  const handleAdjustDailyLimit = (date: Date, deltaMinutes: number) => {
    const key = toLocalKey(date);
    const current = getDailyLimitMinutes(date);
    const next = Math.max(0, current + deltaMinutes);
    setDailyLimits((prev) => ({ ...prev, [key]: next }));

    if (next <= 0) return;

    const dayBlocks = blocksByDay.get(key) ?? [];
    const sorted = [...dayBlocks].sort(compareDayBlocks);
    let studyMinutes = 0;
    let keepIndex = -1;

    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i];
      if (isCapacityStudyBlock(block)) {
        if (studyMinutes + block.durationMinutes > next) break;
        studyMinutes += block.durationMinutes;
      }
      keepIndex = i;
    }

    const overflowBlocks = sorted
      .slice(keepIndex + 1)
      .filter((block) => !isLockedScheduleBlock(block) && !block.isBreak);
    if (overflowBlocks.length > 0) {
      moveBlocksToNextAllowedDay(date, overflowBlocks);
    }

    if (deltaMinutes > 0) {
      const availableStudyMinutes = Math.max(0, next - studyMinutes);
      pullBlocksToDay(date, availableStudyMinutes);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (blocks.length === 0) return;

    const dayKeys = Array.from(
      new Set(blocks.map((block) => toLocalKey(parseBlockDate(block.date))))
    ).sort();

    for (const dayKey of dayKeys) {
      const dayDate = parseLocalKey(dayKey);
      if (!dayDate || Number.isNaN(dayDate.getTime())) continue;
      const dailyLimit = getDailyLimitMinutes(dayDate);
      if (dailyLimit <= 0) continue;

      const dayBlocks = blocks
        .filter((block) => toLocalKey(parseBlockDate(block.date)) === dayKey)
        .sort(compareDayBlocks);
      const activeStudyMinutes = getDayStudyMinutesForCapacity(dayBlocks);
      if (activeStudyMinutes <= dailyLimit) continue;

      let studyMinutes = 0;
      let keepIndex = -1;
      for (let i = 0; i < dayBlocks.length; i += 1) {
        const block = dayBlocks[i];
        if (isCapacityStudyBlock(block)) {
          if (studyMinutes + block.durationMinutes > dailyLimit) break;
          studyMinutes += block.durationMinutes;
        }
        keepIndex = i;
      }

      const overflowBlocks = dayBlocks
        .slice(keepIndex + 1)
        .filter((block) => !isLockedScheduleBlock(block) && !block.isBreak);
      if (overflowBlocks.length === 0) continue;

      const moved = moveBlocksToNextAllowedDay(dayDate, overflowBlocks);
      if (moved) return;
    }
  }, [
    backlogAllowedDays,
    blocks,
    dailyHoursByWeekday,
    dailyLimits,
    defaultDailyLimitMinutes,
    defaultDailyLimitsByDate,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const buildDailyLimitMapForBacklog = (start: Date, days = 14) => {
    const map: Record<string, number> = {};
    for (let i = 0; i <= days; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      date.setHours(0, 0, 0, 0);
      map[toLocalKey(date)] = getDailyLimitMinutes(date);
    }
    return map;
  };

  const commitBlocksUpdate = (nextBlocks: StudyBlock[]) => {
    const ordered = sortBlocksChronologically(nextBlocks);
    setBlocks(ordered);
    onBlocksChange(ordered);
  };

  const runAutoBacklogReschedule = (reason: 'startup' | 'manual' | 'skip') => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const result = autoRescheduleBacklog({
      blocks,
      today: now,
      dailyLimitByDate: buildDailyLimitMapForBacklog(now, 14),
      allowedDays: backlogAllowedDays,
      breakMinutes: userSettings.breakMinutes,
      backlogQuotaRatio: 0.35,
      lookaheadDays: 14,
      maxBacklogSubjectsPerDay: 2,
    });

    if (result.changedBlockIds.length > 0) {
      commitBlocksUpdate(result.blocks);
    }

    setBacklogAutoState({
      movedCount: result.movedCount,
      insertedTodayCount: result.insertedTodayCount,
      backlogBefore: result.backlogBefore,
      backlogAfter: result.backlogAfter,
      suggestedExtraMinutesPerDay: result.suggestion.suggestedExtraMinutesPerDay,
      shouldSuggestReplan: result.suggestion.shouldSuggestReplan,
      shouldSuggestRecoveryMode: result.suggestion.shouldSuggestRecoveryMode,
      suggestedReduceNewContent: result.suggestion.suggestedReduceNewContent,
    });

    if (reason !== 'startup') {
      if (result.changedBlockIds.length > 0) {
        setBacklogNotice(
          `Replanejado: ${result.movedCount} bloco(s), ${result.insertedTodayCount} inserido(s) hoje.`
        );
      } else if (result.backlogBefore > 0) {
        setBacklogNotice(
          'Sem capacidade suficiente hoje para backlog. Mantido para próximos dias com sugestão de replanejamento.'
        );
      } else {
        setBacklogNotice('Sem pendências acumuladas para replanejar.');
      }
    }

    return result;
  };

  const handleMarkBlockDoneQuick = (block: StudyBlock) => {
    handleCompleteBlock(block.id);
  };

  const handleSkipBlockToday = (block: StudyBlock) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const blockDate = parseBlockDate(block.date);
    blockDate.setHours(0, 0, 0, 0);

    const nextBlocks = blocks.map((item) => {
      if (item.id !== block.id) return item;
      return {
        ...item,
        status: 'skipped' as const,
        originalDate: item.originalDate ? parseBlockDate(item.originalDate) : parseBlockDate(item.date),
        updatedAt: new Date(),
      };
    });
    commitBlocksUpdate(nextBlocks);

    if (blockDate.getTime() <= today.getTime()) {
      // Replaneja parte automaticamente para evitar "agenda perdida".
      setTimeout(() => {
        runAutoBacklogReschedule('skip');
      }, 0);
    }
  };

  const handleRequestQuickReschedule = (block: StudyBlock) => {
    const sourceDate = parseBlockDate(block.date);
    sourceDate.setHours(0, 0, 0, 0);
    const tomorrow = new Date(sourceDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRescheduleSingleBlockId(block.id);
    setRescheduleSourceDate(toLocalKey(sourceDate));
    setRescheduleTargetDate(toLocalKey(tomorrow));
    setRescheduleError('');
    setIsRescheduleModalOpen(true);
  };

  const moveSingleBlockToDate = (blockId: string, targetDate: Date) => {
    const block = blocks.find((item) => item.id === blockId);
    if (!block) return false;
    if (block.isBreak) return false;
    if (!isAllowedBacklogDay(targetDate)) return false;

    const targetKey = toLocalKey(targetDate);
    const targetDayBlocks = blocks
      .filter((item) => toLocalKey(parseBlockDate(item.date)) === targetKey && item.id !== blockId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const targetStudyBlocks = targetDayBlocks.filter((item) => !item.isBreak);
    const targetStudyMinutes = targetStudyBlocks
      .filter((item) => isCapacityStudyBlock(item))
      .reduce((sum, item) => sum + item.durationMinutes, 0);
    const targetLimit = getDailyLimitMinutes(targetDate);
    if (targetLimit > 0 && targetStudyMinutes + block.durationMinutes > targetLimit) return false;

    const breakGapMinutes = getBreakGapMinutes();
    const lastEndMinutes = targetStudyBlocks.reduce(
      (max, item) => Math.max(max, timeToMinutes(item.endTime)),
      timeToMinutes('09:00')
    );
    const startMinutes =
      targetStudyBlocks.length > 0 ? lastEndMinutes + breakGapMinutes : lastEndMinutes;
    const endMinutes = startMinutes + block.durationMinutes;
    if (endMinutes > 24 * 60) return false;

    const nextBlocks = blocks.map((item) => {
      if (item.id !== blockId) return item;
      return {
        ...item,
        date: new Date(targetDate),
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(endMinutes),
        status: 'rescheduled' as const,
        originalDate: item.originalDate ? parseBlockDate(item.originalDate) : parseBlockDate(item.date),
        rescheduleCount: (item.rescheduleCount || 0) + 1,
        updatedAt: new Date(),
      };
    });
    commitBlocksUpdate(nextBlocks);
    return true;
  };

  // Navegação
  const goToPreviousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    setCurrentWeekStart(getWeekStart(today));
    if (isMobile) {
      setMobileDayIndex(weekIndexFromDate(today));
    }
  };

  const goToPreviousDay = () => {
    if (!isMobile) {
      goToPreviousWeek();
      return;
    }
    setMobileDayIndex((prev) => {
      if (prev > 0) return prev - 1;
      const newStart = new Date(currentWeekStart);
      newStart.setDate(newStart.getDate() - 7);
      setCurrentWeekStart(newStart);
      return 6;
    });
  };

  const goToNextDay = () => {
    if (!isMobile) {
      goToNextWeek();
      return;
    }
    setMobileDayIndex((prev) => {
      if (prev < 6) return prev + 1;
      const newStart = new Date(currentWeekStart);
      newStart.setDate(newStart.getDate() + 7);
      setCurrentWeekStart(newStart);
      return 0;
    });
  };

  // Handlers de arrastar
  const handleDragStart = (event: DragStartEvent) => {
    const block = blocks.find((b) => b.id === event.active.id);
    if (block) {
      setActiveBlock(block);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBlock(null);

    if (!over) return;

    // Reordenar dentro do mesmo dia
    if (active.id !== over.id) {
      const activeBlock = blocks.find((b) => b.id === active.id);
      const overBlock = blocks.find((b) => b.id === over.id);

      if (activeBlock && overBlock) {
        const activeDate = parseBlockDate(activeBlock.date);
        const overDate = parseBlockDate(overBlock.date);
        if (!isSameDay(activeDate, overDate)) return;

        const dayBlocks = blocks
          .filter((block) => isSameDay(parseBlockDate(block.date), activeDate))
          .sort(compareDayBlocks);

        const oldIndex = dayBlocks.findIndex((block) => block.id === activeBlock.id);
        const newIndex = dayBlocks.findIndex((block) => block.id === overBlock.id);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

        const reorderedDayBlocks = arrayMove(dayBlocks, oldIndex, newIndex).map((block, index) => {
          const nextSequence = index + 1;
          if (block.sequenceIndex === nextSequence) return block;
          return {
            ...block,
            sequenceIndex: nextSequence,
            updatedAt: new Date(),
          };
        });

        const reorderedMap = new Map(reorderedDayBlocks.map((block) => [block.id, block]));
        const newBlocks = blocks.map((block) => reorderedMap.get(block.id) ?? block);

        setBlocks(newBlocks);
        onBlocksChange(newBlocks);
      }
    }
  };

  // Handlers de blocos
  const handleAddBlock = (date: Date) => {
    const dayBlocks = blocks
      .filter((b) => isSameDay(parseBlockDate(b.date), date))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const defaultDurationMinutes = 60;
    const fallbackStartMinutes = 9 * 60;
    const lastEndTime = dayBlocks[dayBlocks.length - 1]?.endTime;
    let startMinutes = lastEndTime
      ? timeToMinutes(lastEndTime)
      : fallbackStartMinutes;

    if (startMinutes + defaultDurationMinutes > 24 * 60) {
      startMinutes = fallbackStartMinutes;
    }

    setBlockModalDefaults({
      startTime: minutesToTime(startMinutes),
      durationMinutes: defaultDurationMinutes,
    });
    setEditingBlock(null);
    setBlockModalDate(date);
    setIsBlockModalOpen(true);
  };

  const handleEditBlock = (block: StudyBlock) => {
    setEditingBlock(block);
    setBlockModalDate(parseBlockDate(block.date));
    setIsBlockModalOpen(true);
  };

  const handleDeleteBlock = (blockId: string) => {
    const newBlocks = blocks.filter((b) => b.id !== blockId);
    setBlocks(newBlocks);
    onBlocksChange(newBlocks);
  };

  const handleStartBlock = (block: StudyBlock) => {
    setSessionBlock(block);
    setIsSessionOpen(true);
  };

  const handleCompleteBlock = (
    blockId: string,
    minutesSpent?: number,
    performance?: { correctAnswers?: number; totalQuestions?: number }
  ) => {
    const completedBlock = blocks.find((block) => block.id === blockId);
    if (!completedBlock || completedBlock.status === 'completed') return;
    const hasExplicitMinutes =
      typeof minutesSpent === 'number' && Number.isFinite(minutesSpent);
    const effectiveMinutes = hasExplicitMinutes
      ? Math.max(1, minutesSpent)
      : completedBlock.durationMinutes;
    const hours = effectiveMinutes / 60;

    setBlocks((prev) => {
      const next = prev.map((block) =>
        block.id === blockId
          ? {
              ...block,
              status: 'completed' as const,
              completedAt: new Date(),
              updatedAt: new Date(),
            }
          : block
      );
      onBlocksChange(next);
      return next;
    });

    if (!completedBlock.isBreak && completedBlock.subjectId) {
      const targetSubject =
        subjects.find((subject) => subject.id === completedBlock.subjectId) ??
        storedSubjects.find((subject) => subject.id === completedBlock.subjectId);

      if (targetSubject) {
        const metricsUpdate = applyBlockCompletionMetrics({
          analytics,
          block: completedBlock,
          subject: targetSubject,
          minutesSpent: effectiveMinutes,
          correctAnswers: performance?.correctAnswers,
          totalQuestions: performance?.totalQuestions,
        });

        setStoredSubjects((prev) =>
          prev.map((subject) =>
            subject.id === completedBlock.subjectId
              ? {
                  ...subject,
                  completedHours: Number((subject.completedHours + hours).toFixed(4)),
                  totalHours: Number((subject.totalHours + hours).toFixed(4)),
                  sessionsCount: subject.sessionsCount + 1,
                  averageScore:
                    metricsUpdate?.subjectRollingAccuracy !== undefined
                      ? Math.round(metricsUpdate.subjectRollingAccuracy * 100)
                      : subject.averageScore,
                }
              : subject
          )
        );

        setAnalytics(metricsUpdate.analytics);
      } else {
        const dateKey = toLocalDateKey(parseBlockDate(completedBlock.date));
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
    }

    if (!completedBlock.isBreak) {
      const sameDayBreaks = blocks
        .filter(
          (block) =>
            block.isBreak &&
            block.status !== 'completed' &&
            isSameDay(parseBlockDate(block.date), parseBlockDate(completedBlock.date))
        )
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      const nextBreak = sameDayBreaks.find(
        (block) => timeToMinutes(block.startTime) >= timeToMinutes(completedBlock.endTime)
      );

      if (nextBreak) {
        setTimeout(() => {
          setSessionBlock(nextBreak);
          setIsSessionOpen(true);
        }, 450);
      }
    }
  };
  const handleSaveBlock = (data: BlockFormData) => {
    const endTime = minutesToTime(
      timeToMinutes(data.startTime) + data.durationMinutes
    );
    const blockType = data.isBreak ? undefined : data.type || 'AULA';
    const sessionType =
      blockType === 'AULA'
        ? 'teoria'
        : blockType === 'EXERCICIOS'
        ? 'pratica'
        : blockType === 'REVISAO'
        ? 'revisao'
        : blockType === 'SIMULADO_AREA' || blockType === 'SIMULADO_COMPLETO'
        ? 'simulado'
        : undefined;

    const fallbackSubject: Subject = {
      id: 'default',
      userId: 'user1',
      name: 'Sessão Livre',
      color: '#00B4FF',
      icon: 'book',
      priority: 5,
      difficulty: 5,
      targetHours: 0,
      completedHours: 0,
      totalHours: 0,
      sessionsCount: 0,
      averageScore: 0,
      proficiencyScore: 0,
      examWeight: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const subject =
      data.isBreak || !data.subjectId
        ? undefined
        : subjects.find((s) => s.id === data.subjectId) ||
          editingBlock?.subject ||
          fallbackSubject;

    if (editingBlock) {
      const updatedBlock: StudyBlock = {
        ...editingBlock,
        date: data.date,
        startTime: data.startTime,
        endTime,
        durationMinutes: data.durationMinutes,
        isBreak: data.isBreak,
        subjectId: data.isBreak ? 'break' : subject?.id || 'default',
        subject,
        type: blockType,
        sessionType,
        originalDate: editingBlock.originalDate ? parseBlockDate(editingBlock.originalDate) : editingBlock.originalDate,
        completedAt: editingBlock.completedAt ? new Date(editingBlock.completedAt) : editingBlock.completedAt,
        rescheduleCount: editingBlock.rescheduleCount || 0,
        updatedAt: new Date(),
      };
      const newBlocks = blocks.map((b) =>
        b.id === editingBlock.id ? updatedBlock : b
      );
      setBlocks(newBlocks);
      onBlocksChange(newBlocks);
    } else {
      const newBlock: StudyBlock = {
        id: generateId(),
        userId: 'user1',
        subjectId: data.isBreak ? 'break' : subject?.id || 'default',
        subject,
        date: data.date,
        startTime: data.startTime,
        endTime,
        durationMinutes: data.durationMinutes,
        type: blockType,
        sessionType,
        status: 'scheduled' as const,
        isBreak: data.isBreak,
        isAutoGenerated: false,
        originalDate: data.isBreak ? undefined : parseBlockDate(data.date),
        completedAt: undefined,
        rescheduleCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const newBlocks = [...blocks, newBlock];
      setBlocks(newBlocks);
      onBlocksChange(newBlocks);
    }

    setIsBlockModalOpen(false);
    setEditingBlock(null);
  };

  // Verificar se está visualizando a semana atual
  const isCurrentWeek = isSameDay(currentWeekStart, getWeekStart());
  const isViewingToday = isMobile && mobileDay ? isSameDay(mobileDay, new Date()) : false;
  const plannedStudyBlocks = useMemo(
    () => blocks.filter((block) => isPendingStudyBlock(block)),
    [blocks]
  );
  const plannedStudyMinutes = useMemo(
    () => plannedStudyBlocks.reduce((sum, block) => sum + block.durationMinutes, 0),
    [plannedStudyBlocks]
  );

  return (
    <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-full flex-col">
      {/* Cabeçalho */}
      <Card
        className="mb-4 border-white/10 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(0,180,255,0.16),rgba(9,12,22,0.95)_45%,rgba(9,12,22,0.92)_100%)] shadow-[0_20px_45px_rgba(0,0,0,0.28)]"
        padding="md"
        hover={false}
      >
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-heading font-bold text-white sm:text-[2rem]">
            Agenda Inteligente
          </h1>
          <p className="mt-1 text-sm text-text-secondary sm:text-base">
            Otimização de cronograma de estudos com IA.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-neon-cyan/35 bg-neon-cyan/10 px-2.5 py-1 text-neon-cyan">
              {plannedStudyBlocks.length} blocos ativos
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-white">
              {formatDuration(plannedStudyMinutes)} planejadas
            </span>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {/* Botão de Gerar Agenda */}
          <Button
            variant="primary"
            onClick={() => setIsScheduleModalOpen(true)}
            loading={isGenerating}
            leftIcon={<Sparkles className="w-4 h-4" />}
            className="w-full sm:w-auto"
           
          >
            Gerar Agenda
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRescheduleSingleBlockId(null);
              setIsRescheduleModalOpen(true);
            }}
            leftIcon={<ArrowRightLeft className="w-4 h-4" />}
            className="w-full sm:w-auto"
           
          >
            Reagendar pendências
          </Button>
        </div>
        </div>
      </Card>

      <Card
        className="mb-4 border-amber-300/20 bg-[linear-gradient(165deg,rgba(46,30,18,0.52),rgba(22,25,35,0.96)_45%,rgba(14,18,27,0.96))] shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
        padding="sm"
        hover={false}
      >
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
              <ListTodo className="h-4 w-4" />
              Pendências acumuladas: {backlogEntries.length}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs text-orange-100">
              <Flame className="h-4 w-4" />
              Streak: {streakDays} dia(s)
            </div>
            <span className="text-xs text-text-secondary">
              Vencidas: {overdueBacklogCount} | Puladas hoje: {todaysSkippedBacklogCount}
            </span>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsBacklogModalOpen(true)}
              leftIcon={<ListTodo className="h-4 w-4" />}
              className="w-full sm:w-auto"
            >
              Backlog
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runAutoBacklogReschedule('manual')}
              className="w-full sm:w-auto"
            >
              Replanejar automaticamente
            </Button>
          </div>
        </div>

        {(backlogHigh || backlogRecoveryCount > 0 || backlogAutoState?.shouldSuggestReplan) && (
          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p>Backlog alto: o sistema distribui pendências sem passar de 30-40% da capacidade diária.</p>
                {(backlogAutoState?.shouldSuggestRecoveryMode || backlogRecoveryCount > 0) && (
                  <p className="mt-1">Plano de recuperação sugerido: reduzir conteúdo novo temporariamente e priorizar revisão/exercícios.</p>
                )}
                {!!backlogAutoState?.suggestedExtraMinutesPerDay && (
                  <p className="mt-1">Sugestão: adicionar ~{backlogAutoState?.suggestedExtraMinutesPerDay} min/dia para limpar backlog.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {backlogNotice && <p className="mt-2 text-xs text-text-secondary">{backlogNotice}</p>}

        {userSettings.notificationsEnabled && notificationPermissionBlocked && (
          <div className="mt-3 rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-xs text-orange-100">
            <div className="flex items-start gap-2">
              <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-orange-200" />
              <p>
                Permissão de notificação bloqueada no navegador. Reative para receber alertas dos
                blocos no horário correto.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Navegação da Semana */}
      <Card
        className="mb-5 border-white/10 bg-[linear-gradient(170deg,rgba(12,17,31,0.92),rgba(16,23,37,0.9))] shadow-[0_14px_30px_rgba(0,0,0,0.25)]"
        padding="sm"
        hover={false}
      >
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={isMobile ? goToPreviousDay : goToPreviousWeek}
              className="shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <span
              className="min-w-0 flex-1 px-1 text-center text-sm font-heading font-bold leading-tight text-white sm:px-2 md:flex-none md:px-4 md:text-lg"
              title={
                isMobile
                  ? formatDatePt(mobileDay)
                  : `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`
              }
            >
              {isMobile
                ? formatDatePt(mobileDay)
                : `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={isMobile ? goToNextDay : goToNextWeek}
              className="shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {!isMobile && !isCurrentWeek && (
            <Button
              variant="secondary"
              size="sm"
              onClick={goToCurrentWeek}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              className="w-full md:w-auto"
            >
              Semana Atual
            </Button>
          )}

          {isMobile && !isViewingToday && (
            <Button
              variant="secondary"
              size="sm"
              onClick={goToCurrentWeek}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              className="w-full md:w-auto"
            >
              Hoje
            </Button>
          )}

          {/* Estatisticas da Semana */}
          {!isMobile && (
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm md:justify-end md:gap-6">
              <div>
                <span className="text-text-secondary">Total de Horas: </span>
                <span className="font-bold text-white">
                  {formatDuration(plannedStudyMinutes)}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Sessoes: </span>
                <span className="font-bold text-white">
                  {plannedStudyBlocks.length}
                </span>
              </div>
            </div>
          )}
        </div>
        {isMobile && (
          <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-text-secondary">
            <span>
              Total: {formatDuration(mobileStudyMinutes)}
            </span>
            <span>{mobileSessions} sessões</span>
          </div>
        )}
      </Card>

      {/* Grade do Planner */}
      <div className="flex-1 min-w-0 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,13,24,0.9),rgba(5,9,18,0.96))] p-2 shadow-[0_18px_36px_rgba(0,0,0,0.28)] sm:p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {!isMobile && (
            <div className="mb-2 rounded-xl border border-white/10 bg-[#0f1524]/80 px-2 py-1">
              <div ref={topScrollRef} className="h-2 overflow-x-auto overflow-y-hidden rounded-full">
                <div className="h-1 w-px" style={{ width: `${Math.max(boardScrollWidth, 1)}px` }} />
              </div>
            </div>
          )}
          <div
            ref={boardScrollRef}
            className="overflow-x-auto overflow-y-hidden pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div
              ref={boardContentRef}
              className={
                isMobile
                  ? 'flex min-w-0 flex-col gap-3 pb-6 sm:gap-4 sm:pb-8'
                  : 'flex min-w-max flex-row items-start gap-4 pb-6 pr-2'
              }
            >
              {visibleDates.map((date) => {
                const dateKey = toLocalDateKey(date);
                const dayBlocks = blocksByDay.get(dateKey) || [];

                return (
                  <DayColumn
                    key={dateKey}
                    date={date}
                    blocks={dayBlocks}
                    dailyLimitMinutes={getDailyLimitMinutes(date)}
                    onAdjustDailyLimit={handleAdjustDailyLimit}
                    onAddBlock={handleAddBlock}
                    onEditBlock={handleEditBlock}
                    onDeleteBlock={handleDeleteBlock}
                    onStartBlock={handleStartBlock}
                    onMarkBlockDone={handleMarkBlockDoneQuick}
                    onSkipBlockToday={handleSkipBlockToday}
                    onQuickRescheduleBlock={handleRequestQuickReschedule}
                    notificationsEnabled={userSettings.notificationsEnabled}
                    notificationMinutesBefore={userSettings.notificationMinutesBefore}
                  />
                );
              })}
            </div>
          </div>

          {/* Overlay de Arrastar */}
          <DragOverlay>
            {activeBlock && (
              <TimeBlock block={activeBlock} isDragging />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <BlockFormModal
        isOpen={isBlockModalOpen}
        onClose={() => {
          setIsBlockModalOpen(false);
          setEditingBlock(null);
        }}
        onSave={handleSaveBlock}
        subjects={subjects}
        date={blockModalDate}
        block={editingBlock}
        defaultStartTime={blockModalDefaults.startTime}
        defaultDurationMinutes={blockModalDefaults.durationMinutes}
      />

      <StudyBlockSessionModal
        isOpen={isSessionOpen}
        block={sessionBlock}
        onClose={() => setIsSessionOpen(false)}
        onComplete={(blockId, minutesSpent, performance) => {
          handleCompleteBlock(blockId, minutesSpent ?? undefined, performance);
        }}
      />

      {isMounted &&
        isScheduleModalOpen &&
        createPortal(
          <div className="app-modal-overlay">
            <div className="app-modal-panel max-w-[340px] sm:max-w-md">
              <Card className="relative" padding="sm">
              <h2 className="mb-1.5 text-lg font-heading font-bold text-white sm:mb-2 sm:text-xl">
                Definir período do cronograma
              </h2>
              <p className="mb-3 text-xs text-text-secondary sm:mb-4 sm:text-sm">
                Informe até quando a agenda deve ir.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary sm:mb-2 sm:text-sm">
                    Início
                  </label>
                  <input
                    type="date"
                    className="input-field h-10 min-h-0 py-2 text-sm"
                    min={scheduleStartDate || toLocalKey(new Date())}
                    value={scheduleStartDate}
                    onChange={(e) => setScheduleStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary sm:mb-2 sm:text-sm">
                    Data final
                  </label>
                  <input
                    type="date"
                    className="input-field h-10 min-h-0 py-2 text-sm"
                    min={toLocalKey(new Date())}
                    value={scheduleEndDate}
                    onChange={(e) => setScheduleEndDate(e.target.value)}
                  />
                </div>
                {scheduleError && <p className="text-xs text-red-400 sm:text-sm">{scheduleError}</p>}
              </div>

              <div className="flex flex-col gap-2 pt-4 sm:flex-row">
                <Button
                  variant="secondary"
                  className="h-10 min-h-0 flex-1 text-sm"
                  onClick={() => setIsScheduleModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="h-10 min-h-0 flex-1 text-sm"
                  onClick={() => {
                    if (!scheduleStartDate) {
                      setScheduleError('Selecione a data de início.');
                      return;
                    }
                    if (!scheduleEndDate) {
                      setScheduleError('Selecione a data final.');
                      return;
                    }
                    const startDate = parseLocalKey(scheduleStartDate);
                    const endDate = parseLocalKey(scheduleEndDate);
                    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
                      setScheduleError('Informe datas válidas para gerar a agenda.');
                      return;
                    }
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(0, 0, 0, 0);
                    if (endDate < startDate) {
                      setScheduleError('A data final deve ser após o início.');
                      return;
                    }
                    setIsScheduleModalOpen(false);
                    onGenerateSchedule({ startDate, endDate });
                  }}
                >
                  Gerar
                </Button>
              </div>
              </Card>
            </div>
          </div>,
          document.body
        )}

      {isMounted &&
        isRescheduleModalOpen &&
        createPortal(
          <div className="app-modal-overlay">
            <div className="app-modal-panel">
              <Card className="relative" padding="lg">
              <h2 className="text-xl font-heading font-bold text-white mb-2">
                {rescheduleSingleBlockId ? 'Reagendar bloco' : 'Reagendar pendências'}
              </h2>
              <p className="text-sm text-text-secondary mb-4">
                {rescheduleSingleBlockId
                  ? 'Escolha um novo dia para este bloco.'
                  : 'Mova blocos não concluídos de um dia para outro.'}
              </p>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-card-border px-3 py-2 text-xs text-text-secondary hover:border-neon-blue/40 hover:text-white"
                    onClick={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      setRescheduleTargetDate(toLocalKey(tomorrow));
                    }}
                  >
                    Amanhã
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-card-border px-3 py-2 text-xs text-text-secondary hover:border-neon-blue/40 hover:text-white"
                    onClick={() => {
                      const endOfWeek = new Date();
                      const diff = 6 - endOfWeek.getDay();
                      endOfWeek.setDate(endOfWeek.getDate() + Math.max(1, diff));
                      setRescheduleTargetDate(toLocalKey(endOfWeek));
                    }}
                  >
                    Ainda esta semana
                  </button>
                </div>

                {!rescheduleSingleBlockId && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Dia de origem
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={rescheduleSourceDate}
                    onChange={(e) => setRescheduleSourceDate(e.target.value)}
                  />
                </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Dia de destino
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={rescheduleTargetDate}
                    onChange={(e) => setRescheduleTargetDate(e.target.value)}
                  />
                </div>
                {rescheduleError && (
                  <p className="text-sm text-red-400">{rescheduleError}</p>
                )}
              </div>

              <div className="flex flex-col gap-3 pt-6 sm:flex-row">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setIsRescheduleModalOpen(false);
                    setRescheduleSingleBlockId(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    if (!rescheduleTargetDate) {
                      setRescheduleError('Selecione o dia de destino.');
                      return;
                    }

                    if (!rescheduleSingleBlockId && !rescheduleSourceDate) {
                      setRescheduleError('Selecione o dia de origem.');
                      return;
                    }

                    if (!rescheduleSingleBlockId && rescheduleSourceDate === rescheduleTargetDate) {
                      setRescheduleError('Escolha dias diferentes.');
                      return;
                    }
                    const targetDate = parseLocalKey(rescheduleTargetDate);
                    targetDate.setHours(0, 0, 0, 0);
                    if (Number.isNaN(targetDate.getTime())) {
                      setRescheduleError('Escolha um destino válido.');
                      return;
                    }

                    if (!isAllowedBacklogDay(targetDate)) {
                      setRescheduleError(
                        'Dia de destino indisponível. Ative domingo para pendências em Config.'
                      );
                      return;
                    }

                    if (rescheduleSingleBlockId) {
                      const ok = moveSingleBlockToDate(rescheduleSingleBlockId, targetDate);
                      if (!ok) {
                        setRescheduleError('Não foi possível reagendar este bloco para o dia escolhido.');
                        return;
                      }
                      setIsRescheduleModalOpen(false);
                      setRescheduleSingleBlockId(null);
                      setBacklogNotice('Bloco reagendado com sucesso.');
                      return;
                    }

                    const sourceDate = parseLocalKey(rescheduleSourceDate);
                    sourceDate.setHours(0, 0, 0, 0);

                    const sourceKey = toLocalKey(sourceDate);
                    const targetKey = toLocalKey(targetDate);

                    const sourceBlocks = blocks
                      .filter((block) => toLocalKey(parseBlockDate(block.date)) === sourceKey)
                      .filter((block) => !block.isBreak && !isLockedScheduleBlock(block));

                    if (sourceBlocks.length === 0) {
                      setRescheduleError('Não há blocos pendentes no dia selecionado.');
                      return;
                    }

                    const targetBlocks = blocks.filter(
                      (block) => toLocalKey(parseBlockDate(block.date)) === targetKey
                    );
                    const targetStudyBlocks = targetBlocks.filter((block) => !block.isBreak);
                    const targetLimit = getDailyLimitMinutes(targetDate);
                    const lastEndMinutes = targetStudyBlocks.reduce((max, block) => {
                      const endMinutes = timeToMinutes(block.endTime);
                      return Math.max(max, endMinutes);
                    }, timeToMinutes('09:00'));
                    const existingTargetStudyMinutes = targetStudyBlocks
                      .filter((block) => isCapacityStudyBlock(block))
                      .reduce((sum, block) => sum + block.durationMinutes, 0);
                    const breakGapMinutes = getBreakGapMinutes();

                    let cursorMinutes =
                      targetStudyBlocks.length > 0 ? lastEndMinutes + breakGapMinutes : lastEndMinutes;
                    let movedStudyMinutes = 0;
                    const movedBlocks: StudyBlock[] = [];

                    const orderedSourceBlocks = [...sourceBlocks].sort((a, b) =>
                      a.startTime.localeCompare(b.startTime)
                    );

                    for (const block of orderedSourceBlocks) {
                      const additionalStudyMinutes = isCapacityStudyBlock(block) ? block.durationMinutes : 0;
                      if (
                        targetLimit > 0 &&
                        existingTargetStudyMinutes + movedStudyMinutes + additionalStudyMinutes > targetLimit
                      ) {
                        setRescheduleError(
                          'Não há capacidade suficiente no dia de destino.'
                        );
                        return;
                      }

                      const nextEnd = cursorMinutes + block.durationMinutes;
                      if (nextEnd > 24 * 60) {
                        setRescheduleError(
                          'Não há espaço suficiente no dia de destino.'
                        );
                        return;
                      }

                      movedBlocks.push({
                        ...block,
                        date: new Date(targetDate),
                        startTime: minutesToTime(cursorMinutes),
                        endTime: minutesToTime(nextEnd),
                        status: block.isBreak ? block.status : 'rescheduled',
                        originalDate: block.originalDate ? parseBlockDate(block.originalDate) : parseBlockDate(block.date),
                        rescheduleCount: block.isBreak ? block.rescheduleCount : (block.rescheduleCount || 0) + 1,
                        updatedAt: new Date(),
                      });
                      cursorMinutes = nextEnd + breakGapMinutes;
                      movedStudyMinutes += additionalStudyMinutes;
                    }

                    const movedById = new Map(movedBlocks.map((block) => [block.id, block]));
                    const updatedBlocks = blocks.map((block) => movedById.get(block.id) ?? block);

                    updatedBlocks.sort((a, b) => {
                      const dateDiff = parseBlockDate(a.date).getTime() - parseBlockDate(b.date).getTime();
                      if (dateDiff !== 0) return dateDiff;
                      return a.startTime.localeCompare(b.startTime);
                    });

                    setBlocks(updatedBlocks);
                    onBlocksChange(updatedBlocks);
                    setIsRescheduleModalOpen(false);
                    setRescheduleSingleBlockId(null);
                  }}
                >
                  Reagendar
                </Button>
              </div>
              </Card>
            </div>
          </div>,
          document.body
        )}

      {isMounted &&
        isBacklogModalOpen &&
        createPortal(
          <div className="app-modal-overlay">
            <div className="app-modal-panel">
              <Card className="relative" padding="lg">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-heading font-bold text-white">Backlog</h2>
                    <p className="text-sm text-text-secondary">
                      Pendências acumuladas (não concluídas) com prioridade de replanejamento.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsBacklogModalOpen(false)}>
                    Fechar
                  </Button>
                </div>

                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => {
                      runAutoBacklogReschedule('manual');
                    }}
                  >
                    Replanejar automaticamente
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setIsBacklogModalOpen(false);
                      setIsRescheduleModalOpen(true);
                      setRescheduleSingleBlockId(null);
                    }}
                  >
                    Reagendar manualmente
                  </Button>
                </div>

                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {backlogEntries.length === 0 ? (
                    <div className="rounded-xl border border-card-border bg-card-bg/40 p-4 text-sm text-text-secondary">
                      Sem pendências acumuladas.
                    </div>
                  ) : (
                    backlogEntries.map((entry) => {
                      const block = entry.block;
                      const blockDate = parseBlockDate(block.date);
                      const isOverdue = entry.dateKey < todayKey;
                      return (
                        <div
                          key={block.id}
                          className="rounded-xl border border-card-border bg-card-bg/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">
                                {getStudyBlockDisplayTitle(block)}
                              </p>
                              <p className="mt-1 text-xs text-text-secondary">
                                {blockDate.toLocaleDateString('pt-BR')} · {block.startTime} · {block.durationMinutes} min
                              </p>
                              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-text-muted">
                                <span>Status: {block.status === 'completed' ? 'Concluído' : block.status === 'rescheduled' ? 'Reagendado' : block.status === 'skipped' ? 'Pulado' : 'Pendente'}</span>
                                <span>Prioridade: {Math.round(entry.priorityScore)}</span>
                                <span>Reagendamentos: {block.rescheduleCount || 0}</span>
                                {isOverdue && <span className="text-red-300">Vencido há {entry.daysOverdue} dia(s)</span>}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRequestQuickReschedule(block)}
                              >
                                Reagendar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkBlockDoneQuick(block)}
                              >
                                Concluir
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}




