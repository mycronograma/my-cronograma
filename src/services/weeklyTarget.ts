/**
 * Divisão organizada da carga semanal entre as matérias (#15/#20).
 *
 * Regra única, sem modo manual. A meta de cada matéria é:
 *
 *     capacidade × peso² / Σ peso²
 *
 * A soma sempre fecha exatamente na carga semanal, e mudar o peso de uma
 * matéria tira horas das outras — nada fica "fixado".
 *
 * Por que o modo manual acabou: ele mostrava dois números diferentes para a
 * mesma matéria (a meta fixada e "o automático daria"), e o automático era só a
 * sobra da semana depois das metas já fixadas. Quando todas estavam fixadas,
 * essa sobra ficava tão pequena que o peso deixava de importar — peso 8 e peso
 * 10 davam o mesmo resultado. Funções puras — nada de React aqui.
 */

export interface WeeklyTargetItem {
  id: string;
  priority: number;
  difficulty: number;
  /** Meta já escolhida pela pessoa. Quando existe, é preservada como está. */
  fixedHours?: number | null;
}

export interface WeeklyTargetOptions {
  /** Carga semanal disponível, em horas. */
  capacityHours: number;
  /** Nenhuma matéria recebe menos que isso. Padrão 0h30. */
  floorHours?: number;
  /** Nenhuma matéria recebe mais que esta fração da capacidade. Padrão 60%. */
  capRatio?: number;
  /** Arredondamento em minutos. Padrão 5. */
  roundToMinutes?: number;
}

export interface WeeklyTargetResult {
  /** Meta semanal de cada matéria, em horas (id → horas). */
  byId: Record<string, number>;
  /** Soma de todas as metas. */
  totalHours: number;
  /** Horas que sobraram sem dono (capacidade − soma). */
  unallocatedHours: number;
  /** true quando a soma das metas passa da capacidade disponível. */
  overCapacity: boolean;
  /** Horas que faltariam para a semana comportar todas as metas. */
  overflowHours: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Peso de uma matéria: prioridade pesa mais que dificuldade. 0.1 .. 1 */
export function subjectWeight(priority: number, difficulty: number): number {
  const p = clamp(Math.round(priority), 1, 10);
  const d = clamp(Math.round(difficulty), 1, 10);
  return (0.6 * p + 0.4 * d) / 10;
}

/**
 * Peso com curva de destaque: eleva ao quadrado, então quem está no topo se
 * separa de verdade. Peso 10 rende 4x as horas de peso 5 (era 2x), e peso 10
 * rende ~1.8x as horas de peso 7 (era ~1.4x).
 */
export function effectiveWeight(priority: number, difficulty: number): number {
  const w = subjectWeight(priority, difficulty);
  return w * w;
}

const roundTo = (hours: number, minutes: number): number => {
  const step = minutes / 60;
  return Math.round(hours / step) * step;
};

/** Meta semanal das matérias, dividindo a carga disponível. */
export function allocateWeeklyTargets(
  items: WeeklyTargetItem[],
  options: WeeklyTargetOptions
): WeeklyTargetResult {
  const floor = Math.max(0, options.floorHours ?? 0.5);
  const capRatio = options.capRatio ?? 0.6;
  const stepMinutes = Math.max(1, options.roundToMinutes ?? 5);
  const capacity = Math.max(0, options.capacityHours);

  const byId: Record<string, number> = {};
  const fixed = items.filter((i) => typeof i.fixedHours === 'number' && (i.fixedHours as number) > 0);
  const auto = items.filter((i) => !fixed.includes(i));

  let fixedSum = 0;
  for (const item of fixed) {
    byId[item.id] = item.fixedHours as number;
    fixedSum += item.fixedHours as number;
  }

  if (auto.length === 0) {
    return finish(byId, capacity);
  }

  // Sem carga sobrando, todo mundo fica no piso — a pessoa precisa rever as
  // metas fixas ou aumentar a disponibilidade (o aviso vem na tela).
  const pool = Math.max(0, capacity - fixedSum);
  if (pool <= 0) {
    for (const item of auto) byId[item.id] = floor;
    return finish(byId, capacity);
  }

  const ceiling = Math.max(floor, capacity * capRatio);

  // 1) Divisão proporcional ao peso, com piso e teto.
  const hours = new Map<string, number>();
  const weightOf = (item: WeeklyTargetItem) => effectiveWeight(item.priority, item.difficulty);
  const weightSum = auto.reduce((sum, i) => sum + weightOf(i), 0);
  if (weightSum <= 0) {
    // Nenhum peso utilizável (não deveria acontecer: peso mínimo é 0.01):
    // divide igual o que sobrou.
    const equal = pool / auto.length;
    for (const item of auto) hours.set(item.id, Math.max(floor, equal));
  } else {
    for (const item of auto) {
      const raw = (pool * weightOf(item)) / weightSum;
      hours.set(item.id, clamp(raw, floor, ceiling));
    }
  }

  // 2) Ajuste: o piso pode ter feito a soma passar do que sobrou, e o teto pode
  //    ter deixado horas sem dono. Várias passadas, sempre movendo só quem
  //    ainda tem espaço entre o piso e o teto.
  for (let pass = 0; pass < 40; pass++) {
    const sum = auto.reduce((total, item) => total + (hours.get(item.id) as number), 0);
    const delta = pool - sum;
    if (Math.abs(delta) < 1 / 120) break; // menos de 30 segundos de diferença

    const adjustable = auto.filter((item) => {
      const value = hours.get(item.id) as number;
      return delta > 0 ? value < ceiling - 1e-9 : value > floor + 1e-9;
    });
    if (adjustable.length === 0) break;

    // Sobra → quem tem mais peso recebe mais; falta → quem tem mais margem
    // acima do piso cede mais.
    const pull = (item: WeeklyTargetItem) =>
      delta > 0 ? weightOf(item) : ((hours.get(item.id) as number) - floor) * weightOf(item);
    const pullSum = adjustable.reduce((sum, item) => sum + pull(item), 0);
    if (pullSum <= 0) break;

    for (const item of adjustable) {
      const share = (delta * pull(item)) / pullSum;
      hours.set(item.id, clamp((hours.get(item.id) as number) + share, floor, ceiling));
    }
  }

  for (const item of auto) byId[item.id] = roundTo(hours.get(item.id) as number, stepMinutes);

  // O arredondamento para minutos pode deixar a soma alguns minutos fora do
  // que sobrou; a diferença vai para a matéria automática de maior peso que
  // ainda tenha espaço entre o piso e o teto.
  const target = pool + fixedSum;
  let drift = target - Object.values(byId).reduce((sum, v) => sum + v, 0);
  if (Math.abs(drift) > 0.001) {
    const candidates = auto
      .slice()
      .sort((a, b) => weightOf(b) - weightOf(a))
      .filter((item) => {
        const next = byId[item.id] + drift;
        return next >= floor - 1e-9 && next <= ceiling + 1e-9;
      });
    for (const item of candidates) {
      if (Math.abs(drift) < 0.001) break;
      const applied = clamp(byId[item.id] + drift, floor, ceiling);
      drift -= applied - byId[item.id];
      byId[item.id] = roundTo(applied, stepMinutes);
    }
  }

  return finish(byId, capacity);
}

function finish(byId: Record<string, number>, capacity: number): WeeklyTargetResult {
  const totalHours = Object.values(byId).reduce((sum, v) => sum + v, 0);
  return {
    byId,
    totalHours,
    unallocatedHours: Math.max(0, capacity - totalHours),
    overCapacity: totalHours > capacity + 0.001,
    overflowHours: Math.max(0, totalHours - capacity),
  };
}

/**
 * Meta automática de UMA matéria, no contexto das outras.
 * `peers` são as demais matérias (com meta fixa, quando tiverem).
 */
export function computeAutoTargetHours(params: {
  priority: number;
  difficulty: number;
  weeklyAvailableHours?: number;
  /** Compat: soma dos pesos das outras matérias (usada só sem `peers`). */
  peerWeightSum?: number;
  /** As outras matérias, para reservar o que já está fixado. */
  peers?: WeeklyTargetItem[];
}): number {
  const capacity =
    params.weeklyAvailableHours && params.weeklyAvailableHours > 0 ? params.weeklyAvailableHours : 20;

  const id = '__self__';
  const self: WeeklyTargetItem = { id, priority: params.priority, difficulty: params.difficulty };
  const items: WeeklyTargetItem[] = [self];

  if (params.peers && params.peers.length > 0) {
    items.push(...params.peers);
  } else if (params.peerWeightSum && params.peerWeightSum > 0) {
    // Sem detalhe das outras matérias: aproxima por um peso médio. Mantém o
    // comportamento antigo para chamadores que só sabem a soma.
    const weight = subjectWeight(params.priority, params.difficulty);
    const total = weight + params.peerWeightSum;
    const share = total > 0 ? weight / total : 1;
    return roundTo(clamp(capacity * share, 0.5, 40), 5);
  }

  return allocateWeeklyTargets(items, { capacityHours: capacity }).byId[id] ?? 0.5;
}

/**
 * Converte as outras matérias no formato do serviço.
 *
 * Só é considerada "fixa" (e por isso reserva horas da semana) a meta que a
 * pessoa escolheu de propósito, marcada em `targetHoursIsManual`. Antes a regra
 * era "difere do automático", o que fazia quase toda meta parecer fixa: a
 * semana inteira ficava reservada e as matérias automáticas não recebiam nada.
 */
/**
 * Converte as outras matérias no formato do serviço.
 *
 * Nenhuma matéria é marcada como fixa: existe uma regra só e todas passam
 * por ela. `targetHours`/`targetHoursIsManual` continuam aceitos por
 * compatibilidade com quem chama, mas são ignorados — deixar de reservar
 * horas foi o que fez o peso voltar a importar.
 */
export function buildPeerItems(
  peers: Array<{
    id: string;
    priority: number;
    difficulty: number;
    targetHours?: number | null;
    targetHoursIsManual?: boolean;
  }>,
  excludeId?: string
): WeeklyTargetItem[] {
  return peers
    .filter((peer) => peer.id !== excludeId)
    .map((peer) => ({
      id: peer.id,
      priority: peer.priority,
      difficulty: peer.difficulty,
      fixedHours: null,
    }));
}

/**
 * Metas de TODAS as matérias pela regra única. É o que a tela chama depois
 * de criar, editar ou remover uma matéria — e quando a carga semanal muda em
 * Ajustes — para o número gravado nunca divergir da regra.
 */
export function recalculateAllTargets(
  subjects: Array<{ id: string; priority: number; difficulty: number }>,
  capacityHours: number
): Record<string, number> {
  return allocateWeeklyTargets(subjects, { capacityHours }).byId;
}

/**
 * Números para a tela explicar *por que* a meta automática é o que é, em vez
 * de mostrar um número que parece ter caído do nada.
 */
export function describeAutoTarget(params: {
  priority: number;
  difficulty: number;
  weeklyAvailableHours?: number;
  peers?: WeeklyTargetItem[];
}): {
  hours: number;
  capacityHours: number;
  /** Horas já reservadas pelas metas fixas das outras matérias. */
  reservedHours: number;
  /** Horas realmente em jogo para as matérias automáticas. */
  poolHours: number;
  /** Quantas matérias automáticas dividem esse resto (incluindo esta). */
  autoCount: number;
  /** Peso desta matéria (1..10). */
  weight: number;
  /** Soma dos pesos das outras matérias automáticas. */
  peerWeightSum: number;
  /** Fatia desta matéria sobre a carga em jogo, em % (0..100). */
  sharePercent: number;
} {
  const capacityHours =
    params.weeklyAvailableHours && params.weeklyAvailableHours > 0 ? params.weeklyAvailableHours : 20;
  const peers = params.peers ?? [];
  const reservedHours = peers.reduce(
    (sum, p) => sum + (typeof p.fixedHours === 'number' && p.fixedHours > 0 ? p.fixedHours : 0),
    0
  );
  const autoPeers = peers.filter((p) => !(typeof p.fixedHours === 'number' && p.fixedHours > 0));
  const weight = subjectWeight(params.priority, params.difficulty);
  const peerWeightSum = autoPeers.reduce(
    (sum, p) => sum + effectiveWeight(p.priority, p.difficulty),
    0
  );
  const weightTotal = effectiveWeight(params.priority, params.difficulty) + peerWeightSum;
  const poolHours = Math.max(0, capacityHours - reservedHours);
  return {
    hours: computeAutoTargetHours({
      priority: params.priority,
      difficulty: params.difficulty,
      weeklyAvailableHours: capacityHours,
      peers,
    }),
    capacityHours,
    reservedHours,
    poolHours,
    autoCount: autoPeers.length + 1,
    weight,
    peerWeightSum,
    sharePercent: weightTotal > 0 ? (effectiveWeight(params.priority, params.difficulty) / weightTotal) * 100 : 100,
  };
}
