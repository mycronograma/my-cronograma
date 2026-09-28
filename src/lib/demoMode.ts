import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * O modo demo existe só para o preview em iframe bloquear cookies.
 * A regra é: demo APENAS quando não existe nenhum cookie de sessão.
 * Cookie presente mas inválido/expirado (ex.: conta excluída) NÃO é demo —
 * deve cair no caminho autenticado e responder 401, para não vazar snapshot
 * de outra pessoa nem mascarar sessão morta.
 */
export function demoModeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true';
}

export function hasSessionCookie(headers: Headers): boolean {
  const cookieHeader = headers.get('cookie') || '';
  if (!cookieHeader) return false;
  return cookieHeader
    .split(';')
    .some((part) => part.trim().startsWith('next-auth.session-token=') || part.trim().startsWith('__Secure-next-auth.session-token='));
}

/** Sessão resolvida já aplicando o gate de demo. */
export async function resolveRouteSession(headers: Headers) {
  const demo = demoModeEnabled() && !hasSessionCookie(headers);
  if (demo) return { demo: true as const, session: null };
  const session = await getServerSession(authOptions).catch(() => null);
  return { demo: false as const, session };
}

/** True quando a requisição deve ser tratada como preview sem cookies. */
export async function isDemoRequest(): Promise<boolean> {
  if (!demoModeEnabled()) return false;
  try {
    const { headers } = await import('next/headers');
    return !hasSessionCookie(headers());
  } catch {
    return false;
  }
}

export function unauthorized() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}
