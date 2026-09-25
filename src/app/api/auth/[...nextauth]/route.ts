import NextAuth from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import {
  AUTH_RATE_LIMITS,
  clientKeyFromRequest,
  consumeRateLimit,
} from '@/lib/rateLimit';

const handler = NextAuth(authOptions);

const CREDENTIALS_PATH = 'callback/credentials';

export async function GET(
  request: NextRequest,
  context: { params: { nextauth: string[] } }
) {
  return handler(request as never, context as never);
}

export async function POST(
  request: NextRequest,
  context: { params: { nextauth: string[] } }
) {
  const segments = context.params.nextauth ?? [];
  const isCredentialsCallback = segments.join('/') === CREDENTIALS_PATH;

  if (!isCredentialsCallback) {
    return handler(request as never, context as never);
  }

  // Rate limit de login: antes não havia nenhum, permitindo força bruta
  // ilimitada de senha por e-mail.
  const body = await request
    .clone()
    .formData()
    .catch(() => null);
  const email = String(body?.get('email') ?? '')
    .trim()
    .toLowerCase();

  const limit = consumeRateLimit(
    clientKeyFromRequest(request, 'login', email || 'unknown'),
    AUTH_RATE_LIMITS.login
  );

  if (!limit.ok) {
    // Mantém o contrato JSON que o client do next-auth espera com
    // redirect:false, para a tela de login mapear a mensagem correta.
    return NextResponse.json({
      url: `/login?error=RateLimited&retryAfter=${limit.retryAfterSeconds}`,
    });
  }

  return handler(request as never, context as never);
}
