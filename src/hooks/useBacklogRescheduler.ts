'use client';

/**
 * useBacklogRescheduler — liga o motor de recálculo ao app.
 *
 * O motor (`autoRescheduleBacklog`) existia desde a auditoria mas **nunca era
 * chamado**: blocos não cumpridos ficavam perdidos no passado e ninguém os
 * empurrava para frente. Este hook roda o motor no máximo uma vez por dia
 * (gate em `nexora_backlog_last_auto_run_day`), o que entregva:
 *
 *  #6d — bloco não cumprido é empurrado para o próximo dia com horário livre;
 *  #6c — ao remarcar, a semana inteira é recalculada (o motor devolve a lista
 *        completa de blocos, não só o remarcado).
 *
 * Regras de segurança:
 *  - só roda uma vez por dia (evita ficar empurrando blocos a cada F5);
 *  - nunca move bloco concluído ou pulado — só `scheduled`/`rescheduled`
 *    vencidos (o motor já filtra por `isLockedForDayStartShift`);
 *  - se nada mudou, não escreve no store (evita loop de sync com o servidor);
 *  - erros são silenciosos no console: falhar aqui não pode travar a tela.
 */

import { useEffect, useRef } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toLocalDateKey, parseBlockDate } from '@/lib/utils';
import { autoRescheduleBacklog } from '@/services/backlogRescheduler';
import type { StudyBlock } from '@/types';

const AUTO_RUN_KEY = 'nexora_backlog_last_auto_run_day';

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

export function useBacklogRescheduler({
  blocks,
  setBlocks,
  allowedDays,
  dailyLimitByDate,
  breakMinutes,
  enabled = true,
}: UseBacklogReschedulerParams) {
  const [lastRunDay, setLastRunDay] = useLocalStorage<string>(AUTO_RUN_KEY, '');
  // Só uma execução por montagem de hook: o efeito depende de `blocks`, que
  // muda a cada conclusão de bloco, e sem essa trava o motor rodaria sempre.
  const alreadyRanRef = useRef(false);

  useEffect(() => {
    if (!enabled || alreadyRanRef.current) return;

    const todayKey = toLocalDateKey(new Date());
    if (lastRunDay === todayKey) return;

    // Nada a fazer sem blocos: evita gravar o gate sem motivo.
    if (blocks.length === 0) return;

    // Existe bloco vencido? Sem isso o motor rodaria todo dia sem motivo.
    const hasOverdue = blocks.some((block) => {
      if (block.isBreak || block.status === 'completed' || block.status === 'skipped') return false;
      const blockKey = toLocalDateKey(parseBlockDate(block.date) ?? new Date(block.date));
      return blockKey < todayKey;
    });
    if (!hasOverdue) return;

    alreadyRanRef.current = true;
    // Grava o gate antes de aplicar: se a store falhar, não tentamos de novo
    // a cada render e não corruptemos a lista com escrita repetida.
    setLastRunDay(todayKey);

    try {
      const result = autoRescheduleBacklog({
        blocks,
        today: new Date(),
        allowedDays,
        dailyLimitByDate,
        breakMinutes,
        // Pulado é decisão do usuário: não ressuscita.
        rescheduleSkipped: false,
      });

      if (result.movedCount > 0) {
        setBlocks(() => result.blocks);
      }

      // O que não cabeu na quota continua pendente: em vez de silêncio, fica
      // registrado no console para diagnóstico (a UI de aviso vem na Fase 5).
      if (result.pendingBacklogCount > 0) {
        console.info(
          `[backlog] ${result.pendingBacklogCount} bloco(s) ainda pendente(s) após o recálculo.`
        );
      }
    } catch (error) {
      console.warn('[backlog] falha ao recalcular blocos atrasados:', error);
    }
    // `blocks` entra de propósito: a verificação de "existe atrasado" precisa do
  // estado atual, e o ref garante uma única execução por montagem.
  }, [blocks, enabled, lastRunDay, allowedDays, dailyLimitByDate, breakMinutes, setBlocks, setLastRunDay]);
}

/** Some com o gate de auto-run (usado pelos botões de reset). */
export function clearBacklogAutoRunGate() {
  try {
    window.localStorage.removeItem(AUTO_RUN_KEY);
  } catch {
    /* storage indisponível: o gate simplesmente volta a valer */
  }
}
