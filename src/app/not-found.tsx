import Link from 'next/link';
import { Compass, Home, LifeBuoy } from 'lucide-react';

/**
 * 404 do app.
 *
 * Sem esta página, uma rota errada caía na tela branca padrão do Next.js, sem
 * marca e sem saída — em um lançamento oficial isso é a primeira coisa que um
 * usuário novo vê quando erra um link.
 */
export default function NotFound() {
  return (
    <main className="app-page flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-card-border bg-card-bg p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-neon-purple/20 bg-neon-purple/15">
          <Compass className="h-7 w-7 text-neon-purple" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Erro 404
        </p>
        <h1 className="mt-2 text-2xl font-heading font-bold text-text-primary">
          Essa página não existe
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          O link pode estar errado ou a página saiu do ar. Seu progresso e seu
          cronograma continuam salvos.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-opacity hover:opacity-90"
          >
            <Home className="h-4 w-4" />
            Ir para o painel
          </Link>
          <Link
            href="/planner"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-panel px-5 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            <LifeBuoy className="h-4 w-4" />
            Ver o cronograma
          </Link>
        </div>
      </div>
    </main>
  );
}
