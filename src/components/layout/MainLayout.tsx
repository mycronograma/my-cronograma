'use client';

/**
 * MainLayout Component
 * Envolve as paginas com sidebar, topbar e responsividade
 */

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import NavigationTabs from './NavigationTabs';
import AppContainer from './AppContainer';
import { WelcomeTutorial } from '@/components/onboarding';
import { useLocalStorage } from '@/hooks';
import { useServerProgressSync } from '@/hooks/useServerProgressSync';
import { defaultSettings } from '@/lib/defaultSettings';
import { computeGamificationSnapshot } from '@/lib/progressSnapshot';
import { parseBlockDate, studiedMinutes, toLocalDateKey } from '@/lib/utils';
import type { AnalyticsStore, StudyBlock, UserSettings } from '@/types';

interface MainLayoutProps {
  children: React.ReactNode;
}

const emptyAnalytics: AnalyticsStore = { daily: {} };

export default function MainLayout({ children }: MainLayoutProps) {
  useServerProgressSync();
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

  // Status real do dia para a Navbar (padrao do design Trilha):
  // blocos de hoje concluidos/total e minutos efetivamente estudados.
  const today = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());
    const blocksToday = plannerBlocks.filter(
      (block) => !block.isBreak && toLocalDateKey(parseBlockDate(block.date)) === todayKey
    );
    return {
      done: blocksToday.filter((block) => block.status === 'completed').length,
      total: blocksToday.length,
      minutes: Math.round(
        blocksToday
          .filter((block) => block.status === 'completed')
          .reduce((sum, block) => sum + studiedMinutes(block), 0)
      ),
    };
  }, [plannerBlocks]);

  const examLabel = userSettings.examDate ? 'Prova alvo' : undefined;

  return (
    <div className="h-[100dvh] min-h-[100dvh] w-full max-w-full overflow-x-hidden overflow-y-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100 flex">
      {/* Area de conteudo principal */}
      <div className="relative flex h-[100dvh] min-h-0 flex-1 min-w-0 flex-col overflow-x-hidden overflow-y-hidden">
        {/* Barra superior (Navbar do design) */}
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
            today={today}
            examDate={userSettings.examDate}
            examLabel={examLabel}
          />
          {/* Abas de navegacao no topo (desktop) */}
          <NavigationTabs badges={{ dashboard: today.total - today.done }} />
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

      {/* Tutorial de primeira vez (aparece uma única vez) */}
      <WelcomeTutorial />
    </div>
  );
}
