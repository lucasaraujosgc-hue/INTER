import React, { useState, useEffect } from 'react';
import { Shield, Upload, Check, AlertCircle, Loader2, Save, Activity, FileKey } from 'lucide-react';

export default function WebIss({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [settings, setSettings] = useState({
    prestadorCnpj: '',
    prestadorIm: '',
    codigoMunicipio: '',
    itemLc116: '',
    aliquota: '',
    codigoTributacaoMunicipio: '',
    cnae: ''
  });
  const [hasCertificate, setHasCertificate] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setSettings({
          prestadorCnpj: data.prestadorCnpj || '',
          prestadorIm: data.prestadorIm || '',
          codigoMunicipio: data.codigoMunicipio || '',
          itemLc116: data.itemLc116 || '',
          aliquota: data.aliquota || '',
          codigoTributacaoMunicipio: data.codigoTributacaoMunicipio || '',
          codigoNbs: data.codigoNbs || '',
          cnae: data.cnae || ''
        });
        setHasCertificate(data.hasCertificate || false);
      })
      .catch(console.error);
  }, [token]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSuccess('Configurações salvas com sucesso!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Erro ao salvar configurações');
      }
    } catch (err) {
      setError('Erro de conexão ao servidor');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/nfse/test-connection', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || data.error
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Erro de conexão ao servidor'
      });
    } finally {
      setTestingConnection(false);
    }
  };

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
        setHasCertificate(true);
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
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
          <Shield size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-brand-text">WebISS / NFS-e</h2>
          <p className="text-sm text-brand-muted mt-1">Configuração do Certificado Digital A1 e Emissão</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
          <h3 className="text-lg font-bold text-brand-text mb-4">Dados do Prestador e Emissão</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-dim mb-1.5">CNPJ do Prestador</label>
              <input
                type="text"
                value={settings.prestadorCnpj}
                onChange={e => setSettings({...settings, prestadorCnpj: e.target.value})}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-brand-green transition-colors"
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-dim mb-1.5">Inscrição Municipal</label>
              <input
                type="text"
                value={settings.prestadorIm}
                onChange={e => setSettings({...settings, prestadorIm: e.target.value})}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-brand-green transition-colors"
                placeholder="123456"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-dim mb-1.5">Código do Município (IBGE)</label>
              <input
                type="text"
                value={settings.codigoMunicipio}
                onChange={e => setSettings({...settings, codigoMunicipio: e.target.value})}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-brand-green transition-colors"
                placeholder="2910800"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-brand-dim mb-1.5">Item LC 116 Padrão</label>
                <input
                  type="text"
                  value={settings.itemLc116}
                  onChange={e => setSettings({...settings, itemLc116: e.target.value})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-brand-green transition-colors"
                  placeholder="17.19"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-dim mb-1.5">Alíquota Padrão (%)</label>
                <input
                  type="number"
                  value={settings.aliquota}
                  onChange={e => setSettings({...settings, aliquota: e.target.value})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-brand-green transition-colors"
                  placeholder="3.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-brand-dim mb-1.5">Cód. Tributação Município</label>
                <input
                  type="text"
                  value={settings.codigoTributacaoMunicipio}
                  onChange={e => setSettings({...settings, codigoTributacaoMunicipio: e.target.value})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-brand-green transition-colors"
                  placeholder="123456"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-dim mb-1.5">CNAE</label>
                <input
                  type="text"
                  value={settings.cnae}
                  onChange={e => setSettings({...settings, cnae: e.target.value})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-brand-green transition-colors"
                  placeholder="0000000"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-brand-border flex gap-3">
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="flex-1 bg-brand-green hover:bg-brand-green-dim text-black font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {savingSettings ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Salvar Dados
              </button>
              <button
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="flex-1 bg-brand-surface2 hover:bg-brand-surface3 border border-brand-border text-brand-text font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {testingConnection ? <Loader2 size={18} className="animate-spin" /> : <Activity size={18} />}
                Testar Conexão
              </button>
            </div>
            
            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.success ? 'text-brand-green bg-brand-green/10' : 'text-red-400 bg-red-400/10'}`}>
                {testResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
                {testResult.message}
              </div>
            )}
          </div>
        </div>

        <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
          <h3 className="text-lg font-bold text-brand-text mb-4">Certificado Digital A1</h3>
          
          {hasCertificate && (
            <div className="mb-6 p-4 bg-brand-green/10 border border-brand-green/30 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-green/20 flex items-center justify-center text-brand-green shrink-0">
                <FileKey size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-brand-green">Certificado Carregado</p>
                <p className="text-xs text-brand-green/80 mt-0.5">O certificado digital está pronto para uso nas emissões.</p>
              </div>
            </div>
          )}

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
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2.5 px-4 text-brand-text outline-none focus:border-brand-green transition-colors"
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
    </div>
  );
}
