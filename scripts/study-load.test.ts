/**
 * Teste da carga horaria do plano (lib/studyLoad).
 * Rodar: npm run test:load
 */
import {
  computeLoadPlan,
  deriveEndDateFromHours,
  diasEntre,
  formatarDataLonga,
  formatarHoras,
} from '../src/lib/studyLoad';
import type { WeekdayKey } from '../src/types';

let passou = 0;
let falhou = 0;

function ok(rotulo: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log('OK    ' + rotulo);
  } else {
    falhou += 1;
    console.log('FALHA ' + rotulo + (detalhe ? ' -- ' + detalhe : ''));
  }
}

function num(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

const SEG_A_SEX: Record<WeekdayKey, number> = {
  dom: 0, seg: 3, ter: 3, qua: 3, qui: 3, sex: 3, sab: 0,
};

const ZERADO: Record<WeekdayKey, number> = {
  dom: 0, seg: 0, ter: 0, qua: 0, qui: 0, sex: 0, sab: 0,
};

const TODOS: Record<WeekdayKey, number> = {
  dom: 2, seg: 2, ter: 2, qua: 2, qui: 2, sex: 2, sab: 2,
};

const INICIO = '2026-10-01';
const PROVA = '2026-11-15';

console.log('--- horas em formato de hora ---');
ok('8,5h vira 8h30', formatarHoras(8.5) === '8h30', formatarHoras(8.5));
ok('28,5h vira 28h30', formatarHoras(28.5) === '28h30', formatarHoras(28.5));
ok('3h redondo', formatarHoras(3) === '3h', formatarHoras(3));
ok('meia hora', formatarHoras(0.5) === '30min', formatarHoras(0.5));
ok('zero', formatarHoras(0) === '0h', formatarHoras(0));
ok(
  'data longa em pt-BR',
  formatarDataLonga('2026-11-15') === '15 de novembro de 2026',
  formatarDataLonga('2026-11-15')
);

console.log('');
console.log('--- dias entre datas ---');
ok('45 dias entre 01/10 e 15/11', diasEntre(INICIO, PROVA) === 45, String(diasEntre(INICIO, PROVA)));
ok('mesmo dia = 0', diasEntre(INICIO, INICIO) === 0);

console.log('');
console.log('--- derivar data final pela carga ---');
ok(
  '60h com 15h/semana termina em 28/10',
  deriveEndDateFromHours(INICIO, 60, SEG_A_SEX) === '2026-10-28',
  deriveEndDateFromHours(INICIO, 60, SEG_A_SEX)
);
ok(
  '28h com 14h/semana termina em 14/10',
  deriveEndDateFromHours(INICIO, 28, TODOS) === '2026-10-14',
  deriveEndDateFromHours(INICIO, 28, TODOS)
);
ok('carga zero devolve o inicio', deriveEndDateFromHours(INICIO, 0, SEG_A_SEX) === INICIO);
ok('carga negativa devolve o inicio', deriveEndDateFromHours(INICIO, -5, SEG_A_SEX) === INICIO);
const fimZerado = deriveEndDateFromHours(INICIO, 40, ZERADO);
ok('todos os dias zerados nao trava', fimZerado.length === 10, fimZerado);

console.log('');
console.log('--- prazo + carga: o plano fecha? ---');
const cabe = computeLoadPlan({ startKey: INICIO, examDate: PROVA, totalHours: 90, daily: SEG_A_SEX });
ok('cabe: 90h <= ~96h', cabe.viavel === true, String(cabe.viavel));
ok('faltam 0h', (cabe.faltamHoras ?? 1) === 0, String(cabe.faltamHoras));
ok('sobram ~6h', num(cabe.sobramHoras) && (cabe.sobramHoras as number) > 5 && (cabe.sobramHoras as number) < 7, String(cabe.sobramHoras));
ok(
  'precisa ~2,8h por dia ativo',
  num(cabe.horasPorDiaAtivoNecessarias) &&
    (cabe.horasPorDiaAtivoNecessarias as number) > 2.5 &&
    (cabe.horasPorDiaAtivoNecessarias as number) < 3.1,
  String(cabe.horasPorDiaAtivoNecessarias)
);
ok('data final e a da prova', cabe.dataFim === PROVA, cabe.dataFim);
ok('origem = prova', cabe.origemDataFim === 'prova');
ok('46 dias restantes (conta o dia da prova)', cabe.diasRestantes === 46, String(cabe.diasRestantes));

const naoCabe = computeLoadPlan({ startKey: INICIO, examDate: PROVA, totalHours: 300, daily: SEG_A_SEX });
ok('nao cabe: 300h > ~96h', naoCabe.viavel === false, String(naoCabe.viavel));
ok('faltam ~204h', (naoCabe.faltamHoras ?? 0) > 200, String(naoCabe.faltamHoras));
ok(
  'precisa ~9,3h por dia ativo',
  (naoCabe.horasPorDiaAtivoNecessarias ?? 0) > 9 &&
    (naoCabe.horasPorDiaAtivoNecessarias ?? 0) < 9.6,
  String(naoCabe.horasPorDiaAtivoNecessarias)
);

const exato = computeLoadPlan({ startKey: INICIO, examDate: PROVA, totalHours: 96, daily: SEG_A_SEX });
ok('96h cabe (exato)', exato.viavel === true, String(exato.viavel));

console.log('');
console.log('--- so prazo, sem carga ---');
const soPrazo = computeLoadPlan({ startKey: INICIO, examDate: PROVA, daily: SEG_A_SEX });
ok('mostra quanto vai cobrir', (soPrazo.horasCobertasAteProva ?? 0) > 90, String(soPrazo.horasCobertasAteProva));
ok('sem necessaria por dia', soPrazo.horasPorDiaAtivoNecessarias === null);
ok('viabilidade desconhecida', soPrazo.viavel === null);
ok('data final e a da prova', soPrazo.dataFim === PROVA);

console.log('');
console.log('--- so carga, sem prazo ---');
const soCarga = computeLoadPlan({ startKey: INICIO, totalHours: 60, daily: SEG_A_SEX });
ok('data derivada da carga', soCarga.dataFim === '2026-10-28', soCarga.dataFim);
ok('origem = carga', soCarga.origemDataFim === 'carga');
ok('viavel (nao ha prazo a furar)', soCarga.viavel === true);
ok('sem dias restantes', soCarga.diasRestantes === null);

console.log('');
console.log('--- nem prazo nem carga ---');
const nada = computeLoadPlan({ startKey: INICIO, daily: SEG_A_SEX });
ok('cobre a primeira semana', nada.dataFim === '2026-10-07', nada.dataFim);
ok('origem = semana', nada.origemDataFim === 'semana');
ok('viabilidade desconhecida', nada.viavel === null);

console.log('');
console.log('--- entradas estranhas nao quebram ---');
const nulo = computeLoadPlan({ startKey: INICIO, examDate: PROVA, totalHours: null, daily: SEG_A_SEX });
ok('carga null e tratada', nulo.horasCobertasAteProva !== null);
const zeroCarga = computeLoadPlan({ startKey: INICIO, examDate: PROVA, totalHours: 0, daily: SEG_A_SEX });
ok('carga 0 e tratada', zeroCarga.horasCobertasAteProva !== null);
const dataRuim = computeLoadPlan({ startKey: INICIO, examDate: 'texto-invalido', totalHours: 40, daily: SEG_A_SEX });
ok('data invalida nao quebra', dataRuim.dataFim.length === 10, dataRuim.dataFim);
const ritmoZero = computeLoadPlan({ startKey: INICIO, examDate: PROVA, totalHours: 100, daily: ZERADO });
ok('ritmo zero nao gera NaN', num(ritmoZero.horasPorSemana) && ritmoZero.horasPorSemana === 0, String(ritmoZero.horasPorSemana));
ok('dias ativos zero', ritmoZero.diasAtivos === 0);

console.log('');
console.log(`${passou} passaram, ${falhou} falharam.`);
if (falhou > 0) process.exit(1);
