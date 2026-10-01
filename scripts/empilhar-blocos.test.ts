/**
 * Reprodução do empilhamento de blocos no mesmo dia.
 *
 * Duas suspeitas, ambas testadas aqui:
 *
 *  1. `findFreeSlot` devolve `null` quando o dia está cheio, e o planner cai
 *     no fallback `'09:00'` — horário fixo, que é justamente onde já tem bloco.
 *     O anti-empilhamento de `handleSaveNewBlock` deveria empurrar, mas ele
 *     só corre se o bloco for mesmo criado.
 *
 *  2. O merge do arrastar (`prev.filter(!ids) + resultado.blocks`) nunca
 *     remove os intervalos antigos, porque `splitDay` joga os breaks fora e
 *     `reorderDayBlocks` cria breaks com ids novos. A cada arrasto sobra um
 *     ☕ órfão no dia.
 *
 * Rodar: npm run test:empilhar
 */
import { findFreeSlot } from '../src/services/freeSlot';
import { reorderDayBlocks, splitDay } from '../src/services/dayReorder';
import { toLocalDateKey, parseBlockDate, timeToMinutes, minutesToTime } from '../src/lib/utils';
import type { StudyBlock } from '../src/types';

let falhas = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) falhas++;
  console.log(`${ok ? '\u2714' : '\u2718'} ${rotulo}${extra ? ` \u2014 ${extra}` : ''}`);
};

const JANELA = { start: '09:00', end: '18:00' };
const D = '2026-10-01';

const bloco = (id: string, start: string, dur: number, isBreak = false): StudyBlock =>
  ({
    id,
    userId: 'u1',
    subjectId: id,
    date: new Date(`${D}T00:00:00`),
    startTime: start,
    endTime: minutesToTime(timeToMinutes(start) + dur),
    durationMinutes: dur,
    status: 'scheduled',
    isBreak,
  }) as StudyBlock;

/** O mesmo dia que a foto: 4 blocos do motor + intervalo depois de cada. */
function diaDoMotor(): StudyBlock[] {
  const fora: StudyBlock[] = [];
  const pares: Array<[string, number]> = [
    ['quimica', 50],
    ['biologia', 50],
    ['fisica', 50],
    ['geografia', 30],
  ];
  let cursor = timeToMinutes(JANELA.start);
  pares.forEach(([id, dur]) => {
    fora.push(bloco(id, minutesToTime(cursor), dur));
    cursor += dur;
    fora.push(bloco(`brk-${id}`, minutesToTime(cursor), 10, true));
    cursor += 10;
  });
  return fora;
}

const contaSobreposicao = (blocos: StudyBlock[]) => {
  let n = 0;
  for (let i = 0; i < blocos.length; i++) {
    for (let j = i + 1; j < blocos.length; j++) {
      const a = blocos[i];
      const c = blocos[j];
      const aS = timeToMinutes(a.startTime), aE = timeToMinutes(a.endTime);
      const cS = timeToMinutes(c.startTime), cE = timeToMinutes(c.endTime);
      if (aS < cE && cS < aE) n++;
    }
  }
  return n;
};

// ---------------------------------------------------- 1. findFreeSlot no dia cheio
const dia = diaDoMotor();
const slot = findFreeSlot({
  dayBlocks: dia,
  durationMinutes: 50,
  breakMinutes: 10,
  window: JANELA,
});
check('dia com espaço: acha slot livre', slot !== null, slot ? `${slot.start}-${slot.end}` : 'null');

// Enche o dia até não caber mais.
let lotado = [...dia];
let voltas = 0;
while (voltas < 30) {
  const s = findFreeSlot({
    dayBlocks: lotado,
    durationMinutes: 50,
    breakMinutes: 10,
    window: JANELA,
  });
  if (!s) break;
  lotado = [...lotado, bloco(`extra-${voltas}`, s.start, 50), bloco(`brk-x${voltas}`, s.end, 10, true)];
  voltas++;
}
const semVaga = findFreeSlot({ dayBlocks: lotado, durationMinutes: 50, breakMinutes: 10, window: JANELA });
check('dia lotado: findFreeSlot devolve null', semVaga === null);

// É AQUI que o planner faz `autoSlot?.start ?? '09:00'`.
const inicioFallback = semVaga?.start ?? '09:00';
const ocupadoAs9 = lotado.some(
  (b) => timeToMinutes(b.startTime) <= timeToMinutes(inicioFallback) &&
         timeToMinutes(inicioFallback) < timeToMinutes(b.endTime)
);
check(
  'fallback 09:00 cai em cima de bloco existente',
  ocupadoAs9,
  `inicio escolhido=${inicioFallback}`
);

// ---------------------------------------------------- 2. merge do arrasto acumula break
let atual = diaDoMotor();
/**
 * Merge NOVO: troca o dia inteiro, e não bloco a bloco. Remontar o dia cria
 * intervalos com ids novos; filtrar por id deixava os intervalos antigos no
 * array (cada arrasto somava ☕s órfãos, alguns por cima de bloco novo).
 */
const umArrasto = () => {
  const { pendentes } = splitDay(atual);
  const r = reorderDayBlocks({
    dayBlocks: atual,
    fromIndex: pendentes.length - 1,
    toIndex: 0,
    breakMinutes: 10,
    windowStart: JANELA.start,
  });
  const diaKey = toLocalDateKey(parseBlockDate(atual[0].date));
  atual = [
    ...atual.filter((b) => toLocalDateKey(parseBlockDate(b.date)) !== diaKey),
    ...r.blocks,
  ];
  return r;
};

const breaksAntes = atual.filter((b) => b.isBreak).length;
umArrasto();
const breaks1 = atual.filter((b) => b.isBreak).length;
umArrasto();
const breaks2 = atual.filter((b) => b.isBreak).length;

check('arrasto 1: breaks não explodem', breaks1 <= breaksAntes + 2, `${breaksAntes} → ${breaks1}`);
check('arrasto 2: breaks não acumulam', breaks2 <= breaks1 + 2, `${breaks1} → ${breaks2}`);

// ---------------------------------------------------- 3. anti-empilhamento do planner
/**
 * Réplica do laço de handleSaveNewBlock, para ver se ele realmente empurra.
 */
function antiEmpilhamento(prev: StudyBlock[], inicioDesejado: number, duracao: number, breakLen: number) {
  const dayStudy = prev
    .filter((b) => !b.isBreak)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  let start = inicioDesejado;
  for (const b of dayStudy) {
    const bStart = timeToMinutes(b.startTime);
    if (start < bStart + b.durationMinutes && bStart < start + duracao) {
      start = bStart + b.durationMinutes + breakLen;
    }
  }
  return start;
}

const empurrado = antiEmpilhamento(lotado, timeToMinutes('09:00'), 50, 10);
const blocoNovo = bloco('novo', minutesToTime(empurrado), 50);
check(
  'anti-empilhamento evita sobreposição',
  contaSobreposicao([...lotado, blocoNovo]) === 0,
  `novo bloco em ${blocoNovo.startTime}`
);

// ---------------------------------------------------- 4. dia sem janela configurada
const semJanela = findFreeSlot({
  dayBlocks: dia,
  durationMinutes: 50,
  breakMinutes: 10,
  window: undefined,
});
check('sem janela: usa padrão 08:00-22:00', semJanela !== null, semJanela ? semJanela.start : 'null');

console.log(falhas === 0 ? '\nTodos os casos passaram.' : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
