/**
 * Reparo de dias com blocos em cima de blocos.
 *
 * Existe porque três caminhos diferentes conseguiam produzir sobreposição, e
 * os dados já corrompidos continuavam corruptos para sempre:
 *
 *  1. "Gerar com IA" caía em horário padrão quando o dia não tinha vaga;
 *  2. adicionar bloco à mão caía em "09:00" fixo, que é onde já tem bloco;
 *  3. o arrastar deixava intervalos órfãos no dia, alguns por cima de bloco.
 *
 * O reparo é conservador e não reduz nada: blocos já estudados (concluído,
 * pulado, em andamento) nunca saem do lugar — eles são a verdade do que
 * aconteceu. Só os pendentes são reencaixados, um a um, na primeira folga
 * que caibam, mantendo a ordem em que estão na tela e o intervalo entre
 * eles. Se um bloco pendente não couber no dia, ele fica no fim do dia (não
 * desaparece e não é encolhido).
 */

import { timeToMinutes, minutesToTime } from '@/lib/utils';
import type { BlockStatus, StudyBlock } from '@/types';

/** Status que representam progresso já feito — nunca reencaixados. */
const STATUS_PRESERVADO: ReadonlySet<BlockStatus> = new Set<BlockStatus>([
  'completed',
  'skipped',
  'in-progress',
]);

export interface ReparoParams {
  blocks: StudyBlock[];
  /** Intervalo obrigatório entre blocos, em minutos. */
  breakMinutes: number;
  /**
   * Horário mais cedo em que um bloco pode ser encaixado ("08:00").
   * Sem isso o reparo voltava para a meia-noite, que é pior que a sobreposição.
   */
  windowStart?: string;
}

export interface ReparoResult {
  blocks: StudyBlock[];
  /** Quantos blocos foram movidos. */
  movidos: number;
  /** Quantos dias estavam sobrepostos. */
  diasCorrigidos: number;
}

const chaveDoDia = (block: StudyBlock): string => {
  const d = block.date instanceof Date ? block.date : new Date(block.date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

const inicio = (t: string) => timeToMinutes(t);
const fim = (t: string) => timeToMinutes(t);

/** Um dia está sobreposto quando dois blocos seus dividem horário. */
export function diaEstaSobreposto(dayBlocks: StudyBlock[]): boolean {
  const ocupados = dayBlocks
    .filter((b) => !b.isBreak)
    .map((b) => ({ s: inicio(b.startTime), e: fim(b.endTime) }))
    .filter((r) => r.e > r.s)
    .sort((a, b) => a.s - b.s);

  for (let i = 1; i < ocupados.length; i++) {
    if (ocupados[i].s < ocupados[i - 1].e) return true;
  }
  return false;
}

/**
 * Reencaixa os blocos pendentes de um dia nas primeiras folgas que caibam,
 * preservando os blocos já estudados e o intervalo entre os blocos.
 */
function repararDia(dayBlocks: StudyBlock[], breakMinutes: number, windowStart: string): StudyBlock[] {
  const preservados = dayBlocks
    .filter((b) => b.isBreak || STATUS_PRESERVADO.has(b.status))
    .slice()
    .sort((a, b) => inicio(a.startTime) - inicio(b.startTime));

  const pendentes = dayBlocks
    .filter((b) => !b.isBreak && !STATUS_PRESERVADO.has(b.status))
    .slice()
    .sort((a, b) => inicio(a.startTime) - inicio(b.startTime));

  if (pendentes.length === 0) return dayBlocks;

  // Ocupação intocável: os preservados. Cada bloco encaixado entra aqui também,
  // para o próximo não cair em cima dele.
  const busy = preservados.map((b) => ({ s: inicio(b.startTime), e: fim(b.endTime) }));
  const abrir = timeToMinutes(windowStart);

  const encaixados: StudyBlock[] = [];

  pendentes.forEach((block) => {
    const duracao = block.durationMinutes;
    let cursor = abrir;
    let colocado = -1;

    // Primeira folga antes de algum bloco ocupado que caiba.
    for (const range of busy.slice().sort((a, b) => a.s - b.s)) {
      if (cursor + duracao <= range.s) {
        colocado = cursor;
        break;
      }
      cursor = Math.max(cursor, range.e + breakMinutes);
    }
    if (colocado < 0) colocado = cursor;

    const novoS = colocado;
    const novoE = novoS + duracao;
    encaixados.push({ ...block, startTime: minutesToTime(novoS), endTime: minutesToTime(novoE) });
    busy.push({ s: novoS, e: novoE });
  });

  return [...preservados, ...encaixados].sort((a, b) => inicio(a.startTime) - inicio(b.startTime));
}

/**
 * Varre todos os blocos e reencaixa só os dias que estão sobrepostos.
 * Dias saudáveis saem exatamente iguais (mesmos ids, mesmos horários).
 */
export function repairOverlappingDays(params: ReparoParams): ReparoResult {
  const { blocks, breakMinutes } = params;
  const porDia = new Map<string, StudyBlock[]>();
  blocks.forEach((block) => {
    const k = chaveDoDia(block);
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push(block);
  });

  const saida: StudyBlock[] = [];
  let movidos = 0;
  let diasCorrigidos = 0;

  const inicioDoDia = params.windowStart ?? '08:00';

  porDia.forEach((dayBlocks) => {
    if (!diaEstaSobreposto(dayBlocks)) {
      saida.push(...dayBlocks);
      return;
    }
    diasCorrigidos++;
    const antes = new Map(dayBlocks.map((b) => [b.id, b.startTime]));
    const reparado = repararDia(dayBlocks, breakMinutes, inicioDoDia);
    reparado.forEach((b) => {
      if (antes.get(b.id) !== b.startTime) movidos++;
    });
    saida.push(...reparado);
  });

  return { blocks: saida, movidos, diasCorrigidos };
}
