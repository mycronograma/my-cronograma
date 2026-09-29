'use client';

import { useEffect } from 'react';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';

/**
 * Tela de erro de runtime.
 *
 * Sem ela, qualquer exceção em uma página mostrava a tela branca do Next.js.
 * Aqui o usuário vê o que aconteceu em português, pode tentar de novo e tem
 * para onde ir — e nada do progresso local é perdido.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[nexora] erro de runtime:', error);
  }, [error]);

  return (
    <main className="app-page flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-card-border bg-card-bg p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-warning bg-warning-soft">
          <AlertTriangle className="h-7 w-7 text-warning-strong" />
        </div>
        <h1 className="text-2xl font-heading font-bold text-text-primary">
          Algo deu errado nesta tela
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Não foi você — houve uma falha ao carregar. Tentar de novo costuma
          resolver, e o seu progresso continua salvo.
        </p>
        {error.digest && (
          <p className="mt-3 rounded-xl border border-card-border bg-surface-panel px-3 py-2 text-[11px] text-text-muted">
            Código do erro: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-opacity hover:opacity-90"
          >
            <RotateCw className="h-4 w-4" />
            Tentar de novo
          </button>
          <a
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-panel px-5 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            <Home className="h-4 w-4" />
            Ir para o painel
          </a>
        </div>
      </div>
    </main>
  );
}
