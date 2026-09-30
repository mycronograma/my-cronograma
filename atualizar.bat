@echo off

rem ------------------------------------------------------------------------
rem ATUALIZAR = rodar o TESTAR-NEXORA.bat.
rem
rem Este arquivo existe so por comodidade, para voce nao precisar lembrar
rem qual dos dois abre. Quem realmente baixa a versao nova do GitHub,
rem instala o que faltar, prepara o banco e abre o app e o
rem TESTAR-NEXORA.bat. Quando nada mudou, ele simplesmente segue com os
rem arquivos que ja estao na pasta.
rem ------------------------------------------------------------------------

cd /d "%~dp0"

chcp 65001 >nul

echo.

echo === NEXORA: atualizando para a versao mais nova ===

echo.

echo  O TESTAR-NEXORA.bat vai:

echo    1. baixar o codigo novo do GitHub

echo    2. instalar o que estiver faltando

echo    3. preparar o banco de dados local

echo    4. abrir o app em http://localhost:3000

echo.

echo  Se o app ja estiver aberto em outra janela preta, FECHE essa janela

echo  antes de continuar: a porta 3000 so pode ser usada uma vez.

echo.

pause

call TESTAR-NEXORA.bat
