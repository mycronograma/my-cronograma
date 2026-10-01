/**
 * Testes das janelas livres usadas para regerar sem pisar no que já foi estudado.
 * Rodar: npm run test:freeday
 */
import { computeFreeDayWindows } from '../src/services/freeDayWindows';

let falhas = 0;
function check(rotulo: string, ok: boolean, extra = '') {
  if (!ok) falhas++;
  console.log(`${ok ? '\u2714' : '\u2718'} ${rotulo}${extra ? ` \u2014 ${extra}` : ''}`);
}

const DIA = '2026-10-01';
const BASE = { [DIA]: { start: '08:00', end: '12:00' } };

// 1. Sem nada preservado, a janela é a habitual.
const r1 = computeFreeDayWindows({ preservados: [], janelasBase: BASE, dias: [DIA] });
check('sem preservados: janela habitual', r1[DIA].start === '08:00' && r1[DIA].end === '12:00');

// 2. Bloco concluído de manhã encosta a janela no que sobrou.
const r2 = computeFreeDayWindows({
  preservados: [{ date: new Date(2026, 9, 1), startTime: '08:00', endTime: '09:50' }],
  janelasBase: BASE,
  dias: [DIA],
});
check('concluido de manha: comeca depois dele', r2[DIA].start === '09:50', `inicio=${r2[DIA].start}`);
check('concluido de manha: termina no fim do dia', r2[DIA].end === '12:00');

// 3. Preservado no fim do dia encurta a janela pelo fim.
const r3 = computeFreeDayWindows({
  preservados: [{ date: DIA, startTime: '11:00', endTime: '12:00' }],
  janelasBase: BASE,
  dias: [DIA],
});
check('concluido no fim: janela acaba antes', r3[DIA].end === '11:00', `fim=${r3[DIA].end}`);

// 4. Preservado no meio: fica o MAIOR buraco (10:00-12:00 = 2h, contra 08:00-09:00 = 1h).
const r4 = computeFreeDayWindows({
  preservados: [{ date: DIA, startTime: '09:00', endTime: '10:00' }],
  janelasBase: BASE,
  dias: [DIA],
});
check('buraco no meio: fica o maior', r4[DIA].start === '10:00' && r4[DIA].end === '12:00',
  `${r4[DIA].start}-${r4[DIA].end}`);

// 5. Dia inteiramente ocupado não recebe janela.
const r5 = computeFreeDayWindows({
  preservados: [{ date: DIA, startTime: '08:00', endTime: '12:00' }],
  janelasBase: BASE,
  dias: [DIA],
});
check('dia cheio: sem janela', r5[DIA] === undefined);

// 6. Sobra pequena demais (< 25 min) não vira janela.
const r6 = computeFreeDayWindows({
  preservados: [{ date: DIA, startTime: '08:00', endTime: '11:45' }],
  janelasBase: BASE,
  dias: [DIA],
});
check('sobra de 15 min: sem janela', r6[DIA] === undefined);

// 7. Vários preservados encostados contam como uma só ocupação.
const r7 = computeFreeDayWindows({
  preservados: [
    { date: DIA, startTime: '08:00', endTime: '09:00' },
    { date: DIA, startTime: '09:00', endTime: '10:00' },
  ],
  janelasBase: BASE,
  dias: [DIA],
});
check('encostados viram um bloco so', r7[DIA].start === '10:00' && r7[DIA].end === '12:00',
  `${r7[DIA].start}-${r7[DIA].end}`);

// 8. Preservado que extrapola a janela é cortado na borda.
const r8 = computeFreeDayWindows({
  preservados: [{ date: DIA, startTime: '07:00', endTime: '09:00' }],
  janelasBase: BASE,
  dias: [DIA],
});
check('extrapolado e cortado na borda', r8[DIA].start === '09:00', `inicio=${r8[DIA].start}`);

// 9. Horário inválido (fim antes do início) é ignorado.
const r9 = computeFreeDayWindows({
  preservados: [{ date: DIA, startTime: '10:00', endTime: '09:00' }],
  janelasBase: BASE,
  dias: [DIA],
});
check('horario invalido nao atrapalha', r9[DIA].start === '08:00' && r9[DIA].end === '12:00');

// 10. Dia sem janela base conhecida fica de fora.
const r10 = computeFreeDayWindows({
  preservados: [],
  janelasBase: BASE,
  dias: ['2026-10-02'],
});
check('dia sem janela base: de fora', r10['2026-10-02'] === undefined);

// 11. Vários dias preservados ao mesmo tempo.
const BASE2 = {
  '2026-10-01': { start: '08:00', end: '12:00' },
  '2026-10-02': { start: '08:00', end: '12:00' },
};
const r11 = computeFreeDayWindows({
  preservados: [
    { date: '2026-10-01', startTime: '08:00', endTime: '09:50' },
    { date: '2026-10-02', startTime: '08:00', endTime: '12:00' },
  ],
  janelasBase: BASE2,
  dias: ['2026-10-01', '2026-10-02'],
});
check('dia 1 preservido parcialmente', r11['2026-10-01'].start === '09:50');
check('dia 2 preservido por inteiro', r11['2026-10-02'] === undefined);

// 12. Data como ISO string também funciona.
const r12 = computeFreeDayWindows({
  preservados: [{ date: '2026-10-01T12:00:00.000Z', startTime: '08:00', endTime: '09:50' }],
  janelasBase: BASE,
  dias: [DIA],
});
check('data ISO funciona', r12[DIA].start === '09:50', `inicio=${r12[DIA].start}`);

console.log(falhas === 0 ? 'Todos os casos passaram.' : `${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
