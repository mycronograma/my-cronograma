import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { isDemoRequest } from '@/lib/demoMode';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import type { StudyPreferences, UserSettings } from '@/types';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    // Preview em iframe sem cookies (modo demo local): não há sessão no
    // servidor, então não há preferências gravadas. Devolve o fallback com
    // 200 em vez de 401, para a tela não tratar como falha.
    if (!userId && (await isDemoRequest())) {
      return NextResponse.json({
        success: true,
        data: null,
        persisted: false,
        warning: 'Não foi possível ler as preferências salvas no servidor.',
      });
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
      });
      return NextResponse.json({ success: true, data: prefs, persisted: true });
    } catch (error) {
      console.warn('Preferences API: failed to load preferences from DB.', error);
    }

    // `persisted: false` avisa o cliente de que a resposta veio do fallback,
    // não do banco — antes o mesmo payload de sucesso escondia a diferença.
    return NextResponse.json({
      success: true,
      data: null,
      persisted: false,
      warning: 'Não foi possível ler as preferências salvas no servidor.',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Falha ao carregar preferencias.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const settings = body.settings as UserSettings;
    const studyPrefs = body.studyPrefs as StudyPreferences | undefined;
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    // Preview em iframe sem cookies: a sessão vive no localStorage e não existe
    // no servidor. Sem este desvio o POST respondia 401 e a tela de
    // Configurações mostrava "Falha ao salvar" em qualquer ação — inclusive
    // ao trocar o tema. Resposta 200 com `persisted: false` deixa claro que a
    // mudança ficou só neste dispositivo.
    if (!userId && (await isDemoRequest())) {
      return NextResponse.json({
        success: true,
        persisted: false,
        warning:
          'Alterações salvas apenas neste dispositivo: o modo de teste local não grava no servidor.',
      });
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!settings) {
      return NextResponse.json(
        { success: false, error: 'Configuracoes ausentes.' },
        { status: 400 }
      );
    }

    const persistedDailyHours = settings.dailyHoursByWeekday ?? studyPrefs?.dailyHoursByWeekday ?? null;
    const persistedExamDate = settings.examDate || studyPrefs?.examDate || null;
    const persistedMaxBlock =
      settings.maxBlockMinutes ??
      studyPrefs?.focusBlockMinutes ??
      studyPrefs?.blockDurationMinutes ??
      120;
    const persistedBreak = settings.breakMinutes ?? studyPrefs?.breakDurationMinutes ?? 15;

    const notificationMinutesBefore = Number.isFinite(settings.notificationMinutesBefore)
      ? Math.min(180, Math.max(1, Math.round(settings.notificationMinutesBefore)))
      : 15;
    const notificationsEnabled = settings.notificationsEnabled ?? false;
    const notificationSoundEnabled = settings.notificationSoundEnabled ?? true;
    const backlogReminderEnabled = settings.backlogReminderEnabled ?? false;
    const serializedRestDays = JSON.stringify({
      excludeDays: settings.excludeDays ?? [],
      allowSundayBacklog: settings.allowSundayBacklog ?? false,
    });

    const dailyHoursByWeekdayJson =
      persistedDailyHours == null
        ? Prisma.JsonNull
        : (persistedDailyHours as unknown as Prisma.InputJsonValue);

    let profilePersisted = true;
    let preferencesPersisted = true;

    try {
      if (settings.name) {
        await prisma.user.update({
          where: { id: userId },
          data: { name: settings.name },
        });
      }
    } catch (error) {
      profilePersisted = false;
      console.warn('Preferences API: failed to update user profile.', error);
    }

    try {
      await prisma.userPreferences.upsert({
        where: { userId },
        update: {
          dailyGoalHours: settings.dailyGoalHours,
          preferredStart: settings.preferredStart,
          preferredEnd: settings.preferredEnd,
          maxBlockMinutes: persistedMaxBlock,
          breakMinutes: persistedBreak,
          alarmSound: settings.alarmSound ?? 'pulse',
          dailyReminder: settings.dailyReminder ?? true,
          streakReminder: settings.streakReminder ?? true,
          achievementAlerts: settings.achievementAlerts ?? true,
          weeklyReport: settings.weeklyReport ?? true,
          notificationsEnabled,
          notificationMinutesBefore,
          notificationSoundEnabled,
          backlogReminderEnabled,
          dailyHoursByWeekday: dailyHoursByWeekdayJson,
          restDays: serializedRestDays,
          examDate: persistedExamDate,
        },
        create: {
          userId,
          dailyGoalHours: settings.dailyGoalHours,
          preferredStart: settings.preferredStart,
          preferredEnd: settings.preferredEnd,
          maxBlockMinutes: persistedMaxBlock,
          breakMinutes: persistedBreak,
          alarmSound: settings.alarmSound ?? 'pulse',
          dailyReminder: settings.dailyReminder ?? true,
          streakReminder: settings.streakReminder ?? true,
          achievementAlerts: settings.achievementAlerts ?? true,
          weeklyReport: settings.weeklyReport ?? true,
          notificationsEnabled,
          notificationMinutesBefore,
          notificationSoundEnabled,
          backlogReminderEnabled,
          dailyHoursByWeekday: dailyHoursByWeekdayJson,
          restDays: serializedRestDays,
          examDate: persistedExamDate,
        },
      });
    } catch (error) {
      preferencesPersisted = false;
      console.warn('Preferences API: database unavailable, using local fallback.', error);
    }

    if (!preferencesPersisted || !profilePersisted) {
      // Continua 200 para o fluxo offline não quebrar, mas deixa explícito que
      // os dados ficaram só no dispositivo.
      return NextResponse.json({
        success: true,
        persisted: false,
        warning:
          'Alterações salvas apenas neste dispositivo: o servidor não conseguiu gravar suas preferências.',
      });
    }

    return NextResponse.json({ success: true, persisted: true });
  } catch (error) {
    console.error('Erro ao salvar preferencias:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao salvar preferencias.' },
      { status: 500 }
    );
  }
}
