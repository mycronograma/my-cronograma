'use client';

/**
 * WelcomeTutorial — tour curto de primeira vez.
 *
 * Usa o estado existente de useOnboarding (shouldShowTutorial /
 * completeTutorial) e os marcadores data-tutorial já presentes na navegação.
 * Aparece uma única vez; fechar marca como concluído.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { useOnboarding } from '@/hooks';

const STEPS: { selector?: string; titulo: string; texto: string }[] = [
  {
    selector: '[data-tutorial="nav-dashboard"]',
    titulo: 'Bem-vindo ao Nexora! 👋',
    texto: 'Aqui no Início você acompanha sua meta semanal, agenda de hoje e progresso. Este é o seu painel principal.',
  },
  {
    selector: '[data-tutorial="nav-subjects"]',
    titulo: 'Suas matérias',
    texto: 'Em Matérias você cadastra disciplinas, define peso e meta semanal (automática por peso ou manual).',
  },
  {
    selector: '[data-tutorial="nav-planner"]',
    titulo: 'Seu cronograma',
    texto: 'No Cronograma o app gera seus blocos de estudo — e você pode aplicar uma estratégia fixa de semana se quiser.',
  },
  {
    titulo: 'Configure seu perfil',
    texto: 'Em Perfil você ajusta horas por dia, blocos, horário preferido e notificações. Pronto para começar!',
  },
];

export default function WelcomeTutorial() {
  const { hasCompletedTutorial, completeTutorial } = useOnboarding();
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Aparece uma única vez por dispositivo (fica salvo em nexora_onboarding).
  const visible = mounted && !hasCompletedTutorial;
  const current = STEPS[Math.min(step, STEPS.length - 1)];

  // Destaca o elemento alvo do passo atual.
  useEffect(() => {
    if (!visible || !current?.selector) return;
    const el = document.querySelector<HTMLElement>(current.selector);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const prevOutline = el.style.outline;
    const prevOffset = el.style.outlineOffset;
    el.style.outline = '2px solid rgba(139, 92, 246, 0.9)';
    el.style.outlineOffset = '3px';
    el.style.borderRadius = '12px';
    return () => {
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOffset;
    };
  }, [visible, step, current?.selector]);

  const botoes = useMemo(() => STEPS.length, []);

  if (!visible) return null;

  const finish = () => completeTutorial();
  const next = () => {
    if (step >= STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-violet-500/40 bg-card-bg p-5 shadow-2xl shadow-violet-600/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600">
              Passo {step + 1} de {botoes}
            </p>
            <h3 className="mt-1 text-lg font-bold text-text-primary">{current.titulo}</h3>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label="Pular tutorial"
            className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-text-secondary">{current.texto}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-xs font-semibold text-text-muted hover:text-text-primary hover:underline"
          >
            Pular tutorial
          </button>
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-all hover:from-violet-700 hover:to-indigo-700"
          >
            {step >= STEPS.length - 1 ? 'Começar' : 'Próximo'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
