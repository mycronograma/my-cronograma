#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Parte visual do peso unico: helper, cor compacta, bloco do peso, meta curta."""
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

# ------------------------------------------------- helper pesoUnico (nivel modulo)
troca(
    "const clampHours = (v: number) => Math.min(40, Math.max(0.5, Math.round(v * 12) / 12));\n",

    "const clampHours = (v: number) => Math.min(40, Math.max(0.5, Math.round(v * 12) / 12));\n"
    "\n"
    "/**\n"
    " * Peso exibido na tela. Mat\u00e9ria antiga guardava prioridade e dificuldade\n"
    " * separadas; com um controle s\u00f3, ela entra com a m\u00e9dia dos dois \u2014 assim nenhum\n"
    " * slider escondido continua existindo por tr\u00e1s do formul\u00e1rio.\n"
    " */\n"
    "const pesoUnico = (subject?: Subject): number => {\n"
    "  const p = subject?.priority || 5;\n"
    "  const d = subject?.difficulty || 5;\n"
    "  return p === d ? p : Math.round((p + d) / 2);\n"
    "};\n",
    'helper pesoUnico')

# ------------------------------------------------------------- cor compacta
velha_cor = (
    "            {/* Cor */}\n"
    "            <div>\n"
    "              <label className=\"block text-sm font-medium text-text-secondary mb-2\">\n"
    "                Cor\n"
    "              </label>\n"
    "              <div className=\"flex gap-2 flex-wrap\">\n"
    "                {subjectColors.map((c) => (\n"
    "                  <button\n"
    "                    key={c}\n"
    "                    type=\"button\"\n"
    "                    onClick={() => setColor(c)}\n"
    "                    className={cn(\n"
    "                      'w-8 h-8 rounded-lg transition-all',\n"
    "                      color === c && 'ring-2 ring-white ring-offset-2 ring-offset-background'\n"
    "                    )}\n"
    "                    style={{ backgroundColor: c }}\n"
    "                  />\n"
    "                ))}\n"
    "              </div>\n"
    "            </div>\n"
)
nova_cor = (
    "            {/* Cor \u2014 escolha cosm\u00e9tica, ent\u00e3o fica compacta numa linha s\u00f3 */}\n"
    "            <div className=\"flex items-center gap-3\">\n"
    "              <label className=\"shrink-0 text-sm font-medium text-text-secondary\">Cor</label>\n"
    "              <div className=\"flex flex-wrap gap-1.5\">\n"
    "                {subjectColors.map((c) => (\n"
    "                  <button\n"
    "                    key={c}\n"
    "                    type=\"button\"\n"
    "                    onClick={() => setColor(c)}\n"
    "                    aria-label={'Cor ' + c}\n"
    "                    className={cn(\n"
    "                      'h-6 w-6 rounded-md transition-all',\n"
    "                      color === c && 'ring-2 ring-white ring-offset-2 ring-offset-background'\n"
    "                    )}\n"
    "                    style={{ backgroundColor: c }}\n"
    "                  />\n"
    "                ))}\n"
    "              </div>\n"
    "            </div>\n"
)
troca(velha_cor, nova_cor, 'cor compacta')

# ------------------------------------------------- bloco do peso (substitui tudo)
inicio = s.index("            {/* Peso no plano")
fim = s.index("            {/* Meta semanal */}")

novo_peso = (
    "            {/* Peso no plano \u2014 um controle s\u00f3, com as horas ao vivo */}\n"
    "            <div>\n"
    "              <div className=\"mb-2 flex items-center justify-between gap-2\">\n"
    "                <label className=\"text-sm font-medium text-text-secondary\">\n"
    "                  Peso no plano:{' '}\n"
    "                  <span className=\"font-bold text-text-primary\">{weight}</span>\n"
    "                </label>\n"
    "                <span className=\"text-xs font-medium text-text-muted\">\n"
    "                  {formatHoursDuration(autoTarget)} por semana\n"
    "                </span>\n"
    "              </div>\n"
    "              <input\n"
    "                type=\"range\"\n"
    "                min=\"1\"\n"
    "                max=\"10\"\n"
    "                value={weight}\n"
    "                onChange={(e) => setWeight(Number(e.target.value))}\n"
    "                aria-label=\"Peso no plano\"\n"
    "                className=\"w-full accent-neon-blue\"\n"
    "              />\n"
    "              <div className=\"mt-1 flex justify-between text-xs text-text-muted\">\n"
    "                <span>Leve</span>\n"
    "                <span>M\u00e1ximo</span>\n"
    "              </div>\n"
    "              <p className=\"mt-1.5 text-[11px] text-text-muted\">\n"
    "                Junta o quanto a mat\u00e9ria vale e o quanto ela te trava. Peso 10 recebe 4\u00d7 as\n"
    "                horas de peso 5.\n"
    "              </p>\n"
    "            </div>\n"
    "\n"
)
s = s[:inicio] + novo_peso + s[fim:]
print('ok: bloco do peso')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\ngravado.')
