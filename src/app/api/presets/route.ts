/**
 * API Route: GET /api/presets
 * Returns all available study presets with their subjects
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isDemoRequest } from '@/lib/demoMode';
import { prisma } from '@/lib/prisma';
import { getEnemPresetSubjects } from '@/lib/enemCatalog';
import { getCanonicalSubjectName, getCuratedPresetByName, getCuratedPresets } from '@/lib/presetCatalog';

export const dynamic = 'force-dynamic';

function buildLocalPresets() {
  const now = new Date();

  return [
    {
      id: 'enem',
      name: 'ENEM',
      description: 'Preparação completa ENEM organizada por áreas oficiais e disciplinas reais',
      createdAt: now,
      updatedAt: now,
      subjects: getEnemPresetSubjects().map((subject, index) => ({
        id: `enem-${index + 1}`,
        presetId: 'enem',
        name: subject.name,
        priority: subject.priority,
        difficulty: subject.difficulty,
        recommendedWeeklyHours: subject.recommendedWeeklyHours,
        group: subject.group,
        createdAt: now,
        updatedAt: now,
      })),
    },
    ...getCuratedPresets().map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      createdAt: now,
      updatedAt: now,
      subjects: preset.subjects.map((subject, index) => ({
        id: `${preset.id}-${index + 1}`,
        presetId: preset.id,
        name: subject.name,
        priority: subject.priority,
        difficulty: subject.difficulty,
        recommendedWeeklyHours: subject.recommendedWeeklyHours,
        group: subject.group,
        createdAt: now,
        updatedAt: now,
      })),
      specificModules: (preset.specificModules || []).map((module) => ({
        ...module,
        subjects: module.subjects.map((subject, index) => ({
          id: `${module.id}-${index + 1}`,
          name: subject.name,
          priority: subject.priority,
          difficulty: subject.difficulty,
          recommendedWeeklyHours: subject.recommendedWeeklyHours,
          group: subject.group,
        })),
      })),
    })),
  ];
}

export async function GET() {
  try {
    const isLocalDemoMode = await isDemoRequest();
    const session = isLocalDemoMode ? null : await getServerSession(authOptions).catch(() => null);

    if (isLocalDemoMode || !process.env.DATABASE_URL) {
      return NextResponse.json({
        success: true,
        data: buildLocalPresets(),
        source: 'local',
        note: isLocalDemoMode ? 'Local demo mode' : 'DATABASE_URL not set',
      });
    }

    const presets = await prisma.studyPreset.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        subjects: {
          select: {
            id: true,
            presetId: true,
            name: true,
            priority: true,
            difficulty: true,
            recommendedWeeklyHours: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            priority: 'desc',
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    /**
     * Linha de matéria de preset como vem do banco. Tipada explicitamente para
     * o endpoint não depender da inferência do client Prisma gerado.
     */
    type PresetSubjectRow = {
      id: string;
      presetId: string;
      name: string;
      priority: number;
      difficulty: number;
      recommendedWeeklyHours: number;
      createdAt: Date;
      updatedAt: Date;
    };
    type PresetRow = {
      id: string;
      name: string;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
      subjects: PresetSubjectRow[];
    };

    const normalizedPresets = presets.map((preset: PresetRow) => {
      const isEnem = preset.name.toLowerCase() === 'enem';
      const curated = getCuratedPresetByName(preset.name);

      if (!isEnem && !curated) return preset;

      const dbSubjectsByCanonical = new Map<string, PresetSubjectRow>(
        preset.subjects.map((subject) => [getCanonicalSubjectName(subject.name), subject])
      );

      if (isEnem) {
        return {
          ...preset,
          subjects: getEnemPresetSubjects().map((subject, index) => ({
            id: dbSubjectsByCanonical.get(getCanonicalSubjectName(subject.name))?.id ?? `enem-${index + 1}`,
            presetId: preset.id,
            name: subject.name,
            priority: subject.priority,
            difficulty: subject.difficulty,
            recommendedWeeklyHours: subject.recommendedWeeklyHours,
            group: subject.group,
            createdAt: preset.createdAt,
            updatedAt: preset.updatedAt,
          })),
        };
      }

      return {
        ...preset,
        description: curated!.description,
        subjects: curated!.subjects.map((subject, index) => {
          const match = dbSubjectsByCanonical.get(getCanonicalSubjectName(subject.name));
          return {
            id: match?.id ?? `${preset.id}-curated-${index}`,
            presetId: preset.id,
            name: subject.name,
            priority: subject.priority,
            difficulty: subject.difficulty,
            recommendedWeeklyHours: subject.recommendedWeeklyHours,
            group: subject.group,
            createdAt: match?.createdAt ?? preset.createdAt,
            updatedAt: match?.updatedAt ?? preset.updatedAt,
          };
        }),
        specificModules: curated!.specificModules ?? [],
      };
    });

    return NextResponse.json({
      success: true,
      data: normalizedPresets,
      source: 'api',
    });
  } catch (error) {
    console.warn('Error fetching presets:', error);
    return NextResponse.json({
      success: true,
      data: buildLocalPresets(),
      source: 'local',
      note: 'Using local presets because the database is unavailable',
    });
  }
}
