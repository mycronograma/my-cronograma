'use client';

/**
 * SubjectForm Component
 * Formulário para criar/editar disciplinas.
 *
 * #15 — a meta semanal deixou de ser um número solto que o usuário precisa
 * adivinhar: ela é calculada a partir da prioridade (60%) e da dificuldade
 * (40%) em relação às outras matérias, sobre a carga semanal disponível.
 * Mexeu nos sliders → a meta acompanha. Digitou um valor → vira manual e
 * avisa, com botão para voltar ao automático.
 *
 * O campo de horas usa o formato h:min (8:30), nunca decimal (8.5).
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Palette, Info, RotateCcw, Pin, Combine, Split } from 'lucide-react';
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
   * As outras matérias, com a meta já fixada quando houver. É o que permite
   * reservar as horas já comprometidas antes de dividir o resto.
   */
  peers?: Array<{
    id: string;
    priority: number;
    difficulty: number;
    targetHours?: number | null;
    /** A meta foi escolhida pela pessoa? S aí ela reserva horas da semana. */
    targetHoursIsManual?: boolean;
  }>;
}

const clampHours = (v: number) => Math.min(40, Math.max(0.5, Math.round(v * 12) / 12));

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
  // Fusão prioridade/dificuldade: um único controle "peso no plano" move as
  // duas juntas. Quem quiser diferenciar (ex.: matéria fácil mas decisiva na
  // prova) abre o modo separado — os dados continuam gravando os dois campos.
  const [priority, setPriority] = useState(subject?.priority || 5);
  const [difficulty, setDifficulty] = useState(subject?.difficulty || 5);
  const [splitMode, setSplitMode] = useState(
    () => !!subject && subject.priority !== subject.difficulty
  );
  const [weight, setWeight] = useState(subject?.priority || 5);
  // Se a matéria já tem uma meta diferente da calculada, ela é preservada e
  // marcada como manual — abrir o formulário para trocar só o nome não pode
  // sobrescrever a meta que a pessoa definiu.
  const [targetHours, setTargetHours] = useState(
    () =>
      subject?.targetHours ??
      computeAutoTargetHours({
        priority: subject?.priority || 5,
        difficulty: subject?.difficulty || 5,
        weeklyAvailableHours,
        peerWeightSum,
      })
  );
  const [manualTarget, setManualTarget] = useState(() => {
    if (typeof subject?.targetHoursIsManual === 'boolean') return subject.targetHoursIsManual;
    // Matéria antiga, sem o flag: considera manual só se a meta difere bastante
    // da calculada — assim uma meta já ajustada na mão não é sobrescrita.
    if (!subject?.targetHours) return false;
    const suggested = computeAutoTargetHours({
      priority: subject.priority || 5,
      difficulty: subject.difficulty || 5,
      weeklyAvailableHours,
      peerWeightSum,
    });
    return Math.abs(subject.targetHours - suggested) > 0.05;
  });
  const [targetText, setTargetText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Outras matérias no formato do serviço. Só conta como "fixa" (e reserva
  // horas da semana) a meta que a pessoa escolheu de propósito — o flag
  // `targetHoursIsManual`. Sem ele, qualquer valor diferente do automático
  // parecia fixo e a semana inteira ficava reservada.
  const peerItems = useMemo(
    () => buildPeerItems(peers, subject?.id),
    [peers, subject?.id]
  );

  // Meta automática: fatia do que sobrou da semana, proporcional ao peso.
  const autoTarget = useMemo(
    () =>
      computeAutoTargetHours({
        priority,
        difficulty,
        weeklyAvailableHours,
        peerWeightSum,
        peers: peerItems,
      }),
    [priority, difficulty, weeklyAvailableHours, peerWeightSum, peerItems]
  );

  // Números para explicar de onde veio a meta, em vez de mostrar um número solto.
  const autoInfo = useMemo(
    () =>
      describeAutoTarget({
        priority,
        difficulty,
        weeklyAvailableHours,
        peers: peerItems,
      }),
    [priority, difficulty, weeklyAvailableHours, peerItems]
  );

  // Enquanto está no automático, a meta segue os sliders.
  useEffect(() => {
    if (!manualTarget) setTargetHours(autoTarget);
  }, [autoTarget, manualTarget]);

  /** Controle único: move prioridade e dificuldade juntas. */
  const handleWeightChange = (value: number) => {
    setWeight(value);
    setPriority(value);
    setDifficulty(value);
  };

  /** Volta ao controle único usando a média dos dois valores atuais. */
  const handleMergeWeights = () => {
    const merged = Math.round((priority + difficulty) / 2);
    setWeight(merged);
    setPriority(merged);
    setDifficulty(merged);
    setSplitMode(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const safeTargetHours = Number(targetHours);

    if (trimmedName.length < 2) {
      setError('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    if (trimmedName.length > 80) {
      setError('Use um nome menor para a disciplina.');
      return;
    }
    if (!Number.isFinite(safeTargetHours) || safeTargetHours < 0.5 || safeTargetHours > 40) {
      setError('A meta semanal precisa estar entre 0h30 e 40h.');
      return;
    }

    // Validação de quem chamou (nome repetido, faixas de valor): mostra no
    // próprio formulário, sem alert() do navegador.
    if (validate) {
      const message = validate({
        name: trimmedName,
        color,
        priority,
        difficulty,
        targetHours: safeTargetHours,
        targetHoursIsManual: manualTarget,
      });
      if (message) {
        setError(message);
        return;
      }
    }

    onSubmit({
      name: trimmedName,
      color,
      priority,
      difficulty,
      targetHours: safeTargetHours,
      targetHoursIsManual: manualTarget,
    });
  };

  const isAuto = !manualTarget;

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

            {/* Cor */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Cor
              </label>
              <div className="flex gap-2 flex-wrap">
                {subjectColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-8 h-8 rounded-lg transition-all',
                      color === c && 'ring-2 ring-white ring-offset-2 ring-offset-background'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Peso no plano — controle único (prioridade + dificuldade fundidos) */}
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-medium text-text-secondary">
                  {splitMode ? (
                    <>
                      Peso no plano{' '}
                      <span className="text-text-muted">(separado abaixo)</span>
                    </>
                  ) : (
                    <>
                      Peso no plano: <span className="font-bold text-text-primary">{weight}</span>
                    </>
                  )}
                </label>
                {splitMode ? (
                  <button
                    type="button"
                    onClick={handleMergeWeights}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-neon-blue hover:underline"
                  >
                    <Combine className="w-3 h-3" />
                    Fundir em um só
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSplitMode(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-neon-blue hover:underline"
                  >
                    <Split className="w-3 h-3" />
                    Separar prioridade e dificuldade
                  </button>
                )}
              </div>

              {splitMode ? (
                <div className="space-y-4 rounded-xl border border-card-border bg-row-soft p-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      Prioridade: {priority}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value))}
                      className="w-full accent-neon-blue"
                    />
                    <div className="flex justify-between text-[10px] text-text-muted mt-1">
                      <span>Baixa</span>
                      <span>Alta</span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted">
                      O quanto essa matéria vale para o seu objetivo (peso na prova, urgência).
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      Dificuldade: {difficulty}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={difficulty}
                      onChange={(e) => setDifficulty(Number(e.target.value))}
                      className="w-full accent-neon-purple"
                    />
                    <div className="flex justify-between text-[10px] text-text-muted mt-1">
                      <span>Fácil</span>
                      <span>Difícil</span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted">
                      O quanto você erra hoje nela.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={weight}
                    onChange={(e) => handleWeightChange(Number(e.target.value))}
                    className="w-full accent-neon-blue"
                  />
                  <div className="flex justify-between text-xs text-text-muted mt-1">
                    <span>Leve</span>
                    <span>Máximo</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-text-muted">
                    Junta os dois numa nota só: o quanto a matéria vale <em>e</em> o quanto ela te
                    trava. Quanto maior, mais horas por semana ela recebe.
                  </p>
                </>
              )}
            </div>

            {/* Meta semanal */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                  Meta semanal (h:min)
                  {isAuto && (
                    <Badge variant="purple" size="sm">
                      automática
                    </Badge>
                  )}
                </label>
                {isAuto ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Fixa o valor que está na tela: a partir daqui a meta é
                      // sua e o peso deixa de alterá-la sozinho.
                      setManualTarget(true);
                      setTargetText('');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-neon-blue hover:underline"
                    title="Usar este valor como meta fixa, mesmo que você mude o peso"
                  >
                    <Pin className="w-3 h-3" />
                    Fixar este valor
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setManualTarget(false);
                      setTargetText('');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-neon-blue hover:underline"
                    title="Deixar o peso decidir a meta de novo"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Voltar ao automático ({formatHoursDuration(autoTarget)})
                  </button>
                )}
              </div>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0:00"
                aria-label="Meta semanal em horas e minutos"
                value={targetText ? targetText : hoursToHM(targetHours)}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTargetText(raw);
                  const parsed = parseHoursHM(raw);
                  if (parsed !== null) {
                    setTargetHours(parsed);
                    if (parsed !== autoTarget) setManualTarget(true);
                  }
                  if (error) setError(null);
                }}
                onBlur={() => setTargetText('')}
                className="input-field"
                required
              />
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-text-muted">
                <Info className="mt-0.5 w-3 h-3 shrink-0" />
                {isAuto ? (
                  autoInfo.poolHours <= 0 ? (
                    <span className="text-warning-strong">
                      A semana já está toda comprometida com metas fixas (
                      {formatHoursDuration(autoInfo.reservedHours)} de{' '}
                      {formatHoursDuration(autoInfo.capacityHours)}), então não sobra hora para
                      distribuir. Libere horas em outra disciplina ou aumente a carga semanal em
                      Ajustes.
                    </span>
                  ) : (
                    <span>
                      {splitMode
                        ? `Prioridade ${priority} (60%) + dificuldade ${difficulty} (40%)`
                        : `Peso ${weight}`}{' '}
                      define sua fatia:{' '}
                      {autoInfo.reservedHours > 0
                        ? `${formatHoursDuration(autoInfo.reservedHours)} da semana já estão com metas fixas e, das ${formatHoursDuration(autoInfo.poolHours)} que sobraram, você leva ${formatHoursDuration(autoTarget)}`
                        : `${formatHoursDuration(autoTarget)} das ${formatHoursDuration(autoInfo.capacityHours)} semanais, divididas com ${autoInfo.autoCount - 1 === 0 ? 'nenhuma outra matéria' : `outras ${autoInfo.autoCount - 1} matérias`}`}
                      . Mexa no controle acima e a meta acompanha.
                    </span>
                  )
                ) : (
                  <span>
                    Fixado por você ({formatHoursDuration(targetHours)}). O automático daria{' '}
                    {formatHoursDuration(autoTarget)}
                    {autoInfo.reservedHours > 0
                      ? ` — ${formatHoursDuration(autoInfo.reservedHours)} da semana já estão com metas fixas`
                      : ` — as outras ${autoInfo.autoCount - 1} matérias dividem as ${formatHoursDuration(autoInfo.capacityHours)} semanais com você`}
                    .
                  </span>
                )}
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
