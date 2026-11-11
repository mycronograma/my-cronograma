import type {
  CheckoutSession,
  PaymentProvider,
  ProviderSubscription,
  SubscriptionStatus,
} from './types';
import { getPlan } from './plans';

/**
 * Provedor Mercado Pago (assinaturas via preapproval).
 *
 * Documentação de referência: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/landing
 * Todas as chamadas batem na API do Mercado Pago a partir do servidor (Vercel),
 * usando MERCADO_PAGO_ACCESS_TOKEN — nunca do cliente.
 */

const MP_API_BASE = 'https://api.mercadopago.com';

function accessToken(): string {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error('MERCADO_PAGO_ACCESS_TOKEN não configurado.');
  return token;
}

async function mpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mercado Pago ${path} falhou (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

function mapStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'authorized':
      return 'active';
    case 'pending':
    case 'in_process':
      return 'pending';
    case 'paused':
      return 'past_due';
    case 'cancelled':
      return 'canceled';
    default:
      return 'expired';
  }
}

export const mercadoPagoProvider: PaymentProvider = {
  id: 'mercadopago',

  async createSubscription({ userId, userEmail, planId, backUrl }) {
    const plan = getPlan(planId);
    if (!plan) throw new Error(`Plano desconhecido: ${planId}`);
    if (plan.priceCents === 0) {
      throw new Error('Plano gratuito não precisa de checkout.');
    }

    const body = {
      reason: `Nexora — plano ${plan.name}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan.priceCents / 100,
        currency_id: plan.currency,
      },
      payer_email: userEmail,
      back_url: backUrl,
      external_reference: `user:${userId}:plan:${planId}`,
    };

    const created = await mpFetch<{ id: string; init_point: string }>('/preapproval', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      checkoutUrl: created.init_point,
      providerSubscriptionId: String(created.id),
    };
  },

  async getSubscription(providerSubscriptionId) {
    try {
      const sub = await mpFetch<{
        id: string;
        status: string;
        external_reference?: string;
        last_modified?: string;
      }>(`/preapproval/${providerSubscriptionId}`);
      const planId = sub.external_reference?.split(':')[3] ?? 'pro';
      return {
        id: String(sub.id),
        status: mapStatus(sub.status),
        planId,
        currentPeriodEnd: sub.last_modified,
      } satisfies ProviderSubscription;
    } catch {
      return null;
    }
  },

  async cancelSubscription(providerSubscriptionId) {
    await mpFetch(`/preapproval/${providerSubscriptionId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    });
  },
};
