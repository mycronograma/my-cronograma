'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, ArrowRight, ArrowLeft, Check, CalendarDays, Clock, Hourglass, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type {
  AIDifficulty,
  HardSubjectsPeriodPreference,
  PresetWizardAnswers,
  StudyPreferences,
  StudyStylePreference,
  UserSettings,
  WeekdayKey,
} from '@/types';
import { computeStudyPreferences } from '@/services/presetConfigurator';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { cn, formatDuration, timeToMinutes } from '@/lib/utils';

interface PresetConfigWizardProps {
  isOpen: boolean;
  presetId: string;
  presetName: string;
  baseSettings: UserSettings;
  onClose: () => void;
  onApply: (settings: UserSettings, studyPrefs: StudyPreferences, answers: PresetWizardAnswers) => void;
}

const STEP_TITLES = ['Disponibilidade', 'Blocos', 'Dificuldade', 'Estilo', 'Prova'] as const;
const DAY_OPTIONS: { label: string; value: number; key: WeekdayKey }[] = [
  { label: 'Dom', value: 0, key: 'dom' },
  { label: 'Seg', value: 1, key: 'seg' },
  { label: 'Ter', value: 2, key: 'ter' },
  { label: 'Qua', value: 3, key: 'qua' },
  { label: 'Qui', value: 4, key: 'qui' },
  { label: 'Sex', value: 5, key: 'sex' },
  { label: 'Sáb', value: 6, key: 'sab' },
];
const FOCUS_OPTIONS = [30, 45, 50, 60, 90] as const;
const BREAK_OPTIONS = [5, 10, 15] as const;
const QUICK_HOURS = [2, 3, 4, 5, 6] as const;

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0 } };

const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const clampHours = (v: number) => Math.min(12, Math.max(0, Math.round(v * 2) / 2));
const timeToMinutesSafe = (t: string) => (t ? timeToMinutes(t) : 0);
const isValidWindow = (start: string, end: string) => Boolean(start && end && timeToMinutesSafe(end) > timeToMinutesSafe(start));
const windowHours = (start: string, end: string) => {
  if (!isValidWindow(start, end)) return null;
  return clampHours((timeToMinutesSafe(end) - timeToMinutesSafe(start)) / 60);
};

const WEEKDAY_KEYS: WeekdayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const TOTAL_HOURS_QUICK = [20, 40, 60, 100, 200] as const;
const formatTotalHours = (v: number) => `${Math.round(v * 10) / 10}h`;

/**
 * Modo "por horas": deriva a data de fim caminhando dia a dia a partir do início
 * e abatendo as horas líquidas de cada dia da semana até quitar a carga total.
 * Assim o restante do fluxo (planner, range) continua recebendo startDate/endDate.
 */
const deriveEndDateFromHours = (
  startKey: string,
  totalHours: number,
  dailyHours: Record<WeekdayKey, number>
): string => {
  const start = new Date(`${startKey}T00:00:00`);
  const base = Number.isNaN(start.getTime()) ? new Date() : start;
  const weekly = WEEKDAY_KEYS.reduce((acc, k) => acc + (dailyHours[k] || 0), 0);
  if (!(totalHours > 0) || weekly <= 0) {
    const fallback = new Date(base);
    fallback.setDate(fallback.getDate() + 6);
    return toDateKey(fallback);
  }
  let remaining = totalHours;
  const cursor = new Date(base);
  for (let i = 0; i < 730; i += 1) {
    const dayHours = dailyHours[WEEKDAY_KEYS[cursor.getDay()]] || 0;
    if (dayHours > 0) {
      remaining -= dayHours;
      if (remaining <= 0.001) return toDateKey(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return toDateKey(cursor);
};

const defaultDailyHours = (goal: PresetWizardAnswers['goal']): Record<WeekdayKey, number> => {
  if (goal === 'medicina') return { dom: 0, seg: 5, ter: 5, qua: 5, qui: 5, sex: 5, sab: 3 };
  if (goal === 'enem' || goal === 'concurso') return { dom: 0, seg: 4, ter: 4, qua: 4, qui: 4, sex: 4, sab: 2 };
  return { dom: 0, seg: 3, ter: 3, qua: 3, qui: 3, sex: 3, sab: 2 };
};

const resolveGoal = (presetId: string, presetName: string): PresetWizardAnswers['goal'] => {
  const s = `${presetId} ${presetName}`.toLowerCase();
  if (s.includes('enem')) return 'enem';
  if (s.includes('med')) return 'medicina';
  if (s.includes('conc')) return 'concurso';
  return 'outros';
};

const buildDefaultAnswers = (presetId: string, presetName: string, baseSettings?: UserSettings): PresetWizardAnswers => {
  const goal = resolveGoal(presetId, presetName);
  const start = toDateKey(new Date());
  const endDateObj = new Date();
  endDateObj.setDate(endDateObj.getDate() + 6);
  return {
    goal,
    dailyHoursByWeekday: defaultDailyHours(goal),
    dailyAvailabilityByWeekday: { dom: { start: '', end: '' }, seg: { start: '', end: '' }, ter: { start: '', end: '' }, qua: { start: '', end: '' }, qui: { start: '', end: '' }, sex: { start: '', end: '' }, sab: { start: '', end: '' } },
    focusMinutes: goal === 'medicina' ? 60 : 50,
    focusBlockMinutes: goal === 'medicina' ? 60 : 50,
    breakMinutes: 10,
    firstCycleAllSubjects: true,
    aiDifficulty: baseSettings?.aiDifficulty ?? 'adaptive',
    focusMode: baseSettings?.focusMode ?? false,
    autoSchedule: true,
    smartBreaks: true,
    hardSubjectsPeriodPreference: 'any',
    studyStyle: 'balanced',
    studyContentPreference: 'misto',
    startDate: start,
    endDate: toDateKey(endDateObj),
    periodMode: 'date',
    totalHours: 40,
    examDate: '',
  };
};

export default function PresetConfigWizard({ isOpen, presetId, presetName, baseSettings, onClose, onApply }: PresetConfigWizardProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<PresetWizardAnswers>(() => buildDefaultAnswers(presetId, presetName, baseSettings));
  const [error, setError] = useState<string | null>(null);
  const [massHours, setMassHours] = useState(4);
  const [massDays, setMassDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [hasExamDate, setHasExamDate] = useState(false);
  const [showDayWindows, setShowDayWindows] = useState(false);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const formattedSelectedPeriod = useMemo(() => {
    const startKey = answers.startDate || todayKey;
    const endKey = answers.endDate || (() => { const d = new Date(`${startKey}T00:00:00`); d.setDate(d.getDate() + 6); return toDateKey(d); })();
    const startDate = new Date(`${startKey}T00:00:00`);
    const endDate = new Date(`${endKey}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    const diffDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { startKey, endKey, startLabel: fmt(startDate), endLabel: fmt(endDate), diffDays };
  }, [answers.startDate, answers.endDate, todayKey]);

  const weeklyHours = useMemo(
    () => WEEKDAY_KEYS.reduce((acc, k) => acc + (answers.dailyHoursByWeekday[k] || 0), 0),
    [answers.dailyHoursByWeekday]
  );
  const isHoursMode = answers.periodMode === 'hours';
  const derivedEndKey = useMemo(
    () =>
      isHoursMode
        ? deriveEndDateFromHours(
            answers.startDate || todayKey,
            Number(answers.totalHours) || 0,
            answers.dailyHoursByWeekday
          )
        : null,
    [isHoursMode, answers.startDate, answers.totalHours, answers.dailyHoursByWeekday, todayKey]
  );

  useEffect(() => {
    if (!isHoursMode || !derivedEndKey) return;
    setAnswers((prev) =>
      prev.periodMode === 'hours' && prev.endDate !== derivedEndKey ? { ...prev, endDate: derivedEndKey } : prev
    );
  }, [isHoursMode, derivedEndKey]);

  const switchPeriodMode = (mode: 'date' | 'hours') => {
    if ((answers.periodMode || 'date') === mode) return;
    if (mode === 'hours') {
      patchAnswers({
        periodMode: 'hours',
        endDate: deriveEndDateFromHours(
          answers.startDate || todayKey,
          Number(answers.totalHours) || 40,
          answers.dailyHoursByWeekday
        ),
      });
      return;
    }
    patchAnswers({ periodMode: 'date' });
  };

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!isOpen) return;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setAnswers(buildDefaultAnswers(presetId, presetName, baseSettings));
    setStep(0);
    setError(null);
    setMassHours(4);
    setMassDays([1, 2, 3, 4, 5]);
    setHasExamDate(false);
    setShowDayWindows(false);
  }, [isOpen, presetId, presetName, baseSettings]);

  const summary = useMemo(() => computeStudyPreferences(baseSettings, answers), [baseSettings, answers]);
  const progress = Math.round(((step + 1) / STEP_TITLES.length) * 100);
  const activeDays = useMemo(() => DAY_OPTIONS.filter((d) => (answers.dailyHoursByWeekday[d.key] || 0) > 0), [answers.dailyHoursByWeekday]);

  const patchAnswers = (patch: Partial<PresetWizardAnswers>) => setAnswers((prev) => ({ ...prev, ...patch }));
  const toggleMassDay = (value: number) => setMassDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  
  const toggleDayActive = (value: number) => {
    const day = DAY_OPTIONS.find((d) => d.value === value);
    if (!day) return;
    setAnswers((prev) => {
      const currentHours = prev.dailyHoursByWeekday[day.key] || 0;
      const nextHours = { ...prev.dailyHoursByWeekday };
      const nextWindows = { ...prev.dailyAvailabilityByWeekday };
      if (currentHours > 0) {
        nextHours[day.key] = 0;
        nextWindows[day.key] = { start: '', end: '' };
      } else {
        nextHours[day.key] = clampHours(massHours || 2);
      }
      return { ...prev, dailyHoursByWeekday: nextHours, dailyAvailabilityByWeekday: nextWindows };
    });
  };

  const updateDayHours = (key: WeekdayKey, value: number) => {
    setAnswers((prev) => ({
      ...prev,
      dailyHoursByWeekday: { ...prev.dailyHoursByWeekday, [key]: clampHours(Number.isFinite(value) ? value : 0) },
    }));
  };

  const updateDayWindow = (key: WeekdayKey, field: 'start' | 'end', value: string) => {
    setAnswers((prev) => {
      const nextWindows = { ...prev.dailyAvailabilityByWeekday, [key]: { ...prev.dailyAvailabilityByWeekday[key], [field]: value } };
      const autoHours = windowHours(nextWindows[key].start, nextWindows[key].end);
      const nextHours = { ...prev.dailyHoursByWeekday };
      if (autoHours !== null) nextHours[key] = autoHours;
      return { ...prev, dailyAvailabilityByWeekday: nextWindows, dailyHoursByWeekday: nextHours };
    });
  };

  const applyMassSchedule = () => {
    if (massDays.length === 0) return;
    setAnswers((prev) => {
      const nextHours = { ...prev.dailyHoursByWeekday };
      massDays.forEach((value) => {
        const day = DAY_OPTIONS.find((d) => d.value === value);
        if (!day) return;
        nextHours[day.key] = clampHours(massHours);
      });
      return { ...prev, dailyHoursByWeekday: nextHours };
    });
  };

  const validateStep0 = () => {
    if (!answers.startDate) return 'Defina a data de início.';
    if (answers.periodMode === 'hours') {
      const total = Number(answers.totalHours);
      if (!Number.isFinite(total) || total <= 0) return 'Informe a carga horária total do estudo.';
      if (total > 4000) return 'Carga horária muito alta (máximo 4000h).';
    }
    if (!answers.endDate) return 'Defina a data de fim.';
    const s = new Date(`${answers.startDate}T00:00:00`);
    const e = new Date(`${answers.endDate}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 'Datas inválidas.';
    if (e < s) return 'A data de fim não pode ser antes do início.';
    const diffDays = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 730) return 'Período muito longo (máximo 2 anos / 730 dias).';
    if (activeDays.length === 0) return 'Defina pelo menos um dia com horas líquidas > 0.';
    for (const day of DAY_OPTIONS) {
      const hours = answers.dailyHoursByWeekday[day.key] || 0;
      const window = answers.dailyAvailabilityByWeekday[day.key];
      if (!(window.start || window.end)) continue;
      if (!window.start || !window.end) return `${day.label}: preencha início e fim ou limpe a janela.`;
      if (!isValidWindow(window.start, window.end)) return `${day.label}: horário inválido.`;
      if (hours > 0) {
        const maxHours = (timeToMinutesSafe(window.end) - timeToMinutesSafe(window.start)) / 60;
        if (hours > maxHours + 0.01) return `${day.label}: horas líquidas excedem a janela do dia.`;
      }
    }
    return null;
  };

  const validateStep4 = () => {
    if (!hasExamDate) return null;
    if (!answers.examDate) return 'Selecione a data da prova ou marque que ainda não tem data.';
    if (answers.examDate < todayKey) return 'A data da prova precisa ser hoje ou futura.';
    return null;
  };

  const nextStep = () => {
    setError(null);
    const err = step === 0 ? validateStep0() : step === 4 ? validateStep4() : null;
    if (err) return setError(err);
    setStep((s) => Math.min(STEP_TITLES.length - 1, s + 1));
  };

  const apply = () => {
    setError(null);
    const err = validateStep0() || validateStep4();
    if (err) return setError(err);
    onApply(summary.settings, summary.studyPrefs, { ...answers, examDate: hasExamDate ? answers.examDate : '' });
    onClose();
  };

  // A11y: role/aria-modal, Escape e prisão de foco. O lock de scroll já é feito
  // pelo effect próprio deste componente, por isso lockScroll: false.
  const { dialogRef, dialogProps } = useDialogA11y({
    open: isOpen && mounted,
    onClose,
    lockScroll: false,
    ariaLabel: `Configurar trilha ${presetName}`,
  });

  if (!isOpen || !mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={dialogRef}
        {...dialogProps}
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md overflow-y-auto"
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
      >
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="w-full max-w-xl bg-white rounded-[28px] shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[85vh] overflow-hidden"
        >
          {/* HEADER FIXO */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 flex items-center justify-center rounded-2xl bg-violet-50 text-violet-600 font-bold">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold tracking-wider text-violet-600 uppercase">Configuração IA • {STEP_TITLES[step]}</span>
                <h2 className="text-lg font-bold text-slate-900">{presetName}</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* BARRA DE PROGRESSO */}
          <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                <span>Passo {step + 1} de {STEP_TITLES.length}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-violet-600 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {/* CONTEÚDO COM ROLAGEM SUAVE */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            {step === 0 && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-4 text-white shadow-lg shadow-violet-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-violet-200" />
                    <span className="text-xs font-bold tracking-widest uppercase text-violet-200">Período do estudo</span>
                  </div>
                  <p className="text-sm font-semibold">Até quando vai esse estudo?</p>
                  <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white/15 p-1" role="radiogroup" aria-label="Modo de definição do fim do estudo">
                    {(
                      [
                        { mode: 'date', label: 'Por data', Icon: CalendarDays },
                        { mode: 'hours', label: 'Por horas', Icon: Hourglass },
                      ] as const
                    ).map(({ mode, label, Icon }) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={(answers.periodMode || 'date') === mode}
                        onClick={() => switchPeriodMode(mode)}
                        className={cn(
                          'h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                          (answers.periodMode || 'date') === mode
                            ? 'bg-white text-violet-700 shadow-sm'
                            : 'text-violet-100 hover:bg-white/10'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-violet-200">Início</label>
                      <input type="date" value={answers.startDate || todayKey} onChange={(e) => patchAnswers({ startDate: e.target.value })} className="mt-1 w-full h-9 rounded-xl border-0 bg-white/95 px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-white/50" />
                    </div>
                    {isHoursMode ? (
                      <div>
                        <label className="text-[11px] font-medium text-violet-200">Carga horária total</label>
                        <div className="relative mt-1">
                          <input
                            type="number"
                            min={1}
                            max={4000}
                            step={0.5}
                            value={Number.isFinite(Number(answers.totalHours)) ? answers.totalHours : 40}
                            onChange={(e) => patchAnswers({ totalHours: Number(e.target.value) })}
                            aria-label="Carga horária total em horas"
                            className="w-full h-9 rounded-xl border-0 bg-white/95 pl-3 pr-8 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-white/50"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-slate-500">h</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[11px] font-medium text-violet-200">Fim</label>
                        <input type="date" value={answers.endDate || formattedSelectedPeriod?.endKey || ''} onChange={(e) => patchAnswers({ endDate: e.target.value })} min={answers.startDate || todayKey} className="mt-1 w-full h-9 rounded-xl border-0 bg-white/95 px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-white/50" />
                      </div>
                    )}
                  </div>
                  {isHoursMode && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {TOTAL_HOURS_QUICK.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => patchAnswers({ totalHours: h })}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all',
                            Number(answers.totalHours) === h
                              ? 'bg-white text-violet-700 shadow-sm'
                              : 'bg-white/15 text-violet-50 hover:bg-white/25'
                          )}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  )}
                  {formattedSelectedPeriod &&
                    (isHoursMode ? (
                      <p className="mt-2 text-xs text-violet-100">
                        Carga horária: {formatTotalHours(Number(answers.totalHours) || 0)} a partir de {formattedSelectedPeriod.startLabel}. Com sua disponibilidade ({formatTotalHours(weeklyHours)}/semana), o término estimado é {formattedSelectedPeriod.endLabel} ({formattedSelectedPeriod.diffDays} {formattedSelectedPeriod.diffDays === 1 ? 'dia' : 'dias'}). O cronograma será gerado para todo esse intervalo.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-violet-100">Período: {formattedSelectedPeriod.startLabel} → {formattedSelectedPeriod.endLabel} ({formattedSelectedPeriod.diffDays} {formattedSelectedPeriod.diffDays === 1 ? 'dia' : 'dias'}). O cronograma será gerado para todo esse intervalo.</p>
                    ))}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Disponibilidade de estudo</h3>
                  <p className="text-sm text-slate-500 mb-4">Defina quantas horas por dia você pode estudar.</p>

                  <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/60 space-y-3 mb-5">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Preenchimento rápido em massa</span>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_HOURS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setMassHours(h)}
                          className={cn(
                            'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
                            massHours === h
                              ? 'bg-violet-600 text-white shadow-sm'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          )}
                        >
                          {formatDuration(h * 60)}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {DAY_OPTIONS.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => toggleMassDay(d.value)}
                          className={cn(
                            'px-3 py-1 rounded-lg text-xs font-medium transition-all',
                            massDays.includes(d.value)
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>

                    <Button
                      variant="primary"
                      className="w-full h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium text-xs mt-1 shadow-sm"
                      onClick={applyMassSchedule}
                      disabled={massDays.length === 0}
                    >
                      Aplicar aos dias selecionados
                    </Button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Horas por dia da semana</span>
                    <button
                      type="button"
                      onClick={() => setShowDayWindows((v) => !v)}
                      className="text-xs font-semibold text-violet-600 hover:text-violet-700"
                    >
                      {showDayWindows ? 'Ocultar horários' : 'Definir horário inicial/final'}
                    </button>
                  </div>

                  {DAY_OPTIONS.map((d) => {
                    const hours = answers.dailyHoursByWeekday[d.key] || 0;
                    const active = hours > 0;
                    const w = answers.dailyAvailabilityByWeekday[d.key];
                    return (
                      <div key={d.key} className="p-3 bg-slate-50/50 rounded-2xl border border-slate-200/70 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => toggleDayActive(d.value)}
                            className={cn(
                              'w-14 h-9 rounded-xl text-xs font-bold transition-all shadow-sm',
                              active ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-500'
                            )}
                          >
                            {d.label}
                          </button>
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={12}
                              step={0.5}
                              disabled={!active}
                              value={hours}
                              onChange={(e) => updateDayHours(d.key, Number(e.target.value))}
                              className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-violet-500 focus:outline-none disabled:opacity-40"
                            />
                            <span className="text-xs text-slate-500 font-medium">h</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => { updateDayHours(d.key, 0); updateDayWindow(d.key, 'start', ''); updateDayWindow(d.key, 'end', ''); }}
                            className="text-xs font-medium text-slate-400 hover:text-red-500 px-2 py-1"
                          >
                            Limpar
                          </button>
                        </div>

                        {showDayWindows && active && (
                          <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <input
                              type="time"
                              value={w.start}
                              onChange={(e) => updateDayWindow(d.key, 'start', e.target.value)}
                              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-violet-500"
                            />
                            <span className="text-xs text-slate-400">até</span>
                            <input
                              type="time"
                              value={w.end}
                              onChange={(e) => updateDayWindow(d.key, 'end', e.target.value)}
                              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-violet-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Duração dos blocos de estudo</h3>
                  <p className="text-sm text-slate-500 mb-4">Escolha o tempo ideal para sua concentração.</p>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {FOCUS_OPTIONS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => patchAnswers({ focusMinutes: v, focusBlockMinutes: v })}
                        className={cn(
                          'p-4 rounded-2xl border text-center transition-all',
                          (answers.focusBlockMinutes || answers.focusMinutes) === v
                            ? 'border-violet-600 bg-violet-50/50 ring-2 ring-violet-600/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        )}
                      >
                        <span className="block text-lg font-bold text-slate-900">{v}</span>
                        <span className="block text-xs font-medium text-slate-500">minutos</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Tempo de pausa</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {BREAK_OPTIONS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => patchAnswers({ breakMinutes: v })}
                        className={cn(
                          'p-4 rounded-2xl border text-center transition-all',
                          answers.breakMinutes === v
                            ? 'border-violet-600 bg-violet-50/50 ring-2 ring-violet-600/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        )}
                      >
                        <span className="block text-lg font-bold text-slate-900">{v}</span>
                        <span className="block text-xs font-medium text-slate-500">minutos</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900 mb-1">Horário ideal para matérias difíceis</h3>
                <p className="text-sm text-slate-500 mb-4">Quando você rende mais nos estudos?</p>

                <div className="space-y-3">
                  {[
                    { value: 'morning', label: 'Manhã', desc: 'Energia alta logo cedo' },
                    { value: 'afternoon', label: 'Tarde', desc: 'Bom ritmo após o almoço' },
                    { value: 'night', label: 'Noite', desc: 'Silêncio e foco no período noturno' },
                    { value: 'any', label: 'Tanto faz', desc: 'Distribuir sem preferência' },
                  ].map((opt) => {
                    const isSelected = (answers.hardSubjectsPeriodPreference || 'any') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => patchAnswers({ hardSubjectsPeriodPreference: opt.value as HardSubjectsPeriodPreference })}
                        className={cn(
                          'w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between',
                          isSelected
                            ? 'border-violet-600 bg-violet-50/50 ring-2 ring-violet-600/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        )}
                      >
                        <div>
                          <span className="block text-sm font-bold text-slate-900">{opt.label}</span>
                          <span className="block text-xs text-slate-500 mt-0.5">{opt.desc}</span>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-violet-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900 mb-1">Estilo de estudo preferido</h3>
                <p className="text-sm text-slate-500 mb-4">Como você prefere balancear sua rotina?</p>

                <div className="space-y-3">
                  {[
                    { value: 'theory', label: 'Mais teoria', desc: 'Maior proporção de videoaulas e resumos' },
                    { value: 'practice', label: 'Mais exercícios', desc: 'Foco total em resolução de questões' },
                    { value: 'balanced', label: 'Equilibrado', desc: 'Mix perfeito entre teoria e prática' },
                  ].map((opt) => {
                    const isSelected = (answers.studyStyle || 'balanced') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => patchAnswers({ studyStyle: opt.value as StudyStylePreference })}
                        className={cn(
                          'w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between',
                          isSelected
                            ? 'border-violet-600 bg-violet-50/50 ring-2 ring-violet-600/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        )}
                      >
                        <div>
                          <span className="block text-sm font-bold text-slate-900">{opt.label}</span>
                          <span className="block text-xs text-slate-500 mt-0.5">{opt.desc}</span>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-violet-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900 mb-1">Data da prova ou concurso</h3>
                <p className="text-sm text-slate-500 mb-4">Isso ajuda a IA a calibrar revisões e ritmo.</p>

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasExamDate}
                      onChange={(e) => setHasExamDate(e.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm font-semibold text-slate-900">Já tenho uma data de prova definida</span>
                  </label>

                  {hasExamDate && (
                    <div className="pt-2">
                      <input
                        type="date"
                        value={answers.examDate}
                        onChange={(e) => patchAnswers({ examDate: e.target.value })}
                        min={todayKey}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 focus:border-violet-600 focus:outline-none shadow-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* FOOTER FIXO COM AÇÕES */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
            {step > 0 ? (
              <Button
                variant="ghost"
                className="h-11 px-5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
            ) : <div />}

            {step < STEP_TITLES.length - 1 ? (
              <Button
                variant="primary"
                className="h-11 px-6 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm shadow-md shadow-violet-600/20"
                onClick={nextStep}
              >
                Próximo <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                variant="primary"
                className="h-11 px-8 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm shadow-md shadow-violet-600/20"
                onClick={apply}
              >
                Gerar Cronograma com IA
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}