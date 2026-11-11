'use client';

/**
 * Abas de navegação no topo (padrão do design "Trilha").
 *
 * Substituem a Sidebar no desktop: pills horizontais ligadas às rotas reais
 * do app (navItems). No mobile a navegação continua sendo o BottomNav.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navItems } from './navItems';

interface NavigationTabsProps {
  /** Contador opcional por item (ex.: pendentes de hoje no Início). */
  badges?: Record<string, number | undefined>;
}

export default function NavigationTabs({ badges }: NavigationTabsProps) {
  const pathname = usePathname();
  const isActiveRoute = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Navegação principal"
      className="hidden border-b border-stone-200 bg-stone-100/70 dark:border-stone-800 dark:bg-stone-900/60 lg:block"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-start gap-1.5 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isActiveRoute(item.href);
          const badge = badges?.[item.id];
          return (
            <Link
              key={item.id}
              href={item.href}
              data-tutorial={`nav-${item.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition-all',
                isActive
                  ? 'border border-stone-200 bg-white text-indigo-900 shadow-sm dark:border-stone-700 dark:bg-stone-800 dark:text-indigo-300'
                  : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-200'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4',
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-stone-400 dark:text-stone-500'
                )}
              />
              <span>{item.label}</span>
              {badge !== undefined && badge > 0 && (
                <span
                  className={cn(
                    'ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'bg-stone-300 text-stone-700 dark:bg-stone-700 dark:text-stone-300'
                  )}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
