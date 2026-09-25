# Auditoria de bugs — Nexora

**Data:** 2026-09-25 (1ª rodada) · atualizado na mesma data após a 2ª rodada de correções
**Branch:** `arena/01a0d9e7-my-cronograma`
**Escopo:** app inteiro (páginas, componentes, serviços de cálculo, rotas de API, auth, PWA, tema, Prisma schema).
**Método:** leitura de código + provas numéricas com `tsx`, `tsc --noEmit`, `next lint`, `next build`, suíte `scripts/*.test.ts`, `npm audit`, **harness Prisma em memória** (`scripts/dev-inmemory-prisma.cjs`) e **smoke test E2E real** (`scripts/e2e-smoke.mjs`, 51 verificações HTTP contra `next dev`).

> **Limitação do ambiente (contornada):** `prisma generate` não baixa os binários no sandbox (`binaries.prisma.sh` bloqueado). Para não ficar sem banco, criei um **PrismaClient em memória** gerado a partir do `schema.prisma` (`scripts/dev-inmemory-prisma.cjs`), instalado em `node_modules/.prisma/client` (não versionado). Com ele o app roda de ponta a ponta — cadastro, login, presets, geração, sessões, notificações, exclusão — e o `tsc --noEmit` termina com **0 erros**.

---

## 1. Resumo

O app está funcional e bem organizado, mas tinha três classes de problema:

1. **Dois motores de geração de cronograma que discordavam entre si** (o mais grave): o botão "Gerar com IA" do Planner ignorava dias de descanso, carga por dia da semana, janelas de disponibilidade e regras de simulado → **22,8 h/semana vs 17,0 h da API (+34%)** para a mesma configuração. *(Corrigido na 1ª rodada.)*
2. **Métricas inventadas ou hardcoded** apresentadas como medição ("Lucas", "Revisões pendentes: 3", foco 85% fixo, acurácia deduzida do tipo de bloco, "sugestão da IA" que não aplicava nada). *(Corrigido nas duas rodadas.)*
3. **Metade do produto nunca rodava**: `gamification.ts` inteiro sem nenhum uso, nenhuma `StudySession` criada (logo `xp/level/streak/longestStreak` nunca gravados e o lembrete de sequência nunca disparava), ~3.400 linhas de UI morta, PWA sem cache/ícones, modais sem acessibilidade. *(Corrigido na 2ª rodada.)*

Além disso havia **segurança fraca em todos os fluxos de auth** (zero rate limiting, 2FA brute-forceável, reset de senha sem invalidar sessões, segredo de auth com fallback público). *(Corrigido na 2ª rodada.)*

**Resultado da 2ª rodada:** tudo que estava pendente nas seções 3–6 da 1ª rodada foi implementado, exceto os itens explicitamente listados em **§6 (recomendações remanescentes)**. Validação final: `tsc --noEmit` **0 erros**, `next lint` **limpo**, `next build` **OK**, 4 suítes de teste **verdes**, **E2E 51/51**, smoke de UI **11/11**.

---

## 2. Corrigidos — 1ª rodada (resumo; detalhes completos no histórico do branch)

### 2.1 Cálculo e lógica

| # | Bug | Correção |
|---|-----|----------|
| 1 | Geração divergente cliente × API (22,8 h vs 17,0 h) | `src/services/scheduleConstraints.ts` como fonte única; paridade verificada (17,0 h nos dois caminhos) |
| 2 | Fuso horário deslocava blocos 1 dia (`toLocalDateKey` sobre ISO UTC) | `parseBlockDate` distingue data pura UTC de instante real; verificado em 6 fusos |
| 3 | Mapa de atividades excluía os últimos 6 dias e somava histórico inteiro | Janela ancorada no domingo atual; totais só do período exibido |
| 4 | Meta semanal ignorava descanso/carga por dia (`hoursPerDay * 7`) | `getHoursForDate`/`getWeeklyGoalHours`; meta = soma real dos 7 dias |
| 5 | "0 de N concluídos" eterno + bloco concluído sumia da agenda | Lista completa do dia no `TodayPlan` + contagem real |
| 6 | Concluir duas vezes contava horas/XP em dobro | Guarda de status em `handleStartBlock` |
| 7 | Iniciar sessão corrompia horário (fim antes do início) | Horário planejado preservado |
| 8 | "Adiar 15 min" virava o dia (`% 24`) | Clamp em 23:59 + recálculo preservando duração |
| 9 | `truncate` devolvia string maior | Guarda `length <= 3` |
| 10 | Defaults divergentes do dashboard vs `defaultSettings` | Dashboard usa `defaultSettings` |
| 11 | `window.scrollTo` inerte no Settings (scroll é do `<main>`) | Helpers `readScrollTop`/`scrollContainerTo` |
| 12 | `chooseNextDayForSimulado` recriava snapshot por candidato | Snapshot içado do loop |

### 2.2 UI e dados exibidos

| # | Bug | Correção |
|---|-----|----------|
| 13 | "Olá, Lucas! 🎓" hardcoded | Nome real (settings → sessão → "Estudante") |
| 14 | "Revisões pendentes: 3" e "Conquistas: Nv. 12" fixos | Contagens reais; cards substituídos por meta/blocos de hoje |
| 15 | "Sugestão da IA" era teatro | Botão aplica +2 h na meta da matéria e o texto diz o que aconteceu |
| 16 | "Recomendado Agora" ignorava o horário | Ordem: em andamento → cobre agora → próximo → primeiro pendente |
| 17 | `LevelProgress` mentia (conquistas = streak; XP com curva errada) | Reescrito com `levelFromXp`, recorde e sessões reais |
| 18 | `WeeklyChart` com legenda "Meta" inexistente e denominador inventado | Legenda removida; contadores respeitam `totalTargetDays` |
| 19 | `ProgressBar`: prop ignorada e `width: NaN%` com `max=0` | Prop aplicada; divisão protegida |
| 20 | TopBar desktop: clicar no avatar deslogava | Avatar → `/settings`; logout com botão próprio |
| 21 | `icon.svg` inválido (comentários JSX, `gradientUnits` errado) | XML válido |
| 22 | `manifest.ts` com SVG triplicado em tamanhos fixos | Entradas `sizes: 'any'` (PNGs vieram na 2ª rodada) |
| 23 | Build quebrado por variável `module` | Renomeada |
| 24 | BOM em 5 arquivos | Removido |
| 25 | `text-white` no header mobile do Settings | Token de tema |

### 2.3 Infraestrutura

| # | Bug | Correção |
|---|-----|----------|
| 26 | `/api/auth/delete-account` não existia (botão sempre falhava) | Rota criada com remoção explícita de todos os filhos em transação |
| 27 | `/api/notifications/dispatch` não existia (cron diário → 404) | Rota criada com validação de `CRON_SECRET` em tempo constante |

---

## 3. Corrigidos — 2ª rodada (os "pendentes" da 1ª rodada)

### 3.1 Segurança

| Item | Antes | Depois |
|---|---|---|
| Rate limiting | **zero** em todo o app | `src/lib/rateLimit.ts` (sliding window + penalty box). Aplicado em: `register` (5/15 min por IP+e-mail), `verify-2fa` (5 tentativas, bloqueio 30 min), `resend-2fa` (3/15 min), `password-reset/request` (por IP **e** por e-mail), `password-reset/confirm` (5 + bloqueio) e **login** via wrapper em `api/auth/[...nextauth]/route.ts` (8/10 min por IP+e-mail, devolve o contrato JSON que o client do next-auth mapeia como `error=RateLimited`, com mensagem própria na tela). Verificado no E2E: 6º cadastro → 429; 9º login errado → 429. |
| 2FA de cadastro | SHA-256 sem chave, 6 dígitos, **sem contador** | HMAC-SHA256 com o segredo do servidor (`lib/register-2fa.ts`) + teto de tentativas; ao estourar, bloqueio de 30 min mesmo com o código certo (provado no E2E). |
| Reset de senha | Não invalidava sessões | `password-reset/confirm` agora faz `session.deleteMany({userId})` na mesma transação. |
| Segredo de auth | Fallback público `'nexora-local-auth-secret'` quando `VERCEL_ENV !== 'production'`; `CRON_SECRET` aceito como segredo de auth | `env.ts`: fallback **somente fora de produção**; em produção sem `NEXTAUTH_SECRET` o segredo fica vazio (NextAuth falha alto) + log de erro; `CRON_SECRET` nunca é segredo de auth. Novo `assertAuthSecret()` e `canExposeDevVerificationCode` (código dev só fora de deploy: `!isProduction && !isVercel`). |
| Linking Google | `allowDangerousEmailAccountLinking` sem saneamento | `callbacks.signIn`: se a conta local com o e-mail **não** estava verificada, marca verificada e **apaga o `passwordHash`** (senha de atacante deixa de funcionar). Escopo `openid email profile` também adicionado (sem `openid` o Google devolve `id_token=null` e o adapter quebra). |
| Sessão após excluir conta | JWT stateless continuava válido → rotas gravavam dados órfãos | `callbacks.session` verifica existência do usuário (cache de 30 s) e devolve sessão sem `user` → layout redireciona e APIs dão 401; `delete-account` invalida o cache na hora. Provado no E2E (`/api/progress` → 401 após exclusão). |
| Enumeração de e-mail no resend | `404 Conta não encontrada` | Resposta genérica 200 (mesma do sucesso). |

### 3.2 Gamificação e sessões (o "produto morto" passou a existir)

- **`POST /api/sessions`** (novo): registra a sessão concluída no banco (`StudySession`), atualiza `Subject` (horas, sessões, média **só com acurácia real**), `User` (`xp`, `level`, `streak`, `longestStreak`, `lastStudyDate` via `processSessionCompletion` de `gamification.ts`), `WeeklyStats`, marca o bloco como concluído e **desbloqueia conquistas** (`Achievement` + `UserAchievement`, usando os ids estáticos do catálogo). Idempotente: `blockId` único quando o bloco existe no banco; `(usuário, matéria, início)` para blocos que vivem só no cliente e para sessões rápidas. Aceita atualização posterior da autoavaliação de foco (`sessionId`).
- **Cliente**: `src/lib/sessionSync.ts` (fire-and-forget, dedupe local, retry só em 5xx) chamado por `handleCompleteBlock` do dashboard e pelo `QuickSessionModal`. O estado local continua sendo a fonte de verdade da UI (offline-first); o servidor passa a receber o mesmo evento.
- **Consequências verificadas no E2E**: XP > 0, streak = 1 na 1ª sessão, `hasStudiedToday` do `notification-center` passa a ver sessões reais, relatório semanal sai do fallback.
- **`QuickSessionModal`**: o `focusScore` fixo **85** acabou — agora deriva da aderência ao tempo planejado e o usuário registra a autoavaliação real (chips Disperso/Normal/Focado/Total) que é enviada ao servidor sem duplicar a sessão.

### 3.3 Métricas honestas

- Novo `src/services/sessionScoring.ts`: foco/produtividade = função de **aderência ao tempo planejado + acurácia medida (quando existe) + autoavaliação (quando existe)**; sem dado, o peso é redistribuído (score menor, nunca inflado).
- `applyBlockCompletionMetrics`: `inferAccuracyForCompletedBlock` **deletado**; sem respostas, `accuracyRate` fica `null`/ausente no snapshot (`accuracyEstimated: true`) e **não contamina** perfil da matéria, maestria de tópicos, médias diárias nem `subjectRollingAccuracy`.
- `trend7d`: agora é a diferença entre a acurácia média dos **últimos 7 dias** e a dos **7 dias anteriores**, só com sessões medidas; sem dados nas duas janelas, preserva o valor anterior (antes comparava metades das últimas 14 *sessões*).
- `consistencyRate`: denominador = `min(30, dias desde o primeiro registro)` (antes sempre 30 → usuário de 2 dias aparecia com 6%).
- A UI de Analytics já rotula acurácia como "estimado"; com a mudança, estimativa só aparece quando não houve medição, e o restante é medido.

### 3.4 Preferências e sincronização

- `POST /api/preferences` responde `{ success: true, persisted: false, warning }` quando o banco falha; o Settings mostra o aviso em âmbar ("salvo apenas neste dispositivo") em vez de "Alterações salvas".
- `useServerProgressSync`: marca d'água local (`nexora_local_progress_at`) + `updatedAt` do snapshot → **vence o mais recente** (antes o remoto sempre sobrescrevia); sem listener de `storage` → adicionado (duas abas agora sincronizam); quando o local é mais novo o hook reenvia o estado local (merge por chave no servidor).

### 3.5 Acessibilidade dos diálogos

- Novo hook `src/hooks/useDialogA11y.ts`: `role="dialog"`, `aria-modal`, **Escape**, prisão de foco (Tab circula), foco inicial, restauração do foco ao fechar e lock de scroll.
- Aplicado em: `StudyBlockSessionModal`, `QuickSessionModal` (+ `role="alertdialog"` na confirmação de saída), `PresetConfigWizard`, os 3 diálogos do Planner (adicionar bloco, filtro do mapa, roadmap), modal de detalhes do `SubjectCard` e o painel de notificações do TopBar (que já tinha Escape).

### 3.6 PWA

- `scripts/generate-icons.py` (sem dependências: encoder PNG próprio + rasterização analítica do desenho de `icon.svg`) gera `icon-32/192/512`, `icon-maskable-512` e `apple-touch-icon.png` — conferidos visualmente.
- `manifest.ts` com PNG 192/512 + maskable + SVG; `layout.tsx` com favicon PNG e `apple-touch-icon` (iOS ignorava SVG).
- `public/sw.js` com cache **de verdade**: precache do app shell no install, navegação network-first com fallback offline, estáticos stale-while-revalidate, `/api/**` nunca em cache, caches versionados com limpeza no activate e ícones PNG nas notificações push.

### 3.7 Marca, código morto e performance

- **Marca única "Nexora"** em tudo que o usuário vê (manifest, título/aba, Sidebar, fallback do TopBar). As chaves de storage continuam `nexora_*` de propósito: renomeá-las orphanaria os dados locais de quem já usa o app.
- **~3.500 linhas mortas removidas**: `WeeklyPlanner`, `DayColumn`, `TimeBlock`, `BlockFormModal` (+ barrel `components/planner` e o re-export em `components/index.ts`), `WelcomeModal`, `TutorialTooltip`, `EmptyDashboard`, `EmptyPlan`, `optimizeSchedule` (studyAlgorithm) e `replanAfterPerformanceUpdate` (roadmapEngine).
- **`backlogRescheduler`**: chaves de data memoizadas por bloco (`WeakMap`) — o custo dominante era re-parsear datas O(blocos × dias) a cada reagendamento.
- **Default único de horas por dia**: o Planner agora usa `defaultSettings.dailyHoursByWeekday` (antes tinha o próprio, 17 h/semana vs 24 h/semana).

### 3.8 Bugs novos encontrados (e corrigidos) durante a simulação

1. **Sessão JWT sobrevivia à exclusão da conta** (ver 3.1).
2. `GET /api/notifications` e o shape de `generate` estavam certos; quem estava errado era o teste — mas o E2E revelou que **blocos do planner não existem no banco** (vivem no localStorage/snapshot): `/api/sessions` devolvia 404 ao receber o id client-side. Agora o vínculo é opcional e a idempotência cai para `(usuário, matéria, início)`.
3. `prisma/seed.ts` não rodava contra um banco real-semântica: sessões com `blockId: null` violavam a unique no harness (em SQL, NULL ≠ NULL) e `subjects: { create: [...] }` aninhado não criava filhos. Ambos eram lacunas do **harness**, corrigidas nele (semântica de NULL em unique + nested writes) — o seed agora roda limpo (1 usuário, 3 presets com 24 matérias, 6 matérias, 20 blocos, ~60-75 sessões, 10 conquistas, 8 semanas de stats).

---

## 4. Como rodar tudo (harness + testes)

```bash
# 1) PrismaClient em memória a partir do schema (necessário: prisma generate sem rede)
node scripts/dev-inmemory-prisma.cjs --reset

# 2) seed (usa o client em memória; grava node_modules/.prisma/inmemory-db.json)
npm run db:seed            # = tsx prisma/seed.ts

# 3) servidor
npm run dev                # .env.local já traz DATABASE_URL/NEXTAUTH_SECRET/CRON_SECRET de teste

# 4) testes
node scripts/e2e-smoke.mjs           # 51 verificações HTTP (cadastro→exclusão)
node scripts/e2e-smoke.mjs --keep    # idem, sem excluir a conta no fim
npm run test:roadmap && npm run test:backlog && npm run test:student-audit && npm run test:smoke:presets
npx tsc --noEmit && npm run lint && npx next build
```

Notas do harness: estado persiste em `node_modules/.prisma/inmemory-db.json` (flush no exit do processo); o que ele implementa: `cuid()/uuid()/now()`, defaults do schema, `select/include/_count/orderBy/take/skip/distinct`, `$transaction` (array e callback), P2002/P2025, cascade 1:1 e 1:N, operadores atômicos (`increment`…), nested writes e semântica de NULL em uniques. **Não é um banco real**: não há SQL, isolamento de transação nem constraints além das modeladas — provas de SQL continuam exigindo um CockroachDB de verdade.

Demo: `alex.chen@nexora.dev` / `Nexora@123` (do seed).

---

## 5. Verificações que não apontaram bug (para não gerar retrabalho)

- `isTimeSlotAvailable`: adjacência aceita, sobreposição recusada. Correto.
- `<defs>` dentro de `<BarChart>` (Recharts 2.15.4): renderiza (está em `SVG_TAGS`). Não é bug.
- Curva `xpForLevel/levelFromXp/calculateSessionXp` coerente (2.400 XP → nível 7).
- `callbackUrl` sanitizado; bcrypt custo 12; tokens de reset hasheados; `authorize` não diferencia senha errada de usuário inexistente.
- As 4 suítes `scripts/*.test.ts` passaram antes e depois de todas as mudanças.

---

## 6. Recomendações remanescentes (não executadas — precisam de decisão/rede)

1. **Dependências (`npm audit`)**: `next` 14.0.4 (2 críticas) → 14.2.35, `nodemailer`, `lodash`, `nanoid`, `postcss`. **Não executei aqui** porque o registry/binários estão parcialmente bloqueados no sandbox e o bump do Next 14.0→14.2 merece rodada própria de regressão. É o item mais urgente para produção.
2. **Rate limit global**: o estado é em memória por instância (em serverless com N instâncias o limite é best-effort). Trocar `consumeRateLimit` por um backend compartilhado (Upstash/Redis) mantém a mesma assinatura.
3. **Re-autenticação em ações destrutivas**: `delete-account` confirma só no cliente (texto digitado). Exigir a senha no body (ou um token CSRF próprio nas rotas customizadas) fecha CSRF/seqüestro de sessão para exclusão.
4. **Tema claro**: ainda é camada de patches (29 `!important`, ~186 `text-white`). Migrar a paleta para CSS variables é trabalho de design system, não de bugfix.
5. **Paridade mobile do TopBar** (busca/sessão rápida/XP) e placeholder da busca ("Buscar disciplinas, sessões…" mas só filtra matérias).
6. **Presets**: escala 1–5 dobrada (`x*2`) na importação → prioridades só pares; decidir se o catálogo vira 1–10.
7. **`projectedImprovement30d`** continua sendo projeção (agora baseada em tendência real); sugestão de rótulo: "Projeção de evolução (30 d)".
8. **Cache do `roadmapEngine`** sem política de eviction (cresce por configuração).

---

## 7. Estado final da validação

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 erros** |
| `npm run lint` | **✔ No ESLint warnings or errors** |
| `npx next build` | **OK** (todas as rotas compilam) |
| `test:roadmap` / `test:backlog` / `test:student-audit` / `test:smoke:presets` | **verdes** |
| `scripts/e2e-smoke.mjs` | **51/51** (cadastro→2FA→login→preset→geração→sessão/XP→idempotência→snapshot→preferências→notificações→rate limit→exclusão) |
| Smoke de UI autenticado | **11/11** (dashboard/planner/subjects/analytics/settings/onboarding 200 + PNGs/manifest/sw servidos) |
