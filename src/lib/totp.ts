/**
 * TOTP (Time-based One-Time Password) utilities
 * Uses otplib — compatible with Google Authenticator, Authy, etc.
 */

import { authenticator } from 'otplib';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// ─── Configuração do TOTP ──────────────────────────────────────────────────
authenticator.options = {
  window: 1,   // aceita 1 código anterior/posterior (tolerância de 30s)
  digits: 6,
  step: 30,
};

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Nexora';

// ─── Criptografia do secret em repouso ────────────────────────────────────
// O NEXTAUTH_SECRET é usado como chave de criptografia — assim o secret do
// TOTP nunca fica em texto puro no banco.
function getDerivedKey(): Buffer {
  const master = process.env.NEXTAUTH_SECRET || 'nexora-local-fallback-key';
  return scryptSync(master, 'nexora-totp-salt', 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted secret format');
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ─── Funções públicas ──────────────────────────────────────────────────────

/** Gera um novo secret TOTP para o usuário. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

/**
 * Retorna a URI otpauth:// para ser encodada no QR Code.
 * O app autenticador (Google Authenticator, Authy) lê essa URI.
 */
export function getTotpUri(secret: string, userEmail: string): string {
  return authenticator.keyuri(userEmail, APP_NAME, secret);
}

/** Verifica se o token informado pelo usuário é válido. */
export function verifyTotpToken(token: string, encryptedSecret: string): boolean {
  try {
    const secret = decryptSecret(encryptedSecret);
    return authenticator.verify({ token: token.replace(/\s/g, ''), secret });
  } catch {
    return false;
  }
}
