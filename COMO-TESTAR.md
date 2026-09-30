# Como testar o Nexora por uma semana

Guia feito para quem **não é do terminal**. Cada passo diz o que fazer e o que
esperar na tela. Se travar em algum, me mande o print que eu resolvo.

> ### ⚠️ Onde colocar a pasta (leia antes de tudo)
>
> Coloque o projeto em uma pasta **comum**, como `C:\Nexora` ou a sua Área de
> Trabalho.
>
> **Nunca** dentro de `C:\Windows` ou `C:\Windows\System32`. O Windows protege
> essas pastas e não deixa o app criar os arquivos dele lá. O sintoma é o erro
> `operation not permitted` ou `Permission denied`.
>
> **Como não errar:** abra a pasta onde você quer o projeto, clique com o botão
> direito em um espaço vazio e escolha **Abrir no Terminal**. Aí o terminal já
> começa no lugar certo.

---

## 1. Instalar o necessário (só na primeira vez)

Você precisa de dois programas. Se já tem, pule para o passo 2.

### Node.js (faz o app rodar)

1. Acesse <https://nodejs.org>
2. Clique no botão grande da versão **LTS** (é a recomendada).
3. Abra o arquivo baixado e clique **Next → Next → Install** (deixe tudo como está).
4. **O que esperar:** uma tela de instalação terminar com "Completed".

### Git (opcional — só para receber minhas atualizações)

1. Acesse <https://git-scm.com/download/win>
2. Baixe o instalador de 64 bits e abra.
3. Clique **Next** em todas as telas (as opções padrão servem).
4. **O que esperar:** "Completing the Git Setup Wizard" → **Finish**.

> **Pode pular o Git.** Ele só serve para o app buscar correções minhas durante a
> semana. Sem ele o app funciona igual, com os arquivos que você baixou. Se você
> baixou o **ZIP**, ele não vem com Git — e está tudo bem.

> **Importante:** depois de instalar os dois, **feche e abra de novo** a janela
> que você estiver usando, para o Windows reconhecê-los.

---

## 2. Baixar o app

Se você já tem a pasta do projeto, pule para o passo 3.

**Jeito A — pelo ZIP (mais simples, não precisa de Git):**

1. Abra este link no navegador:
   <https://github.com/mycronograma/my-cronograma/archive/refs/heads/arena/01a0d9e7-my-cronograma.zip>
2. **O que esperar:** baixa um arquivo `my-cronograma-arena-01a0d9e7-my-cronograma.zip`.
3. Clique com o botão direito nele → **Extrair Tudo** → escolha onde salvar.
4. Pronto: dentro da pasta extraída está o `TESTAR-NEXORA.bat`.

**Jeito B — pelo Git (recebe minhas atualizações):**

1. Crie uma pasta para o projeto, por exemplo `C:\Nexora`.
2. Abra essa pasta, clique com o botão direito em um espaço vazio e escolha
   **Abrir no Terminal** (ou **Git Bash Here**).
3. Cole este comando e aperte Enter:

```
git clone https://github.com/mycronograma/my-cronograma.git
```

4. **O que esperar:** uma pasta `my-cronograma` aparece dentro de `C:\Nexora`,
   com vários arquivos.

---

## 3. Abrir o app

1. Entre na pasta `my-cronograma`.
2. Dê **duplo clique** no arquivo **`TESTAR-NEXORA.bat`** (é o arquivo com o
   desenho de uma engrenagem ou de uma janela preta).
3. **O que esperar:** uma janela preta abre explicando o que vai acontecer.
   Aperte qualquer tecla para continuar.
4. Na primeira vez, espere de 3 a 10 minutos (ele instala tudo).
5. **O que esperar no fim:** o navegador abre sozinho em
   `http://localhost:3000` mostrando a tela de login do Nexora.

### Como entrar

Na tela de login, use o modo de teste:

- **E-mail:** qualquer um que pareça real, ex.: `teste@nexora.dev`
- **Senha:** `teste1234`

(Não é preciso criar conta — nessa versão de teste o app funciona no seu
próprio computador.)

> **Cadastros desativados de propósito.** O botão "Criar cadastro" sai da tela
> de login e a página de cadastro mostra um aviso. É assim até o app abrir
> para o público, porque ele vai virar **assinatura** e as contas passarão a
> morar num banco de dados na nuvem. Para ligar de novo, mudar em `.env.local`:
> `NEXT_PUBLIC_SIGNUPS_ENABLED="true"`.

### O que vai aparecer na tela

Ao rodar o `.bat`, abrem **duas janelas pretas**:

| Janela | Para que serve |
|---|---|
| `TESTAR-NEXORA.bat` | faz a instalação e espera o app ficar pronto |
| `Servidor do Nexora` | é o app rodando de verdade — **deixe aberta** |

> **A primeira vez demora de 30 a 90 segundos.** O Windows precisa compilar o
> app. Nesse tempo a página pode aparecer **branca** — é normal, não é erro.
> Espere e aperte **F5**. Nas vezes seguintes abre em segundos.

### Para fechar o app

Clique na janela preta e aperte **Ctrl + C**. Para abrir de novo, é só dar
duplo clique no `TESTAR-NEXORA.bat`.

---

## 4. O que testar nesta semana

Faça nesta ordem — cada item depende do anterior. Marque o que já testou.

### Dia 1 — começo do zero

- [ ] Entrar e ver o **painel** (tela inicial).
- [ ] Fazer o **onboarding** (as perguntas de configuração) até o fim.
- [ ] Ir em **Planejador** e clicar em **Gerar com IA**.
- [ ] **O que esperar:** a semana aparece preenchida com blocos de estudo.
- [ ] Clicar no **+** de um dia para criar um bloco — repare que agora ele só
      pergunta **matéria** e **tipo**, e diz em que horário vai entrar.

### Dia 2 — matérias e metas

- [ ] Ir em **Disciplinas** e **editar** uma matéria.
- [ ] Mover o controle **Peso no plano** e ver a **meta semanal** mudar.
- [ ] Clicar em **Fixar este valor** e ver a meta parar de mudar sozinha.
- [ ] Clicar em **Voltar ao automático** e ver ela voltar a acompanhar o peso.
- [ ] Reparar se o número faz sentido para você (é a parte que mais mexe).

### Dia 3 — estudar de verdade

- [ ] No painel, clicar em **Começar** em um bloco do dia.
- [ ] Deixar o cronômetro rodar e **concluir** a sessão.
- [ ] **O que esperar:** o progresso da matéria e da semana sobem.
- [ ] Testar **pausar** e **continuar** a sessão.

### Dia 4 — os blocos que ficaram para trás

- [ ] Marcar um bloco como **pulado** (não feito).
- [ ] Ir no Planejador e clicar em **Recalcular atrasados**.
- [ ] **O que esperar:** uma mensagem dizendo quantos blocos foram remarcados
      para os próximos dias. Se não couber, aparece um aviso âmbar explicando
      que os dias já estão cheios e o que fazer.
- [ ] Conferir se o bloco pulado aparece em um **dia futuro**.

### Dia 5 — aparência e ajustes

- [ ] Ir em **Ajustes** e trocar para o **tema claro**.
- [ ] Navegar por todas as telas com o tema claro e anotar o que ficar
      **ilegível** ou fora do lugar.
- [ ] Mudar as **horas por dia** e ver o cronograma se ajustar.

### Dia 6 e 7 — uso livre

- [ ] Use o app como usaria de verdade, sem roteiro.
- [ ] Anote tudo que te atrapalhar, não só o que quebrar.

---

## 5. Como me reportar

Para cada problema, me mande:

1. **Um print** da tela.
2. **Uma frase** no formato: *"na tela X, eu esperava Y, mas aconteceu Z"*.
3. Se aparecer uma **mensagem de erro**, o texto dela (ou o print).

Pode mandar um por vez ou uma lista — do jeito que for mais fácil.

---

## 6. O que ainda não funciona (não é bug)

Para você não perder tempo com coisas que já sei:

| Item | Situação |
|---|---|
| **Trocar de celular ou limpar os dados do site** | os dados somem — ficam salvos só neste navegador. A versão com nuvem é o próximo passo |
| **Recuperar senha por e-mail** | ainda não envia e-mail de verdade |
| **Google/Facebook para entrar** | ainda não está ligado |
| **Notificações push** | só funcionam em site publicado com HTTPS |

---

## 7. Se algo der errado

| Sintoma | O que fazer |
|---|---|
| A janela preta some na hora | leia a última linha antes de fechar — quase sempre falta o Node.js. O `.bat` avisa qual |
| `npm` não é reconhecido | instale o Node.js, **feche e abra** a janela, tente de novo |
| O `.bat` diz "porta 3000 já está em uso" | o app já está aberto em outra janela preta; feche essa janela e rode de novo |
| `fatal: cannot open '.git/FETCH_HEAD': Permission denied` | a pasta veio do ZIP e nao tem Git. **Nao e erro** — o `.bat` segue com os arquivos da pasta e o app abre normal |
| `EPERM: operation not permitted, mkdir ...node_modules\.prisma\client` | o projeto está dentro de `C:\Windows\System32`. Mova para `C:\Nexora` (veja o aviso no início deste guia) e rode de novo |
| `[i] Nao foi possivel buscar atualizacoes` | sem internet ou sem Git. O app abre do mesmo jeito, com a versao que ja esta na pasta |
| O navegador abre mas dá erro | me mande o print da tela de erro |
| **Página totalmente branca** | quase sempre é a primeira compilação. Espere 30–90s e aperte **F5**. Se não resolver, me mande um print da janela `Servidor do Nexora` |
| Sumiu com os meus dados | você limpou os dados do site no navegador; use uma aba normal (não anônima) da próxima vez |

> Sempre que o `.bat` mostrar uma mensagem começando com `[X]`, ele já diz o
> que fazer. Se nada disso resolver, me mande um print da janela preta
> inteira — eu leio o erro por você.
