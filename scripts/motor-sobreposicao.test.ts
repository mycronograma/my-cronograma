/**
 * O motor de cronograma consegue gerar blocos em cima de blocos?
 *
 * A foto do usuário mostra 8 matérias num dia, aos pares no mesmo horário
 * (duas às 09:00, duas às 10:00, duas às 11:00). Se o motor fizer isso, o
 * problema é dele; se não fizer, o problema está em quem monta o dia
 * depois (arrastar, adicionar manual, regerar).
 *
 * Rodar: npm run test:gerar
 */
import { generateChronologicalSchedule } from '../src/services/roadmapEngine';
import { resolveScheduleConstraints } from '../src/services/scheduleConstraints';
import { timeToMinutes, minutesToTime, toLocalDateKey, parseBlockDate } from '../src/lib/utils';
import type { StudyBlock, Subject, UserSettings } from '../src/types';

let falhas = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) falhas++;
  console.log(`${ok ? '\u2714' : '\u2718'} ${rotulo}${extra ? ` \u2014 ${extra}` : ''}`);
};

const sobrepostos = (blocos: Array<{ startTime: string; endTime: string; isBreak?: boolean }>) => {
  const estudo = blocos.filter((b) => !b.isBreak);
  let n = 0;
  for (let i = 0; i < estudo.length; i++) {
    for (let j = i + 1; j < estudo.length; j++) {
      const a = estudo[i], c = estudo[j];
      if (timeToMinutes(a.startTime) < timeToMinutes(c.endTime) &&
          timeToMinutes(c.startTime) < timeToMinutes(a.endTime)) n++;
    }
  }
  return n;
};

const materia = (id: string, nome: string, peso: number): Subject =>
  ({
    id,
    userId: 'u1',
    name: nome,
    color: '#6366F1',
    icon: 'book',
    priority: peso,
    difficulty: peso,
    targetHours: 5,
    completedHours: 0,
    totalHours: 20,
    sessionsCount: 0,
    averageScore: 0,
    proficiencyScore: 0,
    examWeight: peso,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Subject;

// As 8 matérias da foto.
const MATERIAS: Subject[] = [
  materia('quimica', 'Química', 8),
  materia('portugues', 'Português', 9),
  materia('biologia', 'Biologia', 7),
  materia('redacao', 'Redação', 10),
  materia('fisica', 'Física', 6),
  materia('historia', 'História', 5),
  materia('geografia', 'Geografia', 5),
  materia('matematica', 'Matemática', 9),
];

const settings: UserSettings = {
  userId: 'u1',
  dailyGoalHours: 3,
  breakMinutes: 10,
  focusBlockMinutes: 50,
  dailyHoursByWeekday: { mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 2, sun: 0 },
  dailyAvailabilityByWeekday: {
    mon: { start: '08:00', end: '12:00' },
    tue: { start: '08:00', end: '12:00' },
    wed: { start: '08:00', end: '12:00' },
    thu: { start: '08:00', end: '12:00' },
    fri: { start: '08:00', end: '12:00' },
    sat: { start: '08:00', end: '12:00' },
    sun: { start: '08:00', end: '12:00' },
  },
} as unknown as UserSettings;

const inicio = new Date(2026, 9, 1); // 1 de outubro
const fim = new Date(2026, 9, 4);    // 4 de outubro

function gerar(comJanela: boolean) {
  const constraints = resolveScheduleConstraints({
    userSettings: {
      ...settings,
      dailyAvailabilityByWeekday: comJanela ? settings.dailyAvailabilityByWeekday : undefined,
    } as UserSettings,
    studyPrefs: { hoursPerDay: 3, focusBlockMinutes: 50, blockDurationMinutes: 50, breakMinutes: 10 },
    startDate: inicio,
    endDate: fim,
  });
  return generateChronologicalSchedule({
    subjects: MATERIAS,
    preferences: { hoursPerDay: 3, focusBlockMinutes: 50, breakMinutes: 10 } as never,
    startDate: inicio,
    endDate: fim,
    preferredStart: constraints.preferredStart,
    preferredEnd: constraints.preferredEnd,
    maxBlockMinutes: constraints.maxBlockMinutes,
    breakMinutes: constraints.breakMinutes,
    restDays: constraints.restDays,
    dailyLimitByDate: constraints.dailyLimitByDate,
    dailyTimeWindowByDate: comJanela ? constraints.dailyTimeWindowByDate : undefined,
    firstCycleAllSubjects: true,
  });
}

// ---------------------------------------------------- sem janela por dia
const semJanela = gerar(false);
check('motor devolve blocos', semJanela.blocks.length > 0, `${semJanela.blocks.length} blocos`);
check('motor sem janela: sem sobreposição', sobrepostos(semJanela.blocks) === 0,
  `${sobrepostos(semJanela.blocks)} sobreposições`);

// ---------------------------------------------------- com janela por dia
const comJanela = gerar(true);
check('motor com janela: devolve blocos', comJanela.blocks.length > 0, `${comJanela.blocks.length} blocos`);
const sobrep = sobrepostos(comJanela.blocks);
check('motor com janela: sem sobreposição', sobrep === 0, `${sobrep} sobreposições`);

// ---------------------------------------------------- o dia mais cheio
const porDia = new Map<string, typeof comJanela.blocks>();
comJanela.blocks.forEach((b) => {
  const k = toLocalDateKey(parseBlockDate(b.date));
  if (!porDia.has(k)) porDia.set(k, []);
  porDia.get(k)!.push(b);
});
let piorDia = '';
let piorN = 0;
porDia.forEach((lista, k) => {
  const n = lista.filter((b) => !b.isBreak).length;
  if (n > piorN) { piorN = n; piorDia = k; }
});
check('nenhum dia absurdo (≤ 8 matérias)', piorN <= 8, `pior dia ${piorDia} com ${piorN}`);

// ---------------------------------------------------- distribuição por dia
const resumo = [...porDia.entries()]
  .sort()
  .map(([k, lista]) => `${k}: ${lista.filter((b) => !b.isBreak).length} mat`)
  .join(' | ');
console.log(`   distribuição: ${resumo}`);

const dump = comJanela.blocks
  .slice()
  .sort((a, b) => toLocalDateKey(parseBlockDate(a.date)).localeCompare(toLocalDateKey(parseBlockDate(b.date))) || a.startTime.localeCompare(b.startTime));
dump.forEach((b) => {
  console.log(`   ${toLocalDateKey(parseBlockDate(b.date))} ${b.startTime}-${b.endTime} ${String(b.durationMinutes).padStart(3)}m ${b.isBreak ? 'INTERVALO' : (b.subjectId || '?')}`);
});

console.log(falhas === 0 ? '\nTodos os casos passaram.' : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
