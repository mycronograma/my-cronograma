/**
 * Teste de regressao: TESTAR-REAL.bat e a DATABASE_URL do Prisma.
 *
 * O bug que fez o teste real falhar no PC do usuario:
 *
 *   1. o script rodava `npm install` (sem --ignore-scripts) no passo 2
 *   2. o postinstall (prisma generate) executa dentro desse install
 *   3. o Prisma le o arquivo .env, NAO o .env.local - e a URL estava no
 *      .env.local, porque o guia mandava por la
 *   4. prisma generate estoura com P1012 e o npm install ABORTA no meio
 *   5. o script segue para `npx prisma generate`, o prisma local nao esta
 *      utilizavel, e o npx BAIXA um prisma@8.0.0-rc.19 do npm
 *   6. tudo falha dali em diante, com mensagens que nao apontam a causa
 *
 * Este teste amarra as tres correcoes: a URL e conferida ANTES do install,
 * o .env e materializado antes de qualquer coisa, e o npx nao pode baixar
 * Prisma da internet.
 *
 * Rodar: npm run test:teste-real
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const ler = (relativo: string) => fs.readFileSync(path.join(RAIZ, relativo), 'utf8');

let passou = 0;
let falhou = 0;

function checar(rotulo: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`✔ ${rotulo}`);
  } else {
    falhou += 1;
    console.log(`✘ ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

const bat = ler('TESTAR-REAL.bat');
const guia = ler('COMO-TESTAR-REAL.md');
const pkg = ler('package.json');

const posInstall = bat.indexOf('call npm install');
const posCopyEnv = bat.indexOf('copy /y .env.local .env');
const posChecaUrl = bat.indexOf('findstr /C:"DATABASE_URL=" .env.local');
const posGenerate = bat.indexOf('prisma generate');
const posDbPush = bat.indexOf('prisma db push');
const posConfere = bat.indexOf(':confere_url');
const posUrlLocal = bat.indexOf(':url_local');

checar('o script roda npm install', posInstall > 0);
checar('o script confere a DATABASE_URL', posChecaUrl > 0);
checar('o script cria o .env a partir do .env.local', posCopyEnv > 0);
checar('o script roda prisma generate', posGenerate > 0);
checar('o script roda prisma db push', posDbPush > 0);

// ---------------------------------------------- a ordem e a correcao
checar(
  'a DATABASE_URL e conferida ANTES do npm install',
  posChecaUrl < posInstall,
  `checa em ${posChecaUrl}, install em ${posInstall}`
);

checar(
  'o .env e criado ANTES do npm install (e do postinstall)',
  posCopyEnv < posInstall,
  `copia em ${posCopyEnv}, install em ${posInstall}`
);

checar(
  'a URL e conferida ANTES do prisma generate',
  posChecaUrl < posGenerate,
  `checa em ${posChecaUrl}, generate em ${posGenerate}`
);

// ---------------------------------------------- npx nao pode baixar Prisma
checar(
  'prisma generate usa --no-install (npx nao baixa da internet)',
  /call npx --no-install prisma generate/.test(bat),
  'npx sem --no-install baixa um prisma aleatorio quando o local falha'
);

checar(
  'prisma db push usa --no-install',
  /call npx --no-install prisma db push/.test(bat),
  'mesmo motivo'
);

checar(
  'nenhum comando prisma fica sem --no-install',
  !/call npx prisma /.test(bat),
  'sobrou um npx prisma sem a trava'
);

// ---------------------------------------------- o guia explica o .env
checar(
  'o guia avisa que o Prisma le o .env, nao o .env.local',
  /Prisma.*l[eê] o arquivo \*\*`\.env`\*\*/.test(guia) || /\.env\*\*, e não o `\.env\.local`/.test(guia),
  'quem rodar o Prisma fora do script precisa saber'
);

checar(
  'o guia documenta o erro P1012',
  /P1012/.test(guia),
  'e o erro que o usuario viu'
);

// ---------------------------------------------- postinstall existe (e por
// isso a ordem importa: se ele roda sem URL, o install aborta)
checar(
  'o package.json tem postinstall com prisma generate',
  /"postinstall":\s*"prisma generate"/.test(pkg),
  'e exatamente esse hook que estourava'
);

// ---------------------------------------------- URL de localhost
// O TESTAR-NEXORA.bat grava uma DATABASE_URL de localhost:26257 no
// .env.local. Sem esta checagem o script aceitava essa URL como se
// fosse a da nuvem e so quebrava no db push, sem explicar o motivo.
checar(
  'o script tem o bloco :confere_url',
  posConfere > 0,
  'e onde a URL e examinada antes de seguir'
);

checar(
  'o script tem o bloco :url_local',
  posUrlLocal > 0,
  'a mensagem que explica a URL de localhost'
);

checar(
  'a URL de localhost e detectada pelo nome do host',
  /findstr \/C:"DATABASE_URL=" \.env\.local \| findstr \/I \/C:"localhost"/.test(bat),
  'procura localhost dentro da linha DATABASE_URL, nao no arquivo inteiro'
);

checar(
  'a URL 127.0.0.1 tambem e detectada',
  /findstr \/C:"127\.0\.0\.1"/.test(bat),
  'mesma armadilha, outro endereco'
);

checar(
  'a checagem de localhost vem ANTES do npm install',
  posConfere > 0 && posConfere < posInstall,
  `confere em ${posConfere}, install em ${posInstall}`
);

checar(
  ':url_local para o script (nao segue instalando)',
  /:url_local[\s\S]{0,900}?goto :fim/.test(bat),
  'sem isso ele instalaria mesmo assim e falharia no db push'
);

checar(
  'a mensagem de :url_local manda apagar a linha DATABASE_URL',
  /APAGUE a linha DATABASE_URL/.test(bat),
  'instrucao acionavel, nao so um aviso'
);

checar(
  'o guia mostra a URL com -pooler e channel_binding',
  /-pooler/.test(guia) && /channel_binding=require/.test(guia),
  'formato novo do Neon; o antigo levava a cortar a URL'
);

checar(
  'o guia explica a armadilha da URL de localhost',
  /localhost:26257/.test(guia) && /apague essa linha/i.test(guia),
  'quem ja rodou o TESTAR-NEXORA.bat tem essa linha no .env.local'
);

checar(
  'o guia tem a linha do erro de URL local na tabela',
  /aponta para \*\*este computador\*\*/.test(guia),
  'o usuario precisa reconhecer a mensagem do script'
);

// ---------------------------------------------- chaves de sessao
// Em producao o src/lib/env.ts nao tem segredo padrao: sem
// NEXTAUTH_SECRET a autenticacao falha. O guia manda criar um
// .env.local novinho so com a URL, entao o script tem de completar.
checar(
  'o script define a sub-rotina :garantir_env',
  /^:garantir_env/m.test(bat),
  'e ela que completa as chaves que faltam'
);

checar(
  ':garantir_env e chamada para NEXTAUTH_SECRET',
  /call :garantir_env NEXTAUTH_SECRET/.test(bat),
  'sem ela o login falha em modo producao'
);

checar(
  ':garantir_env e chamada para NEXTAUTH_URL',
  /call :garantir_env NEXTAUTH_URL/.test(bat),
  'missingAuthEnv tambem exige a URL'
);

checar(
  ':garantir_env so completa (nunca sobrescreve)',
  /:garantir_env[\s\S]{0,320}?if not errorlevel 1 goto :eof/.test(bat),
  'se a linha ja existe ela sai sem mexer - a chave da pessoa sobrevive'
);

checar(
  'as chaves sao completadas ANTES do npm install',
  bat.indexOf('call :garantir_env') > 0 &&
    bat.indexOf('call :garantir_env') < posInstall,
  'o build le o .env.local; complete depois nao adianta'
);

checar(
  'o label :fim aparece uma unica vez',
  (bat.match(/^:fim/gm) || []).length === 1,
  'label duplicada faz o goto :fim cair no bloco errado'
);

checar(
  'o guia avisa que o script completa as outras chaves',
  /completa sozinho as/.test(guia) && /NEXTAUTH_SECRET/.test(guia),
  'e que so completa o que falta'
);

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
