'use client';

/**
 * SubjectCard Component
 * Exibe uma disciplina com estatisticas e acoes
 */

import {
  BookOpen,
  Clock,
  Target,
  Edit,
  Trash2,
  Star,
  MoreVertical,
  X,
  TrendingUp,
  BarChart2,
  Calendar,
} from 'lucide-react';
import { formatHoursDuration, percentage, cn } from '@/lib/utils';
import { Card, Badge, ProgressBar, Button } from '@/components/ui';
import type { Subject } from '@/types';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface SubjectCardProps {
  subject: Subject;
  onEdit: (subject: Subject) => void;
  onDelete: (subjectId: string) => void;
}

const difficultyLabels = ['Muito Fácil', 'Fácil', 'Médio', 'Difícil', 'Muito Difícil'];

export default function SubjectCard({
  subject,
  onEdit,
  onDelete,
}: SubjectCardProps) {
  const completionPercent = percentage(subject.completedHours, subject.targetHours);
  const difficultyLabel = difficultyLabels[Math.floor((subject.difficulty - 1) / 2)] || 'Médio';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <Card 
        className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer" 
        glow="none" 
        padding="none"
        onClick={() => setIsDetailsOpen(true)}
      style={{
        background: `linear-gradient(135deg, ${subject.color}10 0%, ${subject.color}03 100%)`,
        borderColor: `${subject.color}30`,
        boxShadow: `0 8px 32px -8px ${subject.color}15`,
      }}
    >
      {/* Top accent line */}
      <div className="h-[2px] w-full" style={{ backgroundColor: subject.color }} />

      <div className="p-4 sm:p-5 relative z-10">
        <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm"
              style={{ 
                backgroundColor: `${subject.color}15`,
                border: `1px solid ${subject.color}30`,
              }}
            >
              <BookOpen className="h-5 w-5" style={{ color: subject.color }} />
            </div>

            <div className="min-w-0 flex flex-col justify-center">
              <h3 className="truncate text-base font-bold text-text-primary leading-tight mb-1" title={subject.name}>
                {subject.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                  style={{
                    backgroundColor: `${subject.color}15`,
                    color: subject.color,
                  }}
                >
                  P{subject.priority}
                </span>
                <span className="text-[11px] font-medium text-text-muted">{difficultyLabel}</span>
              </div>
            </div>
          </div>

          <div className="relative">
             <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 rounded-full p-0 text-text-muted hover:text-text-primary hover:bg-surface-panel opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-32 rounded-xl border border-card-border bg-card-bg shadow-xl z-50 overflow-hidden">
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(subject); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-panel transition-colors"
                    >
                      <Edit className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(subject.id); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </div>
                </>
              )}
          </div>
        </div>

        <div className="mb-5">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 text-xs font-semibold text-text-muted uppercase tracking-wider">Progresso Semanal</span>
            <span className="shrink-0 text-xs font-bold text-text-primary">
              {formatHoursDuration(subject.completedHours)} <span className="text-text-muted font-medium">/ {formatHoursDuration(subject.targetHours)}</span>
            </span>
          </div>
          
          <div className="h-2 w-full bg-surface-panel rounded-full overflow-hidden border border-border-subtle">
            <div 
              className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
              style={{ 
                width: `${Math.min(100, completionPercent)}%`,
                backgroundColor: subject.color,
              }}
            >
               {completionPercent > 0 && completionPercent < 100 && (
                 <div className="absolute inset-0 w-full h-full animate-[shimmer_2s_infinite]"
                      style={{
                        backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%)',
                      }}
                 />
               )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-panel/50 border border-border-subtle p-3">
          <div className="min-w-0 text-center">
            <div className="mb-1 flex items-center justify-center text-text-muted">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <p className="truncate text-sm font-bold text-text-primary">{formatHoursDuration(subject.totalHours)}</p>
            <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted">Total</p>
          </div>

          <div className="min-w-0 text-center border-x border-border-subtle">
            <div className="mb-1 flex items-center justify-center text-text-muted">
              <Target className="w-3.5 h-3.5" />
            </div>
            <p className="text-sm font-bold text-text-primary">{subject.sessionsCount}</p>
            <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted">Sessões</p>
          </div>

          <div className="min-w-0 text-center">
            <div className="mb-1 flex items-center justify-center text-text-muted">
              <Star className="w-3.5 h-3.5" style={{ color: subject.averageScore > 70 ? '#10b981' : subject.averageScore > 0 ? '#f59e0b' : undefined }} />
            </div>
            <p className="truncate text-sm font-bold text-text-primary">
              {subject.averageScore > 0 ? `${subject.averageScore}%` : '--'}
            </p>
            <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted">Acerto est.</p>
          </div>
        </div>
      </div>
      </Card>

      {/* MODAL DE DETALHES */}
      {mounted && createPortal(
        <AnimatePresence>
          {isDetailsOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={() => setIsDetailsOpen(false)}
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-surface-panel shadow-2xl"
              >
                <div 
                  className="h-2 w-full" 
                  style={{ backgroundColor: subject.color }} 
                />
                
                <div className="p-6">
                  {/* HEADER */}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm"
                        style={{ 
                          backgroundColor: `${subject.color}15`,
                          border: `1px solid ${subject.color}30`,
                        }}
                      >
                        <BookOpen className="h-7 w-7" style={{ color: subject.color }} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white mb-1">{subject.name}</h2>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[11px] font-bold rounded-md px-2 py-0.5"
                            style={{ backgroundColor: `${subject.color}20`, color: subject.color }}
                          >
                            Peso {subject.priority}
                          </span>
                          <span className="text-xs font-medium text-text-muted border border-white/10 rounded-md px-2 py-0.5">{difficultyLabel}</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      className="h-8 w-8 flex items-center justify-center rounded-full text-text-muted hover:text-white hover:bg-white/5 transition-colors"
                      onClick={() => setIsDetailsOpen(false)}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* METRICS GRID */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                      <div className="flex items-center gap-2 text-text-muted mb-2">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Tempo Estudado</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">{formatHoursDuration(subject.totalHours)}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                      <div className="flex items-center gap-2 text-text-muted mb-2">
                        <Target className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Meta Semanal</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-neon-cyan">{formatHoursDuration(subject.completedHours)}</span>
                        <span className="text-sm text-text-secondary">/ {formatHoursDuration(subject.targetHours)}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                      <div className="flex items-center gap-2 text-text-muted mb-2">
                        <BarChart2 className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Sessões Concluídas</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">{subject.sessionsCount}</span>
                        <span className="text-sm text-text-secondary">blocos</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                      <div className="flex items-center gap-2 text-text-muted mb-2">
                        <Star className="w-4 h-4" style={{ color: subject.averageScore > 70 ? '#10b981' : subject.averageScore > 0 ? '#f59e0b' : undefined }} />
                        <span className="text-xs font-semibold uppercase tracking-wider">Acerto Médio</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">
                          {subject.averageScore > 0 ? `${subject.averageScore}%` : '--'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* PROFICIENCY PREVIEW */}
                  <div className="rounded-xl border border-white/5 bg-gradient-to-br from-surface-panel to-black/40 p-4 relative overflow-hidden">
                    <div className="absolute right-0 top-0 bottom-0 w-32 opacity-10 pointer-events-none">
                      <TrendingUp className="w-full h-full" style={{ color: subject.color }} />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">Proficiência Técnica</h3>
                    <p className="text-xs text-text-secondary mb-3 max-w-[80%]">
                      Em breve, o algoritmo irá processar seu Índice de Prontidão baseado nas dificuldades das questões que você acerta.
                    </p>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full w-[0%]" style={{ backgroundColor: subject.color }} />
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="mt-6 flex gap-3">
                    <Button 
                      variant="primary" 
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDetailsOpen(false);
                        onEdit(subject);
                      }}
                      style={{ backgroundColor: subject.color, color: '#fff', border: 'none' }}
                    >
                      Editar Matéria
                    </Button>
                    <Button 
                      variant="secondary" 
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDetailsOpen(false);
                      }}
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
