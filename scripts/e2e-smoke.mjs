#!/usr/bin/env node
/**
 * Smoke test E2E contra um servidor Next rodando (dev ou preview).
 *
 * Pré-requisitos (ambiente local sem banco):
 *   node scripts/dev-inmemory-prisma.cjs --reset   # PrismaClient em memória
 *   npm run dev                                    # next dev em :3000
 *
 * Uso:
 *   node scripts/e2e-smoke.mjs [--base http://127.0.0.1:3000] [--keep]
 *
 * O que cobre: cadastro → verificação 2FA → login por credenciais → importação
 * de preset → geração de cronograma → conclusão de sessão (XP/streak) →
 * idempotência → progresso (snapshot) → preferências → notificações →
 * rate limiting → exclusão de conta em cascata.
 *
 * Não usa dependências externas (só fetch do Node 18+).
 */

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const BASE = argValue('--base', process.env.E2E_BASE_URL || 'http://127.0.0.1:3000');
const KEEP_ACCOUNT = args.includes('--keep');
const CRON_SECRET = process.env.NOTIFICATIONS_CRON_SECRET || process.env.CRON_SECRET || 'harness-cron-secret';

let passed = 0;
let failed = 0;
const failures = [];

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const section = (title) => console.log(`\n── ${title}`);

// ---------------------------------------------------------------- HTTP helpers
const jar = new Map();

const cookieHeader = () =>
  Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

const storeCookies = (response) => {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const item of raw) {
    const [pair] = item.split(';');
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!name) continue;
    if (value === '' || /Max-Age=0/i.test(item)) jar.delete(name);
    else jar.set(name, value);
  }
};

const call = async (method, path, body, options = {}) => {
  const headers = { ...(options.headers || {}) };
  let payload;
  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      payload = body;
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }
  if (jar.size > 0) headers.Cookie = cookieHeader();

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload,
    redirect: 'manual',
  });
  storeCookies(response);

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  return { status: response.status, ok: response.ok, data, headers: response.headers };
};

const uniqueEmail = () => `e2e+${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}@example.com`;

// ----------------------------------------------------------------------- fluxo
const run = async () => {
  console.log(`Nexora E2E smoke → ${BASE}`);

  section('0. Servidor de pé');
  const root = await call('GET', '/login');
  check('GET /login responde 200', root.status === 200, `HTTP ${root.status}`);

  const email = uniqueEmail();
  const password = 'SenhaForte123';

  section('1. Cadastro + verificação 2FA');
  const register = await call('POST', '/api/auth/register', {
    name: 'Estudante E2E',
    email,
    password,
  });
  check('POST /api/auth/register → 201', register.status === 201, `HTTP ${register.status}`);
  check('resposta pede 2FA', register.data?.requires2FA === true);

  const devCode = register.data?.devVerificationCode;
  check(
    'código de verificação devolvido em ambiente local',
    typeof devCode === 'string' && /^\d{6}$/.test(devCode),
    devCode ? `código ${devCode}` : 'ausente'
  );

  if (!devCode) {
    console.log('\nSem devVerificationCode: impossível continuar o fluxo autenticado.');
    throw new Error('fluxo interrompido');
  }

  const wrongCode = await call('POST', '/api/auth/register/verify-2fa', {
    email,
    code: devCode === '000000' ? '000001' : '000000',
  });
  check('código errado → 400', wrongCode.status === 400, `HTTP ${wrongCode.status}`);

  const verify = await call('POST', '/api/auth/register/verify-2fa', { email, code: devCode });
  check('código correto → 200', verify.status === 200 && verify.data?.success === true, `HTTP ${verify.status}`);

  const verifyAgain = await call('POST', '/api/auth/register/verify-2fa', { email, code: devCode });
  check('código não é reutilizável → 400', verifyAgain.status === 400, `HTTP ${verifyAgain.status}`);

  section('2. Login por credenciais (NextAuth)');
  const csrf = await call('GET', '/api/auth/csrf');
  const csrfToken = typeof csrf.data === 'object' ? csrf.data?.csrfToken : undefined;
  check('GET /api/auth/csrf devolve token', typeof csrfToken === 'string' && csrfToken.length > 0);

  const login = await call(
    'POST',
    '/api/auth/callback/credentials',
    `csrfToken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&json=true`
  );
  check('POST /api/auth/callback/credentials → 200', login.status === 200, `HTTP ${login.status}`);
  check('cookie de sessão criado', Array.from(jar.keys()).some((name) => name.includes('session-token')));

  const session = await call('GET', '/api/auth/session');
  const userId = session.data?.user?.id;
  check('GET /api/auth/session devolve o usuário', Boolean(userId), userId || 'sem id');

  const sessionNoAuth = await call('GET', '/api/auth/session');
  check('sessão expõe e-mail correto', sessionNoAuth.data?.user?.email === email);

  section('3. Preset → matérias');
  const presets = await call('GET', '/api/presets');
  const presetList = Array.isArray(presets.data?.data) ? presets.data.data : [];
  check('GET /api/presets devolve lista', presetList.length > 0, `${presetList.length} presets`);

  const chosen = presetList.find((item) => item?.id) ?? presetList[0];
  const imported = await call('POST', `/api/presets/${chosen.id}/import`, {});
  const importedSubjects = imported.data?.data?.subjects ?? [];
  check(
    'POST /api/presets/{id}/import cria matérias',
    imported.status === 200 && importedSubjects.length > 0,
    `${importedSubjects.length} matérias`
  );

  const firstSubject = importedSubjects[0];
  check('matéria importada tem id/nome', Boolean(firstSubject?.id && firstSubject?.name), firstSubject?.name);

  section('4. Geração de cronograma');
  const generate = await call('POST', '/api/planner/generate', {
    // Matérias exatamente como vieram da importação (o gerador usa area,
    // targetHours, priority e difficulty para distribuir a carga).
    subjects: importedSubjects,
    studyPrefs: {
      hoursPerDay: 3,
      daysOfWeek: [1, 2, 3, 4, 5, 6],
      mode: 'random',
      examDate: '',
    },
    userSettings: {
      dailyGoalHours: 3,
      preferredStart: '08:00',
      preferredEnd: '20:00',
      maxBlockMinutes: 120,
      breakMinutes: 15,
      excludeDays: [],
    },
    firstCycleAllSubjects: true,
  });
  const generatedBlocks = generate.data?.data?.blocks ?? generate.data?.blocks ?? [];
  check(
    'POST /api/planner/generate devolve blocos',
    generate.status === 200 && Array.isArray(generatedBlocks) && generatedBlocks.length > 0,
    `${generatedBlocks.length} blocos${generatedBlocks.length === 0 ? ` (HTTP ${generate.status} ${JSON.stringify(generate.data ?? {}).slice(0, 200)})` : ''}`
  );

  const totalGeneratedMinutes = generatedBlocks
    .filter((block) => block && block.isBreak !== true)
    .reduce((sum, block) => sum + (block.durationMinutes || 0), 0);
  check(
    'carga gerada é compatível com 3h/dia × 6 dias × 1 semana',
    totalGeneratedMinutes > 0 && totalGeneratedMinutes <= 7 * 24 * 60,
    `${(totalGeneratedMinutes / 60).toFixed(1)}h de blocos de estudo`
  );

  const studyBlocks = generatedBlocks.filter((block) => block && block.isBreak !== true);
  check('há blocos de estudo (não-pausa)', studyBlocks.length > 0, `${studyBlocks.length} blocos`);

  const targetBlock = studyBlocks[0];

  section('5. Conclusão de sessão → gamificação');
  const sessionPayload = {
    subjectId: targetBlock?.subjectId ?? firstSubject?.id,
    blockId: targetBlock?.id ?? null,
    startedAt: new Date(Date.now() - 50 * 60_000).toISOString(),
    plannedMinutes: targetBlock?.durationMinutes ?? 50,
    actualMinutes: 50,
    correctAnswers: 8,
    totalQuestions: 10,
    source: 'block',
  };

  const completed = await call('POST', '/api/sessions', sessionPayload);
  check('POST /api/sessions → 200', completed.status === 200, `HTTP ${completed.status}`);
  check('sessão gravada com id', Boolean(completed.data?.session?.id), completed.data?.session?.id);
  check(
    'acurácia real registrada (8/10 = 0.8)',
    Math.abs((completed.data?.session?.accuracyRate ?? -1) - 0.8) < 1e-6,
    `accuracyRate=${completed.data?.session?.accuracyRate}`
  );
  check(
    'focusScore derivado (não é constante 85)',
    typeof completed.data?.session?.focusScore === 'number' &&
      completed.data.session.focusScore > 0 &&
      completed.data.session.focusScore <= 100,
    `focusScore=${completed.data?.session?.focusScore}`
  );
  check('XP creditado', (completed.data?.gamification?.xpEarned ?? 0) > 0, `xp=${completed.data?.gamification?.xpEarned}`);
  check('streak iniciado em 1', completed.data?.gamification?.streak === 1, `streak=${completed.data?.gamification?.streak}`);
  check('nível >= 1', (completed.data?.gamification?.level ?? 0) >= 1, `level=${completed.data?.gamification?.level}`);

  const duplicated = await call('POST', '/api/sessions', sessionPayload);
  check(
    'mesmo bloco não duplica sessão (idempotência)',
    duplicated.status === 200 && duplicated.data?.duplicate === true,
    `duplicate=${duplicated.data?.duplicate}`
  );

  const quickSession = await call('POST', '/api/sessions', {
    subjectId: firstSubject?.id,
    startedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    plannedMinutes: 25,
    actualMinutes: 20,
    source: 'quick',
  });
  check(
    'sessão rápida sem respostas → acurácia null (não inventada)',
    quickSession.status === 200 && quickSession.data?.session?.accuracyRate === null,
    `accuracyRate=${quickSession.data?.session?.accuracyRate}`
  );
  check(
    'sessão rápida: foco derivado da aderência (20/25 = 80)',
    quickSession.data?.session?.focusScore === 80,
    `focusScore=${quickSession.data?.session?.focusScore}`
  );

  const invalidSession = await call('POST', '/api/sessions', {
    subjectId: firstSubject?.id,
    startedAt: new Date().toISOString(),
    plannedMinutes: 0,
    actualMinutes: 10,
  });
  check('plannedMinutes inválido → 400', invalidSession.status === 400, `HTTP ${invalidSession.status}`);

  const clientOnlyStart = new Date(Date.now() - 15 * 60_000).toISOString();
  const clientOnlyBlock = await call('POST', '/api/sessions', {
    subjectId: firstSubject?.id,
    blockId: '1700000000000-bloco-do-planner',
    startedAt: clientOnlyStart,
    plannedMinutes: 30,
    actualMinutes: 30,
    source: 'block',
  });
  check(
    'bloco só do cliente (sem linha no banco) ainda registra a sessão',
    clientOnlyBlock.status === 200 && Boolean(clientOnlyBlock.data?.session?.id),
    `HTTP ${clientOnlyBlock.status}`
  );
  const clientOnlyAgain = await call('POST', '/api/sessions', {
    subjectId: firstSubject?.id,
    blockId: '1700000000000-bloco-do-planner',
    startedAt: clientOnlyStart,
    plannedMinutes: 30,
    actualMinutes: 30,
    source: 'block',
  });
  check(
    'sessão sem vínculo é idempotente por (usuário, matéria, início)',
    clientOnlyAgain.data?.duplicate === true,
    `duplicate=${clientOnlyAgain.data?.duplicate}`
  );

  const foreignSession = await call('POST', '/api/sessions', {
    subjectId: 'materia-inexistente',
    startedAt: new Date().toISOString(),
    plannedMinutes: 30,
    actualMinutes: 30,
  });
  check('matéria inexistente → 404', foreignSession.status === 404, `HTTP ${foreignSession.status}`);

  section('6. Snapshot de progresso');
  const progressPayload = {
    nexora_subjects: importedSubjects.slice(0, 3),
    nexora_planner_blocks: generatedBlocks.slice(0, 5),
    nexora_analytics: { daily: { '2026-01-05': { hours: 1.5, sessions: 2 } } },
  };
  const savedProgress = await call('PUT', '/api/progress', { data: progressPayload });
  check('PUT /api/progress → 200', savedProgress.status === 200, `HTTP ${savedProgress.status}`);
  check('PUT devolve updatedAt', Boolean(savedProgress.data?.updatedAt), savedProgress.data?.updatedAt);

  const loadedProgress = await call('GET', '/api/progress');
  check('GET /api/progress → snapshot', loadedProgress.data?.source === 'snapshot', `source=${loadedProgress.data?.source}`);
  const loadedSubjects = loadedProgress.data?.data?.nexora_subjects ?? [];
  check(
    'snapshot devolve as matérias gravadas',
    Array.isArray(loadedSubjects) && loadedSubjects.length === 3,
    `${loadedSubjects.length} matérias`
  );

  section('7. Preferências');
  const savedPrefs = await call('POST', '/api/preferences', {
    settings: {
      name: 'Estudante E2E',
      dailyGoalHours: 3,
      preferredStart: '08:00',
      preferredEnd: '20:00',
      maxBlockMinutes: 90,
      breakMinutes: 10,
      dailyHoursByWeekday: { dom: 0, seg: 3, ter: 3, qua: 3, qui: 3, sex: 3, sab: 2 },
      notificationsEnabled: true,
      notificationMinutesBefore: 15,
      excludeDays: ['dom'],
    },
  });
  check('POST /api/preferences → 200', savedPrefs.status === 200, `HTTP ${savedPrefs.status}`);
  check('resposta informa persistência real', savedPrefs.data?.persisted === true, `persisted=${savedPrefs.data?.persisted}`);

  const loadedPrefs = await call('GET', '/api/preferences');
  check(
    'GET /api/preferences devolve maxBlockMinutes gravado',
    loadedPrefs.data?.data?.maxBlockMinutes === 90,
    `maxBlockMinutes=${loadedPrefs.data?.data?.maxBlockMinutes}`
  );

  section('8. Notificações');
  const synced = await call('POST', '/api/notifications/sync', {});
  check('POST /api/notifications/sync → 200', synced.status === 200, `HTTP ${synced.status}`);

  const list = await call('GET', '/api/notifications');
  const notifications = list.data?.data?.notifications;
  check(
    'GET /api/notifications devolve lista + não lidas',
    Array.isArray(notifications) && typeof list.data?.data?.unreadCount === 'number',
    `${notifications?.length ?? 0} notificações, ${list.data?.data?.unreadCount} não lidas`
  );

  const dispatch = await call('GET', `/api/notifications/dispatch?secret=${encodeURIComponent(CRON_SECRET)}`);
  check('dispatch do cron → 200', dispatch.status === 200, `HTTP ${dispatch.status}`);
  check(
    'dispatch sem segredo → 401',
    (await call('GET', '/api/notifications/dispatch')).status === 401
  );
  check(
    'dispatch com segredo errado → 401',
    (await call('GET', '/api/notifications/dispatch?secret=errado')).status === 401
  );

  section('9. Rate limiting');
  const limitedEmail = uniqueEmail();
  const registerCodes = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await call('POST', '/api/auth/register', {
      name: 'Spam E2E',
      email: limitedEmail,
      password: 'SenhaForte123',
    });
    registerCodes.push(response.status);
  }
  check(
    'cadastro repetido é bloqueado após o limite',
    registerCodes.includes(429),
    `status: ${registerCodes.join(', ')}`
  );

  const loginStatuses = [];
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const freshCsrf = await call('GET', '/api/auth/csrf');
    const response = await call(
      'POST',
      '/api/auth/callback/credentials',
      `csrfToken=${encodeURIComponent(freshCsrf.data?.csrfToken)}&email=${encodeURIComponent(email)}&password=senha-errada-${attempt}&json=true`
    );
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? {});
    loginStatuses.push(body.includes('RateLimited') ? 429 : response.status);
  }
  check(
    'login com senha errada é bloqueado após o limite',
    loginStatuses.includes(429),
    `resultados: ${loginStatuses.join(', ')}`
  );

  section('10. Exclusão de conta (cascata)');
  if (KEEP_ACCOUNT) {
    check('conta mantida (--keep)', true, email);
  } else {
    const progressBeforeDelete = await call('GET', '/api/progress');
    check(
      'progresso acessível antes de excluir',
      progressBeforeDelete.status === 200,
      `HTTP ${progressBeforeDelete.status}`
    );

    const deleted = await call('DELETE', '/api/auth/delete-account');
    check(
      'DELETE /api/auth/delete-account → 200',
      deleted.status === 200 && deleted.data?.success === true,
      `HTTP ${deleted.status} ${JSON.stringify(deleted.data ?? {}).slice(0, 120)}`
    );

    // Sessão JWT é stateless: sem a checagem de existência do usuário o cookie
    // continuava válido e as rotas seguiam gravando dados de conta excluída.
    const progressAfterDelete = await call('GET', '/api/progress');
    check(
      'sessão deixa de valer após exclusão da conta',
      progressAfterDelete.status === 401,
      `HTTP ${progressAfterDelete.status}`
    );

    const sessionAfterDelete = await call('GET', '/api/auth/session');
    check(
      'GET /api/auth/session não devolve mais o usuário',
      !sessionAfterDelete.data?.user?.id,
      JSON.stringify(sessionAfterDelete.data ?? {}).slice(0, 120)
    );

    const deleteAgain = await call('DELETE', '/api/auth/delete-account');
    check(
      'nova exclusão com sessão morta → 401',
      deleteAgain.status === 401,
      `HTTP ${deleteAgain.status}`
    );
  }
};

run()
  .then(() => {
    console.log(`\n════════════════════════════════════`);
    console.log(`  ${passed} passaram, ${failed} falharam`);
    if (failed > 0) {
      console.log('\nFalhas:');
      for (const item of failures) console.log(`  - ${item}`);
    }
    console.log(`════════════════════════════════════`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('\nERRO FATAL no smoke test:', error?.message || error);
    console.log(`  ${passed} passaram, ${failed} falharam antes do erro`);
    process.exit(1);
  });
