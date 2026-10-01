/**
 * Reparo de dias sobrepostos, inclusive o dia exato da foto do usuário.
 * Rodar: npm run test:reparo
 */
import { repairOverlappingDays, diaEstaSobreposto } from '../src/services/overlapRepair';
import type { StudyBlock } from '../src/types';

let falhas = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) falhas++;
  console.log(`${ok ? '\u2714' : '\u2718'} ${rotulo}${extra ? ` \u2014 ${extra}` : ''}`);
};

type Status = StudyBlock['status'];
const b = (
  id: string,
  date: string,
  start: string,
  dur: number,
  status: Status = 'scheduled'
): StudyBlock =>
  ({
    id,
    userId: 'u1',
    subjectId: id,
    date: new Date(`${date}T00:00:00`),
    startTime: start,
    endTime: `${String(Math.floor((Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + dur) / 60)).padStart(2, '0')}:${String((Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + dur) % 60).padStart(2, '0')}`,
    durationMinutes: dur,
    status,
    isBreak: false,
  }) as StudyBlock;

const chave = (x: StudyBlock) => {
  const d = x.date instanceof Date ? x.date : new Date(x.date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const contaSobreposicao = (blocos: StudyBlock[]) => {
  const porDia = new Map<string, StudyBlock[]>();
  blocos.forEach((x) => {
    const k = chave(x);
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push(x);
  });
  let n = 0;
  porDia.forEach((lista) => {
    const e = lista.filter((x) => !x.isBreak).sort((a, c) => a.startTime.localeCompare(c.startTime));
    for (let i = 1; i < e.length; i++) {
      if (e[i].startTime < e[i - 1].endTime) n++;
    }
  });
  return n;
};

// ------------------------------------------------ o dia exato da foto
const D = '2026-10-01';
const diaFoto: StudyBlock[] = [
  b('quimica', D, '09:00', 50),
  b('portugues', D, '09:00', 50),
  b('biologia', D, '10:00', 50),
  b('redacao', D, '10:00', 50),
  b('fisica', D, '11:00', 50),
  b('historia', D, '11:00', 50),
  b('geografia', D, '12:00', 30),
  b('matematica', D, '11:40', 50),
];

check('foto: dia está sobreposto', diaEstaSobreposto(diaFoto));
check('foto: 8 matérias', diaFoto.length === 8);

const r1 = repairOverlappingDays({ blocks: diaFoto, breakMinutes: 10, windowStart: '08:00' });
check('reparo: nenhuma sobreposição', contaSobreposicao(r1.blocks) === 0,
  `${contaSobreposicao(r1.blocks)} restantes`);
check('reparo: nenhum bloco some', r1.blocks.length === 8, `${r1.blocks.length} blocos`);
check('reparo: durações intactas',
  r1.blocks.every((x) => x.durationMinutes === 50 || x.id === 'geografia'));

// ------------------------------------------------ preservados não se movem
const diaMisto: StudyBlock[] = [
  b('c1', D, '08:00', 50, 'completed'),
  b('p1', D, '08:00', 50),
  b('p2', D, '08:00', 50),
];
const r2 = repairOverlappingDays({ blocks: diaMisto, breakMinutes: 10, windowStart: '08:00' });
const c1 = r2.blocks.find((x) => x.id === 'c1')!;
check('preservado: horário intacto', c1.startTime === '08:00' && c1.endTime === '08:50',
  `${c1.startTime}-${c1.endTime}`);
check('preservado: status intacto', c1.status === 'completed');
check('preservado: pendentes saem de cima dele',
  r2.blocks.filter((x) => x.id !== 'c1').every((x) => x.startTime >= '08:50'),
  r2.blocks.filter((x) => x.id !== 'c1').map((x) => x.startTime).join(','));
check('preservado: sem sobreposição', contaSobreposicao(r2.blocks) === 0);

// ------------------------------------------------ dia sadio não é tocado
const diaSaudavel: StudyBlock[] = [
  b('a', D, '09:00', 50),
  b('c', D, '10:00', 50),
];
const r3 = repairOverlappingDays({ blocks: diaSaudavel, breakMinutes: 10, windowStart: '08:00' });
check('dia sadio: nada muda', r3.blocks.every((x, i) => x.startTime === diaSaudavel[i].startTime),
  r3.blocks.map((x) => x.startTime).join(','));
check('dia sadio: nenhum dia corrigido', r3.diasCorrigidos === 0 && r3.movidos === 0);

// ------------------------------------------------ outros dias intactos
const doisDias: StudyBlock[] = [
  ...diaFoto,
  b('outro', '2026-10-02', '09:00', 50),
  b('outro2', '2026-10-02', '10:00', 50),
];
const r4 = repairOverlappingDays({ blocks: doisDias, breakMinutes: 10, windowStart: '08:00' });
const dia2 = r4.blocks.filter((x) => chave(x) === '2026-10-02');
check('outro dia: intacto', dia2.length === 2 && dia2[0].startTime === '09:00' && dia2[1].startTime === '10:00',
  dia2.map((x) => x.startTime).join(','));
check('dois dias: total preservado', r4.blocks.length === 10, `${r4.blocks.length}`);

// ------------------------------------------------ idempotente
const r5 = repairOverlappingDays({ blocks: r1.blocks, breakMinutes: 10, windowStart: '08:00' });
check('idempotente: segunda passada não mexe', r5.movidos === 0, `${r5.movidos} movidos`);

console.log(falhas === 0 ? '\nTodos os casos passaram.' : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
