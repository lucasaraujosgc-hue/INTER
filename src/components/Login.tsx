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
      <div className="w-full max-w-[420px]">
        <div className="virgula-marca bg-brand-forest rounded-t-[12px] px-8 pt-8 pb-7 text-white/75">
          <div className="relative">
            <div className="font-serif text-[38px] font-semibold leading-none tracking-[-0.02em] text-white">Vírgula<span className="text-brand-orange">,</span></div>
            <div className="text-[12px] font-bold tracking-[0.32em] uppercase text-brand-orange-light mt-2">Contábil</div>
            <p className="mt-5 text-[14px] leading-relaxed">Contabilidade e tributos, com atenção a cada detalhe. Acesso restrito ao sistema de cobranças e notas fiscais.</p>
          </div>
        </div>
        <div className="bg-white border border-t-0 border-brand-border rounded-b-[12px] p-8 shadow-brand-lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="senha" className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-forest mb-2"><Lock size={14} /> Senha de acesso</label>
              <input
                id="senha"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-white border border-brand-border2 rounded-md px-4 py-3 text-brand-text outline-none focus:border-brand-orange focus:ring-3 focus:ring-brand-orange/20 transition-colors"
                placeholder="••••••••"
                autoFocus
                required
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setRemember(!remember)}
                aria-pressed={remember}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${remember ? 'bg-brand-green border-brand-green text-white' : 'border-brand-border2 bg-white'}`}
              >
                {remember && <Check size={14} strokeWidth={3} />}
              </button>
              <span className="text-sm text-brand-muted" onClick={() => setRemember(!remember)}>Permanecer conectado</span>
            </label>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-orange hover:bg-brand-orange-dim text-white font-semibold py-3 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading ? 'Entrando...' : (<><LogIn size={18} strokeWidth={2.5} /> Entrar no sistema</>)}
            </button>
          </form>
          <a href="https://www.virgulacontabil.com.br" target="_blank" rel="noopener noreferrer" className="block text-center text-[12px] text-brand-muted hover:text-brand-orange-dim mt-6">www.virgulacontabil.com.br</a>
        </div>
      </div>
    </div>
  );
}
