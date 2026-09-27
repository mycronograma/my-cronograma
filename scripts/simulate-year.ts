/**
 * Simulação de 1 ano de uso do Nexora
 * -----------------------------------
 * Persona: Maya Souza, 19 anos, Brasília/DF — objetivo: Medicina UNB via ENEM/SiSU.
 *
 * Gera um ano de histórico realista (29/set/2025 → hoje) + cronograma futuro até
 * a véspera do ENEM 2026 (provas em 8 e 15/nov/2026, domingos):
 *   - matérias importadas do preset ENEM com pesos "medicina";
 *   - blocos diários (aula/exercícios/revisão espaçada/simulado) por fase de prep;
 *   - sessões concluídas com desempenho evolutivo (acerto ~40% → ~78%);
 *   - série de simulados completos com notas por área estilo ENEM (0–1000);
 *   - analytics diário, WeeklyStats, TopicProgress, conquistas e snapshot de
 *     sincronização (UserProgressSnapshot) no formato que o app consome.
 *
 * Rodar APÓS o seed: `npm run db:simulate` (tsx). Idempotente: limpa os dados da
 * persona antes de regenerar.
 */

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prisma = new PrismaClient();

// ---------------------------------------------------------------- utilidades
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rng = mulberry32(20261108);
const between = (min: number, max: number) => min + rng() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const pick = <T,>(items: T[]) => items[Math.floor(rng() * items.length)];

const DAY = 86400000;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const atDay = (d: Date, hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
};
const addMinutesHM = (hm: string, min: number) => {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const inWindow = (d: Date, from: string, to: string) => key(d) >= from && key(d) <= to;

// ------------------------------------------------------------------ persona
const PERSONA = {
  name: 'Maya Souza',
  email: 'maya.souza@nexora.dev',
  password: 'Nexora@123',
  goal: 'Medicina UNB (SiSU) via ENEM 2026',
};
const START = new Date(2025, 8, 29); // seg, 29/set/2025 — primeiro dia de uso
const PLAN_END = new Date(2026, 10, 14); // véspera do 2º dia do ENEM 2026
const ENEM_D1 = new Date(2026, 10, 8);
const ENEM_D2 = new Date(2026, 10, 15);
const SNAPSHOT_BLOCKS_FROM = new Date(2026, 5, 1); // janela levada ao snapshot offline

// Fases da preparação: horas líquidas por dia da semana (dom..sáb)
const PHASES: { from: string; to: string; label: string; hours: number[] }[] = [
  { from: '2025-09-29', to: '2026-01-31', label: 'Base', hours: [3, 4, 4, 4, 4, 4, 5] },
  { from: '2026-02-01', to: '2026-06-30', label: 'Aprofundamento', hours: [3, 5, 5, 5, 5, 5, 6] },
  { from: '2026-07-01', to: '2026-10-25', label: 'Intensificação', hours: [4, 5, 5, 5, 5, 5, 6] },
  { from: '2026-10-26', to: '2026-11-14', label: 'Reta final', hours: [2, 4, 4, 4, 4, 4, 5] },
];
const phaseOf = (d: Date) => PHASES.find((p) => inWindow(d, p.from, p.to)) ?? PHASES[PHASES.length - 1];

// Eventos especiais (sobrepõem a disponibilidade da fase)
const specialDay = (d: Date): { hours: number; note?: string } | null => {
  const k = key(d);
  if (k >= '2025-12-24' && k <= '2026-01-01') return { hours: 0, note: 'recesso' };
  if (k >= '2026-01-02' && k <= '2026-01-04') return { hours: 2, note: 'retomada leve' };
  if (k >= '2026-02-14' && k <= '2026-02-17') return { hours: 2, note: 'carnaval' };
  if (k >= '2026-05-11' && k <= '2026-05-13') return { hours: 0, note: 'gripe' };
  if (k === key(ENEM_D1)) return { hours: 5.5, note: 'ENEM 2026 — Dia 1' };
  if (k === key(ENEM_D2)) return { hours: 5, note: 'ENEM 2026 — Dia 2' };
  return null;
};
const isSimuladoSunday = (d: Date) => {
  if (d.getDay() !== 0) return false;
  const phase = phaseOf(d).label;
  if (phase === 'Intensificação' || phase === 'Reta final') return true;
  // Base/Aprofundamento: simulado no último domingo do mês
  const nextSunday = addDays(d, 7);
  return nextSunday.getMonth() !== d.getMonth();
};

// Pesos "medicina" e tópicos por matéria (fallback genérico)
const PRIORITY: Record<string, number> = {
  biologia: 5, quimica: 5, redacao: 5, matematica: 5, fisica: 4,
  portugues: 4, 'língua': 4, historia: 3, geografia: 3, filosofia: 2, sociologia: 2, literatura: 2,
};
const priorityFor = (name: string) => {
  const s = name.toLowerCase();
  const hit = Object.keys(PRIORITY).find((k) => s.includes(k));
  return hit ? PRIORITY[hit] : 3;
};
const TOPICS: Record<string, string[]> = {
  matematica: ['Razão, proporção e porcentagem', 'Funções e gráficos', 'Geometria plana e espacial', 'Estatística e probabilidade', 'Logaritmos e exponenciais'],
  biologia: ['Citologia e metabolismo', 'Genética e evolução', 'Ecologia e ciclos', 'Fisiologia humana', 'Imunologia e vacinas'],
  quimica: ['Estequiometria', 'Química orgânica', 'Eletroquímica', 'Soluções e concentrações', 'Termoquímica'],
  fisica: ['Cinemática e leis de Newton', 'Eletrodinâmica', 'Ondas e óptica', 'Termodinâmica', 'Eletromagnetismo'],
  redacao: ['Projeto de texto e tese', 'Repertório sociocultural', 'Proposta de intervenção', 'Coesão e paragrafação', 'Análise de temas recorrentes'],
  portugues: ['Interpretação e inferência', 'Variação linguística', 'Funções da linguagem', 'Gêneros textuais', 'Pontuação e regência'],
  historia: ['Brasil Colônia e escravidão', 'Era Vargas e ditadura', 'Guerra Fria e século XX', 'Patrimônio e cultura'],
  geografia: ['Climatologia e biomas', 'Urbanização brasileira', 'Geopolítica e globalização', 'Cartografia'],
  filosofia: ['Ética e cidadania', 'Filosofia antiga', 'Contratualistas'],
  sociologia: ['Trabalho e sociedade', 'Movimentos sociais', 'Cultura e indústria cultural'],
  literatura: ['Modernismo brasileiro', 'Escolas literárias', 'Poética e figura de linguagem'],
};
const topicsFor = (name: string) => {
  const s = name.toLowerCase();
  const hit = Object.keys(TOPICS).find((k) => s.includes(k));
  return TOPICS[hit ?? ''] ?? ['Fundamentos', 'Aplicações', 'Exercícios de prova', 'Revisão ativa'];
};

// Aptidão inicial da persona por área (desvio de acerto)
const aptitude = (name: string) => {
  const s = name.toLowerCase();
  if (s.includes('bio')) return 0.05;
  if (s.includes('red')) return 0.08;
  if (s.includes('mat')) return -0.02;
  if (s.includes('fís') || s.includes('fis')) return -0.05;
  if (s.includes('quím') || s.includes('qui')) return -0.03;
  return 0;
};

// Curva de notas dos simulados (por área, 0–1000): início → atual
const SIM_START: Record<string, number> = { Linguagens: 560, Humanas: 545, Natureza: 520, Matemática: 540, Redação: 620 };
const SIM_NOW: Record<string, number> = { Linguagens: 715, Humanas: 700, Natureza: 685, Matemática: 705, Redação: 880 };

interface SimBlock {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  type: 'AULA' | 'EXERCICIOS' | 'REVISAO' | 'SIMULADO_COMPLETO';
  description: string;
  subjectIndex: number;
  status: 'completed' | 'skipped' | 'scheduled';
  completedAt: Date | null;
}

const main = async () => {
  console.log(' Simulação de 1 ano — persona', PERSONA.name, `(${PERSONA.goal})`);

  // ---------------------------------------------------------- usuário persona
  const passwordHash = await bcrypt.hash(PERSONA.password, 12);
  const user = await prisma.user.upsert({
    where: { email: PERSONA.email },
    update: { name: PERSONA.name, emailVerified: new Date() },
    create: {
      email: PERSONA.email,
      name: PERSONA.name,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  // Idempotência: limpa dados anteriores da persona
  await prisma.studySession.deleteMany({ where: { userId: user.id } });
  await prisma.studyBlock.deleteMany({ where: { userId: user.id } });
  await prisma.topicProgress.deleteMany({ where: { userId: user.id } });
  await prisma.weeklyStats.deleteMany({ where: { userId: user.id } });
  await prisma.userAchievement.deleteMany({ where: { userId: user.id } });
  await prisma.subject.deleteMany({ where: { userId: user.id } });
  await prisma.userProgressSnapshot.deleteMany({ where: { userId: user.id } });

  // ------------------------------------------------- matérias do preset ENEM
  const preset = await prisma.studyPreset.findFirst({
    where: { name: { contains: 'ENEM', mode: 'insensitive' } },
    include: { subjects: true },
  });
  if (!preset) throw new Error('Preset ENEM não encontrado — rode npm run db:seed antes.');

  const subjectRows: {
    id: string; name: string; color: string; icon: string; priority: number;
    difficulty: number; topics: string[]; apt: number;
    completedHours: number; sessionsCount: number; scoreSum: number; targetHours: number;
  }[] = [];
  for (const [i, ps] of preset.subjects.entries()) {
    const row = await prisma.subject.create({
      data: {
        userId: user.id,
        name: ps.name,
        color: ps.color ?? '#8b5cf6',
        icon: ps.icon ?? '📚',
        priority: priorityFor(ps.name),
        difficulty: ps.difficulty ?? 3,
        targetHours: 120,
        isActive: true,
      },
    });
    subjectRows.push({
      id: row.id, name: ps.name, color: row.color, icon: row.icon, priority: row.priority,
      difficulty: row.difficulty, topics: topicsFor(ps.name), apt: aptitude(ps.name),
      completedHours: 0, sessionsCount: 0, scoreSum: 0, targetHours: 120,
    });
    void i;
  }
  const redacaoIndex = subjectRows.findIndex((s) => s.name.toLowerCase().includes('red'));
  console.log(`📚 ${subjectRows.length} matérias criadas (pesos medicina aplicados)`);

  // ------------------------------------------------------- geração de blocos
  const blocks: SimBlock[] = [];
  const mastery: number[] = subjectRows.map(() => 0.35);
  const lastClassBySubject: (Date | null)[] = subjectRows.map(() => null);
  let simuladoCount = 0;
  let blockSeq = 0;
  const idFor = () => `sim-block-${(++blockSeq).toString().padStart(5, '0')}`;

  for (let d = new Date(START); d <= PLAN_END; d = addDays(d, 1)) {
    const dow = d.getDay();
    const special = specialDay(d);
    const phase = phaseOf(d);
    const isPast = d <= TODAY;

    if (key(d) === key(ENEM_D1) || key(d) === key(ENEM_D2)) {
      const isD1 = key(d) === key(ENEM_D1);
      blocks.push({
        id: idFor(), date: new Date(d), startTime: '13:30',
        endTime: isD1 ? '19:00' : '18:30', durationMinutes: isD1 ? 330 : 300,
        type: 'SIMULADO_COMPLETO',
        description: isD1 ? 'ENEM 2026 — Dia 1 (Linguagens, Humanas e Redação)' : 'ENEM 2026 — Dia 2 (Natureza e Matemática)',
        subjectIndex: -1, status: 'scheduled', completedAt: null,
      });
      continue;
    }

    let hours = special ? special.hours : phase.hours[dow];
    if (!special && dow === 0 && isSimuladoSunday(d) && hours > 0) {
      simuladoCount += 1;
      const dur = 300;
      blocks.push({
        id: idFor(), date: new Date(d), startTime: '13:00', endTime: '18:00', durationMinutes: dur,
        type: 'SIMULADO_COMPLETO', description: `Simulado completo #${simuladoCount} (estilo ENEM)`,
        subjectIndex: -1,
        status: isPast ? 'completed' : 'scheduled',
        completedAt: isPast ? atDay(d, '18:00') : null,
      });
      hours -= 5;
      if (hours <= 0) continue;
    }
    if (hours <= 0) continue;

    // Revisão espaçada: 1 bloco de revisão da matéria estudada há ~7 dias
    let reviewIndex = -1;
    for (let s = 0; s < subjectRows.length; s += 1) {
      const last = lastClassBySubject[s];
      if (last && daysBetween(last, d) === 7) { reviewIndex = s; break; }
    }

    const slots: { dur: number; type: SimBlock['type']; subjectIndex: number; description: string }[] = [];
    let remaining = hours;
    let first = true;
    while (remaining >= 0.75) {
      const dur = remaining >= 1.5 ? pick([90, 75, 60]) : remaining >= 1 ? 60 : 45;
      const durH = Math.min(dur / 60, remaining);
      let type: SimBlock['type'] = pick(['AULA', 'AULA', 'EXERCICIOS', 'EXERCICIOS']);
      let subjectIndex = -1;
      if (first && reviewIndex >= 0) {
        type = 'REVISAO';
        subjectIndex = reviewIndex;
      } else if (dow === 2 && redacaoIndex >= 0 && !slots.some((sl) => sl.subjectIndex === redacaoIndex)) {
        type = 'EXERCICIOS';
        subjectIndex = redacaoIndex;
      } else {
        // sorteio ponderado: prioridade × (1.35 − domínio) → reforça pontos fracos
        const weights = subjectRows.map((s, si) => s.priority * (1.35 - mastery[si]) + 0.15);
        const totalW = weights.reduce((a, b) => a + b, 0);
        let r = rng() * totalW;
        subjectIndex = weights.findIndex((w) => (r -= w) <= 0);
        if (subjectIndex < 0) subjectIndex = 0;
      }
      const subj = subjectIndex >= 0 ? subjectRows[subjectIndex].name : 'Geral';
      const topic = subjectIndex >= 0
        ? pick(topicsFor(subjectRows[subjectIndex].name))
        : 'Geral';
      const description =
        type === 'REVISAO' ? `Revisão espaçada — ${subj}` :
        type === 'AULA' ? `${subj}: ${topic} (teoria + exemplos)` :
        `${subj}: lista de exercícios — ${topic}`;
      slots.push({ dur: Math.round(durH * 60), type, subjectIndex, description });
      remaining -= durH;
      first = false;
    }

    let clock = dow === 0 ? 14 * 60 : 8 * 60; // domingos à tarde
    for (const slot of slots) {
      const startHM = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
      const endHM = addMinutesHM(startHM, slot.dur);
      const skipped = isPast && rng() < 0.08;
      blocks.push({
        id: idFor(), date: new Date(d), startTime: startHM, endTime: endHM,
        durationMinutes: slot.dur, type: slot.type, description: slot.description,
        subjectIndex: slot.subjectIndex,
        status: !isPast ? 'scheduled' : skipped ? 'skipped' : 'completed',
        completedAt: isPast && !skipped ? atDay(d, endHM) : null,
      });
      if (slot.type === 'AULA' && slot.subjectIndex >= 0) lastClassBySubject[slot.subjectIndex] = new Date(d);
      clock += slot.dur + (clock + slot.dur >= 12 * 60 && clock < 13.5 * 60 ? 90 : 15);
      if (clock >= 22 * 60) break;
    }
  }
  console.log(`🗓️  ${blocks.length} blocos gerados (${simuladoCount} simulados completos + ENEM)`);

  // ------------------------------------------- sessões, analytics e progresso
  const totalDays = Math.max(1, daysBetween(START, TODAY));
  const analyticsDaily: Record<string, { hours: number; sessions: number; blocks: number; correctAnswers: number; totalQuestions: number }> = {};
  const weekly = new Map<string, { hours: number; sessions: number; focus: number; prod: number; correct: number; days: Record<string, number> }>();
  const simulados: { date: string; label: string; areas: Record<string, number>; media: number }[] = [];
  const sessionCreates: any[] = [];
  let questionsTotal = 0;
  let correctTotal = 0;
  let hoursTotal = 0;
  let sessionsTotal = 0;

  const weekStartOf = (d: Date) => addDays(d, -d.getDay());

  for (const block of blocks) {
    if (block.status !== 'completed') continue;
    const ratio = clamp(daysBetween(START, block.date) / totalDays, 0, 1);
    const isSim = block.type === 'SIMULADO_COMPLETO';
    const si = block.subjectIndex;
    const subj = si >= 0 ? subjectRows[si] : null;

    const actualMinutes = Math.round(block.durationMinutes * between(0.9, 1.1));
    const hours = actualMinutes / 60;
    hoursTotal += hours;
    sessionsTotal += 1;

    let acc: number;
    let totalQuestions: number;
    let correctAnswers: number;
    if (isSim) {
      const areas: Record<string, number> = {};
      let sum = 0;
      for (const area of Object.keys(SIM_START)) {
        const score = clamp(SIM_START[area] + (SIM_NOW[area] - SIM_START[area]) * ratio + between(-14, 14), 400, 980);
        areas[area] = Math.round(score);
        sum += score;
      }
      const media = Math.round(sum / 5);
      simulados.push({ date: key(block.date), label: block.description, areas, media });
      acc = media / 1000;
      totalQuestions = 180;
      correctAnswers = Math.round(180 * clamp((media - 250) / 750, 0.2, 0.95));
    } else {
      acc = clamp(0.4 + 0.34 * ratio + (subj?.apt ?? 0) + between(-0.06, 0.06), 0.25, 0.95);
      totalQuestions = Math.max(8, Math.round(actualMinutes / 2.4));
      correctAnswers = Math.round(totalQuestions * acc);
      if (subj) {
        mastery[si] = clamp(mastery[si] * 0.92 + acc * 0.08, 0, 0.95);
      }
    }
    questionsTotal += totalQuestions;
    correctTotal += correctAnswers;

    const focus = Math.round(clamp(55 + 32 * ratio + between(-8, 8), 30, 99));
    const prod = Math.round(clamp(50 + 36 * ratio + between(-9, 9), 30, 99));

    if (subj) {
      subj.completedHours += hours;
      subj.sessionsCount += 1;
      subj.scoreSum += acc * 100;
    }

    sessionCreates.push({
      userId: user.id,
      subjectId: subj?.id ?? subjectRows[0].id,
      blockId: block.id,
      startedAt: atDay(block.date, block.startTime),
      endedAt: atDay(block.date, block.endTime),
      plannedMinutes: block.durationMinutes,
      actualMinutes,
      focusScore: focus,
      productivityScore: prod,
      accuracyRate: acc,
      errorRate: 1 - acc,
      sessionType: isSim ? 'SIMULADO' : block.type === 'REVISAO' ? 'REVISAO' : block.type === 'EXERCICIOS' ? 'EXERCICIOS' : 'AULA',
      correctAnswers,
      totalQuestions,
      topicName: block.description,
    });

    const dk = key(block.date);
    const day = analyticsDaily[dk] ?? (analyticsDaily[dk] = { hours: 0, sessions: 0, blocks: 0, correctAnswers: 0, totalQuestions: 0 });
    day.hours = Math.round((day.hours + hours) * 100) / 100;
    day.sessions += 1;
    day.blocks += 1;
    day.correctAnswers += correctAnswers;
    day.totalQuestions += totalQuestions;

    const wk = key(weekStartOf(block.date));
    const w = weekly.get(wk) ?? { hours: 0, sessions: 0, focus: 0, prod: 0, correct: 0, days: {} };
    w.hours += hours; w.sessions += 1; w.focus += focus; w.prod += prod; w.correct += correctAnswers;
    w.days[dk] = (w.days[dk] ?? 0) + hours;
    weekly.set(wk, w);
  }

  // Grava blocos + sessões no banco
  for (const block of blocks) {
    await prisma.studyBlock.create({
      data: {
        id: block.id,
        userId: user.id,
        subjectId: block.subjectIndex >= 0 ? subjectRows[block.subjectIndex].id : subjectRows[0].id,
        date: block.date,
        startTime: block.startTime,
        endTime: block.endTime,
        durationMinutes: block.durationMinutes,
        type: block.type,
        description: block.description,
        status: block.status,
        isAutoGenerated: true,
        completedAt: block.completedAt,
      },
    });
  }
  for (const s of sessionCreates) {
    await prisma.studySession.create({ data: s });
  }
  console.log(`✅ ${sessionsTotal} sessões concluídas · ${Math.round(hoursTotal)}h · ${questionsTotal} questões (${Math.round((correctTotal / Math.max(1, questionsTotal)) * 100)}% acerto)`);

  // Atualiza agregados das matérias + TopicProgress
  for (let si = 0; si < subjectRows.length; si += 1) {
    const subj = subjectRows[si];
    await prisma.subject.update({
      where: { id: subj.id },
      data: {
        completedHours: Math.round(subj.completedHours * 10) / 10,
        totalHours: Math.round(subj.completedHours * 10) / 10,
        sessionsCount: subj.sessionsCount,
        averageScore: subj.sessionsCount ? Math.round(subj.scoreSum / subj.sessionsCount) : 0,
      },
    });
    for (const topic of subj.topics) {
      await prisma.topicProgress.create({
        data: {
          userId: user.id,
          subjectId: subj.id,
          topicName: topic,
          mastery: Math.round(clamp(mastery[si] * between(0.8, 1.1), 0.05, 0.95) * 100) / 100,
          accuracyRate: Math.round(clamp(mastery[si] + between(-0.05, 0.08), 0.1, 0.97) * 100) / 100,
          sessionsCount: Math.max(1, Math.round(subj.sessionsCount / subj.topics.length)),
          lastStudiedAt: addDays(TODAY, -Math.floor(between(1, 12))),
          nextReviewDate: addDays(TODAY, Math.floor(between(1, 10))),
        },
      });
    }
  }

  // WeeklyStats
  for (const [wk, w] of Array.from(weekly.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    await prisma.weeklyStats.create({
      data: {
        userId: user.id,
        weekStart: new Date(`${wk}T00:00:00`),
        totalHours: Math.round(w.hours * 100) / 100,
        sessionsCount: w.sessions,
        avgFocusScore: Math.round(w.focus / w.sessions),
        avgProductivity: Math.round(w.prod / w.sessions),
        goalsCompleted: Math.round(w.sessions * 0.8),
        xpEarned: Math.round(w.hours * 45 + w.correct * 2),
        dailyBreakdown: JSON.stringify(
          Object.entries(w.days).map(([date, h]) => ({ date, hours: Math.round(h * 100) / 100, sessions: 1 }))
        ),
      },
    });
  }

  // Conquistas (desbloqueia 7 das 10 ao longo do ano)
  const achievements = await prisma.achievement.findMany({ orderBy: { xpReward: 'asc' } });
  const unlockAt = [3, 12, 34, 78, 140, 210, 300];
  for (let i = 0; i < Math.min(achievements.length, 7); i += 1) {
    await prisma.userAchievement.create({
      data: { userId: user.id, achievementId: achievements[i].id, unlockedAt: addDays(START, unlockAt[i]) },
    });
  }

  // XP/nível/streak coerentes com o histórico (gamificação do perfil)
  const xpEarned = Array.from(weekly.values()).reduce((a, w) => a + Math.round(w.hours * 45 + w.correct * 2), 0);
  let streak = 0;
  for (let d = analyticsDaily[key(TODAY)] ? new Date(TODAY) : addDays(TODAY, -1); analyticsDaily[key(d)]; d = addDays(d, -1)) streak += 1;
  let longest = 0;
  let run = 0;
  for (let d = new Date(START); d <= TODAY; d = addDays(d, 1)) {
    run = analyticsDaily[key(d)] ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      xp: xpEarned,
      level: clamp(Math.floor(xpEarned / 1500) + 1, 1, 60),
      streak,
      longestStreak: longest,
      lastStudyDate: TODAY,
    },
  });

  // ------------------------------------------------- snapshot p/ sync do app
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const nowIso = new Date().toISOString();
  const serializeSubject = (s: (typeof subjectRows)[number]) => ({
    id: s.id, userId: user.id, name: s.name, color: s.color, icon: s.icon,
    priority: s.priority, difficulty: s.difficulty, targetHours: s.targetHours,
    completedHours: Math.round(s.completedHours * 10) / 10,
    totalHours: Math.round(s.completedHours * 10) / 10,
    sessionsCount: s.sessionsCount,
    averageScore: s.sessionsCount ? Math.round(s.scoreSum / s.sessionsCount) : 0,
    isActive: true, createdAt: nowIso, updatedAt: nowIso,
  });
  const serializeBlock = (b: SimBlock) => ({
    id: b.id, userId: user.id,
    subjectId: b.subjectIndex >= 0 ? subjectRows[b.subjectIndex].id : subjectRows[0].id,
    date: b.date.toISOString(), startTime: b.startTime, endTime: b.endTime,
    durationMinutes: b.durationMinutes, type: b.type, description: b.description,
    sequenceIndex: null, relatedSubjectId: null, status: b.status, isBreak: false,
    isAutoGenerated: true, originalDate: null, completedAt: iso(b.completedAt),
    rescheduleCount: 0, createdAt: nowIso, updatedAt: nowIso,
    subject: serializeSubject(b.subjectIndex >= 0 ? subjectRows[b.subjectIndex] : subjectRows[0]),
  });

  const snapshotBlocks = blocks.filter((b) => b.date >= SNAPSHOT_BLOCKS_FROM);
  const phase = phaseOf(TODAY);
  const payload = {
    nexora_subjects: subjectRows.map(serializeSubject),
    nexora_planner_blocks: snapshotBlocks.map(serializeBlock),
    nexora_analytics: { daily: analyticsDaily },
    nexora_user_settings: {
      name: PERSONA.name, email: PERSONA.email, avatar: '', theme: 'dark',
      dailyGoalHours: 5,
      dailyHoursByWeekday: { dom: phase.hours[0], seg: phase.hours[1], ter: phase.hours[2], qua: phase.hours[3], qui: phase.hours[4], sex: phase.hours[5], sab: phase.hours[6] },
      preferredStart: '08:00', preferredEnd: '22:00', maxBlockMinutes: 120, breakMinutes: 15,
      excludeDays: [], aiDifficulty: 'adaptive', focusMode: true, autoSchedule: true, smartBreaks: true,
      dailyReminder: true, streakReminder: true, achievementAlerts: true, weeklyReport: true,
      notificationsEnabled: false, notificationMinutesBefore: 15, notificationSoundEnabled: true,
      backlogReminderEnabled: false,
    },
    nexora_study_prefs: {
      hoursPerDay: 5, weeklyHours: phase.hours.reduce((a, b) => a + b, 0),
      dailyHoursByWeekday: { dom: phase.hours[0], seg: phase.hours[1], ter: phase.hours[2], qua: phase.hours[3], qui: phase.hours[4], sex: phase.hours[5], sab: phase.hours[6] },
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6].filter((i) => phase.hours[i] > 0),
      mode: 'exam', examDate: key(ENEM_D1), startDate: key(START),
      blockDurationMinutes: 60, focusBlockMinutes: 50, breakDurationMinutes: 10,
      hardSubjectsPeriodPreference: 'any', studyStyle: 'balanced', studyContentPreference: 'misto',
      intensity: 'alta', dailyAvailabilityByWeekday: {}, userLevel: 'avancado',
    },
    nexora_schedule_range: { startDate: key(TODAY), endDate: key(PLAN_END) },
    nexora_onboarding: { hasCompletedWelcome: true, hasCompletedTutorial: true, hasAddedFirstSubject: true, tutorialStep: 0 },
    nexora_first_cycle_all_subjects: false,
    nexora_daily_limits: {},
    nexora_session_timers: {},
    nexora_backlog_last_auto_run_day: key(TODAY),
  };
  await prisma.userProgressSnapshot.create({ data: { userId: user.id, payload: payload as any } });
  console.log(`💾 Snapshot de sync gravado (${snapshotBlocks.length} blocos na janela offline + analytics do ano)`);

  // ------------------------------------------------------------- relatório md
  const months = new Map<string, { hours: number; sessions: number; questions: number; correct: number }>();
  for (const [dk, day] of Object.entries(analyticsDaily)) {
    const mk = dk.slice(0, 7);
    const m = months.get(mk) ?? { hours: 0, sessions: 0, questions: 0, correct: 0 };
    m.hours += day.hours; m.sessions += day.sessions; m.questions += day.totalQuestions; m.correct += day.correctAnswers;
    months.set(mk, m);
  }
  const monthName = (mk: string) => {
    const [y, mo] = mk.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };
  const lastSim = simulados[simulados.length - 1];
  const mediaGeral = (s: (typeof simulados)[number]) => s.media;
  const completedBlocks = blocks.filter((b) => b.status === 'completed').length;
  const skippedBlocks = blocks.filter((b) => b.status === 'skipped').length;
  const scheduledBlocks = blocks.filter((b) => b.status === 'scheduled').length;

  const md = `# Simulação de 1 ano de uso — Nexora

**Persona:** ${PERSONA.name}, 19 anos, Brasília/DF · **Objetivo:** ${PERSONA.goal}
**Janela simulada:** ${START.toLocaleDateString('pt-BR')} (primeiro acesso) → ${TODAY.toLocaleDateString('pt-BR')} (hoje, histórico) + cronograma planejado até ${PLAN_END.toLocaleDateString('pt-BR')}
**ENEM 2026:** provas em 08/11/2026 (Linguagens, Humanas, Redação) e 15/11/2026 (Natureza, Matemática)
**Login no app:** \`${PERSONA.email}\` / \`${PERSONA.password}\` (ou modo demo do preview, que hidrata o snapshot da Maya)

## 1. Metodologia

- Disponibilidade por fase (horas líquidas/dia): ${PHASES.map((p) => `**${p.label}** ${p.hours.join('/')}`).join(' · ')}.
- Eventos de vida: recesso (24/dez–01/jan), retomada leve, carnaval (14–17/fev), gripe (11–13/mai) — dias sem ou com menos estudo.
- Blocos: teoria/exercícios de 45–90 min em janelas 08h–22h; redação semanal às terças; revisão espaçada (+7 dias) diária; simulado completo mensal (base/aprofundamento) e semanal (intensificação/reta final).
- Desempenho: acerto evolui de ~40% para ~78% ao longo do ano, com aptidão por área (Bio/Redação fortes, Fís/Quím fracas no início) e ruído ±6 p.p.
- Adesão: ${completedBlocks} blocos concluídos, ${skippedBlocks} pulados (~${Math.round((skippedBlocks / Math.max(1, completedBlocks + skippedBlocks)) * 100)}%), ${scheduledBlocks} futuros planejados.

## 2. Volume total do ano

| Métrica | Valor |
| --- | --- |
| Horas de estudo concluídas | ${Math.round(hoursTotal)}h |
| Sessões concluídas | ${sessionsTotal} |
| Blocos gerados (ano + plano) | ${blocks.length} |
| Questões respondidas | ${questionsTotal} |
| Taxa de acerto média | ${Math.round((correctTotal / Math.max(1, questionsTotal)) * 100)}% |
| Simulados completos | ${simulados.length} |
| Semanas com registro | ${weekly.size} |

## 3. Evolução mês a mês

| Mês | Horas | Sessões | Questões | Acerto |
| --- | --- | --- | --- | --- |
${Array.from(months.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([mk, m]) => `| ${monthName(mk)} | ${Math.round(m.hours)}h | ${m.sessions} | ${m.questions} | ${Math.round((m.correct / Math.max(1, m.questions)) * 100)}% |`).join('\n')}

## 4. Série de simulados (notas por área, 0–1000)

| Data | Linguagens | Humanas | Natureza | Matemática | Redação | Média |
| --- | --- | --- | --- | --- | --- | --- |
${simulados.map((s) => `| ${new Date(`${s.date}T12:00:00`).toLocaleDateString('pt-BR')} | ${s.areas.Linguagens} | ${s.areas.Humanas} | ${s.areas.Natureza} | ${s.areas['Matemática']} | ${s.areas.Redação} | **${mediaGeral(s)}** |`).join('\n')}

## 5. Diagnóstico vs. Medicina UNB

- Nota de corte Medicina UNB no SiSU 2025: de ~669 (cotas) a ~815 (ampla concorrência); referências de ampla concorrência em torno de 798–815 pontos.
- Último simulado (${new Date(`${lastSim.date}T12:00:00`).toLocaleDateString('pt-BR')}): média **${lastSim.media}** — acima do piso de cotas, ainda **~${Math.max(0, 800 - lastSim.media)} pts abaixo** da faixa de ampla concorrência.
- Tendência: +${Math.round((mediaGeral(lastSim) - mediaGeral(simulados[Math.max(0, simulados.length - 2)])) / 1)} pts no último mês; mantendo ~+8 pts/mês na reta final, a projeção para 08/11 fica em **~${lastSim.media + 16}–${lastSim.media + 30}** — disputa real, decidida na reta final (redação 880+ é o trunfo da persona).

## 6. O que a simulação gravou no banco

- 1 usuária persona + ${subjectRows.length} matérias (preset ENEM com pesos medicina) + ${blocks.length} blocos + ${sessionsTotal} sessões;
- ${weekly.size} WeeklyStats, ${subjectRows.reduce((a, s) => a + s.topics.length, 0)} TopicProgress, 7 conquistas desbloqueadas;
- UserProgressSnapshot com o payload de sincronização do app (matérias, blocos de ${SNAPSHOT_BLOCKS_FROM.toLocaleDateString('pt-BR')} em diante, analytics do ano completo, configurações e preferências) — é ele que alimenta o dashboard/progresso no preview.
`;
  fs.writeFileSync(path.join(process.cwd(), 'SIMULACAO-1-ANO.md'), md);
  console.log('📄 SIMULACAO-1-ANO.md gerado');
  console.log(`🏁 Última média de simulado: ${lastSim.media} · projeção reta final: ~${lastSim.media + 16}–${lastSim.media + 30}`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
