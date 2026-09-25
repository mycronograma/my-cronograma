'use client';

/**
 * StudyBlockSessionModal Component
 * Cronometro dedicado para um bloco de estudo
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X, Play, Pause, CheckCircle2, Coffee, SkipForward } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import type { StudyBlock, UserSettings } from '@/types';
import { useLocalStorage } from '@/hooks';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { defaultSettings } from '@/lib/defaultSettings';

function ProgressRing({ radius, stroke, progress, color }: {
  radius: number; stroke: number; progress: number; color: string;
}) {
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const offset = circumference - progress * circumference;
  return (
    <svg height={radius * 2} width={radius * 2} className="absolute inset-0 -rotate-90"
      style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}>
      <circle stroke="rgba(255,255,255,0.06)" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
      <circle stroke={color} fill="transparent" strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset} strokeLinecap="round"
        r={normalizedRadius} cx={radius} cy={radius}
        style={{ transition: 'stroke-dashoffset 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
    </svg>
  );
}

interface StudyBlockSessionModalProps {
  isOpen: boolean;
  block: StudyBlock | null;
  onClose: () => void;
  onComplete?: (
    blockId: string,
    minutesSpent: number,
    performance?: { correctAnswers?: number; totalQuestions?: number }
  ) => void;
}

type SessionState = 'ready' | 'running' | 'paused' | 'completed';
type SessionTimerSnapshot = {
  remaining: number;
  state: SessionState;
  runningUntil?: number | null;
  savedAt?: number;
};

export default function StudyBlockSessionModal({
  isOpen,
  block,
  onClose,
  onComplete,
}: StudyBlockSessionModalProps) {
  const totalSeconds = block ? block.durationMinutes * 60 : 0;
  const [timeRemaining, setTimeRemaining] = useState(totalSeconds);
  const [sessionState, setSessionState] = useState<SessionState>('ready');
  const [completedOnce, setCompletedOnce] = useState(false);
  const [totalQuestionsValue, setTotalQuestionsValue] = useState('');
  const [correctAnswersValue, setCorrectAnswersValue] = useState('');
  const [mounted, setMounted] = useState(false);
  const [timers, setTimers] = useLocalStorage<Record<string, SessionTimerSnapshot>>(
    'nexora_session_timers',
    {}
  );
  const [userSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);
  const timersRef = useRef(timers);
  const initialTotalRef = useRef(totalSeconds);
  const runningUntilRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !block) return;
    initialTotalRef.current = totalSeconds;
    const saved = timersRef.current[block.id];
    if (saved && saved.remaining > 0) {
      const nextState: SessionState = saved.state === 'completed' ? 'ready' : saved.state;
      if (nextState === 'running') {
        const fallbackRunningUntil = (saved.savedAt || Date.now()) + (saved.remaining * 1000);
        runningUntilRef.current =
          typeof saved.runningUntil === 'number' ? saved.runningUntil : fallbackRunningUntil;
        const liveRemaining = Math.max(0, Math.ceil((runningUntilRef.current - Date.now()) / 1000));
        setTimeRemaining(liveRemaining);
        setSessionState('running');
      } else {
        runningUntilRef.current = null;
        setTimeRemaining(saved.remaining);
        setSessionState(nextState);
      }
    } else {
      runningUntilRef.current = null;
      setTimeRemaining(totalSeconds);
      setSessionState('ready');
    }
    setCompletedOnce(false);
    setTotalQuestionsValue('');
    setCorrectAnswersValue('');
  }, [isOpen, totalSeconds, block]);

  useEffect(() => {
    if (!block) return;
    const runningUntil =
      sessionState === 'running'
        ? (runningUntilRef.current ?? (Date.now() + (timeRemaining * 1000)))
        : null;
    if (sessionState === 'running') {
      runningUntilRef.current = runningUntil;
    }
    setTimers((prev) => ({
      ...prev,
      [block.id]: { remaining: timeRemaining, state: sessionState, runningUntil, savedAt: Date.now() },
    }));
  }, [block, timeRemaining, sessionState, setTimers]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return { mins: String(mins).padStart(2, '0'), secs: String(secs).padStart(2, '0') };
  };

  const ensureAudioContext = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioRef.current.state === 'suspended') {
        audioRef.current.resume();
      }
    } catch (error) {
      console.warn('Erro ao preparar audio:', error);
    }
  }, []);

  const playAlarm = useCallback(() => {
    try {
      ensureAudioContext();
      if (!audioRef.current) return;
      const context = audioRef.current;
      const now = context.currentTime;
      const sound = userSettings.alarmSound || 'pulse';

      const scheduleBeep = (start: number, duration: number, freq: number, type: OscillatorType) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      };

      if (sound === 'beep') {
        const duration = 1.0;
        const gap = 0.25;
        const repeats = 4; // ~5s total
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * (duration + gap);
          scheduleBeep(start, duration, 880, 'sine');
        }
        return;
      }

      if (sound === 'chime') {
        const cycle = 0.9;
        const repeats = 6; // ~5.4s total
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * cycle;
          scheduleBeep(start, 0.35, 880, 'sine');
          scheduleBeep(start + 0.4, 0.45, 660, 'sine');
        }
        return;
      }

      if (sound === 'soft') {
        const duration = 0.25;
        const gap = 0.15;
        const repeats = 12; // ~4.8s + tail
        for (let i = 0; i < repeats; i += 1) {
          const start = now + i * (duration + gap);
          scheduleBeep(start, duration, 520, 'sine');
        }
        return;
      }

      // pulse (default)
      const beepDuration = 0.24;
      const gap = 0.08;
      const repeats = 16; // ~5.1s
      for (let i = 0; i < repeats; i += 1) {
        const start = now + i * (beepDuration + gap);
        scheduleBeep(start, beepDuration, 880, 'square');
      }
    } catch (error) {
      console.warn('Erro ao tocar alarme:', error);
    }
  }, [ensureAudioContext, userSettings.alarmSound]);

  const buildPerformancePayload = useCallback(() => {
    const totalQuestions = Number(totalQuestionsValue);
    const correctAnswers = Number(correctAnswersValue);
    if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return undefined;
    const safeTotal = Math.max(1, Math.round(totalQuestions));
    return {
      totalQuestions: safeTotal,
      correctAnswers: Number.isFinite(correctAnswers)
        ? Math.min(safeTotal, Math.max(0, Math.round(correctAnswers)))
        : undefined,
    };
  }, [correctAnswersValue, totalQuestionsValue]);

  const finishSession = useCallback(
    (spentSeconds: number, mode: 'auto' | 'manual' = 'manual') => {
      if (completedOnce) return;
      runningUntilRef.current = null;
      const minutesSpent =
        mode === 'auto'
          ? Math.max(1, block?.durationMinutes || 0)
          : Math.max(1, Math.round(spentSeconds / 60));
      setCompletedOnce(true);
      setSessionState('completed');
      playAlarm();
      if (block && onComplete) {
        onComplete(block.id, minutesSpent, buildPerformancePayload());
      }
      setTimeout(() => {
        onClose();
      }, 400);
    },
    [completedOnce, block, onComplete, onClose, playAlarm, buildPerformancePayload]
  );

  const startOrResumeSession = useCallback(() => {
    ensureAudioContext();
    runningUntilRef.current = Date.now() + (Math.max(0, timeRemaining) * 1000);
    setSessionState('running');
  }, [ensureAudioContext, timeRemaining]);

  const pauseOrResumeSession = useCallback(() => {
    if (sessionState === 'running') {
      if (runningUntilRef.current) {
        const liveRemaining = Math.max(0, Math.ceil((runningUntilRef.current - Date.now()) / 1000));
        setTimeRemaining(liveRemaining);
      }
      runningUntilRef.current = null;
      setSessionState('paused');
      return;
    }

    if (sessionState === 'paused') {
      runningUntilRef.current = Date.now() + (Math.max(0, timeRemaining) * 1000);
      setSessionState('running');
    }
  }, [sessionState, timeRemaining]);

  useEffect(() => {
    if (sessionState !== 'running') return;

    if (!runningUntilRef.current) {
      runningUntilRef.current = Date.now() + (Math.max(0, timeRemaining) * 1000);
    }

    const tick = () => {
      if (!runningUntilRef.current) return;
      const liveRemaining = Math.max(0, Math.ceil((runningUntilRef.current - Date.now()) / 1000));
      setTimeRemaining(liveRemaining);
      if (liveRemaining <= 0) {
        finishSession(initialTotalRef.current, 'auto');
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [sessionState, timeRemaining, finishSession]);

  // A11y: role/aria-modal, Escape e prisão de foco (antes era só uma div).
  // Precisa vir antes do early return para respeitar as regras dos hooks.
  const { dialogRef, dialogProps } = useDialogA11y({
    open: isOpen && Boolean(block) && mounted,
    onClose,
    ariaLabel: 'Sessão de estudo',
  });

  if (!isOpen || !block || !mounted) return null;

  const subjectName = block.isBreak ? 'Intervalo' : block.subject?.name || 'Sessão de Estudo';
  const subjectColor = block.isBreak ? '#06b6d4' : (block.subject?.color || '#8b5cf6');
  const progress = totalSeconds > 0 ? timeRemaining / totalSeconds : 0;
  const { mins, secs } = formatTimer(timeRemaining);
  const isWarning = progress < 0.2 && sessionState === 'running';
  const accentColor = sessionState === 'completed' ? '#10b981' : isWarning ? '#f59e0b' : subjectColor;
  const canTrackQuestions =
    !block.isBreak &&
    (block.type === 'EXERCICIOS' || block.type === 'SIMULADO_AREA' || block.type === 'SIMULADO_COMPLETO' ||
      block.sessionType === 'pratica' || block.sessionType === 'simulado');
  const RING_RADIUS = 110;
  const RING_STROKE = 8;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={dialogRef}
        {...dialogProps}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10020] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm overflow-hidden rounded-3xl border shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(15,15,30,0.98) 0%, rgba(10,10,25,0.98) 100%)',
            borderColor: `${accentColor}30`,
            boxShadow: `0 0 60px ${accentColor}20, 0 25px 50px rgba(0,0,0,0.5)`,
          }}
        >
          {/* Ambient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl opacity-25 pointer-events-none"
            style={{ background: accentColor }} />

          {/* Close */}
          <button onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-6 pt-8 pb-6 flex flex-col items-center gap-5">
            {/* Subject pill */}
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-bold"
              style={{ backgroundColor: `${accentColor}18`, borderColor: `${accentColor}40`, color: accentColor }}>
              {block.isBreak
                ? <Coffee className="h-3.5 w-3.5" />
                : <div className={cn('w-2 h-2 rounded-full', sessionState === 'running' && 'animate-pulse')} style={{ backgroundColor: accentColor }} />}
              {subjectName}
            </div>

            {/* Ring + timer */}
            <div className="relative flex items-center justify-center" style={{ width: RING_RADIUS * 2, height: RING_RADIUS * 2 }}>
              <ProgressRing radius={RING_RADIUS} stroke={RING_STROKE} progress={progress} color={accentColor} />
              <div className="relative z-10 flex flex-col items-center gap-1">
                <AnimatePresence mode="wait">
                  {sessionState === 'completed' ? (
                    <motion.div key="done" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                      <span className="text-sm font-bold text-emerald-400">Concluído!</span>
                    </motion.div>
                  ) : (
                    <motion.div key="timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
                      <div className="font-mono font-black leading-none tracking-tight tabular-nums select-none"
                        style={{ fontSize: '3.8rem', color: accentColor, transition: 'color 0.5s ease' }}>
                        {mins}<span className="opacity-50 mx-0.5" style={{ fontSize: '2.8rem' }}>:</span>{secs}
                      </div>
                      <span className="text-[10px] text-white/30 mt-1.5 font-medium uppercase tracking-[0.2em]">
                        {sessionState === 'paused' ? '⏸ pausado' : sessionState === 'running' ? 'restante' : 'planejado'}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <p className="text-[11px] text-white/25 -mt-2 font-medium">{formatDuration(block.durationMinutes)} planejado</p>

            {/* Question tracking */}
            {canTrackQuestions && sessionState !== 'completed' && (
              <div className="w-full grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                <label className="min-w-0">
                  <span className="mb-1.5 block text-[11px] text-white/40 font-medium">Questões feitas</span>
                  <input type="number" min="0" step="1" inputMode="numeric" value={totalQuestionsValue}
                    onChange={(e) => setTotalQuestionsValue(e.target.value)}
                    className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
                    placeholder="Ex: 20" />
                </label>
                <label className="min-w-0">
                  <span className="mb-1.5 block text-[11px] text-white/40 font-medium">Acertos</span>
                  <input type="number" min="0" step="1" inputMode="numeric" value={correctAnswersValue}
                    onChange={(e) => setCorrectAnswersValue(e.target.value)}
                    className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
                    placeholder="Ex: 14" />
                </label>
              </div>
            )}

            {/* Buttons */}
            <div className="w-full space-y-2">
              {sessionState === 'ready' && (
                <div className="flex gap-2">
                  <button onClick={onClose}
                    className="flex-1 h-12 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 text-sm font-semibold transition-all">
                    Fechar
                  </button>
                  <button onClick={startOrResumeSession}
                    className="flex-[2] h-12 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-95"
                    style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}bb 100%)`, boxShadow: `0 8px 24px ${accentColor}40` }}>
                    <Play className="h-4 w-4 fill-current" /> Iniciar Sessão
                  </button>
                </div>
              )}
              {(sessionState === 'running' || sessionState === 'paused') && (
                <div className="flex gap-2">
                  <button onClick={() => finishSession(initialTotalRef.current - timeRemaining, 'manual')}
                    className="flex-1 h-12 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 text-sm font-semibold transition-all flex items-center justify-center gap-1.5">
                    <SkipForward className="h-3.5 w-3.5" /> Concluir
                  </button>
                  <button onClick={pauseOrResumeSession}
                    className="flex-[2] h-12 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-95"
                    style={sessionState === 'running'
                      ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }
                      : { background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}bb 100%)`, boxShadow: `0 8px 24px ${accentColor}40` }}>
                    {sessionState === 'running'
                      ? <><Pause className="h-4 w-4 fill-current" /> Pausar</>
                      : <><Play className="h-4 w-4 fill-current" /> Continuar</>}
                  </button>
                </div>
              )}
              {sessionState === 'completed' && (
                <button onClick={onClose}
                  className="w-full h-12 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 8px 24px rgba(16,185,129,0.4)' }}>
                  <CheckCircle2 className="h-4 w-4" /> Fechar
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
