"""Lote 1 (telas): remove #52 Reiniciar tutorial (settings) e #20 Aderencia aos Blocos (planner)."""
import re
import sys

RAIZ = "/home/user/my-cronograma/"


def cortar(rel, ini, fim, rotulo, preservar_fim=False):
    s = open(RAIZ + rel, encoding="utf-8").read()
    i = s.find(ini)
    if i < 0:
        print(f"FALHA {rotulo}: inicio"); sys.exit(1)
    j = s.find(fim, i + len(ini))
    if j < 0:
        print(f"FALHA {rotulo}: fim"); sys.exit(1)
    if not preservar_fim:
        j += len(fim)
    novo = s[:i] + s[j:]
    open(RAIZ + rel, "w", encoding="utf-8").write(novo)
    print(f"ok {rotulo} ({j - i} chars)")


SET = "src/app/(app)/settings/page.tsx"
PLA = "src/app/(app)/planner/page.tsx"

# ------------------------------------------------ #52 Reiniciar tutorial
cortar(SET, "          {/* Reiniciar tutorial — atenção */}", "          {/* Trocar predefinição", "settings: bloco Reiniciar tutorial")
cortar(SET, "  const startResetTutorialFlow = () => {", "  const startResetProgressFlow = () => {", "settings: funcoes do tutorial")
cortar(SET, "  const [resetTutorialStep, setResetTutorialStep] = useState<'idle' | 'confirm'>('idle');\n", "", "settings: estado resetTutorialStep")
cortar(SET, "  const [isResettingTutorial, setIsResettingTutorial] = useState(false);\n", "", "settings: estado isResettingTutorial")

s = open(RAIZ + SET, encoding="utf-8").read()
if len(re.findall(r"\bRotateCcw\b", s)) == 1:  # so o import
    s = re.sub(r"\n  RotateCcw,", "", s, count=1)
    open(RAIZ + SET, "w", encoding="utf-8").write(s)
    print("ok settings: icone RotateCcw sem uso")

# ------------------------------------------- #20 Aderencia aos Blocos
s = open(RAIZ + PLA, encoding="utf-8").read()
ini = s.find("Aderência aos Blocos")
if ini < 0:
    print("FALHA planner: texto da aderencia"); sys.exit(1)
# volta ate o <div que abre o card
abre = s.rfind('<div className="rounded-2xl bg-background-light', 0, ini)
fecha = s.find("</div>", ini)
if abre < 0 or fecha < 0:
    print("FALHA planner: limites do card"); sys.exit(1)
fecha += len("</div>\n")
card = s[abre:fecha]
if "Total Planejado" in card or "Disciplinas Prioritárias" in card:
    print("FALHA planner: card capturado errado"); sys.exit(1)
s = s.replace(card, "", 1)
open(RAIZ + PLA, "w", encoding="utf-8").write(s)
print(f"ok planner: card Aderencia aos Blocos ({len(card)} chars)")

# pct pode ter ficado sem uso
s = open(RAIZ + PLA, encoding="utf-8").read()
usos_pct = len(re.findall(r"\bpct\b", s))
print(f"planner: 'pct' ainda tem {usos_pct} ocorrencias")
