/**
 * Testes da divisão da carga semanal (#15/#20).
 * Rodar: npm run test:target
 */
import {
  allocateWeeklyTargets,
  computeAutoTargetHours,
  describeAutoTarget,
  effectiveWeight,
  subjectWeight,
} from '../src/services/weeklyTarget';

let falhas = 0;
const check = (nome: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${nome}${ok ? '' : ` — ${extra}`}`);
  if (!ok) falhas++;
};
const hm = (v: number) => {
  const h = Math.floor(v + 1e-6);
  const m = Math.round((v - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

// 1. Peso: prioridade pesa mais que dificuldade.
check('peso combina prioridade e dificuldade',
  Math.abs(subjectWeight(10, 10) - 1) < 1e-9 && Math.abs(subjectWeight(1, 1) - 0.1) < 1e-9);
check('prioridade 10 + dificuldade 6 = 0.84',
  Math.abs(subjectWeight(10, 6) - 0.84) < 1e-9, String(subjectWeight(10, 6)));

// 2. Curva de destaque: peso 10 rende 4x as horas de peso 5.
const w10 = effectiveWeight(10, 10);
const w5 = effectiveWeight(5, 5);
check('curva de destaque: peso 10 = 4x peso 5', Math.abs(w10 / w5 - 4) < 1e-9, String(w10 / w5));
check('curva de destaque: peso 10 > peso 8', w10 > effectiveWeight(8, 8));

// 3. Caso do print: Biologia peso 10 entre 6 matérias de peso ~8.6, 20h/semana.
const peers = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, priority: 9, difficulty: 8 }));
const caso = allocateWeeklyTargets(
  [{ id: 'bio', priority: 10, difficulty: 10 }, ...peers],
  { capacityHours: 20 }
);
check('caso do print: Biologia fica acima da média (20h ÷ 7 = 2:51)',
  caso.byId.bio > 20 / 7, `bio=${caso.byId.bio}`);
check('caso do print: a soma fecha nas 20h',
  Math.abs(caso.totalHours - 20) < 0.09, `total=${caso.totalHours}`);
check('caso do print: nada de sobra sem dono', caso.unallocatedHours <= 0.09, String(caso.unallocatedHours));

// 4. Metas fixas são reservadas antes (o bug que fazia a soma não fechar).
const r4 = allocateWeeklyTargets(
  [
    { id: 'fixa1', priority: 5, difficulty: 5, fixedHours: 6 },
    { id: 'fixa2', priority: 5, difficulty: 5, fixedHours: 4 },
    { id: 'auto', priority: 10, difficulty: 10 },
  ],
  { capacityHours: 20 }
);
check('fixas preservadas', r4.byId.fixa1 === 6 && r4.byId.fixa2 === 4, JSON.stringify(r4.byId));
check('automática recebe o que sobrou (10h)', Math.abs(r4.byId.auto - 10) < 0.001, String(r4.byId.auto));
check('soma fecha na capacidade', Math.abs(r4.totalHours - 20) < 0.09, String(r4.totalHours));

// 5. Sem carga sobrando: automáticas ficam no piso, fixas intactas.
const r5 = allocateWeeklyTargets(
  [
    { id: 'fixa', priority: 5, difficulty: 5, fixedHours: 20 },
    { id: 'auto', priority: 10, difficulty: 10 },
  ],
  { capacityHours: 20 }
);
check('sem sobra: fixa intacta', r5.byId.fixa === 20);
check('sem sobra: automática no piso', r5.byId.auto === 0.5, String(r5.byId.auto));
check('sem sobra: avisa estouro', r5.overCapacity && Math.abs(r5.overflowHours - 0.5) < 1e-9);

// 6. Teto por matéria: ninguém engole a semana.
const r6 = allocateWeeklyTargets(
  [
    { id: 'gigante', priority: 10, difficulty: 10 },
    { id: 'a', priority: 1, difficulty: 1 },
    { id: 'b', priority: 1, difficulty: 1 },
  ],
  { capacityHours: 20 }
);
check('teto de 60% respeitado', r6.byId.gigante <= 12 + 1e-9, String(r6.byId.gigante));
check('teto: a soma fecha nas 20h', Math.abs(r6.totalHours - 20) < 0.09, String(r6.totalHours));
check('teto: as maiores recebem mais', r6.byId.gigante > r6.byId.a, JSON.stringify(r6.byId));

// 7. Todas iguais: divisão igualitária.
const iguais = Array.from({ length: 4 }, (_, i) => ({ id: `i${i}`, priority: 7, difficulty: 7 }));
const r7 = allocateWeeklyTargets(iguais, { capacityHours: 20 });
check('pesos iguais dividem igual', Object.values(r7.byId).every((v) => Math.abs(v - 5) < 0.01), JSON.stringify(r7.byId));

// 8. Ordenação: mais peso, mais horas.
const r8 = allocateWeeklyTargets(
  [
    { id: 'alta', priority: 10, difficulty: 10 },
    { id: 'media', priority: 5, difficulty: 5 },
    { id: 'baixa', priority: 1, difficulty: 1 },
  ],
  { capacityHours: 20 }
);
check('mais peso recebe mais horas',
  r8.byId.alta > r8.byId.media && r8.byId.media > r8.byId.baixa, JSON.stringify(r8.byId));

// 9. Compat: só com a soma dos pesos, mantém a divisão proporcional antiga.
const c9 = computeAutoTargetHours({ priority: 10, difficulty: 10, weeklyAvailableHours: 20, peerWeightSum: 0 });
check('compat sem peers: peso máximo sozinho leva tudo (limitado ao teto)', c9 <= 12 + 1e-9, String(c9));

// 10. describeAutoTarget explica os números.
const d10 = describeAutoTarget({
  priority: 10,
  difficulty: 6,
  weeklyAvailableHours: 20,
  peers: [
    { id: 'x', priority: 5, difficulty: 5, fixedHours: 6 },
    { id: 'y', priority: 5, difficulty: 5, fixedHours: 4 },
    { id: 'z', priority: 5, difficulty: 5 },
  ],
});
check('describe: reserva as fixas (10h)', d10.reservedHours === 10, String(d10.reservedHours));
check('describe: em jogo 10h', d10.poolHours === 10, String(d10.poolHours));
check('describe: 2 matérias automáticas dividem', d10.autoCount === 2, String(d10.autoCount));
check('describe: fatia em %', d10.sharePercent > 0 && d10.sharePercent <= 100, String(d10.sharePercent));
check('describe: horas coerentes com o allocate',
  Math.abs(d10.hours - allocateWeeklyTargets(
    [{ id: 'self', priority: 10, difficulty: 6 },
      { id: 'x', priority: 5, difficulty: 5, fixedHours: 6 },
      { id: 'y', priority: 5, difficulty: 5, fixedHours: 4 },
      { id: 'z', priority: 5, difficulty: 5 }],
    { capacityHours: 20 }
  ).byId.self) < 1e-9, String(d10.hours));

// 11. Cenário completo: 7 matérias, 20h/semana. Se as outras 6 já têm meta
//     fixa somando 13h30, a Biologia automática recebe as 6h30 que sobraram —
//     ou seja, o automático respeita o que já está reservado em vez de dividir
//     a semana inteira de novo.
const outrasFixas = Array.from({ length: 6 }, (_, i) => ({
  id: `f${i}`,
  priority: 8,
  difficulty: 7,
  fixedHours: 13.5 / 6,
}));
const r11 = allocateWeeklyTargets(
  [{ id: 'bio', priority: 10, difficulty: 10 }, ...outrasFixas],
  { capacityHours: 20 }
);
check('reserva das fixas: automática recebe o que sobrou (6:30)',
  Math.abs(r11.byId.bio - 6.5) < 0.001, String(r11.byId.bio));
check('reserva das fixas: soma fecha em 20h', Math.abs(r11.totalHours - 20) < 0.09, String(r11.totalHours));

console.log(`\nBio no caso do print: ${hm(caso.byId.bio)} (média ${hm(20 / 7)} de 20h ÷ 7 matérias)`);
console.log(`Bio com as outras 6 fixas em 13h30: ${hm(r11.byId.bio)} (sobra da semana)`);
console.log(falhas === 0 ? 'Todos os casos passaram.' : `${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
