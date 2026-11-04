import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPaymentProvider } from '@/lib/billing';

/**
 * POST /api/billing/webhook
 * Webhook do Mercado Pago (topic=preapproval). Atualiza a tabela Subscription
 * e o plano do usuário conforme o status real no provedor.
 *
 * TODO §2.2: validar assinatura do webhook (x-signature) quando o segredo
 * MERCADO_PAGO_WEBHOOK_SECRET estiver configurado.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = body?.topic ?? body?.type;
    const resourceId =
      body?.data?.id ??
      (typeof body?.resource === 'string' ? body.resource.split('/').pop() : undefined);

    if (topic !== 'preapproval' || !resourceId) {
      // outros tópicos (payment etc.) — ignorados por enquanto
      return NextResponse.json({ success: true, ignored: true });
    }

    const provider = getPaymentProvider();
    const remote = await provider.getSubscription(String(resourceId));
    if (!remote) {
      return NextResponse.json({ success: false, error: 'Assinatura não encontrada no provedor.' }, { status: 404 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { providerSubscriptionId: remote.id },
    });
    if (!subscription) {
      return NextResponse.json({ success: false, error: 'Assinatura desconhecida localmente.' }, { status: 404 });
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: remote.status,
        planId: remote.planId,
        currentPeriodEnd: remote.currentPeriodEnd ? new Date(remote.currentPeriodEnd) : undefined,
      },
    });

    if (remote.status === 'active') {
      await prisma.user.update({
        where: { id: subscription.userId },
        data: {
          plan: remote.planId,
          planExpiresAt: remote.currentPeriodEnd ? new Date(remote.currentPeriodEnd) : null,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Billing webhook error:', error);
    return NextResponse.json({ success: false, error: 'Falha no webhook.' }, { status: 500 });
  }
}
