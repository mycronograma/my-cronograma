'use client';

/**
 * LevelProgress Component
 * Exibe nível do usuário, progresso de XP e próximo marco
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Star, Zap, Target } from 'lucide-react';
import { cn, formatNumber, percentage } from '@/lib/utils';
import Card from '@/components/ui/Card';
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
  const progress = safeXpForNext > 0 ? percentage(xp, safeXpForNext) : 0;
  const xpNeeded = safeXpForNext > 0 ? safeXpForNext - xp : 0;

  const totalXp = useMemo(() => {
    return level === 1 ? xp : xp + (level - 1) * 1000;
  }, [level, xp]);

  const achievements = useMemo(() => {
    return streakDays;
  }, [streakDays]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Nível {level}</p>
          <p className="text-xs text-text-secondary">{xpNeeded} XP para o próximo nível</p>
        </div>
      </div>
      <ProgressBar value={xp} max={safeXpForNext || 1} className="h-1.5" />
      <div className="flex justify-between text-[11px] text-text-muted">
        <span>🔥 {streakDays} dias seguidos</span>
        <span>🏆 {achievements} conquistas</span>
      </div>
    </div>
  );
}

