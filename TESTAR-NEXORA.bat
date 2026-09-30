@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo    NEXORA - versao de teste (roda no seu computador)
echo ============================================================
echo.
echo  Este script:
echo    1. deixa os arquivos prontos
echo    2. instala o que estiver faltando
echo    3. prepara o banco de dados local
echo    4. carrega os dados de exemplo
echo    5. abre o app em http://localhost:3000
echo.
echo  Funciona de dois jeitos:
echo    - pasta vinda do Git  -> busca a versao mais nova
echo    - pasta vinda do ZIP  -> usa os arquivos que ja estao aqui
echo.
echo  Seus dados de estudo (cronograma, progresso, materias) ficam
echo  salvos no NAVEGADOR e NAO sao apagados por este script.
echo.
echo  A primeira vez pode demorar alguns minutos. Nas proximas,
echo  leva menos de 1 minuto.
echo.
pause

where node >nul 2>nul
if errorlevel 1 goto :sem_node

rem ---------------------------------------------------------------- passo 1
if exist .git\FETCH_HEAD goto :tem_git

echo.
echo === 1/5 Preparando os arquivos ===
echo  Pasta sem historico do Git (veio do ZIP): usando os arquivos daqui.
goto :instalar

:tem_git
where git >nul 2>nul
if errorlevel 1 goto :sem_git
echo.
echo === 1/5 Buscando a versao mais nova ===
git fetch origin >nul 2>nul
if errorlevel 1 goto :sem_atualizacao
git checkout arena/01a0d9e7-my-cronograma >nul 2>nul
git reset --hard origin/arena/01a0d9e7-my-cronograma >nul 2>nul
echo  Codigo atualizado do GitHub.
goto :instalar

:sem_atualizacao
echo [i] Nao foi possivel conversar com o GitHub.
echo     Usando os arquivos que ja estao nesta pasta.

rem ---------------------------------------------------------------- passo 2
:instalar
if exist node_modules goto :tem_deps
echo.
echo === 2/5 Instalando dependencias ===
echo  Isso pode levar varios minutos so na primeira vez.
call npm install --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto :falha_install
goto :banco

:tem_deps
echo.
echo === 2/5 Instalando dependencias ===
echo  Ja estao instaladas. Pulando.

rem ---------------------------------------------------------------- passo 3
:banco
echo.
echo === 3/5 Preparando o banco de dados local ===
node scripts/dev-inmemory-prisma.cjs --reset
if errorlevel 1 goto :falha_banco

if exist .env.local goto :config_pronta
echo  Criando o arquivo de configuracao local...
echo DATABASE_URL="postgresql://nexora:nexora@localhost:26257/nexora?sslmode=require">.env.local
echo NEXTAUTH_URL="http://localhost:3000">>.env.local
echo NEXTAUTH_SECRET="chave-local-de-teste-0123456789abcdef0123456789abcdef">>.env.local
echo CRON_SECRET="chave-local-cron-0123456789abcdef">>.env.local
echo NOTIFICATIONS_CRON_SECRET="chave-local-cron-0123456789abcdef">>.env.local
echo NEXT_PUBLIC_LOCAL_DEMO_MODE="true">>.env.local

:config_pronta

rem ---------------------------------------------------------------- passo 4
echo.
echo === 4/5 Carregando os dados de exemplo ===
call npm run db:seed
if errorlevel 1 echo [i] Nao foi possivel carregar os dados de exemplo - o app ainda assim abre.

netstat -ano | findstr ":3000" >nul
if not errorlevel 1 goto :porta_ocupada

rem ---------------------------------------------------------------- passo 5
echo.
echo === 5/5 Abrindo o app ===
echo.
echo  Iniciando o servidor...
echo  A PRIMEIRA vez pode levar de 30 a 90 segundos, porque o Windows
echo  precisa compilar o app. Nas proximas vezes abre em segundos.
echo.
echo  Vai abrir uma janela chamada "Servidor do Nexora".
echo  DEIXE ESSA JANELA ABERTA enquanto voce usa o app.
echo  Para parar o app: clique nela e aperte Ctrl+C.
echo.

start "Servidor do Nexora" npm run dev

set /a tentativas=0
:esperar_servidor
curl -s -o nul --max-time 5 http://localhost:3000 >nul 2>nul
if not errorlevel 1 goto :servidor_pronto
set /a tentativas+=1
if %tentativas% geq 45 goto :servidor_demorado
timeout /t 2 >nul
goto :esperar_servidor

:servidor_pronto
echo.
echo  App pronto. Abrindo no navegador...
echo.
start "" http://localhost:3000
echo  Se a pagina abrir em branco, espere 20 segundos e aperte F5.
echo.
pause
exit /b 0

:servidor_demorado
echo.
echo [i] O servidor esta demorando mais que o normal.
echo     Abrindo o navegador mesmo assim.
echo     Se ficar branco: espere 30 segundos e aperte F5.
echo     Se continuar branco, me mande um print da janela "Servidor do Nexora".
echo.
start "" http://localhost:3000
pause
exit /b 0

rem ---------------------------------------------------------------- erros
:sem_git
echo.
echo [X] O Git nao foi encontrado neste computador.
echo     A pasta tem historico do Git, mas o comando git nao existe.
echo     Instale em https://git-scm.com/download/win ou apague a pasta
echo     .git para usar a versao dos arquivos locais.
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

:falha_install
echo.
echo [X] A instalacao das dependencias falhou.
echo     Verifique sua internet, feche outros programas e tente de novo.
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
