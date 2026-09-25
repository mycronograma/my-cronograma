/**
 * Pontuação de sessão derivada de dados reais.
 *
 * Antes o app gravava constantes (`focusScore` fixo em 85 no QuickSessionModal e
 * acurácia inventada para blocos concluídos sem respostas). Aqui o score é
 * sempre função de: aderência ao tempo planejado, acurácia real (quando há
 * respostas registradas) e autoavaliação do usuário (quando ele respondeu).
 * Nada é fabricado: se o dado não existe, o peso é redistribuído.
 */

export interface SessionScoringInput {
  /** Minutos planejados para o bloco/sessão. */
  plannedMinutes: number;
  /** Minutos realmente estudados. */
  actualMinutes: number;
  correctAnswers?: number | null;
  totalQuestions?: number | null;
  /** Autoavaliação de foco do usuário, 0-100 (sessão rápida). */
  selfReportedFocus?: number | null;
}

export interface SessionScores {
  /** 0-100 */
  focusScore: number;
  /** 0-100 */
  productivityScore: number;
  /** 0-1 quando há respostas; null quando não foram registradas. */
  accuracyRate: number | null;
  errorRate: number | null;
  /** Proporção do tempo planejado cumprida, 0-1 (limitada a 1). */
  adherence: number;
  hasAccuracy: boolean;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toFinite = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function computeSessionScores(input: SessionScoringInput): SessionScores {
  const plannedMinutes = Math.max(1, toFinite(input.plannedMinutes, 1));
  const actualMinutes = clamp(toFinite(input.actualMinutes, 0), 0, 24 * 60);
  const adherence = clamp(actualMinutes / plannedMinutes, 0, 1);

  const totalQuestions = toFinite(input.totalQuestions ?? 0, 0);
  const correctAnswers = input.correctAnswers == null ? null : toFinite(input.correctAnswers, 0);
  const hasAccuracy = totalQuestions > 0 && correctAnswers !== null;
  const accuracyRate = hasAccuracy
    ? clamp((correctAnswers as number) / totalQuestions, 0, 1)
    : null;
  const errorRate = accuracyRate === null ? null : clamp(1 - accuracyRate, 0, 1);

  const selfReportedFocus =
    input.selfReportedFocus == null || !Number.isFinite(input.selfReportedFocus)
      ? null
      : clamp(input.selfReportedFocus, 0, 100) / 100;

  // Pesos: aderência é sempre a base. Acurácia entra quando existe; a
  // autoavaliação entra quando o usuário respondeu. Sem elas, o peso volta para
  // a aderência — o score fica menor, nunca inflado.
  let focusScore: number;
  if (accuracyRate !== null && selfReportedFocus !== null) {
    focusScore = 100 * (0.5 * adherence + 0.3 * accuracyRate + 0.2 * selfReportedFocus);
  } else if (accuracyRate !== null) {
    focusScore = 100 * (0.65 * adherence + 0.35 * accuracyRate);
  } else if (selfReportedFocus !== null) {
    focusScore = 100 * (0.7 * adherence + 0.3 * selfReportedFocus);
  } else {
    focusScore = 100 * adherence;
  }

  const productivityBase = accuracyRate ?? adherence;
  const productivityScore = 100 * (0.6 * adherence + 0.4 * productivityBase);

  return {
    focusScore: Math.round(clamp(focusScore, 0, 100)),
    productivityScore: Math.round(clamp(productivityScore, 0, 100)),
    accuracyRate: accuracyRate === null ? null : Number(accuracyRate.toFixed(4)),
    errorRate: errorRate === null ? null : Number(errorRate.toFixed(4)),
    adherence: Number(adherence.toFixed(4)),
    hasAccuracy,
  };
}

/** Segunda-feira 00:00 local da semana de uma data (para WeeklyStats). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
