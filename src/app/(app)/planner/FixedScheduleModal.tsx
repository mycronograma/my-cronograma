'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, RefreshCw, AlertTriangle, Calendar, Layers } from 'lucide-react';
import { Subject, StudyPreferences, UserSettings } from '@/types';
import { generateWeeklyTemplate } from '@/services/roadmapEngine';
import { resolveScheduleConstraints } from '@/services/scheduleConstraints';
import { getWeekStart } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface FixedScheduleModalProps {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  studyPrefs: StudyPreferences;
  userSettings: UserSettings;
  onSave: (prefs: StudyPreferences) => void;
}

const WEEKDAYS = [
  { key: 'dom', label: 'Domingo' },
  { key: 'seg', label: 'Segunda' },
  { key: 'ter', label: 'Terça' },
  { key: 'qua', label: 'Quarta' },
  { key: 'qui', label: 'Quinta' },
  { key: 'sex', label: 'Sexta' },
  { key: 'sab', label: 'Sábado' },
];

export function FixedScheduleModal({
  open,
  onClose,
  subjects,
  studyPrefs,
  userSettings,
  onSave,
}: FixedScheduleModalProps) {
  const [scheduleMode, setScheduleMode] = useState<'dynamic' | 'fixed_weekly'>(
    studyPrefs.scheduleMode || 'dynamic'
  );

  const [weeklyTemplate, setWeeklyTemplate] = useState<Record<string, string[]>>({
    dom: [], seg: [], ter: [], qua: [], qui: [], sex: [], sab: []
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [activeDay, setActiveDay] = useState<string>('seg');

  useEffect(() => {
    if (open) {
      setScheduleMode(studyPrefs.scheduleMode || 'dynamic');
      setWeeklyTemplate(studyPrefs.weeklyTemplate || {
        dom: [], seg: [], ter: [], qua: [], qui: [], sex: [], sab: []
      });
    }
  }, [open, studyPrefs]);

  const dialogA11y = useDialogA11y({
    open,
    onClose,
    ariaLabel: 'Configurar Rotina Fixa',
  });

  const handleGenerateTemplate = async () => {
    setIsGenerating(true);
    // Simular delay pra UX
    await new Promise((r) => setTimeout(r, 500));
    
    try {
      const startDate = getWeekStart(new Date());
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      
      const constraints = resolveScheduleConstraints({
        userSettings,
        studyPrefs,
        startDate,
        endDate,
        dailyLimitsOverride: {},
      });

      const template = generateWeeklyTemplate({
        subjects,
        preferences: studyPrefs,
        startDate,
        endDate,
        preferredStart: constraints.preferredStart,
        preferredEnd: constraints.preferredEnd,
        maxBlockMinutes: constraints.maxBlockMinutes,
        breakMinutes: constraints.breakMinutes,
        restDays: constraints.restDays,
        dailyLimitByDate: constraints.dailyLimitByDate,
        dailyTimeWindowByDate: constraints.dailyTimeWindowByDate,
        firstCycleAllSubjects: true,
        completedLessonsTotal: 0,
        completedLessonsBySubject: {},
        completedPracticeTotal: 0,
        completedPracticeBySubject: {},
        simuladoRules: constraints.simuladoRules,
        enableScheduleCache: false,
        debug: false,
      });
      setWeeklyTemplate(template);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar rotina sugerida.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddSubjectToDay = (dayKey: string, subjectId: string) => {
    setWeeklyTemplate((prev) => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] || []), subjectId],
    }));
  };

  const handleRemoveSubjectFromDay = (dayKey: string, index: number) => {
    setWeeklyTemplate((prev) => {
      const list = [...(prev[dayKey] || [])];
      list.splice(index, 1);
      return { ...prev, [dayKey]: list };
    });
  };

  const handleMoveSubjectInDay = (dayKey: string, index: number, direction: 'up' | 'down') => {
    setWeeklyTemplate((prev) => {
      const list = [...(prev[dayKey] || [])];
      if (direction === 'up' && index > 0) {
        [list[index - 1], list[index]] = [list[index], list[index - 1]];
      } else if (direction === 'down' && index < list.length - 1) {
        [list[index + 1], list[index]] = [list[index], list[index + 1]];
      }
      return { ...prev, [dayKey]: list };
    });
  };

  const activeSubjects = useMemo(() => subjects.filter((s) => s.isActive), [subjects]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        ref={dialogA11y.dialogRef}
        {...dialogA11y.dialogProps}
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30 }}
          className="bg-card-bg rounded-3xl border border-card-border w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 pb-0 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-neon-purple/15 border border-neon-purple/20 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-neon-purple" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-text-primary">Estratégia do Cronograma</h3>
                <p className="text-xs text-text-muted">Defina como a IA deve preencher sua semana</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-surface-panel hover:bg-card-border text-text-muted hover:text-text-primary transition-colors flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            {/* Mode Toggle */}
            <div className="flex bg-surface-panel rounded-xl p-1 mb-6 border border-card-border">
              <button
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
                  scheduleMode === 'dynamic'
                    ? 'bg-card-bg text-neon-purple shadow-sm border border-neon-purple/20'
                    : 'text-text-muted hover:text-text-primary hover:bg-black/5'
                )}
                onClick={() => setScheduleMode('dynamic')}
              >
                <RefreshCw className="h-4 w-4" />
                Dinâmico (IA Adapta)
              </button>
              <button
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
                  scheduleMode === 'fixed_weekly'
                    ? 'bg-card-bg text-neon-cyan shadow-sm border border-neon-cyan/20'
                    : 'text-text-muted hover:text-text-primary hover:bg-black/5'
                )}
                onClick={() => setScheduleMode('fixed_weekly')}
              >
                <Layers className="h-4 w-4" />
                Grade Fixa (Rotina Semanal)
              </button>
            </div>

            {scheduleMode === 'dynamic' ? (
              <div className="rounded-xl border border-card-border bg-surface-panel p-5 text-sm text-text-secondary">
                <p className="mb-2"><strong className="text-text-primary">Recomendado:</strong> No modo Dinâmico, a Inteligência Artificial calcula diariamente qual matéria você mais precisa estudar, com base no seu desempenho, nas revisões espaçadas pendentes e no peso pro ENEM/Vestibular.</p>
                <p>Sua semana será diferente a cada geração para maximizar sua nota.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full border border-card-border rounded-xl bg-surface-panel p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <p className="text-sm text-text-secondary">
                    Defina exatamente quais matérias você vai estudar em cada dia da semana. A IA respeitará essa ordem sempre, alterando apenas a Fase (Teoria vs Exercícios) de acordo com seu avanço.
                  </p>
                  <button
                    onClick={handleGenerateTemplate}
                    disabled={isGenerating}
                    className="shrink-0 px-4 py-2 rounded-xl bg-neon-cyan/15 hover:bg-neon-cyan/25 text-neon-cyan text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className={cn("h-4 w-4", isGenerating && "animate-spin")} />
                    Gerar Molde Sugerido
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-4">
                  {/* Sidebar Dias da Semana */}
                  <div className="w-full lg:w-48 flex flex-row lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0 shrink-0">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.key}
                        onClick={() => setActiveDay(day.key)}
                        className={cn(
                          'px-4 py-3 rounded-xl text-sm font-semibold transition-all shrink-0 lg:w-full text-left',
                          activeDay === day.key
                            ? 'bg-card-bg border border-card-border text-neon-cyan shadow-sm'
                            : 'bg-transparent text-text-muted hover:bg-card-bg/50 hover:text-text-primary'
                        )}
                      >
                        {day.label}
                        {weeklyTemplate[day.key]?.length > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center bg-black/20 rounded-full h-5 px-2 text-[10px] font-bold">
                            {weeklyTemplate[day.key].length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Area Central: Lista do Dia Ativo */}
                  <div className="flex-1 min-w-0 bg-card-bg rounded-xl border border-card-border p-4 flex flex-col gap-4">
                    <h4 className="font-bold text-text-primary border-b border-card-border pb-2">
                      {WEEKDAYS.find(w => w.key === activeDay)?.label}
                    </h4>

                    {/* Lista das matérias no dia */}
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {(!weeklyTemplate[activeDay] || weeklyTemplate[activeDay].length === 0) ? (
                        <div className="py-8 text-center text-sm text-text-muted border border-dashed border-card-border rounded-xl">
                          Nenhuma matéria para este dia.
                        </div>
                      ) : (
                        weeklyTemplate[activeDay].map((subjectId, index) => {
                          const s = activeSubjects.find((s) => s.id === subjectId);
                          if (!s) return null;
                          return (
                            <div key={`${subjectId}-${index}`} className="flex items-center justify-between p-3 rounded-xl border border-card-border bg-surface-panel group">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-text-muted w-4">{index + 1}.</span>
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                                <span className="font-semibold text-sm" style={{ color: s.color }}>{s.name}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleMoveSubjectInDay(activeDay, index, 'up')}
                                  disabled={index === 0}
                                  className="p-1 rounded hover:bg-black/10 disabled:opacity-30"
                                  title="Mover para cima"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => handleMoveSubjectInDay(activeDay, index, 'down')}
                                  disabled={index === weeklyTemplate[activeDay].length - 1}
                                  className="p-1 rounded hover:bg-black/10 disabled:opacity-30"
                                  title="Mover para baixo"
                                >
                                  ↓
                                </button>
                                <button
                                  onClick={() => handleRemoveSubjectFromDay(activeDay, index)}
                                  className="p-1.5 rounded hover:bg-red-500/10 text-text-muted hover:text-red-500 ml-1 transition-colors"
                                  title="Remover"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Adicionar ao dia */}
                    <div className="pt-3 border-t border-card-border">
                      <p className="text-xs font-semibold text-text-muted mb-2">Adicionar matéria neste dia:</p>
                      <div className="flex flex-wrap gap-2">
                        {activeSubjects.map(s => (
                          <button
                            key={s.id}
                            onClick={() => handleAddSubjectToDay(activeDay, s.id)}
                            className="px-3 py-1.5 rounded-lg border border-card-border bg-card-bg hover:border-current text-xs font-medium transition-colors"
                            style={{ '--tw-border-opacity': 1 } as any}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = s.color)}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--card-border)')}
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                              {s.name}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-warning bg-warning-soft p-3 text-xs text-warning-strong flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p>Lembre-se: se uma matéria não for incluída em nenhum dia, ela não aparecerá nos seus cronogramas ao usar o modo de Grade Fixa.</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-card-border flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-card-border bg-surface-panel hover:bg-card-bg text-text-secondary font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onSave({
                  ...studyPrefs,
                  scheduleMode,
                  weeklyTemplate,
                });
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 text-white font-semibold flex items-center gap-2 shadow-lg shadow-violet-600/20"
            >
              <Save className="h-4 w-4" />
              Salvar Estratégia
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
