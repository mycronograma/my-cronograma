'use client';

/**
 * SubjectForm Component
 * Formulário para criar/editar disciplinas
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Palette } from 'lucide-react';
import { cn, subjectColors } from '@/lib/utils';
import { Button, Card } from '@/components/ui';
import type { Subject } from '@/types';

interface SubjectFormProps {
  subject?: Subject;
  onSubmit: (data: Partial<Subject>) => void;
  onCancel: () => void;
}

export default function SubjectForm({
  subject,
  onSubmit,
  onCancel,
}: SubjectFormProps) {
  const [name, setName] = useState(subject?.name || '');
  const [color, setColor] = useState(subject?.color || subjectColors[0]);
  const [priority, setPriority] = useState(subject?.priority || 5);
  const [difficulty, setDifficulty] = useState(subject?.difficulty || 5);
  const [targetHours, setTargetHours] = useState(subject?.targetHours || 10);
  const [error, setError] = useState<string | null>(null);

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

    if (!Number.isFinite(safeTargetHours) || safeTargetHours < 1 || safeTargetHours > 40) {
      setError('A meta semanal precisa estar entre 1 e 40 horas.');
      return;
    }

    onSubmit({
      name: trimmedName,
      color,
      priority,
      difficulty,
      targetHours: safeTargetHours,
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
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Cabeçalho */}
          <h2 className="text-xl font-heading font-bold text-white mb-6">
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

            {/* Prioridade */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
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
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>Baixa</span>
                <span>Alta</span>
              </div>
            </div>

            {/* Dificuldade */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
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
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>Fácil</span>
                <span>Difícil</span>
              </div>
            </div>

            {/* Meta de Horas */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Meta Semanal (horas)
              </label>
              <input
                type="number"
                min="1"
                max="40"
                value={targetHours}
                onChange={(e) => {
                  setTargetHours(Number(e.target.value));
                  if (error) setError(null);
                }}
                className="input-field"
                required
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

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
