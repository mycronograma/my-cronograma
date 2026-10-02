import io

P = 'TESTAR-REAL.bat'
s = io.open(P, encoding='utf-8', newline='').read()

# O bloco velho de ":tem_database" (com a mensagem "[X] O arquivo .env.local
# nao tem a DATABASE_URL") ficou como codigo morto depois que a checagem subiu
# para antes do npm install. Pior: o batch executa em sequencia, entao depois
# do prisma generate dar certo ele CAIRIA nesse bloco, imprimiria um erro falso
# e pularia para :fim - abortando o teste no meio.
#
# Some com o bloco inteiro, mantendo o ":tem_database" que realmente abre o
# db push.
MARCA = 'echo [X] O arquivo .env.local nao tem a DATABASE_URL.'
assert s.count(MARCA) == 1, 'marca aparece %d vezes' % s.count(MARCA)

i = s.index(MARCA)
# volta ate o ":tem_database" que abre esse bloco
inicio = s.rindex(':tem_database\r\n', 0, i)
# vai ate o proximo ":tem_database" (o que abre o db push)
fim = s.index(':tem_database\r\n', i)
removido = s[inicio:fim]
assert 'goto :fim' in removido, 'bloco nao termina em goto :fim'
s = s[:inicio] + s[fim:]

# o comentario de passo que sobrou antes do bloco morto agora pertence ao
# db push
s = s.replace(
    'rem ---------------------------------------------------------------- passo 3\r\n'
    '\r\n'
    ':tem_database\r\n'
    '\r\n'
    'echo.\r\n'
    '\r\n'
    'echo === 4/6 Criando as tabelas no banco ===',
    'rem ---------------------------------------------------------------- passo 4\r\n'
    '\r\n'
    ':tem_database\r\n'
    '\r\n'
    'echo.\r\n'
    '\r\n'
    'echo === 4/6 Criando as tabelas no banco ===',
    1,
)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('bloco morto removido')
