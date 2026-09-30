"""Lote 3: remove da conta os itens 59 (2FA no cadastro), 60 (recuperar senha
por e-mail) e 61 (redefinir senha). O cadastro passa a entrar direto no app,
como ja acontece no modo demo local.
"""
import os
import re
import shutil
import subprocess
import sys

RAIZ = "/home/user/my-cronograma/"
P = "src/app/register/page.tsx"
LOGIN = "src/app/login/page.tsx"

APAGAR = [
    "src/app/api/auth/register/verify-2fa/route.ts",
    "src/app/api/auth/register/resend-2fa/route.ts",
    "src/app/api/auth/password-reset/request/route.ts",
    "src/app/api/auth/password-reset/confirm/route.ts",
    "src/app/forgot-password/page.tsx",
    "src/app/reset-password/page.tsx",
    "src/lib/password-reset.ts",
    "src/lib/register-2fa.ts",
]


def ler(p):
    return open(RAIZ + p, encoding="utf-8").read()


def gravar(p, s):
    open(RAIZ + p, "w", encoding="utf-8").write(s)


def bloco_original(rel, ini, fim, rotulo):
    orig = subprocess.run(["git", "show", "HEAD:" + rel], capture_output=True, text=True, cwd=RAIZ).stdout
    i = orig.find(ini)
    j = orig.find(fim, i + 1) if i >= 0 else -1
    if i < 0 or j < 0:
        print(f"FALHA {rotulo}: bloco no original"); sys.exit(1)
    return orig[i:j]


# ------------------------------------------------- 1. register: so o formulario
form = bloco_original(P, "          <form onSubmit={handleSubmit} className=\"space-y-4\">", "          </form>", "form do registro")

novo = """'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, User, Mail, Lock, ArrowRight } from 'lucide-react';
import { getSession, signIn } from 'next-auth/react';
import { Button } from '@/components/ui';
import {
  isLocalDemoAuthEnabled,
  isValidDemoEmail,
  startLocalDemoSession,
} from '@/lib/localDemoAuth';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const navigateToDashboard = (targetUrl: string) => {
    if (typeof window !== 'undefined') {
      window.location.assign(targetUrl);
      return;
    }

    router.replace(targetUrl);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (errorMessage) setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const normalizedName = formData.name.trim();
    const normalizedEmail = formData.email.trim().toLowerCase();

    if (normalizedName.length < 2) {
      setErrorMessage('Informe um nome com pelo menos 2 caracteres.');
      return;
    }

    if (!isValidDemoEmail(normalizedEmail)) {
      setErrorMessage('Informe um e-mail valido.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('As senhas não conferem.');
      return;
    }

    if (formData.password.length < 8) {
      setErrorMessage('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      if (isLocalDemoAuthEnabled) {
        startLocalDemoSession({ email: normalizedEmail, name: normalizedName });
        navigateToDashboard('/dashboard');
        return;
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          email: normalizedEmail,
          password: formData.password,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrorMessage(payload?.message || 'Não foi possível criar sua conta.');
        return;
      }

      // Sem 2FA: a conta criada entra direto no app.
      const result = await signIn('credentials', {
        email: normalizedEmail,
        password: formData.password,
        callbackUrl: '/dashboard',
        redirect: false,
      });

      if (result?.error) {
        setErrorMessage('Conta criada. Faca login para continuar.');
        router.replace('/login');
        return;
      }

      const activeSession = await getSession();
      if (!activeSession?.user) {
        router.replace('/login');
        return;
      }

      navigateToDashboard('/dashboard');
    } catch {
      setErrorMessage('Não foi possível criar sua conta agora.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-center gap-2 mb-8">
          </div>
          <span className="text-2xl font-heading font-bold gradient-text">Nexora</span>
        </div>

        <div className="glass-card p-6 sm:p-8">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-heading font-bold text-white">Criar conta</h1>
            <p className="mt-1 text-text-secondary">Nome, e-mail e senha para começar</p>
          </div>

{FORM}

          <p className="mt-5 text-center text-sm text-text-secondary">
            Ja tem conta?{' '}
            <Link href="/login" className="text-neon-blue hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
"""

novo = novo.replace("{FORM}", form.rstrip("\n"))
gravar(P, novo)
print(f"ok register reescrito ({len(novo.splitlines())} linhas)")

# --------------------------------------------- 2. login: sem "esqueci a senha"
s = ler(LOGIN)
i = s.find('Esqueci minha senha')
if i >= 0:
    ini = s.rfind("<Link", 0, i)
    fim = s.find("</Link>", i) + len("</Link>")
    bloco_link = s[ini:fim]
    s = s[:ini] + s[fim:]
    # remove a quebra de linha dupla que sobra
    s = s.replace("\n\n\n", "\n\n")
    gravar(LOGIN, s)
    print("ok login: link de recuperacao de senha removido")
else:
    print("AVISO: link 'Esqueci minha senha' nao encontrado")

# ------------------------------------------------------ 3. apagar arquivos
for rel in APAGAR:
    alvo = RAIZ + rel
    if os.path.exists(alvo):
        os.remove(alvo)
        print(f"apagado {rel}")
    else:
        print(f"AVISO: {rel} nao existia")

# limpar pastas que ficaram vazias
for d in [
    "src/app/api/auth/password-reset",
    "src/app/api/auth/register/verify-2fa",
    "src/app/api/auth/register/resend-2fa",
    "src/app/forgot-password",
    "src/app/reset-password",
]:
    caminho = RAIZ + d
    if os.path.isdir(caminho) and not os.listdir(caminho):
        os.rmdir(caminho)
        print(f"pasta vazia removida: {d}")

# ---------------------------------------- 4. rota de registro sem 2FA
ROTA = "src/app/api/auth/register/route.ts"
novo_rota = '''import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import {
  AUTH_RATE_LIMITS,
  clientKeyFromRequest,
  consumeRateLimit,
  rateLimitResponse,
} from '@/lib/rateLimit';

const MIN_NAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;
const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

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

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'Este e-mail já está cadastrado.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { name, email, passwordHash },
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
'''
gravar(ROTA, novo_rota)
print("ok rota de registro reescrita sem 2FA")

# ------------------------------------------------ 5. registros pendentes
for rel in ["src/lib/env.ts", "src/lib/mail.ts", "src/lib/rateLimit.ts"]:
    try:
        s = ler(rel)
    except FileNotFoundError:
        continue
    usos = len(re.findall(r"\bemailServer\b|\bemailFrom\b", s))
    print(f"{rel}: {usos} mencoes a emailServer/emailFrom")

print("\nLOTE 3 aplicado.")
