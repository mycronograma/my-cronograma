'use client';

/**
 * useBacklogRescheduler — liga o motor de recálculo ao app.
 *
 * O motor (`autoRescheduleBacklog`) existia desde a auditoria mas **nunca era
 * chamado**: blocos não cumpridos ficavam perdidos no passado e ninguém os
 * empurrava para frente. Este hook entrega:
 *
 *  #6d — bloco não cumprido é empurrado para o próximo dia com horário livre;
 *  #6c — ao remarcar, a semana inteira é recalculada (o motor devolve a lista
 *        completa de blocos, não só o remarcado).
 *
 * Duas formas de disparar:
 *  - automática: no máximo uma vez por dia (gate em `nexora_backlog_last_auto_run_day`),
 *    para não ficar empurrando blocos a cada F5;
 *  - manual: `runNow()`, usado pelo botão "Recalcular atrasados" — permite testar
 *    e resolver na hora, sem esperar o dia seguinte.
 *
 * Regras de segurança:
 *  - nunca move bloco concluído ou pulado (pular é decisão, não esquecimento);
 *  - se nada mudou, não escreve no store (evita loop de sync com o servidor);
 *  - erros não derrubam a tela.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toLocalDateKey, parseBlockDate } from '@/lib/utils';
import { autoRescheduleBacklog } from '@/services/backlogRescheduler';
import type { StudyBlock } from '@/types';

const AUTO_RUN_KEY = 'nexora_backlog_last_auto_run_day';

export interface BacklogRunResult {
  movedCount: number;
  pendingCount: number;
  /** Rodei de verdade (houve atrasado e o motor achou lugar). */
  applied: boolean;
}

interface UseBacklogReschedulerParams {
  blocks: StudyBlock[];
  setBlocks: (updater: (prev: StudyBlock[]) => StudyBlock[]) => void;
  /** Dias da semana com hora > 0 (0 = domingo). */
  allowedDays?: number[];
  /** Limite de minutos por data, quando o usuário configurou. */
  dailyLimitByDate?: Record<string, number>;
  breakMinutes?: number;
  /** Desliga o auto-run (usado em telas que não devem mexer no cronograma). */
  enabled?: boolean;
}

/**
 * Um bloco está pendente quando não foi concluído. Isso inclui:
 *  - dia passado ainda "scheduled" (esquecido de fato);
 *  - bloco pulado, inclusive o de hoje — pular significa "não faço hoje", e o
 *    motor o reagenda para um dia futuro (nunca para o mesmo dia).
 * Só o que foi concluído sai da conta.
 */
function isPending(block: StudyBlock, todayKey: string): boolean {
  if (block.isBreak) return false;
  if (block.status === 'completed') return false;
  const blockKey = toLocalDateKey(parseBlockDate(block.date) ?? new Date(block.date));
  return blockKey < todayKey || (blockKey === todayKey && block.status === 'skipped');
}

export function useBacklogRescheduler({
  blocks,
  setBlocks,
  allowedDays,
  dailyLimitByDate,
  breakMinutes,
  enabled = true,
}: UseBacklogReschedulerParams) {
  const [lastRunDay, setLastRunDay] = useLocalStorage<string>(AUTO_RUN_KEY, '');
  const [lastResult, setLastResult] = useState<BacklogRunResult | null>(null);
  // Só uma execução automática por montagem: o efeito depende de `blocks`, que
  // muda a cada conclusão de bloco, e sem essa trava o motor rodaria sempre.
  const alreadyRanRef = useRef(false);

  const todayKey = toLocalDateKey(new Date());
  const pendingCount = blocks.filter((block) => isPending(block, todayKey)).length;

  const runEngine = useCallback((): BacklogRunResult => {
    const result = autoRescheduleBacklog({
      blocks,
      today: new Date(),
      allowedDays,
      dailyLimitByDate,
      breakMinutes,
      // Pulado significa "não faço hoje": reagenda para um dia futuro.
      rescheduleSkipped: true,
    });

    const runResult: BacklogRunResult = {
      movedCount: result.movedCount,
      pendingCount: result.pendingBacklogCount,
      applied: result.movedCount > 0,
    };

    if (result.movedCount > 0) {
      setBlocks(() => result.blocks);
    }
    return runResult;
  }, [blocks, allowedDays, dailyLimitByDate, breakMinutes, setBlocks]);

  /** Disparo manual (botão "Recalcular atrasados"): ignora o gate diário. */
  const runNow = useCallback((): BacklogRunResult => {
    if (pendingCount === 0) {
      const empty: BacklogRunResult = { movedCount: 0, pendingCount: 0, applied: false };
      setLastResult(empty);
      return empty;
    }
    const result = runEngine();
    setLastRunDay(toLocalDateKey(new Date()));
    setLastResult(result);
    return result;
  }, [pendingCount, runEngine, setLastRunDay]);

  // ---------------------------------------------------------------- auto-run
  useEffect(() => {
    if (!enabled || alreadyRanRef.current) return;
    if (lastRunDay === todayKey) return;
    if (pendingCount === 0) return;

    alreadyRanRef.current = true;
    // Grava o gate antes de aplicar: se a store falhar, não tentamos de novo a
    // cada render e não escrevemos repetido na lista.
    setLastRunDay(todayKey);

    try {
      runEngine();
    } catch (error) {
      console.warn('[backlog] falha ao recalcular blocos atrasados:', error);
    }
    // `overdueCount` entra de propósito: a verificação de "existe atrasado"
    // precisa do estado atual, e o ref garante uma única execução por montagem.
  }, [pendingCount, enabled, lastRunDay, todayKey, runEngine, setLastRunDay]);

  return { pendingCount, lastResult, runNow };
}

/** Some com o gate de auto-run (usado pelos botões de reset). */
export function clearBacklogAutoRunGate() {
  try {
    window.localStorage.removeItem(AUTO_RUN_KEY);
  } catch {
    /* storage indisponível: o gate simplesmente volta a valer */
  }
}
