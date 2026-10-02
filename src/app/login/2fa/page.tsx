'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldCheck, KeyRound, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Página intermediária mostrada após o login bem-sucedido
 * quando o usuário tem 2FA ativo.
 *
 * Fluxo: /login → auth OK → /login/2fa?callbackUrl=/dashboard
 */
export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-submit quando 6 dígitos forem digitados
  useEffect(() => {
    if (token.length === 6) handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleVerify = async () => {
    if (token.length !== 6 || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Código incorreto.');
        setToken('');
        return;
      }
      // Sucesso — redireciona para o destino original
      window.location.assign(callbackUrl);
    } catch {
      setError('Falha ao verificar. Tente novamente.');
      setToken('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-heading font-bold gradient-text">Nexora</span>
        </div>

        <div className="glass-card p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-neon-blue/10 border border-neon-blue/20 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-neon-blue" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-white">Verificação em dois fatores</h1>
            <p className="text-text-secondary text-sm">
              Abra seu app autenticador e digite o código de 6 dígitos:
            </p>
          </div>

          {/* Input */}
          <div className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={token}
              onChange={(e) => {
                setError('');
                setToken(e.target.value.replace(/\D/g, '').slice(0, 6));
              }}
              placeholder="000000"
              disabled={loading}
              className="input-field text-center text-3xl font-mono tracking-[0.6em] w-full py-4"
              autoComplete="one-time-code"
              autoFocus
            />

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            <Button
              variant="primary"
              className="w-full"
              onClick={handleVerify}
              disabled={token.length !== 6 || loading}
              loading={loading}
              leftIcon={!loading ? <KeyRound className="w-4 h-4" /> : undefined}
            >
              {loading ? 'Verificando...' : 'Verificar'}
            </Button>
          </div>

          <p className="text-center text-xs text-text-muted">
            Perdeu o acesso ao seu app autenticador?{' '}
            <a href="mailto:suporte@nexora.com.br" className="text-neon-blue hover:underline">
              Contate o suporte
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
