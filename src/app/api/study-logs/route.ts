import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { isDemoRequest } from '@/lib/demoMode';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// Sincronização dos registros de estudo da página /estudos. O cliente mantém
// o localStorage como cache offline; esta rota guarda a cópia do servidor
// para o histórico sobreviver à troca de navegador/dispositivo.
export const dynamic = 'force-dynamic';

interface StudyLogPayload {
  id: string;
  subjectId: string;
  kind: string;
  note: string;
  correctAnswers: number | null;
  totalQuestions: number | null;
  createdAt: string;
}

async function resolveUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function GET() {
  try {
    const userId = await resolveUserId();
    if (!userId) {
      if (await isDemoRequest()) {
        return NextResponse.json({ success: true, data: null, persisted: false });
      }
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [logs, overrides] = await Promise.all([
      prisma.studyLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      prisma.studyReviewOverride.findMany({ where: { userId } }),
    ]);

    return NextResponse.json({
      success: true,
      persisted: true,
      data: {
        entries: logs.map((log) => ({
          id: log.id,
          subjectId: log.subjectId,
          kind: log.kind,
          note: log.note,
          correctAnswers: log.correctAnswers,
          totalQuestions: log.totalQuestions,
          createdAt: log.createdAt.toISOString(),
        })),
        overrides: Object.fromEntries(
          overrides.map((o) => [o.subjectId, { date: o.date, setAt: o.setAt.toISOString() }])
        ),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Falha ao carregar registros de estudo.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await resolveUserId();
    if (!userId) {
      if (await isDemoRequest()) {
        return NextResponse.json({ success: true, persisted: false });
      }
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const entries: StudyLogPayload[] = Array.isArray(body?.entries) ? body.entries : [];
    const overrides: Record<string, { date: string; setAt: string }> =
      body?.overrides && typeof body.overrides === 'object' ? body.overrides : {};

    // O cliente envia o snapshot completo: substitui a cópia do servidor.
    await prisma.$transaction([
      prisma.studyLog.deleteMany({ where: { userId } }),
      ...(entries.length
        ? [
            prisma.studyLog.createMany({
              data: entries
                .filter((e) => typeof e?.id === 'string' && typeof e?.subjectId === 'string')
                .map((e) => ({
                  id: e.id,
                  userId,
                  subjectId: e.subjectId,
                  kind: e.kind === 'revisao' ? 'revisao' : 'conteudo',
                  note: String(e.note ?? ''),
                  correctAnswers:
                    typeof e.correctAnswers === 'number' ? e.correctAnswers : null,
                  totalQuestions:
                    typeof e.totalQuestions === 'number' ? e.totalQuestions : null,
                  createdAt: new Date(e.createdAt),
                })),
            }),
          ]
        : []),
      prisma.studyReviewOverride.deleteMany({ where: { userId } }),
      ...(Object.keys(overrides).length
        ? [
            prisma.studyReviewOverride.createMany({
              data: Object.entries(overrides).map(([subjectId, override]) => ({
                userId,
                subjectId,
                date: String(override.date),
                setAt: new Date(override.setAt),
              })),
            }),
          ]
        : []),
    ]);

    return NextResponse.json({ success: true, persisted: true });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Falha ao sincronizar registros de estudo.' },
      { status: 500 }
    );
  }
}
