import React, { useState, useEffect } from 'react';
import { Receipt, Loader2, Search, Eye, Download, Plus, X, AlertCircle } from 'lucide-react';

export default function Nfse({ token, refreshKey, setRefreshKey }: { token: string, refreshKey?: number, setRefreshKey?: (k: (prev: number) => number) => void }) {
  const [nfses, setNfses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingXml, setViewingXml] = useState<any | null>(null);

  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sysSettings, setSysSettings] = useState<any>({});
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchNfse();
    fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setSysSettings(data))
      .catch(console.error);
  }, [token, refreshKey]);

  const handleViewPdf = async (nfseId: string) => {
    try {
      const res = await fetch(`/api/nfse/${nfseId}/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Erro ao buscar o PDF. A NFS-e pode ainda não estar pronta.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      // To force download you could set a.download, but here we just open in new tab for viewing
      a.click();
    } catch (error: any) {
      alert(error.message || 'Erro ao comunicar com o servidor');
    }
  };

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

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta NFS-e?')) return;
    try {
      const res = await fetch(`/api/nfse/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchNfse();
        if (setRefreshKey) setRefreshKey(k => k + 1);
      } else {
        alert('Erro ao excluir NFS-e');
      }
    } catch(err) {
      alert('Erro de conexão ao excluir NFS-e');
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

  const filteredNfses = nfses.filter(n => {
    const matchesSearch = n.clientName?.toLowerCase().includes(search.toLowerCase()) || n.id?.toLowerCase().includes(search.toLowerCase());
    const d = new Date(n.issueDate);
    let inRange = true;
    if (startDate) inRange = inRange && d >= new Date(startDate);
    if (endDate) inRange = inRange && d <= new Date(endDate);
    return matchesSearch && inRange;
  });

  const totalPages = Math.ceil(filteredNfses.length / ITEMS_PER_PAGE);
  const paginatedNfses = filteredNfses.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-brand-text">Notas Fiscais de Serviço (NFS-e)</h2>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-brand-green hover:bg-brand-green-dim text-black rounded-lg text-[13px] font-semibold transition-colors cursor-pointer">
          <Plus size={16} strokeWidth={2.5} />
          Emitir NFS-e
        </button>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-4 border-b border-brand-border flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" size={16} />
            <input 
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nota fiscal..." 
              className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 pl-10 pr-4 text-brand-text outline-none focus:border-brand-green transition-colors text-[13px]"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-brand-muted uppercase font-bold tracking-wide">Data Inicial</label>
              <input 
                type="date" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-brand-surface2 border border-brand-border rounded-lg px-3 py-1.5 text-brand-text outline-none focus:border-brand-green transition-colors text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-brand-muted uppercase font-bold tracking-wide">Data Final</label>
              <input 
                type="date" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-brand-surface2 border border-brand-border rounded-lg px-3 py-1.5 text-brand-text outline-none focus:border-brand-green transition-colors text-[13px]"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Número</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Cliente</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Valor</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Emissão</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedNfses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-brand-muted">
                    <Receipt size={48} className="mx-auto mb-4 opacity-20" />
                    <p>Nenhuma NFS-e encontrada.</p>
                  </td>
                </tr>
              ) : (
                paginatedNfses.map(n => (
                  <tr key={n.id} className="border-b border-white/5 last:border-0 hover:bg-brand-surface2 transition-colors">
                    <td className="px-6 py-4 text-brand-muted font-mono text-sm">{n.numero || n.id}</td>
                    <td className="px-6 py-4 font-medium text-brand-text">{n.clientName}</td>
                    <td className="px-6 py-4 font-mono text-sm">R$ {n.value.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                    <td className="px-6 py-4 text-brand-muted text-sm">{n.issueDate.split('-').reverse().join('/')}</td>
                    <td className="px-6 py-4">
                      {n.status === 'issued' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-green/10 text-brand-green">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
                          Emitida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        {n.numero && n.codigoVerificacao && (
                          <button 
                            onClick={() => handleViewPdf(n.id)}
                            className="flex items-center justify-center p-1.5 text-brand-dim hover:text-brand-green bg-brand-surface border border-brand-border rounded hover:bg-brand-surface2/50 transition-colors"
                            title="Nota Oficial (PDF baixado pelo sistema)"
                          >
                            <span className="text-[10px] font-bold tracking-tight uppercase mr-1">PDF</span>
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            if (!n.xml) {
                              alert('Erro: sem dados para exibir.');
                              return;
                            }
                            setViewingXml(n);
                          }}
                          className="text-brand-muted hover:text-brand-text transition-colors p-1"
                          title="Visualizar XML e Log"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          onClick={() => handleDownload(n)}
                          className="text-brand-muted hover:text-brand-text transition-colors p-1"
                          title="Baixar XML"
                        >
                          <Download size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(n.id)}
                          className="text-brand-muted hover:text-red-500 transition-colors p-1"
                          title="Excluir NFS-e"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-brand-border flex items-center justify-between">
            <div className="text-[12px] text-brand-muted">
              Mostrando <span className="font-medium text-brand-text">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> ao <span className="font-medium text-brand-text">{Math.min(currentPage * ITEMS_PER_PAGE, filteredNfses.length)}</span> de <span className="font-medium text-brand-text">{filteredNfses.length}</span> resultados
            </div>
            <div className="flex gap-1">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-md bg-brand-surface2 border border-brand-border text-brand-text text-[12px] disabled:opacity-50 hover:bg-brand-surface3 transition-colors"
              >
                Anterior
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-md bg-brand-surface2 border border-brand-border text-brand-text text-[12px] disabled:opacity-50 hover:bg-brand-surface3 transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
      {isModalOpen && <NewNfseModal onClose={() => setIsModalOpen(false)} onSuccess={handleSuccess} token={token} />}
      
      {viewingXml && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-surface border border-brand-border rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-brand-border">
              <div>
                <h3 className="text-lg font-bold text-brand-text">Visualizar Log da NFS-e</h3>
                {viewingXml.numero && <p className="text-xs text-brand-muted mt-1">Número gerado: {viewingXml.numero}</p>}
                {viewingXml.codigoVerificacao && <p className="text-[11px] font-mono text-brand-green mt-1">Código Verificação: {viewingXml.codigoVerificacao}</p>}
              </div>
              <button onClick={() => setViewingXml(null)} className="text-brand-muted hover:text-brand-text">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 flex flex-col gap-4">
              {viewingXml.responseXml && (
                <div>
                  <h4 className="text-sm font-bold text-brand-dim mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-brand-green"></div> Retorno do Servidor (WebISS)
                  </h4>
                  <pre className="text-xs text-brand-muted font-mono whitespace-pre-wrap break-all bg-[#0a0a0a] p-4 rounded-lg border border-brand-border">
                    {viewingXml.responseXml}
                  </pre>
                </div>
              )}
              <div>
                <h4 className="text-sm font-bold text-brand-dim mb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div> XML Enviado
                </h4>
                <pre className="text-xs text-brand-muted font-mono whitespace-pre-wrap break-all bg-[#0a0a0a] p-4 rounded-lg border border-brand-border opacity-70">
                  {viewingXml.xml}
                </pre>
              </div>
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

  const [formData, setFormData] = useState({
    cliente: '',
    valor: 300,
    descricao: 'Prestação de serviços contábeis, compreendendo escrituração contábil e fiscal, apuração de tributos, elaboração e entrega de obrigações acessórias, assessoria e consultoria contábil, referente ao período de xx/202x.',
    itemLc116: '1719',
    aliquota: 2.01,
    codigoTributacaoMunicipio: '1719',
    cnae: '6920601',
    competencia: new Date().toISOString().slice(0, 7), // YYYY-MM
    issRetido: 2,
    regimeEspecialTributacao: 6,
    optanteSimplesNacional: 1,
    incentivoFiscal: 2
  });

  useEffect(() => {
    fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setClients(data))
      .catch(console.error);

    fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setFormData(prev => ({
          ...prev,
          itemLc116: data.itemLc116 || '1719',
          aliquota: data.aliquota || 2.01,
          codigoTributacaoMunicipio: data.codigoTributacaoMunicipio || '1719',
          cnae: data.cnae || '6920601'
        }));
      })
      .catch(console.error);
  }, [token]);

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Alíquota (%)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={formData.aliquota}
                  onChange={e => setFormData({...formData, aliquota: Number(e.target.value)})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Código Tributação</label>
                <input 
                  type="text" 
                  value={formData.codigoTributacaoMunicipio}
                  onChange={e => setFormData({...formData, codigoTributacaoMunicipio: e.target.value})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">CNAE</label>
                <input 
                  type="text" 
                  value={formData.cnae}
                  onChange={e => setFormData({...formData, cnae: e.target.value})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Competência</label>
                <input 
                  type="month" 
                  value={formData.competencia}
                  onChange={e => setFormData({...formData, competencia: e.target.value})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">ISS Retido</label>
                <select 
                  value={formData.issRetido}
                  onChange={e => setFormData({...formData, issRetido: Number(e.target.value)})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                >
                  <option value={1}>Sim (1)</option>
                  <option value={2}>Não (2)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Regime Especial Trib.</label>
                <select 
                  value={formData.regimeEspecialTributacao}
                  onChange={e => setFormData({...formData, regimeEspecialTributacao: Number(e.target.value)})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                >
                  <option value={1}>1 - Microempresa Municipal</option>
                  <option value={2}>2 - Estimativa</option>
                  <option value={3}>3 - Sociedade de Profissionais</option>
                  <option value={4}>4 - Cooperativa</option>
                  <option value={5}>5 - MEI</option>
                  <option value={6}>6 - ME ou EPP do Simples Nacional</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Optante Simples Nac.</label>
                <select 
                  value={formData.optanteSimplesNacional}
                  onChange={e => setFormData({...formData, optanteSimplesNacional: Number(e.target.value)})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                >
                  <option value={1}>Sim (1)</option>
                  <option value={2}>Não (2)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-brand-dim uppercase tracking-wide mb-1.5">Incentivo Fiscal</label>
                <select 
                  value={formData.incentivoFiscal}
                  onChange={e => setFormData({...formData, incentivoFiscal: Number(e.target.value)})}
                  className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-colors"
                >
                  <option value={1}>Sim (1)</option>
                  <option value={2}>Não (2)</option>
                </select>
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
