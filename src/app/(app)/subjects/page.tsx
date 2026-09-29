'use client';

/**
 * Subjects Manager Page
 * Gerenciar disciplinas com prioridade e dificuldade
 */

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clearClientStoreKeys } from '@/hooks/useLocalStorage';
import { motion, AnimatePresence } from 'framer-motion';
import QuestionLogModal from '@/components/analytics/QuestionLogModal';
import { applyQuestionBatch } from '@/services/adaptiveStudyIntelligence';
import {
  Plus,
  RefreshCw,
  AlertTriangle,
  BookOpen,
  Search,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { SubjectCard, SubjectForm, PresetSelector } from '@/components/subjects';
import { EmptySubjects } from '@/components/onboarding';
import { useOnboarding, useLocalStorage } from '@/hooks';
import { cn, formatHoursDuration, generateId, parseBlockDate } from '@/lib/utils';
import {
  createEnemSubjectBank,
  isEnemGoal,
  upgradeSubjectsToOfficialEnemStructure,
} from '@/lib/enemCatalog';
import { getCanonicalSubjectName, getCuratedPresetById } from '@/lib/presetCatalog';
import type {
  PresetWizardAnswers,
  StudyBlock,
  Subject,
  StudyPreferences,
  UserSettings,
  AnalyticsStore,
} from '@/types';
import { defaultSettings } from '@/lib/defaultSettings';
import { computeStudyPreferences } from '@/services/presetConfigurator';

// Dados mockados das disciplinas
const initialSubjects: Subject[] = [];

// Variantes de animação
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

type ImportedSubjectApi = {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string;
  priority: number;
  difficulty: number;
  targetHours: number;
  completedHours?: number;
  totalHours?: number;
  sessionsCount?: number;
  averageScore?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SerializedBlockApi = Omit<
  StudyBlock,
  'date' | 'originalDate' | 'completedAt' | 'createdAt' | 'updatedAt' | 'subject'
> & {
  date: string;
  originalDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  subject?: (Omit<Subject, 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
  }) | undefined;
};

type PresetWeeklyLoad = 'leve' | 'normal' | 'intensivo';

const PRESET_WEEKLY_LOAD_MULTIPLIERS: Record<PresetWeeklyLoad, number> = {
  leve: 0.55,
  normal: 0.75,
  intensivo: 1,
};

function adjustPresetTargetHours(hours: number, weeklyLoad: PresetWeeklyLoad = 'leve') {
  if (hours <= 0) return 0;
  return Math.max(0.5, Math.round(hours * PRESET_WEEKLY_LOAD_MULTIPLIERS[weeklyLoad] * 2) / 2);
}

function SubjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { markFirstSubjectAdded, hasAddedFirstSubject } = useOnboarding();
  const [subjects, setSubjects] = useLocalStorage<Subject[]>('nexora_subjects', initialSubjects);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') ?? '');
  // ?preset=1 vem da "Trocar predefinição" da Zona de Perigo (progresso já zerado).
  const presetParam = searchParams.get('preset');

  useEffect(() => {
    setSearchQuery(searchParams.get('search') ?? '');
  }, [searchParams]);

  useEffect(() => {
    if (presetParam === '1') setShowPresetSelector(true);
  }, [presetParam]);
  const [showForm, setShowForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | undefined>();
  const [showPresetSelector, setShowPresetSelector] = useState(false);
  const [autoOpenedPresetSelector, setAutoOpenedPresetSelector] = useState(false);
  const [, setIsLoading] = useState(false);
  const [studyPrefs, setStudyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', {
    hoursPerDay: 2,
    daysOfWeek: [1, 2, 3, 4, 5],
    mode: 'random' as 'random' | 'exam',
    examDate: '',
  });
  const [userSettings, setUserSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);
  const [, setPlannerBlocks] = useLocalStorage<StudyBlock[]>('nexora_planner_blocks', []);
  // Gravável: o registro avulso de questões (#10) escreve no perfil de acerto.
  const [, setAnalytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', { daily: {} });
  const [, setScheduleRange] = useLocalStorage<{ startDate: string; endDate: string } | null>(
    'nexora_schedule_range',
    null
  );
  const [firstCycleAllSubjects, setFirstCycleAllSubjects] = useLocalStorage<boolean>('nexora_first_cycle_all_subjects', true);
  const [dailyLimits] = useLocalStorage<Record<string, number>>('nexora_daily_limits', {});
  const [importPresetError, setImportPresetError] = useState<string | null>(null);
  const [pendingDeleteSubject, setPendingDeleteSubject] = useState<Subject | null>(null);

  // Mostrar preset selector automaticamente quando não há disciplinas
  useEffect(() => {
    // Se já abriu automaticamente e agora tem disciplinas, fechar
    if (autoOpenedPresetSelector && subjects.length > 0) {
      setShowPresetSelector(false);
      return;
    }

    // Se não tem disciplinas, não adicionou primeira disciplina e não abriu ainda
    if (subjects.length === 0 && !hasAddedFirstSubject && !autoOpenedPresetSelector) {
      setShowPresetSelector(true);
      setAutoOpenedPresetSelector(true);
    }
  }, [subjects.length, hasAddedFirstSubject, autoOpenedPresetSelector]);

  useEffect(() => {
    if (!isEnemGoal(studyPrefs.goal)) return;
    if (subjects.length === 0) return;

    const upgraded = upgradeSubjectsToOfficialEnemStructure(subjects);
    const changed =
      upgraded.length !== subjects.length ||
      upgraded.some((subject, index) => {
        const current = subjects[index];
        if (!current) return true;
        return (
          subject.id !== current.id ||
          subject.name !== current.name ||
          subject.area !== current.area ||
          subject.pesoNoExame !== current.pesoNoExame ||
          subject.icon !== current.icon
        );
      });

    if (changed) {
      setSubjects(upgraded);
    }
  }, [studyPrefs.goal, subjects, setSubjects]);

  // Mock presets data for local import (when database is not configured)
  const mockPresetsData: Record<string, { name: string; priority: number; difficulty: number; targetHours: number }[]> = {
    'enem': [
      { name: 'Matemática', priority: 10, difficulty: 8, targetHours: 12 },
      { name: 'Redação', priority: 10, difficulty: 6, targetHours: 8 },
      { name: 'Português / Linguagens', priority: 8, difficulty: 6, targetHours: 10 },
      { name: 'Biologia', priority: 8, difficulty: 6, targetHours: 8 },
      { name: 'Física', priority: 8, difficulty: 8, targetHours: 8 },
      { name: 'Química', priority: 8, difficulty: 8, targetHours: 8 },
      { name: 'História', priority: 6, difficulty: 4, targetHours: 6 },
      { name: 'Geografia', priority: 6, difficulty: 4, targetHours: 6 },
      { name: 'Filosofia', priority: 6, difficulty: 4, targetHours: 4 },
      { name: 'Sociologia', priority: 6, difficulty: 4, targetHours: 4 },
    ],
    'medicina': [
      { name: 'Biologia Avançada', priority: 10, difficulty: 10, targetHours: 15 },
      { name: 'Química Avançada', priority: 10, difficulty: 10, targetHours: 12 },
      { name: 'Física', priority: 8, difficulty: 8, targetHours: 10 },
      { name: 'Matemática', priority: 8, difficulty: 8, targetHours: 10 },
      { name: 'Redação', priority: 8, difficulty: 6, targetHours: 8 },
      { name: 'Português', priority: 6, difficulty: 4, targetHours: 6 },
      { name: 'História', priority: 4, difficulty: 4, targetHours: 4 },
      { name: 'Geografia', priority: 4, difficulty: 4, targetHours: 4 },
    ],
    'concursos': [
      { name: 'Português', priority: 10, difficulty: 6, targetHours: 12 },
      { name: 'Raciocínio Lógico', priority: 8, difficulty: 8, targetHours: 10 },
      { name: 'Direito Constitucional', priority: 8, difficulty: 6, targetHours: 8 },
      { name: 'Direito Administrativo', priority: 8, difficulty: 6, targetHours: 8 },
      { name: 'Informática', priority: 6, difficulty: 4, targetHours: 6 },
      { name: 'Atualidades', priority: 6, difficulty: 4, targetHours: 6 },
    ],
  };

  const subjectColors = [
    '#00B4FF', '#7F00FF', '#00FFC8', '#FF00AA', 
    '#FFAA00', '#00FF88', '#FF5555', '#AA88FF',
    '#00DDFF', '#FF6600'
  ];

  const mergeImportedSubjects = (currentSubjects: Subject[], incomingSubjects: Subject[]) => {
    const merged = new Map<string, Subject>();

    for (const subject of currentSubjects) {
      merged.set(getCanonicalSubjectName(subject.name), subject);
    }

    for (const incoming of incomingSubjects) {
      const canonical = getCanonicalSubjectName(incoming.name);
      const existing = merged.get(canonical);

      if (!existing) {
        merged.set(canonical, incoming);
        continue;
      }

      merged.set(canonical, {
        ...existing,
        ...incoming,
        id: existing.id,
        userId: existing.userId,
        completedHours: existing.completedHours,
        totalHours: existing.totalHours,
        sessionsCount: existing.sessionsCount,
        averageScore: existing.averageScore,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      });
    }

    return Array.from(merged.values());
  };

  const deserializeBlock = (raw: SerializedBlockApi): StudyBlock => ({
    ...raw,
    date: parseBlockDate(raw.date),
    originalDate: raw.originalDate ? parseBlockDate(raw.originalDate) : undefined,
    completedAt: raw.completedAt ? new Date(raw.completedAt) : undefined,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    subject: raw.subject
      ? {
          ...raw.subject,
          createdAt: new Date(raw.subject.createdAt),
          updatedAt: new Date(raw.subject.updatedAt),
        }
      : raw.subject,
  });

  const regenerateScheduleFromWizard = async (
    mergedSubjects: Subject[],
    wizardAnswers: PresetWizardAnswers
  ) => {
    if (mergedSubjects.length === 0) return;

    const computed = computeStudyPreferences(userSettings, wizardAnswers);
    const firstCycleMode =
      typeof wizardAnswers.firstCycleAllSubjects === 'boolean'
        ? wizardAnswers.firstCycleAllSubjects
        : firstCycleAllSubjects;
    const startKey = wizardAnswers.startDate || toLocalDateKey(new Date());
    const startDate = new Date(`${startKey}T00:00:00`);
    const safeStart = Number.isNaN(startDate.getTime()) ? new Date() : startDate;
    safeStart.setHours(0, 0, 0, 0);
    let endDate: Date;
    if (wizardAnswers.endDate) {
      const parsedEnd = new Date(`${wizardAnswers.endDate}T00:00:00`);
      endDate = Number.isNaN(parsedEnd.getTime()) ? new Date(safeStart.getTime() + 6 * 86400000) : parsedEnd;
      if (endDate < safeStart) endDate = new Date(safeStart);
    } else {
      endDate = new Date(safeStart);
      endDate.setDate(endDate.getDate() + 6);
    }
    endDate.setHours(0, 0, 0, 0);

    const requestedRange = {
      startDate: toLocalDateKey(safeStart),
      endDate: toLocalDateKey(endDate),
    };

    try {
      const response = await fetch('/api/planner/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: mergedSubjects,
          studyPrefs: computed.studyPrefs,
          userSettings: computed.settings,
          scheduleRange: requestedRange,
          firstCycleAllSubjects: firstCycleMode,
          dailyLimits,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao regenerar cronograma');
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.data?.blocks)) {
        throw new Error(data.error || 'Resposta invalida da regeneracao');
      }

      setPlannerBlocks(data.data.blocks.map(deserializeBlock));
      if (data.data.scheduleRange?.startDate && data.data.scheduleRange?.endDate) {
        setScheduleRange(data.data.scheduleRange);
      } else {
        setScheduleRange(requestedRange);
      }
    } catch (error) {
      console.warn('Falha ao regenerar cronograma imediatamente:', error);
      setScheduleRange(requestedRange);
    } finally {
      router.refresh();
    }
  };

  // Handler para importar preset
  const [presetSwitchConfirm, setPresetSwitchConfirm] = useState(false);
  const [showQuestionLog, setShowQuestionLog] = useState(false);
  const [questionLogSubject, setQuestionLogSubject] = useState<Subject | null>(null);

  // Trocar de predefinição com matérias já cadastradas zera o progresso,
  // então pede confirmação antes de abrir o seletor.
  const handleImportPresetClick = () => {
    if (subjects.length > 0) {
      setPresetSwitchConfirm(true);
      return;
    }
    setShowPresetSelector(true);
  };

  const confirmPresetSwitch = () => {
    clearClientStoreKeys([
      'nexora_subjects',
      'nexora_planner_blocks',
      'nexora_analytics',
      'nexora_reported_sessions',
      'nexora_study_prefs',
    ]);
    setSubjects([]);
    setPlannerBlocks([]);
    setPresetSwitchConfirm(false);
    setShowPresetSelector(true);
  };

  const handleSaveQuestionLog = (payload: {
    subjectId: string;
    totalQuestions: number;
    correctAnswers: number;
    date: Date;
    sessionType: 'EXERCICIOS' | 'SIMULADO';
  }) => {
    const subject = subjects.find((s) => s.id === payload.subjectId);
    if (!subject) return;
    setAnalytics((prev) =>
      applyQuestionBatch({
        analytics: prev,
        subject,
        totalQuestions: payload.totalQuestions,
        correctAnswers: payload.correctAnswers,
        date: payload.date,
        sessionType: payload.sessionType,
      })
    );
    setShowQuestionLog(false);
    setQuestionLogSubject(null);
  };

  const handleImportPreset = async (
    presetId: string,
    options?: { source: 'api' | 'local'; wizardAnswers?: PresetWizardAnswers; weeklyLoad?: PresetWeeklyLoad; selectedModules?: string[] }
  ) => {
    setImportPresetError(null);
    setIsLoading(true);
    try {
      // First try API
      if (options?.source !== 'local') {
        try {
          const response = await fetch(`/api/presets/${presetId}/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              wizardAnswers: options?.wizardAnswers,
              weeklyLoad: options?.weeklyLoad,
            }),
          });

          if (response.ok) {
            const data = await response.json();

            if (data.success && data.data?.subjects?.length > 0) {
              const importedSubjects: Subject[] = (data.data.subjects as ImportedSubjectApi[]).map((s) => ({
                id: s.id,
                userId: s.userId,
                name: s.name,
                color: s.color,
                icon: s.icon,
                priority: s.priority,
                difficulty: s.difficulty,
                targetHours: s.targetHours,
                completedHours: s.completedHours || 0,
                totalHours: s.totalHours || 0,
                sessionsCount: s.sessionsCount || 0,
                averageScore: s.averageScore || 0,
                proficiencyScore: 0,
                examWeight: s.priority || 5,
                isActive: s.isActive,
                createdAt: new Date(s.createdAt),
                updatedAt: new Date(s.updatedAt),
              }));
              const normalizedImported =
                presetId === 'enem' || isEnemGoal(studyPrefs.goal)
                  ? upgradeSubjectsToOfficialEnemStructure(importedSubjects)
                  : importedSubjects;

              const mergedSubjects = mergeImportedSubjects(subjects, normalizedImported);
              setSubjects(mergedSubjects);
              setShowPresetSelector(false);
              markFirstSubjectAdded();
              if (options?.wizardAnswers) {
                await regenerateScheduleFromWizard(mergedSubjects, options.wizardAnswers);
              } else {
                router.refresh();
              }
              return;
            }
          }
        } catch (_apiError) {
        }
      }

      // Fallback to local mock data (ENEM) or curated catalog (Medicina/Concursos)
      const curatedPresetSubjects = getCuratedPresetById(presetId)?.subjects;
      const presetData = presetId === 'enem' ? mockPresetsData[presetId] : curatedPresetSubjects;
      if (!presetData) {
        throw new Error('Preset não encontrado');
      }

      const importedSubjects: Subject[] =
        presetId === 'enem'
          ? createEnemSubjectBank('user1').map((subject) => ({
              ...subject,
              targetHours: adjustPresetTargetHours(subject.targetHours, options?.weeklyLoad),
            }))
          : (curatedPresetSubjects || []).map((s, index) => ({
              id: generateId(),
              userId: 'user1',
              name: s.name,
              color: subjectColors[index % subjectColors.length],
              icon: 'book',
              priority: Math.min(10, Math.max(1, s.priority * 2)),
              difficulty: Math.min(10, Math.max(1, s.difficulty * 2)),
              targetHours: adjustPresetTargetHours(s.recommendedWeeklyHours, options?.weeklyLoad),
              completedHours: 0,
              totalHours: 0,
              sessionsCount: 0,
              averageScore: 0,
              proficiencyScore: 0,
              examWeight: Math.min(10, Math.max(1, s.priority * 2)),
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

      // Adicionar módulos selecionados
      if (options?.selectedModules && options.selectedModules.length > 0 && presetId !== 'enem') {
        const curatedPreset = getCuratedPresetById(presetId);
        if (curatedPreset && curatedPreset.specificModules) {
          const selectedSpecificModules = curatedPreset.specificModules.filter(m => options.selectedModules!.includes(m.id));
          for (const presetModule of selectedSpecificModules) {
            const moduleSubjects: Subject[] = presetModule.subjects.map((s, index) => ({
              id: generateId(),
              userId: 'user1',
              name: s.name,
              color: subjectColors[(importedSubjects.length + index) % subjectColors.length],
              icon: 'book',
              priority: Math.min(10, Math.max(1, s.priority * 2)),
              difficulty: Math.min(10, Math.max(1, s.difficulty * 2)),
              targetHours: adjustPresetTargetHours(s.recommendedWeeklyHours, options?.weeklyLoad),
              completedHours: 0,
              totalHours: 0,
              sessionsCount: 0,
              averageScore: 0,
              proficiencyScore: 0,
              examWeight: Math.min(10, Math.max(1, s.priority * 2)),
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
            importedSubjects.push(...moduleSubjects);
          }
        }
      }

      const mergedSubjects = mergeImportedSubjects(subjects, importedSubjects);
      setSubjects(mergedSubjects);
      setShowPresetSelector(false);
      markFirstSubjectAdded();
      if (options?.wizardAnswers) {
        await regenerateScheduleFromWizard(mergedSubjects, options.wizardAnswers);
      } else {
        router.refresh();
      }

    } catch (error) {
      console.error('Error importing preset:', error);
      setImportPresetError(`Erro ao importar predefinição: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreferences = async (
    settings: UserSettings,
    prefs: StudyPreferences,
    answers: PresetWizardAnswers
  ) => {
    setUserSettings(settings);
    setStudyPrefs(prefs);
    if (typeof answers.firstCycleAllSubjects === 'boolean') {
      setFirstCycleAllSubjects(answers.firstCycleAllSubjects);
    }
    const startKey = answers.startDate || toLocalDateKey(new Date());
    const startDate = new Date(`${startKey}T00:00:00`);
    if (!Number.isNaN(startDate.getTime())) {
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      setScheduleRange({
        startDate: startKey,
        endDate: toLocalDateKey(endDate),
      });
    }
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, studyPrefs: prefs }),
      });
    } catch (error) {
      console.warn('Falha ao salvar preferências no servidor:', error);
    }
  };

  // Handler para pular seleção de preset
  const handleSkipPreset = () => {
    setShowPresetSelector(false);
  };


  // Filtrar disciplinas
  const filteredSubjects = subjects.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Ordenar por prioridade (maior primeiro)
  const sortedSubjects = [...filteredSubjects].sort(
    (a, b) => b.priority - a.priority
  );

  const handleAddSubject = () => {
    setEditingSubject(undefined);
    setShowForm(true);
  };

  const handleEditSubject = (subject: Subject) => {
    setEditingSubject(subject);
    setShowForm(true);
  };

  const handleDeleteSubject = (subjectId: string) => {
    const target = subjects.find((subject) => subject.id === subjectId);
    if (!target) return;
    setPendingDeleteSubject(target);
  };

  const confirmDeleteSubject = () => {
    if (!pendingDeleteSubject) return;
    const deletedId = pendingDeleteSubject.id;
    setSubjects((prev) => prev.filter((subject) => subject.id !== deletedId));
    setPlannerBlocks((prev) => prev.filter((block) => block.subjectId !== deletedId));
    setPendingDeleteSubject(null);
  };

  const handleFormSubmit = (data: Partial<Subject>) => {
    // Validação dos campos obrigatórios
    if (!data.name || data.name.trim().length === 0) {
      alert('Nome da disciplina é obrigatório');
      return;
    }
    const normalizedNewName = getCanonicalSubjectName(data.name.trim());
    const duplicate = subjects.some(
      (s) => getCanonicalSubjectName(s.name) === normalizedNewName && s.id !== editingSubject?.id
    );
    if (duplicate) {
      alert('Já existe uma disciplina com esse nome');
      return;
    }
    if (data.priority !== undefined && (data.priority < 1 || data.priority > 10)) {
      alert('Prioridade deve estar entre 1 e 10');
      return;
    }
    if (data.difficulty !== undefined && (data.difficulty < 1 || data.difficulty > 10)) {
      alert('Dificuldade deve estar entre 1 e 10');
      return;
    }
    if (data.targetHours !== undefined && data.targetHours < 0) {
      alert('Meta de horas não pode ser negativa');
      return;
    }

    if (editingSubject) {
      // Atualizar existente
      setSubjects((prev) =>
        prev.map((s) =>
          s.id === editingSubject.id
            ? { ...s, ...data, updatedAt: new Date() }
            : s
        )
      );
    } else {
      // Criar nova
      const newSubject: Subject = {
        id: generateId(),
        userId: 'user1',
        name: data.name.trim(),
        color: data.color || '#00B4FF',
        icon: 'book',
        priority: data.priority ?? 5,
        difficulty: data.difficulty ?? 5,
        targetHours: data.targetHours ?? 10,
        targetHoursIsManual: data.targetHoursIsManual ?? false,
        completedHours: 0,
        totalHours: 0,
        sessionsCount: 0,
        averageScore: 0,
        proficiencyScore: 0,
        examWeight: data.priority ?? 5,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setSubjects((prev) => [...prev, newSubject]);
      
      // Marcar que o usuário adicionou a primeira disciplina
      markFirstSubjectAdded();
    }
    setShowForm(false);
  };

  // Peso das outras matérias: permite ao formulário dizer qual fatia da carga
  // semanal esta disciplina deve receber (prioridade 60% + dificuldade 40%).
  const peerWeightSum = useMemo(
    () =>
      subjects.reduce((sum, s) => {
        if (editingSubject && s.id === editingSubject.id) return sum;
        const p = Math.min(10, Math.max(1, s.priority || 5));
        const d = Math.min(10, Math.max(1, s.difficulty || 5));
        return sum + (0.6 * p + 0.4 * d) / 10;
      }, 0),
    [subjects, editingSubject]
  );

  // Calcular totais
  const weeklyGoalFromPrefs = userSettings.dailyHoursByWeekday
    ? Object.values(userSettings.dailyHoursByWeekday).reduce((sum, value) => sum + value, 0)
    : studyPrefs.hoursPerDay * studyPrefs.daysOfWeek.length;
  // Soma real das metas das matérias. Antes o cabeçalho mostrava a capacidade
  // configurada, então dizia "Meta Semanal: 20h" mesmo com as matérias somando 34h.
  const totalTargetHours = subjects.reduce((sum, s) => sum + (s.targetHours || 0), 0);
  const capacityHours = weeklyGoalFromPrefs > 0 ? weeklyGoalFromPrefs : 0;
  const weeklyOverflow = capacityHours > 0 ? Math.max(0, totalTargetHours - capacityHours) : 0;
  const totalCompletedHours = subjects.reduce(
    (sum, s) => sum + s.completedHours,
    0
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="app-page"
    >
      {/* Cabeçalho */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-heading font-bold text-white">
            Disciplinas
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Gerencie suas matérias e metas de estudo
          </p>
        </div>

        <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2 sm:gap-3">
          {!showPresetSelector && (
            <Button
              variant="secondary"
              onClick={handleImportPresetClick}
              className="w-full sm:w-auto"
             
            >
              {subjects.length === 0 ? 'Usar Predefinição' : 'Trocar Predefinição'}
            </Button>
          )}
          {!showPresetSelector && (
            <Button
              variant="primary"
              onClick={handleAddSubject}
              leftIcon={<Plus className="w-4 h-4" />}
              className="w-full sm:w-auto"
             
            >
              Adicionar Disciplina
            </Button>
          )}
        </div>
      </div>

      {importPresetError && (
        <Card className="border border-red-400/30 bg-red-500/10 p-3 text-sm text-danger">
          {importPresetError}
        </Card>
      )}

      {/* Trocar predefinição: avisa que o progresso será zerado */}
      {presetSwitchConfirm && (
        <Card className="border border-warning bg-warning-soft p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-heading font-bold text-text-primary">
                Trocar de predefinição zera todo o progresso
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Suas {subjects.length} disciplinas atuais, os blocos da agenda e todo o histórico de
                estudo serão apagados para o novo plano ser gerado do zero. Essa ação não pode ser
                desfeita.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={confirmPresetSwitch}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Zerar e escolher nova predefinição
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setPresetSwitchConfirm(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Barra de Estatísticas */}
      {subjects.length > 0 && (
        <Card padding="sm">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Busca */}
            <div className="relative w-full min-w-0 sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar disciplinas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10 w-full sm:w-64 py-2 text-sm"
              />
            </div>

            {/* Resumo das Estatísticas */}
            <div className="flex min-w-0 flex-wrap items-center gap-4 text-sm sm:gap-6">
              <div>
                <span className="text-text-secondary">Total: </span>
                <span className="font-bold text-white">{subjects.length}</span>
              </div>
              <div>
                <span className="text-text-secondary">Meta Semanal: </span>
                <span className={cn('font-bold', weeklyOverflow > 0 ? 'text-warning' : 'text-white')}>
                  {formatHoursDuration(totalTargetHours)}
                </span>
                {capacityHours > 0 && (
                  <span className="text-text-muted"> / {formatHoursDuration(capacityHours)} disponíveis</span>
                )}
              </div>
              <div>
                <span className="text-text-secondary">Concluído: </span>
                <span className="font-bold text-neon-cyan">
                  {formatHoursDuration(totalCompletedHours)}
                </span>
              </div>
            </div>
            {weeklyOverflow > 0 && (
              <p className="mt-3 rounded-xl border border-warning bg-warning-soft p-3 text-xs text-warning-strong">
                Suas matérias somam {formatHoursDuration(totalTargetHours)}, mas você tem{' '}
                {formatHoursDuration(capacityHours)} por semana — faltam{' '}
                {formatHoursDuration(weeklyOverflow)}. Baixe o peso de alguma matéria, reduza uma meta
                ou aumente as horas em Ajustes.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Preset Selector */}
      {showPresetSelector ? (
        <div className="space-y-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="min-w-0 text-xl font-heading font-bold text-white">
              Selecionar Predefinição
            </h2>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPresetSelector(false);
              }}
            >
              Cancelar
            </Button>
          </div>
          <PresetSelector
            onImport={handleImportPreset}
            onSkip={handleSkipPreset}
            userId="user1" // Mock - em produção viria do contexto
            baseSettings={userSettings}
            onApplyPreferences={handleApplyPreferences}
          />
        </div>
      ) : subjects.length === 0 ? (
        <Card className="py-12">
          <EmptySubjects onAddSubject={handleAddSubject} />
        </Card>
      ) : sortedSubjects.length === 0 ? (
        <Card className="py-12 text-center">
          <BookOpen className="w-16 h-16 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-heading font-bold text-white mb-2">
            Nenhuma disciplina encontrada
          </h3>
          <p className="text-text-secondary mb-6">
            Tente um termo de busca diferente
          </p>
        </Card>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {sortedSubjects.map((subject) => (
            <motion.div key={subject.id} variants={itemVariants} className="min-w-0">
              <SubjectCard
                subject={subject}
                onEdit={handleEditSubject}
                onLogQuestions={(sub) => {
                setQuestionLogSubject(sub);
                setShowQuestionLog(true);
              }}
              onDelete={handleDeleteSubject}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Registro avulso de questões (#10) */}
      <AnimatePresence>
        {showQuestionLog && (
          <QuestionLogModal
            subjects={subjects}
            initialSubjectId={questionLogSubject?.id}
            onClose={() => {
              setShowQuestionLog(false);
              setQuestionLogSubject(null);
            }}
            onSave={handleSaveQuestionLog}
          />
        )}
      </AnimatePresence>

      {/* Modal do Formulário de Disciplina */}
      <AnimatePresence>
        {showForm && (
          <SubjectForm
            subject={editingSubject}
            onSubmit={handleFormSubmit}
            onCancel={() => setShowForm(false)}
            weeklyAvailableHours={weeklyGoalFromPrefs}
            peerWeightSum={peerWeightSum}
            peers={subjects.map((s) => ({
              id: s.id,
              priority: s.priority,
              difficulty: s.difficulty,
              targetHours: s.targetHours,
              targetHoursIsManual: s.targetHoursIsManual,
            }))}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingDeleteSubject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="app-modal-overlay"
            onClick={() => setPendingDeleteSubject(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="app-modal-panel max-w-md"
              onClick={(event) => event.stopPropagation()}
            >
              <Card className="space-y-4 p-5">
                <h3 className="text-lg font-semibold text-white">Excluir disciplina</h3>
                <p className="text-sm text-text-secondary">
                  Tem certeza que deseja excluir{' '}
                  <span className="font-semibold text-white">{pendingDeleteSubject.name}</span>?
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setPendingDeleteSubject(null)}>
                    Cancelar
                  </Button>
                  <Button variant="danger" onClick={confirmDeleteSubject}>
                    Excluir
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}

export default function SubjectsPage() {
  return (
    <Suspense fallback={null}>
      <SubjectsPageContent />
    </Suspense>
  );
}








