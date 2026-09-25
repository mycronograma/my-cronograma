/**
 * Restrições de agenda compartilhadas.
 *
 * Existiam duas implementações do "como transformar as preferências do usuário
 * em limites de geração": uma dentro de `POST /api/planner/generate` e outra
 * implícita no botão "Gerar com IA" do Planner (que simplesmente não enviava
 * `restDays`, `dailyLimitByDate`, `dailyTimeWindowByDate` nem `simuladoRules`).
 *
 * Resultado prático: para 3h seg–sex + 2h sáb configurados no Settings, a API
 * gerava 17h/semana enquanto o botão do Planner gerava 22,8h/semana (+34%).
 * Este módulo é a fonte única dessas regras para os dois caminhos.
 */

import { minutesToTime, parseLocalDateKey, timeToMinutes, toLocalDateKey, getHoursForDate } from '@/lib/utils';
import type { StudyPreferences, UserSettings, WeekdayKey } from '@/types';

export const WEEKDAY_KEYS: readonly WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

export type DailyTimeWindow = { start: string; end: string };

export interface SimuladoRules {
  minLessonsBeforeSimulated: number;
  minPracticeBeforeSimulated: number;
  minLessonsPerSubject: number;
  minDaysBeforeSimulated: number;
  frequencyDays: number;
  minLessonsBeforeAreaSimulated: number;
  minDaysBeforeAreaSimulated: number;
}

export interface ScheduleConstraints {
  restDays: number[];
  dailyLimitByDate: Record<string, number>;
  dailyTimeWindowByDate: Record<string, DailyTimeWindow>;
  preferredStart: string;
  preferredEnd: string;
  maxBlockMinutes: number;
  breakMinutes: number;
  simuladoRules: SimuladoRules;
}

export { parseLocalDateKey };

/** Limite diário (em minutos) para cada data do intervalo. */
export function buildDailyLimitByDate(
  startDate: Date,
  endDate: Date,
  dailyHoursByWeekday: UserSettings['dailyHoursByWeekday'],
  fallbackHours: number
): Record<string, number> {
  const limits: Record<string, number> = {};
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const hours = getHoursForDate(cursor, dailyHoursByWeekday, fallbackHours);
    limits[toLocalDateKey(cursor)] = Math.max(0, Math.round(hours * 60));
    cursor.setDate(cursor.getDate() + 1);
  }

  return limits;
}

/** Janela de disponibilidade (início/fim) por data, quando configurada. */
export function buildDailyTimeWindowByDate(
  startDate: Date,
  endDate: Date,
  dailyAvailabilityByWeekday: UserSettings['dailyAvailabilityByWeekday']
): Record<string, DailyTimeWindow> {
  const windows: Record<string, DailyTimeWindow> = {};
  if (!dailyAvailabilityByWeekday) return windows;

  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const dayKey = WEEKDAY_KEYS[cursor.getDay()];
    const dayWindow = dailyAvailabilityByWeekday[dayKey];
    if (
      dayWindow?.start &&
      dayWindow?.end &&
      timeToMinutes(dayWindow.end) > timeToMinutes(dayWindow.start)
    ) {
      windows[toLocalDateKey(cursor)] = { start: dayWindow.start, end: dayWindow.end };
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return windows;
}

/** Regras de simulado derivadas do objetivo, da intensidade e da data da prova. */
export function resolveSimuladoRules(studyPrefs: StudyPreferences): SimuladoRules {
  const examDate = studyPrefs.examDate ? new Date(studyPrefs.examDate) : null;
  const daysToExam =
    examDate && !Number.isNaN(examDate.getTime())
      ? Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
  const adaptiveFrequencyDays = daysToExam !== null && daysToExam <= 90 ? 7 : 14;
  const intensity = studyPrefs.intensity || 'normal';
  const frequencyDays =
    intensity === 'intensa'
      ? Math.max(5, adaptiveFrequencyDays - 3)
      : intensity === 'leve'
      ? adaptiveFrequencyDays + 7
      : adaptiveFrequencyDays;
  const lessonDelta = intensity === 'intensa' ? -2 : intensity === 'leve' ? 2 : 0;
  const practiceDelta = intensity === 'intensa' ? -1 : intensity === 'leve' ? 2 : 0;

  if (studyPrefs.goal === 'medicina') {
    return {
      minLessonsBeforeSimulated: Math.max(8, 20 + lessonDelta),
      minPracticeBeforeSimulated: Math.max(4, 12 + practiceDelta),
      minLessonsPerSubject: 3,
      minDaysBeforeSimulated: 14,
      frequencyDays,
      minLessonsBeforeAreaSimulated: 8,
      minDaysBeforeAreaSimulated: 7,
    };
  }
  if (studyPrefs.goal === 'concurso') {
    return {
      minLessonsBeforeSimulated: Math.max(8, 16 + lessonDelta),
      minPracticeBeforeSimulated: Math.max(4, 10 + practiceDelta),
      minLessonsPerSubject: 2,
      minDaysBeforeSimulated: 14,
      frequencyDays,
      minLessonsBeforeAreaSimulated: 6,
      minDaysBeforeAreaSimulated: 7,
    };
  }
  if (studyPrefs.goal === 'enem') {
    return {
      minLessonsBeforeSimulated: Math.max(8, 20 + lessonDelta),
      minPracticeBeforeSimulated: Math.max(4, 12 + practiceDelta),
      minLessonsPerSubject: 2,
      minDaysBeforeSimulated: 14,
      frequencyDays,
      minLessonsBeforeAreaSimulated: 8,
      minDaysBeforeAreaSimulated: 7,
    };
  }
  return {
    minLessonsBeforeSimulated: Math.max(8, 20 + lessonDelta),
    minPracticeBeforeSimulated: Math.max(4, 8 + practiceDelta),
    minLessonsPerSubject: 2,
    minDaysBeforeSimulated: 14,
    frequencyDays,
    minLessonsBeforeAreaSimulated: 6,
    minDaysBeforeAreaSimulated: 7,
  };
}

/** Dias da semana ativos (índice 0=domingo) segundo a carga configurada. */
export function resolveActiveDays(
  userSettings: UserSettings,
  studyPrefs: StudyPreferences
): number[] {
  const dailyHoursByWeekday = userSettings.dailyHoursByWeekday;
  if (dailyHoursByWeekday) {
    return WEEKDAY_KEYS.map((key, index) => ({ key, index }))
      .filter((entry) => (dailyHoursByWeekday[entry.key] ?? 0) > 0)
      .map((entry) => entry.index);
  }
  return studyPrefs.daysOfWeek ?? [];
}

/**
 * Traduz preferências + configurações em restrições de geração.
 * Usado tanto pela API quanto pelo Planner para garantir o mesmo resultado.
 */
export function resolveScheduleConstraints(params: {
  userSettings: UserSettings;
  studyPrefs: StudyPreferences;
  startDate: Date;
  endDate: Date;
  dailyLimitsOverride?: Record<string, number> | null;
}): ScheduleConstraints {
  const { userSettings, studyPrefs, startDate, endDate, dailyLimitsOverride } = params;

  const activeDays = resolveActiveDays(userSettings, studyPrefs);
  const restDays =
    activeDays.length > 0
      ? [0, 1, 2, 3, 4, 5, 6].filter((day) => !activeDays.includes(day))
      : (userSettings.excludeDays ?? [0]);

  const baseDailyLimits = buildDailyLimitByDate(
    startDate,
    endDate,
    userSettings.dailyHoursByWeekday,
    studyPrefs.hoursPerDay
  );

  const preferredStart = userSettings.preferredStart || '09:00';
  const preferredEnd =
    userSettings.preferredEnd ||
    minutesToTime(
      timeToMinutes(preferredStart) + Math.max(60, Math.round((studyPrefs.hoursPerDay ?? 2) * 60))
    );

  return {
    restDays,
    dailyLimitByDate: { ...baseDailyLimits, ...(dailyLimitsOverride || {}) },
    dailyTimeWindowByDate: buildDailyTimeWindowByDate(
      startDate,
      endDate,
      userSettings.dailyAvailabilityByWeekday
    ),
    preferredStart,
    preferredEnd,
    maxBlockMinutes: Math.max(
      25,
      studyPrefs.focusBlockMinutes ??
        studyPrefs.blockDurationMinutes ??
        userSettings.maxBlockMinutes ??
        90
    ),
    breakMinutes: Math.max(5, studyPrefs.breakDurationMinutes ?? userSettings.breakMinutes ?? 10),
    simuladoRules: resolveSimuladoRules(studyPrefs),
  };
}
