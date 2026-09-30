#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Peso unico no formulario de disciplina.

Remove o modo "separado" (dois sliders + botao de alternar) e deixa um
controle so, com as horas resultantes aparecendo ao vivo. Encurta as
explicacoes e compacta o seletor de cor.

Uso: python3 scripts/manutencao/peso-unico.py
"""
import io
import sys

P = 'src/components/subjects/SubjectForm.tsx'
s = io.open(P, encoding='utf-8').read()
original = s

def troca(velho, novo, rotulo):
    global s
    if velho not in s:
        print('FALHOU: %s' % rotulo)
        sys.exit(1)
    s = s.replace(velho, novo, 1)
    print('ok: %s' % rotulo)

# ---------------------------------------------------------------- 1. cabecalho
troca(
    " * #15 \u2014 a meta semanal deixou de ser um n\u00famero solto que o usu\u00e1rio precisa\n"
    " * adivinhar: ela \u00e9 calculada a partir da prioridade (60%) e da dificuldade\n"
    " * (40%) em rela\u00e7\u00e3o \u00e0s outras mat\u00e9rias, sobre a carga semanal dispon\u00edvel.\n"
    " * Mexeu nos sliders \u2192 a meta acompanha. Digitou um valor \u2192 vira manual e\n"
    " * avisa, com bot\u00e3o para voltar ao autom\u00e1tico.\n"
    " *\n"
    " * O campo de horas usa o formato h:min (8:30), nunca decimal (8.5).\n",

    " * #15 \u2014 a meta semanal deixou de ser um n\u00famero solto que o usu\u00e1rio precisa\n"
    " * adivinhar: ela \u00e9 calculada a partir do peso, em rela\u00e7\u00e3o \u00e0s outras mat\u00e9rias,\n"
    " * sobre a carga semanal dispon\u00edvel. Mexeu no peso \u2192 a meta acompanha. Digitou\n"
    " * um valor \u2192 vira manual e avisa, com bot\u00e3o para voltar ao autom\u00e1tico.\n"
    " *\n"
    " * Peso \u00fanico: a tela exp\u00f5e UM controle (\"peso no plano\") em vez de dois\n"
    " * (prioridade e dificuldade). Os dois campos continuam existindo no banco\n"
    " * porque o motor os usa, mas a tela s\u00f3 mexe nos dois juntos \u2014 escolher a forma\n"
    " * do formul\u00e1rio antes de responder \u00e0 pergunta era fric\u00e7\u00e3o sem ganho.\n"
    " *\n"
    " * O campo de horas usa o formato h:min (8:30), nunca decimal (8.5).\n",
    'cabecalho')

# ----------------------------------------------------------------- 2. imports
troca(
    "import { X, Palette, Info, RotateCcw, Pin, Combine, Split } from 'lucide-react';",
    "import { X, Info, RotateCcw, Pin } from 'lucide-react';",
    'imports de icones')

# ------------------------------------------------------- 3. estado: peso unico
troca(
    "  const [name, setName] = useState(subject?.name || '');\n"
    "  const [color, setColor] = useState(subject?.color || subjectColors[0]);\n"
    "  // Fus\u00e3o prioridade/dificuldade: um \u00fanico controle \"peso no plano\" move as\n"
    "  // duas juntas. Quem quiser diferenciar (ex.: mat\u00e9ria f\u00e1cil mas decisiva na\n"
    "  // prova) abre o modo separado \u2014 os dados continuam gravando os dois campos.\n"
    "  const [priority, setPriority] = useState(subject?.priority || 5);\n"
    "  const [difficulty, setDifficulty] = useState(subject?.difficulty || 5);\n"
    "  const [splitMode, setSplitMode] = useState(\n"
    "    () => !!subject && subject.priority !== subject.difficulty\n"
    "  );\n"
    "  const [weight, setWeight] = useState(subject?.priority || 5);\n",

    "  const [name, setName] = useState(subject?.name || '');\n"
    "  const [color, setColor] = useState(subject?.color || subjectColors[0]);\n"
    "  // Um controle s\u00f3. Mat\u00e9ria antiga com prioridade diferente de dificuldade\n"
    "  // entra com a m\u00e9dia: a tela n\u00e3o tem mais dois sliders para escolher entre.\n"
    "  const [weight, setWeight] = useState(() => pesoUnico(subject));\n",
    'estado')

# --------------------------------------------------- 4. inicializacao da meta
troca(
    "      subject?.targetHours ??\n"
    "      computeAutoTargetHours({\n"
    "        priority: subject?.priority || 5,\n"
    "        difficulty: subject?.difficulty || 5,\n"
    "        weeklyAvailableHours,\n"
    "        peerWeightSum,\n"
    "      })\n",

    "      subject?.targetHours ??\n"
    "      computeAutoTargetHours({\n"
    "        priority: pesoUnico(subject),\n"
    "        difficulty: pesoUnico(subject),\n"
    "        weeklyAvailableHours,\n"
    "        peerWeightSum,\n"
    "      })\n",
    'meta inicial')

troca(
    "    const suggested = computeAutoTargetHours({\n"
    "      priority: subject.priority || 5,\n"
    "      difficulty: subject.difficulty || 5,\n"
    "      weeklyAvailableHours,\n"
    "      peerWeightSum,\n"
    "    });\n",

    "    const sugerida = pesoUnico(subject);\n"
    "    const suggested = computeAutoTargetHours({\n"
    "      priority: sugerida,\n"
    "      difficulty: sugerida,\n"
    "      weeklyAvailableHours,\n"
    "      peerWeightSum,\n"
    "    });\n",
    'flag manual inicial')

# ------------------------------------------------------------------- 5. memos
troca(
    "  const autoTarget = useMemo(\n"
    "    () =>\n"
    "      computeAutoTargetHours({\n"
    "        priority,\n"
    "        difficulty,\n"
    "        weeklyAvailableHours,\n"
    "        peerWeightSum,\n"
    "        peers: peerItems,\n"
    "      }),\n"
    "    [priority, difficulty, weeklyAvailableHours, peerWeightSum, peerItems]\n"
    "  );\n",

    "  const autoTarget = useMemo(\n"
    "    () =>\n"
    "      computeAutoTargetHours({\n"
    "        priority: weight,\n"
    "        difficulty: weight,\n"
    "        weeklyAvailableHours,\n"
    "        peerWeightSum,\n"
    "        peers: peerItems,\n"
    "      }),\n"
    "    [weight, weeklyAvailableHours, peerWeightSum, peerItems]\n"
    "  );\n",
    'memo autoTarget')

troca(
    "  const autoInfo = useMemo(\n"
    "    () =>\n"
    "      describeAutoTarget({\n"
    "        priority,\n"
    "        difficulty,\n"
    "        weeklyAvailableHours,\n"
    "        peers: peerItems,\n"
    "      }),\n"
    "    [priority, difficulty, weeklyAvailableHours, peerItems]\n"
    "  );\n",

    "  const autoInfo = useMemo(\n"
    "    () =>\n"
    "      describeAutoTarget({\n"
    "        priority: weight,\n"
    "        difficulty: weight,\n"
    "        weeklyAvailableHours,\n"
    "        peers: peerItems,\n"
    "      }),\n"
    "    [weight, weeklyAvailableHours, peerItems]\n"
    "  );\n",
    'memo autoInfo')

# --------------------------------------------------------- 6. handlers e submit
troca(
    "  /** Controle \u00fanico: move prioridade e dificuldade juntas. */\n"
    "  const handleWeightChange = (value: number) => {\n"
    "    setWeight(value);\n"
    "    setPriority(value);\n"
    "    setDifficulty(value);\n"
    "  };\n"
    "\n"
    "  /** Volta ao controle \u00fanico usando a m\u00e9dia dos dois valores atuais. */\n"
    "  const handleMergeWeights = () => {\n"
    "    const merged = Math.round((priority + difficulty) / 2);\n"
    "    setWeight(merged);\n"
    "    setPriority(merged);\n"
    "    setDifficulty(merged);\n"
    "    setSplitMode(false);\n"
    "  };\n"
    "\n",

    "",
    'handlers de fusao')

troca(
    "      const message = validate({\n"
    "        name: trimmedName,\n"
    "        color,\n"
    "        priority,\n"
    "        difficulty,\n"
    "        targetHours: safeTargetHours,\n"
    "        targetHoursIsManual: manualTarget,\n"
    "      });\n",

    "      const message = validate({\n"
    "        name: trimmedName,\n"
    "        color,\n"
    "        priority: weight,\n"
    "        difficulty: weight,\n"
    "        targetHours: safeTargetHours,\n"
    "        targetHoursIsManual: manualTarget,\n"
    "      });\n",
    'validate')

troca(
    "    onSubmit({\n"
    "      name: trimmedName,\n"
    "      color,\n"
    "      priority,\n"
    "      difficulty,\n"
    "      targetHours: safeTargetHours,\n"
    "      targetHoursIsManual: manualTarget,\n"
    "    });\n",

    "    onSubmit({\n"
    "      name: trimmedName,\n"
    "      color,\n"
    "      priority: weight,\n"
    "      difficulty: weight,\n"
    "      targetHours: safeTargetHours,\n"
    "      targetHoursIsManual: manualTarget,\n"
    "    });\n",
    'onSubmit')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\ngravado. %d -> %d caracteres' % (len(original), len(s)))
