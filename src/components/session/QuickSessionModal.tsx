'use client';

/**
 * QuickSessionModal Component
 * Modal para iniciar uma sessão de estudo rápida
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  Pause,
  Square,
  Clock,
  BookOpen,
  Sparkles,
  CheckCircle2,
  Coffee,
} from 'lucide-react';
import { cn, formatDuration, toLocalDateKey } from '@/lib/utils';
import { Button, Card, ProgressBar } from '@/components/ui';
import { useLocalStorage } from '@/hooks';
import { setClientStoreEntries } from '@/hooks/useLocalStorage';
import { reportCompletedSession, updateSessionSelfAssessment } from '@/lib/sessionSync';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import type { AnalyticsStore, Subject as FullSubject } from '@/types';

interface Subject {
  id: string;
  name: string;
  color: string;
}

interface QuickSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
}

type SessionState = 'setup' | 'running' | 'paused' | 'break' | 'completed';

export default function QuickSessionModal({
  isOpen,
  onClose,
  subjects,
}: QuickSessionModalProps) {
  const [fallbackSubjects, setFallbackSubjects] = useState<typeof subjects>([]);
  const [loadingFallbackSubjects, setLoadingFallbackSubjects] = useState(false);
  const effectiveSubjects = subjects.length > 0 ? subjects : fallbackSubjects;

  // Sem matérias no store local (ex.: preview hidrata depois), tenta buscar o
  // snapshot do servidor antes de declarar "vazio".
  useEffect(() => {
    if (!isOpen || subjects.length > 0 || fallbackSubjects.length > 0) return;
    let alive = true;
    setLoadingFallbackSubjects(true);
    fetch('/api/progress')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        const remote = data?.data?.nexora_subjects;
        if (Array.isArray(remote) && remote.length > 0) {
          setClientStoreEntries({ nexora_subjects: remote });
          setFallbackSubjects(remote as typeof subjects);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoadingFallbackSubjects(false);
      });
    return () => {
      alive = false;
    };
  }, [isOpen, subjects, fallbackSubjects.length]);

  const [sessionState, setSessionState] = useState<SessionState>('setup');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [duration, setDuration] = useState(25); // minutos
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  // FIX: o foco era uma constante 85 inventada. Agora ele começa `null` e é
  // derivado da aderência ao tempo planejado; o usuário pode registrar a
  // autoavaliação real ao concluir (chips abaixo).
  const [focusScore, setFocusScore] = useState<number | null>(null);
  /** Id da sessão no servidor, para refinar a autoavaliação de foco depois. */
  const serverSessionRef = useRef<{ id: string; subjectId: string; startedAt: string; plannedMinutes: number; actualMinutes: number } | null>(null);
  const sessionEndAtRef = useRef<number | null>(null);
  const persistedRef = useRef<string | null>(null);
  const [, setAnalytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', { daily: {} });
  const [, setAllSubjects] = useLocalStorage<FullSubject[]>('nexora_subjects', []);

  // Timer effect
  useEffect(() => {
    if (sessionState !== 'running') return;

    if (!sessionEndAtRef.current) {
      sessionEndAtRef.current = Date.now() + (Math.max(0, timeRemaining) * 1000);
    }

    const tick = () => {
      if (!sessionEndAtRef.current) return;
      const liveRemaining = Math.max(0, Math.ceil((sessionEndAtRef.current - Date.now()) / 1000));
      setTimeRemaining(liveRemaining);
      if (liveRemaining <= 0) {
        sessionEndAtRef.current = null;
        setSessionState('completed');
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [sessionState, timeRemaining]);

  useEffect(() => {
    if (!isOpen) {
      setShowExitConfirm(false);
    }
  }, [isOpen]);

  // Formatar tempo
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calcular progresso
  const progress = totalTime > 0 ? ((totalTime - timeRemaining) / totalTime) * 100 : 0;

  // Iniciar sessão
  const startSession = () => {
    if (!selectedSubject) return;
    const totalSeconds = duration * 60;
    setTotalTime(totalSeconds);
    setTimeRemaining(totalSeconds);
    sessionEndAtRef.current = Date.now() + (totalSeconds * 1000);
    setSessionState('running');
  };

  // Pausar/Continuar
  const togglePause = () => {
    if (sessionState === 'running') {
      if (sessionEndAtRef.current) {
        const liveRemaining = Math.max(0, Math.ceil((sessionEndAtRef.current - Date.now()) / 1000));
        setTimeRemaining(liveRemaining);
      }
      sessionEndAtRef.current = null;
      setSessionState('paused');
      return;
    }

    if (sessionState === 'paused') {
      sessionEndAtRef.current = Date.now() + (Math.max(0, timeRemaining) * 1000);
      setSessionState('running');
    }
  };

  // Parar sessão
  const stopSession = () => {
    sessionEndAtRef.current = null;
    setSessionState('completed');
  };

  // Resetar
  const resetSession = () => {
    sessionEndAtRef.current = null;
    persistedRef.current = null;
    setShowExitConfirm(false);
    setSessionState('setup');
    setSelectedSubject(null);
    setDuration(25);
    setTimeRemaining(0);
    setTotalTime(0);
    setFocusScore(null);
    serverSessionRef.current = null;
  };

  // Persistir conclusão uma única vez (evita XP duplicado / perda de dados)
  useEffect(() => {
    if (sessionState !== 'completed') return;
    if (!selectedSubject || totalTime <= 0) return;
    const persistKey = `${selectedSubject.id}-${totalTime}-${timeRemaining}`;
    if (persistedRef.current === persistKey) return;
    persistedRef.current = persistKey;

    const minutesStudied = Math.max(1, Math.floor((totalTime - timeRemaining) / 60));
    const hoursStudied = minutesStudied / 60;
    const todayKey = toLocalDateKey(new Date());
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - minutesStudied * 60_000);
    const planned = Math.max(1, Math.round(totalTime / 60));

    // Registra no servidor: alimenta XP/nível/streak, conquistas, notificações
    // ("você ainda não estudou hoje") e o relatório semanal. O foco ainda não
    // foi avaliado pelo usuário neste momento — o servidor deriva da aderência e
    // a autoavaliação (chips) é enviada depois via updateSessionSelfAssessment.
    void reportCompletedSession({
      subjectId: selectedSubject.id,
      startedAt,
      endedAt,
      plannedMinutes: planned,
      actualMinutes: minutesStudied,
      source: 'quick',
    }).then((sessionId) => {
      if (!sessionId) return;
      serverSessionRef.current = {
        id: sessionId,
        subjectId: selectedSubject.id,
        startedAt: startedAt.toISOString(),
        plannedMinutes: planned,
        actualMinutes: minutesStudied,
      };
    });

    setAnalytics((prev) => {
      const day = prev.daily[todayKey] || { hours: 0, sessions: 0 };
      return {
        ...prev,
        daily: {
          ...prev.daily,
          [todayKey]: {
            ...day,
            hours: Math.max(0, (day.hours || 0) + hoursStudied),
            sessions: (day.sessions || 0) + 1,
          },
        },
      };
    });
    setAllSubjects((prev) =>
      prev.map((s) =>
        s.id === selectedSubject.id
          ? {
              ...s,
              completedHours: Math.max(0, (s.completedHours || 0) + hoursStudied),
              totalHours: Math.max(0, (s.totalHours || 0) + hoursStudied),
              sessionsCount: (s.sessionsCount || 0) + 1,
            }
          : s
      )
    );
  }, [sessionState, selectedSubject, totalTime, timeRemaining, setAnalytics, setAllSubjects]);

  // Fechar modal
  const handleClose = () => {
    if (sessionState === 'running' || sessionState === 'paused') {
      setShowExitConfirm(true);
      return;
    }

    resetSession();
    onClose();
  };

  const confirmExitAndClose = () => {
    resetSession();
    onClose();
  };

  const studiedSeconds = Math.max(0, totalTime - timeRemaining);
  const studiedMinutes = Math.floor(studiedSeconds / 60);
  const plannedMinutes = Math.max(1, Math.round(totalTime / 60));
  const adherencePercent = Math.round(
    Math.min(1, studiedSeconds / Math.max(1, totalTime)) * 100
  );
  const displayFocusScore = focusScore ?? adherencePercent;

  // Calcular XP ganho
  const calculateXP = () => {
    return Math.floor(studiedMinutes * (displayFocusScore / 100) * 1.5);
  };

  const focusOptions = [
    { value: 30, label: 'Disperso' },
    { value: 60, label: 'Normal' },
    { value: 85, label: 'Focado' },
    { value: 100, label: 'Total' },
  ];

  const handleFocusSelfAssessment = (value: number) => {
    setFocusScore(value);
    const registered = serverSessionRef.current;
    if (!registered) return;
    updateSessionSelfAssessment({
      sessionId: registered.id,
      subjectId: registered.subjectId,
      startedAt: registered.startedAt,
      plannedMinutes: registered.plannedMinutes,
      actualMinutes: registered.actualMinutes,
      focusScore: value,
    });
  };

  const durationOptions = [15, 25, 45, 60, 90, 120];

  // A11y: Escape cancela a confirmação de saída quando ela está aberta;
  // caso contrário pede confirmação (mesmo comportamento do clique no fundo).
  const { dialogRef, dialogProps } = useDialogA11y({
    open: isOpen,
    onClose: showExitConfirm ? () => setShowExitConfirm(false) : handleClose,
    ariaLabel: 'Sessão rápida de estudo',
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialogRef}
          {...dialogProps}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="app-modal-overlay"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="app-modal-panel max-w-[360px] sm:max-w-xl lg:max-w-2xl"
          >
            <Card className="relative overflow-hidden" padding="none">
              <AnimatePresence>
                {showExitConfirm && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/90 p-4"
                    role="alertdialog"
                    aria-modal="true"
                    aria-label="Sair da sessão?"
                  >
                    <motion.div
                      initial={{ scale: 0.96, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.96, opacity: 0 }}
                      className="w-full max-w-sm rounded-2xl border border-card-border bg-card-bg p-5"
                    >
                      <h3 className="text-lg font-heading font-semibold text-white">Sair da sessão?</h3>
                      <p className="mt-2 text-sm text-text-secondary">
                        A sessão atual será perdida. Deseja continuar?
                      </p>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setShowExitConfirm(false)}>
                          Continuar estudando
                        </Button>
                        <Button variant="danger" onClick={confirmExitAndClose}>
                          Sair
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Header gradient */}
              <div
                className="h-2"
                style={{
                  background: selectedSubject
                    ? selectedSubject.color
                    : 'linear-gradient(90deg, #00B4FF, #7F00FF)',
                }}
              />

              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-text-muted hover:text-white transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-4 sm:p-8">
                {/* Setup State */}
                {sessionState === 'setup' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-8 h-8 text-neon-blue" />
                      </div>
                      <h2 className="text-2xl font-heading font-bold text-white mb-2">
                        Sessão Rápida
                      </h2>
                      <p className="text-text-secondary">
                        Configure e comece a estudar agora
                      </p>
                    </div>

                    {/* Seleção de Disciplina */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-text-secondary mb-3">
                        Escolha a disciplina
                      </label>
                      {effectiveSubjects.length === 0 && (
                        <div className="rounded-xl border border-card-border bg-card-bg p-4 text-center">
                          <p className="text-sm text-text-secondary">
                            {loadingFallbackSubjects ? 'Carregando matérias…' : 'Nenhuma matéria cadastrada ainda.'}
                          </p>
                          {!loadingFallbackSubjects && (
                            <Button
                              variant="secondary"
                              className="mt-3"
                              onClick={() => {
                                onClose();
                                window.location.assign('/subjects');
                              }}
                            >
                              Adicionar matérias
                            </Button>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {effectiveSubjects.map((subject) => (
                          <button
                            key={subject.id}
                            onClick={() => setSelectedSubject(subject)}
                            className={cn(
                              'p-3 rounded-xl border text-left transition-all',
                              selectedSubject?.id === subject.id
                                ? 'border-neon-blue bg-neon-blue/10'
                                : 'border-card-border bg-card-bg hover:border-neon-blue/50'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: subject.color }}
                              />
                              <span className="text-sm text-white truncate">
                                {subject.name}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Seleção de Duração */}
                    <div className="mb-8">
                      <label className="block text-sm font-medium text-text-secondary mb-3">
                        Duração da sessão
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {durationOptions.map((mins) => (
                          <button
                            key={mins}
                            onClick={() => setDuration(mins)}
                            className={cn(
                              'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                              duration === mins
                                ? 'bg-neon-purple text-white'
                                : 'bg-card-bg border border-card-border text-text-secondary hover:border-neon-purple/50'
                            )}
                          >
                            {formatDuration(mins)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Botão Iniciar */}
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={startSession}
                      disabled={!selectedSubject}
                      leftIcon={<Play className="w-4 h-4" />}
                    >
                      Iniciar Sessão
                    </Button>
                  </motion.div>
                )}

                {/* Running/Paused State */}
                {(sessionState === 'running' || sessionState === 'paused') && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center"
                  >
                    {/* Disciplina */}
                    <div className="flex items-center justify-center gap-2 mb-6">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: selectedSubject?.color }}
                      />
                      <span className="text-lg text-white font-medium">
                        {selectedSubject?.name}
                      </span>
                    </div>

                    {/* Timer */}
                    <div className="relative mb-8">
                      {/* Circle progress */}
                      <svg className="w-40 h-40 sm:w-48 sm:h-48 mx-auto" viewBox="0 0 200 200">
                        {/* Background circle */}
                        <circle
                          cx="100"
                          cy="100"
                          r="90"
                          fill="none"
                          stroke="rgba(0, 180, 255, 0.1)"
                          strokeWidth="8"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="100"
                          cy="100"
                          r="90"
                          fill="none"
                          stroke="url(#timerGradient)"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${progress * 5.65} 565`}
                          transform="rotate(-90 100 100)"
                        />
                        <defs>
                          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#00B4FF" />
                            <stop offset="100%" stopColor="#7F00FF" />
                          </linearGradient>
                        </defs>
                      </svg>

                      {/* Time display */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl sm:text-5xl font-heading font-bold text-white">
                          {formatTime(timeRemaining)}
                        </span>
                        <span className="text-sm text-text-secondary mt-2">
                          {sessionState === 'paused' ? 'Pausado' : 'restantes'}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    {sessionState === 'paused' && (
                      <div className="mb-6 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                        <p className="text-sm text-yellow-400">
                          ⏸️ Sessão pausada
                        </p>
                      </div>
                    )}

                    {/* Controls */}
                    <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <Button
                        variant="secondary"
                        onClick={stopSession}
                        leftIcon={<Square className="w-4 h-4" />}
                      >
                        Parar
                      </Button>
                      <Button
                        variant="primary"
                        onClick={togglePause}
                        leftIcon={
                          sessionState === 'paused' ? (
                            <Play className="w-4 h-4" />
                          ) : (
                            <Pause className="w-4 h-4" />
                          )
                        }
                      >
                        {sessionState === 'paused' ? 'Continuar' : 'Pausar'}
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Completed State */}
                {sessionState === 'completed' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center"
                  >
                    <div className="w-20 h-20 rounded-full bg-neon-cyan/20 flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="w-10 h-10 text-neon-cyan" />
                    </div>

                    <h2 className="text-2xl font-heading font-bold text-white mb-2">
                      Sessão Concluída! 🎉
                    </h2>
                    <p className="text-text-secondary mb-8">
                      Ótimo trabalho! Continue assim.
                    </p>

                    {/* Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
                      <div className="p-4 rounded-xl bg-card-bg border border-card-border">
                        <Clock className="w-5 h-5 text-neon-blue mx-auto mb-2" />
                        <p className="text-xl font-bold text-white">
                          {formatDuration(Math.floor((totalTime - timeRemaining) / 60))}
                        </p>
                        <p className="text-xs text-text-muted">Estudado</p>
                      </div>
                      <div className="p-4 rounded-xl bg-card-bg border border-card-border">
                        <Sparkles className="w-5 h-5 text-neon-purple mx-auto mb-2" />
                        <p className="text-xl font-bold text-white">
                          +{calculateXP()}
                        </p>
                        <p className="text-xs text-text-muted">XP Ganho</p>
                      </div>
                      <div className="p-4 rounded-xl bg-card-bg border border-card-border">
                        <BookOpen className="w-5 h-5 text-neon-cyan mx-auto mb-2" />
                        <p className="text-xl font-bold text-white">
                          {displayFocusScore}%
                        </p>
                        <p className="text-xs text-text-muted">Foco</p>
                      </div>
                    </div>

                    {/* Autoavaliação de foco (substitui o valor fixo de 85%) */}
                    <div className="mb-8">
                      <p className="text-sm text-text-secondary mb-3">
                        Como foi seu foco nesta sessão?
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {focusOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleFocusSelfAssessment(option.value)}
                            aria-pressed={focusScore === option.value}
                            className={cn(
                              'px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                              focusScore === option.value
                                ? 'border-neon-cyan bg-neon-cyan/20 text-neon-cyan'
                                : 'border-card-border bg-card-bg text-text-secondary hover:border-neon-cyan/50'
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-text-muted mt-2">
                        {focusScore === null
                          ? `Sem avaliação, usamos a aderência ao tempo planejado (${adherencePercent}%).`
                          : 'Sua avaliação foi registrada junto com a sessão.'}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={handleClose}
                      >
                        Fechar
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={resetSession}
                        leftIcon={<Play className="w-4 h-4" />}
                      >
                        Nova Sessão
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
