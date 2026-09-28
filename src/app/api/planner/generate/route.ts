import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { hasSessionCookie } from '@/lib/demoMode';
import { generateChronologicalSchedule } from '@/services/roadmapEngine';
import {
  parseLocalDateKey,
  resolveScheduleConstraints,
} from '@/services/scheduleConstraints';
import { authOptions } from '@/lib/auth';
import { getWeekStart, toLocalDateKey } from '@/lib/utils';
import type { StudyBlock, StudyPreferences, Subject, UserSettings } from '@/types';

type ScheduleRangePayload = { startDate: string; endDate: string };

type GeneratePlannerRequest = {
  subjects?: Subject[];
  studyPrefs?: StudyPreferences;
  userSettings?: UserSettings;
  scheduleRange?: ScheduleRangePayload | null;
  dailyLimits?: Record<string, number>;
  firstCycleAllSubjects?: boolean;
};

function serializeBlock(block: StudyBlock) {
  return {
    ...block,
    date: block.date.toISOString(),
    originalDate: block.originalDate ? block.originalDate.toISOString() : undefined,
    completedAt: block.completedAt ? block.completedAt.toISOString() : undefined,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
    subject: block.subject
      ? {
          ...block.subject,
          createdAt: block.subject.createdAt.toISOString(),
          updatedAt: block.subject.updatedAt.toISOString(),
        }
      : block.subject,
  };
}

export async function POST(request: Request) {
  try {
    // Demo só quando não há cookie de sessão: login real persiste no banco.
    const isLocalDemoMode =
      process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true' &&
      !hasSessionCookie(request.headers);
    const realSession = await getServerSession(authOptions).catch(() => null);
    const session = isLocalDemoMode ? null : realSession;

    if (!isLocalDemoMode && !session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as GeneratePlannerRequest;
    const subjects = Array.isArray(body.subjects) ? body.subjects : [];
    const studyPrefs = body.studyPrefs;
    const userSettings = body.userSettings;

    if (!studyPrefs || !userSettings) {
      return NextResponse.json(
        { success: false, error: 'studyPrefs e userSettings sao obrigatorios.' },
        { status: 400 }
      );
    }

    if (subjects.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma disciplina fornecida para gerar cronograma.' },
        { status: 400 }
      );
    }

    const requestedStart = parseLocalDateKey(body.scheduleRange?.startDate);
    const requestedEnd = parseLocalDateKey(body.scheduleRange?.endDate);
    const startDate = requestedStart ?? parseLocalDateKey(studyPrefs.startDate) ?? getWeekStart(new Date());
    const endDate = requestedEnd ?? (() => {
      const next = new Date(startDate);
      next.setDate(next.getDate() + 6);
      return next;
    })();

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    if (endDate < startDate) {
      endDate.setTime(startDate.getTime());
      endDate.setDate(endDate.getDate() + 6);
    }

    // Mesmas regras usadas pelo botão "Gerar com IA" do Planner
    // (fonte única em @/services/scheduleConstraints).
    const constraints = resolveScheduleConstraints({
      userSettings,
      studyPrefs,
      startDate,
      endDate,
      dailyLimitsOverride: body.dailyLimits,
    });

    const schedule = generateChronologicalSchedule({
      subjects,
      preferences: studyPrefs,
      startDate,
      endDate,
      preferredStart: constraints.preferredStart,
      preferredEnd: constraints.preferredEnd,
      maxBlockMinutes: constraints.maxBlockMinutes,
      breakMinutes: constraints.breakMinutes,
      restDays: constraints.restDays,
      dailyLimitByDate: constraints.dailyLimitByDate,
      dailyTimeWindowByDate: constraints.dailyTimeWindowByDate,
      firstCycleAllSubjects: body.firstCycleAllSubjects ?? true,
      completedLessonsTotal: 0,
      completedLessonsBySubject: {},
      completedPracticeTotal: 0,
      completedPracticeBySubject: {},
      simuladoRules: constraints.simuladoRules,
      enableScheduleCache: true,
      debug: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        blocks: schedule.blocks.map(serializeBlock),
        scheduleRange: {
          startDate: toLocalDateKey(startDate),
          endDate: toLocalDateKey(endDate),
        },
        meta: {
          totalHours: schedule.totalHours,
          totalBlocks: schedule.blocks.filter((block) => !block.isBreak).length,
          cacheHit: schedule.cacheHit === true,
        },
      },
    });
  } catch (error) {
    console.error('Planner generate API error:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao regenerar cronograma.' },
      { status: 500 }
    );
  }
}
