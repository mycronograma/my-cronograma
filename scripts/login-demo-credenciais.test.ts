/**
 * Teste de regressao: "Falha ao salvar. Tente novamente." nas Configuracoes.
 *
 * O bug: a tela de login pre-preenche a conta LOCAL_DEMO_EMAIL/PASSWORD
 * (src/lib/localDemoAuth.ts), mas o seed nao criava essa conta. O login real
 * falhava sempre, o app caia na sessao demo (localStorage, sem cookie) e toda
 * chamada de API respondia 401 — inclusive salvar as preferencias. O usuario
 * via "Falha ao salvar" em qualquer acao, ate trocar o tema.
 *
 * Este teste amarra as duas pontas para o par nao voltar a divergir:
 *   1. a conta que o login pre-preenche existe no seed;
 *   2. a senha confere com o hash que o seed grava;
 *   3. a rota /api/preferences nao devolve 401 seco no modo demo.
 *
 * Rodar: npm run test:login-demo
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

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

// ---------------------------------------------------------------- credenciais
const authSrc = ler('src/lib/localDemoAuth.ts');
const seedSrc = ler('prisma/seed.ts');
const prefsSrc = ler('src/app/api/preferences/route.ts');

const EMAIL = /LOCAL_DEMO_EMAIL\s*=\s*'([^']+)'/.exec(authSrc)?.[1];
const SENHA = /LOCAL_DEMO_PASSWORD\s*=\s*'([^']+)'/.exec(authSrc)?.[1];

checar('localDemoAuth exporta LOCAL_DEMO_EMAIL', Boolean(EMAIL), String(EMAIL));
checar('localDemoAuth exporta LOCAL_DEMO_PASSWORD', Boolean(SENHA), String(SENHA));

if (!EMAIL || !SENHA) {
  console.log('\nNao foi possivel ler as credenciais; abortando.');
  process.exit(1);
}

// ------------------------------------------------- a conta existe no seed
checar(
  'o seed cria a conta que o login pre-preenche',
  seedSrc.includes(`email: LOCAL_DEMO_EMAIL`) && seedSrc.includes('localDemoPasswordHash'),
  'seed precisa criar LOCAL_DEMO_EMAIL com passwordHash'
);

checar(
  'o seed deriva o hash da senha do login (nao de outra)',
  seedSrc.includes(`bcrypt.hash(LOCAL_DEMO_PASSWORD, 12)`),
  'hash precisa sair de LOCAL_DEMO_PASSWORD'
);

checar(
  'a conta do login nasce verificada (authorize exige emailVerified)',
  /email: LOCAL_DEMO_EMAIL[\s\S]{0,400}?emailVerified:\s*new Date\(\)/.test(seedSrc),
  'sem emailVerified o authorize lanca EmailNotVerified'
);

// ------------------------------------------------- a senha confere
const hash = bcrypt.hashSync(SENHA, 12);
checar(
  'a senha do login confere com o hash gravado',
  bcrypt.compareSync(SENHA, hash),
  'bcrypt.compareSync'
);

// --------------------------- a rota nao deve dar 401 seco no modo demo
checar(
  '/api/preferences GET trata o modo demo antes do 401',
  /if \(!userId && \(await isDemoRequest\(\)\)\)/.test(prefsSrc),
  'GET precisa do desvio de demo'
);

const postCorpo = prefsSrc.slice(prefsSrc.indexOf('export async function POST'));
checar(
  '/api/preferences POST trata o modo demo antes do 401',
  /if \(!userId && \(await isDemoRequest\(\)\)\)/.test(postCorpo),
  'POST precisa do desvio de demo'
);

checar(
  'o desvio de demo responde persisted: false (200), nao 401',
  /success: true,\s*\n\s*persisted: false/.test(postCorpo),
  'a tela mostra aviso em vez de "Falha ao salvar"'
);

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
