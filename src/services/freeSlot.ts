/**
 * Encaixe automático de bloco no dia.
 *
 * Usado pelo modal "Novo Bloco" (#13 simplificado): como a duração do bloco e
 * o intervalo entre blocos já vêm da predefinição (Configurações/Estudo ou o
 * wizard), o modal não precisa perguntar nada disso — só a matéria. O horário
 * é o primeiro espaço livre do dia que caiba o bloco, respeitando:
 *
 *  - a janela de estudo do dia (disponibilidade configurada);
 *  - os blocos já existentes (com o intervalo obrigatório entre eles);
 *  - o limite de horas do dia, quando existir.
 *
 * Se nada couber no dia, devolve `null` e o chamador avisa o usuário.
 */

export interface FreeSlot {
  start: string;
  end: string;
}

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const toTime = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(Math.round(total % 60)).padStart(2, '0')}`;

export interface FindFreeSlotParams {
  /** Blocos já existentes no dia (qualquer status, exceto os ignoráveis). */
  dayBlocks: Array<{ startTime: string; endTime: string; durationMinutes: number; isBreak?: boolean }>;
  durationMinutes: number;
  /** Intervalo obrigatório entre blocos. */
  breakMinutes: number;
  /** Janela do dia (HH:MM). Padrão 08:00–22:00. */
  window?: { start: string; end: string };
  /** Limite de minutos de estudo no dia (opcional). */
  dayLimitMinutes?: number;
  /** Minutos já usados por blocos de estudo no dia. */
  usedStudyMinutes?: number;
}

export function findFreeSlot(params: FindFreeSlotParams): FreeSlot | null {
  const { dayBlocks, durationMinutes, breakMinutes } = params;
  const windowStart = toMinutes(params.window?.start ?? '08:00');
  const windowEnd = toMinutes(params.window?.end ?? '22:00');

  if (durationMinutes <= 0) return null;

  // Limite de horas do dia: se já estourou, não há espaço.
  const used = params.usedStudyMinutes ?? 0;
  if (params.dayLimitMinutes !== undefined && used + durationMinutes > params.dayLimitMinutes) {
    return null;
  }

  // Ocupação do dia: intervalos [início, fim] de cada bloco (pausas entram como
  // ocupação também — o intervalo entre blocos é obrigatório).
  const busy = dayBlocks
    .map((block) => ({ start: toMinutes(block.startTime), end: toMinutes(block.endTime) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  // O bloco precisa de `durationMinutes` + `breakMinutes` de respiro antes e
  // depois (metade do intervalo de cada lado já é suficiente na prática, mas
  // usar o intervalo inteiro depois do bloco anterior é o que o app faz hoje).
  const need = durationMinutes;
  let cursor = windowStart;

  for (const range of busy) {
    // Espaço antes deste bloco?
    if (range.start - cursor >= need + (cursor > windowStart ? breakMinutes : 0)) {
      const start = cursor > windowStart ? cursor + breakMinutes : cursor;
      if (start + need <= range.start) {
        return { start: toTime(start), end: toTime(start + need) };
      }
    }
    cursor = Math.max(cursor, range.end);
    if (cursor + need > windowEnd) return null;
  }

  // Depois do último bloco.
  const finalStart = cursor > windowStart ? cursor + breakMinutes : cursor;
  if (finalStart + need <= windowEnd) {
    return { start: toTime(finalStart), end: toTime(finalStart + need) };
  }

  return null;
}
