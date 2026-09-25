/**
 * Gamification Service
 * Handles XP, levels, streaks, and achievements
 */

import type { User, Achievement, UserAchievement, StudySession } from '@/types';
import { xpForLevel, levelFromXp, calculateSessionXp, isSameDay } from '@/lib/utils';

/**
 * Achievement definitions
 */
export const ACHIEVEMENTS: Achievement[] = [
  // Streak achievements
  {
    id: 'streak-3',
    name: 'Primeiro Ritmo',
    description: 'Mantenha uma sequência de 3 dias de estudo',
    icon: 'flame',
    xpReward: 50,
    condition: { type: 'streak', value: 3 },
    rarity: 'common',
  },
  {
    id: 'streak-7',
    name: 'Semana Fechada',
    description: 'Mantenha uma sequência de 7 dias de estudo',
    icon: 'flame',
    xpReward: 150,
    condition: { type: 'streak', value: 7 },
    rarity: 'rare',
  },
  {
    id: 'streak-30',
    name: 'Mês Imparável',
    description: 'Mantenha uma sequência de 30 dias de estudo',
    icon: 'flame',
    xpReward: 500,
    condition: { type: 'streak', value: 30 },
    rarity: 'epic',
  },
  {
    id: 'streak-100',
    name: 'Cem Dias de Foco',
    description: 'Mantenha uma sequência de 100 dias de estudo',
    icon: 'crown',
    xpReward: 2000,
    condition: { type: 'streak', value: 100 },
    rarity: 'legendary',
  },
  
  // Hours achievements
  {
    id: 'hours-10',
    name: 'Primeiras Horas',
    description: 'Estude por 10 horas no total',
    icon: 'clock',
    xpReward: 100,
    condition: { type: 'hours', value: 10 },
    rarity: 'common',
  },
  {
    id: 'hours-50',
    name: 'Estudante Dedicado',
    description: 'Estude por 50 horas no total',
    icon: 'clock',
    xpReward: 300,
    condition: { type: 'hours', value: 50 },
    rarity: 'rare',
  },
  {
    id: 'hours-100',
    name: 'Busca pelo Domínio',
    description: 'Estude por 100 horas no total',
    icon: 'clock',
    xpReward: 600,
    condition: { type: 'hours', value: 100 },
    rarity: 'epic',
  },
  {
    id: 'hours-500',
    name: 'Maratona Concluída',
    description: 'Estude por 500 horas no total',
    icon: 'graduation-cap',
    xpReward: 3000,
    condition: { type: 'hours', value: 500 },
    rarity: 'legendary',
  },
  
  // Session achievements
  {
    id: 'sessions-10',
    name: 'Constância Inicial',
    description: 'Complete 10 sessões de estudo',
    icon: 'check-circle',
    xpReward: 75,
    condition: { type: 'sessions', value: 10 },
    rarity: 'common',
  },
  {
    id: 'sessions-50',
    name: 'Rotina Forte',
    description: 'Complete 50 sessões de estudo',
    icon: 'check-circle',
    xpReward: 250,
    condition: { type: 'sessions', value: 50 },
    rarity: 'rare',
  },
  {
    id: 'sessions-100',
    name: 'Cem Sessões',
    description: 'Complete 100 sessões de estudo',
    icon: 'trophy',
    xpReward: 500,
    condition: { type: 'sessions', value: 100 },
    rarity: 'epic',
  },
  
  // Level achievements
  {
    id: 'level-5',
    name: 'Subindo de Nível',
    description: 'Alcance o nível 5',
    icon: 'star',
    xpReward: 200,
    condition: { type: 'level', value: 5 },
    rarity: 'common',
  },
  {
    id: 'level-10',
    name: 'Veterano dos Estudos',
    description: 'Alcance o nível 10',
    icon: 'star',
    xpReward: 400,
    condition: { type: 'level', value: 10 },
    rarity: 'rare',
  },
  {
    id: 'level-25',
    name: 'Mente de Elite',
    description: 'Alcance o nível 25',
    icon: 'zap',
    xpReward: 1000,
    condition: { type: 'level', value: 25 },
    rarity: 'epic',
  },
  {
    id: 'level-50',
    name: 'Lenda dos Estudos',
    description: 'Alcance o nível 50',
    icon: 'crown',
    xpReward: 5000,
    condition: { type: 'level', value: 50 },
    rarity: 'legendary',
  },
];

/**
 * Calculate XP earned from completing a study session
 */
export function calculateXpFromSession(
  session: StudySession,
  difficulty: number,
  streak: number
): number {
  return calculateSessionXp(
    session.actualMinutes,
    session.focusScore,
    difficulty,
    streak
  );
}

/**
 * Update user's streak based on study activity
 */
export function updateStreak(user: User, studyDate: Date = new Date()): {
  streak: number;
  longestStreak: number;
  streakBroken: boolean;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const studyDay = new Date(studyDate);
  studyDay.setHours(0, 0, 0, 0);
  
  const lastStudy = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
  if (lastStudy) {
    lastStudy.setHours(0, 0, 0, 0);
  }
  
  let newStreak = user.streak;
  let streakBroken = false;
  
  if (!lastStudy) {
    // First ever study session
    newStreak = 1;
  } else if (isSameDay(studyDay, lastStudy)) {
    // Same day, streak unchanged
    newStreak = user.streak;
  } else {
    // Check if this is consecutive
    const dayDiff = Math.floor(
      (studyDay.getTime() - lastStudy.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (dayDiff === 1) {
      // Consecutive day
      newStreak = user.streak + 1;
    } else if (dayDiff > 1) {
      // Streak broken
      newStreak = 1;
      streakBroken = true;
    }
  }
  
  const longestStreak = Math.max(user.longestStreak, newStreak);
  
  return {
    streak: newStreak,
    longestStreak,
    streakBroken,
  };
}

/**
 * Check which achievements should be unlocked
 */
export function checkAchievements(
  user: User,
  totalHours: number,
  totalSessions: number,
  unlockedIds: Set<string>
): Achievement[] {
  const newlyUnlocked: Achievement[] = [];
  
  for (const achievement of ACHIEVEMENTS) {
    // Skip if already unlocked
    if (unlockedIds.has(achievement.id)) continue;
    
    let shouldUnlock = false;
    
    switch (achievement.condition.type) {
      case 'streak':
        shouldUnlock = user.streak >= achievement.condition.value;
        break;
      case 'hours':
        shouldUnlock = totalHours >= achievement.condition.value;
        break;
      case 'sessions':
        shouldUnlock = totalSessions >= achievement.condition.value;
        break;
      case 'level':
        shouldUnlock = user.level >= achievement.condition.value;
        break;
    }
    
    if (shouldUnlock) {
      newlyUnlocked.push(achievement);
    }
  }
  
  return newlyUnlocked;
}

/**
 * Process a completed study session
 * Returns updated user data and any new achievements
 */
export function processSessionCompletion(
  user: User,
  session: StudySession,
  subjectDifficulty: number,
  totalHours: number,
  totalSessions: number,
  unlockedAchievementIds: Set<string>
): {
  xpEarned: number;
  newLevel: number;
  newXp: number;
  streakUpdate: { streak: number; longestStreak: number; streakBroken: boolean };
  newAchievements: Achievement[];
  totalAchievementXp: number;
} {
  // Calculate XP from session
  const sessionXp = calculateXpFromSession(session, subjectDifficulty, user.streak);
  
  // Update streak
  const streakUpdate = updateStreak(user, session.startedAt);
  
  // Update user for achievement check
  const updatedUser: User = {
    ...user,
    streak: streakUpdate.streak,
    longestStreak: streakUpdate.longestStreak,
  };
  
  // Check for new achievements
  const newAchievements = checkAchievements(
    updatedUser,
    totalHours,
    totalSessions,
    unlockedAchievementIds
  );
  
  // Calculate total XP including achievement rewards
  const achievementXp = newAchievements.reduce((sum, a) => sum + a.xpReward, 0);
  let totalXpEarned = sessionXp + achievementXp;

  // Calculate new level
  let newTotalXp = user.xp + totalXpEarned;
  let levelData = levelFromXp(newTotalXp);

  // Check for level-up achievements (and include their XP)
  if (levelData.level > user.level) {
    const levelAchievements = checkAchievements(
      { ...updatedUser, level: levelData.level },
      totalHours,
      totalSessions,
      new Set([
        ...Array.from(unlockedAchievementIds),
        ...newAchievements.map((a) => a.id),
      ])
    );
    if (levelAchievements.length > 0) {
      newAchievements.push(...levelAchievements);
      const extraXp = levelAchievements.reduce((sum, a) => sum + a.xpReward, 0);
      totalXpEarned += extraXp;
      newTotalXp += extraXp;
      levelData = levelFromXp(newTotalXp);
    }
  }

  return {
    xpEarned: totalXpEarned,
    newLevel: levelData.level,
    newXp: newTotalXp,
    streakUpdate,
    newAchievements,
    totalAchievementXp: totalXpEarned - sessionXp,
  };
}

/**
 * Get level title based on level number
 */
export function getLevelTitle(level: number): string {
  if (level >= 50) return 'Lenda dos Estudos';
  if (level >= 40) return 'Mente Mestra';
  if (level >= 30) return 'Especialista';
  if (level >= 25) return 'Estudante de Elite';
  if (level >= 20) return 'Estudante Sênior';
  if (level >= 15) return 'Estudante Dedicado';
  if (level >= 10) return 'Em Ascensão';
  if (level >= 5) return 'Aprendiz';
  return 'Iniciante';
}

/**
 * Get rarity color for achievements
 */
export function getRarityColor(rarity: string): string {
  switch (rarity) {
    case 'legendary':
      return '#FFD700'; // Gold
    case 'epic':
      return '#7F00FF'; // Purple
    case 'rare':
      return '#00B4FF'; // Blue
    default:
      return '#8892A6'; // Gray
  }
}

// ============================================
// MOTOR DE PROFICIÊNCIA (Foco em Aprovação)
// Algoritmo inspirado em Elo Rating + TRI
// ============================================

/** Constantes do sistema de proficiência */
const K_FACTOR = 32;            // Velocidade de ajuste da proficiência
const BASE_XP_PER_MIN = 1;      // XP básico de consistência: 1 XP por minuto

/** Mapeamento de dificuldade para score esperado da questão (0-1000) */
const DIFFICULTY_SCORE_MAP: Record<'EASY' | 'MEDIUM' | 'HARD', number> = {
  EASY: 350,
  MEDIUM: 600,
  HARD: 820,
};

interface SessionPerformance {
  questionsDone: number;
  correctAnswers: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

interface SubjectState {
  proficiencyScore: number; // 0 a 1000
  examWeight: number;       // 0 a 10
}

export interface SessionResult {
  /** XP de consistência ganho (simples, 1/min) */
  earnedXp: number;
  /** Proficiência anterior */
  oldProficiency: number;
  /** Nova proficiência calculada */
  newProficiency: number;
  /** Delta de proficiência com sinal (+/-) */
  proficiencyDelta: number;
  /** Minutos líquidos validados */
  netMinutes: number;
}

/**
 * Calcula o delta de proficiência baseado no desempenho real vs. esperado.
 * Implementa uma simplificação do algoritmo Elo/TRI:
 * - Se o aluno acertou mais do que a expectativa → proficiência sobe
 * - Se o aluno acertou menos do que a expectativa → proficiência desce
 */
export function calculateProficiencyDelta(
  performance: SessionPerformance,
  currentProficiency: number
): number {
  if (performance.questionsDone === 0) return 0;

  const sessionDiffScore = DIFFICULTY_SCORE_MAP[performance.difficulty];

  // Taxa de acerto real (0 a 1)
  const actualScore = performance.correctAnswers / performance.questionsDone;

  // Expectativa de acerto: fórmula logística (Elo)
  // Se proficiência >> dificuldade → expectativa alta (quase 1)
  // Se proficiência << dificuldade → expectativa baixa (quase 0)
  const expectedScore = 1 / (1 + Math.pow(10, (sessionDiffScore - currentProficiency) / 400));

  // Delta bruto
  const rawDelta = K_FACTOR * (actualScore - expectedScore);

  // Multiplicador de volume: poucas questões (< 5) têm pouco peso;
  // 15+ questões têm peso máximo para evitar volatilidade em amostras pequenas.
  const volumeMultiplier = Math.min(1, performance.questionsDone / 15);

  return rawDelta * volumeMultiplier;
}

/**
 * Calcula o tempo líquido real de uma sessão a partir de timestamps absolutos.
 * Garante precisão mesmo se o navegador throttlou os timers em background.
 *
 * @param startTimestamp - Date.now() no momento de iniciar
 * @param endTimestamp   - Date.now() no momento de finalizar
 * @param pausedMs       - Total de milissegundos em pausa
 */
export function calculateNetMinutes(
  startTimestamp: number,
  endTimestamp: number,
  pausedMs: number = 0
): number {
  const totalElapsedMs = endTimestamp - startTimestamp;
  const netMs = Math.max(0, totalElapsedMs - pausedMs);
  return Math.round(netMs / 60000); // converte para minutos inteiros
}

/**
 * Motor principal de processamento de sessão de estudo.
 * Calcula XP de consistência E atualiza a Proficiência da matéria.
 *
 * @param netMinutes    - Minutos líquidos estudados (calculados via calculateNetMinutes)
 * @param subjectState  - Estado atual da matéria (proficiência, peso)
 * @param performance   - Dados de exercícios (opcional; sem exercícios → proficiência não muda)
 */
export function processStudySession(
  netMinutes: number,
  subjectState: SubjectState,
  performance?: SessionPerformance
): SessionResult {

  // 1. XP de Consistência: recompensa mecânica por ter estudado
  //    Bônus pequeno de streak já é tratado na camada de cálculo de nível
  const earnedXp = netMinutes * BASE_XP_PER_MIN;

  // 2. Motor de Proficiência: só muda se houve questões
  let proficiencyDelta = 0;
  let newProficiency = subjectState.proficiencyScore;

  if (performance && performance.questionsDone > 0) {
    proficiencyDelta = calculateProficiencyDelta(performance, subjectState.proficiencyScore);
    newProficiency = subjectState.proficiencyScore + proficiencyDelta;

    // Limites: proficiência é sempre entre 0 e 1000
    newProficiency = Math.max(0, Math.min(1000, newProficiency));
  }

  return {
    earnedXp,
    oldProficiency: subjectState.proficiencyScore,
    newProficiency: Math.round(newProficiency),
    proficiencyDelta,
    netMinutes,
  };
}

/**
 * Recalcula o Global Readiness Score do usuário.
 * É a média ponderada das proficiências de todas as matérias ativas,
 * usando o examWeight de cada uma como fator de ponderação.
 *
 * @param subjects - Lista de matérias do usuário
 */
export function calculateGlobalReadiness(
  subjects: Array<{ proficiencyScore: number; examWeight: number; isActive: boolean }>
): number {
  const active = subjects.filter(s => s.isActive && s.examWeight > 0);
  if (active.length === 0) return 0;

  const totalWeight = active.reduce((sum, s) => sum + s.examWeight, 0);
  const weightedSum = active.reduce((sum, s) => sum + (s.proficiencyScore * s.examWeight), 0);

  return Math.round(weightedSum / totalWeight);
}
