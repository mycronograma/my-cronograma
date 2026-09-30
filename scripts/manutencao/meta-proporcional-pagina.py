#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
subjects/page.tsx: recalcula as metas de TODAS as materias pela regra unica
depois de criar, editar ou remover uma materia.
"""
import io
import sys

P = 'src/app/(app)/subjects/page.tsx'
s = io.open(P, encoding='utf-8').read()

def troca(velho, novo, rotulo):
    global s
    if velho not in s:
        print('FALHOU: %s' % rotulo)
        sys.exit(1)
    s = s.replace(velho, novo, 1)
    print('ok: %s' % rotulo)

# ------------------------------------------------------------------ 1. import
troca(
    "import { applyQuestionBatch } from '@/services/adaptiveStudyIntelligence';\n",
    "import { applyQuestionBatch } from '@/services/adaptiveStudyIntelligence';\n"
    "import { recalculateAllTargets } from '@/services/weeklyTarget';\n",
    'import')

# ------------------------------------------- 2. handleFormSubmit: recalcula
velho = (
    "  const handleFormSubmit = (data: Partial<Subject>) => {\n"
    "\n"
    "    if (editingSubject) {\n"
    "      // Atualizar existente\n"
    "      setSubjects((prev) =>\n"
    "        prev.map((s) =>\n"
    "          s.id === editingSubject.id\n"
    "            ? { ...s, ...data, updatedAt: new Date() }\n"
    "            : s\n"
    "        )\n"
    "      );\n"
    "    } else {\n"
    "      // Criar nova\n"
    "      const newSubject: Subject = {\n"
    "        id: generateId(),\n"
    "        userId: 'user1',\n"
    "        name: (data.name || '').trim(),\n"
    "        color: data.color || '#00B4FF',\n"
    "        icon: 'book',\n"
    "        priority: data.priority ?? 5,\n"
    "        difficulty: data.difficulty ?? 5,\n"
    "        targetHours: data.targetHours ?? 10,\n"
    "        targetHoursIsManual: data.targetHoursIsManual ?? false,\n"
    "        completedHours: 0,\n"
    "        totalHours: 0,\n"
    "        sessionsCount: 0,\n"
    "        averageScore: 0,\n"
    "        proficiencyScore: 0,\n"
    "        examWeight: data.priority ?? 5,\n"
    "        isActive: true,\n"
    "        createdAt: new Date(),\n"
    "        updatedAt: new Date(),\n"
    "      };\n"
    "      setSubjects((prev) => [...prev, newSubject]);\n"
    "      \n"
    "      // Marcar que o usu\u00e1rio adicionou a primeira disciplina\n"
    "      markFirstSubjectAdded();\n"
    "    }\n"
    "    setShowForm(false);\n"
    "  };\n"
)

novo = (
    "  /**\n"
    "   * Uma regra s\u00f3 para a meta semanal. Depois de criar, editar ou remover uma\n"
    "   * mat\u00e9ria, TODAS t\u00eam a hora recalculada (carga \u00d7 peso\u00b2 \u00f7 \u03a3 peso\u00b2), ent\u00e3o a soma\n"
    "   * sempre fecha na carga semanal e o n\u00famero gravado nunca divergir da regra.\n"
    "   */\n"
    "  const aplicarRegraDeMetas = (lista: Subject[]): Subject[] => {\n"
    "    const alvos = recalculateAllTargets(\n"
    "      lista.map((s) => ({ id: s.id, priority: s.priority, difficulty: s.difficulty })),\n"
    "      weeklyGoalFromPrefs\n"
    "    );\n"
    "    return lista.map((s) =>\n"
    "      typeof alvos[s.id] === 'number'\n"
    "        ? { ...s, targetHours: alvos[s.id], updatedAt: new Date() }\n"
    "        : s\n"
    "    );\n"
    "  };\n"
    "\n"
    "  const handleFormSubmit = (data: Partial<Subject>) => {\n"
    "\n"
    "    if (editingSubject) {\n"
    "      // Atualizar existente\n"
    "      setSubjects((prev) =>\n"
    "        aplicarRegraDeMetas(\n"
    "          prev.map((s) =>\n"
    "            s.id === editingSubject.id\n"
    "              ? { ...s, ...data, updatedAt: new Date() }\n"
    "              : s\n"
    "          )\n"
    "        )\n"
    "      );\n"
    "    } else {\n"
    "      // Criar nova\n"
    "      const newSubject: Subject = {\n"
    "        id: generateId(),\n"
    "        userId: 'user1',\n"
    "        name: (data.name || '').trim(),\n"
    "        color: data.color || '#00B4FF',\n"
    "        icon: 'book',\n"
    "        priority: data.priority ?? 5,\n"
    "        difficulty: data.difficulty ?? 5,\n"
    "        targetHours: 0,\n"
    "        completedHours: 0,\n"
    "        totalHours: 0,\n"
    "        sessionsCount: 0,\n"
    "        averageScore: 0,\n"
    "        proficiencyScore: 0,\n"
    "        examWeight: data.priority ?? 5,\n"
    "        isActive: true,\n"
    "        createdAt: new Date(),\n"
    "        updatedAt: new Date(),\n"
    "      };\n"
    "      setSubjects((prev) => aplicarRegraDeMetas([...prev, newSubject]));\n"
    "      \n"
    "      // Marcar que o usu\u00e1rio adicionou a primeira disciplina\n"
    "      markFirstSubjectAdded();\n"
    "    }\n"
    "    setShowForm(false);\n"
    "  };\n"
)
troca(velho, novo, 'handleFormSubmit')

# ------------------------------------------- 3. peers: sem flag manual
troca(
    "            peers={subjects.map((s) => ({\n"
    "              id: s.id,\n"
    "              priority: s.priority,\n"
    "              difficulty: s.difficulty,\n"
    "              targetHours: s.targetHours,\n"
    "              targetHoursIsManual: s.targetHoursIsManual,\n"
    "            }))}\n",
    "            peers={subjects.map((s) => ({\n"
    "              id: s.id,\n"
    "              priority: s.priority,\n"
    "              difficulty: s.difficulty,\n"
    "            }))}\n",
    'peers')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\ngravado.')
