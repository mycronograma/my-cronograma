#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Simula o fluxo do TESTAR-REAL.bat para a DATABASE_URL.

Reproduz, em Python, a logica de :banco / :tem_database / verificacao
antes do db push, para os quatro cenarios que um usuario real pode ter.
"""
import io, os, tempfile

NEON = 'DATABASE_URL="postgresql://neondb_owner:np@ep-x-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"'
EXEMPLO = 'DATABASE_URL="postgresql://root@localhost:26257/nexora?sslmode=disable"'

def findstr(linhas, agulha):
    """findstr /C:"X" -> devolve True se alguma linha comeca/contem X."""
    return any(agulha in l for l in linhas)

def rodar(nome, tem_local, tem_env, url_env="", url_local=NEON):
    d = tempfile.mkdtemp()
    local_p, env_p = os.path.join(d, ".env.local"), os.path.join(d, ".env")

    # --- estado inicial ---
    if tem_local:
        io.open(local_p, "w", newline="").write(url_local + "\r\n")
    else:
        io.open(local_p, "w", newline="").write("")          # type nul
    if tem_env:
        io.open(env_p, "w", newline="").write(url_env + "\r\n")

    local = [l for l in io.open(local_p, newline="").read().split("\r\n") if l]
    env = [l for l in io.open(env_p, newline="").read().split("\r\n") if l] if os.path.exists(env_p) else None

    # --- :banco ---
    if not findstr(local, "DATABASE_URL="):
        if env is None:
            return nome, "parou em :sem_database"
        if not findstr(env, "DATABASE_URL="):
            return nome, "parou em :sem_database"
        url_so_no_env = True
    else:
        url_so_no_env = False

    # --- :confere_url (so olha o .env.local) ---
    if findstr(local, "DATABASE_URL="):
        linha_url = [l for l in local if "DATABASE_URL=" in l][0]
        if "localhost" in linha_url.lower() or "127.0.0.1" in linha_url:
            return nome, "parou em :url_local"

    # --- :tem_database: garantia de chaves + copia CONDICIONAL ---
    for chave in ["NEXTAUTH_URL", "NEXTAUTH_SECRET", "CRON_SECRET",
                  "NOTIFICATIONS_CRON_SECRET", "NEXT_PUBLIC_SIGNUPS_ENABLED"]:
        if not findstr(local, chave + "="):
            local.append('%s="x"' % chave)

    if findstr(local, "DATABASE_URL="):          # if not errorlevel 1 copy
        env = list(local)                        # copy /y .env.local .env
    if env is None:                              # if not exist .env
        env = [EXEMPLO]

    # --- verificacao antes do db push ---
    if not findstr(env, "DATABASE_URL="):
        return nome, "parou em :env_prisma_perdido"

    ok = findstr(env, "DATABASE_URL=") and "localhost" not in [l for l in env if "DATABASE_URL=" in l][0]
    return nome, ("db push SEGUE (URL no .env)" if ok else "db push SEGUE mas URL suspeita")

res = []
res.append(rodar("A: URL so no .env.local        ", True,  False))
res.append(rodar("B: URL so no .env (guia permite)", False, True,  NEON))
res.append(rodar("C: URL nos dois                 ", True,  True,  NEON))
res.append(rodar("D: URL em nenhum                ", False, False))
res.append(rodar("E: localhost no .env.local      ", True,  False, url_local=EXEMPLO))

print()
for nome, r in res:
    print("  %s -> %s" % (nome, r))

esperado = {
    "A": "db push SEGUE",
    "B": "db push SEGUE",
    "C": "db push SEGUE",
    "D": ":sem_database",
    "E": ":url_local",
}
print()
faltou = []
for (nome, r), (k, v) in zip(res, esperado.items()):
    if v not in r:
        faltou.append("%s esperava %s, deu %s" % (k, v, r))
if faltou:
    for f in faltou:
        print("FALHOU: " + f)
    print("RESULTADO: COM PROBLEMA")
else:
    print("RESULTADO: os 5 cenarios corretos")
