'use client';

/**
 * SetupWizard — assistente de configuração (refeito do zero).
 *
 * Substitui o antigo PresetConfigWizard (18 perguntas em 5 grupos) por 5 telas
 * que fazem só o que o motor do cronograma realmente usa:
 *
 *   1. Quando é a prova?        -> examDate / endDate
 *   2. Seu nível no conteúdo    -> calibra o ritmo inicial
 *   3. Quanto tempo por dia?    -> dailyHoursByWeekday
 *   4. Como prefere estudar?    -> duração do bloco e intervalo
 *   5. Confirmação              -> resumo antes de gerar
 *
 * Fora de propósito as perguntas de "estilo de estudo", "quando você rende
 * mais" e "horário ideal para matérias difíceis": o app usa um padrão bom e a
 * pessoa ajusta em Perfil quando quiser.
 *
 * O contrato de saída é o mesmo de antes — (settings, studyPrefs, answers) —
 * para não mexer em quem consome (PresetSelector, tela de matérias, motor).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  GraduationCap,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { computeStudyPreferences } from '@/services/presetConfigurator';
import { formatHoursDuration } from '@/lib/utils';
import type {
  BreakDuration,
  FocusDuration,
  PresetWizardAnswers,
  StudyPreferences,
  UserSettings,
  WeekdayKey,
} from '@/types';

interface SetupWizardProps {
  isOpen: boolean;
  presetId: string;
  presetName: string;
  baseSettings: UserSettings;
  onClose: () => void;
  onApply: (
    settings: UserSettings,
    studyPrefs: StudyPreferences,
    answers: PresetWizardAnswers
  ) => void;
}

/** Ordem de exibição: começa na segunda, como no app. */
const DIAS: { key: WeekdayKey; label: string; short: string }[] = [
  { key: 'seg', label: 'Segunda', short: 'Seg' },
  { key: 'ter', label: 'Terça', short: 'Ter' },
  { key: 'qua', label: 'Quarta', short: 'Qua' },
  { key: 'qui', label: 'Quinta', short: 'Qui' },
  { key: 'sex', label: 'Sexta', short: 'Sex' },
  { key: 'sab', label: 'Sábado', short: 'Sáb' },
  { key: 'dom', label: 'Domingo', short: 'Dom' },
];

const NIVELS = [
  {
    id: 'iniciante',
    titulo: 'Começando agora',
    descricao: 'Nunca estudei esse conteúdo ou faz muito tempo.',
    horas: 1,
  },
  {
    id: 'intermediario',
    titulo: 'Já sei o básico',
    descricao: 'Estudei antes, mas ainda travo em bastante coisa.',
    horas: 1,
  },
  {
    id: 'avancado',
    titulo: 'Domino a maior parte',
    descricao: 'Só quero manter o ritmo e revisar o que falta.',
    horas: 1,
  },
] as const;

const BLOCOS: { minutos: FocusDuration; titulo: string; descricao: string }[] = [
  { minutos: 25, titulo: '25 minutos', descricao: 'Blocos curtos, pausas frequentes.' },
  { minutos: 50, titulo: '50 minutos', descricao: 'O equilíbrio que funciona para a maioria.' },
  { minutos: 90, titulo: '90 minutos', descricao: 'Imersão longa, para quem já tem o hábito.' },
];

const INTERVALOS: { minutos: BreakDuration; titulo: string }[] = [
  { minutos: 5, titulo: '5 minutos' },
  { minutos: 10, titulo: '10 minutos' },
  { minutos: 15, titulo: '15 minutos' },
];

const TOTAL_TELAS = 5;

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseKey = (key: string) => new Date(`${key}T00:00:00`);

const formatarData = (key: string) => {
  const d = parseKey(key);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const resolveGoal = (presetId: string, presetName: string): PresetWizardAnswers['goal'] => {
  const s = `${presetId} ${presetName}`.toLowerCase();
  if (s.includes('enem')) return 'enem';
  if (s.includes('med')) return 'medicina';
  if (s.includes('conc')) return 'concurso';
  return 'outros';
};

const defaultDailyHours = (goal: PresetWizardAnswers['goal']): Record<WeekdayKey, number> => {
  if (goal === 'medicina') return { dom: 0, seg: 5, ter: 5, qua: 5, qui: 5, sex: 5, sab: 3 };
  if (goal === 'enem' || goal === 'concurso') return { dom: 0, seg: 4, ter: 4, qua: 4, qui: 4, sex: 4, sab: 2 };
  return { dom: 0, seg: 3, ter: 3, qua: 3, qui: 3, sex: 3, sab: 2 };
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export default function SetupWizard({
  isOpen,
  presetId,
  presetName,
  baseSettings,
  onClose,
  onApply,
}: SetupWizardProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [step, setStep] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  // --- estado das respostas (só o que o motor usa) ---
  const [temProva, setTemProva] = useState(false);
  const [examDate, setExamDate] = useState('');
  const [nivel, setNivel] = useState<(typeof NIVELS)[number]['id']>('intermediario');
  const [horas, setHoras] = useState<Record<WeekdayKey, number>>(() =>
    defaultDailyHours(resolveGoal(presetId, presetName))
  );
  const [bloco, setBloco] = useState<FocusDuration>(50);
  const [intervalo, setIntervalo] = useState<BreakDuration>(10);

  const goal = useMemo(() => resolveGoal(presetId, presetName), [presetId, presetName]);

  // Trava o scroll do fundo enquanto o assistente está aberto.
  useEffect(() => {
    if (!isOpen) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [isOpen]);

  // Fecha no Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const semanahHoras = useMemo(
    () => DIAS.reduce((total, dia) => total + (horas[dia.key] || 0), 0),
    [horas]
  );
  const diasAtivos = useMemo(() => DIAS.filter((dia) => (horas[dia.key] || 0) > 0).length, [horas]);

  const ajustarHora = (key: WeekdayKey, delta: number) => {
    setHoras((prev) => {
      const atual = Number(prev[key]) || 0;
      const proximo = Math.min(14, Math.max(0, Math.round((atual + delta) * 2) / 2));
      return { ...prev, [key]: proximo };
    });
  };

  const podeAvancar = () => {
    if (step === 0 && temProva && !examDate) {
      setErro('Escolha a data da prova.');
      return false;
    }
    if (step === 2 && diasAtivos === 0) {
      setErro('Marque pelo menos um dia com horas de estudo.');
      return false;
    }
    setErro(null);
    return true;
  };

  const avancar = () => {
    if (!podeAvancar()) return;
    setStep((atual) => Math.min(TOTAL_TELAS - 1, atual + 1));
  };

  const voltar = () => {
    setErro(null);
    setStep((atual) => Math.max(0, atual - 1));
  };

  const concluir = () => {
    if (!podeAvancar()) return;

    const inicio = toDateKey(new Date());
    const startDate = inicio;

    // Sem data de prova: o plano cobre a primeira semana e a pessoa estende
    // quando quiser. Com data: o plano vai até ela.
    let endDate: string;
    if (temProva && examDate) {
      endDate = examDate;
    } else {
      const d = parseKey(inicio);
      d.setDate(d.getDate() + 6);
      endDate = toDateKey(d);
    }

    const answers: PresetWizardAnswers = {
      goal,
      dailyHoursByWeekday: horas,
      dailyAvailabilityByWeekday: {
        dom: { start: '', end: '' },
        seg: { start: '', end: '' },
        ter: { start: '', end: '' },
        qua: { start: '', end: '' },
        qui: { start: '', end: '' },
        sex: { start: '', end: '' },
        sab: { start: '', end: '' },
      },
      focusMinutes: bloco,
      focusBlockMinutes: bloco,
      breakMinutes: intervalo,
      firstCycleAllSubjects: true,
      aiDifficulty: baseSettings.aiDifficulty ?? 'adaptive',
      focusMode: false,
      autoSchedule: true,
      smartBreaks: true,
      hardSubjectsPeriodPreference: 'any',
      studyStyle: 'balanced',
      studyContentPreference: 'misto',
      intensity: nivel === 'avancado' ? 'intensa' : nivel === 'iniciante' ? 'leve' : 'normal',
      startDate,
      endDate,
      periodMode: 'date',
      totalHours: Math.round(semanahHoras * 4),
      examDate: temProva && examDate ? examDate : '',
    };

    const resumo = computeStudyPreferences(baseSettings, answers);
    onApply(resumo.settings, resumo.studyPrefs, answers);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={dialogRef}
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md overflow-y-auto"
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
          className="w-full max-w-xl bg-card-bg rounded-[28px] shadow-2xl border border-card-border flex flex-col my-auto max-h-[90vh] overflow-hidden"
        >
          {/* CABEÇALHO */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-card-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 flex items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold tracking-wider text-violet-600 uppercase">
                  Passo {step + 1} de {TOTAL_TELAS}
                </span>
                <h2 className="text-lg font-bold text-text-primary">{presetName}</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              title="Fechar"
              className="rounded-full p-2 text-text-muted transition-colors hover:bg-surface-soft hover:text-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* BARRA DE PROGRESSO */}
          <div className="h-1 w-full bg-surface-soft">
            <div
              className="h-full bg-violet-500 transition-all duration-300"
              style={{ width: `${((step + 1) / TOTAL_TELAS) * 100}%` }}
            />
          </div>

          {/* CONTEÚDO */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-text-primary">Quando é a prova?</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Com a data, o app calcula o ritmo até ela. Sem data, o plano cobre a primeira
                    semana e você estende depois.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTemProva(true);
                      setErro(null);
                    }}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      temProva
                        ? 'border-violet-500 bg-violet-500/10'
                        : 'border-card-border hover:border-violet-400'
                    }`}
                  >
                    <CalendarDays className="mb-2 h-5 w-5 text-violet-600" />
                    <span className="block text-sm font-semibold text-text-primary">
                      Já tenho a data
                    </span>
                    <span className="mt-0.5 block text-xs text-text-secondary">
                      O plano vai até o dia da prova.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTemProva(false);
                      setExamDate('');
                      setErro(null);
                    }}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      !temProva
                        ? 'border-violet-500 bg-violet-500/10'
                        : 'border-card-border hover:border-violet-400'
                    }`}
                  >
                    <Clock className="mb-2 h-5 w-5 text-violet-600" />
                    <span className="block text-sm font-semibold text-text-primary">
                      Ainda não tenho
                    </span>
                    <span className="mt-0.5 block text-xs text-text-secondary">
                      Começo agora e ajusto a data depois.
                    </span>
                  </button>
                </div>

                {temProva && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-text-secondary">
                      Data da prova
                    </span>
                    <input
                      type="date"
                      value={examDate}
                      min={toDateKey(new Date())}
                      onChange={(event) => {
                        setExamDate(event.target.value);
                        setErro(null);
                      }}
                      className="input-field"
                    />
                  </label>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-text-primary">Qual seu nível no conteúdo?</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Isso muda o ritmo do começo: quem está começando leva mais teoria no início.
                  </p>
                </div>

                <div className="space-y-3">
                  {NIVELS.map((opcao) => (
                    <button
                      key={opcao.id}
                      type="button"
                      onClick={() => setNivel(opcao.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-all ${
                        nivel === opcao.id
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-card-border hover:border-violet-400'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="block text-sm font-semibold text-text-primary">
                            {opcao.titulo}
                          </span>
                          <span className="mt-0.5 block text-xs text-text-secondary">
                            {opcao.descricao}
                          </span>
                        </div>
                        {nivel === opcao.id && (
                          <Check className="h-5 w-5 flex-shrink-0 text-violet-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-text-primary">
                    Quanto tempo você tem por dia?
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Toque em − e + para ajustar. Deixe 0 nos dias em que não vai estudar.
                  </p>
                </div>

                <div className="space-y-2">
                  {DIAS.map((dia) => {
                    const valor = Number(horas[dia.key]) || 0;
                    return (
                      <div
                        key={dia.key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-card-border px-3 py-2"
                      >
                        <span className="w-16 text-sm font-medium text-text-primary">
                          {dia.short}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => ajustarHora(dia.key, -0.5)}
                            disabled={valor <= 0}
                            aria-label={`Diminuir ${dia.label}`}
                            className="h-8 w-8 rounded-full border border-card-border text-text-secondary transition-colors hover:border-violet-400 hover:text-text-primary disabled:opacity-40"
                          >
                            −
                          </button>
                          <span className="w-20 text-center text-sm font-bold text-text-primary">
                            {valor === 0 ? '—' : formatHoursDuration(valor)}
                          </span>
                          <button
                            type="button"
                            onClick={() => ajustarHora(dia.key, 0.5)}
                            disabled={valor >= 14}
                            aria-label={`Aumentar ${dia.label}`}
                            className="h-8 w-8 rounded-full border border-card-border text-text-secondary transition-colors hover:border-violet-400 hover:text-text-primary disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl bg-surface-soft p-3 text-sm">
                  <span className="text-text-secondary">Total por semana: </span>
                  <span className="font-bold text-text-primary">
                    {formatHoursDuration(semanahHoras)}
                  </span>
                  <span className="text-text-secondary"> em {diasAtivos} dia(s).</span>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-bold text-text-primary">Como prefere estudar?</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Você pode mudar isso quando quiser em Perfil.
                  </p>
                </div>

                <div className="space-y-3">
                  <span className="block text-sm font-medium text-text-secondary">
                    Duração de cada bloco
                  </span>
                  {BLOCOS.map((opcao) => (
                    <button
                      key={opcao.minutos}
                      type="button"
                      onClick={() => setBloco(opcao.minutos)}
                      className={`w-full rounded-2xl border p-3 text-left transition-all ${
                        bloco === opcao.minutos
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-card-border hover:border-violet-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="block text-sm font-semibold text-text-primary">
                            {opcao.titulo}
                          </span>
                          <span className="mt-0.5 block text-xs text-text-secondary">
                            {opcao.descricao}
                          </span>
                        </div>
                        {bloco === opcao.minutos && (
                          <Check className="h-5 w-5 flex-shrink-0 text-violet-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <span className="block text-sm font-medium text-text-secondary">
                    Intervalo entre blocos
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {INTERVALOS.map((opcao) => (
                      <button
                        key={opcao.minutos}
                        type="button"
                        onClick={() => setIntervalo(opcao.minutos)}
                        className={`rounded-xl border p-3 text-center text-sm font-semibold transition-all ${
                          intervalo === opcao.minutos
                            ? 'border-violet-500 bg-violet-500/10 text-text-primary'
                            : 'border-card-border text-text-secondary hover:border-violet-400'
                        }`}
                      >
                        {opcao.titulo}
                      </button>
                    ))}
                  </div>
                  <p className="flex items-center gap-2 text-xs text-text-muted">
                    <Coffee className="h-3.5 w-3.5" />
                    O intervalo sempre existe entre um bloco e outro.
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-text-primary">Tudo certo?</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Confira antes de gerar seu cronograma.
                  </p>
                </div>

                <div className="divide-y divide-card-border rounded-2xl border border-card-border">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-text-secondary">Objetivo</span>
                    <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                      <GraduationCap className="h-4 w-4 text-violet-600" />
                      {presetName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-text-secondary">Prova</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {temProva && examDate ? formatarData(examDate) : 'Sem data definida'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-text-secondary">Nível</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {NIVELS.find((opcao) => opcao.id === nivel)?.titulo}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-text-secondary">Tempo por semana</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {formatHoursDuration(semanahHoras)} em {diasAtivos} dia(s)
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-text-secondary">Blocos</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {bloco} min com {intervalo} min de intervalo
                    </span>
                  </div>
                </div>
              </div>
            )}

            {erro && (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {erro}
              </p>
            )}
          </div>

          {/* RODAPÉ */}
          <div className="flex items-center justify-between gap-3 border-t border-card-border px-6 py-4">
            <Button
              variant="ghost"
              onClick={step === 0 ? onClose : voltar}
              leftIcon={step === 0 ? undefined : <ChevronLeft className="h-4 w-4" />}
            >
              {step === 0 ? 'Cancelar' : 'Voltar'}
            </Button>

            {step < TOTAL_TELAS - 1 ? (
              <Button variant="primary" onClick={avancar} rightIcon={<ChevronRight className="h-4 w-4" />}>
                Continuar
              </Button>
            ) : (
              <Button variant="primary" onClick={concluir} rightIcon={<Sparkles className="h-4 w-4" />}>
                Gerar meu cronograma
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
