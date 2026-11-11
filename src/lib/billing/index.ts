import type { PaymentProvider } from './types';
import { mercadoPagoProvider } from './mercadoPago';

export * from './types';
export { BILLING_PLANS, getPlan } from './plans';

/**
 * Gateway único de billing: o resto do app só enxerga `getPaymentProvider()`.
 * Para trocar de gateway (ex.: Mercado Pago -> outro), basta trocar aqui.
 */
export function getPaymentProvider(): PaymentProvider {
  // TODO: escolher por variável de ambiente quando houver mais de um provedor.
  return mercadoPagoProvider;
}
