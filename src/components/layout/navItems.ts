import {
  Home,
  CalendarDays,
  BookOpen,
  TrendingUp,
  RotateCw,
  Trophy,
  User,
  Settings,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
  badgeVariant?: 'purple' | 'amber' | 'blue';
}

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Início', icon: Home, href: '/dashboard' },
  { id: 'planner', label: 'Cronograma', icon: CalendarDays, href: '/planner' },
  { id: 'subjects', label: 'Matérias', icon: BookOpen, href: '/subjects' },
  { id: 'analytics', label: 'Progresso', icon: TrendingUp, href: '/analytics' },
  { id: 'settings', label: 'Perfil', icon: User, href: '/settings' },
];
