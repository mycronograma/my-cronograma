/**
 * Testes do encaixe automático (#19).
 * Rodar: npm run test:freeslot
 */
import { findFreeSlot } from '../src/services/freeSlot';

let falhas = 0;
const check = (nome: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${nome}${ok ? '' : ` — ${extra}`}`);
  if (!ok) falhas++;
};

const bloco = (start: string, end: string, isBreak = false) => ({ startTime: start, endTime: end, durationMinutes: 0, isBreak });

// 1. Dia vazio: primeiro horário é o início da janela.
check('dia vazio usa o início da janela',
  findFreeSlot({ dayBlocks: [], durationMinutes: 50, breakMinutes: 10, window: { start: '19:00', end: '22:00' } })?.start === '19:00');

// 2. Depois de um bloco, respeita o intervalo.
const r2 = findFreeSlot({
  dayBlocks: [bloco('19:00', '19:50')], durationMinutes: 50, breakMinutes: 10,
  window: { start: '19:00', end: '22:00' },
});
check('respeita o intervalo entre blocos', r2?.start === '20:00', JSON.stringify(r2));

// 3. Encaixa no buraco entre dois blocos (o caso do print: 10:15).
const r3 = findFreeSlot({
  dayBlocks: [bloco('09:00', '10:00'), bloco('11:00', '12:00')], durationMinutes: 30, breakMinutes: 15,
  window: { start: '09:00', end: '22:00' },
});
check('encaixa no primeiro buraco do dia', r3?.start === '10:15', JSON.stringify(r3));

// 4. Estourou o limite de horas do dia → null.
check('limite de horas do dia respeitado',
  findFreeSlot({ dayBlocks: [bloco('19:00', '21:00')], durationMinutes: 50, breakMinutes: 10, dayLimitMinutes: 120, usedStudyMinutes: 120 }) === null);

// 5. Dia sem horas configuradas (limite 0) → null.
check('dia sem estudo configurado não aceita bloco',
  findFreeSlot({ dayBlocks: [], durationMinutes: 50, breakMinutes: 10, dayLimitMinutes: 0, usedStudyMinutes: 0 }) === null);

// 6. Sem limite informado, usa a janela.
check('sem limite usa a janela padrão',
  findFreeSlot({ dayBlocks: [], durationMinutes: 50, breakMinutes: 10 })?.start === '08:00');

// 7. Não cabe na janela → null.
check('bloco maior que a janela não cabe',
  findFreeSlot({ dayBlocks: [], durationMinutes: 60, breakMinutes: 10, window: { start: '21:30', end: '22:00' } }) === null);

console.log(falhas === 0 ? '\nTodos os casos passaram.' : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
