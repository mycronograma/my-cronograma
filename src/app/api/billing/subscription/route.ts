import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/billing/subscription — status atual da assinatura do usuário logado. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [subscription, user] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId: session.user.id } }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { plan: true, planExpiresAt: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        plan: user?.plan ?? 'free',
        planExpiresAt: user?.planExpiresAt ?? null,
        subscription,
      },
    });
  } catch (error) {
    console.error('Billing subscription GET error:', error);
    return NextResponse.json({ success: false, error: 'Falha ao ler assinatura.' }, { status: 500 });
  }
}
