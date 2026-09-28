@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo.
echo === NEXORA: baixando atualizacoes do GitHub ===
echo.
git fetch origin
git checkout arena/01a0d9e7-my-cronograma
git pull origin arena/01a0d9e7-my-cronograma
echo.
echo === Pronto! Subindo o servidor em http://localhost:3000 ===
echo (para parar o servidor: Ctrl+C nesta janela)
echo.
npm run dev
pause
