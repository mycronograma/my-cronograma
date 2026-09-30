"""Corrige os dois cortes do Lote 1 usando blocos textuais extraidos do HEAD,
sem precisar redigitar o codigo (evita erro de digitacao)."""
import re
import subprocess
import sys

RAIZ = "/home/user/my-cronograma/"


def original(rel):
    return subprocess.run(["git", "show", "HEAD:" + rel], capture_output=True, text=True, cwd=RAIZ).stdout


def bloco(orig, ini, fim, rotulo):
    i = orig.find(ini)
    if i < 0:
        print(f"FALHA {rotulo}: inicio"); sys.exit(1)
    j = orig.find(fim, i)
    if j < 0:
        print(f"FALHA {rotulo}: fim"); sys.exit(1)
    return orig[i:j + len(fim)]


def aplicar(rel, pedacos, rotulo):
    """pedacos: lista de strings exatas a remover."""
    s = open(RAIZ + rel, encoding="utf-8").read()
    for p in pedacos:
        if s.count(p) != 1:
            print(f"FALHA {rotulo}: bloco aparece {s.count(p)}x (esperado 1)")
            print(repr(p[:90]))
            sys.exit(1)
        s = s.replace(p, "", 1)
    open(RAIZ + rel, "w", encoding="utf-8").write(s)
    print(f"ok {rotulo}")


# ------------------------------------------------------- MainLayout (#70)
ml = "src/components/layout/MainLayout.tsx"
o = original(ml)
efeito = bloco(o, "  useEffect(() => {\n    const scheduleNow = () => {", "  ]);\n", "useEffect scheduler")
aplicar(ml, [efeito], "MainLayout: efeito do agendador")

s = open(RAIZ + ml, encoding="utf-8").read()
for imp in [
    "import {\n  clearStudyNotificationSchedule,\n  recalculateStudyNotificationSchedule,\n} from '@/services/notificationScheduler';\n",
]:
    if imp in s:
        s = s.replace(imp, "", 1)
        open(RAIZ + ml, "w", encoding="utf-8").write(s)
        print("ok MainLayout: import do scheduler")

# imports que ficaram sem uso
corpo = s.split("interface MainLayoutProps")[1] if "interface MainLayoutProps" in s else s
for nome, caminho in [("useLocalStorage", "@/hooks"), ("defaultSettings", "@/lib/defaultSettings")]:
    usos = len(re.findall(rf"\b{nome}\b", corpo))
    if usos == 0:
        s2 = re.sub(rf"import \{{ {nome} \}} from '{re.escape(caminho)}';\n", "", s)
        if s2 != s:
            open(RAIZ + ml, "w", encoding="utf-8").write(s2)
            s = s2
            print(f"ok MainLayout: import {nome} sem uso removido")

# ---------------------------------------------------------- TopBar (#65)
tb = "src/components/layout/TopBar.tsx"
o = original(tb)
botao = bloco(o, "        <motion.button\n          whileHover={{ scale: 1.05 }}", "        </motion.button>\n", "botao sessao rapida")
aplicar(tb, [botao], "TopBar: botao Sessao rapida")

s = open(RAIZ + tb, encoding="utf-8").read()
for pedaco in [
    "import { QuickSessionModal } from '@/components/session';\n",
    "  const [showQuickSession, setShowQuickSession] = useState(false);\n",
    "  onOpenQuickSession: () => void;\n",
    "  onOpenQuickSession,\n",
    "            onOpenQuickSession={() => setShowQuickSession(true)}\n",
    "    setShowNotifications(false);\n    setShowQuickSession(false);\n",
]:
    if pedaco in s:
        s = s.replace(pedaco, "    setShowNotifications(false);\n" if pedaco.startswith("    setShowNotifications") else "", 1)

# quickSessionSubjects (bloco useMemo inteiro)
qs = bloco(o, "  const quickSessionSubjects = useMemo(", "  );\n", "quickSessionSubjects")
if qs in s:
    s = s.replace(qs, "", 1)
    print("ok TopBar: quickSessionSubjects")

# modal
modal = bloco(o, "      <QuickSessionModal", "      />\n", "modal")
if modal in s:
    s = s.replace(modal, "", 1)
    print("ok TopBar: modal sessao rapida")

open(RAIZ + tb, "w", encoding="utf-8").write(s)

# icone Plus pode ter ficado sem uso
corpo = s
usos_plus = len(re.findall(r"\bPlus\b", corpo)) - 1
if usos_plus <= 0:
    s2 = re.sub(r"\n  Plus,", "", s, count=1)
    if s2 != s:
        open(RAIZ + tb, "w", encoding="utf-8").write(s2)
        print("ok TopBar: icone Plus sem uso removido")

print("\nCorrecoes aplicadas.")
