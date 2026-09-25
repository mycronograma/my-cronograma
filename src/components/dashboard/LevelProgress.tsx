'use client';

/**
 * LevelProgress Component
 * Exibe nível do usuário, progresso de XP e marcos de consistência
 */

import { cn, percentage } from '@/lib/utils';
import ProgressBar from '@/components/ui/ProgressBar';

interface LevelProgressProps {
  level: number;
  xp: number;
  levelUpXP: number;
  streakDays: number;
  longestStreak: number;
  todaySessions: number;
  className?: string;
}

export default function LevelProgress({
  level,
  xp,
  levelUpXP,
  streakDays,
  longestStreak,
  todaySessions,
  className,
}: LevelProgressProps) {
  const safeXpForNext = levelUpXP > 0 ? levelUpXP : 0;
  const safeXp = Math.max(0, xp);
  // Evita progresso/XP restante negativos quando xp ultrapassa o nível atual.
  const progress = safeXpForNext > 0 ? Math.min(100, percentage(safeXp, safeXpForNext)) : 0;
  const xpNeeded = safeXpForNext > 0 ? Math.max(0, safeXpForNext - safeXp) : 0;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-white">{level}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text-primary">Nível {level}</p>
          <p className="text-xs text-text-secondary">
            {safeXpForNext > 0
              ? `${xpNeeded} XP para o próximo nível`
              : 'Complete sessões para ganhar XP'}
          </p>
        </div>
        <span className="ml-auto text-xs font-bold text-text-muted">{Math.round(progress)}%</span>
      </div>
      <ProgressBar value={safeXp} max={safeXpForNext || 1} className="h-1.5" />
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] text-text-muted">
        <span>🔥 {streakDays} dias seguidos</span>
        <span>🏆 Recorde: {longestStreak} dias</span>
        <span>✅ {todaySessions} {todaySessions === 1 ? 'sessão hoje' : 'sessões hoje'}</span>
      </div>
    </div>
  );
}
