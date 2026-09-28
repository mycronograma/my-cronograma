import type { AnalyticsStore, StudyBlock, StudyPreferences, Subject, UserSettings } from '@/types';

/**
 * Coach adaptativo — sugestões baseadas em evidência real.
 *
 * Regra de ouro: **o card só aparece quando há algo concreto a ajustar**.
 * Antes ele mostrava sempre uma sugestão genérica com um percentual de erro
 * inventado (o app não sabia quantas questões o usuário errou). Agora os
 * sinais vêm de dados que o app realmente coleta:
 *
 *  1. Ritmo caindo  — horas estudadas nos últimos 7 dias vs. os 7 anteriores.
 *  2. Matéria pulada — blocos com status `skipped` por matéria.
 *  3. Foco caindo   — aderência ao tempo planejado (tempo feito ÷ tempo previsto).
 *
 * Cada sugestão traz um número verificável e uma ação que muda de verdade a
 * configuração. Sem sinal ≥ limite, nenhum card é renderizado.
 */

export type CoachActionKind = 'reduce-subject' | 'reduce-goal' | 'shorten-blocks';

export interface CoachSuggestion {
  id: string;
  /** Título curto, ex.: "Ritmo caindo". */
  title: string;
  /** Evidência com números reais. */
  evidence: string;
  /** Texto do botão principal. */
  actionLabel: string;
  actionKind: CoachActionKind;
  /** Matéria afetada (quando aplicável). */
  subjectId?: string;
  /** Meta semanal sugerida para a matéria. */
  suggestedTargetHours?: number;
  /** Meta semanal total sugerida. */
  suggestedWeeklyHours?: number;
  /** Duração de bloco sugerida, em minutos. */
  suggestedBlockMinutes?: number;
  /** Texto do botão de dispensar. */
  dismissLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function hoursInRange(daily: AnalyticsStore['daily'], from: Date, to: Date): number {
  let total = 0;
  for (const [dateKey, record] of Object.entries(daily ?? {})) {
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!year || !month || !day) continue;
    const time = new Date(year, month - 1, day).getTime();
    if (time >= from.getTime() && time <= to.getTime()) total += record.hours || 0;
  }
  return total;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Meta semanal atual: soma das horas por dia da semana. */
export function currentWeeklyGoal(userSettings: UserSettings, studyPrefs: StudyPreferences): number {
  if (userSettings.dailyHoursByWeekday) {
    const sum = Object.values(userSettings.dailyHoursByWeekday).reduce((sum, value) => sum + (value || 0), 0);
    if (sum > 0) return sum;
  }
  return studyPrefs.hoursPerDay * studyPrefs.daysOfWeek.length;
}

export function buildCoachSuggestion(params: {
  subjects: Subject[];
  plannerBlocks: StudyBlock[];
  analytics: AnalyticsStore;
  studyPrefs: StudyPreferences;
  userSettings: UserSettings;
  now?: Date;
}): CoachSuggestion | null {
  const { subjects, plannerBlocks, analytics, studyPrefs, userSettings } = params;
  const now = params.now ?? new Date();
  if (subjects.length === 0) return null;

  // ---------- Sinal 1: ritmo caindo ----------
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const prevWeekStart = new Date(now.getTime() - 14 * DAY_MS);
  const lastWeekHours = hoursInRange(analytics.daily, weekStart, now);
  const prevWeekHours = hoursInRange(analytics.daily, prevWeekStart, weekStart);

  // Só compara quando há histórico real dos dois lados: com 0h antes e 3h agora
  // não existe "queda", e com 0h agora pode ser apenas o começo da semana.
  if (prevWeekHours >= 3 && lastWeekHours < prevWeekHours * 0.7) {
    const drop = Math.round((1 - lastWeekHours / prevWeekHours) * 100);
    const realistic = Math.max(1, Math.round(lastWeekHours * 1.1));
    return {
      id: 'pace-drop',
      title: 'Ritmo caindo',
      evidence: `Você estudou ${formatHours(lastWeekHours)} nos últimos 7 dias, contra ${formatHours(
        prevWeekHours
      )} na semana anterior (${drop}% menos).`,
      actionLabel: `Ajustar meta semanal para ${formatHours(realistic)}`,
      actionKind: 'reduce-goal',
      suggestedWeeklyHours: realistic,
      dismissLabel: 'Manho meta atual',
    };
  }

  // ---------- Sinal 2: matéria sendo pulada ----------
  const skippedBySubject = new Map<string, number>();
  for (const block of plannerBlocks) {
    if (block.status !== 'skipped' || block.isBreak) continue;
    const blockDate = toDate(block.date).getTime();
    if (blockDate < now.getTime() - 21 * DAY_MS) continue; // últimas 3 semanas
    skippedBySubject.set(block.subjectId, (skippedBySubject.get(block.subjectId) || 0) + 1);
  }

  const skipCandidates: Array<{ subject: Subject; count: number }> = [];
  skippedBySubject.forEach((count, subjectId) => {
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject || count < 3) return;
    skipCandidates.push({ subject, count });
  });
  skipCandidates.sort((a, b) => b.count - a.count);
  const worstSkipped = skipCandidates[0] ?? null;

  if (worstSkipped) {
    const current = worstSkipped.subject.targetHours || 0;
    const suggested = Math.max(1, Math.round((current * 0.5) * 2) / 2);
    return {
      id: `skipped-${worstSkipped.subject.id}`,
      title: `${worstSkipped.subject.name} está sendo pulada`,
      evidence: `${worstSkipped.count} blocos de ${worstSkipped.subject.name} foram pulados recentemente. Diminuir a meta deixa o plano viável em vez de acumular pendência.`,
      actionLabel: `Reduzir meta para ${formatHours(suggested)}`,
      actionKind: 'reduce-subject',
      subjectId: worstSkipped.subject.id,
      suggestedTargetHours: suggested,
      dismissLabel: 'Manter meta atual',
    };
  }

  // ---------- Sinal 3: foco baixo (aderência ao tempo planejado) ----------
  const profiles = Object.values(analytics.performance?.subjects ?? {});
  const measured = profiles.filter((profile) => profile.averageFocusScore > 0 && profile.totalSessions > 0);
  if (measured.length >= 3) {
    const avgFocus =
      measured.reduce((sum, profile) => sum + profile.averageFocusScore, 0) / measured.length;
    const blockLength = studyPrefs.focusBlockMinutes || 50;
    if (avgFocus < 65 && blockLength > 25) {
      const suggested = Math.max(25, Math.round(blockLength / 2 / 5) * 5);
      return {
        id: 'low-focus',
        title: 'Foco abaixo do planejado',
        evidence: `Você cumpre em média ${Math.round(avgFocus)}% do tempo previsto em cada bloco. Blocos mais curtos costumam render mais que blocos longos não cumpridos.`,
        actionLabel: `Encurtar blocos para ${suggested} min`,
        actionKind: 'shorten-blocks',
        suggestedBlockMinutes: suggested,
        dismissLabel: 'Manter como está',
      };
    }
  }

  // Nada a ajustar: nenhum card é exibido.
  return null;
}

/** Formato de hora curto para as evidências (3h30, 45min). */
function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 min';
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}
