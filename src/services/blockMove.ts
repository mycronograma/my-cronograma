import { parseBlockDate, toLocalDateKey } from '@/lib/utils';
import type { StudyBlock, Subject } from '@/types';

/**
 * Movimentação de blocos (#13).
 *
 * Regra do usuário: "adicionar matéria avulsa" deve **realocar** o bloco que já
 * existe, nunca criar um segundo bloco da mesma matéria no mesmo dia. E
 * "adiantar" puxa o bloco de um dia futuro para hoje, recalculando o resto.
 *
 * Duas operações, ambas sobre blocos existentes (nunca criam bloco novo):
 *
 *  - `realocar`: move um bloco da matéria para o dia/hora escolhidos.
 *  - `adiantar`: mesma coisa, mas só aceita bloco de dia **posterior** ao alvo
 *    (é o "puxar para hoje").
 *
 * O bloco mantém duração, tipo e matéria; muda o dia, é encaixado sem colidir
 * com os outros do dia (com intervalo obrigatório) e passa a `rescheduled`,
 * guardando a data original em `originalDate`.
 */

export type MoveMode = 'puxar';

export interface MovePlan {
  ok: boolean;
  /** Motivo quando não dá para mover (mostrado ao usuário). */
  reason?: string;
  /** Lista completa de blocos após a movimentação. */
  blocks?: StudyBlock[];
  movedBlockId?: string;
  fromDateKey?: string;
  toDateKey?: string;
  subjectName?: string;
  /** Horário em que o bloco vai ficar no dia de destino. */
  placedStart?: string;
  placedEnd?: string;
}

const BREAK_FALLBACK = 10;

export const isMovable = (block: StudyBlock): boolean =>
  !block.isBreak && block.status !== 'completed' && block.status !== 'skipped';

export const dayKeyOf = (block: StudyBlock): string =>
  toLocalDateKey(parseBlockDate(block.date) ?? new Date(block.date));

/** Encaixa o bloco no dia sem colidir, sempre com intervalo entre blocos. */
function placeInDay(
  dayBlocks: StudyBlock[],
  preferredStart: number,
  durationMinutes: number,
  breakMinutes: number
): { start: number; end: number } {
  const sorted = [...dayBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  let start = preferredStart;

  for (const other of sorted) {
    const otherStart = timeToMinutes(other.startTime);
    const otherEnd = otherStart + other.durationMinutes;
    if (start < otherEnd && otherStart < start + durationMinutes) {
      start = otherEnd + breakMinutes;
    }
  }

  return { start, end: start + durationMinutes };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToTime(total: number): string {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function planBlockMove(params: {
  blocks: StudyBlock[];
  subjects: Subject[];
  blockId: string;
  /** Dia de destino. */
  targetDate: Date;
  /** Horário preferido no dia de destino (HH:MM). */
  preferredStart?: string;
  breakMinutes?: number;
}): MovePlan {
  const { blocks, subjects, blockId, targetDate } = params;

  const chosen = blocks.find((b) => b.id === blockId);
  if (!chosen || !isMovable(chosen)) {
    return { ok: false, reason: 'Bloco inválido ou não pode ser movido.' };
  }

  const subject = subjects.find((item) => item.id === chosen.subjectId);
  if (!subject) {
    return { ok: false, reason: 'Matéria não encontrada.' };
  }

  const targetKey = toLocalDateKey(targetDate);
  const fromKey = dayKeyOf(chosen);

  if (fromKey === targetKey) {
    return { ok: false, reason: 'O bloco já está neste dia.' };
  }

  const breakMinutes = params.breakMinutes ?? BREAK_FALLBACK;
  const preferred = params.preferredStart ?? chosen.startTime;

  // Os outros blocos do dia de destino (o bloco movido sai da própria lista).
  const dayBlocks = blocks.filter(
    (block) => dayKeyOf(block) === targetKey && block.id !== chosen.id
  );
  const placed = placeInDay(dayBlocks, timeToMinutes(preferred), chosen.durationMinutes, breakMinutes);

  const moved: StudyBlock = {
    ...chosen,
    date: targetDate,
    startTime: minutesToTime(placed.start),
    endTime: minutesToTime(placed.end),
    status: 'rescheduled',
    originalDate: chosen.originalDate ? parseBlockDate(chosen.originalDate) : parseBlockDate(chosen.date),
    rescheduleCount: (chosen.rescheduleCount || 0) + 1,
    updatedAt: new Date(),
  };

  const nextBlocks = blocks.map((block) => (block.id === chosen.id ? moved : block));

  return {
    ok: true,
    blocks: nextBlocks,
    movedBlockId: chosen.id,
    fromDateKey: fromKey,
    toDateKey: targetKey,
    subjectName: subject.name,
    placedStart: moved.startTime,
    placedEnd: moved.endTime,
  };
}
