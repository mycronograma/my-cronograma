/**
 * Testes da reordenação dentro do dia.
 * Rodar: npm run test:reorder
 */
import { reorderDayBlocks, splitDay, isPreservado } from '../src/services/dayReorder';
import type { StudyBlock } from '../src/types';

let falhas = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) falhas++;
  console.log(`${ok ? '\u2714' : '\u2718'} ${rotulo}${extra ? ` \u2014 ${extra}` : ''}`);
};

type Status = StudyBlock['status'];
const b = (
  id: string,
  start: string,
  end: string,
  status: Status,
  dur = 50,
  isBreak = false
): StudyBlock =>
  ({
    id,
    userId: 'u1',
    subjectId: id,
    date: new Date('2026-10-01T00:00:00'),
    startTime: start,
    endTime: end,
    durationMinutes: dur,
    status,
    isBreak,
  }) as StudyBlock;

const relogio = (blocos: StudyBlock[]) =>
  blocos.map((x) => `${x.startTime}-${x.endTime}`).join(' ');

// ---------------------------------------------------- splitDay
const dia = [
  b('c1', '08:00', '08:50', 'completed'),
  b('and', '09:00', '09:50', 'in-progress'),
  b('p1', '10:00', '10:50', 'scheduled'),
  b('p2', '11:00', '11:50', 'scheduled'),
  b('brk', '09:50', '10:00', 'scheduled', 10, true),
];
const { preservados, pendentes } = splitDay(dia);
check('split: 2 preservados', preservados.length === 2, `${preservados.map((p) => p.id).join(',')}`);
check('split: 2 pendentes', pendentes.length === 2);
check('split: intervalo não conta', !pendentes.some((p) => p.isBreak) && !preservados.some((p) => p.isBreak));

// preservado DEPOIS de pendente não "puxa" preservados para o meio
const misturado = [
  b('p1', '10:00', '10:50', 'scheduled'),
  b('c1', '11:00', '11:50', 'completed'),
];
const mistura = splitDay(misturado);
check('split: preservado depois de pendente vira pendente', mistura.pendentes.length === 2,
  `${mistura.preservados.length} preservados`);

// ---------------------------------------------------- reorder básico
const diaSimples = [
  b('a', '08:00', '08:50', 'scheduled'),
  b('brk1', '08:50', '09:00', 'scheduled', 10, true),
  b('c', '09:00', '09:50', 'scheduled'),
  b('brk2', '09:50', '10:00', 'scheduled', 10, true),
  b('b', '10:00', '10:50', 'scheduled'),
];
// ordem na tela: a, c, b (pendentes) -> mover b (idx 2) para idx 0
const r1 = reorderDayBlocks({
  dayBlocks: diaSimples,
  fromIndex: 2,
  toIndex: 0,
  breakMinutes: 10,
  windowStart: '08:00',
});
const soMaterias = (blocos: StudyBlock[]) => blocos.filter((x) => !x.isBreak);
check('reorder: 3 matérias devolvidas', soMaterias(r1.blocks).length === 3,
  `${soMaterias(r1.blocks).length}`);
check('reorder: nova ordem é b, a, c', soMaterias(r1.blocks).map((x) => x.id).join(',') === 'b,a,c',
  soMaterias(r1.blocks).map((x) => x.id).join(','));
// 50min de bloco + 10min de intervalo, sequencial a partir das 08:00.
check('reorder: relógio remontado', relogio(r1.blocks) === '08:00-08:50 08:50-09:00 09:00-09:50 09:50-10:00 10:00-10:50',
  relogio(r1.blocks));
check('reorder: intervalos recriados', r1.blocks.filter((x) => x.isBreak).length === 2,
  `${r1.blocks.filter((x) => x.isBreak).length}`);
check('reorder: duração preservada', soMaterias(r1.blocks).every((x) => x.durationMinutes === 50));

// ---------------------------------------------------- preservados intactos
const r2 = reorderDayBlocks({
  dayBlocks: dia,
  fromIndex: 0,
  toIndex: 1,
  breakMinutes: 10,
  windowStart: '08:00',
});
check('preservado: horário intacto', r2.blocks[0].startTime === '08:00' && r2.blocks[0].endTime === '08:50',
  relogio(r2.blocks));
check('preservado: status intacto', r2.blocks[0].status === 'completed' && r2.blocks[1].status === 'in-progress');
const materiasR2 = soMaterias(r2.blocks);
check('preservado: pendentes começam depois do prefixo',
  materiasR2[2].startTime === '10:00', relogio(r2.blocks));
check('preservado: intervalo entre prefixo e pendentes',
  r2.blocks.filter((x) => x.isBreak).length === 2, `${r2.blocks.filter((x) => x.isBreak).length}`);

// dia só com preservados
const r3 = reorderDayBlocks({
  dayBlocks: [b('c1', '08:00', '08:50', 'completed')],
  fromIndex: 0,
  toIndex: 0,
  breakMinutes: 10,
  windowStart: '08:00',
});
check('dia sem pendente: recusa', r3.movidos === 0 && !!r3.reason);

// índice inválido
const r4 = reorderDayBlocks({ dayBlocks: dia, fromIndex: 9, toIndex: 0, breakMinutes: 10, windowStart: '08:00' });
check('índice inválido: recusa', r4.movidos === 0 && !!r4.reason);

// ---------------------------------------------------- durações diferentes
const diaMisto = [
  b('longo', '08:00', '09:30', 'scheduled', 90),
  b('curto', '09:30', '10:00', 'scheduled', 30),
];
const r5 = reorderDayBlocks({
  dayBlocks: diaMisto,
  fromIndex: 1,
  toIndex: 0,
  breakMinutes: 10,
  windowStart: '08:00',
});
const mat5 = soMaterias(r5.blocks);
check('durações: cada bloco mantém a sua', mat5[0].durationMinutes === 30 && mat5[1].durationMinutes === 90);
// curto (30min) + intervalo (10min) + longo (90min) a partir das 08:00.
check('durações: relógio segue as durações', relogio(r5.blocks) === '08:00-08:30 08:30-08:40 08:40-10:10',
  relogio(r5.blocks));

// ---------------------------------------------------- sem intervalo
const r6 = reorderDayBlocks({
  dayBlocks: [b('a', '08:00', '08:50', 'scheduled'), b('b', '09:00', '09:50', 'scheduled')],
  fromIndex: 1,
  toIndex: 0,
  breakMinutes: 0,
  windowStart: '08:00',
});
check('sem intervalo: blocos encostam', relogio(r6.blocks) === '08:00-08:50 08:50-09:40', relogio(r6.blocks));

// ---------------------------------------------------- isPreservado
check('isPreservado: completed', isPreservado(b('x', '08:00', '08:50', 'completed')));
check('isPreservado: skipped', isPreservado(b('x', '08:00', '08:50', 'skipped')));
check('isPreservado: in-progress', isPreservado(b('x', '08:00', '08:50', 'in-progress')));
check('isPreservado: scheduled não', !isPreservado(b('x', '08:00', '08:50', 'scheduled')));
check('isPreservado: intervalo não participa', isPreservado(b('x', '08:00', '08:10', 'scheduled', 10, true)));

// ---------------------------------------------------- mover para o mesmo lugar
const r7 = reorderDayBlocks({ dayBlocks: dia, fromIndex: 1, toIndex: 1, breakMinutes: 10, windowStart: '08:00' });
check('mesmo lugar: matérias ficam iguais', soMaterias(r7.blocks).map((x) => x.id).join(',') === 'c1,and,p1,p2',
  soMaterias(r7.blocks).map((x) => x.id).join(','));
check('mesmo lugar: preservados continuam na frente', r7.blocks[0].id === 'c1' && r7.blocks[1].id === 'and');
check('mesmo lugar: horário dos preservados intacto',
  r7.blocks[0].startTime === '08:00' && r7.blocks[1].startTime === '09:00');

console.log(falhas === 0 ? '\nTodos os casos passaram.' : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
