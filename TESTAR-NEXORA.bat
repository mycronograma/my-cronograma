@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo    NEXORA - versao de teste (roda no seu computador)
echo ============================================================
echo.
echo  Este script:
echo    1. baixa a versao mais nova do codigo
echo    2. instala o que estiver faltando
echo    3. prepara o banco de dados local
echo    4. abre o app em http://localhost:3000
echo.
echo  Seus dados de estudo (cronograma, progresso, materias) ficam
echo  salvos no NAVEGADOR e NAO sao apagados por este script.
echo.
echo  A primeira vez pode demorar alguns minutos. Nas proximas,
echo  leva menos de 1 minuto.
echo.
pause

where git >nul 2>nul
if errorlevel 1 goto :sem_git

where node >nul 2>nul
if errorlevel 1 goto :sem_node

echo.
echo === 1/5 Buscando a versao mais nova ===
git fetch origin
if errorlevel 1 goto :sem_internet
git checkout arena/01a0d9e7-my-cronograma
if errorlevel 1 goto :sem_branch
git reset --hard origin/arena/01a0d9e7-my-cronograma
if errorlevel 1 goto :sem_reset

echo.
echo === 2/5 Instalando dependencias (so se faltar) ===
if exist node_modules (
    echo Dependencias ja instaladas. Pulando.
) else (
    echo Instalando... isso pode levar varios minutos.
    call npm install --ignore-scripts --no-audit --no-fund
    if errorlevel 1 goto :falha_install
)

echo.
echo === 3/5 Preparando o banco de dados local ===
node scripts/dev-inmemory-prisma.cjs --reset
if errorlevel 1 goto :falha_banco

if not exist .env.local (
    echo Criando o arquivo de configuracao local...
    echo DATABASE_URL="postgresql://nexora:nexora@localhost:26257/nexora?sslmode=require">.env.local
    echo NEXTAUTH_URL="http://localhost:3000">>.env.local
    echo NEXTAUTH_SECRET="chave-local-de-teste-0123456789abcdef0123456789abcdef">>.env.local
    echo CRON_SECRET="chave-local-cron-0123456789abcdef">>.env.local
    echo NOTIFICATIONS_CRON_SECRET="chave-local-cron-0123456789abcdef">>.env.local
    echo NEXT_PUBLIC_LOCAL_DEMO_MODE="true">>.env.local
)

echo.
echo === 4/5 Carregando os dados de exemplo ===
call npm run db:seed
if errorlevel 1 echo [i] Nao foi possivel carregar os dados de exemplo - o app ainda assim abre.

netstat -ano | findstr ":3000" >nul
if not errorlevel 1 goto :porta_ocupada

echo.
echo === 5/5 Abrindo o app ===
echo.
echo  O app vai abrir sozinho no seu navegador.
echo  Se nao abrir, acesse:  http://localhost:3000
echo.
echo  PARA PARAR O APP: clique nesta janela e aperte Ctrl+C.
echo  Na proxima vez, e so rodar este arquivo de novo.
echo.

start "" http://localhost:3000
call npm run dev

pause
exit /b 0

rem ---------------------------------------------------------------- erros
:sem_git
echo.
echo [X] O Git nao foi encontrado neste computador.
echo     Instale em https://git-scm.com/download/win e rode este arquivo de novo.
echo     Depois de instalar, FECHE e ABRA de novo esta janela.
echo.
pause
exit /b 1

:sem_node
echo.
echo [X] O Node.js nao foi encontrado neste computador.
echo     Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
echo     Depois de instalar, FECHE e ABRA de novo esta janela.
echo.
pause
exit /b 1

:sem_internet
echo.
echo [X] Nao foi possivel conversar com o GitHub.
echo     Verifique sua internet e tente de novo.
echo.
pause
exit /b 1

:sem_branch
echo.
echo [X] Nao foi possivel trocar para a branch da sessao.
echo     Me mande um print desta janela.
echo.
pause
exit /b 1

:sem_reset
echo.
echo [X] Nao foi possivel alinhar o codigo com a versao do GitHub.
echo     Me mande um print desta janela.
echo.
pause
exit /b 1

:falha_install
echo.
echo [X] A instalacao falhou. Feche outros programas e tente de novo.
echo     Se repetir, me mande um print desta janela.
echo.
pause
exit /b 1

:falha_banco
echo.
echo [X] Nao foi possivel preparar o banco local.
echo     Me mande um print desta janela.
echo.
pause
exit /b 1

:porta_ocupada
echo.
echo [X] A porta 3000 ja esta em uso - provavelmente o app ja esta aberto
echo     em outra janela preta. Feche essa janela e rode este arquivo de novo.
echo.
pause
exit /b 1
