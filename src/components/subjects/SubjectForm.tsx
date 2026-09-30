'use client';

/**
 * SubjectForm Component
 * Formulário para criar/editar disciplinas.
 *
 * Só três coisas: nome, cor e peso no plano. As horas semanais saem do peso
 * pela regra única (carga semanal × peso² ÷ Σ peso²) e aparecem ao vivo, então
 * não existe campo de meta nem escolha entre automático e manual.
 *
 * O campo de horas usa o formato h:min (8:30), nunca decimal (8.5).
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Info, RotateCcw, Pin } from 'lucide-react';
import { cn, subjectColors, formatHoursDuration } from '@/lib/utils';
import { Button, Card, Badge } from '@/components/ui';
import { buildPeerItems, computeAutoTargetHours, describeAutoTarget } from '@/services/weeklyTarget';
import type { Subject } from '@/types';

interface SubjectFormProps {
  subject?: Subject;
  onSubmit: (data: Partial<Subject>) => void;
  onCancel: () => void;
  /** Carga semanal disponível (horas). Sem ela, usa-se a soma das metas atuais. */
  weeklyAvailableHours?: number;
  /** Soma dos pesos das OUTRAS matérias (usada só quando `peers` não vem). */
  peerWeightSum?: number;
  /**
   * Validação extra (ex.: nome repetido) feita por quem conhece a lista.
   * Devolve a mensagem de erro ou `null`. Assim a tela não precisa de `alert()`
   * do navegador, que some com a estética do app e é bloqueado em vários mobile.
   */
  validate?: (data: Partial<Subject>) => string | null;
    /**
   * As outras matérias. Nenhuma reserva horas da semana: a divisão é sempre
   * proporcional ao peso, então nenhuma matéria fica “fixada”.
   */
  peers?: Array<{
    id: string;
    priority: number;
    difficulty: number;
    targetHours?: number | null;
  }>;
}

const clampHours = (v: number) => Math.min(40, Math.max(0.5, Math.round(v * 12) / 12));

/**
 * Peso exibido na tela. Matéria antiga guardava prioridade e dificuldade
 * separadas; com um controle só, ela entra com a média dos dois — assim nenhum
 * slider escondido continua existindo por trás do formulário.
 */
const pesoUnico = (subject?: Subject): number => {
  const p = subject?.priority || 5;
  const d = subject?.difficulty || 5;
  return p === d ? p : Math.round((p + d) / 2);
};

export { computeAutoTargetHours };
const hoursToHM = (v: number) => {
  const h = Math.floor(v + 1e-6);
  const m = Math.round((v - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};
const parseHoursHM = (raw: string): number | null => {
  const t = raw.trim().replace(',', ':').replace('h', ':');
  const m = t.match(/^(\d{1,2})(?::([0-5]?\d))?$/);
  if (!m) return null;
  const total = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  if (total <= 0 || total > 40) return null;
  return clampHours(total);
};

export default function SubjectForm({
  subject,
  onSubmit,
  onCancel,
  weeklyAvailableHours,
  peerWeightSum = 0,
  peers = [],
  validate,
}: SubjectFormProps) {
  const [name, setName] = useState(subject?.name || '');
  const [color, setColor] = useState(subject?.color || subjectColors[0]);
  // Um controle só. Matéria antiga com prioridade diferente de dificuldade
  // entra com a média: a tela não tem mais dois sliders para escolher entre.
  const [weight, setWeight] = useState(() => pesoUnico(subject));
  const [error, setError] = useState<string | null>(null);

  // Outras matérias no formato do serviço. Nenhuma reserva horas: quem decide
  // a divisão é o peso de cada uma, proporcionalmente à carga da semana.

  const peerItems = useMemo(
    () => buildPeerItems(peers, subject?.id),
    [peers, subject?.id]
  );

  // Meta automática: fatia do que sobrou da semana, proporcional ao peso.
  const autoTarget = useMemo(
    () =>
      computeAutoTargetHours({
        priority: weight,
        difficulty: weight,
        weeklyAvailableHours,
        peerWeightSum,
        peers: peerItems,
      }),
    [weight, weeklyAvailableHours, peerWeightSum, peerItems]
  );

  // Números para explicar de onde veio a meta, em vez de mostrar um número solto.
  const autoInfo = useMemo(
    () =>
      describeAutoTarget({
        priority: weight,
        difficulty: weight,
        weeklyAvailableHours,
        peers: peerItems,
      }),
    [weight, weeklyAvailableHours, peerItems]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      setError('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    if (trimmedName.length > 80) {
      setError('Use um nome menor para a disciplina.');
      return;
    }
    // Validação de quem chamou (nome repetido, faixas de valor): mostra no
    // próprio formulário, sem alert() do navegador.
    if (validate) {
      const message = validate({
        name: trimmedName,
        color,
        priority: weight,
        difficulty: weight,
      });
      if (message) {
        setError(message);
        return;
      }
    }

    // Sem meta no formulário: quem chamou recalcula as horas de todas as
    // matérias pela regra única depois de salvar.
    onSubmit({
      name: trimmedName,
      color,
      priority: weight,
      difficulty: weight,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="app-modal-overlay"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="app-modal-panel max-w-md"
      >
        <Card className="relative" padding="md">
          {/* Botão fechar */}
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-surface-soft text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Cabeçalho */}
          <h2 className="text-xl font-heading font-bold text-text-primary mb-6">
            {subject ? 'Editar Disciplina' : 'Nova Disciplina'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Nome da Disciplina
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Ex: Matemática"
                className="input-field"
                maxLength={80}
                required
              />
            </div>

            {/* Cor — escolha cosmética, então fica compacta numa linha só */}
            <div className="flex items-center gap-3">
              <label className="shrink-0 text-sm font-medium text-text-secondary">Cor</label>
              <div className="flex flex-wrap gap-1.5">
                {subjectColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={'Cor ' + c}
                    className={cn(
                      'h-6 w-6 rounded-md transition-all',
                      color === c && 'ring-2 ring-white ring-offset-2 ring-offset-background'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Peso no plano — um controle só, com as horas ao vivo */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-text-secondary">
                  Peso no plano:{' '}
                  <span className="font-bold text-text-primary">{weight}</span>
                </label>
                <span className="text-xs font-medium text-text-muted">
                  {formatHoursDuration(autoTarget)} por semana
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                aria-label="Peso no plano"
                className="w-full accent-neon-blue"
              />
              <div className="mt-1 flex justify-between text-xs text-text-muted">
                <span>Leve</span>
                <span>Máximo</span>
              </div>
              <p className="mt-1.5 text-[11px] text-text-muted">
                Junta o quanto a matéria vale e o quanto ela te trava. Peso 10 recebe 4× as
                horas de peso 5.
              </p>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            {/* Ações */}
            <div className="flex flex-col gap-3 pt-4 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" className="flex-1">
                {subject ? 'Salvar Alterações' : 'Adicionar Disciplina'}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </motion.div>
  );
}
