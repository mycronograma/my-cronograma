'use client';

/**
 * QuestionLogModal — registro avulso de questões respondidas.
 *
 * #10: os cards de "Acerto" dependiam de respostas dadas dentro do cronômetro;
 * quem resolve questões fora do bloco (lista impressa, app de questões,
 * simulado externo) ficava sem dados. Aqui entram matéria, data, total de
 * questões e acertos — e a taxa de acerto é recalculada de verdade.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Target, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Card } from '@/components/ui';
import type { Subject } from '@/types';

export interface QuestionLogPayload {
  subjectId: string;
  totalQuestions: number;
  correctAnswers: number;
  date: Date;
  sessionType: 'EXERCICIOS' | 'SIMULADO';
}

interface QuestionLogModalProps {
  subjects: Subject[];
  initialSubjectId?: string;
  onClose: () => void;
  onSave: (payload: QuestionLogPayload) => void;
}

const todayKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export default function QuestionLogModal({
  subjects,
  initialSubjectId,
  onClose,
  onSave,
}: QuestionLogModalProps) {
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? subjects[0]?.id ?? '');
  const [date, setDate] = useState(todayKey());
  const [totalText, setTotalText] = useState('');
  const [correctText, setCorrectText] = useState('');
  const [sessionType, setSessionType] = useState<'EXERCICIOS' | 'SIMULADO'>('EXERCICIOS');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subjectId && subjects[0]) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  const total = Number(totalText) || 0;
  const correct = Number(correctText) || 0;
  const percent = total > 0 ? Math.round((Math.min(correct, total) / total) * 100) : null;

  const subject = useMemo(
    () => subjects.find((s) => s.id === subjectId),
    [subjects, subjectId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) {
      setError('Escolha a matéria.');
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setError('Informe quantas questões você resolveu.');
      return;
    }
    if (correct < 0 || correct > total) {
      setError('O número de acertos não pode passar do total de questões.');
      return;
    }
    const [year, month, day] = date.split('-').map(Number);
    onSave({
      subjectId,
      totalQuestions: Math.round(total),
      correctAnswers: Math.round(correct),
      date: new Date(year, (month || 1) - 1, day || 1, 12, 0, 0),
      sessionType,
    });
  };

  const percentColor =
    percent === null ? 'text-text-muted' : percent >= 70 ? 'text-emerald-400' : percent >= 50 ? 'text-amber-300' : 'text-danger';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="app-modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="app-modal-panel max-w-md"
      >
        <Card className="relative" padding="md">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-surface-soft text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <h2 className="text-xl font-heading font-bold text-text-primary mb-1">
            Registrar questões
          </h2>
          <p className="text-xs text-text-secondary mb-6">
            Vale para listas, cadernos e simulados resolvidos fora do cronômetro. Esses números
            alimentam seu índice de acerto.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Matéria */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Matéria</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="input-field"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {(['EXERCICIOS', 'SIMULADO'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSessionType(type)}
                    className={cn(
                      'h-10 rounded-xl border text-sm font-medium transition-colors',
                      sessionType === type
                        ? 'border-neon-blue bg-neon-blue/10 text-neon-blue'
                        : 'border-card-border text-text-secondary hover:border-neon-blue/40'
                    )}
                  >
                    {type === 'EXERCICIOS' ? 'Exercícios' : 'Simulado'}
                  </button>
                ))}
              </div>
            </div>

            {/* Data */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Data</label>
              <input
                type="date"
                value={date}
                max={todayKey()}
                onChange={(e) => setDate(e.target.value)}
                className="input-field"
              />
            </div>

            {/* Questões e acertos */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Questões resolvidas
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={totalText}
                  onChange={(e) => {
                    setTotalText(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ex: 40"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Acertos</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={correctText}
                  onChange={(e) => {
                    setCorrectText(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ex: 28"
                  className="input-field"
                  required
                />
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-xl border border-card-border bg-card-bg p-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-text-secondary">
                <Target className="w-3.5 h-3.5" />
                Acerto deste registro
              </span>
              <span className={cn('text-lg font-bold tabular-nums', percentColor)}>
                {percent === null ? '--' : `${percent}%`}
              </span>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" variant="primary" className="flex-1" leftIcon={<CheckCircle2 className="w-4 h-4" />}>
                Salvar registro
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </motion.div>
  );
}
