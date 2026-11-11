/**
 * Prioridade calculada de um bloco (padrão do design Trilha).
 *
 * Composição transparente, só com dados reais do app:
 * - peso da matéria (priority 1–10 definida pelo usuário)
 * - dificuldade da matéria (difficulty 1–10)
 * - desempenho: quanto menor o aproveitamento médio, maior a urgência
 * - atraso: bloco de dia passado ainda pendente ganha urgência por dia
 * - proximidade da prova: com prova em até 30 dias, tudo escala
 *
 * Retorna pontos arredondados (tipicamente 5–60). É exibido na tarefa como
 * "Prioridade calculada: X pts" — nunca é um número decorativo.
 */
import { parseBlockDate, toLocalDateKey } from './utils';
import type { StudyBlock, Subject } from '@/types';

export function calculateBlockPriority(
  block: StudyBlock,
  subject: Subject | undefined,
  options?: { examDate?: string; now?: Date }
): number {
  const now = options?.now ?? new Date();
  const weight = subject?.priority ?? 5; // 1–10
  const difficulty = subject?.difficulty ?? 5; // 1–10

  // Desempenho: averageScore vem como 0–1 (ou 0–100 em dados antigos).
  const rawScore = subject?.averageScore ?? 0;
  const accuracy = rawScore > 1 ? rawScore / 100 : rawScore;
  const performanceFactor = accuracy > 0 ? 1 + (1 - accuracy) * 0.8 : 1.2;

  // Atraso em dias (bloco pendente de dia passado).
  const blockDate = parseBlockDate(block.date);
  const dayMs = 24 * 60 * 60 * 1000;
  const overdueDays =
    block.status !== 'completed' && blockDate
      ? Math.max(
          0,
          Math.round(
            (new Date(toLocalDateKey(now)).getTime() -
              new Date(toLocalDateKey(blockDate)).getTime()) /
              dayMs
          )
        )
      : 0;
  const overdueBoost = Math.min(overdueDays * 3, 21);

  // Proximidade da prova.
  let examFactor = 1;
  if (options?.examDate) {
    const exam = new Date(`${options.examDate}T12:00:00`);
    const daysLeft = Math.ceil((exam.getTime() - now.getTime()) / dayMs);
    if (daysLeft >= 0 && daysLeft <= 30) examFactor = 1 + (1 - daysLeft / 30) * 0.5;
  }

  const score = (weight * 2 + difficulty) * performanceFactor * examFactor + overdueBoost;
  return Math.round(score);
}
