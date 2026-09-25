import crypto from 'crypto';
import { env } from '@/lib/env';

export const REGISTER_2FA_TTL_MS = 1000 * 60 * 10; // 10 minutes

/**
 * Limite de tentativas por código: 6 dígitos = 10^6 combinações em 10 minutos,
 * então sem teto de tentativas o código é brute-forceável. O controle fica em
 * `lib/rateLimit.ts` (ver `AUTH_RATE_LIMITS.verificationCode`).
 */
export const REGISTER_2FA_MAX_ATTEMPTS = 5;

export const buildRegister2FAIdentifier = (email: string) =>
  `register-2fa:${email.trim().toLowerCase()}`;

export const generateRegister2FACode = () =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

/**
 * HMAC-SHA256 com o segredo do servidor (antes era SHA-256 puro: para um código
 * de 6 dígitos o hash sem chave é trivialmente pré-computável por quem ler o
 * banco, e permite tentativa offline).
 */
export const hashRegister2FACode = (code: string) => {
  const key = env.nextAuthSecret || 'nexora-dev-fallback-key';
  return crypto.createHmac('sha256', key).update(`register-2fa:${code}`).digest('hex');
};
