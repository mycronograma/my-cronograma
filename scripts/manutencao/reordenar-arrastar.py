#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Liga o arrastar-e-soltar no planejador e remove a escolha manual de horario."""
import io
import sys

P = 'src/app/(app)/planner/page.tsx'
s = io.open(P, encoding='utf-8').read()
mudancas = 0

def troca(velho, novo, rotulo):
    global s, mudancas
    assert velho in s, 'ANCORA NAO ENCONTRADA: ' + rotulo
    s = s.replace(velho, novo, 1)
    mudancas += 1
    print('ok:', rotulo)

# ---------------------------------------------------------------- 1. imports
troca(
    "import { computeFreeDayWindows } from '@/services/freeDayWindows';",
    "import { computeFreeDayWindows } from '@/services/freeDayWindows';\n"
    "import { reorderDayBlocks, isPreservado } from '@/services/dayReorder';\n"
    "import {\n"
    "  DndContext,\n"
    "  KeyboardSensor,\n"
    "  PointerSensor,\n"
    "  SortableContext,\n"
    "  closestCenter,\n"
    "  useSensor,\n"
    "  useSensors,\n"
    "  useSortable,\n"
    "  verticalListSortingStrategy,\n"
    "  type DragEndEvent,\n"
    "} from '@dnd-kit/core';\n"
    "import { CSS } from '@dnd-kit/utilities';",
    'imports dnd-kit + dayReorder'
)

# ------------------------------------------- 2. componente do bloco arrastavel
ANCORA_COMPONENTE = "const buildDailyTimeWindowByDate = ("
assert ANCORA_COMPONENTE in s

COMPONENTE = '''/**
 * Bloco de matéria arrastável dentro do dia.
 *
 * O cartão inteiro é a alça: não existe botão de "mover", porque mover é
 * gesto, não decisão. O sensor de ponteiro exige 6px de arrasto antes de
 * assumir que é arrasto — assim um toque na tela continua sendo só um toque,
 * e a rolagem no celular não vira reordenação por acidente.
 *
 * Intervalo (☕) e bloco já estudado não são arrastáveis: o primeiro é
 * consequência do plano, o segundo é progresso que não se mexe.
 */
function SortableStudyBlock({
  block,
  subject,
  displayName,
}: {
  block: StudyBlock;
  subject: Subject | undefined;
  displayName: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled: isPreservado(block),
  });

  const subjectColor = subject?.color || '#6366F1';

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        background: `linear-gradient(135deg, ${subjectColor}18 0%, ${subjectColor}08 100%)`,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: `${subjectColor}35`,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      {...attributes}
      {...listeners}
      className="relative rounded-xl overflow-hidden cursor-grab active:cursor-grabbing group transition-shadow duration-200 hover:shadow-md touch-none"
      title={
        isPreservado(block)
          ? 'Este bloco já foi estudado e fica onde está.'
          : 'Arraste para reordenar as matérias do dia'
      }
    >
      {/* Alça visível só no hover: quem nunca vai arrastar não vê ruído. */}
      <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-60 transition-opacity">
        <GripVertical className="h-3 w-3 text-text-muted" />
      </div>

      {/* Top accent line */}
      <div className="h-[2px] w-full" style={{ backgroundColor: subjectColor }} />
      <div className="p-2 pr-5 pt-1.5">
        <p
          className="font-bold truncate text-[11px] leading-snug"
          title={displayName}
          style={{ color: subjectColor }}
        >
          {displayName}
        </p>
        <div className="flex items-center justify-between mt-1.5 gap-1">
          <span className="text-[10px] text-text-muted font-medium">{block.startTime}</span>
          <span
            className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ color: subjectColor, backgroundColor: `${subjectColor}20` }}
          >
            {block.durationMinutes}m
          </span>
        </div>
      </div>
    </div>
  );
}

'''
s = s.replace(ANCORA_COMPONENTE, COMPONENTE + ANCORA_COMPONENTE, 1)
mudancas += 1
print('ok: componente SortableStudyBlock')

# ------------------------------------------------- 3. ícone GripVertical
troca(
    "Check, Plus, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';",
    "Check, Plus, RefreshCw, CheckCircle2, AlertTriangle, GripVertical } from 'lucide-react';",
    'icone GripVertical'
)

# --------------------------------------- 4. sensores + handler no componente
ANCORA_SENSOR = "  const handleGenerateSchedule = useCallback(async () => {"
assert ANCORA_SENSOR in s

SENSOR = '''  // Sensores do arrastar. O ponteiro exige 6px antes de virar arrasto, para
  // que um toque comum (ou a rolagem no celular) não reordene nada por acidente.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  /**
   * Fim do arrasto. Reordenar só vale dentro do mesmo dia: mover matéria de
   * um dia para o outro é outra operação (Realocar), que mexe no período
   * inteiro e por isso passa pelo modal.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || overId === activeId) return;

    // Blocos de origem e destino, no array real (sem filtro da tela).
    const activeBlock = blocks.find((b) => b.id === activeId);
    const overBlock = blocks.find((b) => b.id === overId);
    if (!activeBlock || !overBlock) return;
    if (isPreservado(activeBlock)) return;

    const activeKey = toLocalDateKey(parseBlockDate(activeBlock.date) ?? activeBlock.date);
    const overKey = toLocalDateKey(parseBlockDate(overBlock.date) ?? overBlock.date);

    if (activeKey !== overKey) {
      setScheduleNotice(
        'Para mover uma matéria para outro dia, use "Adicionar → Realocar" no dia de destino.'
      );
      return;
    }

    // Todos os blocos do dia, preservados incluídos, na ordem em que estão.
    const dayBlocks = blocks
      .filter((b) => toLocalDateKey(parseBlockDate(b.date) ?? b.date) === activeKey)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const { pendentes } = splitDay(dayBlocks);
    const fromIndex = pendentes.findIndex((b) => b.id === activeId);
    const toIndex = pendentes.findIndex((b) => b.id === overId);
    if (fromIndex < 0 || toIndex < 0) return;

    const resultado = reorderDayBlocks({
      dayBlocks,
      fromIndex,
      toIndex,
      breakMinutes: configuredBreakMinutes,
      windowStart: dailyTimeWindowsByDate[activeKey]?.start ?? '09:00',
    });

    if (resultado.reason) {
      setScheduleNotice(resultado.reason);
      return;
    }

    // Só os blocos do dia mudam; o resto do cronograma fica intocado.
    const remontados = new Map(resultado.blocks.map((b) => [b.id, b]));
    setBlocks((prev) => prev.map((b) => remontados.get(b.id) ?? b));
  };

'''
s = s.replace(ANCORA_SENSOR, SENSOR + ANCORA_SENSOR, 1)
mudancas += 1
print('ok: sensores + handleDragEnd')

# --------------------------------------------- 5. splitDay no import
troca(
    "import { reorderDayBlocks, isPreservado } from '@/services/dayReorder';",
    "import { reorderDayBlocks, isPreservado, splitDay } from '@/services/dayReorder';",
    'splitDay no import'
)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\n' + str(mudancas) + ' bloco(s) aplicado(s).')
