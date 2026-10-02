/**
 * POST /api/auth/2fa/disable
 * Desativa o 2FA — exige confirmação do código atual para segurança.
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
    return NextResponse.json({ message: '2FA não está ativado.' }, { status: 400 });
  }

  const valid = verifyTotpToken(token, user.twoFactorSecret);
  if (!valid) {
    return NextResponse.json(
      { message: 'Código incorreto. Verifique seu app autenticador.' },
      { status: 422 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  return NextResponse.json({ success: true, message: '2FA desativado com sucesso.' });
}
