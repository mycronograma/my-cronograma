import { defaultSettings } from '@/lib/defaultSettings';
import type { UserSettings } from '@/types';

export const isLocalDemoAuthEnabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true';

export const LOCAL_DEMO_EMAIL = 'teste@nexora.local';
export const LOCAL_DEMO_PASSWORD = 'teste1234';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidDemoEmail = (email: string) => EMAIL_PATTERN.test(email.trim());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readStoredSettings = (): Partial<UserSettings> | null => {
  if (typeof window === 'undefined') return null;

  try {
    const rawSettings = window.localStorage.getItem('nexora_user_settings');
    const parsed = rawSettings ? JSON.parse(rawSettings) : null;
    return isRecord(parsed) ? (parsed as Partial<UserSettings>) : null;
  } catch {
    return null;
  }
};

export const getDemoNameFromEmail = (email: string) => {
  const rawName = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!rawName) return defaultSettings.name;

  return rawName
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const startLocalDemoSession = ({
  email,
  name,
}: {
  email: string;
  name?: string;
}) => {
  if (typeof window === 'undefined') return;

  const normalizedEmail = email.trim().toLowerCase();
  const storedSettings = readStoredSettings();
  const storedName = typeof storedSettings?.name === 'string' ? storedSettings.name.trim() : '';
  const providedName = name?.trim();
  const demoName =
    providedName ||
    (storedName && storedName !== defaultSettings.name ? storedName : getDemoNameFromEmail(normalizedEmail));

  const nextSettings: UserSettings = {
    ...defaultSettings,
    ...(storedSettings || {}),
    name: demoName || defaultSettings.name,
    email: normalizedEmail,
  };

  try {
    window.localStorage.setItem('nexora_demo_session', 'true');
    window.localStorage.setItem(
      'nexora_demo_user',
      JSON.stringify({ email: normalizedEmail, name: nextSettings.name })
    );
    window.localStorage.setItem('nexora_user_settings', JSON.stringify(nextSettings));
  } catch {
    // Iframe com origem opaca (sandbox rígido) pode bloquear localStorage;
    // o modo demo continua funcional via estado do layout.
  }
};

export const clearLocalDemoSession = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem('nexora_demo_session');
    window.localStorage.removeItem('nexora_demo_user');
  } catch {
    // Sem localStorage disponível: nada a limpar.
  }
};
