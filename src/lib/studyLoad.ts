/**
 * Carga horária do plano de estudos.
 *
 * Junta as duas informações que a pessoa pode dar sobre "até quando":
 *
 *   - data da prova   -> o prazo (fixo, externo)
 *   - carga total     -> o trabalho que o plano precisa entregar
 *
 * Com as duas, dá para dizer se o plano **fecha**. O motor do cronograma só
 * consome a data final (`endDate`); esta biblioteca é quem a deriva quando a
 * pessoa informa apenas a carga total.
 *
 * Tudo aqui é função pura: sem React, sem data "de agora" escondida. Quem
 * chama passa o `startKey`, então o resultado é testável e previsível.
 */

import type { WeekdayKey } from '@/types';

/** Ordem indexada pelo getDay() do JS: 0 = domingo. */
const ORDEM_DIAS: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

export const WEEKDAY_KEYS: WeekdayKey[] = ORDEM_DIAS;

const MS_DIA = 86_400_000;

/** Converte Date em 'AAAA-MM-DD' no fuso local. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converte 'AAAA-MM-DD' em Date local à meia-noite. */
export function parseKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

/** Diferença em dias inteiros entre duas chaves (b - a). */
export function diasEntre(aKey: string, bKey: string): number {
  const a = parseKey(aKey);
  const b = parseKey(bKey);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / MS_DIA);
}

/**
 * Descobre em que dia a carga total termina, andando dia a dia desde o início
 * e descontando as horas de cada dia. Dias com 0h são pulados naturalmente.
 *
 * Guarda de 10 anos evita loop infinito se todos os dias estiverem zerados.
 */
export function deriveEndDateFromHours(
  startKey: string,
  totalHours: number,
  daily: Record<WeekdayKey, number>
): string {
  const total = Number(totalHours);
  if (!Number.isFinite(total) || total <= 0) return startKey;

  const dia = parseKey(startKey);
  if (Number.isNaN(dia.getTime())) return startKey;

  let faltando = total;
  let guarda = 0;

  while (faltando > 0 && guarda < 3650) {
    const chave = ORDEM_DIAS[dia.getDay()];
    faltando -= Number(daily[chave]) || 0;
    if (faltando > 0) dia.setDate(dia.getDate() + 1);
    guarda += 1;
  }

  return toDateKey(dia);
}

/**
 * Soma as horas de estudo de um período, dia a dia, do início ao fim
 * (os dois inclusive). É o mesmo critério de `deriveEndDateFromHours`, para os
 * dois números nunca se contradizerem: se a carga cabe pela soma dia a dia,
 * então a data derivada realmente termina antes do prazo.
 */
export function resumirPeriodo(
  startKey: string,
  endKey: string,
  daily: Record<WeekdayKey, number>
): { horas: number; diasAtivos: number } {
  const inicio = parseKey(startKey);
  const fim = parseKey(endKey);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim < inicio) {
    return { horas: 0, diasAtivos: 0 };
  }

  let horas = 0;
  let diasAtivos = 0;
  const dia = new Date(inicio.getTime());
  let guarda = 0;

  while (dia.getTime() <= fim.getTime() && guarda < 3650) {
    const doDia = Number(daily[ORDEM_DIAS[dia.getDay()]]) || 0;
    horas += doDia;
    if (doDia > 0) diasAtivos += 1;
    dia.setDate(dia.getDate() + 1);
    guarda += 1;
  }

  return { horas: arredondar(horas, 2), diasAtivos };
}

export interface LoadPlanInput {
  /** Dia em que o estudo começa ('AAAA-MM-DD'). */
  startKey: string;
  /** Data da prova, se a pessoa tiver ('AAAA-MM-DD'). */
  examDate?: string;
  /** Carga horária total que a pessoa quer estudar, em horas. */
  totalHours?: number | null;
  /** Horas por dia da semana. */
  daily: Record<WeekdayKey, number>;
}

export interface LoadPlan {
  /** Horas de estudo por semana (soma dos dias com hora > 0). */
  horasPorSemana: number;
  /** Quantos dias da semana têm hora > 0. */
  diasAtivos: number;
  /** Média de horas em cada dia que estuda. */
  mediaPorDiaAtivo: number;

  /** Dias até a prova, contando o dia da prova. null quando não há data. */
  diasRestantes: number | null;
  /** Mesmo valor em semanas (pode ser fracionário). */
  semanasRestantes: number | null;

  /** Horas por dia de estudo necessárias para fechar a carga no prazo. */
  horasPorDiaAtivoNecessarias: number | null;
  /** Quanto da carga ficaria de fora com o ritmo atual. 0 = fecha. */
  faltamHoras: number | null;
  /** Folga além da carga, quando sobra. */
  sobramHoras: number | null;
  /** null = não há como saber (faltam data e carga). */
  viavel: boolean | null;

  /** Horas que o ritmo atual cobre até a prova, quando só há data. */
  horasCobertasAteProva: number | null;

  /** Data final do plano: a da prova, ou a derivada da carga total. */
  dataFim: string;
  /** Como a data final foi decidida. */
  origemDataFim: 'prova' | 'carga' | 'semana';
}

const arredondar = (valor: number, casas = 1) => {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
};

export function computeLoadPlan(input: LoadPlanInput): LoadPlan {
  const daily = input.daily;
  const horasPorSemana = arredondar(
    ORDEM_DIAS.reduce((total, chave) => total + (Number(daily[chave]) || 0), 0),
    2
  );
  const diasAtivos = ORDEM_DIAS.filter((chave) => (Number(daily[chave]) || 0) > 0).length;
  const mediaPorDiaAtivo = diasAtivos > 0 ? arredondar(horasPorSemana / diasAtivos, 2) : 0;

  const cargaInformada =
    typeof input.totalHours === 'number' && Number.isFinite(input.totalHours) && input.totalHours > 0
      ? input.totalHours
      : null;

  const provaValida = Boolean(input.examDate) && !Number.isNaN(parseKey(input.examDate as string).getTime());

  const diasRestantes = provaValida ? diasEntre(input.startKey, input.examDate as string) + 1 : null;
  const semanasRestantes = diasRestantes !== null && diasRestantes > 0 ? diasRestantes / 7 : null;

  /** Contagem exata, dia a dia, do que o ritmo atual rende até a prova. */
  const periodo =
    provaValida && input.examDate
      ? resumirPeriodo(input.startKey, input.examDate, daily)
      : { horas: 0, diasAtivos: 0 };

  let horasPorDiaAtivoNecessarias: number | null = null;
  let faltamHoras: number | null = null;
  let sobramHoras: number | null = null;
  let viavel: boolean | null = null;
  /** Sempre que há prazo: quanto o ritmo atual rende até lá, dia a dia. */
  const horasCobertasAteProva = provaValida ? periodo.horas : null;

  if (provaValida && cargaInformada !== null && periodo.diasAtivos > 0) {
    // Prazo e carga: o plano fecha?
    faltamHoras = Math.max(0, arredondar(cargaInformada - periodo.horas, 2));
    sobramHoras = Math.max(0, arredondar(periodo.horas - cargaInformada, 2));
    horasPorDiaAtivoNecessarias = arredondar(cargaInformada / periodo.diasAtivos, 2);
    viavel = faltamHoras <= 0.01;
  } else if (!provaValida && cargaInformada !== null && diasAtivos > 0) {
    // Só carga: deriva a data final.
    viavel = true;
  }

  let dataFim: string;
  let origemDataFim: LoadPlan['origemDataFim'];

  if (provaValida) {
    dataFim = input.examDate as string;
    origemDataFim = 'prova';
  } else if (cargaInformada !== null && diasAtivos > 0) {
    dataFim = deriveEndDateFromHours(input.startKey, cargaInformada, daily);
    origemDataFim = 'carga';
  } else {
    const padrao = parseKey(input.startKey);
    padrao.setDate(padrao.getDate() + 6);
    dataFim = toDateKey(padrao);
    origemDataFim = 'semana';
  }

  return {
    horasPorSemana,
    diasAtivos,
    mediaPorDiaAtivo,
    diasRestantes,
    semanasRestantes: semanasRestantes !== null ? arredondar(semanasRestantes, 1) : null,
    horasPorDiaAtivoNecessarias,
    faltamHoras,
    sobramHoras,
    viavel,
    horasCobertasAteProva,
    dataFim,
    origemDataFim,
  };
}

/** Formata horas como o app faz em todo lugar (8:30 / 28h30). */
export function formatarHoras(horas: number): string {
  if (!Number.isFinite(horas) || horas <= 0) return '0h';
  const total = Math.round(horas * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Formata 'AAAA-MM-DD' como '14 de março de 2027'. */
export function formatarDataLonga(key: string): string {
  const d = parseKey(key);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
