#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
planner/page.tsx: "Gerar com IA" preserva o que ja foi estudado.

Antes o botao fazia setBlocks(novos) e substituia a lista inteira -- os blocos
ja estudados voltavam a "Agendado" e a pessoa perdia o progresso do dia, as
horas contadas e o XP.

Agora:
  - concluidos, pulados e o bloco em andamento ficam intocados;
  - so o que esta pendente e refeito;
  - os blocos novos sao encaixados nas janelas livres de cada dia, para nao
    remarcar bloco em cima de bloco concluido;
  - com progresso registrado, o app confirma com numeros antes de refazer.
"""
import io
import sys

P = 'src/app/(app)/planner/page.tsx'
s = io.open(P, encoding='utf-8').read()


def tr(velho, novo, rotulo):
    global s
    if velho not in s:
        print('FALHOU: %s' % rotulo)
        sys.exit(1)
    s = s.replace(velho, novo, 1)
    print('ok: %s' % rotulo)


velho_inicio = (
    "  const handleGenerateSchedule = useCallback(async () => {\n"
    "    if (subjects.length === 0) {\n"
    "      setPlannerNotice('Adicione pelo menos uma mat\u00e9ria para gerar um cronograma.');\n"
    "      return;\n"
    "    }\n"
    "    if (plannerEndDate && plannerEndDate < displayedWeekStart) {\n"
    "      setPlannerNotice('A data de fim n\u00e3o pode ser antes do in\u00edcio.');\n"
    "      return;\n"
    "    }\n"
)

novo_inicio = (
    "  const handleGenerateSchedule = useCallback(async () => {\n"
    "    if (subjects.length === 0) {\n"
    "      setPlannerNotice('Adicione pelo menos uma mat\u00e9ria para gerar um cronograma.');\n"
    "      return;\n"
    "    }\n"
    "    if (plannerEndDate && plannerEndDate < displayedWeekStart) {\n"
    "      setPlannerNotice('A data de fim n\u00e3o pode ser antes do in\u00edcio.');\n"
    "      return;\n"
    "    }\n"
    "    // Com progresso j\u00e1 registrado o app pergunta antes: refazer o cronograma\n"
    "    // mexe no plano da pessoa, e ela tem o direito de saber o que fica de p\u00e9.\n"
    "    if (progressoAtual.blocos > 0) {\n"
    "      setRegenConfirm({\n"
    "        concluidos: progressoAtual.blocos,\n"
    "        horasEstudadas: progressoAtual.minutos,\n"
    "        pendentes: blocosPendentes.length,\n"
    "      });\n"
    "      return;\n"
    "    }\n"
    "    await gerarCronograma();\n"
    "  }, [subjects, plannerEndDate, displayedWeekStart, progressoAtual, blocosPendentes.length]);\n"
    "\n"
    "  const gerarCronograma = useCallback(async () => {\n"
)

tr(velho_inicio, novo_inicio, 'entrada + confirmacao')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\ngravado.')
