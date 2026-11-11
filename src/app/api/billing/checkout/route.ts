import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPaymentProvider } from '@/lib/billing';
import { getPlan } from '@/lib/billing/plans';

// Usa sessão (headers), então não pode ser prerenderizada estaticamente.
export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/checkout { planId }
 * Cria a assinatura no provedor (Mercado Pago) e devolve a URL de checkout.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const planId = String(body.planId ?? '');
    const plan = getPlan(planId);
    if (!plan || plan.priceCents === 0) {
      return NextResponse.json(
        { success: false, error: 'Plano inválido ou gratuito não exige pagamento.' },
        { status: 400 }
      );
    }

    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'Pagamentos ainda não estão habilitados neste ambiente.',
          notConfigured: true,
        },
        { status: 503 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    const provider = getPaymentProvider();
    const checkout = await provider.createSubscription({
      userId: session.user.id,
      userEmail: session.user.email,
      planId,
      backUrl: `${baseUrl}/planos?status=success`,
    });

    // Grava a assinatura localmente como 'pending' — é essa linha que o
    // webhook encontra pelo providerSubscriptionId para atualizar o status.
    await prisma.subscription.upsert({
      where: { userId: session.user.id },
      update: {
        provider: provider.id,
        providerSubscriptionId: checkout.providerSubscriptionId,
        planId,
        status: 'pending',
      },
      create: {
        userId: session.user.id,
        provider: provider.id,
        providerSubscriptionId: checkout.providerSubscriptionId,
        planId,
        status: 'pending',
      },
    });

    return NextResponse.json({
      success: true,
      data: { checkoutUrl: checkout.checkoutUrl, providerSubscriptionId: checkout.providerSubscriptionId },
    });
  } catch (error) {
    console.error('Billing checkout error:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao criar checkout.' },
      { status: 500 }
    );
  }
}
