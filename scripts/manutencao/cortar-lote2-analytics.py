"""Lote 2: limpa a tela Progresso (analytics) removendo os itens
38 Pontuacao media de foco, 39 Acerto estimado, 40 Exercicios/simulados,
45 Pico de performance e 46 Previsao de evolucao.

Mantem: 35 Tempo de estudo, 36 Sessoes concluidas, 37 Produtividade media,
41 Consistencia 30 dias, 43 Insights da IA, 44 Melhor/pior disciplina.
"""
import re
import sys

RAIZ = "/home/user/my-cronograma/"
P = "src/app/(app)/analytics/page.tsx"


def cortar(ini, fim, rotulo, preservar_fim=False):
    s = open(RAIZ + P, encoding="utf-8").read()
    i = s.find(ini)
    if i < 0:
        print(f"FALHA {rotulo}: inicio"); sys.exit(1)
    j = s.find(fim, i + len(ini))
    if j < 0:
        print(f"FALHA {rotulo}: fim"); sys.exit(1)
    if not preservar_fim:
        j += len(fim)
    open(RAIZ + P, "w", encoding="utf-8").write(s[:i] + s[j:])
    print(f"ok {rotulo}")


def trocar(velho, novo, rotulo):
    s = open(RAIZ + P, encoding="utf-8").read()
    if s.count(velho) != 1:
        print(f"FALHA {rotulo}: {s.count(velho)} ocorrencias"); sys.exit(1)
    open(RAIZ + P, "w", encoding="utf-8").write(s.replace(velho, novo, 1))
    print(f"ok {rotulo}")


# ---------------------------------------------------------------- StatsCards
cortar(
    '        <StatsCard\n          title="Acerto estimado"',
    "        <StatsCard\n          title=\"Pontuação Média de Foco\"",
    "39 Acerto estimado",
    preservar_fim=True,
)
cortar(
    '        <StatsCard\n          title="Pontuação Média de Foco"',
    '        <StatsCard\n          title="Produtividade Média"',
    "38 Pontuacao media de foco",
    preservar_fim=True,
)

# ------------------------------------- 40 card "Sobre o acerto" + registrar
cortar(
    '      <motion.div variants={itemVariants} className="min-w-0">\n        <Card className="border-neon-blue/20 bg-neon-blue/5">',
    '      {/* Linha de Gráficos */}',
    "40 card Sobre o acerto",
)

# ------------------------------------------------------- modal de questoes
cortar(
    "      <AnimatePresence>\n        {showQuestionLog && subjects.length > 0 && (",
    "      </AnimatePresence>\n",
    "modal de registro de questoes",
)

# ------------------------------------------------------ handleSaveQuestionLog
cortar(
    "  const handleSaveQuestionLog = (payload: {",
    "  const completedStats = useMemo(() => {",
    "handleSaveQuestionLog",
)

# ------------------------------------------------------------ calculos mortos
cortar(
    "  const avgFocus =\n",
    "  const avgProductivity =\n",
    "calculo avgFocus",
)
cortar(
    "  const avgAccuracy = Math.round((intelligentSummary.avgAccuracyRate || 0) * 100);\n",
    "",
    "calculo avgAccuracy",
)
cortar(
    "  const totalLoggedQuestions = Object.values(analytics.performance?.subjects ?? {}).reduce(",
    "  );\n",
    "calculo totalLoggedQuestions",
)

# --------------------------------------------------------------- estado morto
trocar("  const [showQuestionLog, setShowQuestionLog] = useState(false);\n", "", "estado showQuestionLog")

# ------------------------------------------------------- 45 Pico de Performance
cortar(
    "            {/* Horário de Pico de Performance */}",
    "            {/* Melhor Disciplina */}",
    "45 Pico de Performance",
)

# --------------------------------------------------- 46 Previsao de Evolucao
cortar(
    '            <div className="p-4 max-[479px]:p-3 rounded-xl bg-white/5 border border-card-border">\n              <p className="text-xs text-text-secondary">Previsão de Evolução</p>',
    "            <div className=\"p-4 max-[479px]:p-3 rounded-xl bg-white/5 border border-card-border\">\n              <p className=\"text-xs text-text-secondary\">Produtividade Média</p>",
    "46 card Previsao de Evolucao",
    preservar_fim=True,
)
trocar(
    "                ? `Priorize ${intelligentSummary.weakestSubject.name} nos próximos dias. Previsão de evolução em 30 dias: ${intelligentSummary.projectedImprovement30d > 0 ? '+' : ''}${intelligentSummary.projectedImprovement30d.toFixed(1)} pontos percentuais.`",
    "                ? `Priorize ${intelligentSummary.weakestSubject.name} nos próximos dias.`",
    "recomendacao sem previsao",
)

# ------------------------------------------------------------------ imports
for imp in [
    "import QuestionLogModal from '@/components/analytics/QuestionLogModal';\n",
    "import { applyQuestionBatch, computeIntelligentAnalyticsSummary } from '@/services/adaptiveStudyIntelligence';",
]:
    if imp in open(RAIZ + P, encoding="utf-8").read():
        novo = "import { computeIntelligentAnalyticsSummary } from '@/services/adaptiveStudyIntelligence';" if "applyQuestionBatch" in imp else ""
        trocar(imp, novo, f"import {imp[:44]}")

# icones sem uso
s = open(RAIZ + P, encoding="utf-8").read()
corpo = s
for ic in ["ClipboardList", "Target", "Brain"]:
    if len(re.findall(rf"\b{ic}\b", corpo)) == 1:
        s = s.replace(f"  {ic},\n", "", 1)
        open(RAIZ + P, "w", encoding="utf-8").write(s)
        print(f"ok icone {ic} sem uso")

# AnimatePresence sem uso?
s = open(RAIZ + P, encoding="utf-8").read()
if len(re.findall(r"\bAnimatePresence\b", s)) == 1:
    s = s.replace("import { motion, AnimatePresence } from 'framer-motion';", "import { motion } from 'framer-motion';")
    open(RAIZ + P, "w", encoding="utf-8").write(s)
    print("ok AnimatePresence sem uso")

print("\nLOTE 2 aplicado.")
