"""Lote 1 da simplificacao: remove os itens 12, 13, 20, 65, 70, 71, 75, 78 (parte).

- 12 Dicas do Study Trainer      -> services/studyTrainer.ts
- 65 Sessao rapida               -> QuickSessionModal + TopBar
- 70 Agendador de notificacoes   -> services/notificationScheduler.ts + MainLayout
- 71 Inteligencia de concursos   -> services/concursosPresetIntelligence.ts + rota de import
- 75 Coach adaptativo            -> services/adaptiveCoach.ts
"""
import os
import re
import subprocess
import sys

RAIZ = "/home/user/my-cronograma/"
APAGAR = [
    "src/services/studyTrainer.ts",
    "src/services/adaptiveCoach.ts",
    "src/services/concursosPresetIntelligence.ts",
    "src/services/notificationScheduler.ts",
    "src/components/session/QuickSessionModal.tsx",
]


def ler(p):
    return open(RAIZ + p, encoding="utf-8").read()


def gravar(p, s):
    open(RAIZ + p, "w", encoding="utf-8").write(s)


def trocar(p, velho, novo, rotulo):
    s = ler(p)
    if velho not in s:
        print(f"FALHA em {rotulo}: trecho nao encontrado em {p}")
        sys.exit(1)
    gravar(p, s.replace(velho, novo, 1))
    print(f"ok {rotulo}")


def cortar_linhas(p, ini_txt, fim_txt, rotulo, preservar_fim=False):
    linhas = ler(p).split("\n")
    i = next((k for k, l in enumerate(linhas) if ini_txt in l), None)
    if i is None:
        print(f"FALHA em {rotulo}: inicio nao achado em {p}")
        sys.exit(1)
    j = next((k for k in range(i + 1, len(linhas)) if fim_txt in linhas[k]), None)
    if j is None:
        print(f"FALHA em {rotulo}: fim nao achado em {p}")
        sys.exit(1)
    if preservar_fim:
        j -= 1
    del linhas[i:j + 1]
    gravar(p, "\n".join(linhas))
    print(f"ok {rotulo} ({j - i + 1} linhas)")


# ---------------------------------------------------------------- MainLayout
cortar_linhas(
    "src/components/layout/MainLayout.tsx",
    "useEffect(() => {",
    "userSettings.backlogReminderEnabled,",
    "MainLayout: efeito do agendador",
)
trocar(
    "src/components/layout/MainLayout.tsx",
    "import {\n  clearStudyNotificationSchedule,\n  recalculateStudyNotificationSchedule,\n} from '@/services/notificationScheduler';\n",
    "",
    "MainLayout: import do scheduler",
)
s = ler("src/components/layout/MainLayout.tsx")
for nome in ["plannerBlocks", "userSettings", "defaultSettings"]:
    if not re.search(rf"\b{nome}\b", s.split("interface MainLayoutProps")[0]):
        continue
resto = s
for nome in ["useLocalStorage", "defaultSettings"]:
    # so remove se nao sobrar uso no corpo
    usos = len(re.findall(rf"\b{nome}\b", resto)) - 1
    if usos <= 0:
        trocar(
            "src/components/layout/MainLayout.tsx",
            f"import {{ {nome} }} from '@/hooks';\n" if nome == "useLocalStorage" else f"import {{ {nome} }} from '@/lib/defaultSettings';\n",
            "",
            f"MainLayout: import {nome}",
        )

# ------------------------------------------------------------------- TopBar
cortar_linhas(
    "src/components/layout/TopBar.tsx",
    "  onOpenQuickSession: () => void;",
    "  onToggleNotifications: () => void;",
    "TopBar: prop onOpenQuickSession (tipo)",
)
cortar_linhas(
    "src/components/layout/TopBar.tsx",
    "  onOpenQuickSession,",
    "  onToggleNotifications,",
    "TopBar: prop onOpenQuickSession (desestruturacao)",
)
cortar_linhas(
    "src/components/layout/TopBar.tsx",
    '      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 xl:gap-3">',
    "    </AppContainer>",
    "TopBar: botao Sessao rapida",
)
trocar(
    "src/components/layout/TopBar.tsx",
    "  const [showQuickSession, setShowQuickSession] = useState(false);\n",
    "",
    "TopBar: estado showQuickSession",
)
cortar_linhas(
    "src/components/layout/TopBar.tsx",
    "  const quickSessionSubjects = useMemo(",
    "  const unreadCount = notifications.filter",
    "TopBar: quickSessionSubjects",
)
trocar(
    "src/components/layout/TopBar.tsx",
    "    setShowNotifications(false);\n    setShowQuickSession(false);\n",
    "    setShowNotifications(false);\n",
    "TopBar: reset ao trocar de rota",
)
trocar(
    "src/components/layout/TopBar.tsx",
    "            onOpenQuickSession={() => setShowQuickSession(true)}\n",
    "",
    "TopBar: passagem da prop",
)
cortar_linhas(
    "src/components/layout/TopBar.tsx",
    "      <QuickSessionModal",
    "    </>",
    "TopBar: modal de sessao rapida",
)
trocar(
    "src/components/layout/TopBar.tsx",
    "import { QuickSessionModal } from '@/components/session';\n",
    "",
    "TopBar: import QuickSessionModal",
)

# --------------------------------------------------------- rota de presets
trocar(
    "src/app/api/presets/[id]/import/route.ts",
    "import { buildConcursosPresetSubjectsFromAnswers } from '@/services/concursosPresetIntelligence';\n",
    "",
    "rota import: import concursos",
)
trocar(
    "src/app/api/presets/[id]/import/route.ts",
    """  if (dbPresetName.toLowerCase().includes('concurso')) {
    return buildConcursosPresetSubjectsFromAnswers(wizardAnswers);
  }

""",
    "",
    "rota import: ramo concurso",
)

# ------------------------------------------------------------ services/index
trocar(
    "src/services/index.ts",
    "export * from './notificationScheduler';\n",
    "",
    "services/index: notificationScheduler",
)

# ------------------------------------------------------- components/session
p = "src/components/session/index.ts"
s = ler(p)
s = re.sub(r"export[^\n]*QuickSessionModal[^\n]*\n", "", s)
gravar(p, s)
print("ok components/session/index.ts limpo")

# --------------------------------------------------------------- apagar arquivos
for rel in APAGAR:
    alvo = RAIZ + rel
    if os.path.exists(alvo):
        os.remove(alvo)
        print(f"apagado {rel}")
    else:
        print(f"AVISO: {rel} nao existia")

# ------------------------------------------------------ exports orfaos restantes
for rel in ["src/services/index.ts", "src/components/session/index.ts"]:
    s = ler(rel)
    for nome in ["studyTrainer", "adaptiveCoach", "notificationScheduler", "QuickSessionModal"]:
        if nome in s:
            print(f"AVISO: {rel} ainda menciona {nome}")

print("\nLOTE 1 aplicado.")
