import React, { useState, useEffect } from 'react';
import { Building2, Save, Loader2, Check, AlertCircle } from 'lucide-react';

export default function BancoInter({ token }: { token: string }) {
  const [interSettings, setInterSettings] = useState({
    interClientId: '',
    interClientSecret: '',
    interContaCorrente: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data) {
          setInterSettings({
            interClientId: data.interClientId || '',
            interClientSecret: data.interClientSecret || '',
            interContaCorrente: data.interContaCorrente || ''
          });
        }
      })
      .catch(console.error);
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(interSettings)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess('Configurações do Banco Inter salvas com sucesso!');
      } else {
        setError(data.error || 'Erro ao salvar configurações');
      }
    } catch (err) {
      setError('Erro de conexão ao servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#FF7A00]/10 flex items-center justify-center text-[#FF7A00]">
          <Building2 size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-brand-text">Banco Inter</h2>
          <p className="text-sm text-brand-muted mt-1">Configuração da API de Cobrança</p>
        </div>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-dim mb-1.5">Client ID</label>
              <input
                type="text"
                value={interSettings.interClientId}
                onChange={e => setInterSettings({...interSettings, interClientId: e.target.value})}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-[#FF7A00] transition-colors"
                placeholder="Insira o Client ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dim mb-1.5">Client Secret</label>
              <input
                type="password"
                value={interSettings.interClientSecret}
                onChange={e => setInterSettings({...interSettings, interClientSecret: e.target.value})}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-[#FF7A00] transition-colors"
                placeholder="Insira o Client Secret"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dim mb-1.5">Conta Corrente</label>
              <input
                type="text"
                value={interSettings.interContaCorrente}
                onChange={e => setInterSettings({...interSettings, interContaCorrente: e.target.value})}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-[#FF7A00] transition-colors"
                placeholder="Ex: 1234567-8"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-3 rounded-lg text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-brand-green bg-brand-green/10 p-3 rounded-lg text-sm">
              <Check size={16} />
              {success}
            </div>
          )}

          <div className="pt-4 border-t border-brand-border">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {loading ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
