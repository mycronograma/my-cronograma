# Teste real — banco de verdade e modo produção

**Este é o teste que faltava.** Tudo que você testou até agora rodou em cima
de um banco **falso**: um arquivo JSON que finge ser um banco de dados. Serve
para você mexer no app, mas não prova que ele funciona num servidor de
verdade.

Aqui a gente testa com o banco real e no modo que vai para o ar.

**Tempo:** uns 15 minutos na primeira vez.

---

## Por que isso importa

O `TESTAR-NEXORA.bat` instala as dependências com `--ignore-scripts`. Esse
comando **pula** o passo que gera o Prisma de verdade. Depois, um script
interno escreve um Prisma falso por cima.

Num servidor de verdade (Vercel), o `npm install` roda **sem** esse
`--ignore-scripts`. Aí o Prisma real é gerado e o app conversa com um banco
de verdade. **Esse caminho nunca foi testado — nem aqui, nem no seu PC.**

O `TESTAR-REAL.bat` faz exatamente isso, na sua máquina, antes de você
gastar tempo com servidor.

---

## Parte 1 — Criar o banco (uns 5 minutos, no navegador)

Vou usar o **Neon**, que é o mais simples e tem plano grátis. Se você preferir
Supabase ou CockroachDB, me avise que eu ajusto — o resto é igual.

1. Acesse **https://neon.tech** e clique em **Sign up**. Pode entrar com a
   conta do GitHub.
2. Clique em **Create project**.
3. Dê um nome (pode ser `nexora`), escolha a região **São Paulo** (ou a mais
   próxima) e clique em **Create project**.
4. Ele vai criar e já cair numa tela do projeto. Procure por
   **Connection string** (ou **Connection details**) e clique em **Copy**.
5. A URL tem este formato:

   ```
   postgresql://usuario:senha@ep-xxxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   Ela vem com **`-pooler`** no nome do host e com **`&channel_binding=require`**
   no fim. Isso e o formato novo do Neon e e o que o app usa. Copie a URL
   inteira, sem cortar nada depois do `?`.

   **Guarde essa URL.** Ela é a senha do seu banco — não mande para ninguém
   e não cole em lugar nenhum além do `.env.local` daqui.

> Se ela pedir de novo: no painel do Neon, entre no projeto e procure
> **Dashboard → Connection details**.

---

## Parte 2 — Colar a URL no `.env.local`

1. Abra a pasta do projeto no **Explorador de Arquivos**.
2. Encontre o arquivo **`.env.local`**. Se não existir, crie um:
   clique com o botão direito → **Novo** → **Documento de texto**, e nomeie
   `.env.local` (sem `.txt` no fim).
   > Se o Windows reclamar do nome, clique em **Sim** quando ele perguntar
   > se quer mudar a extensão.
3. Abra com o **Bloco de Notas** (botão direito → **Abrir com** →
   **Bloco de Notas**).
4. Cole esta linha, **trocando a URL pela sua**:

   ```
   DATABASE_URL="postgresql://usuario:senha@ep-xxxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
   ```

5. Salve (Ctrl+S) e feche.

> **Não precisa colocar mais nada.** O `TESTAR-REAL.bat` completa sozinho as
> outras chaves que o app precisa em modo produção (`NEXTAUTH_URL`,
> `NEXTAUTH_SECRET`, `CRON_SECRET`, `NOTIFICATIONS_CRON_SECRET` e
> `NEXT_PUBLIC_SIGNUPS_ENABLED`). E ele **só completa o que falta**: se você
> já tinha uma chave sua no arquivo, ela continua valendo.
>
> Isso importa porque em modo produção o app **não** usa chave padrão. Sem
> `NEXTAUTH_SECRET` o login simplesmente falha — e o erro não diz o porquê.

> **Atenção — a armadilha mais comum.** Se você já rodou o
> **`TESTAR-NEXORA.bat`** (o teste normal), o `.env.local` desta pasta já tem
> uma linha `DATABASE_URL=` apontando para `localhost:26257`. Ela é o banco de
> mentira que o teste normal usa, e **não serve aqui**.
>
> **Apague a linha `DATABASE_URL=` inteira** e cole a do Neon no lugar dela.
> Não deixe as duas: com dois nomes iguais o app lê a primeira e ignora a sua.
>
> Se você esquecer, o `TESTAR-REAL.bat` **percebe e para antes de instalar**,
> com uma mensagem explicando que a URL ainda aponta para este computador.
> Não é erro seu — é o script te poupando de um `db push` falhando sem razão
> aparente.

### Por que o `.env.local` basta

O **Prisma** (a ferramenta que cria as tabelas) lê o arquivo **`.env`**, e não
o `.env.local` — que é o arquivo do app. Como os dois precisam da mesma URL, o
`TESTAR-REAL.bat` **copia o `.env.local` para o `.env` sozinho**, antes de
instalar qualquer coisa. Você não precisa fazer esse passo à mão.

> Se você preferir fazer à mão, ou se rodar o Prisma fora do script, crie
> também um arquivo chamado `.env` com a **mesma linha** `DATABASE_URL=`.
>
> **Se você colocar a URL só no `.env` e não no `.env.local`, tudo bem também**
> — o script percebe e **não sobrescreve** o `.env` nesse caso. (Antes ele
> copiava por cima e apagava a URL; o `prisma generate` passava porque não
> precisa da URL, e só o `db push` estourava o `P1012`.)

---

## Parte 3 — Rodar o teste

1. Na pasta do projeto, dê **dois cliques** em **`TESTAR-REAL.bat`**.
2. Leia a tela e aperte **Enter** para começar.
3. O script faz 6 passos sozinho:

   | Passo | O que faz | Quanto tempo |
   |---|---|---|
   | 1 | Busca a versão mais nova no GitHub | segundos |
   | 2 | Instala dependências **gerando o Prisma real** | vários minutos na 1ª vez |
   | 3 | Cria as tabelas no seu banco | segundos |
   | 4 | Carrega os dados de exemplo | segundos |
   | 5 | **Compila o app em modo produção** | 1–3 minutos |
   | 6 | Abre o app em **modo produção** | 30–90 segundos |

4. No fim, o navegador abre em `http://localhost:3000` e o app pede login.

---

## Parte 4 — O que testar (é aqui que está o valor)

Este modo é diferente do que você usava. Duas coisas mudaram:

- **O modo demo está desligado.** Antes o app deixava você entrar sem conta.
  Agora exige login de verdade — é assim que funciona no servidor.
- **O banco é o de verdade.** O que você criar fica no Neon, não no seu
  navegador.

Contas criadas automaticamente pelo seed:

```
alex.chen@nexora.dev
Nexora@123
```

Teste nesta ordem, e me diga **em qual parou**:

1. **Entrar** com a conta acima. Se o login funcionar, o NextAuth está
   conversando com o banco real — é a primeira vez que isso acontece.
2. **Painel** carrega com dados (horas, progresso, agenda).
3. **Cronograma** mostra os blocos.
4. **Gerar com IA** — confirme com os números e veja se os blocos estudados
   ficam de pé.
5. **Arrastar** uma matéria dentro do dia e ver se reordena.
6. **Concluir** um bloco: ele deve perguntar os minutos e **não** pode
   continuar oferecendo "Iniciar".
7. **Matérias**: criar, editar, ver se o peso muda as horas.
8. **Sair** e entrar de novo — os dados continuam lá (estão no Neon, não no
   navegador).
9. **Recuperação de senha** — provavelmente vai falhar, porque o envio de
   e-mail não está configurado. Se falhar, **me avise**: é uma pendência
   conhecida, não um susto.

---

## Parte 5 — Se algo der errado

Me mande um **print da tela preta** (a do script), não do navegador. A tela
preta diz qual passo quebrou.

Os erros mais prováveis, e o que significam:

| O que aparecer | O que é |
|---|---|
| `Environment variable not found: DATABASE_URL` (código `P1012`) | o Prisma não achou a URL. Quer dizer que o `.env.local` não tinha a linha `DATABASE_URL=` quando o script rodou — ou ela estava incompleta. Rode de novo depois de conferir o arquivo |
| Falha no passo 2, mencionando `binaries.prisma.sh` | sua rede bloqueou o download do Prisma. Tente outra internet (ou desligue VPN) |
| Falha no passo 2, e embaixo aparecer `prisma@8.0.0-rc` ou `C:\node_modules\prisma` | o `npm install` tinha abortado no meio e o `npx` baixou um Prisma aleatório da internet. Some sozinho com a correção da `DATABASE_URL` |
| Falha no passo 3, `prisma db push` | a `DATABASE_URL` está errada, incompleta, ou o projeto do Neon não foi criado |
| O script para no começo dizendo que a URL aponta para **este computador** | o `.env.local` ainda tem a `DATABASE_URL` de `localhost:26257` que o `TESTAR-NEXORA.bat` gravou. Apague essa linha e cole a do Neon |
| O `prisma generate` passa, mas o `db push` falha com `P1012` | o `.env` (o arquivo que o Prisma lê) está sem a linha `DATABASE_URL=`. Confira o `.env.local`, salve e rode de novo — o script agora confere isso antes do `db push` |
| Falha no passo 5, `npm run build` | **o mais importante de todos.** Se não compila aqui, não compila no servidor. Me manda o print |
| Tela branca em `localhost:3000` | aperte F12, aba **Console**, e me mande print do que estiver em vermelho |
| Login dá erro | confira se a URL do Neon está completa, com `?sslmode=require&channel_binding=require` no fim |

---

## O que vem depois

Se esse teste passar, o que falta para o ar é pouco:

1. **Domínio** — comprar um e apontar para o servidor.
2. **Deploy na Vercel** — com as variáveis de ambiente (a tabela está no
   `DEPLOY-WEB.md`).
3. **E-mail** (`EMAIL_SERVER`) — para a recuperação de senha funcionar.

Se **não** passar, você descobriu agora, sozinho, em vez de na frente de
gente usando. É exatamente para isso que este teste existe.
