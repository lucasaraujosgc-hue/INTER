import React, { useState, useEffect } from 'react';
import { Receipt, Loader2, Search, Eye, Download, Plus, X, AlertCircle } from 'lucide-react';

export default function Nfse({ token, refreshKey, setRefreshKey }: { token: string, refreshKey?: number, setRefreshKey?: (k: (prev: number) => number) => void }) {
  const [nfses, setNfses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingXml, setViewingXml] = useState<string | null>(null);

  useEffect(() => {
    fetchNfse();
  }, [token, refreshKey]);

  const fetchNfse = () => {
    fetch('/api/nfse', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setNfses(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const handleSuccess = () => {
    fetchNfse();
    if (setRefreshKey) {
      setRefreshKey(k => k + 1);
    }
  };

  const handleDownload = (nfse: any) => {
    if (!nfse.xml) {
      alert('XML não disponível para esta nota.');
      return;
    }
    const blob = new Blob([nfse.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nfse.id}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-green" /></div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-brand-text">Notas Fiscais de Serviço (NFS-e)</h2>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-brand-green hover:bg-brand-green-dim text-black rounded-lg text-[13px] font-semibold transition-colors cursor-pointer">
          <Plus size={16} strokeWidth={2.5} />
          Emitir NFS-e
        </button>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-brand-border flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" size={16} />
            <input 
              type="text" 
              placeholder="Buscar nota fiscal..." 
              className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 pl-10 pr-4 text-brand-text outline-none focus:border-brand-green transition-colors"
            />
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Número</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Cliente</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Valor</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Emissão</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Status</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {nfses.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-brand-muted">
                  <Receipt size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Nenhuma NFS-e encontrada.</p>
                </td>
              </tr>
            ) : (
              nfses.map(n => (
                <tr key={n.id} className="border-b border-white/5 last:border-0 hover:bg-brand-surface2 transition-colors">
                  <td className="px-6 py-4 text-brand-muted font-mono text-sm">{n.id}</td>
                  <td className="px-6 py-4 font-medium text-brand-text">{n.clientName}</td>
                  <td className="px-6 py-4 font-mono text-sm">R$ {n.value.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                  <td className="px-6 py-4 text-brand-muted text-sm">{n.issueDate.split('-').reverse().join('/')}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-green/10 text-brand-green">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
                      Emitida
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          if (!n.xml) {
                            alert('XML não disponível para esta nota.');
                            return;
                          }
                          setViewingXml(n.xml);
                        }}
                        className="text-brand-muted hover:text-brand-text transition-colors"
                        title="Visualizar XML"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => handleDownload(n)}
                        className="text-brand-muted hover:text-brand-text transition-colors"
                        title="Baixar XML"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {isModalOpen && <NewNfseModal onClose={() => setIsModalOpen(false)} onSuccess={handleSuccess} token={token} />}
      
      {viewingXml && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-surface border border-brand-border rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-brand-border">
              <h3 className="text-lg font-bold text-brand-text">Visualizar XML</h3>
              <button onClick={() => setViewingXml(null)} className="text-brand-muted hover:text-brand-text">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <pre className="text-xs text-brand-muted font-mono whitespace-pre-wrap break-all bg-brand-surface2 p-4 rounded-lg border border-brand-border">
                {viewingXml}
              </pre>
            </div>
            <div className="p-4 border-t border-brand-border flex justify-end">
              <button 
                onClick={() => setViewingXml(null)}
                className="px-4 py-2 bg-brand-surface2 hover:bg-brand-border text-brand-text rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewNfseModal({ onClose, onSuccess, token }: { onClose: () => void, onSuccess: () => void, token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setClients(data))
      .catch(console.error);
  }, [token]);

  const [formData, setFormData] = useState({
    cliente: '',
    valor: 1500,
    descricao: 'Serviços prestados',
    itemLc116: '17.19',
    aliquota: 3.00
  });

  const handleSave = async () => {
    if (!formData.cliente) {
      setError('Selecione um cliente');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/nfse/emitir', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao emitir NFS-e');
      }

      setSuccess(data.message || 'NFS-e emitida com sucesso!');
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-brand-surface border border-brand-border-green rounded-2xl w-[500px] max-w-[95vw] shadow-[0_24px_80px_rgba(0,0,0,0.5)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 px-6 border-b border-brand-border flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-brand-green-subtle border border-brand-border-green flex items-center justify-center text-brand-green">
            <Receipt size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-base font-bold text-brand-text">Emitir NFS-e Avulsa</h2>
            <div className="text-xs text-brand-muted mt-0.5">Emissão direta sem gerar cobrança</div>
          </div>
          <button onClick={onClose} className="ml-auto p-1 text-brand-muted hover:text-brand-text hover:bg-brand-surface2 rounded-md transition-colors">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        
        <div className="p-5 px-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex flex-col gap-2">
              <div className="text-red-500 text-[13px] font-medium flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-brand-green/10 border border-brand-green/30 rounded-lg flex flex-col gap-2">
              <div className="text-brand-green text-[13px] font-medium flex items-center gap-2">
                <Receipt size={16} />
                {success}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Cliente</label>
              <select 
                value={formData.cliente}
                onChange={e => setFormData({...formData, cliente: e.target.value})}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
              >
                <option value="">Selecione um cliente...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.name}>{c.name} ({c.document})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Valor (R$)</label>
                <input 
                  type="number" 
                  value={formData.valor}
                  onChange={e => setFormData({...formData, valor: Number(e.target.value)})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Item LC 116</label>
                <input 
                  type="text" 
                  value={formData.itemLc116}
                  onChange={e => setFormData({...formData, itemLc116: e.target.value})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Descrição do Serviço</label>
              <textarea 
                value={formData.descricao}
                onChange={e => setFormData({...formData, descricao: e.target.value})}
                rows={3}
                className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors resize-none"
              />
            </div>
          </div>
        </div>

        <div className="p-4 px-6 border-t border-brand-border bg-brand-surface2/50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-brand-muted hover:text-brand-text transition-colors">
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-brand-green hover:bg-brand-green-dim text-black rounded-lg text-[13px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} strokeWidth={2.5} />}
            Emitir NFS-e
          </button>
        </div>
      </div>
    </div>
  );
}
