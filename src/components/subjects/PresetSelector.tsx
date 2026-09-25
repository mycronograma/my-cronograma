'use client';

/**
 * PresetSelector Component
 * Allows users to select a study objective preset and import subjects automatically
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap,
  Stethoscope,
  Scale,
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  Layers,
  Clock,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { PresetConfigWizard } from '@/components/onboarding';
import { cn, formatHoursDuration } from '@/lib/utils';
import { getEnemPresetSubjects } from '@/lib/enemCatalog';
import { getCuratedPresets, normalizeComparableText } from '@/lib/presetCatalog';
import type { PresetWizardAnswers, StudyPreferences, UserSettings } from '@/types';

interface PresetSubject {
  id: string;
  name: string;
  priority: number;
  difficulty: number;
  recommendedWeeklyHours: number;
  group?: string;
}

interface PresetModule {
  id: string;
  name: string;
  description: string;
  subjects: PresetSubject[];
}

interface Preset {
  id: string;
  name: string;
  description: string;
  subjects: PresetSubject[];
  specificModules?: PresetModule[];
}

type WeeklyLoadLevel = 'leve' | 'normal' | 'intensivo';

interface PresetSelectorProps {
  onImport: (
    presetId: string,
    options?: { source: 'api' | 'local'; wizardAnswers?: PresetWizardAnswers; weeklyLoad?: WeeklyLoadLevel; selectedModules?: string[] }
  ) => Promise<void>;
  onSkip: () => void;
  userId: string;
  baseSettings: UserSettings;
  onApplyPreferences: (
    settings: UserSettings,
    studyPrefs: StudyPreferences,
    answers: PresetWizardAnswers
  ) => Promise<void> | void;
}

const GROUP_ORDER = ['natureza', 'matematica', 'exatas', 'linguagens', 'humanas', 'base comum', 'modulo especifico'];

const presetIcons: Record<string, typeof GraduationCap> = {
  enem: GraduationCap,
  medicina: Stethoscope,
  concursos: Scale,
  'concursos publicos': Scale,
  personalizado: Sparkles,
};

const presetColors: Record<string, string> = {
  enem: 'from-neon-blue/20 to-neon-purple/20',
  medicina: 'from-red-500/20 to-pink-500/20',
  concursos: 'from-yellow-500/20 to-orange-500/20',
  'concursos publicos': 'from-yellow-500/20 to-orange-500/20',
  personalizado: 'from-neon-cyan/20 to-neon-blue/20',
};

const WEEKLY_LOAD_OPTIONS: Array<{
  value: WeeklyLoadLevel;
  label: string;
  helper: string;
  multiplier: number;
}> = [
  { value: 'leve', label: 'Leve', helper: 'trabalha e estuda', multiplier: 0.35 },
  { value: 'normal', label: 'Normal', helper: 'meio período', multiplier: 0.65 },
  { value: 'intensivo', label: 'Intensivo', helper: 'dedicação total', multiplier: 1.0 },
];

function getWeeklyLoadOption(value: WeeklyLoadLevel) {
  return WEEKLY_LOAD_OPTIONS.find((option) => option.value === value) || WEEKLY_LOAD_OPTIONS[0];
}

function adjustWeeklyHours(hours: number, weeklyLoad: WeeklyLoadLevel) {
  if (hours <= 0) return 0;
  return Math.max(0.5, Math.round(hours * getWeeklyLoadOption(weeklyLoad).multiplier * 2) / 2);
}

function buildLocalMockPresets(): Preset[] {
  const enemSubjects = getEnemPresetSubjects().map((subject, index) => ({
    id: `enem-${index + 1}`,
    name: subject.name,
    priority: subject.priority,
    difficulty: subject.difficulty,
    recommendedWeeklyHours: subject.recommendedWeeklyHours,
    group: subject.group,
  }));

  const curated = getCuratedPresets().map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    subjects: preset.subjects.map((subject, index) => ({
      id: `${preset.id}-${index + 1}`,
      name: subject.name,
      priority: subject.priority,
      difficulty: subject.difficulty,
      recommendedWeeklyHours: subject.recommendedWeeklyHours,
      group: subject.group,
    })),
    specificModules: (preset.specificModules || []).map((module) => ({
      id: module.id,
      name: module.name,
      description: module.description,
      subjects: module.subjects.map((subject, index) => ({
        id: `${module.id}-${index + 1}`,
        name: subject.name,
        priority: subject.priority,
        difficulty: subject.difficulty,
        recommendedWeeklyHours: subject.recommendedWeeklyHours,
        group: subject.group,
      })),
    })),
  }));

  return [
    {
      id: 'enem',
      name: 'ENEM',
      description:
        'Preparação completa ENEM organizada por áreas oficiais e disciplinas reais',
      subjects: enemSubjects,
    },
    ...curated,
  ];
}

function groupSubjects(subjects: PresetSubject[]) {
  const grouped = new Map<string, PresetSubject[]>();

  for (const subject of subjects) {
    const group = subject.group || 'Outros';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(subject);
  }

  return Array.from(grouped.entries()).sort((a, b) => {
    const aIndex = GROUP_ORDER.indexOf(normalizeComparableText(a[0]));
    const bIndex = GROUP_ORDER.indexOf(normalizeComparableText(b[0]));
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return safeA - safeB || a[0].localeCompare(b[0]);
  });
}

function resolvePresetVisualKey(name: string): string {
  const normalized = normalizeComparableText(name);
  if (normalized.startsWith('concursos')) return 'concursos publicos';
  if (normalized.includes('medicina')) return 'medicina';
  if (normalized.includes('enem')) return 'enem';
  return normalized;
}

export default function PresetSelector({
  onImport,
  onSkip,
  userId,
  baseSettings,
  onApplyPreferences,
}: PresetSelectorProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [presetSource, setPresetSource] = useState<'api' | 'local'>('local');
  const [showWizard, setShowWizard] = useState(false);
  const [weeklyLoad, setWeeklyLoad] = useState<WeeklyLoadLevel>('leve');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());

  void userId;

  useEffect(() => {
    async function fetchPresets() {
      if (process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true') {
        setPresets(buildLocalMockPresets());
        setPresetSource('local');
        setIsLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);

      try {
        const response = await fetch('/api/presets', { signal: controller.signal });
        const data = await response.json();

        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setPresets(data.data as Preset[]);
          setPresetSource(data.source === 'local' ? 'local' : 'api');
        } else {
          setPresets(buildLocalMockPresets());
          setPresetSource('local');
        }
      } catch {
        setPresets(buildLocalMockPresets());
        setPresetSource('local');
      } finally {
        window.clearTimeout(timeout);
        setIsLoading(false);
      }
    }

    fetchPresets();
  }, []);

  const selectedPresetData = useMemo(
    () => presets.find((preset) => preset.id === selectedPreset) || null,
    [presets, selectedPreset]
  );

  const handleImport = async (wizardAnswers?: PresetWizardAnswers) => {
    if (!selectedPreset) return;

    setIsImporting(true);
    setError(null);

    try {
      await onImport(selectedPreset, { 
        source: presetSource, 
        wizardAnswers, 
        weeklyLoad,
        selectedModules: Array.from(selectedModules)
      });
    } catch (err) {
      setError('Erro ao importar predefinição. Tente novamente.');
      console.error('Error importing preset:', err);
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="py-16">
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-neon-blue" />
          <p className="text-text-secondary">Carregando predefinições...</p>
        </div>
      </Card>
    );
  }

  if (error && presets.length === 0) {
    return (
      <Card className="py-16">
        <div className="flex flex-col items-center justify-center">
          <AlertCircle className="mb-4 h-8 w-8 text-red-400" />
          <p className="mb-4 text-text-secondary">{error}</p>
          <Button variant="secondary" onClick={onSkip}>
            Continuar sem predefinição
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0 text-center">
        <h2 className="mb-2 text-2xl font-heading font-bold text-white">Qual é seu objetivo de estudo?</h2>
        <p className="text-text-secondary">
          Escolha um modelo para começar. As horas exibidas são referências iniciais, não sua agenda final.
        </p>
      </div>

      <div className="rounded-xl border border-card-border bg-card-bg/70 p-4 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">Carga de partida</p>
            <p className="mt-1 text-xs text-text-secondary">
              Escolha sua rotina antes de comparar as horas sugeridas.
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
            {WEEKLY_LOAD_OPTIONS.map((option) => {
              const active = weeklyLoad === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWeeklyLoad(option.value)}
                  className={cn(
                    'min-h-[58px] rounded-lg border px-4 py-2 text-left transition-all',
                    active
                      ? 'border-neon-blue bg-neon-blue/15 text-text-primary shadow-glow-sm font-medium'
                      : 'border-card-border bg-surface-soft text-text-secondary hover:border-neon-blue/40 hover:text-text-primary'
                  )}
                >
                  <span className="block text-sm font-semibold text-text-primary">{option.label}</span>
                  <span className="block text-xs text-text-secondary">{option.helper}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        {presets.map((preset) => {
          const visualKey = resolvePresetVisualKey(preset.name);
          const Icon = presetIcons[visualKey] || Sparkles;
          const isSelected = selectedPreset === preset.id;
          const isExpanded = showDetails === preset.id;
          const moduleCount = preset.specificModules?.length || 0;
          const weeklyHours = preset.subjects.reduce((sum, s) => sum + s.recommendedWeeklyHours, 0);
          const adjustedWeeklyHours = adjustWeeklyHours(weeklyHours, weeklyLoad);

          return (
            <motion.div key={preset.id} whileHover={{ y: -4 }} className="relative group">
              <div 
                className={cn(
                  "absolute -inset-0.5 rounded-2xl blur-lg transition-all duration-500 opacity-0",
                  isSelected ? "opacity-30" : "group-hover:opacity-20"
                )}
                style={{ 
                  background: `linear-gradient(135deg, ${presetColors[visualKey]?.split(' ')[0]?.replace('from-', '') || 'var(--neon-blue)'}, transparent)` 
                }}
              />
              <Card
                className={cn(
                  'cursor-pointer transition-all duration-300 relative z-10 overflow-hidden',
                  isSelected 
                    ? 'border-neon-blue/60 bg-surface-panel/80 shadow-[0_0_30px_-5px_rgba(0,195,255,0.15)]' 
                    : 'border-card-border/50 hover:border-white/10 hover:bg-surface-panel/40'
                )}
                glow="none"
                onClick={() => {
                  setSelectedPreset(preset.id);
                  setShowDetails(isExpanded ? null : preset.id);
                  setShowWizard(false);
                }}
              >
                <div className="flex min-w-0 items-start gap-4 p-1">
                  <div
                    className={cn(
                      'flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-inner border border-white/5',
                      presetColors[visualKey] || 'from-neon-blue/20 to-neon-purple/20'
                    )}
                  >
                    <Icon className="h-7 w-7 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
                  </div>

                  <div className="min-w-0 flex-1 py-1">
                    <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                      <h3 className="min-w-0 truncate text-lg font-bold text-white tracking-tight">
                        {preset.name}
                      </h3>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-neon-blue shadow-glow-sm"
                        >
                          <Check className="h-3.5 w-3.5 text-black" />
                        </motion.div>
                      )}
                    </div>

                    <p className="mb-3 break-words text-[13px] leading-relaxed text-text-secondary/90">{preset.description}</p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-text-muted">
                      <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-neon-blue/70" /> {preset.subjects.length} disciplinas base</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-neon-cyan/70" /> {formatHoursDuration(adjustedWeeklyHours)}/sem na carga {getWeeklyLoadOption(weeklyLoad).label}</span>
                      {moduleCount > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-400/80">
                          <Sparkles className="h-3.5 w-3.5" />
                          {moduleCount} módulos
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-5 space-y-5 overflow-hidden border-t border-white/5 pt-5"
                    >
                      <div>
                        <div className="mb-4 rounded-xl border border-neon-blue/20 bg-neon-blue/5 p-4 relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-neon-blue/10 to-transparent pointer-events-none" />
                          <div className="relative z-10 flex gap-3 items-start">
                            <Sparkles className="w-4 h-4 text-neon-blue shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-white tracking-tight">Cálculo de Carga Inicial</p>
                              <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                                A carga {getWeeklyLoadOption(weeklyLoad).label.toLowerCase()} ajusta as horas base sugeridas para cada matéria.
                                Estes valores são apenas uma bússola inicial. Você poderá personalizar cada uma delas após a importação.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="w-4 h-4 text-text-secondary" />
                          <h4 className="text-sm font-bold text-white tracking-tight">Grade Curricular Comum</h4>
                        </div>
                        
                        <div className="space-y-3">
                          {groupSubjects(preset.subjects).map(([group, groupItems]) => (
                            <div key={group} className="rounded-xl border border-white/5 bg-surface-panel/30 p-3">
                              <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                                <div className="text-[13px] font-bold text-white uppercase tracking-wider">{group}</div>
                                <Badge size="sm" variant="default" className="bg-white/5 text-white border-white/10">
                                  {formatHoursDuration(
                                    adjustWeeklyHours(
                                      groupItems.reduce((sum, subject) => sum + subject.recommendedWeeklyHours, 0),
                                      weeklyLoad
                                    )
                                  )} ref.
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {groupItems.map((subject) => (
                                  <div
                                    key={subject.id}
                                    className="group/subject flex min-w-0 items-center justify-between gap-3 rounded-lg bg-surface-panel/50 p-2.5 transition-colors hover:bg-surface-panel"
                                  >
                                    <div className="min-w-0 flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan/50 group-hover/subject:bg-neon-cyan transition-colors" />
                                      <span className="min-w-0 truncate text-[13px] font-medium text-text-primary">{subject.name}</span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2.5">
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-text-muted">P{subject.priority}</span>
                                      <span className="text-[11px] font-medium text-text-muted w-14 text-right">
                                        {formatHoursDuration(adjustWeeklyHours(subject.recommendedWeeklyHours, weeklyLoad))}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {!!preset.specificModules?.length && (
                        <div className="pt-2">
                          <div className="flex items-center gap-2 mb-3">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            <h4 className="text-sm font-bold text-white tracking-tight">Trilhas Específicas (Opcionais)</h4>
                          </div>
                          <div className="space-y-3">
                            {preset.specificModules.map((module) => {
                              const isModuleSelected = selectedModules.has(module.id);
                              return (
                                <div
                                  key={module.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = new Set(selectedModules);
                                    if (next.has(module.id)) {
                                      next.delete(module.id);
                                    } else {
                                      next.add(module.id);
                                    }
                                    setSelectedModules(next);
                                  }}
                                  className={cn(
                                    "rounded-xl border p-4 transition-all cursor-pointer",
                                    isModuleSelected 
                                      ? "border-amber-400/50 bg-amber-500/15 shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]" 
                                      : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/30"
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <div className={cn(
                                        "flex h-4 w-4 items-center justify-center rounded-sm border transition-colors",
                                        isModuleSelected ? "border-amber-400 bg-amber-400" : "border-amber-500/50 bg-transparent"
                                      )}>
                                        {isModuleSelected && <Check className="h-3 w-3 text-black" />}
                                      </div>
                                      <div className={cn("text-sm font-bold transition-colors", isModuleSelected ? "text-amber-300" : "text-amber-400/90")}>{module.name}</div>
                                    </div>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/20">
                                      {module.subjects.length} disciplinas
                                    </span>
                                  </div>
                                  <p className="text-[13px] text-text-secondary mb-3 pl-6">{module.description}</p>
                                  <div className="flex flex-wrap gap-2 pl-6">
                                    {module.subjects.map((subject) => (
                                      <span
                                        key={subject.id}
                                        className={cn(
                                          "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                          isModuleSelected 
                                            ? "border-amber-400/30 bg-amber-400/20 text-amber-200"
                                            : "border-amber-500/15 bg-amber-500/10 text-amber-300"
                                        )}
                                      >
                                        {subject.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}

        <motion.div whileHover={{ y: -4 }}>
          <Card
            className={cn(
              'cursor-pointer transition-all duration-200',
              selectedPreset === 'custom'
                ? 'border-neon-cyan/50 ring-2 ring-neon-cyan'
                : 'hover:border-neon-cyan/30'
            )}
            onClick={() => {
              setSelectedPreset('custom');
              setShowDetails(null);
              setShowWizard(false);
            }}
          >
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-blue/20">
                <Sparkles className="h-8 w-8 text-neon-cyan" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                  <h3 className="min-w-0 truncate text-lg font-heading font-bold text-white">Personalizado</h3>
                  {selectedPreset === 'custom' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-neon-cyan"
                    >
                      <Check className="h-4 w-4 text-white" />
                    </motion.div>
                  )}
                </div>
                <p className="text-sm text-text-secondary">
                  Crie suas próprias disciplinas do zero com total controle
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </motion.div>
      )}

      <Card className="border-neon-blue/30 bg-neon-blue/10">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-neon-blue" />
          <div>
            <p className="mb-1 text-sm font-medium text-white">As predefinições são apenas sugestões</p>
            <p className="text-xs text-text-secondary">
              Você pode personalizar disciplinas, prioridades e horas depois de importar. O cronograma
              automático usa esses pesos para distribuir o tempo.
            </p>
          </div>
        </div>
      </Card>

      {selectedPresetData?.name === 'Medicina' && (
        <Card className="border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-100">
            O preset Medicina prioriza Natureza, depois Redação e Matemática, mantendo Linguagens e
            Humanas como suporte para vestibulares.
          </p>
        </Card>
      )}

      {selectedPresetData && normalizeComparableText(selectedPresetData.name).startsWith('concursos') && (
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <p className="text-sm text-yellow-100">
            O preset de Concursos importa a base comum. Módulos específicos aparecem como trilhas
            opcionais para expansão futura conforme edital.
          </p>
        </Card>
      )}

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Button variant="secondary" onClick={onSkip} className="w-full sm:w-auto">
          Pular esta etapa
        </Button>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {selectedPreset && selectedPreset !== 'custom' && (
            <Button
              variant="primary"
              onClick={() => setShowWizard(true)}
              disabled={isImporting}
              className="w-full sm:w-auto"
              leftIcon={isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            >
              {isImporting ? 'Importando...' : 'Configurar modelo'}
            </Button>
          )}
          {selectedPreset === 'custom' && (
            <Button variant="primary" onClick={onSkip} className="w-full sm:w-auto">
              Criar disciplinas manualmente
            </Button>
          )}
        </div>
      </div>

      <PresetConfigWizard
        isOpen={showWizard && !!selectedPreset && selectedPreset !== 'custom'}
        presetId={selectedPreset || ''}
        presetName={presets.find((preset) => preset.id === selectedPreset)?.name || 'Modelo'}
        baseSettings={baseSettings}
        onClose={() => setShowWizard(false)}
        onApply={(settings, studyPrefs, answers) => {
          void (async () => {
            await onApplyPreferences(settings, studyPrefs, answers);
            await handleImport(answers);
          })();
        }}
      />
    </div>
  );
}
