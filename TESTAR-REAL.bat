@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ---------------------------------------------------------------- local
rem O Windows protege a pasta de sistema: nada consegue criar arquivo dentro
rem dela. Se o projeto estiver la, falha com "operation not permitted".
echo %CD% | findstr /I "\Windows\System32" >nul
if not errorlevel 1 goto :pasta_proibida


echo.
echo ============================================================
echo    NEXORA - TESTE REAL (banco de verdade, modo producao)
echo ============================================================
echo.
echo  A versao de teste normal (TESTAR-NEXORA.bat) usa um banco
echo  FALSO, que grava tudo num arquivo JSON. Serve para voce mexer
echo  no app, mas NAO prova que ele funciona num servidor de verdade.
echo.
echo  Este script e diferente. Ele:
echo.
echo    1. instala as dependencias GERANDO o Prisma real
echo    2. cria as tabelas no banco que voce configurou
echo    3. compila o app do jeito que vai para o ar
echo    4. roda em modo PRODUCAO (sem o modo demo)
echo.
echo  ANTES DE CONTINUAR, voce precisa de uma coisa:
echo.
echo    uma URL de banco de dados na nuvem (Neon, Supabase ou
echo    CockroachDB). O passo a passo esta em COMO-TESTAR-REAL.md.
echo.
echo  Se voce ainda nao tem essa URL, pode cancelar agora.
echo.

pause


rem ---------------------------------------------------------------- node

where node >nul 2>nul

if errorlevel 1 goto :sem_node


rem ---------------------------------------------------------------- passo 1

if exist .git\FETCH_HEAD goto :tem_git


echo.

echo === 1/6 Preparando os arquivos ===

echo  Pasta sem historico do Git (veio do ZIP): usando os arquivos daqui.

goto :instalar



:tem_git

where git >nul 2>nul

if errorlevel 1 goto :sem_git

echo.

echo === 1/6 Buscando a versao mais nova ===

git fetch origin >nul 2>nul

if errorlevel 1 goto :sem_atualizacao

git rev-parse --verify origin/arena/01a0d9e7-my-cronograma >nul 2>nul

if errorlevel 1 goto :sem_branch_remota

git checkout arena/01a0d9e7-my-cronograma >nul 2>nul

git reset --hard origin/arena/01a0d9e7-my-cronograma >nul 2>nul

if errorlevel 1 goto :sem_atualizacao

echo  Codigo atualizado do GitHub.

goto :instalar



rem ---------------------------------------------------------------- passo 2

:banco

rem A URL do banco e lida de DOIS lugares: o .env.local (do Next) e o
rem .env (do Prisma). O guia manda colar no .env.local, mas o Prisma
rem NAO le .env.local - so o .env. Aceita os dois para nao travar
rem quem ja tinha colocado no .env.

if not exist .env.local type nul > .env.local

findstr /C:"DATABASE_URL=" .env.local >nul 2>nul

if not errorlevel 1 goto :confere_url

if not exist .env goto :sem_database

findstr /C:"DATABASE_URL=" .env >nul 2>nul

if errorlevel 1 goto :sem_database

rem ---- a URL existe so no .env (o guia permite) ----------------------
rem Daqui em diante o .env NAO pode ser sobrescrito: ele e a unica
rem copia da URL. :tem_database respeita isso.

set "URL_SO_NO_ENV=1"

echo  A URL do banco estava so no .env - vou preservar esse arquivo.


rem ---- confere se a URL e da nuvem ou e a do teste local -------------
rem O TESTAR-NEXORA.bat grava uma DATABASE_URL de localhost no
rem .env.local. Se ela ainda estiver la, o Prisma ia tentar falar com
rem um banco que so existe no seu PC e falharia no db push sem
rem explicar o motivo.

:confere_url

findstr /C:"DATABASE_URL=" .env.local | findstr /I /C:"localhost" >nul 2>nul

if not errorlevel 1 goto :url_local

findstr /C:"DATABASE_URL=" .env.local | findstr /C:"127.0.0.1" >nul 2>nul

if not errorlevel 1 goto :url_local

goto :tem_database


rem ---- tem a URL: garante que o Prisma enxerga -----------------------
rem Sem este passo o prisma generate do postinstall Falha com P1012 e o
rem npm install ABORTA no meio, deixando o node_modules incompleto - e
rem dai tudo o mais Falha sem explicacao clara.

:tem_database

rem ---- completa as chaves que faltam no .env.local --------------------
rem Em producao nao existe segredo padrao: sem NEXTAUTH_SECRET o login
rem falha. :garantir_env so completa, nunca sobrescreve o que ja esta
rem la - uma URL ou chave colocada na mao continua valendo.

call :garantir_env NEXTAUTH_URL "http://localhost:3000"

call :garantir_env NEXTAUTH_SECRET "chave-do-teste-real-0123456789abcdef0123456789abcdef"

call :garantir_env CRON_SECRET "chave-local-cron-0123456789abcdef"

call :garantir_env NOTIFICATIONS_CRON_SECRET "chave-local-cron-0123456789abcdef"

call :garantir_env NEXT_PUBLIC_SIGNUPS_ENABLED "true"

rem ---- materializa o .env (o arquivo que o Prisma le) ---------------
rem REGRA: nunca apagar uma URL que ja esta la.
rem  - .env.local tem a URL -> ele e a fonte, copia para o .env
rem  - so o .env tem a URL  -> o .env fica INTACTO (era a unica copia)
rem A copia as cegas de antes destruia a URL nesse segundo caso, e so
rem aparecia no db push, como P1012.

findstr /C:"DATABASE_URL=" .env.local >nul 2>nul

if not errorlevel 1 copy /y .env.local .env >nul 2>nul

if not exist .env copy /y .env.local.example .env >nul 2>nul

findstr /C:"DATABASE_URL=" .env >nul 2>nul

if errorlevel 1 (
  echo  Aviso: nao consegui criar o .env com a DATABASE_URL.
  echo  O Prisma pode Falhar no proximo passo.
)

echo  URL do banco encontrada. Prisma configurado.

goto :instalar



:sem_database

echo.

echo [X] Nenhum arquivo tem a DATABASE_URL.

echo     Sem ela o app nao conversa com banco nenhum.

echo.

echo     SOLUCAO: abra o arquivo .env.local desta pasta no Bloco de

echo     Notas e cole uma linha assim (troque pela SUA url):

echo.

echo     DATABASE_URL="postgresql://usuario:senha@host.neon.tech/neondb?sslmode=require"

echo.

echo     Depois rode este script de novo.

goto :fim



:url_local

echo.

echo [X] A DATABASE_URL do .env.local ainda aponta para ESTE COMPUTADOR.

echo     Ela funciona no teste normal (TESTAR-NEXORA.bat), que usa

echo     um banco de mentira. Aqui o banco tem de ser o da nuvem.

echo.

echo     A linha de hoje e mais ou menos assim:

echo     DATABASE_URL="postgresql://nexora:nexora@localhost:26257/..."

echo.

echo     SOLUCAO: abra o .env.local desta pasta no Bloco de Notas,

echo     APAGUE a linha DATABASE_URL inteira e cole no lugar dela

echo     a url do seu banco no Neon. Depois rode este script de novo.

goto :fim



rem ---------------------------------------------------------------- passo 3

:instalar

echo.

echo === 3/6 Instalando dependencias (gerando o Prisma real) ===

echo  Diferente do teste normal, aqui o npm install roda SEM
echo  --ignore-scripts. E esse passo que gera o Prisma de verdade.
echo  Pode levar varios minutos.

call npm install --no-audit --no-fund

if errorlevel 1 goto :falha_install


rem O teste normal (TESTAR-NEXORA.bat) instala um client FALSO em
rem node_modules\.prisma\client. Se ele ficar la, o generate de verdade
rem pode nao sobrescrever tudo. Apagar antes e a unica forma de garantir
rem que o app vai falar com o Prisma real.
if exist node_modules\.prisma\client rmdir /s /q node_modules\.prisma\client

echo.

echo === Gerando o client do Prisma ===

call npx --no-install prisma generate

if errorlevel 1 goto :falha_generate

rem Prova real de que o client de verdade entrou: o falso grava num
rem JSON, o real tem o binario do engine. Sem esse arquivo, ainda e falso.
if not exist node_modules\.prisma\client\query_engine-windows.dll.node goto :ainda_falso

echo  Client real confirmado.


rem ---------------------------------------------------------------- passo 4

echo.

echo === 4/6 Criando as tabelas no banco ===

echo  Se o banco estiver vazio, o Prisma cria todas as tabelas.
echo  Se ja existirem, ele so confere se estao iguais ao schema.

rem ---- ultima garantia: o .env TEM de ter a URL ----------------------
rem E aqui que o P1012 aparecia. O prisma generate passa sem a URL (so
rem precisa do provider), mas o db push precisa dela de verdade. Conferir
rem agora evita o erro misterioso la na frente.

if not exist .env goto :env_prisma_perdido

findstr /C:"DATABASE_URL=" .env >nul 2>nul

if errorlevel 1 goto :env_prisma_perdido

call npx --no-install prisma db push

if errorlevel 1 goto :falha_push


rem ---------------------------------------------------------------- passo 5

echo.

echo === 5/6 Carregando os dados de exemplo ===

call npm run db:seed

if errorlevel 1 goto :falha_seed


rem ---------------------------------------------------------------- passo 5

netstat -ano | findstr ":3000" >nul

if not errorlevel 1 goto :porta_ocupada


echo.

echo === 6/6 Compilando o app (modo producao) ===

echo  E a mesma compilacao que roda no servidor. Se falhar aqui,
echo  falharia la tambem. Pode levar alguns minutos.

call npm run build

if errorlevel 1 goto :falha_build


rem ---------------------------------------------------------------- passo 6

echo.

echo === Pronto. Abrindo o app em MODO PRODUCAO ===

echo.

echo  Este e o modo que vai para o ar. Repare que:

echo    - o modo demo esta DESLIGADO: voce precisa entrar com conta;
echo    - o banco e o de verdade, nao o arquivo JSON.

echo.

echo  Contas para testar (criadas pelo seed):

echo    alex.chen@nexora.dev  /  Nexora@123

echo  A PRIMEIRA vez pode levar de 30 a 90 segundos.

echo.

start http://localhost:3000

call npm start

goto :fim



rem ---------------------------------------------------------------- erros

:pasta_proibida

echo.

echo [X] Esta pasta esta dentro de uma area protegida do Windows.

echo     Mova o projeto para outro lugar (ex: C:\Nexora) e tente de novo.

goto :fim



:sem_node

echo.

echo [X] Node.js nao encontrado. Instale em https://nodejs.org (versao LTS).

goto :fim



:sem_git

echo.

echo [X] Git nao encontrado. Instale em https://git-scm.com/download/win

goto :fim



:sem_atualizacao

echo.

echo [!] Nao foi possivel buscar a versao nova. Usando os arquivos daqui.

goto :instalar



:sem_branch_remota

echo.

echo [X] O Git conversou com o GitHub, mas nao trouxe a branch do projeto.

echo     A configuracao deste clone so esta buscando a branch "main".

echo.

echo     SOLUCAO - rode estes dois comandos DENTRO desta pasta:

echo       git remote set-url origin https://github.com/mycronograma/my-cronograma.git

echo       git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"

goto :fim



:falha_install

echo.

echo [X] Falha ao instalar as dependencias.

echo     A causa mais comum e a DATABASE_URL: o npm install roda o
echo     prisma generate sozinho e, se ele nao achar a URL, aborta no
echo     meio. Confira se o .env.local tem a linha DATABASE_URL certa.

echo     Se o erro mencionar "binaries.prisma.sh", e bloqueio de rede.

goto :fim



:falha_generate

echo.

echo [X] Falha ao gerar o client do Prisma.

echo     Isso precisa de internet para baixar os binarios do Prisma.

echo     Confira a conexao e rode de novo.

goto :fim




:ainda_falso

echo.

echo [X] O Prisma real nao foi gerado.

echo     O client FALSO (arquivo JSON) ainda esta no lugar. Sem o real,

echo     o app nao conversa com banco nenhum de verdade.

echo.

echo     A causa mais comum e rede: o Prisma baixa binarios de

echo     binaries.prisma.sh, e algumas redes bloqueiam esse dominio.

echo     Tente outra internet, ou desligue VPN/proxy.

goto :fim



:falha_push

echo.

echo [X] Falha ao criar as tabelas no banco.

echo     As causas mais comuns:

echo       - DATABASE_URL errada ou incompleta no .env.local;

echo       - banco ainda nao existe (crie o projeto no site do banco);

echo       - senha com caractere especial sem escape.

echo     A mensagem acima detalha qual foi.

goto :fim



:falha_seed

echo.

echo [X] Falha ao carregar os dados de exemplo.

echo     Se as tabelas foram criadas, o app ainda assim abre.

goto :fim



:falha_build

echo.

echo [X] Falha ao compilar o app.

echo     Este e o teste que importa: se nao compila aqui, nao

echo     compila no servidor. Leia a mensagem acima.

goto :fim



:porta_ocupada

echo.

echo [X] A porta 3000 ja esta em uso.

echo     Feche a outra janela do app (ou o TESTAR-NEXORA.bat)

echo     e rode este script de novo.

goto :fim



:env_prisma_perdido

echo.

echo [X] O Prisma nao esta encontrando a DATABASE_URL.

echo     O prisma generate passou porque ele nao precisa da URL

echo     (so do provider). O db push precisa, e por isso para aqui.

echo.

echo     O Prisma le o arquivo .env desta pasta. Ele tem uma linha

echo     DATABASE_URL=? Se nao tiver, e isso o problema.

echo.

echo     SOLUCAO: abra o .env.local no Bloco de Notas, confira se

echo     a linha DATABASE_URL esta la com a url do Neon, salve e

echo     rode este script de novo.

goto :fim



rem ---- completa uma variavel que esteja faltando --------------------
rem Diferente de forcar: se a linha ja existe, nao mexe. Assim uma
rem URL de banco ou uma chave colocada na mao nao e perdida.

:garantir_env

findstr /C:"%~1=" .env.local >nul 2>nul

if not errorlevel 1 goto :eof

echo %~1="%~2">>.env.local

goto :eof



:fim

echo.

echo ============================================================

echo    Fim. Se algo falhou, me mande um print desta tela.

echo ============================================================

echo.

pause

