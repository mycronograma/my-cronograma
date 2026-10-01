/**
 * Integração: o que o arrastar faz com o dia inteiro.
 *
 * O gesto é simples, mas a resposta precisa ser conservadora: blocos já
 * estudados não saem do lugar, intervalos continuam existindo, e o resto do
 * cronograma (outros dias) não é tocado.
 *
 * Rodar: npm run test:drag
 */
import { reorderDayBlocks, splitDay, isPreservado } from '../src/services/dayReorder';
import { toLocalDateKey } from '../src/lib/utils';
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
  end: string,
  status: Status,
  dur = 50
): StudyBlock =>
  ({
    id,
    userId: 'u1',
    subjectId: id,
    date: new Date(`${date}T00:00:00`),
    startTime: start,
    endTime: end,
    durationMinutes: dur,
    status,
    isBreak: false,
  }) as StudyBlock;

const D1 = '2026-10-01';
const D2 = '2026-10-02';

/** O mesmo merge que o planner faz: só o dia mexe, o resto fica. */
function aplicarArrasto(todos: StudyBlock[], diaAlvo: string, from: number, to: number) {
  const dayBlocks = todos
    .filter((x) => toLocalDateKey(x.date) === diaAlvo)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const resultado = reorderDayBlocks({
    dayBlocks,
    fromIndex: from,
    toIndex: to,
    breakMinutes: 10,
    windowStart: '08:00',
  });
  const remontados = new Set(resultado.blocks.map((x) => x.id));
  return {
    todos: [...todos.filter((x) => !remontados.has(x.id)), ...resultado.blocks],
    resultado,
  };
}

// ---------------------------------------------------- cenário
const todos: StudyBlock[] = [
  // D1: estudou Matemática de manhã; História e Química ainda pendentes
  b('mat', D1, '08:00', '08:50', 'completed'),
  b('his', D1, '09:00', '09:50', 'scheduled'),
  b('qui', D1, '10:00', '10:50', 'scheduled'),
  // D2: dia inteiro pendente
  b('bio', D2, '08:00', '08:50', 'scheduled'),
  b('geo', D2, '09:00', '09:50', 'scheduled'),
];

// ------------------------------------- arrastar Química para o topo do D1
const { todos: depois, resultado } = aplicarArrasto(todos, D1, 1, 0);
const dia1 = depois.filter((x) => toLocalDateKey(x.date) === D1).sort((a, b) => a.startTime.localeCompare(b.startTime));
const dia2 = depois.filter((x) => toLocalDateKey(x.date) === D2);

check('ordem nova: Química primeiro', dia1.filter((x) => !x.isBreak).map((x) => x.id).join(',') === 'mat,qui,his',
  dia1.filter((x) => !x.isBreak).map((x) => x.id).join(','));
check('concluído não mudou de horário',
  dia1.find((x) => x.id === 'mat')!.startTime === '08:00' && dia1.find((x) => x.id === 'mat')!.endTime === '08:50');
check('concluído continua concluído', dia1.find((x) => x.id === 'mat')!.status === 'completed');
check('pendentes começam depois do concluído',
  dia1.filter((x) => !x.isBreak && x.id !== 'mat')[0].startTime === '09:00',
  dia1.filter((x) => !x.isBreak && x.id !== 'mat')[0].startTime);
check('intervalos recriados', dia1.filter((x) => x.isBreak).length === 2,
  `${dia1.filter((x) => x.isBreak).length}`);

// ------------------------------------- o outro dia não é tocado
check('outro dia intacto', dia2.length === 2 && dia2[0].startTime === '08:00' && dia2[1].startTime === '09:00',
  dia2.map((x) => x.startTime).join(','));
check('contagem total de blocos igual', depois.filter((x) => !x.isBreak).length === 5,
  `${depois.filter((x) => !x.isBreak).length}`);

// ------------------------------------- nenhuma sobreposição no D1
let colisoes = 0;
for (let i = 0; i < dia1.length; i++) {
  for (let j = i + 1; j < dia1.length; j++) {
    const a = dia1[i], c = dia1[j];
    if (a.startTime < c.endTime && c.startTime < a.endTime) colisoes++;
  }
}
check('nenhum bloco em cima do outro', colisoes === 0, `${colisoes} colisões`);

// ------------------------------------- intervalo obrigatório mantido
const materias = dia1.filter((x) => !x.isBreak);
let buracos: number[] = [];
for (let i = 1; i < materias.length; i++) {
  const fimAnterior = materias[i - 1].endTime;
  const inicioAtual = materias[i].startTime;
  buracos.push(
    (Number(inicioAtual.slice(0, 2)) * 60 + Number(inicioAtual.slice(3))) -
    (Number(fimAnterior.slice(0, 2)) * 60 + Number(fimAnterior.slice(3)))
  );
}
check('intervalo de 10min entre matérias', buracos.every((v) => v === 10), buracos.join(','));

// ------------------------------------- dia sem pendente não reordena
const soConcluidos = [b('c1', D1, '08:00', '08:50', 'completed')];
const r = reorderDayBlocks({
  dayBlocks: soConcluidos, fromIndex: 0, toIndex: 0, breakMinutes: 10, windowStart: '08:00',
});
check('dia sem pendente: recusa', r.movidos === 0 && Boolean(r.reason), r.reason || '');

// ------------------------------------- blocos preservados nunca entram na lista arrastável
const diaMisto = [
  b('c1', D1, '08:00', '08:50', 'completed'),
  b('and', D1, '09:00', '09:50', 'in-progress'),
  b('p1', D1, '10:00', '10:50', 'scheduled'),
];
const arrastaveis = diaMisto.filter((x) => !isPreservado(x));
check('só pendentes são arrastáveis', arrastaveis.length === 1 && arrastaveis[0].id === 'p1',
  arrastaveis.map((x) => x.id).join(','));

// ------------------------------------- splitDay ignora intervalo
const comIntervalo = [
  ...diaMisto,
  { ...b('brk', D1, '08:50', '09:00', 'scheduled', 10), isBreak: true } as StudyBlock,
];
const { preservados, pendentes } = splitDay(comIntervalo);
check('split: intervalo fora das duas listas', preservados.length === 2 && pendentes.length === 1);

// ------------------------------------- dia todo pendente começa na janela
const diaLivre = [b('a', D2, '09:00', '09:50', 'scheduled'), b('c', D2, '11:00', '11:50', 'scheduled')];
const r2 = reorderDayBlocks({
  dayBlocks: diaLivre, fromIndex: 1, toIndex: 0, breakMinutes: 10, windowStart: '08:00',
});
check('dia livre: relógio recomeça na janela', r2.blocks[0].startTime === '08:00',
  r2.blocks.map((x) => x.startTime).join(','));

console.log(falhas === 0 ? '\nTodos os casos passaram.' : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
