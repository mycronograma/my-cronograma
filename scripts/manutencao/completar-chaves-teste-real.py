#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Faz o TESTAR-REAL.bat garantir as chaves de sessao no .env.local.

Em producao (npm run build + npm run start) o src/lib/env.ts nao tem
segredo padrao: sem NEXTAUTH_SECRET a autenticacao falha. O guia manda
criar um .env.local novinho so com a DATABASE_URL, e o script nunca
completava as outras chaves - quem seguisse o guia tomaria erro de login
sem entender o motivo.

:garantir_env so COMPLETA o que falta (nunca sobrescreve), para respeitar
uma URL ou chave que a pessoa colou na mao.
"""
import io
import re

P = "TESTAR-REAL.bat"
s = io.open(P, encoding="utf-8", newline="").read()
NL = "\r\n"

# ---- 1) chama :garantir_env dentro de :tem_database, antes do copy ------
old = (
    ":tem_database" + NL +
    NL +
    "copy /y .env.local .env >nul 2>nul" + NL
)
new = (
    ":tem_database" + NL +
    NL +
    "rem ---- completa as chaves que faltam no .env.local --------------------" + NL +
    "rem Em producao nao existe segredo padrao: sem NEXTAUTH_SECRET o login" + NL +
    "rem falha. :garantir_env so completa, nunca sobrescreve o que ja esta" + NL +
    "rem la - uma URL ou chave colocada na mao continua valendo." + NL +
    NL +
    "call :garantir_env NEXTAUTH_URL \"http://localhost:3000\"" + NL +
    NL +
    "call :garantir_env NEXTAUTH_SECRET \"chave-do-teste-real-0123456789abcdef0123456789abcdef\"" + NL +
    NL +
    "call :garantir_env CRON_SECRET \"chave-local-cron-0123456789abcdef\"" + NL +
    NL +
    "call :garantir_env NOTIFICATIONS_CRON_SECRET \"chave-local-cron-0123456789abcdef\"" + NL +
    NL +
    "call :garantir_env NEXT_PUBLIC_SIGNUPS_ENABLED \"true\"" + NL +
    NL +
    "copy /y .env.local .env >nul 2>nul" + NL
)
assert old in s, "ancora de :tem_database nao achada"
s = s.replace(old, new, 1)

# ---- 2) cria a sub-rotina :garantir_env ANTES do label :fim real -------
# ANCORA POR INICIO DE LINHA: ":fim" sozinho casa dentro de "goto :fim".
sub = []
sub.append("rem ---- completa uma variavel que esteja faltando --------------------" + NL)
sub.append("rem Diferente de forcar: se a linha ja existe, nao mexe. Assim uma" + NL)
sub.append("rem URL de banco ou uma chave colocada na mao nao e perdida." + NL)
sub.append(NL)
sub.append(":garantir_env" + NL)
sub.append(NL)
sub.append("findstr /C:\"%~1=\" .env.local >nul 2>nul" + NL)
sub.append(NL)
sub.append("if not errorlevel 1 goto :eof" + NL)
sub.append(NL)
sub.append("echo %~1=\"%~2\">>.env.local" + NL)
sub.append(NL)
sub.append("goto :eof" + NL)
sub.append(NL)
sub.append(NL)
sub.append(NL)
novo = "".join(sub)

# ^:fim  -> inicio de linha, garantido pelo re.MULTILINE
s2, n = re.subn(r"(?m)^:fim" + re.escape(NL), novo + ":fim" + NL, s, count=1)
assert n == 1, "nao achou o label :fim no inicio de linha (achou %d)" % n
s = s2

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("TESTAR-REAL.bat: :garantir_env adicionada")
