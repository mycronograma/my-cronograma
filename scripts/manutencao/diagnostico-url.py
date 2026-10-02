#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Adiciona versao e diagnostico da DATABASE_URL no TESTAR-REAL.bat."""
import io

P = "TESTAR-REAL.bat"
s = io.open(P, encoding="utf-8", newline="").read()
NL = "\r\n"

# ---------- 1) marca de versao, logo depois do chcp ---------------------
old = (
    "@echo off" + NL +
    "chcp 65001 >nul" + NL +
    'cd /d "%~dp0"' + NL
)
new = (
    "@echo off" + NL +
    "chcp 65001 >nul" + NL +
    'cd /d "%~dp0"' + NL +
    NL +
    "rem Versao do script. Se o print mostrar v3 ou menos, o .bat e velho" + NL +
    "rem (veio de ZIP) e o passo 1 nao atualizou nada." + NL +
    "echo  [TESTAR-REAL v4 - copia do .env corrigida]" + NL
)
assert old in s, "cabecalho nao achado"
s = s.replace(old, new, 1)

# ---------- 2) diagnostico antes do db push -----------------------------
old2 = (
    "if not exist .env goto :env_prisma_perdido" + NL +
    NL +
    'findstr /C:"DATABASE_URL=" .env >nul 2>nul' + NL +
    NL +
    "if errorlevel 1 goto :env_prisma_perdido" + NL +
    NL +
    "call npx --no-install prisma db push" + NL
)

d = []
d.append("rem ---- diagnostico: onde a URL esta de verdade -----------------------" + NL)
d.append("rem O P1012 insistiu depois da correcao da copia. Estes numeros dizem" + NL)
d.append("rem qual arquivo o Prisma deveria estar lendo e o que ele contem." + NL)
d.append(NL)
d.append("echo  --- diagnostico da DATABASE_URL ---" + NL)
d.append(NL)
d.append("if exist .env.local (" + NL)
d.append('  for %%F in (.env.local) do echo   .env.local: existe, %%~zF bytes' + NL)
d.append(") else (" + NL)
d.append("echo   .env.local: NAO existe" + NL)
d.append(")" + NL)
d.append(NL)
d.append("if exist .env (" + NL)
d.append('  for %%F in (.env) do echo   .env: existe, %%~zF bytes' + NL)
d.append(") else (" + NL)
d.append("echo   .env: NAO existe" + NL)
d.append(")" + NL)
d.append(NL)
d.append('findstr /C:"DATABASE_URL=" .env.local >nul 2>nul' + NL)
d.append(NL)
d.append("if not errorlevel 1 (echo   .env.local: tem a linha DATABASE_URL) else (echo   .env.local: sem a linha DATABASE_URL)" + NL)
d.append(NL)
d.append('findstr /C:"DATABASE_URL=" .env >nul 2>nul' + NL)
d.append(NL)
d.append("if not errorlevel 1 (echo   .env: tem a linha DATABASE_URL) else (echo   .env: sem a linha DATABASE_URL)" + NL)
d.append(NL)
d.append('findstr /C:"DATABASE_URL=" .env | findstr /I /C:"localhost" >nul 2>nul' + NL)
d.append(NL)
d.append("if not errorlevel 1 echo   .env: a URL aponta para LOCALHOST (banco de mentira)" + NL)
d.append(NL)
d.append("echo  ------------------------------------" + NL)
d.append(NL)
d.append("if not exist .env goto :env_prisma_perdido" + NL)
d.append(NL)
d.append('findstr /C:"DATABASE_URL=" .env >nul 2>nul' + NL)
d.append(NL)
d.append("if errorlevel 1 goto :env_prisma_perdido" + NL)
d.append(NL)
d.append("call npx --no-install prisma db push" + NL)

assert old2 in s, "trecho do db push nao achado"
s = s.replace(old2, "".join(d), 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("TESTAR-REAL.bat: versao e diagnostico adicionados")
