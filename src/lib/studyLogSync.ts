/**
 * Sincronização dos registros de estudo (/estudos) com o servidor.
 *
 * O localStorage continua sendo a fonte da UI (offline-first); este módulo
 * busca a cópia do servidor ao abrir a página, mescla com o que existe
 * localmente e envia o snapshot completo de volta a cada mudança.
 */
import {
  readReviewOverrides,
  readStudyLog,
  writeReviewOverrides,
  writeStudyLog,
  type ReviewOverride,
  type StudyLogEntry,
} from './studyLog';

interface ServerStudyLogs {
  entries: StudyLogEntry[];
  overrides: Record<string, ReviewOverride>;
}

/** Mescla por id: entradas que só existem de um lado são mantidas. */
export function mergeStudyLogEntries(
  local: StudyLogEntry[],
  remote: StudyLogEntry[]
): StudyLogEntry[] {
  const byId = new Map<string, StudyLogEntry>();
  for (const entry of remote) byId.set(entry.id, entry);
  // Local vence em conflito: é onde a edição mais recente acabou de acontecer.
  for (const entry of local) byId.set(entry.id, entry);
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Mescla overrides por matéria: vence o `setAt` mais recente. */
export function mergeReviewOverrides(
  local: Record<string, ReviewOverride>,
  remote: Record<string, ReviewOverride>
): Record<string, ReviewOverride> {
  const merged = { ...remote };
  for (const [subjectId, override] of Object.entries(local)) {
    const current = merged[subjectId];
    if (!current || override.setAt >= current.setAt) merged[subjectId] = override;
  }
  return merged;
}

export async function fetchAndMergeStudyLogs(): Promise<boolean> {
  try {
    const response = await fetch('/api/study-logs');
    if (!response.ok) return false;
    const payload = await response.json();
    if (!payload?.success || !payload.persisted || !payload.data) return false;

    const remote = payload.data as ServerStudyLogs;
    writeStudyLog(mergeStudyLogEntries(readStudyLog(), remote.entries ?? []));
    writeReviewOverrides(mergeReviewOverrides(readReviewOverrides(), remote.overrides ?? {}));
    return true;
  } catch {
    return false;
  }
}

export async function pushStudyLogs(): Promise<void> {
  try {
    await fetch('/api/study-logs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: readStudyLog(),
        overrides: readReviewOverrides(),
      }),
    });
  } catch {
    // Offline ou sem sessão: o localStorage mantém os dados e a próxima
    // abertura da página tenta sincronizar de novo.
  }
}
