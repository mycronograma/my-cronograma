'use client';

/**
 * PassProjection
 *
 * Card "Você passa?" do painel: diz, com números, se o ritmo atual de estudo
 * alcança a prova.
 *
 * Regra de ouro: só usa dados que o app realmente tem — data da prova e carga
 * semanal, ambas dos Ajustes. Nada de número inventado. Sem data de prova o
 * card não aparece (em vez de chutar um prazo).
 *
 * A conta é a mesma que o assistente de configuração já fazia
 * (`computeLoadPlan`), apenas trazida para o dia a dia.
 */

import { useMemo } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Target, TrendingUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import ProgressBar from '@/components/ui/ProgressBar';
import {
  computeLoadPlan,
  formatarDataLonga,
  formatarHoras,
  parseKey,
  toDateKey,
  type LoadPlan,
} from '@/lib/studyLoad';

interface PassProjectionProps {
  /** Data da prova no formato 'AAAA-MM-DD'. Vazio = não configurada. */
  examDate?: string;
  /** Carga total que a pessoa quer estudar até a prova, em horas. */
  totalHours?: number | null;
  /** Horas por dia da semana, como gravado em Ajustes. */
  daily: Record<string, number> | null | undefined;
  /** Horas por dia usadas quando não há configuração por dia da semana. */
  fallbackHoursPerDay: number;
  /** Horas já estudadas no total (para a barra de progresso). */
  studiedHours: number;
}

type Veredito = 'viavel' | 'apertado' | 'inviavel' | 'sem-dados';

interface Leitura {
  veredito: Veredito;
  plano: LoadPlan | null;
  /** Horas que o ritmo atual cobre até a prova. */
  cobreHoras: number;
  /** Quanto falta para fechar a carga informada. */
  faltamHoras: number;
  /** Mensagem principal, curta. */
  titulo: string;
  /** Explicação de uma linha. */
  detalhe: string;
}

function ler(params: {
  examDate?: string;
  totalHours?: number | null;
  daily: Record<string, number> | null | undefined;
  fallbackHoursPerDay: number;
}): Leitura {
  const { examDate, totalHours, daily, fallbackHoursPerDay } = params;

  const semDados: Leitura = {
    veredito: 'sem-dados',
    plano: null,
    cobreHoras: 0,
    faltamHoras: 0,
    titulo: 'Sem data da prova não dá para projetar',
    detalhe:
      'Coloque a data da prova em Ajustes e o Nexora calcula todo dia se o seu ritmo chega lá.',
  };

  if (!examDate) return semDados;

  const inicio = toDateKey(new Date());
  // `daily` precisa ter os 7 dias; onde não está configurado entra 0.
  const horas: Record<string, number> = {};
  ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].forEach((dia) => {
    const valor = daily ? daily[dia] : undefined;
    horas[dia] = typeof valor === 'number' && Number.isFinite(valor) ? Math.max(0, valor) : 0;
  });
  const semNenhumDia = Object.values(horas).every((v) => v <= 0);
  if (semNenhumDia) return semDados;

  const plano = computeLoadPlan({
    startKey: inicio,
    examDate,
    totalHours: totalHours ?? null,
    daily: horas as never,
  });

  const diasRestantes = plano.diasRestantes ?? 0;
  const cobreHoras = plano.horasPorSemana * ((plano.semanasRestantes ?? 0) || 0);
  const faltamHoras = plano.faltamHoras ?? 0;

  if (plano.viavel === null) {
    return {
      veredito: 'sem-dados',
      plano,
      cobreHoras,
      faltamHoras,
      titulo: 'Falta dizer quanto você quer estudar',
      detalhe:
        'Com a data da prova e a carga horária total o Nexora diz se o ritmo fecha. Coloque a carga em Ajustes.',
    };
  }

  if (faltamHoras > 0) {
    const porDia = plano.horasPorDiaAtivoNecessarias ?? 0;
    return {
      veredito: 'inviavel',
      plano,
      cobreHoras,
      faltamHoras,
      titulo: `No ritmo atual faltam ${formatarHoras(faltamHoras)}`,
      detalhe: `Até ${formatarDataLonga(examDate)} (${diasRestantes} dias) seu ritmo cobre ${formatarHoras(
        cobreHoras
      )}. Para fechar ${formatarHoras(totalHours ?? 0)} precisa de ${formatarHoras(
        porDia
      )} por dia de estudo.`,
    };
  }

  const sobra = plano.sobramHoras ?? 0;
  if (sobra > 0 && sobra <= cobreHoras * 0.1) {
    return {
      veredito: 'apertado',
      plano,
      cobreHoras,
      faltamHoras: 0,
      titulo: `Fecha, mas com folga de só ${formatarHoras(sobra)}`,
      detalhe: `Até ${formatarDataLonga(examDate)} (${diasRestantes} dias) seu ritmo cobre ${formatarHoras(
        cobreHoras
      )} — a mais que o necessário. Perder um dia já desequilibra.`,
    };
  }

  return {
    veredito: 'viavel',
    plano,
    cobreHoras,
    faltamHoras: 0,
    titulo: `No ritmo atual você chega com ${formatarHoras(sobra)} de folga`,
    detalhe: `Até ${formatarDataLonga(examDate)} (${diasRestantes} dias) seu ritmo cobre ${formatarHoras(
      cobreHoras
    )} contra ${formatarHoras(totalHours ?? 0)} necessários.`,
  };
}

const APARENCIA: Record<
  Veredito,
  { borda: string; icone: typeof CheckCircle2; corIcone: string; tom: string }
> = {
  viavel: {
    borda: 'border-success/40 bg-success-soft',
    icone: CheckCircle2,
    corIcone: 'text-success',
    tom: 'text-success-strong',
  },
  apertado: {
    borda: 'border-warning/40 bg-warning-soft',
    icone: AlertTriangle,
    corIcone: 'text-warning',
    tom: 'text-warning-strong',
  },
  inviavel: {
    borda: 'border-danger/40 bg-danger-soft',
    icone: AlertTriangle,
    corIcone: 'text-danger',
    tom: 'text-danger-strong',
  },
  'sem-dados': {
    borda: 'border-card-border bg-card-bg/50',
    icone: CalendarClock,
    corIcone: 'text-text-muted',
    tom: 'text-text-secondary',
  },
};

export default function PassProjection({
  examDate,
  totalHours,
  daily,
  fallbackHoursPerDay,
  studiedHours,
}: PassProjectionProps) {
  const leitura = useMemo(
    () => ler({ examDate, totalHours, daily, fallbackHoursPerDay }),
    [examDate, totalHours, daily, fallbackHoursPerDay]
  );

  const aparencia = APARENCIA[leitura.veredito];
  const Icone = aparencia.icone;
  const carga = totalHours && totalHours > 0 ? totalHours : 0;
  const percentual =
    carga > 0 ? Math.min(100, Math.round((studiedHours / carga) * 100)) : 0;

  return (
    <Card padding="none" className={`border ${aparencia.borda}`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 ${aparencia.corIcone}`}>
            <Icone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-text-secondary">
                Você passa?
              </h3>
              {leitura.plano && leitura.plano.diasRestantes !== null && (
                <span className="rounded-full border border-card-border px-2 py-0.5 text-[10px] font-bold text-text-secondary">
                  {leitura.plano.diasRestantes} dias
                </span>
              )}
            </div>

            <p className={`mt-1.5 text-base font-bold ${aparencia.tom}`}>{leitura.titulo}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{leitura.detalhe}</p>

            {carga > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Estudado
                  </span>
                  <span className="tabular-nums">
                    {formatarHoras(studiedHours)} de {formatarHoras(carga)} · {percentual}%
                  </span>
                </div>
                <ProgressBar value={percentual} className="h-2" />
              </div>
            )}

            {leitura.veredito === 'inviavel' && (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-text-secondary">
                <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" />
                Aumente as horas por dia em Ajustes ou empurre a data final — a conta não
                fecha como está.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
