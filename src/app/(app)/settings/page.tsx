'use client';

/**
 * Settings Page
 * Perfil do usuário, preferências de estudo e parâmetros da IA
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';
import {
  User,
  Clock,
  Brain,
  Bell,
  Shield,
  LibraryBig,
  AlertTriangle,
  Save,
  RefreshCw,
  LogOut,
  Trash2,
  RotateCcw,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Moon,
  Palette,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import TimePickerField from '@/components/settings/TimePickerField';
import SystemNotificationsCard from '@/components/settings/SystemNotificationsCard';
import { useIsMobile, useOnboarding, useLocalStorage } from '@/hooks';
import { clearClientStoreKeys } from '@/hooks/useLocalStorage';
import { SERVER_PROGRESS_STORE_KEYS } from '@/hooks/useServerProgressSync';
import { cn, formatHoursDuration } from '@/lib/utils';
import type { DailyHoursByWeekday, StudyPreferences, UserSettings, WeekdayKey } from '@/types';
import { defaultSettings } from '@/lib/defaultSettings';
import { clearLocalDemoSession, isLocalDemoAuthEnabled } from '@/lib/localDemoAuth';

const initialSettings: UserSettings = defaultSettings;

/**
 * O layout prende o scroll no <main class="app-main-content"> (raiz com
 * overflow hidden), então ler/alterar window.scrollY não funciona. Estes
 * helpers usam o container real e caem para a janela quando ele não existe.
 */
const getScrollContainer = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('.app-main-content');
};

const readScrollTop = (): number => {
  const container = getScrollContainer();
  if (container) return container.scrollTop;
  if (typeof window === 'undefined') return 0;
  return window.scrollY || document.documentElement.scrollTop || 0;
};

const scrollContainerTo = (top: number): void => {
  const container = getScrollContainer();
  if (container) {
    container.scrollTo({ top, left: 0, behavior: 'auto' });
    return;
  }
  if (typeof window !== 'undefined') {
    window.scrollTo({ top, left: 0, behavior: 'auto' });
  }
};

const aiDifficultyOptions = [
  { value: 'easy', label: 'Leve', description: 'Sessões mais curtas, mais pausas' },
  { value: 'medium', label: 'Moderado', description: 'Equilíbrio entre estudo e descanso' },
  { value: 'hard', label: 'Intenso', description: 'Sessões longas, menos pausas' },
  { value: 'adaptive', label: 'Adaptativo', description: 'A IA ajusta com base no seu desempenho' },
] as const;

const alarmSoundOptions = [
  {
    value: 'pulse' as const,
    label: 'Pulse',
    description: 'Bipes repetidos e mais chamativos',
  },
  {
    value: 'beep' as const,
    label: 'Beep',
    description: 'Um aviso simples e direto',
  },
  {
    value: 'chime' as const,
    label: 'Chime',
    description: 'Toque curto em dois tons',
  },
  {
    value: 'soft' as const,
    label: 'Soft',
    description: 'Aviso suave e discreto',
  },
];

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const weekDayKeys: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const notificationLeadOptions = [5, 10, 15, 30, 60] as const;

const clampHours = (value: number) => Math.min(12, Math.max(0, Math.round(value * 2) / 2));

const formatHours = (value: number) => {
  return formatHoursDuration(value);
};

const buildDailyHoursByWeekday = (dailyGoalHours: number, excludeDays: number[]): DailyHoursByWeekday => {
  return weekDayKeys.reduce((acc, key, index) => {
    acc[key] = excludeDays.includes(index) ? 0 : clampHours(dailyGoalHours);
    return acc;
  }, {} as DailyHoursByWeekday);
};

type SettingsSection = 'profile' | 'appearance' | 'study' | 'ai' | 'notifications' | 'danger';

const sectionMeta: Record<
  SettingsSection,
  { title: string; description: string; icon: LucideIcon; iconClassName: string }
> = {
  profile: {
    title: 'Perfil',
    description: 'Nome e informações da conta',
    icon: User,
    iconClassName: 'bg-[#007aff] text-white',
  },
  appearance: {
    title: 'Aparência',
    description: 'Tema claro ou escuro',
    icon: Palette,
    iconClassName: 'bg-[#8e8e93] text-white',
  },
  study: {
    title: 'Preferências de estudo',
    description: 'Meta, horários e rotina semanal',
    icon: Clock,
    iconClassName: 'bg-[#5856d6] text-white',
  },
  ai: {
    title: 'Configurações da IA',
    description: 'Dificuldade e automações',
    icon: Brain,
    iconClassName: 'bg-[#34c759] text-white',
  },
  notifications: {
    title: 'Notificações',
    description: 'Lembretes e alertas',
    icon: Bell,
    iconClassName: 'bg-[#ff9500] text-white',
  },
  danger: {
    title: 'Zona de perigo',
    description: 'Ações irreversíveis da conta',
    icon: Shield,
    iconClassName: 'bg-[#ff3b30] text-white',
  },
};

const sectionGroups: Array<{ title: string; sections: SettingsSection[] }> = [
  { title: 'Conta', sections: ['profile', 'appearance', 'notifications'] },
  { title: 'Estudo', sections: ['study', 'ai'] },
  { title: 'Segurança', sections: ['danger'] },
];

const isSettingsSection = (value: string | null): value is SettingsSection => {
  return (
    value === 'profile' ||
    value === 'appearance' ||
    value === 'study' ||
    value === 'ai' ||
    value === 'notifications' ||
    value === 'danger'
  );
};

const mobileStackTransition = { duration: 0.22, ease: 'easeOut' } as const;

const mobileRootScreenVariants = {
  enter: (direction: number) => ({
    x: direction < 0 ? -48 : 0,
    opacity: direction < 0 ? 0 : 1,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -48 : 0,
    opacity: direction > 0 ? 0 : 1,
  }),
};

const mobileDetailScreenVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 48 : 0,
    opacity: direction > 0 ? 0 : 1,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction < 0 ? 48 : 0,
    opacity: direction < 0 ? 0 : 1,
  }),
};

function SettingsSectionIcon({ section }: { section: SettingsSection }) {
  const Icon = sectionMeta[section].icon;

  return (
    <span
      className={cn(
        'ios-section-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm',
        sectionMeta[section].iconClassName
      )}
      aria-hidden
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resetOnboarding } = useOnboarding();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const [isIOS, setIsIOS] = useState(false);
  const [settings, setSettings] = useLocalStorage<UserSettings>('nexora_user_settings', initialSettings);
  const [studyPrefs, setStudyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', {
    hoursPerDay: initialSettings.dailyGoalHours,
    daysOfWeek: [1, 2, 3, 4, 5],
    mode: 'random',
    examDate: '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /** Mensagem do servidor quando gravou só localmente (banco indisponível). */
  const [persistWarning, setPersistWarning] = useState<string | null>(null);
  const [hasRemotePrefs, setHasRemotePrefs] = useState(false);
  // weeklyHours só existe após o wizard/preset salvar preferências de verdade.
  const hasLocalSetup = (studyPrefs?.weeklyHours ?? 0) > 0;
  const hasAttemptedRemotePrefs = useRef(false);
  const [pendingAlarmSound, setPendingAlarmSound] = useState<UserSettings['alarmSound']>(
    settings.alarmSound || 'pulse'
  );
  const [alarmApplied, setAlarmApplied] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [resetTutorialStep, setResetTutorialStep] = useState<'idle' | 'confirm'>('idle');
  const [resetProgressStep, setResetProgressStep] = useState<'idle' | 'confirm'>('idle');
  const [isResettingTutorial, setIsResettingTutorial] = useState(false);
  const [isResettingProgress, setIsResettingProgress] = useState(false);
  const [switchPresetStep, setSwitchPresetStep] = useState<'idle' | 'confirm'>('idle');
  const [isSwitchingPreset, setIsSwitchingPreset] = useState(false);
  const [generalDangerFeedback, setGeneralDangerFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const deleteInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const latestSettingsRef = useRef(settings);
  const hasChangesRef = useRef(hasChanges);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const previousSectionRef = useRef<SettingsSection | null>(null);
  const rootScrollYRef = useRef(0);
  const openedFromRootRef = useRef(false);

  const sectionParam = searchParams.get('section');
  const activeSection = isSettingsSection(sectionParam) ? sectionParam : null;
  const transitionDirection = useMemo(() => {
    const previousSection = previousSectionRef.current;
    if (previousSection && !activeSection) return -1;
    if (!previousSection && activeSection) return 1;
    return 1;
  }, [activeSection]);

  const setSectionQuery = useCallback(
    (section: SettingsSection | null, mode: 'push' | 'replace' = 'push') => {
      const params = new URLSearchParams(searchParams.toString());
      if (section) {
        params.set('section', section);
      } else {
        params.delete('section');
      }

      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      if (mode === 'replace') {
        router.replace(nextUrl, { scroll: false });
        return;
      }
      router.push(nextUrl, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const openSection = useCallback(
    (section: SettingsSection) => {
      if (activeSection === section) return;
      openedFromRootRef.current = true;
      setSectionQuery(section, 'push');
    },
    [activeSection, setSectionQuery]
  );

  const closeSection = useCallback(() => {
    if (!activeSection) return;

    // If the user navigated from the root list, behave like a real "pop" (so browser forward works).
    if (openedFromRootRef.current) {
      openedFromRootRef.current = false;
      router.back();
      return;
    }

    // Deep-link fallback: keep the user inside /settings and just clear the query param.
    setSectionQuery(null, 'replace');
  }, [activeSection, router, setSectionQuery]);

  useEffect(() => {
    if (activeSection) return;
    openedFromRootRef.current = false;
  }, [activeSection]);

  const excludeDays = useMemo(
    () => (Array.isArray(settings.excludeDays) ? settings.excludeDays : []),
    [settings.excludeDays]
  );
  const dailyHoursByWeekday =
    settings.dailyHoursByWeekday ??
    buildDailyHoursByWeekday(settings.dailyGoalHours, excludeDays);

  const weeklyTotalHours = Object.values(dailyHoursByWeekday).reduce(
    (sum, value) => sum + value,
    0
  );
  const activeDayValues = Object.values(dailyHoursByWeekday).filter((value) => value > 0);
  const averageDailyHours =
    activeDayValues.length > 0 ? weeklyTotalHours / activeDayValues.length : 0;
  const emailValue = settings.email || session?.user?.email || '';
  const notificationsEnabled = Boolean(settings.notificationsEnabled);
  const backlogReminderEnabled = Boolean(settings.backlogReminderEnabled);
  const allowSundayBacklog = Boolean(settings.allowSundayBacklog);
  const notificationSoundEnabled = settings.notificationSoundEnabled !== false;
  const notificationMinutesBefore = Number.isFinite(settings.notificationMinutesBefore)
    ? Math.min(180, Math.max(1, Math.round(settings.notificationMinutesBefore)))
    : 15;

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveState((prev) => (prev === 'error' ? 'idle' : prev));
  };

  const updateDailyHours = (nextHours: DailyHoursByWeekday) => {
    const activeDays = weekDayKeys
      .map((key, index) => ({ key, index, value: nextHours[key] }))
      .filter((entry) => entry.value > 0);
    const nextExcludeDays = weekDayKeys
      .map((key, index) => (nextHours[key] > 0 ? null : index))
      .filter((value): value is number => value !== null);
    const nextAverage =
      activeDays.length > 0
        ? activeDays.reduce((sum, entry) => sum + entry.value, 0) / activeDays.length
        : settings.dailyGoalHours;

    setSettings((prev) => ({
      ...prev,
      dailyHoursByWeekday: nextHours,
      excludeDays: nextExcludeDays,
      dailyGoalHours: Number(nextAverage.toFixed(1)),
    }));
    setHasChanges(true);
    setSaveState((prev) => (prev === 'error' ? 'idle' : prev));
  };

  const updateDayHours = (dayIndex: number, hours: number) => {
    const key = weekDayKeys[dayIndex];
    const next = { ...dailyHoursByWeekday, [key]: clampHours(hours) };
    updateDailyHours(next);
  };

  const handleDailyGoalChange = (value: number) => {
    const next = { ...dailyHoursByWeekday };
    weekDayKeys.forEach((key, index) => {
      next[key] = excludeDays.includes(index) ? 0 : clampHours(value);
    });
    updateDailyHours(next);
  };

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  useEffect(() => {
    try {
      const ua = navigator.userAgent || '';
      const isiPhoneIPadIPod = /iPad|iPhone|iPod/.test(ua);
      const isIPadOs = ua.includes('Mac') && 'ontouchend' in document;
      setIsIOS(isiPhoneIPadIPod || isIPadOs);
    } catch {
      setIsIOS(false);
    }
  }, []);

  useEffect(() => {
    const previousSection = previousSectionRef.current;

    const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;

    if (isMobileViewport) {
      // Keep separate scroll positions for the "root list" and the "detail screen" like iOS Settings.
      // Obs.: quem rola é o <main class="app-main-content"> (o body tem
      // overflow hidden), então window.scrollTo aqui não tinha efeito algum.
      if (!previousSection && activeSection) {
        rootScrollYRef.current = readScrollTop();
        scrollContainerTo(0);
      } else if (previousSection && !activeSection) {
        scrollContainerTo(rootScrollYRef.current);
      }
    }

    previousSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    if (!sectionParam || activeSection) return;
    setSectionQuery(null, 'replace');
  }, [activeSection, sectionParam, setSectionQuery]);

  useEffect(() => {
    if (settings.dailyHoursByWeekday) return;
    const fallback = buildDailyHoursByWeekday(
      settings.dailyGoalHours,
      settings.excludeDays ?? []
    );
    setSettings((prev) => ({ ...prev, dailyHoursByWeekday: fallback }));
  }, [settings.dailyHoursByWeekday, settings.dailyGoalHours, settings.excludeDays, setSettings]);

  useEffect(() => {
    if (!session?.user) return;
    setSettings((prev) => {
      const nextName = prev.name == null ? session.user?.name || 'Estudante' : prev.name;
      const nextEmail =
        prev.email && prev.email.trim().length > 0 ? prev.email : session.user?.email || '';
      const nextAvatar = prev.avatar || session.user?.image || undefined;

      if (prev.name === nextName && prev.email === nextEmail && prev.avatar === nextAvatar) {
        return prev;
      }

      return {
        ...prev,
        name: nextName,
        email: nextEmail,
        avatar: nextAvatar,
      };
    });
  }, [session?.user, setSettings]);

  useEffect(() => {
    if (!session?.user?.id) return;
    if (hasRemotePrefs) return;
    if (hasAttemptedRemotePrefs.current) return;
    let isMounted = true;
    const loadRemotePrefs = async () => {
      hasAttemptedRemotePrefs.current = true;
      try {
        const response = await fetch('/api/preferences');
        if (!response.ok) return;
        const payload = await response.json();
        if (!payload?.success || !payload?.data) return;

        const remote = payload.data;
        const parsedRestDays =
          typeof remote.restDays === 'string'
            ? (() => {
                try {
                  return JSON.parse(remote.restDays);
                } catch {
                  return null;
                }
              })()
            : remote.restDays ?? null;
        const restDays = (() => {
          if (Array.isArray(parsedRestDays)) {
            return parsedRestDays.filter(
              (value: unknown): value is number =>
                typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 6
            );
          }
          if (
            parsedRestDays &&
            typeof parsedRestDays === 'object' &&
            'excludeDays' in parsedRestDays &&
            Array.isArray(parsedRestDays.excludeDays)
          ) {
            return parsedRestDays.excludeDays.filter(
              (value: unknown): value is number =>
                typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 6
            );
          }
          return [];
        })();
        const remoteAllowSundayBacklog =
          parsedRestDays &&
          typeof parsedRestDays === 'object' &&
          'allowSundayBacklog' in parsedRestDays &&
          typeof parsedRestDays.allowSundayBacklog === 'boolean'
            ? parsedRestDays.allowSundayBacklog
            : null;
        const remoteDailyHours =
          typeof remote.dailyHoursByWeekday === 'string'
            ? (() => {
                try {
                  return JSON.parse(remote.dailyHoursByWeekday);
                } catch {
                  return null;
                }
              })()
            : remote.dailyHoursByWeekday ?? null;

        if (!isMounted || hasChangesRef.current) return;
        setSettings((prev) => ({
          ...prev,
          dailyGoalHours: remote.dailyGoalHours ?? prev.dailyGoalHours,
          preferredStart: remote.preferredStart ?? prev.preferredStart,
          preferredEnd: remote.preferredEnd ?? prev.preferredEnd,
          maxBlockMinutes: remote.maxBlockMinutes ?? prev.maxBlockMinutes,
          breakMinutes: remote.breakMinutes ?? prev.breakMinutes,
          alarmSound: remote.alarmSound ?? prev.alarmSound,
          dailyReminder:
            typeof remote.dailyReminder === 'boolean' ? remote.dailyReminder : prev.dailyReminder,
          streakReminder:
            typeof remote.streakReminder === 'boolean' ? remote.streakReminder : prev.streakReminder,
          achievementAlerts:
            typeof remote.achievementAlerts === 'boolean'
              ? remote.achievementAlerts
              : prev.achievementAlerts,
          weeklyReport:
            typeof remote.weeklyReport === 'boolean' ? remote.weeklyReport : prev.weeklyReport,
          notificationsEnabled:
            typeof remote.notificationsEnabled === 'boolean'
              ? remote.notificationsEnabled
              : prev.notificationsEnabled,
          notificationMinutesBefore:
            typeof remote.notificationMinutesBefore === 'number' &&
            Number.isFinite(remote.notificationMinutesBefore)
              ? Math.min(180, Math.max(1, Math.round(remote.notificationMinutesBefore)))
              : prev.notificationMinutesBefore,
          notificationSoundEnabled:
            typeof remote.notificationSoundEnabled === 'boolean'
              ? remote.notificationSoundEnabled
              : prev.notificationSoundEnabled,
          backlogReminderEnabled:
            typeof remote.backlogReminderEnabled === 'boolean'
              ? remote.backlogReminderEnabled
              : prev.backlogReminderEnabled,
          pushSubscription:
            remote.pushSubscription && typeof remote.pushSubscription === 'object'
              ? remote.pushSubscription
              : prev.pushSubscription ?? null,
          dailyHoursByWeekday: remoteDailyHours ?? prev.dailyHoursByWeekday,
          excludeDays: restDays.length > 0 ? restDays : prev.excludeDays,
          allowSundayBacklog:
            typeof remoteAllowSundayBacklog === 'boolean'
              ? remoteAllowSundayBacklog
              : prev.allowSundayBacklog,
          examDate: remote.examDate ?? prev.examDate,
        }));
        const resolvedDaily =
          remoteDailyHours ??
          buildDailyHoursByWeekday(
            remote.dailyGoalHours ?? settings.dailyGoalHours,
            restDays.length > 0 ? restDays : excludeDays
          );
        const activeDays = weekDayKeys
          .map((key, index) => ({ key, index }))
          .filter((entry) => (resolvedDaily[entry.key] ?? 0) > 0)
          .map((entry) => entry.index);
        setStudyPrefs({
          hoursPerDay: remote.dailyGoalHours ?? settings.dailyGoalHours,
          daysOfWeek: activeDays,
          mode: remote.examDate ? 'exam' : 'random',
          examDate: remote.examDate || '',
        });
        setHasRemotePrefs(true);
      } catch (error) {
        console.warn('Erro ao carregar preferências remotas:', error);
      }
    };

    if (!hasChanges) {
      loadRemotePrefs();
    }

    return () => {
      isMounted = false;
    };
  }, [excludeDays, hasChanges, hasRemotePrefs, session?.user?.id, setSettings, setStudyPrefs, settings.dailyGoalHours]);

  useEffect(() => {
    setPendingAlarmSound(settings.alarmSound || 'pulse');
  }, [settings.alarmSound]);

  useEffect(() => {
    if (!alarmApplied) return;
    const timeout = setTimeout(() => setAlarmApplied(false), 1200);
    return () => clearTimeout(timeout);
  }, [alarmApplied]);

  useEffect(() => {
    if (deleteStep !== 'confirm') return;
    deleteInputRef.current?.focus();
  }, [deleteStep]);

  const ensureAudioContext = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioRef.current.state === 'suspended') {
        audioRef.current.resume();
      }
    } catch (error) {
      console.warn('Erro ao preparar áudio:', error);
    }
  };

  const playAlarmPreview = (sound: UserSettings['alarmSound']) => {
    try {
      ensureAudioContext();
      if (!audioRef.current) return;
      const context = audioRef.current;
      const now = context.currentTime;
      const scheduleBeep = (start: number, duration: number, freq: number, type: OscillatorType) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      };

      if (sound === 'beep') {
        const duration = 1.0;
        const gap = 0.25;
        const repeats = 4;
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * (duration + gap);
          scheduleBeep(start, duration, 880, 'sine');
        }
        return;
      }
      if (sound === 'chime') {
        const cycle = 0.9;
        const repeats = 6;
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * cycle;
          scheduleBeep(start, 0.35, 880, 'sine');
          scheduleBeep(start + 0.4, 0.45, 660, 'sine');
        }
        return;
      }
      if (sound === 'soft') {
        const duration = 0.25;
        const gap = 0.15;
        const repeats = 12;
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * (duration + gap);
          scheduleBeep(start, duration, 520, 'sine');
        }
        return;
      }

      const beepDuration = 0.24;
      const gap = 0.08;
      const repeats = 16;
      for (let i = 0; i < repeats; i += 1) {
        const start = now + i * (beepDuration + gap);
        scheduleBeep(start, beepDuration, 880, 'square');
      }
    } catch (error) {
      console.warn('Erro ao tocar alarme:', error);
    }
  };

  const toggleExcludeDay = (dayIndex: number) => {
    const key = weekDayKeys[dayIndex];
    const isRest = dailyHoursByWeekday[key] === 0;
    const next = {
      ...dailyHoursByWeekday,
      [key]: isRest ? clampHours(settings.dailyGoalHours || 2) : 0,
    };
    updateDailyHours(next);
  };

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      do {
        saveQueuedRef.current = false;

        const snapshot = latestSettingsRef.current;
        const resolvedDaily =
          snapshot.dailyHoursByWeekday ??
          buildDailyHoursByWeekday(snapshot.dailyGoalHours, snapshot.excludeDays ?? []);
        const activeDays = weekDayKeys
          .map((key, index) => ({ key, index }))
          .filter((entry) => (resolvedDaily[entry.key] ?? 0) > 0)
          .map((entry) => entry.index);
        const activeHours = Object.values(resolvedDaily).filter((value) => value > 0);
        const averageHours =
          activeHours.length > 0
            ? activeHours.reduce((sum, value) => sum + value, 0) / activeHours.length
            : snapshot.dailyGoalHours;

        setSaveState('saving');

        try {
          const response = await fetch('/api/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: snapshot }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.success === false) {
            throw new Error(payload?.error || 'Falha ao salvar preferências.');
          }

          // `persisted: false` = o servidor aceitou mas não gravou (banco fora).
          const persisted = payload?.persisted !== false;
          setPersistWarning(persisted ? null : payload?.warning || 'Alterações salvas apenas neste dispositivo.');
          setHasRemotePrefs(persisted);
          setStudyPrefs({
            hoursPerDay: Number(averageHours.toFixed(1)),
            daysOfWeek: activeDays,
            mode: snapshot.examDate ? 'exam' : 'random',
            examDate: snapshot.examDate || '',
          });
          setHasChanges(false);
          setSaveState('saved');
        } catch (error) {
          console.warn('Falha ao salvar preferências no servidor:', error);
          setPersistWarning(null);
          setSaveState('error');
        }
      } while (saveQueuedRef.current);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [setStudyPrefs]);

  useEffect(() => {
    if (!hasChanges) return;
    const timeout = setTimeout(() => {
      void handleSave();
    }, 700);
    return () => clearTimeout(timeout);
  }, [hasChanges, handleSave, settings]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const timeout = setTimeout(() => setSaveState('idle'), 1800);
    return () => clearTimeout(timeout);
  }, [saveState]);

  const clearClientProgressStore = () => {
    clearClientStoreKeys(SERVER_PROGRESS_STORE_KEYS);
  };

  /**
   * Limpa o progresso que vive no navegador e volta o tutorial ao início.
   * No modo demo local não existe sessão no servidor (a API responde 401),
   * então esta é a única limpeza possível — e é exatamente a que o usuário
   * espera ver acontecer.
   */
  const wipeProgressLocally = () => {
    clearClientProgressStore();
    resetOnboarding();
    setHasRemotePrefs(false);
  };

  const clearServerProgress = async (mode: 'onboarding' | 'progress') => {
    const response = await fetch('/api/progress', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || 'Falha ao limpar progresso no servidor.');
    }
  };

  const handleReset = () => {
    setSettings(initialSettings);
    const fallbackHours =
      initialSettings.dailyHoursByWeekday ??
      buildDailyHoursByWeekday(initialSettings.dailyGoalHours, initialSettings.excludeDays ?? []);
    const activeDays = weekDayKeys
      .map((key, index) => ({ key, index }))
      .filter((entry) => fallbackHours[entry.key] > 0)
      .map((entry) => entry.index);
    const avgHours = activeDays.length
      ? activeDays.reduce((sum, index) => sum + fallbackHours[weekDayKeys[index]], 0) /
        activeDays.length
      : initialSettings.dailyGoalHours;
    setStudyPrefs({
      hoursPerDay: Number(avgHours.toFixed(1)),
      daysOfWeek: activeDays,
      mode: 'random',
      examDate: '',
    });
    setHasChanges(true);
    setSaveState('idle');
  };

  const startResetTutorialFlow = () => {
    setResetTutorialStep('confirm');
    setResetProgressStep('idle');
    setDeleteStep('idle');
    setDeleteConfirmText('');
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);
  };

  const cancelResetTutorialFlow = () => {
    if (isResettingTutorial) return;
    setResetTutorialStep('idle');
  };

  const confirmResetTutorial = async () => {
    setIsResettingTutorial(true);
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);

    try {
      // Modo demo: dados só existem no navegador, não há o que limpar no servidor.
      if (isLocalDemoAuthEnabled) {
        wipeProgressLocally();
      } else {
        await clearServerProgress('onboarding');
        resetOnboarding();
        setHasRemotePrefs(false);
      }
      setGeneralDangerFeedback({ type: 'success', message: 'Tutorial reiniciado. Recarregando...' });
      setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      console.warn('Erro ao reiniciar tutorial:', error);
      setGeneralDangerFeedback({ type: 'error', message: 'Falha ao reiniciar tutorial. Tente novamente.' });
    } finally {
      setIsResettingTutorial(false);
      setResetTutorialStep('idle');
    }
  };

  const startResetProgressFlow = () => {
    setResetProgressStep('confirm');
    setResetTutorialStep('idle');
    setDeleteStep('idle');
    setDeleteConfirmText('');
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);
  };

  const cancelResetProgressFlow = () => {
    if (isResettingProgress) return;
    setResetProgressStep('idle');
  };

  const confirmResetProgress = async () => {
    setIsResettingProgress(true);
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);

    try {
      if (isLocalDemoAuthEnabled) {
        wipeProgressLocally();
      } else {
        await clearServerProgress('progress');
        wipeProgressLocally();
      }
      setGeneralDangerFeedback({ type: 'success', message: 'Progresso resetado. Recarregando...' });
      setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      console.warn('Erro ao resetar progresso:', error);
      setGeneralDangerFeedback({ type: 'error', message: 'Falha ao resetar progresso. Tente novamente.' });
    } finally {
      setIsResettingProgress(false);
      setResetProgressStep('idle');
    }
  };

  // Trocar de predefinição é destrutivo por decisão de produto: o plano novo
  // substitui o antigo, então matérias, blocos e histórico são zerados antes
  // de reabrir a seleção.
  const confirmSwitchPreset = async () => {
    setIsSwitchingPreset(true);
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);

    try {
      if (isLocalDemoAuthEnabled) {
        wipeProgressLocally();
      } else {
        await clearServerProgress('progress');
        wipeProgressLocally();
      }
      setSwitchPresetStep('idle');
      setGeneralDangerFeedback({ type: 'success', message: 'Progresso resetado. Abrindo predefinições...' });
      router.push('/subjects?preset=1');
    } catch (error) {
      console.warn('Erro ao resetar progresso para trocar de predefinição:', error);
      setGeneralDangerFeedback({ type: 'error', message: 'Falha ao resetar progresso. Tente novamente.' });
    } finally {
      setIsSwitchingPreset(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setResetTutorialStep('idle');
    setResetProgressStep('idle');
    setDeleteStep('idle');
    setDeleteConfirmText('');
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);

    try {
      if (isLocalDemoAuthEnabled) {
        clearLocalDemoSession();
        router.replace('/login');
        return;
      }

      await signOut({ callbackUrl: '/login' });
    } catch (error) {
      setGeneralDangerFeedback({
        type: 'error',
        message: 'Falha ao sair da conta. Tente novamente.',
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const startDeleteFlow = () => {
    setDeleteStep('confirm');
    setDeleteConfirmText('');
    setResetTutorialStep('idle');
    setResetProgressStep('idle');
    setGeneralDangerFeedback(null);
    setDeleteFeedback(null);
  };

  const cancelDeleteFlow = () => {
    if (isDeletingAccount) return;
    setDeleteStep('idle');
    setDeleteConfirmText('');
    setDeleteFeedback(null);
  };

  const handleDeleteAccount = async () => {
    const confirmationKeyword = 'EXCLUIR';

    if (deleteConfirmText.trim().toUpperCase() !== confirmationKeyword) {
      setDeleteFeedback({
        type: 'error',
        message: `Digite "${confirmationKeyword}" para confirmar a exclusão da conta.`,
      });
      return;
    }

    setIsDeletingAccount(true);
    setDeleteFeedback(null);

    try {
      if (isLocalDemoAuthEnabled) {
        clearClientProgressStore();
        clearLocalDemoSession();
        setDeleteConfirmText('');
        setDeleteStep('idle');
        setDeleteFeedback({
          type: 'success',
          message: 'Sessao de teste limpa. Redirecionando...',
        });
        setTimeout(() => router.replace('/login'), 350);
        return;
      }

      const response = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Não foi possível excluir sua conta agora.');
      }

      clearClientProgressStore();
      setDeleteConfirmText('');
      setDeleteStep('idle');
      setDeleteFeedback({
        type: 'success',
        message: 'Conta excluida. Redirecionando...',
      });
      await signOut({ callbackUrl: '/login' });
    } catch (error) {
      setDeleteFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao excluir conta.',
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const saveFeedback = useMemo(() => {
    if (persistWarning && saveState !== 'saving' && saveState !== 'error') {
      return {
        text: persistWarning,
        className: 'text-warning',
      };
    }
    if (saveState === 'saving') {
      return {
        text: 'Salvando alterações...',
        className: 'text-text-muted',
      };
    }
    if (saveState === 'saved') {
      return {
        text: 'Alterações salvas',
        className: 'text-neon-cyan',
      };
    }
    if (saveState === 'error') {
      return {
        text: 'Falha ao salvar. Tente novamente.',
        className: 'text-danger',
      };
    }
    if (hasChanges) {
      return {
        text: 'Alterações pendentes',
        className: 'text-text-muted',
      };
    }
    return null;
  }, [hasChanges, saveState, persistWarning]);

  const showActionButtons = hasChanges || saveState === 'error';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="ios-settings-page app-page w-full min-w-0 max-w-[760px] mx-auto overflow-x-hidden pb-[calc(var(--bottom-nav-safe-height)+1.25rem)] md:pb-6"
    >
      {/* Cabeçalho */}
            <div className="space-y-3 md:hidden">
        {!activeSection ? (
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-heading font-bold text-text-primary">Configurações</h1>
              <p className="text-sm text-text-secondary mt-1">Personalize sua experiência de estudos</p>
            </div>
            {showActionButtons && (
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving} className="shrink-0">
                Salvar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 items-center justify-between gap-2">
            <button
              type="button"
              onClick={closeSection}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-neon-blue hover:bg-card-bg touch-manipulation active:scale-[0.99]"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-text-primary">
              {sectionMeta[activeSection].title}
            </p>
            {showActionButtons ? (
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving} className="shrink-0">
                Salvar
              </Button>
            ) : (
              <span className="w-[68px] shrink-0" aria-hidden />
            )}
          </div>
        )}
        {saveFeedback && <p className={cn('text-xs', saveFeedback.className)}>{saveFeedback.text}</p>}
      </div>

      <div className="hidden min-w-0 flex-col gap-3 md:flex sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-heading font-bold text-text-primary">Configurações</h1>
          <p className="text-sm text-text-secondary mt-1">
            Personalize sua experiência de estudos
          </p>
          {saveFeedback && <p className={cn('mt-2 text-xs', saveFeedback.className)}>{saveFeedback.text}</p>}
        </div>
        {showActionButtons && (
          <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2 sm:gap-3">
            <Button variant="ghost" onClick={handleReset} className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              Resetar
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving} className="w-full sm:w-auto">
              <Save className="w-4 h-4 mr-2" />
              Salvar Alterações
            </Button>
          </div>
        )}
      </div>

      <div className="relative min-w-0 overflow-x-hidden">
        <AnimatePresence initial={false} custom={transitionDirection} mode="popLayout">
        {!activeSection && (
          <motion.div
            key="settings-sections-list"
            variants={mobileRootScreenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={mobileStackTransition}
            className="relative z-0 mx-auto max-w-[560px] space-y-5"
          >
            {!hasRemotePrefs && !hasLocalSetup && (
              <Card className="border-neon-cyan/40 bg-neon-cyan/5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm text-text-primary font-medium">Ainda não configurado</p>
                    <p className="text-xs text-text-secondary">
                      Escolha um modelo na página de disciplinas para aplicar um plano automático.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/subjects')}
                    className="w-full sm:w-auto"
                  >
                    Configurar agora
                  </Button>
                </div>
              </Card>
            )}
            {sectionGroups.map((group) => (
              <Card key={group.title} padding="none" className="overflow-hidden">
                <div className="border-b border-card-border/70 px-4 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">{group.title}</p>
                </div>
                {group.sections.map((section, index) => (
                  <button
                    key={section}
                    type="button"
                    onClick={() => openSection(section)}
                    className={cn(
                      'flex w-full min-h-[56px] min-w-0 items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-soft touch-manipulation active:scale-[0.995]',
                      index !== group.sections.length - 1 && 'border-b border-card-border/70'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <SettingsSectionIcon section={section} />
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-normal text-text-primary">
                          {sectionMeta[section].title}
                        </p>
                        <p className="truncate text-xs text-text-secondary">
                          {sectionMeta[section].description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                  </button>
                ))}
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seção de Perfil */}
      <AnimatePresence initial={false} custom={transitionDirection} mode="popLayout">
        <motion.div
          key={activeSection ?? 'all-sections'}
          variants={mobileDetailScreenVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={mobileStackTransition}
          className="relative z-10 md:!transform-none md:!opacity-100"
        >
      {activeSection && (
        <div className="mb-4 hidden items-center justify-between md:flex">
          <button
            type="button"
            onClick={closeSection}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg pr-3 text-sm font-medium text-[#007aff] transition hover:bg-surface-soft"
          >
            <ChevronLeft className="w-4 h-4" />
            Ajustes
          </button>
          {showActionButtons && (
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              Salvar
            </Button>
          )}
        </div>
      )}
      <Card className={cn(activeSection === 'profile' ? 'block' : 'hidden')}>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neon-blue/20 flex items-center justify-center">
            <User className="w-5 h-5 text-neon-blue" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-heading font-bold text-text-primary">Perfil</h2>
            <p className="text-sm text-text-secondary">Suas informações pessoais</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Nome de Exibição
            </label>
            <input
              type="text"
              value={settings.name ?? ''}
              onChange={(e) => updateSetting('name', e.target.value)}
              className="input-field"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              E-mail
            </label>
            <input
              type="email"
              value={emailValue}
              readOnly
              className="input-field opacity-80 cursor-not-allowed"
            />
          </div>
        </div>
      </Card>

      {/* Preferências de Estudo */}
      <Card className={cn(activeSection === 'appearance' ? 'block' : 'hidden')}>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-card-bg border border-card-border flex items-center justify-center">
            <Palette className="w-5 h-5 text-text-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-heading font-bold text-text-primary">Aparência</h2>
            <p className="text-sm text-text-secondary">Escolha como o Nexora aparece para você</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              value: 'light' as const,
              label: 'Claro',
              description: 'Visual limpo, parecido com Ajustes do iPhone.',
              icon: Sun,
            },
            {
              value: 'dark' as const,
              label: 'Escuro',
              description: 'Visual original do Nexora com fundo profundo.',
              icon: Moon,
            },
          ].map((option) => {
            const Icon = option.icon;
            const isSelected = (settings.theme || 'dark') === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updateSetting('theme', option.value)}
                aria-pressed={isSelected}
                className={cn(
                  'min-h-[126px] rounded-2xl border p-4 text-left transition touch-manipulation active:scale-[0.99]',
                  isSelected
                    ? 'border-[#007aff] bg-[#007aff]/10'
                    : 'border-card-border bg-card-bg hover:border-[#007aff]/50'
                )}
              >
                <div
                  className={cn(
                    'mb-4 flex h-11 w-11 items-center justify-center rounded-full',
                    option.value === 'light' ? 'bg-white text-slate-900 ring-1 ring-black/10' : 'bg-[#05080F] text-white ring-1 ring-white/10'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-semibold text-text-primary">{option.label}</div>
                <div className="mt-1 text-sm text-text-secondary">{option.description}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className={cn(activeSection === 'study' ? 'block' : 'hidden')}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-neon-purple/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-neon-purple" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-bold text-text-primary">
              Preferências de Estudo
            </h2>
            <p className="text-sm text-text-secondary">
              Configure sua agenda de estudos
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Meta Diária */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Meta diaria de estudo: {formatHours(settings.dailyGoalHours)}
            </label>
            <input
              type="range"
              min="1"
              max="12"
              step="0.5"
              value={settings.dailyGoalHours}
              onChange={(e) => handleDailyGoalChange(Number(e.target.value))}
              className="w-full accent-neon-purple"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>1h</span>
              <span>12h</span>
            </div>
          </div>

          <div className="rounded-xl border border-card-border bg-card-bg/50 p-4 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">Horas por dia</p>
                <p className="text-xs text-text-muted">
                  Ajuste por dia quando sua rotina variar.
                </p>
              </div>
              <div className="text-xs text-text-secondary">
                Total semanal: <span className="text-text-primary">{formatHours(weeklyTotalHours)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {weekDays.map((label, index) => {
                const key = weekDayKeys[index];
                const hours = dailyHoursByWeekday[key] ?? 0;
                const isActive = hours > 0;

                return (
                  <div
                    key={label}
                    className="rounded-xl border border-card-border bg-card-bg px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                          onClick={() => updateDayHours(index, isActive ? 0 : settings.dailyGoalHours)}
                          className={cn(
                            'h-11 min-w-[48px] rounded-lg border px-2 text-sm font-medium transition',
                            isActive
                              ? 'border-neon-purple/60 text-text-primary'
                              : 'border-card-border text-text-muted'
                          )}
                        >
                        {label}
                      </button>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                            max={12}
                            step={0.5}
                            value={hours}
                            onChange={(e) => updateDayHours(index, Number(e.target.value))}
                            className={cn('input-field h-11 w-20 px-3 py-2 text-sm', !isActive && 'opacity-70')}
                          />
                        <span className="min-w-[38px] text-right text-xs text-text-muted">{formatHours(hours)}</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={0.5}
                      value={hours}
                      onChange={(e) => updateDayHours(index, Number(e.target.value))}
                      className={cn('mt-3 w-full accent-neon-purple', !isActive && 'opacity-40')}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
              <span>
                Media diaria: <span className="text-text-primary">{formatHours(averageDailyHours)}</span>
              </span>
              <span>
                Dias ativos: <span className="text-text-primary">{activeDayValues.length}</span>
              </span>
            </div>
          </div>

          {/* Janela de Tempo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Horário de Início Preferido
              </label>
              {isMobile && isIOS ? (
                <TimePickerField
                  label="Horário de início preferido"
                  value={settings.preferredStart}
                  onChange={(next) => updateSetting('preferredStart', next)}
                />
              ) : (
                <input
                  type="time"
                  value={settings.preferredStart}
                  onChange={(e) => updateSetting('preferredStart', e.target.value)}
                  className="input-field py-2.5"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Horário de Término Preferido
              </label>
              {isMobile && isIOS ? (
                <TimePickerField
                  label="Horário de término preferido"
                  value={settings.preferredEnd}
                  onChange={(next) => updateSetting('preferredEnd', next)}
                />
              ) : (
                <input
                  type="time"
                  value={settings.preferredEnd}
                  onChange={(e) => updateSetting('preferredEnd', e.target.value)}
                  className="input-field py-2.5"
                />
              )}
            </div>
          </div>

          {/* Duração dos Blocos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Duração Máxima do Bloco (min)
              </label>
              <input
                type="number"
                min="30"
                max="180"
                step="15"
                value={settings.maxBlockMinutes}
                onChange={(e) => updateSetting('maxBlockMinutes', Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Duração do Intervalo (min)
              </label>
              <input
                type="number"
                min="5"
                max="30"
                step="5"
                value={settings.breakMinutes}
                onChange={(e) => updateSetting('breakMinutes', Number(e.target.value))}
                className="input-field"
              />
            </div>
          </div>

          {/* Dias de Descanso */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Dias de Descanso (sem agendamento automático)
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {weekDays.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleExcludeDay(index)}
                  aria-pressed={excludeDays.includes(index)}
                  className={cn(
                    'w-full h-11 rounded-xl font-medium text-sm transition-all touch-manipulation active:scale-[0.99]',
                    excludeDays.includes(index)
                      ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/50'
                      : 'bg-card-bg text-text-secondary border border-card-border hover:border-neon-purple/30'
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => updateSetting('allowSundayBacklog', !allowSundayBacklog)}
            aria-pressed={allowSundayBacklog}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-card-bg border border-card-border text-left touch-manipulation active:scale-[0.995]"
          >
            <div className="min-w-0 pr-2">
              <div className="font-medium text-text-primary">Permitir pendências no domingo</div>
              <div className="text-sm text-text-secondary">
                Usa domingo apenas para reagendamento/backlog, sem alterar a grade fixa.
              </div>
            </div>
            <span
              aria-hidden
              className={cn(
                'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                allowSundayBacklog ? 'bg-neon-cyan' : 'bg-card-border'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                  allowSundayBacklog ? 'translate-x-8' : 'translate-x-1'
                )}
              />
            </span>
          </button>
        </div>
      </Card>

      {/* Configurações da IA */}
      <Card className={cn(activeSection === 'ai' ? 'block' : 'hidden')}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-neon-cyan/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-neon-cyan" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-bold text-text-primary">
              Configurações da IA
            </h2>
            <p className="text-sm text-text-secondary">
              Personalize o comportamento da IA e agendamento
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Modo de Dificuldade */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Modo de Dificuldade da IA
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {aiDifficultyOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateSetting('aiDifficulty', option.value)}
                  aria-pressed={settings.aiDifficulty === option.value}
                  className={cn(
                    'min-h-[84px] p-4 rounded-xl text-left transition-all touch-manipulation active:scale-[0.99]',
                    settings.aiDifficulty === option.value
                      ? 'bg-neon-cyan/20 border-2 border-neon-cyan'
                      : 'bg-card-bg border border-card-border hover:border-neon-cyan/30'
                  )}
                >
                  <div className="font-medium text-text-primary mb-1">{option.label}</div>
                  <div className="text-xs text-text-muted">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Configurações Toggle */}
          <div className="space-y-4">
            {[
              {
                key: 'focusMode' as const,
                label: 'Modo Foco',
                description: 'Minimizar distrações durante as sessões de estudo',
              },
              {
                key: 'autoSchedule' as const,
                label: 'Agendamento Automático',
                description: 'A IA cria automaticamente agendas semanais',
              },
              {
                key: 'smartBreaks' as const,
                label: 'Pausas Inteligentes',
                description: 'A IA sugere pausas com base nos níveis de foco',
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateSetting(item.key, !settings[item.key])}
                aria-pressed={settings[item.key]}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-card-bg border border-card-border text-left touch-manipulation active:scale-[0.995]"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-text-primary">{item.label}</div>
                  <div className="text-sm text-text-secondary">
                    {item.description}
                  </div>
                </div>
                <span
                  aria-hidden
                  className={cn(
                    'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                    settings[item.key] ? 'bg-neon-cyan' : 'bg-card-border'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                      settings[item.key] ? 'translate-x-8' : 'translate-x-1'
                    )}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Notificações */}
      <Card className={cn(activeSection === 'notifications' ? 'block' : 'hidden')}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-bold text-text-primary">
              Notificações
            </h2>
            <p className="text-sm text-text-secondary">
              Gerencie suas preferências de notificação
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <SystemNotificationsCard />
          <div className="p-4 rounded-xl bg-card-bg border border-card-border space-y-4">
            <div>
              <div className="font-medium text-text-primary">Notificações de estudo</div>
              <div className="text-sm text-text-secondary">
                Avisos dinâmicos baseados no horário real dos blocos da agenda.
              </div>
            </div>

            <button
              type="button"
              onClick={() => updateSetting('notificationsEnabled', !notificationsEnabled)}
              aria-pressed={notificationsEnabled}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-background-light border border-card-border text-left touch-manipulation active:scale-[0.995]"
            >
              <div className="min-w-0 pr-2">
                <div className="font-medium text-text-primary">Ativar notificações por bloco</div>
                <div className="text-sm text-text-secondary">
                  Agenda alerta antes de cada sessão não concluída do dia.
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                  notificationsEnabled ? 'bg-orange-500' : 'bg-card-border'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                    notificationsEnabled ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </span>
            </button>

            <div className="space-y-2">
              <label className="text-sm text-text-secondary">
                Quantos minutos antes?
              </label>
              <div className="flex flex-wrap gap-2">
                {notificationLeadOptions.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => updateSetting('notificationMinutesBefore', minutes)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      notificationMinutesBefore === minutes
                        ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                        : 'border-card-border text-text-secondary hover:border-neon-cyan/40 hover:text-text-primary'
                    )}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">Personalizado</span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={notificationMinutesBefore}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!Number.isFinite(parsed)) return;
                    updateSetting(
                      'notificationMinutesBefore',
                      Math.min(180, Math.max(1, Math.round(parsed)))
                    );
                  }}
                  className="input-field max-w-[110px] py-1.5 text-sm"
                />
                <span className="text-xs text-text-muted">1-180 min</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => updateSetting('backlogReminderEnabled', !backlogReminderEnabled)}
              aria-pressed={backlogReminderEnabled}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-background-light border border-card-border text-left touch-manipulation active:scale-[0.995]"
            >
              <div className="min-w-0 pr-2">
                <div className="font-medium text-text-primary">Avisar backlog acumulado</div>
                <div className="text-sm text-text-secondary">
                  Envia alerta quando houver pendências vencidas para replanejar.
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                  backlogReminderEnabled ? 'bg-orange-500' : 'bg-card-border'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                    backlogReminderEnabled ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                updateSetting('notificationSoundEnabled', !notificationSoundEnabled)
              }
              aria-pressed={notificationSoundEnabled}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-background-light border border-card-border text-left touch-manipulation active:scale-[0.995]"
            >
              <div className="min-w-0 pr-2">
                <div className="font-medium text-text-primary">Som nas notificações</div>
                <div className="text-sm text-text-secondary">
                  Mantém áudio ativo nos alertas de estudo deste dispositivo.
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                  notificationSoundEnabled ? 'bg-orange-500' : 'bg-card-border'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                    notificationSoundEnabled ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </span>
            </button>
          </div>

          {[
            {
              key: 'dailyReminder' as const,
              label: 'Lembrete Diário de Estudo',
              description: 'Receba notificações sobre sua agenda diária',
            },
            {
              key: 'streakReminder' as const,
              label: 'Lembrete de Sequência',
              description: 'Avise-me antes da sequência estar em risco',
            },
            {
              key: 'achievementAlerts' as const,
              label: 'Alertas de Conquistas',
              description: 'Notificar quando desbloquear novas conquistas',
            },
            {
              key: 'weeklyReport' as const,
              label: 'Relatório Semanal',
              description: 'Receber resumo semanal de desempenho',
            },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateSetting(item.key, !settings[item.key])}
                aria-pressed={settings[item.key]}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-card-bg border border-card-border text-left touch-manipulation active:scale-[0.995]"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-text-primary">{item.label}</div>
                  <div className="text-sm text-text-secondary">
                    {item.description}
                  </div>
                </div>
                <span
                  aria-hidden
                  className={cn(
                    'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                    settings[item.key] ? 'bg-orange-500' : 'bg-card-border'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                      settings[item.key] ? 'translate-x-8' : 'translate-x-1'
                    )}
                  />
                </span>
              </button>
            ))}
          <div className="p-4 rounded-xl bg-card-bg border border-card-border space-y-4">
            <div>
              <div className="font-medium text-text-primary">Som do alarme</div>
              <div className="text-sm text-text-secondary">
                Escolha o som usado quando um bloco terminar
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alarmSoundOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPendingAlarmSound(option.value)}
                  aria-pressed={(pendingAlarmSound || 'pulse') === option.value}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-left transition touch-manipulation active:scale-[0.99]',
                    (pendingAlarmSound || 'pulse') === option.value
                      ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                      : 'border-card-border text-text-secondary hover:border-neon-cyan/60'
                  )}
                >
                  <div className="font-semibold">{option.label}</div>
                  <div className="text-xs text-text-muted mt-1">{option.description}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => playAlarmPreview(pendingAlarmSound || 'pulse')}
              >
                Ouvir antes
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  updateSetting('alarmSound', pendingAlarmSound || 'pulse');
                  setAlarmApplied(true);
                }}
              >
                {alarmApplied ? 'Aplicado' : 'Aplicar som'}
              </Button>
              <AnimatePresence>
                {alarmApplied && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    className="flex items-center gap-2 text-neon-cyan text-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Som aplicado com sucesso
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </Card>

      {/* Zona de Perigo */}
      <Card
        className={cn(
          'border-danger bg-card-bg',
          activeSection === 'danger' ? 'block' : 'hidden'
        )}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-danger flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-heading font-bold text-text-primary">
              Zona de Perigo
            </h2>
            <p className="text-sm text-text-secondary">
              Ações irreversíveis
            </p>
          </div>
          <Badge variant="danger" size="sm" className="ml-auto shrink-0">Irreversível</Badge>
        </div>

        <div className="rounded-xl border border-warning bg-warning-soft p-3 mb-4">
          <p className="text-xs sm:text-sm text-warning flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            Revise antes de confirmar: estas ações apagam dados de verdade e não podem ser desfeitas.
          </p>
        </div>

        <div className="space-y-3">
          {/* Sair da conta — não destrutivo */}
          <div className="flex flex-col gap-3 rounded-xl border border-card-border bg-row-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">Sair da conta</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Encerra a sessão neste dispositivo. Seus dados continuam salvos.
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-full sm:w-auto shrink-0 border border-card-border text-text-secondary hover:text-text-primary hover:bg-card-bg"
              onClick={handleSignOut}
              loading={isSigningOut}
              leftIcon={<LogOut className="w-4 h-4" />}
            >
              Sair da Conta
            </Button>
          </div>

          {/* Reiniciar tutorial — atenção */}
          <div className="flex flex-col gap-3 rounded-xl border border-warning bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warning">Reiniciar tutorial</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Mostra novamente o passo a passo inicial. Não apaga suas matérias nem seu progresso.
              </p>
            </div>
            {resetTutorialStep === 'idle' ? (
              <Button
                variant="secondary"
                className="w-full sm:w-auto shrink-0 border-warning text-warning hover:bg-warning-soft-strong"
                onClick={startResetTutorialFlow}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Reiniciar Tutorial
              </Button>
            ) : (
              <div className="w-full sm:w-auto sm:min-w-[260px] rounded-xl border border-warning bg-warning-soft p-3 space-y-2">
                <p className="text-xs text-warning">Confirmar reinício do tutorial?</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    className="border border-card-border text-text-secondary hover:bg-card-bg"
                    onClick={cancelResetTutorialFlow}
                    disabled={isResettingTutorial}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="secondary"
                    className="border-warning text-warning hover:bg-warning-soft-strong"
                    onClick={confirmResetTutorial}
                    loading={isResettingTutorial}
                    leftIcon={<RotateCcw className="w-4 h-4" />}
                  >
                    Confirmar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Trocar predefinição — destrutivo (reseta progresso) */}
          <div className="flex flex-col gap-3 rounded-xl border border-danger bg-danger-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-danger">Trocar predefinição de matérias</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Zera <span className="text-danger">todo o progresso</span> (matérias, blocos, histórico
                e sessões) e abre a seleção de predefinição para você recomeçar do zero.
              </p>
            </div>
            {switchPresetStep === 'idle' ? (
              <Button
                variant="secondary"
                className="w-full sm:w-auto shrink-0 border-danger text-danger hover:bg-danger-soft-strong"
                onClick={() => setSwitchPresetStep('confirm')}
                leftIcon={<LibraryBig className="w-4 h-4" />}
              >
                Trocar Predefinição
              </Button>
            ) : (
              <div className="w-full sm:w-auto sm:min-w-[260px] rounded-xl border border-danger bg-danger-soft p-3 space-y-2">
                <p className="text-xs text-danger">
                  Isso apaga todo o seu progresso e não pode ser desfeito. Continuar?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    className="border border-card-border text-text-secondary hover:bg-card-bg"
                    onClick={() => setSwitchPresetStep('idle')}
                    disabled={isSwitchingPreset}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={confirmSwitchPreset}
                    loading={isSwitchingPreset}
                    leftIcon={<LibraryBig className="w-4 h-4" />}
                  >
                    Zerar e escolher
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Resetar progresso — destrutivo */}
          <div className="flex flex-col gap-3 rounded-xl border border-danger bg-danger-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-danger">Resetar todo o progresso</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Apaga horas estudadas, sessões, simulados e estatísticas. Mantém suas matérias cadastradas.
              </p>
            </div>
            {resetProgressStep === 'idle' ? (
              <Button
                variant="secondary"
                className="w-full sm:w-auto shrink-0 border-danger text-danger hover:bg-danger-soft-strong"
                onClick={startResetProgressFlow}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Resetar Progresso
              </Button>
            ) : (
              <div className="w-full sm:w-auto sm:min-w-[260px] rounded-xl border border-danger bg-danger-soft p-3 space-y-2">
                <p className="text-xs text-danger">
                  Todo o histórico de estudos será apagado. Continuar?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    className="border border-card-border text-text-secondary hover:bg-card-bg"
                    onClick={cancelResetProgressFlow}
                    disabled={isResettingProgress}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={confirmResetProgress}
                    loading={isResettingProgress}
                    leftIcon={<RefreshCw className="w-4 h-4" />}
                  >
                    Confirmar reset
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Excluir conta — destrutivo com confirmação digitada */}
          <div className="rounded-xl border border-danger bg-danger-soft-strong p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-danger-strong flex items-center gap-2">
                  <Trash2 className="w-4 h-4 shrink-0" />
                  Excluir conta permanentemente
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Remove sua conta, todas as matérias e todo o histórico. Não há volta.
                </p>
              </div>
              <Badge variant="danger" size="sm" className="shrink-0">Etapa {deleteStep === 'idle' ? '1' : '2'} de 2</Badge>
            </div>

            {deleteStep === 'idle' ? (
              <Button
                variant="danger"
                className="w-full"
                onClick={startDeleteFlow}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                Iniciar exclusão
              </Button>
            ) : (
              <>
                <p className="text-xs text-danger">
                  Digite <span className="font-semibold text-danger-strong">EXCLUIR</span> para confirmar.
                </p>
                <input
                  ref={deleteInputRef}
                  autoFocus
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => {
                    setDeleteConfirmText(e.target.value);
                    if (deleteFeedback) setDeleteFeedback(null);
                  }}
                  disabled={isDeletingAccount}
                  placeholder="Digite EXCLUIR"
                  className="input-field border-danger focus:border-red-400 focus:shadow-none"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    className="w-full border border-card-border text-text-secondary hover:bg-card-bg"
                    onClick={cancelDeleteFlow}
                    disabled={isDeletingAccount}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={handleDeleteAccount}
                    loading={isDeletingAccount}
                    leftIcon={<Trash2 className="w-4 h-4" />}
                  >
                    Confirmar exclusão
                  </Button>
                </div>
              </>
            )}

            {deleteFeedback && (
              <p
                className={cn(
                  'text-xs',
                  deleteFeedback.type === 'error' ? 'text-danger' : 'text-neon-cyan'
                )}
              >
                {deleteFeedback.message}
              </p>
            )}
          </div>
        </div>

        {generalDangerFeedback && (
          <p
            className={cn(
              'mt-4 text-xs',
              generalDangerFeedback.type === 'error' ? 'text-danger' : 'text-neon-cyan'
            )}
          >
            {generalDangerFeedback.message}
          </p>
        )}
      </Card>
        </motion.div>
      </AnimatePresence>
      </div>
    </motion.div>
  );
}
