import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { syncNotificationsForUser } from '@/lib/notification-center';

export const dynamic = 'force-dynamic';
// O cron diário percorre vários usuários; evita timeout padrão em servidores serverless.
export const maxDuration = 60;

/** Limite de usuários processados por execução (evita estourar tempo/memória). */
const MAX_USERS_PER_RUN = 500;

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

const isAuthorized = (request: Request) => {
  const secret = env.notificationsCronSecret;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = request.headers.get('x-cron-secret') || '';
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || '';

  return [bearer, headerSecret, querySecret].some(
    (candidate) => candidate.length > 0 && timingSafeEqual(candidate, secret)
  );
};

/**
 * Dispatch agendado de notificações (vercel.json -> crons).
 *
 * Roda a sincronização server-side para cada usuário com push ou lembretes
 * ativos: lembrete diário, sequência, resumo semanal, conquistas, blocos de
 * estudo do dia e backlog. A deduplicação por `dedupeKey` impede repetição.
 */
async function dispatch() {
  const [subscribedUsers, preferenceUsers] = await Promise.all([
    prisma.pushSubscription.findMany({
      select: { userId: true },
      distinct: ['userId'],
      take: MAX_USERS_PER_RUN,
    }),
    prisma.userPreferences.findMany({
      where: {
        OR: [
          { dailyReminder: true },
          { streakReminder: true },
          { weeklyReport: true },
          { achievementAlerts: true },
          { notificationsEnabled: true },
          { backlogReminderEnabled: true },
        ],
      },
      select: { userId: true },
      take: MAX_USERS_PER_RUN,
    }),
  ]);

  const userIds = Array.from(
    new Set([...subscribedUsers, ...preferenceUsers].map((entry) => entry.userId))
  ).slice(0, MAX_USERS_PER_RUN);

  let processed = 0;
  let createdCount = 0;
  const failures: string[] = [];

  for (const userId of userIds) {
    try {
      const result = await syncNotificationsForUser(userId);
      createdCount += result.createdCount;
      processed += 1;
    } catch (error) {
      console.error(`Falha ao despachar notificações para ${userId}:`, error);
      failures.push(userId);
    }
  }

  return {
    candidates: userIds.length,
    processed,
    createdCount,
    failed: failures.length,
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await dispatch();
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('Erro no dispatch de notificações:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao despachar notificações.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
