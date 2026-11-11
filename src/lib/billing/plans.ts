import type { BillingPlan } from './types';

/**
 * Catálogo de planos. Valores são placeholders (TODO conforme
 * PLANO-SUBSCRICAO.md §2.2) — centralizados aqui para o preço real entrar
 * num lugar só, sem espalhar pelo código.
 */
export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'free',
    name: 'Gratuito',
    priceCents: 0,
    currency: 'BRL',
    interval: 'month',
    features: ['Cronograma básico', 'Matérias ilimitadas', 'Notificações locais'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 0, // TODO: preço real §2.2
    currency: 'BRL',
    interval: 'month',
    highlight: true,
    features: [
      'Tudo do Gratuito',
      'Modo adaptativo de blocos',
      'Relatórios avançados de desempenho',
      'Suporte prioritário',
    ],
  },
];

export function getPlan(planId: string): BillingPlan | undefined {
  return BILLING_PLANS.find((p) => p.id === planId);
}
