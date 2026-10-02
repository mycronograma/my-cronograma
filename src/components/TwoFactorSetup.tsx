'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldCheck, ShieldX, QrCode, KeyRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';

interface TwoFactorSetupProps {
  isEnabled: boolean;
  onStatusChange?: (enabled: boolean) => void;
}

type Step = 'idle' | 'qr' | 'confirm' | 'disable' | 'success';

export function TwoFactorSetup({ isEnabled, onStatusChange }: TwoFactorSetupProps) {
  const [step, setStep] = useState<Step>('idle');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetState = () => {
    setStep('idle');
    setQrCode('');
    setSecret('');
    setToken('');
    setError('');
  };

  const handleSetup = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Erro ao iniciar configuração.'); return; }
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep('qr');
    } catch {
      setError('Falha ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (token.length !== 6) { setError('Digite os 6 dígitos do código.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/2fa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Código inválido.'); return; }
      setStep('success');
      onStatusChange?.(true);
    } catch {
      setError('Falha ao confirmar código.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (token.length !== 6) { setError('Digite os 6 dígitos do código.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Código inválido.'); return; }
      resetState();
      onStatusChange?.(false);
    } catch {
      setError('Falha ao desativar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        {isEnabled && step !== 'success' ? (
          <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
        ) : (
          <Shield className="w-6 h-6 text-neon-blue shrink-0" />
        )}
        <div>
          <h3 className="font-semibold text-white text-sm">Autenticação em dois fatores (2FA)</h3>
          <p className="text-text-muted text-xs mt-0.5">
            {isEnabled && step !== 'success'
              ? 'Ativo — seu login exige o código do app autenticador.'
              : 'Adicione uma camada extra de segurança à sua conta.'}
          </p>
        </div>
        <span
          className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
            isEnabled && step !== 'success'
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-white/5 text-text-muted'
          }`}
        >
          {isEnabled && step !== 'success' ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Estado idle ── */}
        {step === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {isEnabled ? (
              <Button
                variant="secondary"
                className="w-full text-sm"
                onClick={() => setStep('disable')}
                leftIcon={<ShieldX className="w-4 h-4" />}
              >
                Desativar 2FA
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full text-sm"
                onClick={handleSetup}
                loading={loading}
                leftIcon={!loading ? <QrCode className="w-4 h-4" /> : undefined}
              >
                Ativar 2FA
              </Button>
            )}
          </motion.div>
        )}

        {/* ── QR Code para escanear ── */}
        {step === 'qr' && (
          <motion.div key="qr" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <p className="text-text-secondary text-sm">
              Escaneie o QR Code com <strong className="text-white">Google Authenticator</strong>, <strong className="text-white">Authy</strong> ou qualquer app TOTP:
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="QR Code 2FA" className="w-48 h-48 rounded-xl bg-white p-2" />
            </div>
            <details className="group">
              <summary className="text-xs text-text-muted cursor-pointer hover:text-white transition-colors">
                Não consegue escanear? Inserir código manual
              </summary>
              <code className="mt-2 block bg-background/60 rounded-lg p-3 text-xs font-mono text-neon-blue break-all select-all">
                {secret}
              </code>
            </details>
            <Button variant="primary" className="w-full text-sm" onClick={() => { setStep('confirm'); setToken(''); setError(''); }}>
              Já escaniei — confirmar código
            </Button>
            <button onClick={resetState} className="w-full text-xs text-text-muted hover:text-white transition-colors">
              Cancelar
            </button>
          </motion.div>
        )}

        {/* ── Confirmação do primeiro código ── */}
        {step === 'confirm' && (
          <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <p className="text-text-secondary text-sm">
              Digite o código de <strong className="text-white">6 dígitos</strong> do seu app autenticador para confirmar:
            </p>
            <TokenInput value={token} onChange={setToken} disabled={loading} />
            {error && <ErrorMsg msg={error} />}
            <Button variant="primary" className="w-full text-sm" onClick={handleConfirm} loading={loading} leftIcon={!loading ? <KeyRound className="w-4 h-4" /> : undefined}>
              Confirmar e ativar
            </Button>
            <button onClick={() => setStep('qr')} className="w-full text-xs text-text-muted hover:text-white transition-colors">
              ← Voltar ao QR Code
            </button>
          </motion.div>
        )}

        {/* ── Desativar 2FA ── */}
        {step === 'disable' && (
          <motion.div key="disable" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <p className="text-text-secondary text-sm">
              Para desativar, confirme com o código atual do seu app autenticador:
            </p>
            <TokenInput value={token} onChange={setToken} disabled={loading} />
            {error && <ErrorMsg msg={error} />}
            <Button variant="secondary" className="w-full text-sm border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={handleDisable} loading={loading} leftIcon={!loading ? <ShieldX className="w-4 h-4" /> : undefined}>
              Desativar 2FA
            </Button>
            <button onClick={resetState} className="w-full text-xs text-text-muted hover:text-white transition-colors">
              Cancelar
            </button>
          </motion.div>
        )}

        {/* ── Sucesso ── */}
        {step === 'success' && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-white font-medium text-sm">2FA ativado com sucesso!</p>
            <p className="text-text-muted text-xs max-w-xs">
              A partir do próximo login, você precisará do código do app autenticador.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────

function TokenInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="\d{6}"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      disabled={disabled}
      className="input-field text-center text-2xl font-mono tracking-[0.5em] w-full"
      autoComplete="one-time-code"
      autoFocus
    />
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {msg}
    </div>
  );
}
