/**
 * Reporta sessões concluídas para o servidor.
 *
 * Por que existe: o estado local (localStorage) continua sendo a fonte de
 * verdade da UI — funciona offline e responde instantaneamente — mas sem o
 * registro no servidor a gamificação (XP/nível/streak/conquistas), as
 * notificações ("você ainda não estudou hoje") e o relatório semanal nunca
 * tinham dados reais. Este módulo fecha essa ponta.
 *
 * Comportamento: fire-and-forget (nunca bloqueia a UI), com dedupe local por
 * chave e idempotência também no servidor (`blockId` único / início exato).
 * Se a requisição falhar, a chave é liberada para uma nova tentativa.
 */

const REPORTED_KEY = 'nexora_reported_sessions';
const MAX_REPORTED_KEYS = 200;

export interface CompletedSessionReport {
  subjectId: string;
  blockId?: string | null;
  /** Início real da sessão (ou o horário planejado do bloco). */
  startedAt: Date | string;
  endedAt?: Date | string | null;
  plannedMinutes: number;
  actualMinutes: number;
  correctAnswers?: number | null;
  totalQuestions?: number | null;
  /** Autoavaliação de foco 0-100 (sessão rápida). */
  focusScore?: number | null;
  source?: 'block' | 'quick';
  topicName?: string | null;
  sessionType?: string | null;
}

const readReported = (): string[] => {
  try {
    const raw = window.localStorage.getItem(REPORTED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const writeReported = (keys: string[]) => {
  try {
    window.localStorage.setItem(REPORTED_KEY, JSON.stringify(keys.slice(-MAX_REPORTED_KEYS)));
  } catch {
    // localStorage cheio/indisponível: o servidor ainda deduplica.
  }
};

const buildDedupeKey = (report: CompletedSessionReport, startedAtIso: string) =>
  report.blockId
    ? `block:${report.blockId}`
    : `quick:${report.subjectId}:${startedAtIso}:${report.actualMinutes}`;

/**
 * Envia a sessão concluída. Retorna o id criado no servidor (ou null quando a
 * chamada falhou / foi duplicada), para o cliente poder refinar a
 * autoavaliação de foco depois.
 */
export function reportCompletedSession(report: CompletedSessionReport): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  const startedAt = new Date(report.startedAt);
  if (Number.isNaN(startedAt.getTime())) return Promise.resolve(null);
  if (!report.subjectId || !(report.actualMinutes > 0)) return Promise.resolve(null);

  const startedAtIso = startedAt.toISOString();
  const dedupeKey = buildDedupeKey(report, startedAtIso);

  const reported = readReported();
  if (reported.includes(dedupeKey)) return Promise.resolve(null);
  writeReported([...reported, dedupeKey]);

  const payload = {
    ...report,
    startedAt: startedAtIso,
    endedAt: report.endedAt ? new Date(report.endedAt).toISOString() : null,
  };

  const release = () => {
    writeReported(readReported().filter((key) => key !== dedupeKey));
  };

  return fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      // 4xx = payload inválido/dado inexistente: retry não vai ajudar.
      if (!response.ok && response.status >= 500) release();
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      return typeof body?.session?.id === 'string' ? (body.session.id as string) : null;
    })
    .catch(() => {
      release();
      return null;
    });
}

/**
 * Refina a autoavaliação de foco de uma sessão já registrada (o usuário responde
 * "como foi seu foco?" depois de concluir). Silencioso: falhar aqui não afeta a
 * UI, o score derivado da aderência permanece gravado.
 */
export function updateSessionSelfAssessment(params: {
  sessionId: string;
  subjectId: string;
  startedAt: Date | string;
  plannedMinutes: number;
  actualMinutes: number;
  focusScore: number;
}): void {
  if (typeof window === 'undefined') return;

  void fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => undefined);
}

/** Testes/debug: limpa o histórico de sessões já reportadas. */
export function clearReportedSessions(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(REPORTED_KEY);
  } catch {
    // no-op
  }
}
