'use client';

/**
 * MainLayout Component
 * Envolve as paginas com sidebar, topbar e responsividade
 */

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import AppContainer from './AppContainer';
import { useLocalStorage } from '@/hooks';
import { useServerProgressSync } from '@/hooks/useServerProgressSync';
import { defaultSettings } from '@/lib/defaultSettings';
import { computeGamificationSnapshot } from '@/lib/progressSnapshot';
import {
  clearStudyNotificationSchedule,
  recalculateStudyNotificationSchedule,
} from '@/services/notificationScheduler';
import type { AnalyticsStore, StudyBlock, UserSettings } from '@/types';

interface MainLayoutProps {
  children: React.ReactNode;
}

const emptyAnalytics: AnalyticsStore = { daily: {} };

export default function MainLayout({ children }: MainLayoutProps) {
  useServerProgressSync();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();
  const [userSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);
  const [plannerBlocks] = useLocalStorage<StudyBlock[]>('nexora_planner_blocks', []);
  const [analytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', emptyAnalytics);
  const displayName = userSettings.name || session?.user?.name || 'Estudante';
  const gamification = useMemo(
    () => computeGamificationSnapshot({ plannerBlocks, analytics }),
    [plannerBlocks, analytics]
  );

  // Gerenciar sidebar responsiva
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const applyViewportState = (mobile: boolean) => {
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };

    applyViewportState(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyViewportState(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const scheduleNow = () => {
      recalculateStudyNotificationSchedule({
        blocks: plannerBlocks,
        settings: {
          notificationsEnabled: userSettings.notificationsEnabled,
          notificationMinutesBefore: userSettings.notificationMinutesBefore,
          notificationSoundEnabled: userSettings.notificationSoundEnabled,
          backlogReminderEnabled: userSettings.backlogReminderEnabled,
        },
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleNow();
      }
    };

    const handleFocus = () => {
      scheduleNow();
    };

    scheduleNow();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearStudyNotificationSchedule();
    };
  }, [
    plannerBlocks,
    userSettings.notificationsEnabled,
    userSettings.notificationMinutesBefore,
    userSettings.notificationSoundEnabled,
    userSettings.backlogReminderEnabled,
  ]);

  const sidebarWidth = sidebarCollapsed ? 80 : 260;
  const contentOffset = isMobile ? 0 : sidebarWidth;
  const contentStyle = isMobile
    ? undefined
    : {
        marginLeft: contentOffset,
      };

  return (
    <div className="h-[100dvh] min-h-[100dvh] w-full max-w-full overflow-x-hidden overflow-y-hidden bg-background flex">
      {/* Sidebar */}
      {!isMobile && (
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      {/* Area de conteudo principal */}
      <div
        style={contentStyle}
        className="relative flex h-[100dvh] min-h-0 flex-1 min-w-0 flex-col overflow-x-hidden overflow-y-hidden transition-[margin-left] duration-300 ease-in-out"
      >
        {/* Barra superior */}
        <div className="shrink-0">
          <TopBar
            user={{
              name: displayName,
              avatar: userSettings.avatar ?? session?.user?.image ?? undefined,
              level: gamification.level,
              xp: gamification.xpInCurrentLevel,
              xpToNextLevel: gamification.xpToNextLevel,
              streak: gamification.streak,
            }}
          />
        </div>

        {/* Conteudo da pagina */}
        <main className="app-main-content flex-1 min-h-0 min-w-0 w-full max-w-full overflow-y-auto">
          <AppContainer>
            <div key={pathname} className="w-full min-w-0 max-w-full">
              {children}
            </div>
          </AppContainer>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
