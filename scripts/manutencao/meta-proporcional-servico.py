#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Meta semanal proporcional, sem modo manual.

Regra unica: horas = carga semanal x peso^2 / soma dos pesos^2.
Nada e "fixado" -- mudar um peso tira horas dos outros e a soma sempre
fecha na capacidade.
"""
import io
import sys

P = 'src/services/weeklyTarget.ts'
s = io.open(P, encoding='utf-8').read()

# ------------------------------------------------ 1. cabecalho (por posicao)
ini = s.index('/**')
fim = s.index('*/', ini) + 2

novo_cabecalho = (
    "/**\n"
    " * Divis\u00e3o organizada da carga semanal entre as mat\u00e9rias (#15/#20).\n"
    " *\n"
    " * Regra \u00fanica, sem modo manual. A meta de cada mat\u00e9ria \u00e9:\n"
    " *\n"
    " *     capacidade \u00d7 peso\u00b2 / \u03a3 peso\u00b2\n"
    " *\n"
    " * A soma sempre fecha exatamente na carga semanal, e mudar o peso de uma\n"
    " * mat\u00e9ria tira horas das outras \u2014 nada fica \"fixado\".\n"
    " *\n"
    " * Por que o modo manual acabou: ele mostrava dois n\u00fameros diferentes para a\n"
    " * mesma mat\u00e9ria (a meta fixada e \"o autom\u00e1tico daria\"), e o autom\u00e1tico era s\u00f3 a\n"
    " * sobra da semana depois das metas j\u00e1 fixadas. Quando todas estavam fixadas,\n"
    " * essa sobra ficava t\u00e3o pequena que o peso deixava de importar \u2014 peso 8 e peso\n"
    " * 10 davam o mesmo resultado. Fun\u00e7\u00f5es puras \u2014 nada de React aqui.\n"
    " */"
)
s = s[:ini] + novo_cabecalho + s[fim:]
print('ok: cabecalho')

# ------------------------------------------- 2. buildPeerItems sem mais fixos
velho_build = (
    "export function buildPeerItems(\n"
    "  peers: Array<{\n"
    "    id: string;\n"
    "    priority: number;\n"
    "    difficulty: number;\n"
    "    targetHours?: number | null;\n"
    "    targetHoursIsManual?: boolean;\n"
    "  }>,\n"
    "  excludeId?: string\n"
    "): WeeklyTargetItem[] {\n"
    "  return peers\n"
    "    .filter((peer) => peer.id !== excludeId)\n"
    "    .map((peer) => ({\n"
    "      id: peer.id,\n"
    "      priority: peer.priority,\n"
    "      difficulty: peer.difficulty,\n"
    "      fixedHours:\n"
    "        peer.targetHoursIsManual && typeof peer.targetHours === 'number' && peer.targetHours > 0\n"
    "          ? peer.targetHours\n"
    "          : null,\n"
    "    }));\n"
    "}\n"
)

novo_build = (
    "/**\n"
    " * Converte as outras mat\u00e9rias no formato do servi\u00e7o.\n"
    " *\n"
    " * Nenhuma mat\u00e9ria \u00e9 marcada como fixa: existe uma regra s\u00f3 e todas passam\n"
    " * por ela. `targetHours`/`targetHoursIsManual` continuam aceitos por\n"
    " * compatibilidade com quem chama, mas s\u00e3o ignorados \u2014 deixar de reservar\n"
    " * horas foi o que fez o peso voltar a importar.\n"
    " */\n"
    "export function buildPeerItems(\n"
    "  peers: Array<{\n"
    "    id: string;\n"
    "    priority: number;\n"
    "    difficulty: number;\n"
    "    targetHours?: number | null;\n"
    "    targetHoursIsManual?: boolean;\n"
    "  }>,\n"
    "  excludeId?: string\n"
    "): WeeklyTargetItem[] {\n"
    "  return peers\n"
    "    .filter((peer) => peer.id !== excludeId)\n"
    "    .map((peer) => ({\n"
    "      id: peer.id,\n"
    "      priority: peer.priority,\n"
    "      difficulty: peer.difficulty,\n"
    "      fixedHours: null,\n"
    "    }));\n"
    "}\n"
    "\n"
    "/**\n"
    " * Metas de TODAS as mat\u00e9rias pela regra \u00fanica. \u00c9 o que a tela chama depois\n"
    " * de criar, editar ou remover uma mat\u00e9ria \u2014 e quando a carga semanal muda em\n"
    " * Ajustes \u2014 para o n\u00famero gravado nunca divergir da regra.\n"
    " */\n"
    "export function recalculateAllTargets(\n"
    "  subjects: Array<{ id: string; priority: number; difficulty: number }>,\n"
    "  capacityHours: number\n"
    "): Record<string, number> {\n"
    "  return allocateWeeklyTargets(subjects, { capacityHours }).byId;\n"
    "}\n"
)

if velho_build not in s:
    print('FALHOU: buildPeerItems')
    sys.exit(1)
s = s.replace(velho_build, novo_build, 1)
print('ok: buildPeerItems + recalculateAllTargets')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\ngravado.')
