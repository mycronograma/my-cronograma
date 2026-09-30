/**
 * Inventário de funcionalidades do Nexora.
 * Varre as telas e lista os textos de interface (botões, títulos, rótulos)
 * que uma pessoa vê, em vez de nomes de código. Uso interno de manutenção.
 *
 * Rodar: node scripts/inventario.mjs
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function arquivosTSX(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) arquivosTSX(caminho, saida);
    else if (nome.endsWith('.tsx')) saida.push(caminho);
  }
  return saida;
}

/** Textos que aparecem na tela: conteúdo de <button>, <span>, <p>, <h1..h3>. */
function textos(txt) {
  const achados = new Set();
  const tags = ['button', 'span', 'p', 'h1', 'h2', 'h3', 'label', 'Badge', 'Button', 'Card'];
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>([^<>{}]{3,48})<`, 'g');
    for (const m of txt.matchAll(re)) {
      const limpo = m[1].trim().replace(/\s+/g, ' ');
      if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(limpo) && !/^(function|return|const|import|export|use[A-Z]|div|span|className)/.test(limpo)) {
        achados.add(limpo);
      }
    }
  }
  // atributos acessiveis
  for (const m of txt.matchAll(/(?:aria-label|title)="([^"]{3,48})"/g)) achados.add(`· ${m[1]}`);
  return [...achados].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const alvos = [
  'src/app/(app)/dashboard/page.tsx',
  'src/app/(app)/planner/page.tsx',
  'src/app/(app)/subjects/page.tsx',
  'src/app/(app)/analytics/page.tsx',
  'src/app/(app)/settings/page.tsx',
  'src/components/dashboard/TodayPlan.tsx',
  'src/components/subjects/PresetSelector.tsx',
  'src/components/onboarding/PresetConfigWizard.tsx',
  'src/components/session/StudyBlockSessionModal.tsx',
  'src/components/session/QuickSessionModal.tsx',
  'src/components/settings/SystemNotificationsCard.tsx',
];

for (const rel of alvos) {
  try {
    const txt = readFileSync(join(RAIZ, rel), 'utf8');
    const linhas = txt.split('\n').length;
    console.log(`\n===== ${rel}  (${linhas} linhas) =====`);
    for (const t of textos(txt)) console.log('   ' + t);
  } catch {
    console.log(`\n===== ${rel}  (nao encontrado) =====`);
  }
}
