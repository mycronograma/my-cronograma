/**
 * Janelas livres de um dia, para regerar o cronograma sem pisar no que já foi
 * estudado.
 *
 * O motor (`roadmapEngine`) aceita uma janela de horário por dia
 * (`dailyTimeWindowByDate`), mas só UMA por dia. Quando uma pessoa já estudou
 * de manhã e regera o plano, os blocos novos têm de começar depois do que ela
 * já fez — senão o app remarca bloco em cima de bloco concluído.
 *
 * Este serviço recebe os blocos que devem ser PRESERVADOS (concluídos, pulados
 * ou em andamento) e devolve, para cada dia, a maior fatia livre da janela
 * habitual daquele dia. É a maior, e não a soma, porque o motor só aceita uma
 * janela por dia — perder um pedaço é melhor que sobrepor horário.
 */

export interface Ocupacao {
  /** Data no formato 'AAAA-MM-DD'. */
  dateKey: string;
  /** Início em minutos desde 00:00. */
  startMinutes: number;
  /** Fim em minutos desde 00:00. */
  endMinutes: number;
}

export interface JanelaDoDia {
  start: string;
  end: string;
}

export interface LivresParams {
  /** Blocos que não podem ser encostados. */
  preservados: Array<{ date: Date | string; startTime: string; endTime: string }>;
  /** Janela habitual de cada dia ('AAAA-MM-DD' → { start, end }). */
  janelasBase: Record<string, JanelaDoDia>;
  /** Datas a considerar ('AAAA-MM-DD'). */
  dias: string[];
}

function toDateKey(value: Date | string): string {
  if (typeof value === 'string') {
    // Pode ser 'AAAA-MM-DD' ou ISO; nos dois casos os 10 primeiros servem.
    return value.slice(0, 10);
  }
  const ano = value.getFullYear();
  const mes = String(value.getMonth() + 1).padStart(2, '0');
  const dia = String(value.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function toMinutes(time: string): number {
  const [horas, minutos] = time.split(':').map(Number);
  if (!Number.isFinite(horas) || !Number.isFinite(minutos)) return NaN;
  return horas * 60 + minutos;
}

function toTime(total: number): string {
  const seguro = Math.min(24 * 60 - 1, Math.max(0, Math.round(total)));
  const h = Math.floor(seguro / 60);
  const m = seguro % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Maior fatia livre de cada dia.
 *
 * Dias sem preservados ficam com a janela habitual. Dias inteiramente ocupados
 * ficam de fora do resultado (o motor não recebe janela para eles e não
 * agenda nada lá).
 */
export function computeFreeDayWindows(params: LivresParams): Record<string, JanelaDoDia> {
  const { preservados, janelasBase, dias } = params;

  // Ocupação por dia, já mesclada (encostar ou sobrepor conta como um só).
  const porDia = new Map<string, Array<[number, number]>>();
  preservados.forEach((bloco) => {
    const key = toDateKey(bloco.date);
    const inicio = toMinutes(bloco.startTime);
    const fim = toMinutes(bloco.endTime);
    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return;
    const lista = porDia.get(key) ?? [];
    lista.push([inicio, fim]);
    porDia.set(key, lista);
  });

  const saida: Record<string, JanelaDoDia> = {};

  dias.forEach((key) => {
    const base = janelasBase[key];
    if (!base) return;
    const inicioDia = toMinutes(base.start);
    const fimDia = toMinutes(base.end);
    if (!Number.isFinite(inicioDia) || !Number.isFinite(fimDia) || fimDia <= inicioDia) return;

    const ocupados = (porDia.get(key) ?? [])
      .map(([inicio, fim]) => [
        Math.max(inicioDia, inicio),
        Math.min(fimDia, fim),
      ] as [number, number])
      .filter(([inicio, fim]) => fim > inicio)
      .sort((a, b) => a[0] - b[0]);

    if (ocupados.length === 0) {
      saida[key] = base;
      return;
    }

    // Varrer a janela e achar o maior buraco entre as ocupações.
    const livres: Array<[number, number]> = [];
    let cursor = inicioDia;
    ocupados.forEach(([inicio, fim]) => {
      if (inicio > cursor) livres.push([cursor, inicio]);
      cursor = Math.max(cursor, fim);
    });
    if (fimDia > cursor) livres.push([cursor, fimDia]);

    const melhor = livres.reduce<[number, number] | null>(
      (maior, atual) => (maior === null || atual[1] - atual[0] > maior[1] - maior[0] ? atual : maior),
      null
    );

    // Só devolve janela se couber um bloco mínimo de verdade.
    if (melhor && melhor[1] - melhor[0] >= 25) {
      saida[key] = { start: toTime(melhor[0]), end: toTime(melhor[1]) };
    }
  });

  return saida;
}
