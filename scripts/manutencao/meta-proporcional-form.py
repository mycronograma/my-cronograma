#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SubjectForm: sem modo manual.

A tela passa a ter so Nome, Cor e Peso no plano (com as horas ao vivo).
O campo "Meta semanal" e os botoes Fixar/Voltar ao automatico saem --
existe uma regra so para todas as materias.
"""
import io
import sys

P = 'src/components/subjects/SubjectForm.tsx'
s = io.open(P, encoding='utf-8').read()

def troca(velho, novo, rotulo):
    global s
    if velho not in s:
        print('FALHOU: %s' % rotulo)
        sys.exit(1)
    s = s.replace(velho, novo, 1)
    print('ok: %s' % rotulo)

# ------------------------------------------------------------- 1. cabecalho
ini = s.index('/**')
fim = s.index('*/', ini) + 2
novo_cab = (
    "/**\n"
    " * SubjectForm Component\n"
    " * Formul\u00e1rio para criar/editar disciplinas.\n"
    " *\n"
    " * S\u00f3 tr\u00eas coisas: nome, cor e peso no plano. As horas semanais saem do peso\n"
    " * pela regra \u00fanica (carga semanal \u00d7 peso\u00b2 \u00f7 \u03a3 peso\u00b2) e aparecem ao vivo, ent\u00e3o\n"
    " * n\u00e3o existe campo de meta nem escolha entre autom\u00e1tico e manual.\n"
    " *\n"
    " * O campo de horas usa o formato h:min (8:30), nunca decimal (8.5).\n"
    " */"
)
s = s[:ini] + novo_cab + s[fim:]
print('ok: cabecalho')

# --------------------------------------------------------- 2. estado: limpar
velho_estado = (
    "  const [targetHours, setTargetHours] = useState(\n"
    "    () =>\n"
    "      subject?.targetHours ??\n"
    "      computeAutoTargetHours({\n"
    "        priority: pesoUnico(subject),\n"
    "        difficulty: pesoUnico(subject),\n"
    "        weeklyAvailableHours,\n"
    "        peerWeightSum,\n"
    "      })\n"
    "  );\n"
    "  const [manualTarget, setManualTarget] = useState(() => {\n"
    "    if (typeof subject?.targetHoursIsManual === 'boolean') return subject.targetHoursIsManual;\n"
    "    // Mat\u00e9ria antiga, sem o flag: considera manual s\u00f3 se a meta difere bastante\n"
    "    // da calculada \u2014 assim uma meta j\u00e1 ajustada na m\u00e3o n\u00e3o \u00e9 sobrescrita.\n"
    "    if (!subject?.targetHours) return false;\n"
    "    const sugerida = pesoUnico(subject);\n"
    "    const suggested = computeAutoTargetHours({\n"
    "      priority: sugerida,\n"
    "      difficulty: sugerida,\n"
    "      weeklyAvailableHours,\n"
    "      peerWeightSum,\n"
    "    });\n"
    "    return Math.abs(subject.targetHours - suggested) > 0.05;\n"
    "  });\n"
    "  const [targetText, setTargetText] = useState('');\n"
    "  const [error, setError] = useState<string | null>(null);\n"
)
novo_estado = (
    "  const [error, setError] = useState<string | null>(null);\n"
)
troca(velho_estado, novo_estado, 'estado')

# --------------------------------------------- 3. efeito que seguia os sliders
velho_eff = (
    "  // Enquanto est\u00e1 no autom\u00e1tico, a meta segue os sliders.\n"
    "  useEffect(() => {\n"
    "    if (!manualTarget) setTargetHours(autoTarget);\n"
    "  }, [autoTarget, manualTarget]);\n"
    "\n"
)
troca(velho_eff, "", 'efeito')

# --------------------------------------------------------- 4. submit e validacao
velho_val = (
    "    if (!Number.isFinite(safeTargetHours) || safeTargetHours < 0.5 || safeTargetHours > 40) {\n"
    "      setError('A meta semanal precisa estar entre 0h30 e 40h.');\n"
    "      return;\n"
    "    }\n"
    "\n"
)
troca(velho_val, "", 'validacao da meta')

velho_val2 = (
    "      const message = validate({\n"
    "        name: trimmedName,\n"
    "        color,\n"
    "        priority: weight,\n"
    "        difficulty: weight,\n"
    "        targetHours: safeTargetHours,\n"
    "        targetHoursIsManual: manualTarget,\n"
    "      });\n"
)
novo_val2 = (
    "      const message = validate({\n"
    "        name: trimmedName,\n"
    "        color,\n"
    "        priority: weight,\n"
    "        difficulty: weight,\n"
    "      });\n"
)
troca(velho_val2, novo_val2, 'validate')

velho_sub = (
    "    onSubmit({\n"
    "      name: trimmedName,\n"
    "      color,\n"
    "      priority: weight,\n"
    "      difficulty: weight,\n"
    "      targetHours: safeTargetHours,\n"
    "      targetHoursIsManual: manualTarget,\n"
    "    });\n"
)
novo_sub = (
    "    // Sem meta no formul\u00e1rio: quem chamou recalcula as horas de todas as\n"
    "    // mat\u00e9rias pela regra \u00fanica depois de salvar.\n"
    "    onSubmit({\n"
    "      name: trimmedName,\n"
    "      color,\n"
    "      priority: weight,\n"
    "      difficulty: weight,\n"
    "    });\n"
)
troca(velho_sub, novo_sub, 'onSubmit')

troca("  const isAuto = !manualTarget;\n\n", "", 'isAuto')

# ------------------------------------------------- 5. bloco da meta (remover)
ini = s.index("            {/* Meta semanal */}")
fim = s.index("            {error &&", ini)
s = s[:ini] + s[fim:]
print('ok: bloco da meta removido')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\ngravado.')
