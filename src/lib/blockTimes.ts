/**
 * Reparo de blocos concluídos com horário distorcido.
 *
 * Até a mudança do "Concluir pergunta os minutos", concluir um bloco gravava por
 * cima do plano:
 *
 *   endTime         → hora do relógio no momento em que você clicou (19:08)
 *   durationMinutes → os minutos que você realmente estudou
 *
 * Resultado: a agenda mostrava "09:00 – 19:08 · 1 min" para um bloco de 50
 * minutos — início, fim e duração que não fecham entre si.
 *
 * Este reparo roda uma vez e só mexe onde o plano está inconsistente. Ele nunca
 * reduz horas já creditadas: onde havia distorção, o valor que estava em
 * `durationMinutes` (que já era o tempo real) passa para `actualMinutes`, e o
 * `endTime` volta a ser `startTime + durationMinutes`.
 *
 * Blocos gravados depois da mudança já vêm com `actualMinutes` e o plano
 * intacto, então passam batidos.
 */

import { repairOverlappingDays } from '@/services/overlapRepair';
import type { StudyBlock } from '@/types';

type StudyBlockLike = StudyBlock;

type BlocoReparavel = {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  actualMinutes?: number;
};

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
}

function minutesToTime(total: number): string {
  const safe = Math.min(24 * 60 - 1, Math.max(0, Math.round(total)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** O bloco concluído tem fim diferente de início + duração planejada? */
function estaDistorcido(block: BlocoReparavel): boolean {
  const inicio = timeToMinutes(block.startTime);
  const fim = timeToMinutes(block.endTime);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return false;
  const duracao = Math.max(0, Math.round(block.durationMinutes || 0));
  return fim !== inicio + duracao;
}

/**
 * Devolve a lista com os blocos distorcidos consertados.
 * Quando nada precisa de reparo, devolve a MESMA referência — assim quem chamar
 * pode gravar sem provocar re-render em laço.
 */
export function repairCompletedBlockTimes<T extends BlocoReparavel>(blocks: T[]): T[] {
  let mudou = false;

  const reparados = blocks.map((block) => {
    if (block.status !== 'completed' || !estaDistorcido(block)) return block;

    const inicio = timeToMinutes(block.startTime);
    const duracao = Math.max(0, Math.round(block.durationMinutes || 0));
    mudou = true;

    return {
      ...block,
      // O que estava em durationMinutes já era o tempo real.
      actualMinutes: block.actualMinutes ?? duracao,
      endTime: minutesToTime(inicio + duracao),
    };
  });

  return mudou ? reparados : blocks;
}

/** Roda o reparo no máximo uma vez por carregamento de página. */
let jaRodouNestaPagina = false;

export function repairCompletedBlockTimesOnce<T extends BlocoReparavel>(blocks: T[]): T[] {
  if (jaRodouNestaPagina) return blocks;
  jaRodouNestaPagina = true;
  return repairCompletedBlockTimes(blocks);
}

/**
 * Reparo único dos dias com blocos em cima de blocos.
 *
 * Rodapé: a versão anterior deixava três caminhos produzirem sobreposição
 * (regerar sem vaga, adicionar bloco às 09:00 e o arrastar deixando
 * intervalos órfãos). Os dias já salvos assim continuavam quebrados para
 * sempre, então este reparo roda uma vez por página e reencaixa só os
 * pendentes — bloco estudado nunca sai do lugar.
 */
let overlapJaRodouNestaPagina = false;

export function repairOverlappingDaysOnce<T extends StudyBlockLike>(
  blocks: T[],
  breakMinutes: number,
  windowStart = '08:00'
): T[] {
  if (overlapJaRodouNestaPagina) return blocks;
  overlapJaRodouNestaPagina = true;
  return repairOverlappingDays({ blocks, breakMinutes, windowStart }).blocks as T[];
}
