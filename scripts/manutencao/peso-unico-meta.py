#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Encurta a explicacao da meta semanal para uma linha."""
import io
import sys

P = 'src/components/subjects/SubjectForm.tsx'
s = io.open(P, encoding='utf-8').read()

inicio = s.index("              <p className=\"mt-1.5 flex items-start gap-1.5 text-[11px] text-text-muted\">")
# fim: a proxima linha que fecha esse <p>
fim = s.index("              </p>\n", inicio) + len("              </p>\n")

novo = (
    "              <p className=\"mt-1.5 flex items-start gap-1.5 text-[11px] text-text-muted\">\n"
    "                <Info className=\"mt-0.5 w-3 h-3 shrink-0\" />\n"
    "                {isAuto ? (\n"
    "                  autoInfo.poolHours <= 0 ? (\n"
    "                    <span className=\"text-warning-strong\">\n"
    "                      A semana j\u00e1 est\u00e1 toda comprometida com metas fixas \u2014 n\u00e3o sobra hora\n"
    "                      para distribuir. Libere horas em outra disciplina ou aumente a carga\n"
    "                      semanal em Ajustes.\n"
    "                    </span>\n"
    "                  ) : (\n"
    "                    <span>\n"
    "                      Peso {weight} \u2192 {autoInfo.sharePercent}% das{' '}\n"
    "                      {formatHoursDuration(autoInfo.capacityHours)} semanais. Mexa no peso e a\n"
    "                      meta acompanha.\n"
    "                    </span>\n"
    "                  )\n"
    "                ) : (\n"
    "                  <span>\n"
    "                    Fixo por voc\u00ea. O autom\u00e1tico daria {formatHoursDuration(autoTarget)}.\n"
    "                  </span>\n"
    "                )}\n"
    "              </p>\n"
)

s = s[:inicio] + novo + s[fim:]
io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('ok: explicacao da meta encurtada')
print('removidas %d linhas' % ((fim - inicio - len(novo)) // 40))
