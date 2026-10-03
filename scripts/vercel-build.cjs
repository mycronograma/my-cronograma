#!/usr/bin/env node

/**
 * Build da Vercel.
 *
 * Ordem: prisma generate -> sincroniza o schema no banco -> next build.
 *
 * REGRA QUE NÃO PODE VOLTAR ATRÁS: a sincronização roda SEM
 * `--accept-data-loss`. Com essa flag, o Prisma aplica mudanças no schema
 * mesmo quando elas apagariam dados — e o deploy "passa" com o banco já
 * destruído. Sem a flag, se a mudança perderia dado, o build FALHA e
 * explica. Falhar alto é o comportamento correto: deploy se refaz,
 * dado de usuário não.
 *
 * Caminho certo quando a mudança é realmente destrutiva: migrações
 * versionadas (`prisma migrate`), que exigem confirmação explícita. Ver
 * DEPLOY-WEB.md, Parte 4.
 */

const { spawnSync } = require('node:child_process');

const npxCmd = 'npx';

/** Roda um comando deixando a saída aparecer no log do build. */
function runNpx(args, { allowFailure = false } = {}) {
  const commandLine = [npxCmd, ...args.map((value) => `"${value.replace(/"/g, '\\"')}"`)].join(' ');
  const result = spawnSync(commandLine, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });

  if (result.error) {
    console.error(`[vercel-build] Failed to execute "${npxCmd} ${args.join(' ')}"`, result.error);
    if (!allowFailure) {
      process.exit(1);
    }
    return false;
  }

  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }

  return result.status === 0;
}

/**
 * Roda a sincronização do schema capturando a saída, para conseguir
 * explicar a causa quando ela falhar. `prisma db push` sem
 * `--accept-data-loss` recusa mudanças que perderiam dado, e a mensagem
 * crua dele não diz o que fazer.
 */
function syncSchema() {
  const commandLine = [npxCmd, 'prisma', 'db', 'push'].join(' ');
  const result = spawnSync(commandLine, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
    shell: true,
    encoding: 'utf8',
  });

  const saida = `${result.stdout || ''}${result.stderr || ''}`;
  if (saida.trim()) {
    console.log(saida.trim());
  }

  if (result.error) {
    console.error('[vercel-build] não consegui executar o prisma db push:', result.error);
    return false;
  }

  if (result.status === 0) {
    console.log('[vercel-build] schema sincronizado.');
    return true;
  }

  // ---- falhou: explica o porquê antes de derrubar o build ----------------
  // Só entra aqui quem realmente fala de perda de dado. "already exists"
  // não é sinal disso (pode ser choque de CREATE TABLE) e rotearia errado.
  const parecePerdaDeDado =
    /data loss|may lose data|--accept-data-loss|destructive/i.test(saida);

  console.error('');
  console.error('[vercel-build] ==================================================');
  console.error('[vercel-build]  A sincronização do banco foi RECUSADA.');
  console.error('[vercel-build] ==================================================');

  if (parecePerdaDeDado) {
    console.error('');
    console.error('  A mudança no schema apagaria dados que já existem no banco.');
    console.error('  O build parou de propósito: refazer um deploy é fácil,');
    console.error('  dado de usuário perdido não volta.');
    console.error('');
    console.error('  NÃO passe --accept-data-loss para "resolver".');
    console.error('  O caminho certo é migração versionada:');
    console.error('    1. npx prisma migrate dev --name descreva_a_mudanca');
    console.error('    2. commite a pasta prisma/migrations/');
    console.error('    3. faça o deploy de novo');
    console.error('  Detalhes em DEPLOY-WEB.md, Parte 4.');
  } else {
    console.error('');
    console.error('  A causa mais comum é a DATABASE_URL: errada, incompleta,');
    console.error('  ou o projeto do banco não existe mais.');
    console.error('  Confira em Vercel -> Settings -> Environment Variables.');
  }

  console.error('');
  return false;
}

function normalizeCockroachUrl(url) {
  if (!url || !url.includes('cockroachlabs.cloud')) return url;
  if (!url.includes('sslmode=verify-full')) return url;
  if (url.includes('sslrootcert=')) return url;
  return url.replace('sslmode=verify-full', 'sslmode=require');
}

console.log('[vercel-build] Running prisma generate...');
runNpx(['prisma', 'generate']);

if (process.env.DATABASE_URL) {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  const isCockroach = rawDatabaseUrl.includes('cockroachlabs.cloud');
  if (isCockroach) {
    const normalizedUrl = normalizeCockroachUrl(rawDatabaseUrl);
    if (normalizedUrl !== rawDatabaseUrl) {
      process.env.DATABASE_URL = normalizedUrl;
      console.log('[vercel-build] Normalized CockroachDB sslmode to require.');
    }
  }

  console.log('[vercel-build] Sincronizando o schema no banco (sem --accept-data-loss)...');
  const sincronizou = syncSchema();

  if (!sincronizou && process.env.VERCEL_ENV === 'production') {
    process.exit(1);
  }
  if (!sincronizou) {
    console.warn('[vercel-build] preview/development: seguindo mesmo com o banco dessincronizado.');
  }
} else {
  console.warn('[vercel-build] DATABASE_URL not set. Skipping schema sync.');
}

console.log('[vercel-build] Running next build...');
runNpx(['next', 'build']);
