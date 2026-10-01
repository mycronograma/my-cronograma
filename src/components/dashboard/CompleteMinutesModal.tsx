'use client';

/**
 * CompleteMinutesModal
 *
 * Pergunta quanto tempo a pessoa realmente estudou antes de dar um bloco por
 * concluído. Antes o botão "Concluir" da agenda creditava a duração planejada
 * inteira sem perguntar nada — dava para marcar o dia todo sem estudar.
 *
 * O campo vem preenchido com o planejado (quem estudou os 50 min só confirma),
 * mas é editável: quem estudou 20 min informa 20 e o app credita 20.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { formatDuration } from '@/lib/utils';

interface CompleteMinutesModalProps {
  /** Duração planejada do bloco, em minutos. */
  plannedMinutes: number;
  /** Nome do que será concluído (matéria ou "Intervalo"). */
  title: string;
  onConfirm: (minutes: number) => void;
  onCancel: () => void;
}

/** Limite conservador: ninguém estuda 12h num bloco só. */
const MAX_MINUTES = 720;

export default function CompleteMinutesModal({
  plannedMinutes,
  title,
  onConfirm,
  onCancel,
}: CompleteMinutesModalProps) {
  const planned = Math.max(1, Math.round(plannedMinutes));
  const [text, setText] = useState(() => String(planned));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const parsed = useMemo(() => {
    const limpo = text.trim().replace(',', '.');
    if (limpo === '') return null;
    const valor = Number(limpo);
    if (!Number.isFinite(valor) || valor < 0) return null;
    return Math.min(MAX_MINUTES, Math.round(valor));
  }, [text]);

  const invalido = parsed === null || parsed > MAX_MINUTES;

  const submit = () => {
    if (invalido) return;
    onConfirm(parsed as number);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Quanto tempo você estudou"
    >
      <div className="w-full max-w-sm rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-base font-bold text-text-primary">
              Quanto tempo você estudou?
            </h3>
            <p className="mt-1 truncate text-sm text-text-secondary">{title}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar"
            className="shrink-0 rounded-lg p-1 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-xs font-medium text-text-secondary">
          Minutos estudados
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-card-border bg-background px-3">
            <Clock className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              autoFocus
              type="number"
              min={0}
              max={MAX_MINUTES}
              step={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              aria-label="Minutos estudados"
              className="h-11 w-full bg-transparent text-lg font-bold tabular-nums text-text-primary outline-none"
            />
            <span className="shrink-0 text-sm text-text-muted">min</span>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-text-muted">
          {invalido
            ? 'Informe um número de minutos entre 0 e 720.'
            : `Vai registrar ${formatDuration(parsed as number)} — o planejado era ${formatDuration(planned)}.`}
        </p>

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={invalido}
            className="flex-1"
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
