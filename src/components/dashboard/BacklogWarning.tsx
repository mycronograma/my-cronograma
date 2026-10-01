'use client';

/**
 * BacklogWarning
 *
 * Avisa no PAINEL quando a pendência não cabe nos próximos dias — o mesmo
 * recado que a Agenda Inteligente já dava, mas que ninguém via quem ficasse no
 * painel: a pessoa via o card recomendando a próxima matéria e a agenda com as
 * linhas cinzas, sem sinal de que a conta não fechava.
 *
 * Diferença em relação ao aviso da Agenda: quando a data final do cronograma é
 * a data da prova, "empurrar a data final" não é opção — ninguém adia a prova.
 * Nesse caso o card diz a verdade e oferece só o que funciona.
 */

import { useMemo } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import Card from '@/components/ui/Card';
import { analyzeBacklogCapacity } from '@/services/backlogCapacity';
import { formatHoursDuration } from '@/lib/utils';
import type { StudyBlock } from '@/types';

interface BacklogWarningProps {
  blocks: StudyBlock[];
  /** Horas por dia da semana, para calcular a capacidade dos dias. */
  dailyHoursByWeekday?: Record<string, number> | null;
  /** Dias da semana com hora > 0 (0 = domingo). */
  allowedDays?: number[];
  /** Data da prova, quando houver. */
  examDate?: string;
}

/** Converte o mapa por dia da semana (0 = domingo) em minutos. */
function toMinutesByWeekday(
  daily?: Record<string, number> | null
): Record<number, number> {
  const chaves = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const saida: Record<number, number> = {};
  chaves.forEach((chave, indice) => {
    const valor = daily ? daily[chave] : undefined;
    saida[indice] =
      typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor * 60) : 0;
  });
  return saida;
}

export default function BacklogWarning({
  blocks,
  dailyHoursByWeekday,
  allowedDays,
  examDate,
}: BacklogWarningProps) {
  const relatorio = useMemo(() => {
    const pendentes = blocks.filter((block) => {
      if (block.isBreak) return false;
      if (block.status !== 'scheduled' && block.status !== 'rescheduled') return false;
      // Só o que já passou da data de hoje é pendência de verdade.
      const data = new Date(block.date);
      data.setHours(0, 0, 0, 0);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return data < hoje;
    });

    if (pendentes.length === 0) return null;

    return analyzeBacklogCapacity({
      blocks,
      today: new Date(),
      fallbackDayMinutesByWeekday: toMinutesByWeekday(dailyHoursByWeekday),
      allowedDays: allowedDays ?? [],
      lookaheadDays: 10,
    });
  }, [blocks, dailyHoursByWeekday, allowedDays]);

  // A condição que importa é "não caber", não "não haver espaço algum".
  // `noSpace` só é verdade quando a janela está literalmente zerada; quando há
  // algum espaço mas não o suficiente — o caso comum — ele é false e o aviso
  // não aparecia, nem aqui nem na Agenda.
  if (!relatorio || relatorio.missingMinutes <= 0) return null;

  const horasPendentes = formatHoursDuration(relatorio.pendingMinutes / 60);
  const extraPorDia = formatHoursDuration(relatorio.extraMinutesPerDay / 60);

  return (
    <Card
      padding="none"
      className="border border-warning/40 bg-warning-soft"
      role="status"
    >
      <div className="p-4 sm:p-5">
        <p className="flex items-start gap-2 text-sm font-semibold text-warning-strong">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Não há espaço para reagendar{' '}
            {relatorio.pendingCount === 1 ? '1 bloco pendente' : `${relatorio.pendingCount} blocos pendentes`}
            {relatorio.pendingMinutes > 0 && ` (${horasPendentes} de estudo)`}.
          </span>
        </p>

        <p className="mt-2 text-xs leading-relaxed text-warning-strong">
          Seus próximos {relatorio.daysChecked} dias já estão cheios. Para reagendar você
          precisa estudar além do que está planejado:{' '}
          <strong>
            aumente as horas por dia em Ajustes
            {relatorio.extraMinutesPerDay > 0 && ` (faltam ${extraPorDia} por dia)`}
          </strong>
          .
        </p>

        {examDate ? (
          // A data final é a prova: não existe "empurrar a data final".
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-strong">
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
            Como a sua data final é a prova, a saída é estudar mais por dia — a prova
            não espera.
          </p>
        ) : (
          <p className="mt-2 text-xs text-warning-strong">
            Ou gere o cronograma na Agenda com uma data final mais distante.
          </p>
        )}
      </div>
    </Card>
  );
}
