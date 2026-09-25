'use client';

/**
 * Sidebar Component
 * Barra lateral retratil com logo e navegacao
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { navItems } from './navItems';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const isActiveRoute = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 h-[100dvh]',
        isCollapsed ? 'w-20' : 'w-[260px]',
        'flex flex-col',
        'bg-background-light/80 backdrop-blur-glass',
        'border-r border-card-border transition-[width] duration-300 ease-in-out'
      )}
      data-tutorial="sidebar"
    >
      <div className="flex items-center justify-between p-4 h-16 border-b border-card-border">
        <Link
          href="/dashboard"
          className="flex items-center gap-3"
          data-tutorial="nav-dashboard"
        >
          <div className="flex items-center gap-3">
            <Image src="/icon.svg" alt="Nexora" width={40} height={40} className="rounded-xl shadow-lg flex-shrink-0" />
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="text-base font-heading font-extrabold tracking-tight text-violet-400">my</span>
                  <span className="text-base font-heading font-extrabold tracking-tight text-text-primary">cronograma</span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 ml-0.5"></span>
                </div>
                <span className="text-[9px] font-semibold text-text-muted tracking-[0.2em] uppercase mt-0.5">
                  Estudo Inteligente
                </span>
              </div>
            )}
          </div>
        </Link>
      </div>

<nav className="flex-1 p-3 max-sm:p-2.5 space-y-1.5 max-sm:space-y-1.5">
        {navItems.map((item) => {
          const isActive = isActiveRoute(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              data-tutorial={`nav-${item.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'nav-item group relative min-w-0 overflow-hidden transition-all duration-200',
                'hover:translate-x-1',
                isActive && 'active'
              )}
            >
              {isActive && (
                <span className="pointer-events-none absolute inset-0 bg-neon-blue/10 rounded-xl" />
              )}

              <Icon
                className={cn(
                  'w-5 h-5 relative z-10 flex-shrink-0',
                  isActive ? 'text-neon-blue' : 'text-text-secondary'
                )}
              />

              {!isCollapsed && (
                <span
                  className={cn(
                    'relative z-10 min-w-0 truncate font-medium text-sm',
                    isActive ? 'text-white' : 'text-text-secondary'
                  )}
                >
                  {item.label}
                </span>
              )}

              {!isCollapsed && item.badge && (
                <span
                  className={cn(
                    'ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full',
                    item.badgeVariant === 'purple' && 'bg-neon-purple/20 text-neon-purple',
                    item.badgeVariant === 'amber' && 'bg-amber-500/20 text-amber-400',
                    item.badgeVariant === 'blue' && 'bg-neon-blue/20 text-neon-blue'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-card-border">
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center justify-center gap-2',
            'p-3 rounded-xl',
            'bg-card-bg border border-card-border',
            'text-text-secondary hover:text-white',
            'transition-colors duration-200'
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
