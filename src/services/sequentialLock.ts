import { parseBlockDate, toLocalDateKey } from '@/lib/utils';
import type { StudyBlock } from '@/types';

/**
 * Trava sequencial (#6e).
 *
 * Regra do usuário: **não dá para estudar matéria de dia futuro enquanto hoje
 * tem bloco pendente**. Sem isso a pessoa furou a fila, estudou a matéria de
 * amanhã e a de hoje nunca foi feita — o atraso só cresce.
 *
 * O que conta como "hoje pendente": bloco de hoje que não foi concluído e não
 * foi pulado. Pulado saiu da fila por decisão do usuário (e já foi reagendado
 * para um dia futuro), então não bloqueia ninguém.
 */
export interface SequentialLock {
  /** Pode iniciar o bloco? */
  allowed: boolean;
  /** Quantos blocos de hoje estão pendentes. */
  pendingToday: number;
  /** Mensagem pronta para mostrar ao usuário (vazia quando permitido). */
  message: string;
}

const isPendingToday = (block: StudyBlock, todayKey: string): boolean => {
  if (block.isBreak) return false;
  if (block.status === 'completed' || block.status === 'skipped') return false;
  const blockKey = toLocalDateKey(parseBlockDate(block.date) ?? new Date(block.date));
  return blockKey === todayKey;
};

export function checkSequentialLock(
  block: StudyBlock,
  allBlocks: StudyBlock[],
  today: Date = new Date()
): SequentialLock {
  const todayKey = toLocalDateKey(today);
  const blockKey = toLocalDateKey(parseBlockDate(block.date) ?? new Date(block.date));

  // Bloco de hoje (ou de dias passados, que são atrasados): a trava não se
  // aplica — o objetivo é justamente resolver o que está atrasado.
  if (blockKey <= todayKey) {
    return { allowed: true, pendingToday: 0, message: '' };
  }

  const pendingToday = allBlocks.filter((item) => isPendingToday(item, todayKey)).length;
  if (pendingToday === 0) {
    return { allowed: true, pendingToday: 0, message: '' };
  }

  return {
    allowed: false,
    pendingToday,
    message: `Você ainda tem ${pendingToday} ${pendingToday === 1 ? 'bloco' : 'blocos'} de hoje sem concluir. Termine o dia de hoje antes de estudar a matéria de ${formatDay(blockKey)}.`,
  };
}

function formatDay(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return 'outro dia';
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
