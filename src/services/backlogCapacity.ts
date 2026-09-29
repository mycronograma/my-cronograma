/**
 * Quanto espaço resta para reagendar pendências (#21).
 *
 * O motor de recálculo (`autoRescheduleBacklog`) só move um bloco atrasado se
 * achar lugar no dia: capacidade do dia menos o que já está planejado, e no
 * máximo uma cota (35%) da capacidade por dia. Quando o cronograma futuro está
 * gerado e cheio, esse espaço é zero — aí o motor devolve "não moveu nada" e a
 * tela dizia apenas "não havia espaço nos próximos dias", sem explicar o que
 * fazer. Esse serviço mede a situação de forma pura, para a tela poderavisar
 * com números e com a saída concreta.
 *
 * Espelha as mesmas regras de capacidade do motor, para o número da tela ser o
 * mesmo que o motor usa na prática.
 */

import { getBacklogEntries } from './backlogRescheduler';
import type { StudyBlock } from '@/types';
import { minutesToTime, timeToMinutes, parseBlockDate } from '@/lib/utils';

export interface BacklogCapacityInput {
  blocks: StudyBlock[];
  today?: Date;
  /** Limite de minutos por data, quando configurado. */
  dailyLimitByDate?: Record<string, number>;
  /** Minutos de estudo por dia da semana (0 = domingo) para dias sem limite. */
  fallbackDayMinutesByWeekday?: Record<number, number>;
  /** Dias da semana com hora > 0 (0 = domingo). Vazio = todos. */
  allowedDays?: number[];
  /** Quantos dias à frente olhar. */
  lookaheadDays?: number;
  /** Cota da capacidade do dia usada para recuperar atrasos. */
  backlogQuotaRatio?: number;
}

export interface BacklogCapacityReport {
  /** Blocos pendentes elegíveis para reagendamento. */
  pendingCount: number;
  /** Minutos pendentes no total. */
  pendingMinutes: number;
  /** Dias verificados na janela. */
  daysChecked: number;
  /** Dias com pelo menos algum espaço utilizável. */
  daysWithSpace: number;
  /** Espaço total que o motor realmente pode usar (respeitando a cota de 35%). */
  usableMinutes: number;
  /** Minutos pendentes que não cabem nesse espaço. */
  missingMinutes: number;
  /** Minutos extras por dia necessários para caber tudo (0 se já cabe). */
  extraMinutesPerDay: number;
  /** true quando não há espaço utilizável algum na janela. */
  noSpace: boolean;
}

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

/** Capacidade do dia, na mesma ordem de preferência do motor. */
export function getDayCapacityMinutes(
  dayKey: string,
  blocks: StudyBlock[],
  dailyLimitByDate?: Record<string, number>,
  fallbackDayMinutesByWeekday?: Record<number, number>
): number {
  const explicit = dailyLimitByDate?.[dayKey];
  if (typeof explicit === 'number') return Math.max(0, explicit);

  const planned = blocks
    .filter((block) => !block.isBreak && toLocalKeyOf(block) === dayKey && block.status !== 'skipped')
    .reduce((sum, block) => sum + block.durationMinutes, 0);
  if (planned > 0) return planned;

  // Dia sem limite e sem bloco (ex.: além do fim do cronograma gerado): usa as
  // horas que a pessoa estuda por dia nesse dia da semana. Sem isso, o motor
  // trataria o dia como "capacidade zero" e nunca jogaria nada para lá.
  if (fallbackDayMinutesByWeekday) {
    const [year, month, day] = dayKey.split('-').map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    const fallback = fallbackDayMinutesByWeekday[weekday];
    if (typeof fallback === 'number') return Math.max(0, fallback);
  }
  return 0;
}

function toLocalKeyOf(block: StudyBlock): string {
  const parsed = parseBlockDate(block.date);
  return toDateKey(parsed);
}

export function analyzeBacklogCapacity(input: BacklogCapacityInput): BacklogCapacityReport {
  const today = new Date(input.today ?? new Date());
  today.setHours(0, 0, 0, 0);
  const allowedDays = Array.isArray(input.allowedDays) ? input.allowedDays : [];
  const lookaheadDays = Math.max(1, input.lookaheadDays ?? 10);
  const quotaRatio = Math.min(0.4, Math.max(0.2, input.backlogQuotaRatio ?? 0.35));

  const entries = getBacklogEntries(input.blocks, today);
  const pendingMinutes = entries.reduce((sum, entry) => sum + entry.block.durationMinutes, 0);

  const dayKeys: string[] = [];
  for (let index = 0; index <= lookaheadDays; index += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    date.setHours(0, 0, 0, 0);
    if (allowedDays.length > 0 && !allowedDays.includes(date.getDay())) continue;
    dayKeys.push(toDateKey(date));
  }

  let usableMinutes = 0;
  let daysWithSpace = 0;

  for (const dayKey of dayKeys) {
    const capacity = getDayCapacityMinutes(
      dayKey,
      input.blocks,
      input.dailyLimitByDate,
      input.fallbackDayMinutesByWeekday
    );
    if (capacity <= 0) continue;

    const current = input.blocks
      .filter(
        (block) =>
          !block.isBreak &&
          toLocalKeyOf(block) === dayKey &&
          block.status !== 'completed' &&
          block.status !== 'skipped'
      )
      .reduce((sum, block) => sum + block.durationMinutes, 0);

    const free = Math.max(0, capacity - current);
    // O motor nunca passa da cota de recuperação do dia.
    const quota = Math.floor(capacity * quotaRatio);
    const usable = Math.min(free, quota);
    if (usable > 0) {
      daysWithSpace += 1;
      usableMinutes += usable;
    }
  }

  const missingMinutes = Math.max(0, pendingMinutes - usableMinutes);
  const extraMinutesPerDay =
    missingMinutes > 0 && dayKeys.length > 0 ? Math.ceil(missingMinutes / dayKeys.length) : 0;

  return {
    pendingCount: entries.length,
    pendingMinutes,
    daysChecked: dayKeys.length,
    daysWithSpace,
    usableMinutes,
    missingMinutes,
    extraMinutesPerDay,
    noSpace: usableMinutes <= 0,
  };
}

/** Formata minutos como "6h30" (horas sempre em formato de hora, nunca decimal). */
export function formatMinutesAsHours(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return minutesToTime(safe).replace(/^0(\d)/, '$1');
}

export { timeToMinutes };
