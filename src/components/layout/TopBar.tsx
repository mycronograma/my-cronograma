'use client';

/**
 * TopBar Component
 * Exibe estatisticas do usuario, nivel e acoes rapidas
 */

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useMemo, useRef, useEffect, useCallback, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { signOut, useSession } from 'next-auth/react';
import {
  Flame,
  Bell,
  Search,
  User,
  LogOut,
  Moon,
  Sun,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { percentage, formatNumber, cn } from '@/lib/utils';
import { useLocalStorage } from '@/hooks';
import { defaultSettings } from '@/lib/defaultSettings';
import { clearLocalDemoSession, isLocalDemoAuthEnabled } from '@/lib/localDemoAuth';
import type { AppNotification, Subject, UserSettings } from '@/types';
import AppContainer from './AppContainer';
import { navItems } from './navItems';

interface TopBarProps {
  user: {
    name: string;
    avatar?: string;
    level: number;
    xp: number;
    xpToNextLevel: number;
    streak: number;
  };
  /** Status real do dia (blocos de hoje), igual ao design Trilha. */
  today?: { done: number; total: number; minutes: number };
  examDate?: string;
  examLabel?: string;
}

interface TopBarMobileProps {
  routeTitle: string;
  user: TopBarProps['user'];
  unreadCount: number;
  theme: 'light' | 'dark';
  onToggleNotifications: () => void;
  onToggleTheme: () => void;
  notificationButtonRef: RefObject<HTMLButtonElement>;
}

interface TopBarDesktopProps {
  user: TopBarProps['user'];
  unreadCount: number;
  xpProgress: number;
  theme: 'light' | 'dark';
  onToggleNotifications: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
  notificationButtonRef: RefObject<HTMLButtonElement>;
}

const toTitleCase = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const resolveRouteTitle = (pathname: string) => {
  const matched = navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (matched) return matched.label;

  const [firstSegment] = pathname.split('/').filter(Boolean);
  if (!firstSegment) return 'my cronograma';
  return toTitleCase(decodeURIComponent(firstSegment));
};

function TopBarMobile({
  routeTitle,
  user,
  unreadCount,
  theme,
  onToggleNotifications,
  onToggleTheme,
  notificationButtonRef,
}: TopBarMobileProps) {
  const ThemeIcon = theme === 'light' ? Moon : Sun;

  return (
    <AppContainer className="flex h-14 min-w-0 items-center justify-between gap-2 sm:gap-3 lg:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 shadow-sm ring-2 ring-indigo-500/20">
          <span className="font-mono text-lg font-bold tracking-tighter text-white">T</span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-extrabold tracking-tight text-stone-900 dark:text-stone-100">Trilha</h1>
          <p className="truncate text-[10px] leading-tight font-medium text-stone-500 dark:text-stone-400">{routeTitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <motion.button
          ref={notificationButtonRef}
          whileTap={{ scale: 0.94 }}
          onClick={onToggleNotifications}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
          aria-label="Abrir notificações"
        >
          <Bell className="h-5 w-5 text-stone-600 dark:text-stone-300" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500" />
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onToggleTheme}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
          aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
        >
          <ThemeIcon className="h-5 w-5 text-stone-600 dark:text-stone-300" />
        </motion.button>

        <Link
          href="/settings"
          className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
          aria-label="Abrir perfil"
        >
          {user.avatar ? (
            <Image src={user.avatar} alt={user.name} width={32} height={32} className="h-8 w-8 rounded-full object-cover ring-2 ring-indigo-500/40" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
              <User className="h-4 w-4 text-white" />
            </div>
          )}
        </Link>
      </div>
    </AppContainer>
  );
}

function TopBarDesktop({
  user,
  unreadCount,
  xpProgress,
  theme,
  onToggleNotifications,
  onToggleTheme,
  onSignOut,
  onSearch,
  notificationButtonRef,
  today,
  examDate,
  examLabel,
}: TopBarDesktopProps & {
  onSearch: (query: string) => void;
  today?: TopBarProps['today'];
  examDate?: string;
  examLabel?: string;
}) {
  const ThemeIcon = theme === 'light' ? Moon : Sun;
  const daysLeft = examDate
    ? Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <AppContainer className="hidden min-w-0 items-center justify-between gap-3 py-3 lg:flex">
      {/* Marca e prova alvo */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 shadow-sm ring-2 ring-indigo-500/20">
          <span className="font-mono text-xl font-bold tracking-tighter text-white">T</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-stone-900 dark:text-stone-100">Trilha</span>
            <span className="hidden rounded-md bg-stone-200/60 px-2 py-0.5 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300 xl:inline-block">
              Cronograma Inteligente
            </span>
          </div>
          <p className="flex items-center gap-1.5 truncate text-xs font-medium text-stone-500 dark:text-stone-400">
            <Calendar className="h-3 w-3 shrink-0 text-indigo-500" />
            {examLabel ?? 'Planejamento & Evolução'}
            {daysLeft !== null && <span className="text-stone-400 dark:text-stone-500">• Faltam {daysLeft} dias</span>}
          </p>
        </div>
      </div>

      {/* Status do dia, sequencia, nivel e acoes */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {today && (
          <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-1.5 shadow-sm dark:border-stone-800 dark:bg-stone-900 md:flex">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Hoje: {today.done}/{today.total}</span>
            </div>
            <span className="text-stone-300 dark:text-stone-700">|</span>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-stone-400">
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
              <span>{today.minutes}m estudados</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-xs font-bold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300" title="Sequência de dias estudando">
          <Flame className="h-4 w-4 fill-amber-500 text-amber-500" />
          <span>{user.streak}</span>
          <span className="hidden font-semibold text-amber-700 dark:text-amber-400 2xl:inline">dias</span>
        </div>

        <Link href="/analytics" className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5 text-left transition-all hover:border-indigo-300 hover:bg-indigo-100/60 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:hover:border-indigo-800" title="Ver progresso e nível">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-extrabold text-white">{user.level}</div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-950 dark:text-indigo-200">
              <Award className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
              <span>Nível {user.level}</span>
            </div>
            <div className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
              {formatNumber(user.xp)} XP ({Math.round(xpProgress)}%)
            </div>
          </div>
        </Link>

        <form className="relative hidden 2xl:block" onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); onSearch(String(data.get('q') ?? '')); }}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input name="q" type="text" placeholder="Buscar matérias..." className="w-44 rounded-xl border border-stone-200 bg-white py-1.5 pl-9 pr-3 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200" />
        </form>

        <Link href="/planner" className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100" title="Ir para o cronograma e recalcular">
          <RefreshCw className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />
          <span className="hidden xl:inline">Recalcular</span>
        </Link>

        <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={onToggleTheme} className="relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60" aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}>
          <ThemeIcon className="h-5 w-5 text-stone-600 dark:text-stone-300" />
        </motion.button>

        <motion.button ref={notificationButtonRef} type="button" whileTap={{ scale: 0.9 }} onClick={onToggleNotifications} className="relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60" aria-label="Abrir notificações">
          <Bell className="h-5 w-5 text-stone-600 dark:text-stone-300" />
          {unreadCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500" />}
        </motion.button>

        <Link href="/settings" className="flex max-w-full items-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60" aria-label="Abrir perfil e configurações">
          {user.avatar ? (
            <Image src={user.avatar} alt={user.name} width={32} height={32} className="h-8 w-8 rounded-full object-cover ring-2 ring-indigo-500/40" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
              <User className="h-4 w-4 text-white" />
            </div>
          )}
          <span className="hidden max-w-[10rem] truncate text-sm font-medium text-stone-800 dark:text-stone-200 2xl:inline">{user.name}</span>
        </Link>

        <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={onSignOut} className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60" aria-label="Sair da conta" title="Sair da conta">
          <LogOut className="h-5 w-5 text-stone-600 dark:text-stone-300" />
        </motion.button>
      </div>
    </AppContainer>
  );
}

export default function TopBar({ user, today, examDate, examLabel }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [subjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [userSettings, setUserSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);

  const desktopPanelRef = useRef<HTMLDivElement | null>(null);
  const mobilePanelRef = useRef<HTMLDivElement | null>(null);
  const desktopButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastNotificationSyncRef = useRef(0);

  const xpProgress = percentage(user.xp, user.xpToNextLevel);
  const routeTitle = useMemo(() => resolveRouteTitle(pathname || '/dashboard'), [pathname]);
  const theme = userSettings.theme === 'light' ? 'light' : 'dark';
  const canUseServerNotifications = status === 'authenticated';
  const unreadCount = notifications.filter((item) => !item.read).length;

  const handleSearch = useCallback(
    (query: string) => {
      const q = query.trim();
      router.push(q ? `/subjects?search=${encodeURIComponent(q)}` : '/subjects');
    },
    [router]
  );

  const handleSignOut = useCallback(() => {
    if (isLocalDemoAuthEnabled) {
      clearLocalDemoSession();
      router.push('/login');
      return;
    }

    void signOut({ callbackUrl: '/login' });
  }, [router]);

  const toggleTheme = useCallback(() => {
    setUserSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }));
  }, [setUserSettings]);

  const formatNotificationDate = useCallback((isoDate: string) => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!canUseServerNotifications) {
      setNotifications([]);
      setNotificationsError(null);
      setIsNotificationsLoading(false);
      return;
    }

    setIsNotificationsLoading(true);
    setNotificationsError(null);

    try {
      const response = await fetch('/api/notifications', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.success) {
        setNotificationsError(payload?.error || 'Não foi possível carregar notificações.');
        return;
      }

      setNotifications(Array.isArray(payload?.data?.notifications) ? payload.data.notifications : []);
    } catch {
      setNotificationsError('Não foi possível carregar notificações.');
    } finally {
      setIsNotificationsLoading(false);
    }
  }, [canUseServerNotifications]);

  const syncNotifications = useCallback(async () => {
    if (!canUseServerNotifications) return;

    const now = Date.now();
    if (now - lastNotificationSyncRef.current < 90_000) return;
    lastNotificationSyncRef.current = now;

    try {
      await fetch('/api/notifications/sync', { method: 'POST' });
    } catch {
      // no-op
    }
  }, [canUseServerNotifications]);

  const markAllNotificationsAsRead = useCallback(async () => {
    if (unreadCount <= 0) return;

    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));

    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {
      // no-op
    }
  }, [unreadCount]);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
    );

    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationId }),
      });
    } catch {
      // no-op
    }
  }, []);

  const handleNotificationClick = useCallback(
    async (item: AppNotification) => {
      if (!item.read) {
        await markNotificationAsRead(item.id);
      }

      if (item.url) {
        setShowNotifications(false);
        router.push(item.url);
      }
    },
    [markNotificationAsRead, router]
  );

  const notificationsPanelContent = (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text-primary">Notificações</p>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllNotificationsAsRead}
              className="text-[11px] text-neon-blue hover:underline"
            >
              Marcar tudo como lida
            </button>
          )}
          <span className="text-xs text-text-muted">
            {unreadCount > 0 ? `${unreadCount} novas` : 'Sem novas'}
          </span>
        </div>
      </div>
      {isNotificationsLoading ? (
        <div className="text-sm text-text-muted">Carregando notificações...</div>
      ) : notificationsError ? (
        <div className="text-sm text-red-300">{notificationsError}</div>
      ) : notifications.length === 0 ? (
        <div className="text-sm text-text-muted">Nenhuma notificação por enquanto.</div>
      ) : (
        <div className="space-y-3 pr-1">
          {notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNotificationClick(item)}
              className={cn(
                'w-full rounded-xl border bg-card-bg/60 p-3 text-left transition-all',
                item.read ? 'border-card-border' : 'border-neon-cyan/35'
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{item.title}</p>
                {!item.read && <span className="mt-1 h-2 w-2 rounded-full bg-neon-cyan" />}
              </div>
              {item.message ? (
                <p className="mt-1 break-words text-xs text-text-secondary">{item.message}</p>
              ) : null}
              <p className="mt-2 text-[11px] text-text-muted">{formatNotificationDate(item.createdAt)}</p>
            </button>
          ))}
        </div>
      )}
    </>
  );

  useEffect(() => {
    if (!showNotifications) return;
    const refreshNotifications = async () => {
      await syncNotifications();
      await fetchNotifications();
    };
    void refreshNotifications();
  }, [fetchNotifications, showNotifications, syncNotifications]);

  useEffect(() => {
    if (!showNotifications) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (desktopPanelRef.current?.contains(target)) return;
      if (mobilePanelRef.current?.contains(target)) return;
      if (desktopButtonRef.current?.contains(target)) return;
      if (mobileButtonRef.current?.contains(target)) return;
      setShowNotifications(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotifications]);

  useEffect(() => {
    setShowNotifications(false);
  }, [pathname]);

  useEffect(() => {
    void syncNotifications();
    void fetchNotifications();
  }, [fetchNotifications, syncNotifications]);

  return (
    <>
      <header className="sticky top-0 z-30 w-full min-w-0 border-b border-stone-200 bg-stone-50/95 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/95">
        <div className="safe-area-top">
          <TopBarMobile
            routeTitle={routeTitle}
            user={user}
            unreadCount={unreadCount}
            theme={theme}
            onToggleNotifications={() => setShowNotifications((prev) => !prev)}
            onToggleTheme={toggleTheme}
            notificationButtonRef={mobileButtonRef}
          />
          <TopBarDesktop
            user={user}
            unreadCount={unreadCount}
            xpProgress={xpProgress}
            theme={theme}
            onToggleNotifications={() => setShowNotifications((prev) => !prev)}
            onToggleTheme={toggleTheme}
            onSearch={handleSearch}
            onSignOut={handleSignOut}
            notificationButtonRef={desktopButtonRef}
            today={today}
            examDate={examDate}
            examLabel={examLabel}
          />
        </div>
      </header>

      {showNotifications && (
        <>
          <button
            type="button"
            aria-label="Fechar notificações"
            onClick={() => setShowNotifications(false)}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
          />

          <div className="app-mobile-safe-overlay lg:hidden">
            <motion.div
              ref={mobilePanelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Central de notificações"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="app-mobile-safe-surface pointer-events-auto max-h-[min(70dvh,30rem)] overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-4 shadow-2xl backdrop-blur-lg"
            >
              {notificationsPanelContent}
            </motion.div>
          </div>

          <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+var(--topbar-height-desktop)+12px)] z-50 hidden lg:block">
            <AppContainer className="flex justify-end">
              <motion.div
                ref={desktopPanelRef}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="pointer-events-auto w-[22rem] max-h-[24rem] overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-4 shadow-2xl backdrop-blur-lg"
              >
                {notificationsPanelContent}
              </motion.div>
            </AppContainer>
          </div>
        </>
      )}

    </>
  );
}
