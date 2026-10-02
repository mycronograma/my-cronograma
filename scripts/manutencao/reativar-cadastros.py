import io

P = 'TESTAR-NEXORA.bat'
s = io.open(P, encoding='utf-8', newline='').read()


def troca(velho, novo, quantas=1):
    assert velho in s, 'nao achou: %r' % velho[:70]
    return s.replace(velho, novo, quantas)


# 1) comentario do bloco de configuracao
s = troca(
    'rem O .env.local guarda as configuracoes locais. Ele e criado sozinho e\r\n'
    'rem COMPLETADO quando ja existe: uma versao antiga do arquivo nao pode\r\n'
    'rem deixar o app sem uma variavel que passou a existir depois.\r\n',
    'rem O .env.local guarda as configuracoes locais. Ele e criado sozinho e\r\n'
    'rem COMPLETADO quando ja existe: uma versao antiga do arquivo nao pode\r\n'
    'rem deixar o app sem uma variavel que passou a existir depois.\r\n'
    'rem\r\n'
    'rem So a chave dos cadastros e FORCADA (ver :forcar_env). As outras sao\r\n'
    'rem apenas completadas, para nao sobrescrever uma URL de banco que voce\r\n'
    'rem colou na mao.\r\n',
)

# 2) a chave dos cadastros passa a ser forcada, nao so completada
s = troca(
    'call :garantir_env NEXT_PUBLIC_SIGNUPS_ENABLED "false"\r\n',
    'call :forcar_env NEXT_PUBLIC_SIGNUPS_ENABLED "true"\r\n',
)

# 3) a sub-rotina :forcar_env, colada antes de :garantir_env
s = troca(
    'rem ---- completa uma variavel que esteja faltando no .env.local -----------\r\n'
    '\r\n'
    ':garantir_env\r\n',
    'rem ---- forca o valor de uma variavel, exista ela ou nao -------------------\r\n'
    'rem Diferente de :garantir_env, esta troca a linha quando ela ja existe.\r\n'
    'rem Necessaria para a chave dos cadastros: quem rodou o script com os\r\n'
    'rem cadastros fechados tem NEXT_PUBLIC_SIGNUPS_ENABLED="false" gravado, e\r\n'
    'rem completar nao mudaria nada.\r\n'
    '\r\n'
    ':forcar_env\r\n'
    '\r\n'
    'findstr /V /C:"%~1=" .env.local > .env.novo 2>nul\r\n'
    '\r\n'
    'if exist .env.novo move /y .env.novo .env.local >nul\r\n'
    '\r\n'
    'echo %~1=%~2>>.env.local\r\n'
    '\r\n'
    'goto :eof\r\n'
    '\r\n'
    '\r\n'
    '\r\n'
    'rem ---- completa uma variavel que esteja faltando no .env.local -----------\r\n'
    '\r\n'
    ':garantir_env\r\n',
)

# 4) o caminho de arquivo novo (sem .env.local) tambem grava "true"
s = troca(
    'echo NEXT_PUBLIC_SIGNUPS_ENABLED="false">>.env.local\r\n',
    'echo NEXT_PUBLIC_SIGNUPS_ENABLED="true">>.env.local\r\n',
)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('TESTAR-NEXORA.bat atualizado')
