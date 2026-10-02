import io

P = 'TESTAR-REAL.bat'
s = io.open(P, encoding='utf-8', newline='').read()


def troca(velho, novo):
    assert velho in s, 'nao achou: %r' % velho[:80]
    assert s.count(velho) == 1, 'aparece %d vezes' % s.count(velho)
    return s.replace(velho, novo, 1)


# ================================================================
# O BUG
#
# O Prisma le o arquivo .env, NAO o .env.local (o bundle do prisma nao
# tem uma unica mencao a "env.local"; ele carrega ".env" via dotenv).
# So que o guia mandava colar a DATABASE_URL no .env.local - que e o
# arquivo do Next.js.
#
# A consequencia em cascata:
#   passo 2 roda `npm install` SEM --ignore-scripts
#     -> o postinstall (prisma generate) executa
#     -> prisma nao acha DATABASE_URL -> P1012
#     -> npm install ABORTA no meio, node_modules fica incompleto
#   o script segue para `npx prisma generate`
#     -> o prisma local nao esta utilizavel
#     -> npx BAIXA um prisma@8.0.0-rc.19 do npm pra C:\node_modules
#     -> e Falha de novo, agora sem explicacao
#
# A CORRECAO: a checagem da DATABASE_URL e a criacao do .env aconteciam
# DEPOIS do npm install (passo 3). Sobem para antes, e o .env passa a
# existir antes de qualquer coisa.
# ================================================================

# ---- 1. o bloco do banco sobe para antes do npm install -------------
# Tira o bloco inteiro de ":banco" (que hoje vem depois do generate) e
# guarda para reinserir no lugar certo.
inicio_banco = s.index(':banco\r\n')
fim_banco = s.index(':tem_database\r\n')
bloco_banco = s[inicio_banco:fim_banco]
s = s[:inicio_banco] + s[fim_banco:]

# ---- 2. reescreve o bloco do banco ----------------------------------
# Alem de conferir a DATABASE_URL, agora materializa o .env - que e o
# arquivo que o Prisma realmente le.
bloco_novo = (
    'rem ---------------------------------------------------------------- passo 2\r\n'
    '\r\n'
    ':banco\r\n'
    '\r\n'
    'rem A URL do banco e lida de DOIS lugares: o .env.local (do Next) e o\r\n'
    'rem .env (do Prisma). O guia manda colar no .env.local, mas o Prisma\r\n'
    'rem NAO le .env.local - so o .env. Aceita os dois para nao travar\r\n'
    'rem quem ja tinha colocado no .env.\r\n'
    '\r\n'
    'if not exist .env.local type nul > .env.local\r\n'
    '\r\n'
    'findstr /C:"DATABASE_URL=" .env.local >nul 2>nul\r\n'
    '\r\n'
    'if not errorlevel 1 goto :tem_database\r\n'
    '\r\n'
    'if not exist .env goto :sem_database\r\n'
    '\r\n'
    'findstr /C:"DATABASE_URL=" .env >nul 2>nul\r\n'
    '\r\n'
    'if errorlevel 1 goto :sem_database\r\n'
    '\r\n'
    '\r\n'
    'rem ---- tem a URL: garante que o Prisma enxerga -----------------------\r\n'
    'rem Sem este passo o prisma generate do postinstall Falha com P1012 e o\r\n'
    'rem npm install ABORTA no meio, deixando o node_modules incompleto - e\r\n'
    'rem dai tudo o mais Falha sem explicacao clara.\r\n'
    '\r\n'
    ':tem_database\r\n'
    '\r\n'
    'copy /y .env.local .env >nul 2>nul\r\n'
    '\r\n'
    'if not exist .env copy /y .env.local.example .env >nul 2>nul\r\n'
    '\r\n'
    'findstr /C:"DATABASE_URL=" .env >nul 2>nul\r\n'
    '\r\n'
    'if errorlevel 1 (\r\n'
    '  echo  Aviso: nao consegui criar o .env com a DATABASE_URL.\r\n'
    '  echo  O Prisma pode Falhar no proximo passo.\r\n'
    ')\r\n'
    '\r\n'
    'echo  URL do banco encontrada. Prisma configurado.\r\n'
    '\r\n'
    'goto :instalar\r\n'
    '\r\n'
    '\r\n'
    '\r\n'
    ':sem_database\r\n'
    '\r\n'
    'echo.\r\n'
    '\r\n'
    'echo [X] Nenhum arquivo tem a DATABASE_URL.\r\n'
    '\r\n'
    'echo     Sem ela o app nao conversa com banco nenhum.\r\n'
    '\r\n'
    'echo.\r\n'
    '\r\n'
    'echo     SOLUCAO: abra o arquivo .env.local desta pasta no Bloco de\r\n'
    '\r\n'
    'echo     Notas e cole uma linha assim (troque pela SUA url):\r\n'
    '\r\n'
    'echo.\r\n'
    '\r\n'
    'echo     DATABASE_URL="postgresql://usuario:senha@host.neon.tech/neondb?sslmode=require"\r\n'
    '\r\n'
    'echo.\r\n'
    '\r\n'
    'echo     Depois rode este script de novo.\r\n'
    '\r\n'
    'goto :fim\r\n'
    '\r\n'
    '\r\n'
    '\r\n'
)
assert bloco_banco.strip().startswith(':banco'), bloco_banco[:40]
s = s.replace(bloco_banco, bloco_novo, 1)

# ---- 3. o bloco do npm install entra no lugar ----------------------
# Reinsere o bloco do banco ANTES do :instalar, para a URL ser conferida
# (e o .env criado) antes de qualquer npm install.
s = troca(
    'rem ---------------------------------------------------------------- passo 2\r\n'
    '\r\n'
    ':instalar\r\n',
    bloco_novo +
    'rem ---------------------------------------------------------------- passo 3\r\n'
    '\r\n'
    ':instalar\r\n',
)

# ---- 4. npx prisma -> npx --no-install prisma -----------------------
# Impede o npx de baixar um prisma aleatorio do npm quando o local nao
# esta utilizavel (foi o que aconteceu: prisma@8.0.0-rc.19 em
# C:\node_modules). Sem internet ele erra na hora, com mensagem clara.
s = s.replace('call npx prisma generate', 'call npx --no-install prisma generate')
s = s.replace('call npx prisma db push', 'call npx --no-install prisma db push')
assert 'call npx prisma ' not in s

# ---- 5. mensagem de falha do install agora cita a causa real -------
s = troca(
    "echo [X] Falha ao instalar as dependencias.\r\n"
    "\r\n"
    "echo     Confira sua internet e tente de novo. Se o erro mencionar\r\n"
    "\r\n"
    'echo     "prisma" ou "binaries.prisma.sh", e bloqueio de rede.\r\n'
    "\r\n"
    "goto :fim\r\n",
    "echo [X] Falha ao instalar as dependencias.\r\n"
    "\r\n"
    "echo     A causa mais comum e a DATABASE_URL: o npm install roda o\r\n"
    "echo     prisma generate sozinho e, se ele nao achar a URL, aborta no\r\n"
    "echo     meio. Confira se o .env.local tem a linha DATABASE_URL certa.\r\n"
    "\r\n"
    'echo     Se o erro mencionar "binaries.prisma.sh", e bloqueio de rede.\r\n'
    "\r\n"
    "goto :fim\r\n",
)

# ---- 6. renumera os passos que sobraram -----------------------------
s = troca(
    "echo === 2/6 Instalando dependencias (gerando o Prisma real) ===",
    "echo === 3/6 Instalando dependencias (gerando o Prisma real) ===",
)
s = troca(
    "echo === 3/6 Criando as tabelas no banco ===",
    "echo === 4/6 Criando as tabelas no banco ===",
)
s = troca(
    "echo === 4/6 Carregando os dados de exemplo ===",
    "echo === 5/6 Carregando os dados de exemplo ===",
)
s = troca(
    "echo === 5/6 Compilando o app (modo producao) ===",
    "echo === 6/6 Compilando o app (modo producao) ===",
)
s = troca(
    "echo === 6/6 Abrindo o app em MODO PRODUCAO ===",
    "echo === Pronto. Abrindo o app em MODO PRODUCAO ===",
)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('TESTAR-REAL.bat corrigido')
