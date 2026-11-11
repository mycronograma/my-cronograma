'use client';

import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { Button } from '@/components/ui';

interface SubscriptionStatus {
  plan: string;
  planExpiresAt: string | null;
  subscription: { status: string; planId: string } | null;
}

export default function PlanosPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) setStatus(json.data);
      })
      .catch(() => {});
  }, []);

  const assinar = async (planId: string) => {
    setErro(null);
    setLoadingPlanId(planId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        if (json?.notConfigured) {
          setErro(
            'Pagamentos ainda não estão habilitados neste ambiente (Mercado Pago não configurado).'
          );
          setLoadingPlanId(null);
          return;
        }
        throw new Error(json?.error ?? 'Falha ao iniciar pagamento.');
      }
      window.location.href = json.data.checkoutUrl;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao iniciar pagamento.');
      setLoadingPlanId(null);
    }
  };

  const planoAtual = status?.plan ?? 'free';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Planos</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Plano atual: <span className="font-semibold text-text-primary">{planoAtual}</span>
          {status?.planExpiresAt && (
            <span className="text-text-muted">
              {' '}
              — renova em {new Date(status.planExpiresAt).toLocaleDateString('pt-BR')}
            </span>
          )}
        </p>
      </div>

      {erro && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {BILLING_PLANS.map((plan) => {
          const atual = planoAtual === plan.id;
          const pago = plan.priceCents > 0;
          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-5 bg-card-bg ${
                plan.highlight ? 'border-violet-500' : 'border-card-border'
              }`}
            >
              <div className="flex items-center gap-2">
                {plan.highlight && <Sparkles className="h-4 w-4 text-violet-600" />}
                <h2 className="text-lg font-bold text-text-primary">{plan.name}</h2>
              </div>
              <p className="mt-1 text-2xl font-extrabold text-text-primary">
                {pago ? `R$ ${(plan.priceCents / 100).toFixed(2)}` : 'Grátis'}
                {pago && <span className="text-sm font-medium text-text-muted">/mês</span>}
              </p>
              <ul className="mt-3 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
                    <Check className="h-4 w-4 mt-0.5 flex-shrink-0 text-violet-600" />
                    {f}
                  </li>
                ))}
              </ul>
              {pago && !atual && (
                <Button
                  className="mt-4 w-full"
                  loading={loadingPlanId === plan.id}
                  onClick={() => assinar(plan.id)}
                >
                  Assinar com Mercado Pago
                </Button>
              )}
              {atual && (
                <p className="mt-4 text-center text-sm font-semibold text-violet-600">
                  Plano atual
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
