import React, { useState } from 'react';
import { Lock, LogIn, Check } from 'lucide-react';

export default function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, remember })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (remember) {
          localStorage.setItem('vc_token', data.token);
        } else {
          sessionStorage.setItem('vc_token', data.token);
        }
        onLogin(data.token);
      } else {
        setError(data.error || 'Senha incorreta');
      }
    } catch (err) {
      setError('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-brand-surface border border-brand-border rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#1f2937] rounded-2xl border border-white/10 flex items-center justify-center text-brand-green shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-4">
            <Lock size={32} strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight text-center">Vírgula <span className="text-brand-green">Contábil</span></h1>
          <p className="text-brand-muted mt-2 text-sm text-center">Acesso restrito ao sistema de cobranças</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Senha de Acesso</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-brand-surface2 border border-brand-border rounded-xl px-4 py-3 text-brand-text outline-none focus:border-brand-green transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRemember(!remember)}
              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${remember ? 'bg-brand-green border-brand-green text-black' : 'border-brand-border bg-brand-surface2'}`}
            >
              {remember && <Check size={14} strokeWidth={3} />}
            </button>
            <span className="text-sm text-brand-muted cursor-pointer select-none" onClick={() => setRemember(!remember)}>
              Permanecer conectado
            </span>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-green hover:bg-brand-green-dim text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading ? 'Entrando...' : (
              <>
                <LogIn size={18} strokeWidth={2.5} />
                Entrar no Sistema
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
