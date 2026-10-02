/**
 * POST /api/auth/2fa/setup
 * Inicia o setup do 2FA: gera secret, retorna QR Code URI e secret legível.
 * O secret ainda NÃO é salvo — só é confirmado após verificação em /confirm.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateTotpSecret, getTotpUri, encryptSecret } from '@/lib/totp';
import QRCode from 'qrcode';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, twoFactorEnabled: true },
  });

  if (!user) {
    return NextResponse.json({ message: 'Usuário não encontrado.' }, { status: 404 });
  }

  if (user.twoFactorEnabled) {
    return NextResponse.json({ message: '2FA já está ativado.' }, { status: 400 });
  }

  const secret = generateTotpSecret();
  const uri = getTotpUri(secret, user.email);
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  // Armazena o secret pendente (criptografado) em um campo temporário
  // — só é efetivado quando o usuário confirmar com o primeiro código válido.
  await prisma.user.update({
    where: { id: session.user.id },
    data: { twoFactorSecret: encryptSecret(secret) },
  });

  return NextResponse.json({
    qrCode: qrCodeDataUrl,
    secret,  // exibido como fallback manual para quem não consegue ler QR
    message: 'Escaneie o QR Code com seu app autenticador e confirme com o código gerado.',
  });
}
