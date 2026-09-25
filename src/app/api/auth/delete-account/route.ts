import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions, invalidateUserSessionCache } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Exclui permanentemente a conta do usuário autenticado e todos os dados
 * vinculados (matérias, blocos, sessões, métricas, notificações, push,
 * preferências, snapshot de progresso e contas OAuth).
 *
 * As relações usam onDelete: Cascade no schema, mas removemos os filhos
 * explicitamente para não depender do comportamento de FK do provedor.
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      // Já não existe: trata como sucesso idempotente para o cliente poder sair.
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }

    await prisma.$transaction([
      prisma.userNotification.deleteMany({ where: { userId } }),
      prisma.pushSubscription.deleteMany({ where: { userId } }),
      prisma.userAchievement.deleteMany({ where: { userId } }),
      prisma.weeklyStats.deleteMany({ where: { userId } }),
      prisma.topicProgress.deleteMany({ where: { userId } }),
      prisma.performanceMetrics.deleteMany({ where: { userId } }),
      prisma.studySession.deleteMany({ where: { userId } }),
      prisma.studyBlock.deleteMany({ where: { userId } }),
      prisma.subject.deleteMany({ where: { userId } }),
      prisma.userProgressSnapshot.deleteMany({ where: { userId } }),
      prisma.userProfile.deleteMany({ where: { userId } }),
      prisma.userPreferences.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.account.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    // Sessão JWT é stateless: sem isso o cookie continuaria válido por até 30s
    // (TTL do cache) e as rotas de API seguiriam aceitando o usuário excluído.
    invalidateUserSessionCache(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir conta:', error);
    return NextResponse.json(
      { success: false, error: 'Não foi possível excluir sua conta agora.' },
      { status: 500 }
    );
  }
}
