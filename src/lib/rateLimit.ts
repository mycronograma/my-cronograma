import { NextResponse } from 'next/server';

/**
 * Rate limiting em memória (sliding window) para endpoints de autenticação.
 *
 * ⚠️ Escopo: o estado vive no processo. Em serverless com várias instâncias o
 * limite é "por instância" (best effort) — ainda assim corta brute force de um
 * mesmo atacante em uma instância quente. Para garantia global, plugue um
 * backend compartilhado (Upstash/Redis) trocando a implementação de
 * `consumeRateLimit` — a assinatura e os call sites não mudam.
 */

export interface RateLimitOptions {
  /** Quantidade de tentativas permitidas na janela. */
  limit: number;
  /** Janela deslizante em ms. */
  windowMs: number;
  /**
   * Penalidade opcional: ao estourar o limite, o `key` fica bloqueado por esse
   * tempo mesmo que a janela já tenha passado (útil contra força bruta).
   */
  blockMs?: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  blocked: boolean;
}

interface Bucket {
  hits: number[];
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

const prune = (bucket: Bucket, now: number, windowMs: number) => {
  const cutoff = now - windowMs;
  while (bucket.hits.length > 0 && bucket.hits[0] <= cutoff) bucket.hits.shift();
};

/** Remove entradas ociosas para o mapa não crescer indefinidamente. */
const sweep = (now: number) => {
  if (buckets.size < MAX_BUCKETS) return;

  buckets.forEach((bucket, key) => {
    if (bucket.hits.length === 0 && bucket.blockedUntil <= now) buckets.delete(key);
  });

  if (buckets.size >= MAX_BUCKETS) {
    // Ainda cheio: descarta as chaves mais antigas (ordem de inserção).
    const keys = Array.from(buckets.keys());
    const excess = keys.length - MAX_BUCKETS + 1;
    keys.slice(0, Math.max(excess, 0)).forEach((key) => buckets.delete(key));
  }
};

export function consumeRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const { limit, windowMs, blockMs = 0 } = options;
  const now = Date.now();

  sweep(now);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [], blockedUntil: 0 };
    buckets.set(key, bucket);
  }

  prune(bucket, now, windowMs);

  if (bucket.blockedUntil > now) {
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
      blocked: true,
    };
  }

  bucket.hits.push(now);

  if (bucket.hits.length > limit) {
    if (blockMs > 0) {
      bucket.blockedUntil = now + blockMs;
      bucket.hits = [];
      return {
        ok: false,
        limit,
        remaining: 0,
        retryAfterSeconds: Math.ceil(blockMs / 1000),
        blocked: true,
      };
    }
    const oldest = bucket.hits[0] ?? now;
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      blocked: false,
    };
  }

  return {
    ok: true,
    limit,
    remaining: Math.max(0, limit - bucket.hits.length),
    retryAfterSeconds: 0,
    blocked: false,
  };
}

/** Zera o contador de uma chave (ex.: após validação bem-sucedida). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Remove todas as chaves que começam com um prefixo. */
export function resetRateLimitPrefix(prefix: string): void {
  for (const key of Array.from(buckets.keys())) {
    if (key.startsWith(prefix)) buckets.delete(key);
  }
}

/** Testes: limpa todo o estado. */
export function __resetAllRateLimits(): void {
  buckets.clear();
}

const normalizeIp = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const vercelIp = request.headers.get('x-vercel-forwarded-for');
  if (vercelIp) return vercelIp.trim();
  return 'local';
};

/**
 * Chave estável por origem da requisição: IP + escopo (+ identificador extra,
 * normalmente o e-mail). Usar IP e e-mail juntos evita que um atacante
 * bloqueie a vítima só por bater no endpoint com o e-mail dela.
 */
export function ipFromRequest(request: Request): string {
  return normalizeIp(request);
}

/** Monta a chave a partir de um IP já resolvido (ex.: handlers do NextAuth). */
export function clientKey(scope: string, ip: string, extra?: string): string {
  return extra ? `${scope}:${ip}:${extra}` : `${scope}:${ip}`;
}

export function clientKeyFromRequest(request: Request, scope: string, extra?: string): string {
  return clientKey(scope, normalizeIp(request), extra);
}

/** Chave por e-mail independentemente do IP (para limites de código/token). */
export function emailKey(scope: string, email: string): string {
  return `${scope}:email:${email.trim().toLowerCase()}`;
}

export function rateLimitResponse(
  result: RateLimitResult,
  message = 'Muitas tentativas. Aguarde um momento e tente novamente.'
): NextResponse {
  return NextResponse.json(
    { message, retryAfterSeconds: result.retryAfterSeconds },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'RateLimit-Limit': String(result.limit),
        'RateLimit-Remaining': String(result.remaining),
      },
    }
  );
}

/** Limites padrão usados pelos fluxos de autenticação. */
export const AUTH_RATE_LIMITS = {
  register: { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  verificationCode: { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  resendCode: { limit: 3, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  passwordResetRequest: { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  passwordResetConfirm: { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  login: { limit: 8, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 },
} as const satisfies Record<string, RateLimitOptions>;
