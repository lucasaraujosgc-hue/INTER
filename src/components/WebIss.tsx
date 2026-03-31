import React, { useState, useEffect } from 'react';
import { Shield, Upload, Check, AlertCircle, Loader2, Save } from 'lucide-react';

export default function WebIss({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
          <Shield size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-brand-text">WebISS / NFS-e</h2>
          <p className="text-sm text-brand-muted mt-1">Configuração do Certificado Digital A1</p>
        </div>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
        <form onSubmit={handleUpload} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-dim mb-1.5">Arquivo do Certificado (.pfx)</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pfx"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="cert-upload"
                />
                <label
                  htmlFor="cert-upload"
                  className="flex items-center justify-center gap-2 w-full bg-brand-surface2 border border-brand-border border-dashed rounded-lg py-8 px-4 text-brand-muted hover:text-brand-text hover:border-brand-green cursor-pointer transition-colors"
                >
                  <Upload size={20} />
                  {file ? file.name : 'Clique para selecionar o arquivo .pfx'}
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dim mb-1.5">Senha do Certificado</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-blue-500 transition-colors"
                placeholder="Insira a senha do certificado"
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
              disabled={loading || !file || !password}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {loading ? 'Importando...' : 'Importar Certificado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
