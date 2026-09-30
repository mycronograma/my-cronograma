"""Remove do dashboard: coach adaptativo (#75), dicas do Study Trainer (#12)
e o texto de incentivo de nivel (#13). O card "Nivel e XP" continua (item 11).

Cortes por linha, com verificacao de equilibrio de tags JSX no fim."""
import sys

P = "src/app/(app)/dashboard/page.tsx"
linhas = open(P, encoding="utf-8").read().split("\n")

def bloco(inicio_txt, fim_txt, rotulo):
    """Devolve (i, j) com i..j inclusos, achando inicio e fim depois dele."""
    i = next((k for k, l in enumerate(linhas) if inicio_txt in l), None)
    if i is None:
        print(f"FALHA: inicio de {rotulo}"); sys.exit(1)
    j = next((k for k in range(i + 1, len(linhas)) if fim_txt in linhas[k]), None)
    if j is None:
        print(f"FALHA: fim de {rotulo}"); sys.exit(1)
    return i, j

# 1) card do coach: do "{coachVisible && (" ate a linha do motion.div delay 0.5
i, j = bloco("{coachVisible && (", 'transition={{ delay: 0.5 }}>', "card do coach")
del linhas[i:j + 1]

# 2) card de dicas: do motion.div delay 0.6 ate a linha anterior ao modal
i, j = bloco('transition={{ delay: 0.6 }}>', "<StudyBlockSessionModal", "card de dicas")
del linhas[i:j]  # preserva a linha do modal

# 3) linhas soltas
txt = "\n".join(linhas)
for pedaco in [
    "import { buildCoachSuggestion, currentWeeklyGoal, type CoachSuggestion } from '@/services/adaptiveCoach';\n",
    "import { defaultTrainerTips } from '@/services/studyTrainer';\n",
    "  const [coachDismissed, setCoachDismissed] = useState<string | null>(null);\n",
    "  const [coachApplied, setCoachApplied] = useState<string | null>(null);\n",
    "  const [showAllTips, setShowAllTips] = useState(false);\n",
    '                    <p className="text-sm text-text-secondary">Continue estudando para subir de nível!</p>\n',
    "  Coffee,\n",
    "  ChevronRight,\n",
    "  Calendar,\n",
    "  CalendarDays,\n",
    "  Lightbulb,\n",
    "  Award,\n",
]:
    if pedaco not in txt:
        print(f"AVISO: nao achei para remover: {pedaco.strip()[:60]}")
    txt = txt.replace(pedaco, "", 1)

# 4) blocos de logica do coach
def cortar_txt(texto, inicio, fim, rotulo):
    i = texto.find(inicio)
    if i < 0:
        print(f"FALHA: inicio de {rotulo}"); sys.exit(1)
    j = texto.find(fim, i)
    if j < 0:
        print(f"FALHA: fim de {rotulo}"); sys.exit(1)
    return texto[:i] + texto[j + len(fim):]

txt = cortar_txt(
    txt,
    "  // Sugestão só existe quando há evidência real de algo a ajustar (ritmo",
    "  const setupConcluido = subjects.length > 0 || plannerBlocks.length > 0;",
    "coachSuggestion",
)
txt = cortar_txt(
    txt,
    "  /** Aplica a sugestão do coach: muda a configuração de verdade. */",
    "  const handleStartBlock = (block: StudyBlock) => {",
    "handleApplyCoach",
)

# 5) saneamento: icones importados e nunca usados
import re
m = re.search(r"import \{\n(.*?)\n\} from 'lucide-react';", txt, re.S)
if m:
    corpo = txt[m.start(1):m.end(1)]
    restante = txt[:m.start(1)] + txt[m.end(1):]
    usados = [l.strip().rstrip(",") for l in corpo.split("\n") if l.strip()]
    mortos = [n for n in usados if not re.search(rf"\b{re.escape(n)}\b", restante)]
    if mortos:
        novo = "\n".join(l for l in corpo.split("\n") if l.strip().rstrip(",") not in mortos)
        txt = txt[:m.start(1)] + novo + txt[m.end(1):]
        print("icones sem uso removidos:", ", ".join(mortos))

open(P, "w", encoding="utf-8").write(txt)
fim = len(txt.split("\n"))
print(f"dashboard: 792 -> {fim} linhas")

# 6) equilibrio de chaves/JSX como rede de seguranca
abre, fecha = txt.count("{"), txt.count("}")
print(f"chaves: {abre} abre / {fecha} fecha -> {'OK' if abre == fecha else 'DESEQUILIBRADO'}")
for nome in ["adaptiveCoach", "studyTrainer", "coachVisible", "defaultTrainerTips", "showAllTips", "Continue estudando"]:
    if nome in txt:
        print(f"AINDA PRESENTE: {nome}")
