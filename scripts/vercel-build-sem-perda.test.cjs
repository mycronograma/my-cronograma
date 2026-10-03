#!/usr/bin/env node
/**
 * Teste de regressao: o build da Vercel nao pode aceitar perda de dados.
 *
 * O buraco: `prisma db push --accept-data-loss` roda em TODO deploy. Com a
 * flag, o Prisma aplica mudancas no schema mesmo apagando dados - e o deploy
 * "passa" com o banco destruido. Sem a flag, se a mudanca perderia dado, o
 * build falha e explica.
 *
 * Este teste amarra:
 *   1. nenhum comando prisma do build carrega --accept-data-loss
 *   2. a deteccao de "perda de dados" reconhece as mensagens reais do Prisma
 *   3. o build explica o que fazer quando recusa
 *   4. falhar em producao derruba o build; em preview, nao
 *
 * Rodar: node scripts/vercel-build-sem-perda.test.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const ARQUIVO = path.join(RAIZ, 'scripts', 'vercel-build.cjs');
const fonte = fs.readFileSync(ARQUIVO, 'utf8');

let passou = 0;
let falhou = 0;

function checar(rotulo, condicao, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`OK   ${rotulo}`);
  } else {
    falhou += 1;
    console.log(`FALHA ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

// ---------------------------------------------------------------- 1. a flag
// A flag so vale como comando se estiver dentro de um array de argumentos.
// Comentarios e mensagens podem mencionar o nome a vontade.
const arrays = fonte.match(/\[[^\[\]]*\]/g) || [];

checar(
  'o build monta arrays de argumentos',
  arrays.length >= 3,
  `achei ${arrays.length} arrays`
);

checar(
  'NENHUM array de argumentos carrega --accept-data-loss',
  arrays.every((c) => !/accept-data-loss/.test(c)),
  'a flag faz o deploy apagar dado sem perguntar'
);

checar(
  'os tres comandos do build estao la',
  /['"]prisma['"],\s*['"]generate['"]/.test(fonte) &&
    /['"]prisma['"],\s*['"]db['"],\s*['"]push['"]/.test(fonte) &&
    /['"]next['"],\s*['"]build['"]/.test(fonte),
  'generate, sincronizacao do schema e next build'
);

checar(
  'o prisma db push continua sendo chamado',
  /['"]db['"],\s*['"]push['"]/.test(fonte),
  'sem ele o banco nunca sincroniza'
);

// --------------------------------------------------- 2. deteccao de perda
// Blocos de saida que o Prisma realmente produz. O que importa e o bloco
// inteiro: a linha de detalhe sozinha nao carrega o sinal, mas ela nunca
// vem sozinha - vem depois do aviso.
const BLOCOS_DE_PERDA = [
  [
    'We have detected changes that are not yet applied...',
    '',
    'Some of the changes may result in data loss:',
    '  - Changed the type of `User.email` from `String` to `Int`',
    '',
    'To apply this change, use the --accept-data-loss flag:',
    '  npx prisma db push --accept-data-loss',
  ].join('\n'),
  [
    'warning: destructive change detected on `StudyBlock`',
    'Dropping the column would delete 1284 rows.',
  ].join('\n'),
  'This action may result in data loss. Use --accept-data-loss to proceed.',
];

const BLOCOS_DE_OUTRA_CAUSA = [
  "Can't reach database server at `ep-xxx-pooler.sa-east-1.aws.neon.tech:5432'",
  'Please make sure your database server is running at `localhost:26257`.',
  'Environment variable not found: DATABASE_URL',
  'P1001: Cannot connect to database',
  'Timed out fetching a new connection from the connection pool',
];

// A regex vive dentro do arquivo; aqui a reavaliamos com o mesmo padrao.
const regexDoArquivo = fonte.match(/const parecePerdaDeDado =\s*\n?\s*(\/.*?\/i)\.test/);
checar(
  'o arquivo define a deteccao de perda de dados',
  Boolean(regexDoArquivo),
  'sem ela a mensagem de erro fica generica'
);

if (regexDoArquivo) {
  const re = eval(regexDoArquivo[1]);
  checar(
    'reconhece os blocos reais de perda de dados',
    BLOCOS_DE_PERDA.every((m) => re.test(m)),
    'um bloco real passou batida'
  );
  checar(
    'nao confunde erro de conexao com perda de dados',
    BLOCOS_DE_OUTRA_CAUSA.every((m) => !re.test(m)),
    'mandaria o usuario migrar schema quando o problema e a URL'
  );
}

// ------------------------------------------------------- 3. explica a saida
checar(
  'o build explica que falhar e de proposito',
  /build parou de prop[oó]sito/i.test(fonte) ||
    /A sincroniza[cç][aã]o do banco foi RECUSADA/.test(fonte),
  'sem isso o usuario acha que e bug'
);

checar(
  'o build manda NAO usar --accept-data-loss',
  /N[AÃ]O passe --accept-data-loss/.test(fonte),
  'a "solucao" obvia e justamente a armadilha'
);

checar(
  'o build aponta o caminho da migracao versionada',
  /prisma migrate dev/.test(fonte) && /DEPLOY-WEB\.md/.test(fonte),
  'precisa ter para onde ir'
);

// --------------------------------------------------- 4. producao vs preview
checar(
  'em producao a falha derruba o build',
  /if \(!sincronizou && process\.env\.VERCEL_ENV === 'production'\)\s*\{\s*process\.exit\(1\)/.test(fonte),
  'em preview pode seguir, em producao nao'
);

checar(
  'o script continua valido como JS',
  (() => {
    try {
      new Function(fonte.replace(/^#!.*\n/, ''));
      return true;
    } catch {
      return false;
    }
  })(),
  'sintaxe quebrada nem roda'
);

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
