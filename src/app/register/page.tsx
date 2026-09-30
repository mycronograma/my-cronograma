'use client';

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
import { SIGNUPS_DISABLED_MESSAGE, signupsEnabled } from '@/lib/signups';

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

  const cadastroAberto = signupsEnabled();

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
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-neon-blue to-neon-purple blur-lg opacity-40" />
          </div>
          <span className="text-2xl font-heading font-bold gradient-text">Nexora</span>
        </div>

        <div className="glass-card p-6 sm:p-8">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-heading font-bold text-white">
              {cadastroAberto ? 'Criar conta' : 'Cadastros fechados'}
            </h1>
            <p className="mt-1 text-text-secondary">
              {cadastroAberto
                ? 'Nome, e-mail e senha para começar'
                : 'O Nexora ainda não está aceitando novas contas'}
            </p>
          </div>

          {!cadastroAberto && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-100">{SIGNUPS_DISABLED_MESSAGE}</p>
              <p className="mt-2 text-xs text-amber-200/80">
                Quando as inscrições abrirem, o formulário volta aqui.
              </p>
            </div>
          )}

          {cadastroAberto && (
            <form onSubmit={handleSubmit} className="space-y-4">
                {isLocalDemoAuthEnabled && (
                  <div className="rounded-xl border border-neon-blue/30 bg-neon-blue/10 p-3 text-sm text-sky-100">
                    Modo teste local: o cadastro entra direto no app, sem banco e sem codigo 2FA.
                  </div>
                )}
                {errorMessage && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                    {errorMessage}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Nome</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Seu nome"
                      className="input-field pl-12"
                      minLength={2}
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="seu@email.com"
                      className="input-field pl-12"
                      required
                      autoComplete="email"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      placeholder="No mínimo 8 caracteres"
                      className="input-field pl-12"
                      minLength={8}
                      required
                      autoComplete="new-password"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Confirmar senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      placeholder="Repita sua senha"
                      className="input-field pl-12"
                      minLength={8}
                      required
                      autoComplete="new-password"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={isLoading}
                  rightIcon={!isLoading && <ArrowRight className="w-4 h-4" />}
                >
                  Criar conta
                </Button>
  

            </form>
          )}

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
