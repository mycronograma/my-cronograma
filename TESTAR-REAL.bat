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

:instalar

echo.

echo === 2/6 Instalando dependencias (gerando o Prisma real) ===

echo  Diferente do teste normal, aqui o npm install roda SEM
echo  --ignore-scripts. E esse passo que gera o Prisma de verdade.
echo  Pode levar varios minutos.

call npm install --no-audit --no-fund

if errorlevel 1 goto :falha_install


rem O generate explicito nao custa nada e deixa claro o que aconteceu.

echo.

echo === Gerando o client do Prisma ===

call npx prisma generate

if errorlevel 1 goto :falha_generate


rem ---------------------------------------------------------------- passo 3

:banco

if not exist .env.local type nul > .env.local


rem So cria a DATABASE_URL se nao existir. Se ja existe, e a sua
rem URL de verdade e o script NAO pode sobrescrever.

findstr /C:"DATABASE_URL=" .env.local >nul 2>nul

if not errorlevel 1 goto :tem_database

echo.

echo [X] O arquivo .env.local nao tem a DATABASE_URL.

echo     Sem ela o app nao conversa com banco nenhum.

echo.

echo     SOLUCAO: abra o arquivo .env.local desta pasta no Bloco de

echo     Notas e cole uma linha assim (troque pela SUA url):

echo.

echo     DATABASE_URL="postgresql://usuario:senha@host.neon.tech/neondb?sslmode=require"

echo.

echo     Depois rode este script de novo.

goto :fim



:tem_database

echo.

echo === 3/6 Criando as tabelas no banco ===

echo  Se o banco estiver vazio, o Prisma cria todas as tabelas.
echo  Se ja existirem, ele so confere se estao iguais ao schema.

call npx prisma db push

if errorlevel 1 goto :falha_push


rem ---------------------------------------------------------------- passo 4

echo.

echo === 4/6 Carregando os dados de exemplo ===

call npm run db:seed

if errorlevel 1 goto :falha_seed


rem ---------------------------------------------------------------- passo 5

netstat -ano | findstr ":3000" >nul

if not errorlevel 1 goto :porta_ocupada


echo.

echo === 5/6 Compilando o app (modo producao) ===

echo  E a mesma compilacao que roda no servidor. Se falhar aqui,
echo  falharia la tambem. Pode levar alguns minutos.

call npm run build

if errorlevel 1 goto :falha_build


rem ---------------------------------------------------------------- passo 6

echo.

echo === 6/6 Abrindo o app em MODO PRODUCAO ===

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

echo     Confira sua internet e tente de novo. Se o erro mencionar

echo     "prisma" ou "binaries.prisma.sh", e bloqueio de rede.

goto :fim



:falha_generate

echo.

echo [X] Falha ao gerar o client do Prisma.

echo     Isso precisa de internet para baixar os binarios do Prisma.

echo     Confira a conexao e rode de novo.

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



:fim

echo.

echo ============================================================

echo    Fim. Se algo falhou, me mande um print desta tela.

echo ============================================================

echo.

pause

