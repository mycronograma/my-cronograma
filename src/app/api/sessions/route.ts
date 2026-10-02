import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { processSessionCompletion } from '@/services/gamification';
import { computeSessionScores, startOfWeek } from '@/services/sessionScoring';
import type { StudySession as StudySessionType, User as GamificationUser } from '@/types';

export const dynamic = 'force-dynamic';

const SESSION_TYPES = ['AULA', 'EXERCICIOS', 'REVISAO', 'SIMULADO', 'ANALISE', 'LIVRE'] as const;
type SessionTypeValue = (typeof SESSION_TYPES)[number];

const BLOCK_TYPE_TO_SESSION_TYPE: Record<string, SessionTypeValue> = {
  AULA: 'AULA',
  EXERCICIOS: 'EXERCICIOS',
  REVISAO: 'REVISAO',
  SIMULADO_AREA: 'SIMULADO',
  SIMULADO_COMPLETO: 'SIMULADO',
  ANALISE: 'ANALISE',
};

const MAX_SESSION_MINUTES = 24 * 60;

const toNumber = (value: unknown, fallback: number | null = null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
};

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const parseDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

interface SessionPayload {
  /** Quando presente, atualiza a autoavaliação de foco de uma sessão existente. */
  sessionId: string | null;
  subjectId: string;
  blockId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  plannedMinutes: number;
  actualMinutes: number;
  correctAnswers: number | null;
  totalQuestions: number | null;
  sessionType: SessionTypeValue | null;
  source: 'block' | 'quick';
  selfReportedFocus: number | null;
  topicName: string | null;
}

function parsePayload(body: unknown): { ok: true; value: SessionPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Payload inválido.' };
  const raw = body as Record<string, unknown>;

  const sessionId = typeof raw.sessionId === 'string' && raw.sessionId.trim() ? raw.sessionId.trim() : null;
  const subjectId = typeof raw.subjectId === 'string' ? raw.subjectId.trim() : '';
  if (!subjectId) return { ok: false, error: 'subjectId é obrigatório.' };

  const startedAt = parseDate(raw.startedAt);
  if (!startedAt) return { ok: false, error: 'startedAt é obrigatório.' };

  const now = Date.now();
  // Sessão no futuro ou antiga demais (> 30 dias) é sinal de payload corrompido.
  if (startedAt.getTime() > now + 60 * 60 * 1000) {
    return { ok: false, error: 'startedAt não pode estar no futuro.' };
  }

  const plannedMinutesRaw = toNumber(raw.plannedMinutes, null);
  if (plannedMinutesRaw === null || plannedMinutesRaw <= 0) {
    return { ok: false, error: 'plannedMinutes deve ser maior que zero.' };
  }

  const actualMinutesRaw = toNumber(raw.actualMinutes, plannedMinutesRaw) as number;
  const plannedMinutes = clampInt(plannedMinutesRaw, 1, MAX_SESSION_MINUTES);
  const actualMinutes = clampInt(Math.max(0, actualMinutesRaw), 0, MAX_SESSION_MINUTES);

  const correctAnswersRaw = toNumber(raw.correctAnswers, null);
  const totalQuestionsRaw = toNumber(raw.totalQuestions, null);
  const totalQuestions =
    totalQuestionsRaw === null ? null : clampInt(totalQuestionsRaw, 0, 100000);
  const correctAnswers =
    correctAnswersRaw === null || totalQuestions === null || totalQuestions === 0
      ? null
      : clampInt(correctAnswersRaw, 0, totalQuestions);

  const endedAt = parseDate(raw.endedAt);
  const sessionTypeRaw = typeof raw.sessionType === 'string' ? raw.sessionType : null;
  const sessionType =
    sessionTypeRaw && (SESSION_TYPES as readonly string[]).includes(sessionTypeRaw)
      ? (sessionTypeRaw as SessionTypeValue)
      : null;

  const topicName =
    typeof raw.topicName === 'string' && raw.topicName.trim()
      ? raw.topicName.trim().slice(0, 120)
      : null;

  return {
    ok: true,
    value: {
      sessionId,
      subjectId,
      blockId: typeof raw.blockId === 'string' && raw.blockId.trim() ? raw.blockId.trim() : null,
      startedAt,
      endedAt,
      plannedMinutes,
      actualMinutes,
      correctAnswers,
      totalQuestions,
      sessionType,
      source: raw.source === 'quick' ? 'quick' : 'block',
      selfReportedFocus: toNumber(raw.focusScore, null),
      topicName,
    },
  };
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parsePayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const payload = parsed.value;

    // Atualização de autoavaliação de foco (chips da sessão rápida). O XP já foi
    // creditado na conclusão com base na aderência ao tempo; aqui só refinamos
    // os scores registrados, sem recalcular recompensa.
    if (payload.sessionId) {
      const target = await prisma.studySession.findFirst({
        where: { id: payload.sessionId, userId },
        select: {
          id: true,
          plannedMinutes: true,
          actualMinutes: true,
          correctAnswers: true,
          totalQuestions: true,
        },
      });
      if (!target) {
        return NextResponse.json(
          { success: false, error: 'Sessão não encontrada.' },
          { status: 404 }
        );
      }

      const rescored = computeSessionScores({
        plannedMinutes: target.plannedMinutes,
        actualMinutes: target.actualMinutes,
        correctAnswers: target.correctAnswers,
        totalQuestions: target.totalQuestions,
        selfReportedFocus: payload.selfReportedFocus,
      });

      const updated = await prisma.studySession.update({
        where: { id: target.id },
        data: {
          focusScore: rescored.focusScore,
          productivityScore: rescored.productivityScore,
        },
      });

      return NextResponse.json({
        success: true,
        updated: true,
        session: {
          id: updated.id,
          focusScore: rescored.focusScore,
          productivityScore: rescored.productivityScore,
        },
      });
    }

    const subject = await prisma.subject.findFirst({
      where: { id: payload.subjectId, userId },
      select: {
        id: true,
        name: true,
        difficulty: true,
        totalHours: true,
        completedHours: true,
        sessionsCount: true,
        averageScore: true,
      },
    });
    if (!subject) {
      return NextResponse.json(
        { success: false, error: 'Matéria não encontrada.' },
        { status: 404 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        xp: true,
        level: true,
        streak: true,
        longestStreak: true,
        lastStudyDate: true,
      },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // O tipo da sessão vem do bloco quando o cliente não informou.
    //
    // Blocos gerados pelo planner vivem no cliente (localStorage) e são
    // sincronizados como snapshot JSON — nem sempre existem como linha em
    // StudyBlock. Como `blockId` é FK, só vinculamos quando o bloco realmente
    // está no banco; caso contrário a sessão é registrada sem vínculo e a
    // idempotência passa a ser (usuário, matéria, início).
    let sessionType = payload.sessionType;
    let block: { id: string; type: string | null; durationMinutes: number } | null = null;
    if (payload.blockId) {
      block = await prisma.studyBlock.findFirst({
        where: { id: payload.blockId, userId },
        select: { id: true, type: true, durationMinutes: true },
      });
      if (block && !sessionType && block.type) {
        sessionType = BLOCK_TYPE_TO_SESSION_TYPE[block.type] ?? null;
      }
    }

    const existing = block
      ? await prisma.studySession.findUnique({ where: { blockId: block.id } })
      : await prisma.studySession.findFirst({
          where: { userId, subjectId: payload.subjectId, startedAt: payload.startedAt },
        });

    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        session: {
          id: existing.id,
          startedAt: existing.startedAt,
          actualMinutes: existing.actualMinutes,
          xpEarned: existing.xpEarned,
        },
      });
    }

    const scores = computeSessionScores({
      plannedMinutes: payload.plannedMinutes,
      actualMinutes: payload.actualMinutes,
      correctAnswers: payload.correctAnswers,
      totalQuestions: payload.totalQuestions,
      selfReportedFocus: payload.selfReportedFocus,
    });

    const endedAt =
      payload.endedAt ?? new Date(payload.startedAt.getTime() + payload.actualMinutes * 60_000);

    const sessionData = {
      userId,
      subjectId: subject.id,
      blockId: block?.id ?? null,
      startedAt: payload.startedAt,
      endedAt,
      plannedMinutes: payload.plannedMinutes,
      actualMinutes: payload.actualMinutes,
      focusScore: scores.focusScore,
      productivityScore: scores.productivityScore,
      // Sem respostas registradas → null (não inventar acurácia).
      accuracyRate: scores.accuracyRate,
      errorRate: scores.errorRate,
      sessionType: sessionType ?? 'LIVRE',
      correctAnswers: payload.correctAnswers,
      totalQuestions: payload.totalQuestions,
      topicName: payload.topicName,
    };

    const createdSession = await prisma.studySession.create({ data: sessionData });

    const [subjectRows, totalSessions, unlockedRows] = await Promise.all([
      prisma.subject.findMany({ where: { userId }, select: { totalHours: true } }),
      prisma.studySession.count({ where: { userId } }),
      prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    ]);

    const totalHours = subjectRows.reduce((acc: number, row: { totalHours?: number }) => {
      const hours = typeof row?.totalHours === 'number' ? row.totalHours : 0;
      return acc + hours;
    }, 0);

    const gamificationUser = {
      ...user,
      lastStudyDate: user.lastStudyDate ? new Date(user.lastStudyDate) : null,
    } as unknown as GamificationUser;

    const result = processSessionCompletion(
      gamificationUser,
      createdSession as unknown as StudySessionType,
      typeof subject.difficulty === 'number' ? subject.difficulty : 5,
      totalHours,
      totalSessions,
      new Set<string>(unlockedRows.map((row: { achievementId?: string }) => String(row?.achievementId)))
    );

    const hoursStudied = payload.actualMinutes / 60;
    const weekStart = startOfWeek(payload.startedAt);

    // XP efetivamente creditado (guardado na sessão para auditoria).
    await prisma.studySession.update({
      where: { id: createdSession.id },
      data: { xpEarned: result.xpEarned },
    });

    const operations: any[] = [
      prisma.user.update({
        where: { id: userId },
        data: {
          xp: result.newXp,
          level: result.newLevel,
          streak: result.streakUpdate.streak,
          longestStreak: result.streakUpdate.longestStreak,
          lastStudyDate: payload.startedAt,
        },
      }),
      prisma.subject.update({
        where: { id: subject.id },
        data: {
          completedHours: Number(((subject.completedHours ?? 0) + hoursStudied).toFixed(4)),
          totalHours: Number(((subject.totalHours ?? 0) + hoursStudied).toFixed(4)),
          sessionsCount: (subject.sessionsCount ?? 0) + 1,
          // Média só muda com acurácia real; sem respostas, mantém o histórico.
          ...(scores.accuracyRate === null
            ? {}
            : {
                averageScore: Number(
                  (
                    ((subject.averageScore ?? 0) * (subject.sessionsCount ?? 0) +
                      scores.accuracyRate * 100) /
                    ((subject.sessionsCount ?? 0) + 1)
                  ).toFixed(2)
                ),
              }),
        },
      }),
      prisma.weeklyStats.upsert({
        where: { userId_weekStart: { userId, weekStart } },
        update: {
          totalHours: { increment: hoursStudied },
          sessionsCount: { increment: 1 },
          xpEarned: { increment: result.xpEarned },
        },
        create: {
          userId,
          weekStart,
          totalHours: hoursStudied,
          sessionsCount: 1,
          avgFocusScore: scores.focusScore,
          avgProductivity: scores.productivityScore,
          xpEarned: result.xpEarned,
        },
      }),
    ];

    if (block) {
      operations.push(
        prisma.studyBlock.update({
          where: { id: block.id },
          data: { status: 'completed', completedAt: endedAt },
        })
      );
    }

    await prisma.$transaction(operations);

    // Conquistas novas: grava o catálogo (id estável do gamification.ts) e o
    // desbloqueio do usuário.
    const unlocked: Array<{ id: string; name: string; icon: string; rarity: string; xpReward: number }> = [];
    for (const achievement of result.newAchievements) {
      const catalogRow = await prisma.achievement.upsert({
        where: { name: achievement.name },
        update: {},
        create: {
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          xpReward: achievement.xpReward,
          condition: JSON.stringify(achievement.condition),
          rarity: achievement.rarity,
        },
      });

      await prisma.userAchievement.upsert({
        where: { userId_achievementId: { userId, achievementId: catalogRow.id } },
        update: {},
        create: { userId, achievementId: catalogRow.id, unlockedAt: new Date() },
      });

      unlocked.push({
        id: achievement.id,
        name: achievement.name,
        icon: achievement.icon,
        rarity: achievement.rarity,
        xpReward: achievement.xpReward,
      });
    }

    return NextResponse.json({
      success: true,
      duplicate: false,
      session: {
        id: createdSession.id,
        startedAt: createdSession.startedAt,
        actualMinutes: payload.actualMinutes,
        focusScore: scores.focusScore,
        productivityScore: scores.productivityScore,
        accuracyRate: scores.accuracyRate,
      },
      gamification: {
        xpEarned: result.xpEarned,
        xp: result.newXp,
        level: result.newLevel,
        streak: result.streakUpdate.streak,
        longestStreak: result.streakUpdate.longestStreak,
        streakBroken: result.streakUpdate.streakBroken,
        achievements: unlocked,
      },
    });
  } catch (error) {
    console.error('Erro ao registrar sessão de estudo:', error);
    return NextResponse.json(
      { success: false, error: 'Não foi possível registrar a sessão agora.' },
      { status: 500 }
    );
  }
}
