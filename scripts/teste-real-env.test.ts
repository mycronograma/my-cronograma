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

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
