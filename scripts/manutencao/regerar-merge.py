#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Segunda metade: encaixar os blocos novos nas janelas livres e mesclar com os
preservados, em vez de substituir a lista inteira.
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


# ---- 1. calcular as janelas livres a partir dos preservados
velho = (
    "      const schedule = await generateChronologicalSchedule({\n"
    "        subjects,\n"
    "        preferences: studyPrefs,\n"
    "        startDate: weekStart,\n"
    "        endDate: weekEnd,\n"
    "        preferredStart: constraints.preferredStart,\n"
    "        preferredEnd: constraints.preferredEnd,\n"
    "        maxBlockMinutes: constraints.maxBlockMinutes,\n"
    "        breakMinutes: constraints.breakMinutes,\n"
    "        restDays: constraints.restDays,\n"
    "        dailyLimitByDate: constraints.dailyLimitByDate,\n"
    "        dailyTimeWindowByDate: constraints.dailyTimeWindowByDate,\n"
    "        simuladoRules: constraints.simuladoRules,\n"
    "        firstCycleAllSubjects,\n"
    "      });\n"
)

novo = (
    "      // Janelas livres de cada dia: onde j\u00e1 tem bloco preservado, o motor\n"
    "      // s\u00f3 pode usar o que sobrou. Sem isso ele remarcaria bloco em cima de\n"
    "      // bloco que a pessoa j\u00e1 estudou.\n"
    "      const diasDoPeriodo: string[] = [];\n"
    "      for (\n"
    "        let d = new Date(weekStart);\n"
    "        d.getTime() <= weekEnd.getTime();\n"
    "        d.setDate(d.getDate() + 1)\n"
    "      ) {\n"
    "        diasDoPeriodo.push(toLocalKey(d));\n"
    "      }\n"
    "\n"
    "      const janelasLivres = computeFreeDayWindows({\n"
    "        preservados: blocosPreservados.map((block) => ({\n"
    "          date: toLocalKey(parseBlockDate(block.date)),\n"
    "          startTime: block.startTime,\n"
    "          endTime: block.endTime,\n"
    "        })),\n"
    "        janelasBase: constraints.dailyTimeWindowByDate,\n"
    "        dias: diasDoPeriodo,\n"
    "      });\n"
    "\n"
    "      const schedule = await generateChronologicalSchedule({\n"
    "        subjects,\n"
    "        preferences: studyPrefs,\n"
    "        startDate: weekStart,\n"
    "        endDate: weekEnd,\n"
    "        preferredStart: constraints.preferredStart,\n"
    "        preferredEnd: constraints.preferredEnd,\n"
    "        maxBlockMinutes: constraints.maxBlockMinutes,\n"
    "        breakMinutes: constraints.breakMinutes,\n"
    "        restDays: constraints.restDays,\n"
    "        dailyLimitByDate: constraints.dailyLimitByDate,\n"
    "        // Mescla: a janela livre do dia manda; onde n\u00e3o h\u00e1 preservado, fica\n"
    "        // a janela habitual das restri\u00e7\u00f5es.\n"
    "        dailyTimeWindowByDate: {\n"
    "          ...constraints.dailyTimeWindowByDate,\n"
    "          ...janelasLivres,\n"
    "        },\n"
    "        simuladoRules: constraints.simuladoRules,\n"
    "        firstCycleAllSubjects,\n"
    "      });\n"
)
tr(velho, novo, 'janelas livres')

# ---- 2. mesclar em vez de substituir
velho2 = (
    "      setBlocks(enrichedBlocks);\n"
    "      setPlannerNotice(`\u2705 Cronograma gerado de ${toLocalKey(weekStart)} at\u00e9 ${toLocalKey(weekEnd)}!`);\n"
    "\n"
    "      setScheduleRange({\n"
    "        startDate: toLocalKey(weekStart),\n"
    "        endDate: toLocalKey(weekEnd),\n"
    "      });\n"
)

novo2 = (
    "      // Preservados primeiro, novos depois: nada do que j\u00e1 foi estudado sai.\n"
    "      // S\u00f3 o que estava pendente \u00e9 refeito.\n"
    "      setBlocks([...blocosPreservados, ...enrichedBlocks]);\n"
    "\n"
    "      const preservadosMsg =\n"
    "        blocosPreservados.length > 0\n"
    "          ? ` ${blocosPreservados.length} bloco(s) j\u00e1 estudado(s) ficaram como estavam.`\n"
    "          : '';\n"
    "      setPlannerNotice(\n"
    "        `\u2705 Cronograma gerado de ${toLocalKey(weekStart)} at\u00e9 ${toLocalKey(weekEnd)}!${preservadosMsg}`\n"
    "      );\n"
    "\n"
    "      setScheduleRange({\n"
    "        startDate: toLocalKey(weekStart),\n"
    "        endDate: toLocalKey(weekEnd),\n"
    "      });\n"
)
tr(velho2, novo2, 'merge')

# ---- 3. dependencias do useCallback
tr(
    "  }, [subjects, studyPrefs, userSettings, dailyLimits, firstCycleAllSubjects, setBlocks, setScheduleRange, displayedWeekStart, plannerEndDate]);\n",
    "  }, [\n"
    "    subjects,\n"
    "    studyPrefs,\n"
    "    userSettings,\n"
    "    dailyLimits,\n"
    "    firstCycleAllSubjects,\n"
    "    setBlocks,\n"
    "    setScheduleRange,\n"
    "    displayedWeekStart,\n"
    "    plannerEndDate,\n"
    "    blocosPreservados,\n"
    "  ]);\n",
    'dependencias')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\ngravado.')
