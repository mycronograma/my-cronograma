'use client';

/**
 * TodayPlan Component
 * Exibe os blocos de estudo do dia com horário, matéria e status.
 *
 * Regras de UX aplicadas aqui:
 * - horário de início/fim sempre visível (antes só aparecia a duração);
 * - sem corte silencioso: a lista mostra tudo; acima de VISIBLE_LIMIT ela
 *   colapsa com um botão explícito "ver todos" (não trunca escondendo itens);
 * - hora atual vem de useClientNow() para não quebrar a hidratação.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useClientNow } from '@/hooks';
import {
  Clock,
  Play,
  CheckCircle2,
  SkipForward,
  Coffee,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  cn,
  formatDuration,
  getTimeString,
  plannedMinutes,
  studiedMinutes,
  timeToMinutes,
} from '@/lib/utils';
import { getStudyBlockDisplayTitle, getStudyBlockTypeLabel } from '@/lib/studyBlockLabels';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import CompleteMinutesModal from './CompleteMinutesModal';
import Button from '@/components/ui/Button';
import type { StudyBlock } from '@/types';

interface TodayPlanProps {
  blocks: StudyBlock[];
  onStartSession: (blockId: string) => void;
  onSkipBlock: (blockId: string) => void;
  onCompleteBlock?: (blockId: string, minutesSpent?: number) => void;
  onStartBlock?: (block: StudyBlock) => void;
  title?: string;
  subtitle?: string;
}

/** Acima disso a lista colapsa — mas sempre com botão para expandir. */
const VISIBLE_LIMIT = 6;

const statusConfig = {
  scheduled: { badge: 'default', icon: Clock, label: 'Agendado' },
  rescheduled: { badge: 'warning', icon: Clock, label: 'Reagendado' },
  'in-progress': { badge: 'warning', icon: Play, label: 'Em Andamento' },
  completed: { badge: 'success', icon: CheckCircle2, label: 'Concluído' },
  skipped: { badge: 'danger', icon: SkipForward, label: 'Pulado' },
} as const;

export default function TodayPlan({
  blocks,
  onStartSession,
  onSkipBlock,
  onCompleteBlock,
  onStartBlock,
  title = 'Plano de Hoje',
  subtitle,
}: TodayPlanProps) {
  const now = useClientNow();
  const [showAll, setShowAll] = useState(false);
  // Bloco aguardando a resposta "quanto tempo você estudou?".
  const [pendingComplete, setPendingComplete] = useState<StudyBlock | null>(null);

  const orderedBlocks = useMemo(
    () => [...blocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [blocks]
  );

  // Antes da hidratação não há hora confiável: nenhum bloco é marcado como
  // "agora"/"próximo" e o HTML do servidor casa com o do cliente.
  const currentTime = now ? getTimeString(now) : null;

  const currentBlockId = currentTime
    ? (orderedBlocks.find(
        (block) =>
          (block.status === 'scheduled' || block.status === 'rescheduled') &&
          block.startTime <= currentTime &&
          block.endTime > currentTime
      )?.id ?? null)
    : null;

  const nextBlockId = currentTime
    ? (orderedBlocks.find(
        (block) =>
          (block.status === 'scheduled' || block.status === 'rescheduled') &&
          block.startTime > currentTime
      )?.id ?? null)
    : null;

  const completedCount = orderedBlocks.filter((block) => block.status === 'completed').length;
  const studyBlocks = orderedBlocks.filter((block) => !block.isBreak);
  // Só o que ainda falta estudar, sempre pela duração PLANEJADA.
  const pendingMinutes = studyBlocks
    .filter((block) => block.status !== 'completed' && block.status !== 'skipped')
    .reduce((total, block) => total + plannedMinutes(block), 0);

  const visibleBlocks = showAll ? orderedBlocks : orderedBlocks.slice(0, VISIBLE_LIMIT);
  const hiddenCount = orderedBlocks.length - visibleBlocks.length;

  return (
    <Card padding="none">
      <div className="p-4 max-[479px]:p-3 sm:p-6 border-b border-card-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl max-[479px]:text-lg font-heading font-bold text-text-primary">
              {title}
            </h2>
            <p className="text-sm max-[479px]:text-xs text-text-secondary mt-1">
              {subtitle ?? `${completedCount} de ${orderedBlocks.length} concluídos`}
            </p>
          </div>
          {pendingMinutes > 0 && (
            <Badge variant="default" size="sm" className="shrink-0">
              {formatDuration(pendingMinutes)} restantes
            </Badge>
          )}
        </div>
      </div>

      <div className="p-3 max-[479px]:p-2.5 sm:p-4 space-y-2">
        {orderedBlocks.length === 0 ? (
          <div className="text-center py-8 max-[479px]:py-6">
            <Coffee className="w-12 h-12 max-[479px]:w-10 max-[479px]:h-10 text-text-muted mx-auto mb-4 max-[479px]:mb-2" />
            <p className="text-text-secondary">Nenhum bloco agendado para hoje</p>
            <p className="text-sm max-[479px]:text-xs text-text-muted mt-1">
              Vá para Agenda Inteligente para gerar um cronograma
            </p>
          </div>
        ) : (
          <>
            {visibleBlocks.map((block, index) => {
              const config = statusConfig[block.status];
              const Icon = config.icon;
              const isActive = block.id === currentBlockId;
              const isNext = block.id === nextBlockId && !currentBlockId;
              const isDone = block.status === 'completed';
              const isSkipped = block.status === 'skipped';
              const accent = block.subject?.color || '#00B4FF';

              return (
                <motion.div
                  key={block.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 6) * 0.04 }}
                  className={cn(
                    'group relative flex items-stretch gap-3 rounded-xl border p-3 max-[479px]:p-2.5 transition-all duration-300',
                    block.isBreak
                      ? 'border-border-subtle bg-transparent'
                      : 'border-card-border bg-card-bg hover:border-neon-blue/30',
                    isActive && 'border-neon-blue/60 shadow-glow bg-gradient-to-r from-neon-blue/10 to-transparent',
                    isNext && !isActive && 'border-neon-purple/50',
                    isDone && 'opacity-60',
                    isSkipped && 'opacity-40'
                  )}
                >
                  {/* Coluna de horário */}
                  <div
                    className="flex w-[68px] max-[479px]:w-[60px] shrink-0 flex-col justify-center border-r border-card-border pr-3 text-right"
                    aria-hidden={block.isBreak}
                  >
                    <span
                      className={cn(
                        'font-mono text-sm max-[479px]:text-xs font-bold tabular-nums',
                        isActive ? 'text-neon-blue' : 'text-text-primary',
                        (isDone || isSkipped) && 'text-text-muted'
                      )}
                    >
                      {block.startTime}
                    </span>
                    <span className="font-mono text-[11px] text-text-muted tabular-nums">
                      {block.endTime}
                    </span>
                  </div>

                  {/* Conteúdo */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: block.isBreak ? '#6B7280' : accent }}
                      />
                      <h4
                        className={cn(
                          'min-w-0 break-words text-sm max-[479px]:text-[13px] font-semibold text-text-primary',
                          (isDone || isSkipped) && 'line-through decoration-text-muted'
                        )}
                      >
                        {block.isBreak ? 'Intervalo' : getStudyBlockDisplayTitle(block)}
                      </h4>
                      {(isActive || isNext) && (
                        <Badge
                          variant={isActive ? 'default' : 'purple'}
                          size="sm"
                          className="shrink-0 px-1.5 py-0 text-[10px] uppercase tracking-wide"
                        >
                          {isActive ? 'agora' : 'próximo'}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {block.startTime} – {block.endTime} · {formatDuration(plannedMinutes(block))}
                      </span>
                      {block.status === 'completed' && studiedMinutes(block) !== plannedMinutes(block) && (
                        <span className="text-text-muted">
                          estudou {formatDuration(studiedMinutes(block))}
                        </span>
                      )}
                      {!block.isBreak && (
                        <span className="text-text-muted">
                          {getStudyBlockTypeLabel(block.type ?? 'AULA')}
                        </span>
                      )}
                      {!block.isBreak && block.pedagogicalStepIndex && (
                        <span className="text-text-muted">
                          Ciclo {block.pedagogicalStepIndex}/{block.pedagogicalStepTotal ?? 4}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status + ações */}
                  <div className="flex shrink-0 flex-col items-end justify-center gap-1.5">
                    <Badge
                      variant={config.badge as 'default' | 'success' | 'warning' | 'danger'}
                      size="sm"
                      className="hidden lg:inline-flex"
                    >
                      <Icon className="w-3 h-3 mr-1" />
                      {config.label}
                    </Badge>

                    <div className="flex items-center gap-1.5">
                      {/* "Iniciar" para o que ainda vai ser estudado. Some em
                          bloco concluído (já foi) e em bloco em andamento (já
                          começou) — antes aparecia nos dois, e o app convidava
                          a estudar de novo o que já estava estudado. Pulado
                          continua podendo iniciar: pular não é descarte. */}
                      {onStartBlock &&
                        block.status !== 'completed' &&
                        block.status !== 'in-progress' && (
                        <Button
                          variant={block.isBreak ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() => onStartBlock(block)}
                          className={cn(
                            'min-h-[32px] max-[479px]:min-h-[30px] px-2.5 text-xs',
                            isActive && 'shadow-neon-blue bg-neon-blue text-background border-none hover:bg-neon-blue/90'
                          )}
                        >
                          <Play className="w-3.5 h-3.5 mr-1" />
                          Iniciar
                        </Button>
                      )}
                      {onCompleteBlock && block.status !== 'completed' && !block.isBreak && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPendingComplete(block)}
                          className="min-h-[32px] max-[479px]:min-h-[30px] px-2.5 text-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Concluir
                        </Button>
                      )}
                      {(block.status === 'scheduled' || block.status === 'rescheduled') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSkipBlock(block.id)}
                          className="min-h-[32px] max-[479px]:min-h-[30px] px-2 text-xs text-text-muted hover:text-text-primary"
                        >
                          <SkipForward className="w-3.5 h-3.5 mr-1" />
                          Pular
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {pendingComplete && (
              <CompleteMinutesModal
                plannedMinutes={plannedMinutes(pendingComplete)}
                title={getStudyBlockDisplayTitle(pendingComplete)}
                onConfirm={(minutos) => {
                  const alvo = pendingComplete;
                  setPendingComplete(null);
                  onCompleteBlock?.(alvo.id, minutos);
                }}
                onCancel={() => setPendingComplete(null)}
              />
            )}

            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-card-border py-2 text-xs font-medium text-text-secondary hover:border-neon-blue/40 hover:text-neon-blue transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Ver todos os {orderedBlocks.length} blocos (+{hiddenCount})
              </button>
            )}

            {showAll && orderedBlocks.length > VISIBLE_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-text-muted hover:text-text-secondary transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                Mostrar apenas os próximos {VISIBLE_LIMIT}
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
