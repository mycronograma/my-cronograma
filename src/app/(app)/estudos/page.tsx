'use client';

/**
 * Página /estudos — Registro de estudos por matéria (estilo planilha).
 *
 * Uma linha por matéria com: último registro ("estudei X — parei em Y"),
 * onde parou na revisão, próxima revisão (inteligente e editável manualmente),
 * desempenho (acerto, questões, tendência) e histórico expansível.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  Pencil,
  Plus,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  X,
  Check,
  RotateCw,
} from 'lucide-react';
import { useLocalStorage } from '@/hooks';
import type { Subject } from '@/types';
import { cn } from '@/lib/utils';
import {
  addStudyLogEntry,
  deleteStudyLogEntry,
  formatRelativeReview,
  readReviewOverrides,
  setReviewOverride,
  smartReviewIntervalDays,
  summarizeSubject,
  updateStudyLogEntry,
  accuracyOf,
  type StudyLogEntry,
  type StudyLogKind,
  type SubjectStudySummary,
} from '@/lib/studyLog';

export default function EstudosPage() {
  const [subjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [entriesVersion, setEntriesVersion] = useState(0);
  const [modalSubject, setModalSubject] = useState<Subject | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeSubjects = useMemo(
    () => subjects.filter((s) => s.isActive !== false),
    [subjects]
  );

  const summaries = useMemo(() => {
    // entriesVersion força recálculo ao salvar/editar
    void entriesVersion;
    const overrides = readReviewOverrides();
    return activeSubjects.map((s) => ({
      subject: s,
      summary: summarizeSubject(s.id, undefined, overrides),
    }));
  }, [activeSubjects, entriesVersion]);

  const refresh = () => setEntriesVersion((v) => v + 1);

  if (!mounted) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-violet-400" />
          Registro de Estudos
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Anote o que estudou e onde parou — o app calcula sua próxima revisão.
        </p>
      </header>

      {activeSubjects.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-surface-panel p-6 text-center text-sm text-text-secondary">
          Nenhuma matéria ativa. Adicione matérias em <span className="font-semibold text-text-primary">Matérias</span>.
        </div>
      ) : (
        <div className="space-y-3">
          {summaries.map(({ subject, summary }) => (
            <SubjectStudyCard
              key={subject.id}
              subject={subject}
              summary={summary}
              expanded={expandedId === subject.id}
              onToggleExpand={() => setExpandedId(expandedId === subject.id ? null : subject.id)}
              onRegister={() => setModalSubject(subject)}
              editingReview={editingReviewId === subject.id}
              onEditReview={() => setEditingReviewId(editingReviewId === subject.id ? null : subject.id)}
              onSaveReview={(dateISO) => {
                setReviewOverride(subject.id, dateISO);
                setEditingReviewId(null);
                refresh();
              }}
              onClearOverride={() => {
                setReviewOverride(subject.id, null);
                setEditingReviewId(null);
                refresh();
              }}
              onDeleteEntry={(id) => {
                deleteStudyLogEntry(id);
                refresh();
              }}
              onEditEntry={(id, note) => {
                updateStudyLogEntry(id, { note });
                refresh();
              }}
            />
          ))}
        </div>
      )}

      {mounted && createPortal(
        <AnimatePresence>
          {modalSubject && (
            <RegisterStudyModal
              subject={modalSubject}
              onClose={() => setModalSubject(null)}
              onSaved={() => {
                setModalSubject(null);
                refresh();
              }}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/* ───────── Card por matéria ───────── */

function SubjectStudyCard(props: {
  subject: Subject;
  summary: SubjectStudySummary;
  expanded: boolean;
  onToggleExpand: () => void;
  onRegister: () => void;
  editingReview: boolean;
  onEditReview: () => void;
  onSaveReview: (dateISO: string) => void;
  onClearOverride: () => void;
  onDeleteEntry: (id: string) => void;
  onEditEntry: (id: string, note: string) => void;
}) {
  const { subject, summary } = props;
  const acc = summary.rollingAccuracy;
  const accPct = acc !== null ? Math.round(acc * 100) : null;
  const concluded = accPct !== null && accPct >= 80;

  return (
    <motion.div
      layout
      className="rounded-2xl border border-card-border bg-surface-panel p-4"
      style={{ borderLeftColor: subject.color, borderLeftWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
          <h2 className="font-bold text-text-primary truncate">{subject.name}</h2>
          {concluded && <span title="Matéria concluída (≥80% de acerto)">✅</span>}
        </div>
        <button
          onClick={props.onRegister}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold hover:from-violet-700 hover:to-indigo-700 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          Registrar estudo
        </button>
      </div>

      {/* Último registro */}
      {summary.lastContent ? (
        <p className="mt-2 text-sm text-text-secondary">
          <span className="text-text-muted text-xs uppercase tracking-wide font-semibold">Último estudo · </span>
          <span className="text-text-primary">{formatEntryDate(summary.lastContent.createdAt)}</span>
          {': '}
          <span className="italic">“{summary.lastContent.note}”</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-text-muted">Nenhum registro ainda — toque em “Registrar estudo”.</p>
      )}

      {/* Onde parou na revisão */}
      {summary.lastReview && (
        <p className="mt-1 text-sm text-text-secondary">
          <span className="text-text-muted text-xs uppercase tracking-wide font-semibold">Revisão · </span>
          <span className="italic">“{summary.lastReview.note}”</span>
        </p>
      )}

      {/* Linha de revisão + desempenho */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-text-secondary">
          <CalendarDays className="h-3.5 w-3.5 text-violet-400" />
          {summary.nextReviewDate ? (
            <>
              Próxima revisão: <strong className="text-text-primary">{formatRelativeReview(summary.nextReviewDate)}</strong>
              {summary.nextReviewManual && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300">manual</span>
              )}
              <button
                onClick={props.onEditReview}
                className="text-text-muted hover:text-violet-300 transition-colors"
                title="Editar data da próxima revisão"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </>
          ) : (
            <span className="text-text-muted">Sem revisão agendada</span>
          )}
        </span>

        <span className="inline-flex items-center gap-1.5 text-text-secondary">
          <Target className="h-3.5 w-3.5 text-emerald-400" />
          {summary.totalQuestions > 0 ? (
            <>
              Desempenho: <strong className="text-text-primary">{accPct}%</strong>
              <span className="text-text-muted">({summary.correctQuestions}/{summary.totalQuestions} questões)</span>
              {summary.trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
              {summary.trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
              {summary.trend === 'flat' && <Minus className="h-3.5 w-3.5 text-text-muted" />}
            </>
          ) : (
            <span className="text-text-muted">Sem questões registradas</span>
          )}
        </span>

        {accPct !== null && (
          <span className="flex-1 min-w-[80px] max-w-[140px] h-1.5 rounded-full bg-black/30 overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${accPct}%`, backgroundColor: subject.color }} />
          </span>
        )}

        <button
          onClick={props.onToggleExpand}
          className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors ml-auto"
        >
          Histórico
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', props.expanded && 'rotate-180')} />
        </button>
      </div>

      {/* Editor de revisão manual */}
      {props.editingReview && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <label className="text-xs text-text-secondary font-semibold">Nova data da revisão:</label>
          <input
            type="date"
            defaultValue={summary.nextReviewDate ? toISODate(summary.nextReviewDate) : ''}
            id={`review-date-${subject.id}`}
            className="h-9 rounded-lg bg-surface-panel border border-border-subtle px-2 text-sm text-text-primary"
          />
          <button
            onClick={() => {
              const el = document.getElementById(`review-date-${subject.id}`) as HTMLInputElement | null;
              if (el?.value) props.onSaveReview(el.value);
            }}
            className="h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold inline-flex items-center gap-1"
          >
            <Check className="h-3.5 w-3.5" /> Salvar
          </button>
          {summary.nextReviewManual && (
            <button
              onClick={props.onClearOverride}
              className="h-9 px-3 rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary text-xs font-semibold inline-flex items-center gap-1"
              title="Voltar a calcular automaticamente"
            >
              <RotateCw className="h-3.5 w-3.5" /> Automático
            </button>
          )}
        </div>
      )}

      {/* Histórico */}
      <AnimatePresence>
        {props.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1.5 border-t border-card-border pt-3">
              {summary.history.length === 0 && (
                <p className="text-xs text-text-muted">Nenhum registro ainda.</p>
              )}
              {summary.history.map((e) => (
                <HistoryRow
                  key={e.id}
                  entry={e}
                  color={subject.color}
                  onDelete={() => props.onDeleteEntry(e.id)}
                  onSaveNote={(note) => props.onEditEntry(e.id, note)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function HistoryRow(props: {
  entry: StudyLogEntry;
  color: string;
  onDelete: () => void;
  onSaveNote: (note: string) => void;
}) {
  const { entry } = props;
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(entry.note);
  const acc = accuracyOf(entry);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-xs">
      <span
        className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full"
        style={{ color: props.color, backgroundColor: `${props.color}18` }}
      >
        {entry.kind === 'revisao' ? 'Revisão' : 'Conteúdo'}
      </span>
      <span className="shrink-0 text-text-muted">{formatEntryDate(entry.createdAt)}</span>
      {editing ? (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 min-w-0 h-7 rounded-md bg-surface-panel border border-border-subtle px-2 text-text-primary"
          />
          <button
            onClick={() => {
              props.onSaveNote(note.trim());
              setEditing(false);
            }}
            className="text-emerald-400 hover:text-emerald-300"
            title="Salvar"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 min-w-0 truncate text-text-secondary italic">“{entry.note}”</span>
          {acc !== null && (
            <span className="shrink-0 text-text-muted">
              {Math.round(acc * 100)}% ({entry.correctAnswers}/{entry.totalQuestions})
            </span>
          )}
          <button onClick={() => setEditing(true)} className="shrink-0 text-text-muted hover:text-text-primary" title="Editar">
            <Pencil className="h-3 w-3" />
          </button>
        </>
      )}
      <button onClick={props.onDelete} className="shrink-0 text-text-muted hover:text-red-400" title="Excluir registro">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ───────── Modal de registro ───────── */

function RegisterStudyModal(props: { subject: Subject; onClose: () => void; onSaved: () => void }) {
  const { subject } = props;
  const [kind, setKind] = useState<StudyLogKind>('conteudo');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const [studied, setStudied] = useState('');
  const [stoppedAt, setStoppedAt] = useState('');
  const [correct, setCorrect] = useState('');
  const [total, setTotal] = useState('');

  const canSave = studied.trim().length > 0 || stoppedAt.trim().length > 0;

  const handleSave = () => {
    const parts = [studied.trim(), stoppedAt.trim()].filter(Boolean);
    const note = parts.length > 0 ? parts.join(' — parei em ') : '—';
    const totalQ = total.trim() === '' ? null : Math.max(0, parseInt(total, 10) || 0);
    const correctQ = correct.trim() === '' ? null : Math.max(0, parseInt(correct, 10) || 0);
    addStudyLogEntry({
      subjectId: subject.id,
      kind,
      note,
      correctAnswers: totalQ !== null ? Math.min(correctQ ?? 0, totalQ) : null,
      totalQuestions: totalQ !== null && totalQ > 0 ? totalQ : null,
    });
    props.onSaved();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={props.onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-card-border bg-surface-panel p-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-text-primary flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
            Registrar estudo — {subject.name}
          </h3>
          <button onClick={props.onClose} className="text-text-muted hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['conteudo', 'revisao'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                'h-10 rounded-xl text-sm font-semibold border transition-all',
                kind === k
                  ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                  : 'border-border-subtle bg-black/20 text-text-secondary hover:text-text-primary'
              )}
            >
              {k === 'conteudo' ? 'Conteúdo' : 'Revisão'}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              O que estudou?
            </label>
            <input
              value={studied}
              onChange={(e) => setStudied(e.target.value)}
              placeholder={kind === 'revisao' ? 'ex.: revisão de ortografia' : 'ex.: resumo constitucional 1.1-1.2'}
              className="mt-1 w-full h-10 rounded-xl bg-black/20 border border-border-subtle px-3 text-sm text-text-primary placeholder:text-text-muted/60"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Onde parou? {kind === 'revisao' && <span className="normal-case">(na revisão)</span>}
            </label>
            <input
              value={stoppedAt}
              onChange={(e) => setStoppedAt(e.target.value)}
              placeholder={kind === 'revisao' ? 'ex.: questão 40' : 'ex.: aula 1.6'}
              className="mt-1 w-full h-10 rounded-xl bg-black/20 border border-border-subtle px-3 text-sm text-text-primary placeholder:text-text-muted/60"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Acertos</label>
              <input
                value={correct}
                onChange={(e) => setCorrect(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="ex.: 34"
                className="mt-1 w-full h-10 rounded-xl bg-black/20 border border-border-subtle px-3 text-sm text-text-primary placeholder:text-text-muted/60"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Total de questões</label>
              <input
                value={total}
                onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="ex.: 40"
                className="mt-1 w-full h-10 rounded-xl bg-black/20 border border-border-subtle px-3 text-sm text-text-primary placeholder:text-text-muted/60"
              />
            </div>
          </div>
          {total.trim() !== '' && (
            <p className="text-[11px] text-text-muted">
              Próxima revisão automática: <strong className="text-text-primary">em {smartReviewIntervalDays(
                total.trim() === '' || parseInt(total, 10) === 0
                  ? null
                  : Math.min(parseInt(correct, 10) || 0, parseInt(total, 10)) / parseInt(total, 10)
              )} dia(s)</strong> conforme o acerto. Você pode mudar depois tocando na data.
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={props.onClose}
            className="flex-1 h-11 rounded-xl bg-black/20 border border-border-subtle text-text-secondary hover:text-text-primary text-sm font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Salvar registro
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ───────── helpers ───────── */

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / dayMs);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
