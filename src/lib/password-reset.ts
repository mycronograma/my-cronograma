import crypto from 'crypto';
import { env } from '@/lib/env';

export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

export const generatePasswordResetToken = () =>
  crypto.randomBytes(32).toString('hex');

/**
 * HMAC-SHA256 com o segredo do servidor (antes era SHA-256 puro, o que permite
 * tentativa offline contra um dump do banco).
 */
export const hashPasswordResetToken = (token: string) => {
  const key = env.nextAuthSecret || 'nexora-dev-fallback-key';
  return crypto.createHmac('sha256', key).update(`password-reset:${token}`).digest('hex');
};

export const buildPasswordResetIdentifier = (email: string) =>
  `password-reset:${email.trim().toLowerCase()}`;
