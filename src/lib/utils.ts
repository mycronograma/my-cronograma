/**
 * Nexora Utility Functions
 * Common helper functions used throughout the application
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DailyHoursByWeekday, WeekdayKey } from '@/types';

// ============================================
// Class Name Utilities
// ============================================

/**
 * Merge Tailwind classes with clsx
 * Handles conditional classes and removes conflicts
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================
// Time & Date Utilities
// ============================================

/**
 * Format time string (HH:MM) to display format
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format minutes to hours and minutes display
 */
export function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  if (safeMinutes < 60) return `${safeMinutes} min`;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Format decimal hours to display duration (e.g. 0.8 -> 50 min, 1.8 -> 1:50)
 */
export function formatHoursDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 min';

  const safeHours = Math.max(0, hours);
  const hasSingleDecimalPrecision =
    Math.abs(safeHours * 10 - Math.round(safeHours * 10)) < 0.000001;

  let minutes = safeHours * 60;

  // Legacy snapshots sometimes store hours with only one decimal place (e.g. 0.8),
  // which can display odd values like 48 min for a 50 min block.
  if (hasSingleDecimalPrecision) {
    const roundingStep = minutes < 30 ? 5 : 10;
    minutes = Math.round(minutes / roundingStep) * roundingStep;
  }

  return formatDuration(minutes);
}

/**
 * Get time string from Date object
 */
export function getTimeString(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

/**
 * Parse time string to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string
 */
export function minutesToTime(totalMinutes: number): string {
  // Clamp explícito no fim do dia: o `% 24` anterior fazia 23:50 + 30min virar
  // "00:20", criando blocos com endTime anterior ao startTime.
  const safeMinutes = Math.min(24 * 60 - 1, Math.max(0, Math.round(totalMinutes)));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Minutos realmente estudados num bloco concluído.
 *
 * `durationMinutes` é a duração PLANEJADA e nunca deve ser sobrescrita: era isso
 * que fazia a agenda mostrar "09:00 - 19:08" para um bloco de 50 minutos. O tempo
 * real vai em `actualMinutes`. Quando o campo não existe (blocos gravados antes
 * da mudança), cai em `durationMinutes` — nesses blocos antigos o valor já é o real,
 * porque era assim que ele era sobrescrito.
 */
export function studiedMinutes(block: {
  durationMinutes: number;
  actualMinutes?: number;
}): number {
  const real = block.actualMinutes;
  if (typeof real === 'number' && Number.isFinite(real) && real >= 0) {
    return Math.max(0, Math.round(real));
  }
  return Math.max(0, Math.round(block.durationMinutes || 0));
}

/** Duração planejada do bloco, em minutos. */
export function plannedMinutes(block: { durationMinutes: number }): number {
  return Math.max(0, Math.round(block.durationMinutes || 0));
}

// ============================================
// Weekly load helpers (fonte única de verdade)
// ============================================

export const WEEKDAY_KEYS: readonly WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

/**
 * Horas planejadas para uma data, respeitando a configuração por dia da semana.
 * Cai em `fallbackHours` quando o dia não está configurado.
 */
export function getHoursForDate(
  date: Date,
  dailyHoursByWeekday?: Partial<DailyHoursByWeekday> | null,
  fallbackHours = 0
): number {
  if (!dailyHoursByWeekday) return Math.max(0, fallbackHours);
  const key = WEEKDAY_KEYS[date.getDay()];
  const value = dailyHoursByWeekday[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : Math.max(0, fallbackHours);
}

/**
 * Meta semanal em horas: soma das horas configuradas para cada dia da semana.
 * Dias de descanso (0h) não entram na meta — antes a meta era
 * `hoursPerDay * 7`, o que tornava o progresso semanal inatingível para quem
 * não estuda todos os dias.
 */
export function getWeeklyGoalHours(
  dailyHoursByWeekday?: Partial<DailyHoursByWeekday> | null,
  fallbackHours = 0
): number {
  if (!dailyHoursByWeekday) return Math.max(0, fallbackHours * 7);
  return WEEKDAY_KEYS.reduce((total, key) => {
    const value = dailyHoursByWeekday[key];
    return total + (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0);
  }, 0);
}

/**
 * Get the start of the current week (Monday)
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format date for display
 */
export function formatDate(date: Date, format: 'short' | 'long' | 'iso' = 'short'): string {
  switch (format) {
    case 'short':
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    case 'long':
      return date.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    case 'iso':
      return toLocalDateKey(date);
    default:
      return date.toLocaleDateString();
  }
}

/**
 * Build a local date key (YYYY-MM-DD) without UTC conversion.
 */
export function toLocalDateKey(value: Date | string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Parse a local date key (YYYY-MM-DD) to local midnight Date.
 */
export function parseLocalDateKey(value?: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse a block date (Date, date-only string or ISO timestamp) into a local
 * midnight Date.
 *
 * Two conventions coexist in the app:
 *  - the backend stores "date only" as UTC midnight (2026-09-28T00:00:00.000Z),
 *    so the UTC calendar fields are the intended day;
 *  - the client creates local midnight Dates, which serialize to an ISO string
 *    with an offset (2026-09-28T03:00:00.000Z in UTC-3), so the LOCAL calendar
 *    fields are the intended day.
 *
 * Reading both with the same rule shifts blocks by one day for part of the
 * users, so: exact UTC midnight => use UTC fields, any other instant => use
 * local fields.
 */
export function parseBlockDate(value?: Date | string | null): Date {
  if (!value) return new Date(Number.NaN);

  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, year, month, day] = dateOnly.map(Number);
      const parsed = new Date(year, month - 1, day);
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    }
  }

  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(instant.getTime())) return instant;

  const isUtcMidnight =
    instant.getUTCHours() === 0 &&
    instant.getUTCMinutes() === 0 &&
    instant.getUTCSeconds() === 0 &&
    instant.getUTCMilliseconds() === 0;

  const parsed = isUtcMidnight
    ? new Date(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate())
    : new Date(instant.getFullYear(), instant.getMonth(), instant.getDate());
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

/**
 * Get day name from date
 */
export function getDayName(date: Date, format: 'short' | 'long' = 'short'): string {
  return date.toLocaleDateString('pt-BR', {
    weekday: format === 'short' ? 'short' : 'long'
  });
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Get array of dates for current week
 */
export function getWeekDates(startDate: Date = getWeekStart()): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
}

// ============================================
// Number & Stats Utilities
// ============================================

/**
 * Calculate percentage with bounds
 */
export function percentage(value: number, total: number, decimals: number = 0): number {
  if (total === 0) return 0;
  const pct = (value / total) * 100;
  return Math.min(100, Math.max(0, Number(pct.toFixed(decimals))));
}

/**
 * Format large numbers with K/M suffixes
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Generate random number in range
 */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================
// Gamification Utilities
// ============================================

/**
 * Calculate XP required for a level
 * Uses exponential scaling: base * (multiplier ^ level)
 */
export function xpForLevel(level: number): number {
  const base = 100;
  const multiplier = 1.5;
  return Math.floor(base * Math.pow(multiplier, level - 1));
}

/**
 * Calculate total XP required to reach a level
 */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

/**
 * Calculate level from total XP
 */
export function levelFromXp(totalXp: number): { level: number; xpInLevel: number; xpForNext: number } {
  let level = 1;
  let remainingXp = totalXp;
  
  while (remainingXp >= xpForLevel(level)) {
    remainingXp -= xpForLevel(level);
    level++;
  }
  
  return {
    level,
    xpInLevel: remainingXp,
    xpForNext: xpForLevel(level),
  };
}

/**
 * Calculate XP earned from a study session
 */
export function calculateSessionXp(
  minutes: number, 
  focusScore: number, 
  difficulty: number,
  streakBonus: number = 0
): number {
  // Input validation
  const safeMinutes = Math.max(0, Number.isFinite(minutes) ? minutes : 0);
  const safeFocusScore = Math.max(0, Math.min(100, Number.isFinite(focusScore) ? focusScore : 0));
  const safeDifficulty = Math.max(1, Math.min(10, Number.isFinite(difficulty) ? difficulty : 5));
  const safeStreakBonus = Math.max(0, Number.isFinite(streakBonus) ? streakBonus : 0);
  
  // Base XP: 1 XP per minute
  let xp = safeMinutes;
  
  // Focus multiplier: 0.5x to 1.5x based on focus score
  const focusMultiplier = 0.5 + (safeFocusScore / 100);
  xp *= focusMultiplier;
  
  // Difficulty bonus: up to 50% extra for hard subjects
  const difficultyBonus = 1 + (safeDifficulty / 20);
  xp *= difficultyBonus;
  
  // Streak bonus: 5% per streak day, max 50%
  const streakMultiplier = 1 + Math.min(safeStreakBonus * 0.05, 0.5);
  xp *= streakMultiplier;
  
  return Math.floor(xp);
}

// ============================================
// Color Utilities
// ============================================

/**
 * Predefined subject colors
 */
export const subjectColors = [
  '#00B4FF', // Neon Blue
  '#7F00FF', // Neon Purple
  '#00FFC8', // Neon Cyan
  '#FF00AA', // Neon Pink
  '#FFAA00', // Orange
  '#00FF88', // Green
  '#FF5555', // Red
  '#AA88FF', // Lavender
];

/**
 * Get a color based on index
 */
export function getColorByIndex(index: number): string {
  return subjectColors[index % subjectColors.length];
}

/**
 * Convert hex to RGBA
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================
// String Utilities
// ============================================

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  const maxLength = Math.max(0, Math.floor(length));
  if (str.length <= maxLength) return str;
  // Com length < 4, `length - 3` ficava negativo e o slice devolvia uma string
  // maior que a original (ex.: truncate('abcdef', 2) === 'abcde...').
  if (maxLength <= 3) return str.slice(0, maxLength);
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================
// Validation Utilities
// ============================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate time format (HH:MM)
 */
export function isValidTime(time: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}
