import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import {
  AUTH_RATE_LIMITS,
  clientKeyFromRequest,
  consumeRateLimit,
  rateLimitResponse,
} from '@/lib/rateLimit';
import {
  SIGNUPS_DISABLED_MESSAGE,
  SIGNUPS_DISABLED_STATUS,
  signupsEnabled,
} from '@/lib/signups';

const MIN_NAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (name.length < MIN_NAME_LENGTH) {
      return NextResponse.json(
        { message: 'Informe um nome com pelo menos 2 caracteres.' },
        { status: 400 }
      );
    }

    if (!emailRegex.test(email)) {
      return NextResponse.json({ message: 'Informe um e-mail valido.' }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { message: 'A senha deve ter no mínimo 8 caracteres.' },
        { status: 400 }
      );
    }

    const limit = await consumeRateLimit(clientKeyFromRequest(request, 'register', email), AUTH_RATE_LIMITS.register);
    if (!limit.ok) {
      return rateLimitResponse(limit);
    }

    // Cadastros fechados: recusa aqui, depois do rate limit, para a rota
    // nao poder ser martelada de graca e para nao entregar dica de quais
    // e-mails ja existem na base.
    if (!signupsEnabled()) {
      return NextResponse.json(
        { message: SIGNUPS_DISABLED_MESSAGE, signupsDisabled: true },
        { status: SIGNUPS_DISABLED_STATUS }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'Este e-mail já está cadastrado.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    // Nao ha etapa de e-mail: a conta nasce verificada. Sem isso o login por
    // credenciais recusa com "EmailNotVerified" (src/lib/auth.ts).
    const user = await prisma.user.create({
      data: { name, email, passwordHash, emailVerified: new Date() },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json(
      { success: true, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao registrar usuario:', error);
    return NextResponse.json(
      { message: 'Não foi possível criar sua conta agora.' },
      { status: 500 }
    );
  }
}
