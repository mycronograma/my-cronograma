/**
 * Leitura centralizada de variáveis de ambiente.
 *
 * Regra de segurança: em produção **não existe segredo padrão**. Antes, quando
 * `VERCEL_ENV !== 'production'` (ou seja, qualquer deploy que não seja Vercel:
 * self-host, Docker, Railway…), a ausência de `NEXTAUTH_SECRET` caía na
 * constante pública `'nexora-local-auth-secret'`, o que permitiria forjar
 * tokens de sessão. Agora o fallback só existe fora de produção e o
 * `CRON_SECRET` nunca é usado como segredo de autenticação.
 */

const isVercel = Boolean(process.env.VERCEL);
const isVercelProduction = process.env.VERCEL_ENV === 'production';
const isProduction = process.env.NODE_ENV === 'production' || isVercelProduction;
const allowLocalAuthFallback = !isProduction;

const trim = (value?: string | null) => (value ?? '').trim();

const nextAuthSecret =
  trim(process.env.NEXTAUTH_SECRET) || (allowLocalAuthFallback ? 'nexora-local-auth-secret' : '');

export const env = {
  isProduction,
  isVercel,
  databaseUrl: process.env.DATABASE_URL ?? '',
  nextAuthUrl: process.env.NEXTAUTH_URL ?? '',
  nextAuthSecret,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  emailServer: process.env.EMAIL_SERVER ?? '',
  emailFrom: process.env.EMAIL_FROM ?? '',
  vapidPublicKey: trim(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  vapidPrivateKey: trim(process.env.VAPID_PRIVATE_KEY),
  vapidSubject: trim(process.env.VAPID_SUBJECT),
  notificationsCronSecret: trim(process.env.NOTIFICATIONS_CRON_SECRET) || trim(process.env.CRON_SECRET),
};

export const hasGoogleAuth = Boolean(env.googleClientId && env.googleClientSecret);
export const hasEmailAuth = Boolean(env.emailServer && env.emailFrom);
export const hasWebPush = Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);

/**
 * Códigos de verificação só podem vazar na resposta em máquina de
 * desenvolvimento. `NODE_ENV !== 'production'` também é verdadeiro em
 * previews/staging, então exigimos explicitamente que não seja um deploy.
 */
export const canExposeDevVerificationCode = !isProduction && !isVercel;

export const missingAuthEnv = () => {
  const missing: string[] = [];
  if (!env.nextAuthUrl) missing.push('NEXTAUTH_URL');
  if (!env.nextAuthSecret) missing.push('NEXTAUTH_SECRET');
  if (!hasGoogleAuth) missing.push('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
  return missing;
};

/** Lança se não houver segredo de auth utilizável (usar em rotas sensíveis). */
export function assertAuthSecret(context: string): void {
  if (env.nextAuthSecret) return;
  throw new Error(
    `[env] NEXTAUTH_SECRET não configurado (${context}). ` +
      'Defina NEXTAUTH_SECRET no ambiente — em produção não há segredo padrão.'
  );
}

if (env.isProduction && !env.nextAuthSecret) {
  console.error(
    '[env] NEXTAUTH_SECRET ausente em produção: a autenticação vai falhar até a variável ser configurada.'
  );
} else if (!env.isProduction) {
  const missing = missingAuthEnv();
  if (missing.length > 0) {
    console.warn('[env] Missing auth env vars:', missing.join(', '));
  }
}
