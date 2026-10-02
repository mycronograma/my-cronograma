/**
 * POST /api/auth/2fa/confirm
 * Confirma o setup do 2FA: verifica o código e ativa oficialmente.
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

  if (!user?.twoFactorSecret) {
    return NextResponse.json(
      { message: 'Inicie o setup do 2FA antes de confirmar.' },
      { status: 400 }
    );
  }

  if (user.twoFactorEnabled) {
    return NextResponse.json({ message: '2FA já está ativado.' }, { status: 400 });
  }

  const valid = verifyTotpToken(token, user.twoFactorSecret);
  if (!valid) {
    return NextResponse.json(
      { message: 'Código incorreto. Verifique seu app autenticador e tente novamente.' },
      { status: 422 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { twoFactorEnabled: true },
  });

  return NextResponse.json({ success: true, message: 'Autenticação em dois fatores ativada com sucesso!' });
}
