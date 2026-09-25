import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { env, hasGoogleAuth } from '@/lib/env';

const providers = [] as NextAuthOptions['providers'];

providers.push(
  CredentialsProvider({
    name: 'Email e senha',
    credentials: {
      email: { label: 'E-mail', type: 'email' },
      password: { label: 'Senha', type: 'password' },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password ?? '';

      if (!email || !password) return null;

      let user;
      try {
        user = await prisma.user.findUnique({
          where: { email },
        });
      } catch (error) {
        console.error('Erro ao consultar usuario para login:', error);
        throw new Error('Configuration');
      }

      if (!user) return null;
      if (!user.passwordHash) {
        throw new Error('OAuthAccountNotLinked');
      }
      if (!user.emailVerified) {
        throw new Error('EmailNotVerified');
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image || user.avatar || null,
      };
    },
  })
);

if (hasGoogleAuth) {
  providers.push(
    GoogleProvider({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      // Permite vincular automaticamente a conta Google a uma conta existente
      // com o mesmo e-mail (ex.: cadastro prévio por e-mail/senha).
      allowDangerousEmailAccountLinking: true,
      // FIX #9: o escopo padrão do next-auth não inclui "openid", o que faz o
      // Google retornar id_token=null → adapter Prisma tenta criar Account com
      // providerAccountId nulo e o login social quebra.
      authorization: {
        params: { scope: 'openid email profile' },
      },
    })
  );
}

/**
 * Sessões JWT são stateless: excluir a conta não invalida o cookie. Sem esta
 * checagem, um usuário que apagou a conta continuava com `session.user.id`
 * válido e as rotas de API (progresso, preferências, sessões) seguiam gravando
 * dados órfãos. O resultado fica em cache curto para não consultar o banco em
 * toda requisição.
 */
const USER_EXISTS_TTL_MS = 30_000;
const userExistsCache = new Map<string, { at: number; exists: boolean }>();

async function userStillExists(userId: string): Promise<boolean> {
  const cached = userExistsCache.get(userId);
  if (cached && Date.now() - cached.at < USER_EXISTS_TTL_MS) return cached.exists;

  try {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    const exists = Boolean(row);
    userExistsCache.set(userId, { at: Date.now(), exists });
    return exists;
  } catch (error) {
    // Banco indisponível não deve deslogar todo mundo: mantém a sessão.
    console.warn('Falha ao verificar existência do usuário na sessão:', error);
    return true;
  }
}

/** Invalida o cache imediatamente (usado ao excluir a conta). */
export function invalidateUserSessionCache(userId: string): void {
  userExistsCache.delete(userId);
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: env.nextAuthSecret || undefined,
  session: {
    strategy: 'jwt',
  },
  providers,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    /**
     * Login social: (a) exige e-mail verificado no Google; (b) saneia a conta
     * local antes do linking automático feito por
     * `allowDangerousEmailAccountLinking`. Se já existe conta local com o mesmo
     * e-mail e ela NÃO estava verificada, alguém pode tê-la criado com o e-mail
     * da vítima e senha própria — o Google acabou de provar a posse do e-mail,
     * então marcamos como verificada e apagamos a senha local, que deixa de
     * funcionar. Contas já verificadas não são alteradas.
     */
    signIn: async ({ user, account, profile }) => {
      if (account?.provider !== 'google') return true;

      const googleProfile = profile as { email_verified?: boolean } | undefined;
      if (googleProfile && googleProfile.email_verified === false) {
        return false;
      }

      const email = user?.email?.trim().toLowerCase();
      if (!email) return true;

      try {
        const existing = await prisma.user.findFirst({
          where: { email },
          select: { id: true, emailVerified: true },
        });
        if (!existing || existing.emailVerified) return true;

        const alreadyLinked = await prisma.account.findFirst({
          where: { userId: existing.id, provider: 'google' },
          select: { id: true },
        });
        if (alreadyLinked) return true;

        await prisma.user.update({
          where: { id: existing.id },
          data: { emailVerified: new Date(), passwordHash: null },
        });
      } catch (error) {
        // Não bloquear o login social por falha no saneamento.
        console.error('Erro ao sanear conta local antes do linking do Google:', error);
      }

      return true;
    },
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      return token;
    },
    session: async ({ session, token, user }) => {
      const sessionUserId = user?.id ?? (typeof token?.sub === 'string' ? token.sub : undefined);

      if (sessionUserId && !(await userStillExists(sessionUserId))) {
        // Conta excluída: devolve sessão sem usuário → o layout redireciona para
        // /login e as rotas de API respondem 401.
        return { ...session, user: undefined } as unknown as typeof session;
      }

      if (session.user) {
        session.user.id = sessionUserId || '';
        session.user.name = session.user.name || token?.name || user?.name || '';
        session.user.email = session.user.email || token?.email || user?.email || '';
        session.user.image =
          session.user.image || (typeof token?.picture === 'string' ? token.picture : null) || user?.image || undefined;
      }
      return session;
    },
  },
};
