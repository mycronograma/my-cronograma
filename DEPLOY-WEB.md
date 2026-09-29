# Colocar o Nexora no ar (site na web)

Passo a passo em português, para quem não é do terminal. Cada passo diz **o que
fazer**, **onde** e **o que esperar na tela**.

Você escolheu lançar como **site na web**. O caminho tem 3 partes:

```
1. Banco de dados na nuvem   →  os dados param de viver só no navegador
2. Deploy (Vercel)           →  o site ganha um endereço na internet
3. Domínio + HTTPS           →  um endereço bonito e cadeado
```

Ordem importa: **banco antes do deploy**, porque o deploy precisa da url do
banco para funcionar.

---

## Antes de começar: o que você precisa ter

| Item | Onde conseguir | Custo |
|---|---|---|
| Conta no GitHub | github.com | grátis (já tem — o código está lá) |
| Conta na Vercel | vercel.com — entrar com a conta do GitHub | grátis para uso pessoal |
| Banco de dados | Neon, Supabase ou CockroachDB (ver abaixo) | todos têm plano grátis |

---

## Parte 1 — Banco de dados na nuvem

Sem isso, os dados do usuário ficam no `localStorage` do navegador: limpar o
cache ou trocar de celular **apaga tudo**.

**Opção A — Neon (Postgres, a mais simples)**
1. Acesse `neon.tech` e clique em **Sign up** (pode entrar com o GitHub).
2. Clique em **Create project**. Dê um nome (`nexora`), escolha a região mais
   próxima (`São Paulo` ou `US East`).
3. Na tela do projeto, procure **Connection string** e clique em **Copy**.
   Ela tem este formato:
   `postgresql://usuario:senha@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. **Guarde essa url** — ela é a `DATABASE_URL`. Ela aparece uma só vez; se
   perder, dá para gerar outra em **Dashboard → Connection details**.

**Opção B — Supabase** (`supabase.com`): mesmo fluxo, a url está em
**Project Settings → Database → Connection string → URI**.

**Opção C — CockroachDB** (`cockroachlabs.com`): a url está em
**Connect → Connection string**. O app já está configurado para esse provedor.

### Ajuste necessário no código (eu faço)

O `schema.prisma` está com `provider = "cockroachdb"`. Para Postgres (Neon ou
Supabase) preciso trocar para `provider = "postgresql"`. **Me avise qual opção
você escolheu que eu ajusto e testo** — é uma linha, mas precisa de verificação.

### Criar as tabelas

Com a `DATABASE_URL` em mãos, no terminal, dentro da pasta do projeto:

```bash
# 1) cola a url do banco num arquivo que o app lê (e que NÃO vai para o GitHub)
echo 'DATABASE_URL="cole-aqui-a-url-do-banco"' > .env.local

# 2) cria as tabelas no banco
npx prisma db push
```

**O que esperar:** uma lista de tabelas sendo criadas e, no fim,
`Your database is now in sync with your Prisma schema.`

```bash
# 3) (opcional) dados de exemplo para o site não nascer vazio
npm run db:seed
```

---

## Parte 2 — Deploy na Vercel

1. Acesse `vercel.com` → **Add New… → Project**.
2. Em **Import Git Repository**, encontre `mycronograma/my-cronograma` e clique
   em **Import**. Se não aparecer, clique em **Adjust GitHub App Permissions** e
   libere o repositório.
3. O projeto já está configurado para a Vercel: o comando de build é
   `vercel-build`, que roda o `prisma generate` antes do `next build`. **Não
   precisa mudar nada em Framework Preset** (Next.js).
4. Em **Environment Variables**, cadastre estas (uma por uma, em
   *Production*, *Preview* e *Development*):

   | Nome | Valor | Obrigatória |
   |---|---|---|
   | `DATABASE_URL` | a url do banco da Parte 1 | sim |
   | `NEXTAUTH_SECRET` | uma frase longa e aleatória (ex.: o resultado de `openssl rand -base64 32`) | sim |
   | `NEXTAUTH_URL` | o endereço final, ex.: `https://nexora.vercel.app` | sim |
   | `CRON_SECRET` | outra frase aleatória longa | sim (rotas de cron) |
   | `NOTIFICATIONS_CRON_SECRET` | outra frase aleatória longa | sim (notificações) |
   | `NEXT_PUBLIC_LOCAL_DEMO_MODE` | **não cadastrar** (ou `false`) | — o modo demo é só para teste local |

   > `NEXTAUTH_SECRET`, `CRON_SECRET` e `NOTIFICATIONS_CRON_SECRET` precisam ser
   > **diferentes entre si** e guardados em segredo. Se vazarem, qualquer pessoa
   > consegue disparar as rotas de cron.

5. Clique em **Deploy** e espere. **O que esperar:** a tela mostra o build
   passo a passo e termina com fogos e um endereço `https://algo.vercel.app`.
6. Clique no endereço. **O que esperar:** a tela de login do Nexora.

---

## Parte 3 — Domínio próprio e HTTPS

1. Compre o domínio (Registro.br, Hostinger, Namecheap — o que preferir).
2. Na Vercel, abra o projeto → **Settings → Domains → Add** e digite o domínio.
3. A Vercel mostra os registros DNS para cadastrar. No painel do domínio, em
   **DNS / Zona DNS**, adicione:

   | Tipo | Nome | Valor |
   |---|---|---|
   | `A` | `@` | `76.76.21.61` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |

4. Espere a propagação (minutos a horas). **O que esperar:** na Vercel o domínio
   passa de *Invalid Configuration* para *Valid*, e o site abre com **cadeado**
   (HTTPS) — a Vercel emite o certificado sozinha.
5. Volte em **Settings → Environment Variables** e atualize `NEXTAUTH_URL` para
   `https://seudominio.com.br`. Sem isso o login quebra no domínio novo.

---

## Parte 4 — Testar antes de divulgar (checklist)

Marque cada item com o site já no ar:

- [ ] Abrir o site **em aba anônima**: cair na tela de login.
- [ ] **Criar uma conta** com um e-mail real e confirmar o acesso.
- [ ] **Sair** e **entrar** de novo.
- [ ] **Recuperar senha** (`/forgot-password`) — precisa de `EMAIL_SERVER`
      configurado; sem e-mail a recuperação não envia nada.
- [ ] Fazer o onboarding até o fim e ver o cronograma gerado.
- [ ] **Concluir um bloco** e ver o progresso atualizar.
- [ ] **Trocar de celular** (ou outro navegador), entrar na mesma conta e
      confirmar que os dados aparecem — é a prova de que a nuvem funcionou.
- [ ] Acessar uma url errada (`/qualquercoisa`) e ver a página 404 do app.
- [ ] Testar com o **tema claro** ligado (Ajustes → aparência).

---

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Tela branca com "Application error" | `DATABASE_URL` errada ou tabelas não criadas | rever a Parte 1 e rodar `npx prisma db push` de novo |
| Login não entra, volta sempre para `/login` | `NEXTAUTH_URL` diferente do endereço real | acertar a variável e fazer **Redeploy** |
| "Invalid `prisma.xxx.create()`" | banco vazio | `npm run db:seed` ou `npx prisma db push` |
| E-mail de recuperação não chega | `EMAIL_SERVER`/`EMAIL_FROM` não configurados | cadastrar as variáveis (ex.: SMTP do Gmail, Resend, SendGrid) |
| Criar conta dá erro 500 | `NEXTAUTH_SECRET` faltando | cadastrar e fazer **Redeploy** |

---

## O que ainda falta no app para o lançamento

Ver `PRONTIDAO-LANCAMENTO.md`. Resumo: testes de fluxo com cliques (criar
disciplina, gerar cronograma, concluir bloco) e a configuracão de e-mail para
recuperação de senha. O resto das telas e regras já está verificado.
