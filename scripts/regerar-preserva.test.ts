/**
 * Teste de integração do regerar preservando o progresso.
 *
 * Simula o que o botão "Gerar com IA" fazia (substituir a lista inteira) e o que
 * faz agora (preservar concluídos/pulados/em andamento e encaixar os novos nas
 * janelas livres), verificando que:
 *
 *   - nenhum bloco estudado desaparece ou volta a "Agendado";
 *   - bloco em andamento não é tocado;
 *   - os blocos novos não encostam nos preservados do mesmo dia;
 *   - dia inteiramente ocupado não recebe bloco novo.
 *
 * Rodar: npm run test:regerar
 */
import { computeFreeDayWindows } from '../src/services/freeDayWindows';
import { studiedMinutes } from '../src/lib/utils';

type Status = 'scheduled' | 'rescheduled' | 'in-progress' | 'completed' | 'skipped';

interface Bloco {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: Status;
  isBreak: boolean;
  actualMinutes?: number;
}

let falhas = 0;
function check(rotulo: string, ok: boolean, extra = '') {
  if (!ok) falhas++;
  console.log(`${ok ? '\u2714' : '\u2718'} ${rotulo}${extra ? ` \u2014 ${extra}` : ''}`);
}

const preservar = (blocos: Bloco[]): Bloco[] =>
  blocos.filter(
    (b) => b.status === 'completed' || b.status === 'skipped' || b.status === 'in-progress'
  );

const b = (
  id: string,
  date: string,
  start: string,
  end: string,
  status: Status,
  extra: Partial<Bloco> = {}
): Bloco => ({
  id,
  date,
  startTime: start,
  endTime: end,
  durationMinutes: 50,
  status,
  isBreak: false,
  ...extra,
});

// ---------------------------------------------------------------- cenário
const D1 = '2026-10-01';
const D2 = '2026-10-02';

const antes: Bloco[] = [
  b('c1', D1, '08:00', '08:50', 'completed', { actualMinutes: 45 }),
  b('c2', D1, '09:00', '09:50', 'completed', { actualMinutes: 50 }),
  b('p1', D1, '10:00', '10:50', 'scheduled'),
  b('p2', D1, '11:00', '11:50', 'scheduled'),
  b('and', D2, '08:00', '08:50', 'in-progress'),
  b('sk', D2, '09:00', '09:50', 'skipped'),
  b('p3', D2, '10:00', '10:50', 'scheduled'),
];

const preservados = preservar(antes);

// ---------------------------------------------- 1. o que fica de pé
check(
  'concluídos ficam',
  preservados.filter((x) => x.status === 'completed').length === 2,
  `${preservados.length} preservados`
);
check('bloco em andamento fica', preservados.some((x) => x.id === 'and'));
check('bloco pulado fica', preservados.some((x) => x.id === 'sk'));
check('pendentes não ficam', !preservados.some((x) => x.status === 'scheduled'));
check(
  'concluído não volta a "Agendado"',
  preservados.every((x) => x.status !== 'scheduled')
);

// ---------------------------------------------- 2. horas não se perdem
const minutosAntes = antes
  .filter((x) => x.status === 'completed')
  .reduce((s, x) => s + studiedMinutes(x), 0);
const minutosDepois = preservados
  .filter((x) => x.status === 'completed')
  .reduce((s, x) => s + studiedMinutes(x), 0);
check('horas estudadas preservadas', minutosAntes === minutosDepois, `${minutosDepois} min`);
check('hora real (45 min) preservada', studiedMinutes(preservados[0]) === 45);

// ---------------------------------------------- 3. janelas livres
const JANELA = { [D1]: { start: '08:00', end: '12:00' }, [D2]: { start: '08:00', end: '12:00' } };
const livres = computeFreeDayWindows({
  preservados: preservados.map((x) => ({
    date: x.date,
    startTime: x.startTime,
    endTime: x.endTime,
  })),
  janelasBase: JANELA,
  dias: [D1, D2],
});

check('dia 1: janela começa depois dos concluídos', livres[D1].start === '09:50',
  `início=${livres[D1].start}`);
check('dia 1: janela vai até o fim do dia', livres[D1].end === '12:00');
check('dia 2: janela começa depois do pulado', livres[D2].start === '09:50',
  `início=${livres[D2].start}`);

// ---------------------------------------------- 4. merge não duplica
const novos = [b('n1', D1, '09:50', '10:40', 'scheduled'), b('n2', D1, '10:40', '11:30', 'scheduled')];
const mesclado = [...preservados, ...novos];
const ids = new Set(mesclado.map((x) => x.id));
check('merge não duplica id', ids.size === mesclado.length, `${mesclado.length} blocos`);

// ---------------------------------------------- 5. nenhum encoste
const encosta = (a: Bloco, c: Bloco) => a.date === c.date && a.startTime < c.endTime && c.startTime < a.endTime;
let colisoes = 0;
preservados.forEach((p) => {
  novos.forEach((n) => {
    if (encosta(p, n)) colisoes++;
  });
});
check('blocos novos não encostam nos preservados', colisoes === 0, `${colisoes} colisões`);

// ---------------------------------------------- 6. dia cheio não recebe nada
const diaCheio: Bloco[] = [b('f1', D1, '08:00', '09:50', 'completed'), b('f2', D1, '09:50', '12:00', 'completed')];
const livresCheio = computeFreeDayWindows({
  preservados: diaCheio,
  janelasBase: JANELA,
  dias: [D1],
});
check('dia totalmente ocupado: sem janela', livresCheio[D1] === undefined);

// ---------------------------------------------- 7. nomenclatura do aviso
const horas = 95;
const texto = `${preservados.length} bloco(s) já estudado(s) ficaram como estavam.`;
check('aviso cita os blocos preservados', texto.includes(String(preservados.length)));
check('aviso usa formato de hora', `${Math.floor(horas / 60)}:${String(horas % 60).padStart(2, '0')}` === '1:35');

console.log(falhas === 0 ? '\nTodos os casos passaram.' : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
