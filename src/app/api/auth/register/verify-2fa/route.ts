import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  REGISTER_2FA_MAX_ATTEMPTS,
  buildRegister2FAIdentifier,
  hashRegister2FACode,
} from '@/lib/register-2fa';
import {
  AUTH_RATE_LIMITS,
  emailKey,
  consumeRateLimit,
  rateLimitResponse,
  resetRateLimit,
} from '@/lib/rateLimit';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const codeRegex = /^\d{6}$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';

    if (!emailRegex.test(email) || !codeRegex.test(code)) {
      return NextResponse.json({ message: 'Código inválido.' }, { status: 400 });
    }

    // Código de 6 dígitos: sem teto de tentativas dá para brute-forcear
    // dentro dos 10 minutos de validade. Ao estourar o limite o e-mail fica
    // bloqueado por 30 minutos, mesmo que a janela já tenha passado.
    const attemptKey = emailKey('register-2fa', email);
    const limit = consumeRateLimit(attemptKey, {
      ...AUTH_RATE_LIMITS.verificationCode,
      limit: REGISTER_2FA_MAX_ATTEMPTS,
    });
    if (!limit.ok) {
      return rateLimitResponse(
        limit,
        'Muitas tentativas de código. Aguarde e solicite um novo código.'
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ message: 'Código inválido.' }, { status: 400 });
    }

    const identifier = buildRegister2FAIdentifier(email);
    const hashedCode = hashRegister2FACode(code);

    const verificationToken = await prisma.verificationToken.findUnique({
      where: {
        identifier_token: {
          identifier,
          token: hashedCode,
        },
      },
      select: {
        expires: true,
      },
    });

    if (!verificationToken) {
      return NextResponse.json({ message: 'Código inválido.' }, { status: 400 });
    }

    if (verificationToken.expires.getTime() < Date.now()) {
      await prisma.verificationToken.deleteMany({
        where: { identifier },
      });
      return NextResponse.json(
        { message: 'Código expirado. Solicite um novo código.' },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { email },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.deleteMany({
        where: { identifier },
      }),
    ]);

    resetRateLimit(attemptKey);

    return NextResponse.json({ success: true, message: 'Codigo validado com sucesso.' });
  } catch (error) {
    console.error('Erro ao validar 2FA de cadastro:', error);
    return NextResponse.json(
      { message: 'Não foi possível validar o código agora.' },
      { status: 500 }
    );
  }
}
