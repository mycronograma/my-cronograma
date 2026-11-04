/**
 * Abstração de provedor de pagamento (billing).
 *
 * O app não fala com Mercado Pago diretamente fora desta camada: qualquer
 * provedor novo implementa `PaymentProvider` e o resto do app continua igual.
 */

export type BillingProviderId = 'mercadopago';

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

export interface BillingPlan {
  id: string;
  name: string;
  /** Preço mensal em centavos (BRL) — TODO: valores reais conforme PLANO-SUBSCRICAO §2.2. */
  priceCents: number;
  currency: 'BRL';
  interval: 'month';
  features: string[];
  highlight?: boolean;
}

export interface CheckoutSession {
  /** URL para onde o usuário é redirecionado para concluir o pagamento. */
  checkoutUrl: string;
  providerSubscriptionId: string;
}

export interface ProviderSubscription {
  id: string;
  status: SubscriptionStatus;
  planId: string;
  currentPeriodEnd?: string;
}

export interface PaymentProvider {
  readonly id: BillingProviderId;
  /** Cria uma assinatura/preapproval e devolve a URL de checkout. */
  createSubscription(input: {
    userId: string;
    userEmail: string;
    planId: string;
    backUrl: string;
  }): Promise<CheckoutSession>;
  /** Consulta o status atual da assinatura no provedor. */
  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null>;
  /** Cancela a assinatura no provedor (no fim do período, se suportado). */
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
}
