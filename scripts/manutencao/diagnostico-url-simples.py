#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Troca os blocos com parenteses do diagnostico por forma mais segura.

`for %%F in (arquivo)` dentro de um bloco `if (...)` e uma armadilha
conhecida do cmd.exe. Fora de parenteses, em linha unica, e seguro.
"""
import io

P = "TESTAR-REAL.bat"
s = io.open(P, encoding="utf-8", newline="").read()
NL = "\r\n"

antigo = (
    "if exist .env.local (" + NL +
    '  for %%F in (.env.local) do echo   .env.local: existe, %%~zF bytes' + NL +
    ") else (" + NL +
    "echo   .env.local: NAO existe" + NL +
    ")" + NL +
    NL +
    "if exist .env (" + NL +
    '  for %%F in (.env) do echo   .env: existe, %%~zF bytes' + NL +
    ") else (" + NL +
    "echo   .env: NAO existe" + NL +
    ")" + NL
)

novo = (
    'if exist .env.local for %%F in (.env.local) do echo   .env.local: existe, %%~zF bytes' + NL +
    "if not exist .env.local echo   .env.local: NAO existe" + NL +
    NL +
    'if exist .env for %%F in (.env) do echo   .env: existe, %%~zF bytes' + NL +
    "if not exist .env echo   .env: NAO existe" + NL
)

assert antigo in s, "bloco com parenteses nao achado"
s = s.replace(antigo, novo, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("diagnostico simplificado")
