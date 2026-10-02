/**
 * POST /api/auth/2fa/verify
 * Verificação do código 2FA durante o login.
 * Chamado após o login por credenciais quando o usuário tem 2FA ativo.
 * Armazena um cookie de sessão 2FA verificada (válido 12h).
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyTotpToken } from '@/lib/totp';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token.trim() : '';

  if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
    return NextResponse.json({ message: 'Código inválido. Informe 6 dígitos.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    // 2FA não está ativo — retorna sucesso para não bloquear o fluxo
    return NextResponse.json({ success: true });
  }

  const valid = verifyTotpToken(token, user.twoFactorSecret);
  if (!valid) {
    return NextResponse.json(
      { message: 'Código incorreto. Verifique seu app autenticador e tente novamente.' },
      { status: 422 }
    );
  }

  const response = NextResponse.json({ success: true });
  // Cookie HttpOnly que indica que o 2FA foi verificado nesta sessão (12h)
  response.cookies.set('nexora_2fa_verified', session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12,
    path: '/',
  });

  return response;
}
