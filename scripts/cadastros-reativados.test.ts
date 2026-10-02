/**
 * Teste de regressao: reativacao dos cadastros.
 *
 * Os cadastros ficaram fechados por configuracao (#27) e agora voltaram.
 * Este teste amarra as tres pontas para o "ligar/desligar" nao quebrar:
 *
 *   1. a chave NEXT_PUBLIC_SIGNUPS_ENABLED esta LIGADA no exemplo e no .bat;
 *   2. o .bat FORCA o valor (garantir_env so completaria, e quem rodou com os
 *      cadastros fechados teria "false" gravado para sempre);
 *   3. a pagina de cadastro tenta o cadastro REAL antes do modo demo — sem
 *      isso a conta nova nascia so no localStorage e toda API respondia 401.
 *
 * Rodar: npm run test:cadastros
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

const exemplo = ler('.env.local.example');
const bat = ler('TESTAR-NEXORA.bat');
const registerSrc = ler('src/app/register/page.tsx');
const loginSrc = ler('src/app/login/page.tsx');
const rotaSrc = ler('src/app/api/auth/register/route.ts');

const VALOR_LIGADO = /NEXT_PUBLIC_SIGNUPS_ENABLED\s*=\s*"true"/;

// ------------------------------------------------- 1. a chave esta ligada
checar(
  '.env.local.example liga os cadastros',
  VALOR_LIGADO.test(exemplo),
  'NEXT_PUBLIC_SIGNUPS_ENABLED precisa ser "true"'
);

checar(
  'o .bat cria arquivo novo com os cadastros ligados',
  /echo NEXT_PUBLIC_SIGNUPS_ENABLED="true">>\.env\.local/.test(bat),
  'caminho de primeira execucao'
);

// ------------------------------------------------- 2. o .bat forca o valor
checar(
  'o .bat FORCA a chave dos cadastros (nao so completa)',
  /call :forcar_env NEXT_PUBLIC_SIGNUPS_ENABLED "true"/.test(bat),
  'garantir_env nao sobrescreve valor existente'
);

checar(
  'a sub-rotina :forcar_env existe e filtra a linha antiga',
  /:forcar_env[\s\S]{0,400}?findstr \/V \/C:"%~1=" \.env\.local/.test(bat),
  'precisa remover a linha antes de regravar'
);

checar(
  'a chave dos cadastros nao passa mais por :garantir_env',
  !/call :garantir_env NEXT_PUBLIC_SIGNUPS_ENABLED/.test(bat),
  'sairia com o valor antigo'
);

// ------------------------------------- 3. cadastro real antes do demo
checar(
  'a pagina de cadastro chama /api/auth/register',
  registerSrc.includes("fetch('/api/auth/register'"),
  'caminho real precisa existir'
);

// So interessa o que acontece dentro do handleSubmit; o import no topo do
// arquivo naturalmente vem antes de qualquer fetch.
const corpoSubmit = registerSrc.slice(
  registerSrc.indexOf('const handleSubmit'),
  registerSrc.indexOf('return (')
);

checar(
  'o demo NAO e atalho antes do cadastro real',
  !corpoSubmit
    .slice(0, corpoSubmit.indexOf("fetch('/api/auth/register'"))
    .includes('startLocalDemoSession'),
  'startLocalDemoSession nao pode vir antes do fetch'
);

checar(
  'o demo virou fallback de rede, depois do fetch',
  corpoSubmit.indexOf('startLocalDemoSession') >
    corpoSubmit.indexOf("fetch('/api/auth/register'"),
  'ordem: real primeiro, demo depois'
);

checar(
  'recusa do servidor (signupsDisabled) mostra a mensagem',
  /payload\?\.signupsDisabled/.test(registerSrc),
  'nao deve cair no demo quando os cadastros estao fechados'
);

// ------------------------------------------- 4. as duas telas leem a chave
checar(
  'a tela de login mostra o link de cadastro pela chave',
  /signupsEnabled\(\) && \([\s\S]{0,300}?href="\/register"/.test(loginSrc),
  'link some quando os cadastros fecham'
);

checar(
  'a rota de API continua conferindo a chave',
  /if \(!signupsEnabled\(\)\)/.test(rotaSrc),
  'servidor precisa recusar quando desligada'
);

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
