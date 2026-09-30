/**
 * Diagnóstico: por que o "automático" dava 1:50 quando a pessoa queria 4:30?
 *
 * Roda as funções reais de weeklyTarget com o cenário do print do usuário
 * (14 matérias, carga 26h/semana).
 *
 * ANTES: as 13 outras matérias estavam marcadas como "fixadas pela pessoa", então
 * reservavam 20,75h das 26h. A matéria editada era a única automática e recebia
 * a sobra (5,25h) — por ser a única, pegava tudo e o PESO NÃO MUDAVA NADA:
 * peso 8 e peso 10 davam exatamente o mesmo valor.
 *
 * DEPOIS (#30): nenhuma matéria reserva horas. A divisão é sempre proporcional
 * ao peso (carga × peso² ÷ Σ peso²), então subir o peso tira horas das outras e
 * a soma fecha na carga. Este script agora mede o comportamento novo.
 */
import { recalculateAllTargets } from '../src/services/weeklyTarget';

const CAPACIDADE = 26; // 26:00 por semana (Ajustes)

const hm = (h: number) =>
  `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

const somar = (o: Record<string, number>) =>
  Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 60) / 60;

// 14 matérias como no print, com o peso que cada uma tinha.
const base = [
  { id: 'port', priority: 8, difficulty: 8 },
  { id: 'mat', priority: 9, difficulty: 9 },
  { id: 'bio', priority: 7, difficulty: 7 },
  { id: 'qui', priority: 6, difficulty: 6 },
  { id: 'fis', priority: 6, difficulty: 6 },
  { id: 'hist', priority: 5, difficulty: 5 },
  { id: 'geo', priority: 5, difficulty: 5 },
  { id: 'ing', priority: 4, difficulty: 4 },
  { id: 'lit', priority: 4, difficulty: 4 },
  { id: 'red', priority: 7, difficulty: 7 },
  { id: 'atu', priority: 3, difficulty: 3 },
  { id: 'fil', priority: 3, difficulty: 3 },
  { id: 'soc', priority: 3, difficulty: 3 },
  { id: 'art', priority: 2, difficulty: 2 },
];

console.log(`Carga semanal: ${hm(CAPACIDADE)}\n`);

console.log('O peso da matéria editada agora muda as horas dela:');
const anterior: Record<string, Record<string, number>> = {};
for (const peso of [5, 8, 10]) {
  const lista = base.map((m, i) =>
    i === 0 ? { ...m, id: 'port', priority: peso, difficulty: peso } : m
  );
  const alvos = recalculateAllTargets(lista, CAPACIDADE);
  anterior[peso] = alvos;
  console.log(
    `  peso ${String(peso).padStart(2)} → ${hm(alvos.port).padStart(5)} para ela` +
      `  (cada outra: ${hm(alvos.mat)})  soma: ${hm(somar(alvos))}`
  );
}

console.log('\nConferências:');
const p8 = anterior[8];
const p10 = anterior[10];
console.log(
  `  peso 10 > peso 8?           ${p10.port > p8.port ? 'sim' : 'NÃO'} ` +
    `(${hm(p8.port)} → ${hm(p10.port)})`
);
console.log(
  `  as outras perdem hora?      ${p10.mat < p8.mat ? 'sim' : 'NÃO'} ` +
    `(${hm(p8.mat)} → ${hm(p10.mat)})`
);
console.log(
  `  soma fecha em ${hm(CAPACIDADE)}?        ` +
    `${Math.abs(somar(p10) - CAPACIDADE) < 0.09 ? 'sim' : 'NÃO'} (${hm(somar(p10))})`
);
