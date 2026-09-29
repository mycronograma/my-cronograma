# Prontidão para o lançamento oficial

Documento de acompanhamento. Atualizado em **28/09/2026**, no commit `96a62e5`
mais a rodada de organização abaixo.

O objetivo aqui não é lista de desejos: é o que **impede** ou **atrapalha** um
lançamento oficial, e o que já está resolvido.

---

## 1. Estado das verificações (rodar antes de qualquer commit)

| Verificação | Como rodar | Estado |
|---|---|---|
| Tipos | `npx tsc --noEmit` | ✅ 0 erros |
| Lint | `npx next lint` | ✅ 0 avisos, 0 erros |
| Build de produção | `npm run build` | ✅ compila |
| Testes do motor | `npm run test:capacity` `test:backlog` `test:move` `test:target` `test:freeslot` | ✅ todos passando |
| Rotas | `bash scripts/preview-up.sh` + `curl` em cada rota | ✅ 200 |
| Fumaça de UI | `node scripts/e2e-smoke.mjs` | ✅ 51/51 |

---

## 2. Corrigido nesta rodada (organização)

| # | Problema | Onde | Solução |
|---|---|---|---|
| O1 | 5 `alert()` do navegador na validação de disciplina (some com a estética, bloqueado em vários mobile) | `subjects/page.tsx` | validação passou a ser devolvida pelo formulário e mostrada dentro do modal, com o estado de erro que já existia |
| O2 | 7 botões só com ícone sem `aria-label`/`title` — leitor de tela não anunciava nada | modais de fechar (planner, sessão, quick session, questões, wizard, matérias) e o botão de expandir o menu | todos com `aria-label` + `title` |
| O3 | Warning de lint: `useMemo` do gráfico semanal usava `clientNow` sem declarar | `dashboard/page.tsx` | dependência trocada pela **chave da semana** (estável: só muda à meia-noite, em vez de a cada minuto) |
| O4 | `as any` para `webkitAudioContext` em dois lugares | `settings/page.tsx`, `StudyBlockSessionModal.tsx` | helper `src/lib/audio.ts` com tipagem real e fallback quando o navegador não suporta áudio |
| O5 | Rota inexistente caía na tela branca padrão do Next | — | `src/app/not-found.tsx` (404 com marca e links) |
| O6 | Erro de runtime mostrava tela branca, sem saída | — | `src/app/error.tsx` (mensagem em português, "tentar de novo", código do erro) |

**Resultado:** lint passou de 1 aviso para **zero**, e os 5 `alert()` e os 2
`as any` acabaram.

---

## 3. Ainda falta (priorizado)

### Bloqueia o lançamento

| # | Item | O que é | Sugestão |
|---|---|---|---|
| B1 | **Banco em nuvem** | hoje os dados ficam no `localStorage` do navegador: trocar de celular ou limpar o cache **apaga tudo** | decisão sua (já combinado: só com o app "100%"). Precisa de `DATABASE_URL` de produção, `prisma db push`, seed e deploy |
| B2 | **Login de verdade em produção** | em produção o app depende de NextAuth + banco; o modo demo local está desligado fora de desenvolvimento | testar registro, login, logout e recuperação de senha no ambiente real antes de divulgar |
| B3 | **Domínio e HTTPS** | sem domínio não há como divulgar nem instalar como app | comprar domínio, apontar, forçar HTTPS |

### Importante (não bloqueia, mas aparece na primeira semana)

| # | Item | O que é | Estado |
|---|---|---|---|
| I1 | **Tema claro incompleto** | `PresetConfigWizard.tsx` (86 cores fixas), `planner/page.tsx` (25) e `onboarding/page.tsx` (15) tinham cor travada — no tema claro ficava faixa ilegível | ✅ convertidos para as classes semânticas (`bg-card-bg`, `text-text-primary`, `border-card-border`…). `StudyBlockSessionModal.tsx` ficou de fora **de propósito**: é um painel escuro por design (fundo em gradiente fixo) e funciona nos dois temas. Criadas as classes `.bg-inverse`/`.text-inverse` para estados selecionados |
| I2 | **Testes de UI além do smoke** | o smoke confere que as telas carregam (51 checagens), mas não simula cliques: criar disciplina, gerar cronograma, concluir bloco. Um erro de fluxo passa por ele | ⏳ **pendente** |
| I3 | **Aviso de perda de dados** | nada avisa que os dados são locais | ✅ faixa em Ajustes (só no modo sem conta): "Seus dados estão salvos apenas neste navegador…" |
| I4 | **Onboarding pós-cadastro** | o wizard de predefinição existe, mas ninguém garante que um usuário novo chegue nele sem se perder | ⏳ pendente |

### Desejável

| # | Item | Estado |
|---|---|---|
| D1 | Aviso quando a soma das metas das matérias passa da carga semanal (a conta já existe na lista de Disciplinas; falta o mesmo aviso no planejador) | ⏳ pendente |
| D2 | `SubjectCard` mostrava "P10" + dificuldade em campos separados, embora o controle agora seja um só ("peso no plano") | ✅ unificado em "Peso 10" no card e no detalhe |
| D3 | Pesquisa rápida de matéria/disciplina quando a lista passar de ~10 itens | ⏳ pendente |

---

## 4. Ordem sugerida daqui para o lançamento

Você escolheu **site na web**, então o caminho é: banco → deploy → domínio.
Passo a passo completo em `DEPLOY-WEB.md`.

1. **Escolher o banco** (Neon, Supabase ou CockroachDB) e me dizer qual — ajusto
   o `provider` do Prisma e testo.
2. **I2 (testes de fluxo)** — antes de colocar gente de fora usando.
3. **Deploy na Vercel** com as variáveis de ambiente (a tabela está no
   `DEPLOY-WEB.md`).
4. **Domínio + HTTPS** e acertar a `NEXTAUTH_URL`.
5. **Checklist pós-deploy** (criar conta, entrar em outro aparelho, recuperar
   senha) — está no fim do `DEPLOY-WEB.md`.
6. **Configurar e-mail** (`EMAIL_SERVER`) para a recuperação de senha funcionar.

Já resolvido: tema claro (I1), aviso de dados locais (I3), card unificado (D2).

---

## 5. Como está a qualidade hoje

- 0 erros de tipo, 0 avisos de lint, build limpo.
- 5 arquivos de teste cobrindo o que é regra de negócio: encaixe de bloco,
  recálculo de atrasados, espaço para reagendar, divisão da meta semanal e
  movimentação de blocos.
- Nenhum `TODO`/`FIXME` esquecido no código, nenhum `console.log` em tela.
- Um commit por item, sempre no branch da sessão, com o preview validado.
