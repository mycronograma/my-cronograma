#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Envolve a grade semanal no DndContext e cada dia no SortableContext."""
import io

P = 'src/app/(app)/planner/page.tsx'
s = io.open(P, encoding='utf-8').read()

# ---------------------------------------------------------- abrir o DndContext
VELHO_GRADE = '            <div className="grid grid-cols-7 gap-1.5 lg:gap-2 min-w-[840px] items-start">'
assert VELHO_GRADE in s, 'grade semanal'
NOVO_GRADE = (
    '            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>\n'
    '            <div className="grid grid-cols-7 gap-1.5 lg:gap-2 min-w-[840px] items-start">'
)
s = s.replace(VELHO_GRADE, NOVO_GRADE, 1)
print('ok: DndContext aberto')

# ------------------------------------------- SortableContext + bloco arrastavel
VELHO_LISTA = '''                      {/* Blocks */}
                      <div className="space-y-1.5 min-h-[80px]">
                        {dayBlocks.map((block) => {
                          const subject = activeSubjects.find((s) => s.id === block.subjectId);
                          const displayName = subject?.name || block.subject?.name || block.type;
                          const isBreak = block.isBreak;
                          const subjectColor = subject?.color || '#6366F1';
'''
assert VELHO_LISTA in s, 'lista de blocos'

NOVO_LISTA = '''                      {/* Blocks */}
                      <SortableContext
                        items={dayBlocks.filter((b) => !b.isBreak && !isPreservado(b)).map((b) => b.id)}
                        strategy={verticalListSortingStrategy}
                      >
                      <div className="space-y-1.5 min-h-[80px]">
                        {dayBlocks.map((block) => {
                          const subject = activeSubjects.find((s) => s.id === block.subjectId);
                          const displayName = subject?.name || block.subject?.name || block.type;
                          const isBreak = block.isBreak;
                          const subjectColor = subject?.color || '#6366F1';
'''
s = s.replace(VELHO_LISTA, NOVO_LISTA, 1)
print('ok: SortableContext')

# ------------------------------------- fecha o SortableContext junto com a lista
VELHO_FIM = '''                          <Plus className="h-3 w-3" /> Adicionar
                        </button>
                      </div>
'''
assert VELHO_FIM in s, 'fim da lista'
NOVO_FIM = '''                          <Plus className="h-3 w-3" /> Adicionar
                        </button>
                      </div>
                      </SortableContext>
'''
s = s.replace(VELHO_FIM, NOVO_FIM, 1)
print('ok: SortableContext fechado')

# -------------------------------------------- troca o cartão pelo arrastável
VELHO_CARTAO = '''                          // Study blocks: premium card with color integration
                          return (
                            <div
                              key={block.id}
                              className="relative rounded-xl overflow-hidden cursor-default group transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
                              style={{
                                background: `linear-gradient(135deg, ${subjectColor}18 0%, ${subjectColor}08 100%)`,
                                borderWidth: '1px',
                                borderStyle: 'solid',
                                borderColor: `${subjectColor}35`,
                              }}
                            >
                              {/* Top accent line */}
                              <div className="h-[2px] w-full" style={{ backgroundColor: subjectColor }} />
                              <div className="p-2 pt-1.5">
                                <p
                                  className="font-bold text-text-primary truncate text-[11px] leading-snug group-hover:text-text-primary"
                                  title={displayName}
                                  style={{ color: subjectColor }}
                                >
                                  {displayName}
                                </p>
                                <div className="flex items-center justify-between mt-1.5 gap-1">
                                  <span className="text-[10px] text-text-muted font-medium">{block.startTime}</span>
                                  <span
                                    className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                    style={{
                                      color: subjectColor,
                                      backgroundColor: `${subjectColor}20`,
                                    }}
                                  >
                                    {block.durationMinutes}m
                                  </span>
                                </div>
                              </div>
                            </div>
                          );'''
assert VELHO_CARTAO in s, 'cartão do bloco'

NOVO_CARTAO = '''                          // Study blocks: premium card with color integration
                          if (isPreservado(block)) {
                            // Já estudado / pulado / em andamento: mesmo visual,
                            // mas sem arrastar — progresso não se reordena.
                            return (
                              <div
                                key={block.id}
                                className="relative rounded-xl overflow-hidden cursor-default group transition-shadow duration-200 hover:shadow-md"
                                style={{
                                  background: `linear-gradient(135deg, ${subjectColor}18 0%, ${subjectColor}08 100%)`,
                                  borderWidth: '1px',
                                  borderStyle: 'solid',
                                  borderColor: `${subjectColor}35`,
                                }}
                                title="Este bloco já foi estudado e fica onde está."
                              >
                                <div className="h-[2px] w-full" style={{ backgroundColor: subjectColor }} />
                                <div className="p-2 pt-1.5">
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

                          return (
                            <SortableStudyBlock
                              key={block.id}
                              block={block}
                              subject={subject}
                              displayName={displayName}
                            />
                          );'''
s = s.replace(VELHO_CARTAO, NOVO_CARTAO, 1)
print('ok: cartão arrastável')

# ------------------------------------------------- fechar o DndContext
VELHO_FIM_GRADE = '''                  );
                })}
            </div>
'''
# a grade fecha com ");\n                })}\n            </div>" — vamos pelo marcador único
MARCADOR = '''                  );
                })}
            </div>
          </div>

          {/* Rodapé de métricas - igual à referência */}'''
assert MARCADOR in s, 'fim da grade'
NOVO_MARCADOR = '''                  );
                })}
            </div>
            </DndContext>
          </div>

          {/* Rodapé de métricas - igual à referência */}'''
s = s.replace(MARCADOR, NOVO_MARCADOR, 1)
print('ok: DndContext fechado')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\ngrade semanal envolvida.')
