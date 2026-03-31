import React, { useState, useEffect } from 'react';
import { Shield, Upload, Check, AlertCircle, Building2, Save } from 'lucide-react';

export default function Configuracoes({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [interSettings, setInterSettings] = useState({
    interClientId: '',
    interClientSecret: '',
    interContaCorrente: ''
  });
  const [interLoading, setInterLoading] = useState(false);
  const [interSuccess, setInterSuccess] = useState('');
  const [interError, setInterError] = useState('');

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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !password) {
      setError('Selecione o arquivo e informe a senha.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('pfxFile', file);
    formData.append('password', password);

    try {
      const res = await fetch('/api/cert/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(data.message);
        setFile(null);
        setPassword('');
      } else {
        setError(data.error || 'Erro ao importar certificado');
      }
    } catch (err) {
      setError('Erro de conexão ao servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInterSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setInterLoading(true);
    setInterError('');
    setInterSuccess('');

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
        setInterSuccess('Configurações do Banco Inter salvas com sucesso!');
      } else {
        setInterError(data.error || 'Erro ao salvar configurações');
      }
    } catch (err) {
      setInterError('Erro de conexão ao servidor');
    } finally {
      setInterLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-6">
      <div className="bg-brand-surface border border-brand-border rounded-xl p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brand-green/10 text-brand-green flex items-center justify-center">
            <Shield size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-text">Certificado Digital A1</h2>
            <p className="text-sm text-brand-muted">Importação de certificado .pfx para assinatura de NFS-e</p>
          </div>
        </div>

        <form onSubmit={handleUpload} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Arquivo .pfx</label>
            <div className="relative">
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="cert-upload"
              />
              <label
                htmlFor="cert-upload"
                className="flex items-center justify-center gap-2 w-full bg-brand-surface2 border border-dashed border-brand-border hover:border-brand-green rounded-xl px-4 py-8 text-brand-muted hover:text-brand-text cursor-pointer transition-colors"
              >
                <Upload size={20} />
                {file ? file.name : 'Clique para selecionar o certificado (.pfx)'}
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Senha do Certificado</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-brand-surface2 border border-brand-border rounded-xl px-4 py-3 text-brand-text outline-none focus:border-brand-green transition-colors"
              placeholder="Senha de instalação do PFX"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-brand-green/10 border border-brand-green/30 rounded-lg flex items-center gap-2 text-brand-green text-sm">
              <Check size={16} />
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !file || !password}
            className="bg-brand-green hover:bg-brand-green-dim text-black font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading ? 'Validando...' : 'Importar e Validar Certificado'}
          </button>
        </form>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#FF7A00]/10 text-[#FF7A00] flex items-center justify-center">
            <Building2 size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-text">Credenciais Banco Inter</h2>
            <p className="text-sm text-brand-muted">Configuração da API para emissão de boletos e Pix</p>
          </div>
        </div>

        <form onSubmit={handleSaveInterSettings} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Client ID</label>
            <input
              type="text"
              value={interSettings.interClientId}
              onChange={e => setInterSettings({...interSettings, interClientId: e.target.value})}
              className="w-full bg-brand-surface2 border border-brand-border rounded-xl px-4 py-3 text-brand-text outline-none focus:border-brand-green transition-colors font-mono text-sm"
              placeholder="Client ID da aplicação no Banco Inter"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Client Secret</label>
            <input
              type="password"
              value={interSettings.interClientSecret}
              onChange={e => setInterSettings({...interSettings, interClientSecret: e.target.value})}
              className="w-full bg-brand-surface2 border border-brand-border rounded-xl px-4 py-3 text-brand-text outline-none focus:border-brand-green transition-colors font-mono text-sm"
              placeholder="Client Secret da aplicação"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wide mb-2">Conta Corrente</label>
            <input
              type="text"
              value={interSettings.interContaCorrente}
              onChange={e => setInterSettings({...interSettings, interContaCorrente: e.target.value})}
              className="w-full bg-brand-surface2 border border-brand-border rounded-xl px-4 py-3 text-brand-text outline-none focus:border-brand-green transition-colors font-mono text-sm"
              placeholder="Ex: 123456789 (apenas números)"
            />
          </div>

          {interError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle size={16} />
              {interError}
            </div>
          )}

          {interSuccess && (
            <div className="p-3 bg-brand-green/10 border border-brand-green/30 rounded-lg flex items-center gap-2 text-brand-green text-sm">
              <Check size={16} />
              {interSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={interLoading}
            className="bg-brand-surface2 border border-brand-border hover:border-[#FF7A00] hover:text-[#FF7A00] text-brand-text font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {interLoading ? 'Salvando...' : 'Salvar Credenciais'}
          </button>
        </form>
      </div>
    </div>
  );
}
