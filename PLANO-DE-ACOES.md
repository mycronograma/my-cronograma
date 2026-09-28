# Plano de Ações — Nexora (pós-rodada de testes do usuário)

> Origem: 17 registros enviados pelo usuário com prints (28/set–29/set/2026).
> Regra de ouro do plano: **nenhuma mudança quebra o sync/snapshot nem o banco em memória**;
> tudo é validado com `tsc`, lint, `next build`, `e2e-smoke.mjs` e teste manual no preview/local.
> Tamanhos: **P** (< 1 h de trabalho focado), **M** (1–3 h), **G** (feature, > 3 h).

---

## Fase 1 — O app fala certo e não trava o uso (correções de corretude)

| # | Registro | Diagnóstico (arquivos) | Ação | Tam |
|---|----------|------------------------|------|-----|
| 1 | Sessão Rápida sem disciplinas | `TopBar.tsx` passa `subjects={quickSessionSubjects}` derivado do store local; chega `[]` quando o store ainda não hidratou/não tem matérias | Unificar a fonte (ler `nexora_subjects` completo + fallback `fetch /api/progress`), desabilitar o botão com tooltip quando não houver matérias, renderizar lista com busca | P |
| 2 | Horas decimais no wizard (8,5) | `PresetConfigWizard.tsx`: input numérico cru | Exibir/entrar em **HH:MM** (máscara + parse p/ decimal interno); atalhos já usam `formatDuration` | M |
| 8 | Meta semanal decimal (28.5h) + legenda "Realizado" duplicada | `dashboard/page.tsx` + `WeeklyChart.tsx` | Usar o formatador único (decimal → `28h30`); corrigir séries/legenda do gráfico (Realizado × Meta) | P |
| 7 | Banner "Complete seu perfil" persistente | `dashboard/page.tsx` (~linha 404): condição não reflete estado real | Criar helper `setupPendente(state)`; banner só aparece com preferência/perfil realmente pendentes e some após wizard | P |
| 11b | Banner "Configurar agora" persistente nas Configurações | `settings/page.tsx` | Mesma regra do #7 (CTA some quando já há preset/plano configurado) | P |
| 9 | Cronômetro sem tipo/tópico | modal de timer (`dashboard/page.tsx` / `QuickSessionModal.tsx`): header só com matéria | Badge de tipo (Aula/Exercícios/Revisão/Simulado) + descrição/tópico + ciclo, herdados do bloco | P |
| 3 | Durações do Novo Bloco ignoram config | `planner/page.tsx` linha ~563: `[30,45,60,90,120]` fixos | Lista dinâmica: duração configurada (`focusBlockMinutes`) sempre presente e selecionada + personalizada | P |
| 4 | Blocos manuais sem intervalo | handler de add do `planner/page.tsx` não insere `isBreak` | Ao criar/mover bloco, inserir pausa (`breakMinutes`) entre consecutivos e reflow dos seguintes | M |

**Definition of done da Fase 1:** entrar → sessão rápida listando matérias; wizard e metas em formato de hora; sem banners zumbis; timer contextual; blocos manuais com pausa e duração configurada.

## Fase 2 — Redesign coerente (mesmo design system em toda tela)

| # | Registro | Diagnóstico | Ação | Tam |
|---|----------|-------------|------|-----|
| 5 | Agenda de Hoje truncada + fora do estilo | `dashboard/page.tsx` (card com max-h e scroll interno) | Card estica até o fim da coluna; header/raio/borda/sombra pelos tokens do design system; scroll só se exceder | M |
| 11a | Configurações fora do padrão | `settings/page.tsx` | Redesenhar: cards por grupo (Conta/Estudo/Segurança), tiles de ícone com tint, chevron/hover padronizados | M |
| 12 | Zona de perigo confusa | `settings/page.tsx` | Hierarquia: neutro (sair) = secundário; reversível-perigoso = outline âmbar; irreversível = vermelho sólido + confirmação; contraste AA | P |
| 16 | Modal detalhes da disciplina com tema quebrado | `SubjectCard.tsx` (classes dark hardcoded) | Converter p/ CSS variables de tema; título legível nos 2 temas; auditoria de contraste em todos os overlays | P |
| 17 | "Importar Predefinição" permanente | `subjects/page.tsx` | Some após 1ª importação; "Trocar predefinição" vai p/ Zona de Perigo com aviso de reset total + confirmação em 2 etapas | M |

## Fase 3 — Dados que alimentam a "IA" (métricas reais e sugestões acionáveis) — ✅ ENTREGUE (`294f3b3`)

| # | Registro | Diagnóstico | Ação | Tam |
|---|----------|-------------|------|-----|
| 10 | Acerto/Mapa sem entrada de dados | fluxo de concluir sessão não pergunta questões/acertos | Ao concluir sessão: diálogo rápido "fez quantas questões? acertou quantas?" (opcional) → grava `correctAnswers/totalQuestions`; Mapa de Atividades lê sessões concluídas; cards se escondem com CTA quando não há dados | M |
| 14 | Sugestão Adaptativa vaga | `dashboard/page.tsx` + `adaptiveStudyIntelligence.ts` | Card "coach": evidência real (acertos das últimas sessões), recomendação específica com botão **Adicionar ao plano de hoje**, sugestão de meta com Aplicar/Agora não, estado vazio honesto | M |
| 15 | Editar Disciplina: prioridade×dificuldade + meta automática | `SubjectForm.tsx` | Dificuldade deriva prioridade (ou peso único) com explicação; meta semanal calculada ao vivo `f(prioridade, dificuldade, disponibilidade)` redistribuindo as demais; override explícito | M |

**Definition of done da Fase 3 (entregue em `294f3b3`):** meta semanal calculada a partir de prioridade (60%) + dificuldade (40%) sobre a carga disponível, editável em `h:min` e com botão "voltar ao automático"; card de sugestão mostrando evidência real (% de erros, dias sem estudar), valor antes → depois, CTA que altera a meta de fato e "Dispensar"; modal "Registrar questões" (matéria, tipo, data, total, acertos) acessível pela Análise e pelo detalhe da disciplina, gravando `correctAnswers/totalQuestions` e recalculando a taxa de acerto.

## Fase 4 — Motor de cronograma (realocar, adiantar, recalcular, travar)

| # | Registro | Diagnóstico | Ação | Tam |
|---|----------|-------------|------|-----|
| 6 | Plano de Hoje + recálculo + trava sequencial | hoje: `backlogRescheduler.ts` só trata atrasados | Motor de recálculo: (c) puxar conteúdo do próx. dia ao adicionar estudo extra hoje; (d) não cumprido → empurra p/ próx. dia e recalcula tudo; (e) trava: não iniciar blocos de dia futuro com hoje pendente; botão **Ver plano de hoje** com edição paritária ao cronograma | G |
| 13 | Novo Bloco simples: realocar ou adiantar | `planner/page.tsx` (modal atual) | Substituir modal por 2 fluxos: **Realocar matéria** (move o bloco original p/ o dia/hora escolhidos) e **Adiantar próximo dia** (pull + recálculo); preview do impacto na grade antes de confirmar | G |

## Fase 5 — Blindagem e preparação para a nuvem

1. Estender `scripts/e2e-smoke.mjs` com casos do motor de recálculo (realocar/adiantar/empurrar), formatação de horas e regras de intervalo.
2. `tsc --noEmit`, `next lint`, `next build` e smoke UI verdes.
3. Atualizar `AUDITORIA.md` (3ª rodada) e `SIMULACAO-1-ANO.md` se o motor mudar dados.
4. **Somente com aprovação sua:** migragem para banco em nuvem (Neon/Supabase/CockroachCloud): `prisma db push` + seed + simulação no provedor, `DATABASE_URL` como secret, deploy (repo já tem `vercel-build`).

---

## Ordem de execução sugerida

Fase 1 (`7714510`) ✅ → Fase 2 (`488c0f5`) ✅ → Fase 3 (`294f3b3`) ✅ → Fase 4 (2 features G) → Fase 5 (blindagem) → nuvem.

Também entregue fora das fases: `3e5567e` (cores de perigo/atenção e superfícies neutras seguindo o tema, corrigindo as faixas ilegíveis no tema claro).

Commits pequenos por item, sempre no branch `arena/01a0d9e7-my-cronograma`, com o preview/local validado a cada fase.
