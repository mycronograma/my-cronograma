#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Corrige a copia destrutiva do .env no TESTAR-REAL.bat.

O BUG: o guia permite colar a DATABASE_URL so no .env ("Se voce preferir
fazer a mao... crie tambem um arquivo chamado .env"). Nesse caso o
:banco acha a URL no .env, segue o fluxo, e o `copy /y .env.local .env`
de :tem_database SOBRESCREVE o .env - a unica copia da URL - com um
.env.local que nao a tem.

Como `prisma generate` nao precisa da URL (so do provider), ele passa.
O `prisma db push` precisa, e estoura P1012. O usuario ve o generate
funcionar e o db push falhar, sem conexao aparente entre os dois.

A CORRECAO:
  1. a copia so acontece quando o .env.local e a fonte da URL
  2. verificacao explicita do .env antes do db push, com mensagem clara
  3. diagnostico de onde a URL foi achada
"""
import io

P = "TESTAR-REAL.bat"
s = io.open(P, encoding="utf-8", newline="").read()
NL = "\r\n"

# ============ 1) :banco - avisa quando a URL so existe no .env ==========
old = (
    "if not exist .env goto :sem_database" + NL +
    NL +
    "findstr /C:\"DATABASE_URL=\" .env >nul 2>nul" + NL +
    NL +
    "if errorlevel 1 goto :sem_database" + NL +
    NL +
    NL
)
new = (
    "if not exist .env goto :sem_database" + NL +
    NL +
    "findstr /C:\"DATABASE_URL=\" .env >nul 2>nul" + NL +
    NL +
    "if errorlevel 1 goto :sem_database" + NL +
    NL +
    "rem ---- a URL existe so no .env (o guia permite) ----------------------" + NL +
    "rem Daqui em diante o .env NAO pode ser sobrescrito: ele e a unica" + NL +
    "rem copia da URL. :tem_database respeita isso." + NL +
    NL +
    "set \"URL_SO_NO_ENV=1\"" + NL +
    NL +
    "echo  A URL do banco estava so no .env - vou preservar esse arquivo." + NL +
    NL +
    NL
)
assert old in s, "trecho do :banco nao achado"
s = s.replace(old, new, 1)

# ============ 2) :tem_database - copia condicional ======================
old2 = (
    "copy /y .env.local .env >nul 2>nul" + NL +
    NL +
    "if not exist .env copy /y .env.local.example .env >nul 2>nul" + NL +
    NL +
    "findstr /C:\"DATABASE_URL=\" .env >nul 2>nul" + NL +
    NL +
    "if errorlevel 1 (" + NL
)
new2 = (
    "rem ---- materializa o .env (o arquivo que o Prisma le) ---------------" + NL +
    "rem REGRA: nunca apagar uma URL que ja esta la." + NL +
    "rem  - .env.local tem a URL -> ele e a fonte, copia para o .env" + NL +
    "rem  - so o .env tem a URL  -> o .env fica INTACTO (era a unica copia)" + NL +
    "rem A copia as cegas de antes destruia a URL nesse segundo caso, e so" + NL +
    "rem aparecia no db push, como P1012." + NL +
    NL +
    "findstr /C:\"DATABASE_URL=\" .env.local >nul 2>nul" + NL +
    NL +
    "if not errorlevel 1 copy /y .env.local .env >nul 2>nul" + NL +
    NL +
    "if not exist .env copy /y .env.local.example .env >nul 2>nul" + NL +
    NL +
    "findstr /C:\"DATABASE_URL=\" .env >nul 2>nul" + NL +
    NL +
    "if errorlevel 1 (" + NL
)
assert old2 in s, "trecho da copia nao achado"
s = s.replace(old2, new2, 1)

# ============ 3) verificacao explicita antes do db push =================
old3 = (
    "echo  Se o banco estiver vazio, o Prisma cria todas as tabelas." + NL +
    "echo  Se ja existirem, ele so confere se estao iguais ao schema." + NL +
    NL +
    "call npx --no-install prisma db push" + NL
)
new3 = (
    "echo  Se o banco estiver vazio, o Prisma cria todas as tabelas." + NL +
    "echo  Se ja existirem, ele so confere se estao iguais ao schema." + NL +
    NL +
    "rem ---- ultima garantia: o .env TEM de ter a URL ----------------------" + NL +
    "rem E aqui que o P1012 aparecia. O prisma generate passa sem a URL (so" + NL +
    "rem precisa do provider), mas o db push precisa dela de verdade. Conferir" + NL +
    "rem agora evita o erro misterioso la na frente." + NL +
    NL +
    "if not exist .env goto :env_prisma_perdido" + NL +
    NL +
    "findstr /C:\"DATABASE_URL=\" .env >nul 2>nul" + NL +
    NL +
    "if errorlevel 1 goto :env_prisma_perdido" + NL +
    NL +
    "call npx --no-install prisma db push" + NL
)
assert old3 in s, "trecho do db push nao achado"
s = s.replace(old3, new3, 1)

# ============ 4) bloco :env_prisma_perdido, antes de :garantir_env ======
old4 = "rem ---- completa uma variavel que esteja faltando --------------------" + NL

bloco = []
bloco.append(":env_prisma_perdido" + NL)
bloco.append(NL)
bloco.append("echo." + NL)
bloco.append(NL)
bloco.append("echo [X] O Prisma nao esta encontrando a DATABASE_URL." + NL)
bloco.append(NL)
bloco.append("echo     O prisma generate passou porque ele nao precisa da URL" + NL)
bloco.append(NL)
bloco.append("echo     (so do provider). O db push precisa, e por isso para aqui." + NL)
bloco.append(NL)
bloco.append("echo." + NL)
bloco.append(NL)
bloco.append("echo     O Prisma le o arquivo .env desta pasta. Ele tem uma linha" + NL)
bloco.append(NL)
bloco.append("echo     DATABASE_URL=? Se nao tiver, e isso o problema." + NL)
bloco.append(NL)
bloco.append("echo." + NL)
bloco.append(NL)
bloco.append("echo     SOLUCAO: abra o .env.local no Bloco de Notas, confira se" + NL)
bloco.append(NL)
bloco.append("echo     a linha DATABASE_URL esta la com a url do Neon, salve e" + NL)
bloco.append(NL)
bloco.append("echo     rode este script de novo." + NL)
bloco.append(NL)
bloco.append("goto :fim" + NL)
bloco.append(NL)
bloco.append(NL)
bloco.append(NL)
bloco.append("rem ---- completa uma variavel que esteja faltando --------------------" + NL)

assert old4 in s, "ancora de :garantir_env nao achada"
s = s.replace(old4, "".join(bloco), 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("TESTAR-REAL.bat: copia destrutiva corrigida")
