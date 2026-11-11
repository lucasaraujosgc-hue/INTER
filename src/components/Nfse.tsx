import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, Loader2, Search, Eye, Download, Plus, X, Copy, FileDown, Ban, RefreshCw, Globe } from 'lucide-react';
import { apiFetch, openBlob, brl, fmtDoc } from '../lib/api';
import { Modal, Btn, Alert, Field, Input, Select, Textarea, JsonView, Badge } from './ui';
import NfseEmitirModal from './NfseEmitirModal';
import ConsultaNacionalModal from './ConsultaNacionalModal';

export function competenciaDe(n: any): string {
  if (n.competencia) return String(n.competencia).slice(0, 7);
  const m = String(n.xml || '').match(/<(?:Competencia|dCompet)>(\d{4}-\d{2})/);
  if (m) return m[1];
  return String(n.issueDate || '').slice(0, 7);
}

function StatusNfse({ n }: { n: any }) {
  if (n.status === 'canceled') return <Badge color="gray">Cancelada</Badge>;
  if (n.status === 'issued') return <Badge color="green">{n.ambiente === '2' ? 'Emitida (teste)' : 'Emitida'}</Badge>;
  return <Badge color="amber">Pendente</Badge>;
}

export default function Nfse({ token, refreshKey, setRefreshKey }: { token: string, refreshKey?: number, setRefreshKey?: (k: (prev: number) => number) => void }) {
  const [nfses, setNfses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitir, setEmitir] = useState<{ inicial?: any } | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [consultaNacional, setConsultaNacional] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [cancelando, setCancelando] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [emissaoStart, setEmissaoStart] = useState('');
  const [emissaoEnd, setEmissaoEnd] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [showClientFilter, setShowClientFilter] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const fetchNfse = () => {
    apiFetch<any[]>(token, '/api/nfse')
      .then(data => { setNfses(data); setLoading(false); })
      .catch(err => { setMsg({ type: 'error', text: err.message }); setLoading(false); });
  };

  useEffect(() => { fetchNfse(); }, [token, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSuccess = () => {
    fetchNfse();
    setRefreshKey?.(k => k + 1);
  };

  const handleDelete = async (n: any) => {
    if (!confirm('Excluir este registro do sistema? (Isso NÃO cancela a nota na prefeitura/Sefin.)')) return;
    try {
      await apiFetch(token, `/api/nfse/${n.id}`, { method: 'DELETE' });
      handleSuccess();
    } catch (err: any) { setMsg({ type: 'error', text: err.message }); }
  };

  const sincronizar = async (n: any) => {
    setBusy(n.id);
    try {
      await apiFetch(token, `/api/nfse/${n.id}/sincronizar`, { method: 'POST' });
      setMsg({ type: 'success', text: 'NFS-e atualizada a partir da Sefin Nacional.' });
      fetchNfse();
    } catch (err: any) { setMsg({ type: 'error', text: err.message }); } finally { setBusy(''); }
  };

  const filteredNfses = useMemo(() => nfses.filter(n => {
    const q = search.toLowerCase();
    const matchesSearch = !q || [n.clientName, n.id, n.numero, n.chaveAcesso, n.clientDoc].some(v => String(v || '').toLowerCase().includes(q));
    const comp = competenciaDe(n);
    if (startDate && comp < startDate) return false;
    if (endDate && comp > endDate) return false;
    if (emissaoStart && n.issueDate < emissaoStart) return false;
    if (emissaoEnd && n.issueDate > emissaoEnd) return false;
    if (statusFiltro && n.status !== statusFiltro) return false;
    if (selectedClients.length > 0 && !selectedClients.includes(n.clientName)) return false;
    return matchesSearch;
  }).sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate))), [nfses, search, startDate, endDate, emissaoStart, emissaoEnd, statusFiltro, selectedClients]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-green" /></div>;

  const uniqueClients = Array.from(new Set(nfses.map(n => n.clientName).filter(Boolean))) as string[];
  const totalValue = filteredNfses.filter(n => n.status !== 'canceled').reduce((acc, n) => acc + (Number(n.value) || 0), 0);
  const totalPages = Math.ceil(filteredNfses.length / ITEMS_PER_PAGE);
  const paginatedNfses = filteredNfses.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[22px] font-semibold text-brand-forest font-serif tracking-[-0.01em]">Notas Fiscais de Serviço (NFS-e)</h2>
        <div className="flex flex-wrap gap-3">
          <Btn variant="orange" icon={<Globe size={15} />} onClick={() => setConsultaNacional(true)}>Consultar Ambiente Nacional</Btn>
          <button onClick={() => setIsBatchModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-brand-surface2 border border-brand-green hover:bg-brand-green/10 text-brand-green rounded-lg text-[13px] font-semibold transition-colors cursor-pointer">
            <Plus size={16} strokeWidth={2.5} />
            Emitir NFS-e em Lote
          </button>
          <button onClick={() => setEmitir({})} className="flex items-center gap-1.5 px-4 py-2 bg-brand-green hover:bg-brand-green-dim text-white rounded-lg text-[13px] font-semibold transition-colors cursor-pointer">
            <Plus size={16} strokeWidth={2.5} />
            Emitir NFS-e
          </button>
        </div>
      </div>

      {msg && <div className="mb-4"><Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert></div>}

      <div className="bg-brand-surface border border-brand-border rounded-xl shadow-brand overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-4 border-b border-brand-border flex flex-wrap gap-4 items-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" size={16} />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Buscar por cliente, número ou chave..."
              className="w-full bg-white border border-brand-border2 rounded-md py-2 pl-10 pr-4 text-brand-text outline-none focus:border-brand-orange transition-colors text-[13px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-brand-muted uppercase font-bold tracking-wide">Empresas</label>
                <div onClick={() => setShowClientFilter(!showClientFilter)} className="bg-white border border-brand-border2 rounded-md px-3 py-1.5 text-brand-text hover:border-brand-green transition-colors text-[13px] cursor-pointer min-w-[150px]">
                  {selectedClients.length === 0 ? 'Todas' : `${selectedClients.length} selecionada(s)`}
                </div>
              </div>
              {showClientFilter && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-brand-border2 rounded-md shadow-xl z-10 max-h-60 overflow-y-auto p-2 flex flex-col gap-1">
                  <label className="flex items-center gap-2 p-2 hover:bg-brand-surface cursor-pointer rounded">
                    <input type="checkbox" checked={selectedClients.length === 0} onChange={() => setSelectedClients([])} className="accent-brand-green w-4 h-4" />
                    <span className="text-sm text-brand-text">Todas as empresas</span>
                  </label>
                  {uniqueClients.map(client => (
                    <label key={client} className="flex items-center gap-2 p-2 hover:bg-brand-surface cursor-pointer rounded">
                      <input type="checkbox" checked={selectedClients.includes(client)} onChange={e => setSelectedClients(prev => e.target.checked ? [...prev, client] : prev.filter(c => c !== client))} className="accent-brand-green w-4 h-4 shrink-0" />
                      <span className="text-sm text-brand-text truncate" title={client}>{client}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {[
              ['Competência inicial', 'month', startDate, setStartDate],
              ['Competência final', 'month', endDate, setEndDate],
              ['Emissão inicial', 'date', emissaoStart, setEmissaoStart],
              ['Emissão final', 'date', emissaoEnd, setEmissaoEnd],
            ].map(([label, type, value, set]: any) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-[10px] text-brand-muted uppercase font-bold tracking-wide">{label}</label>
                <input type={type} value={value} onChange={e => { set(e.target.value); setCurrentPage(1); }} className="bg-white border border-brand-border2 rounded-md px-3 py-1.5 text-brand-text outline-none focus:border-brand-orange text-[13px] [color-scheme:light]" />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-brand-muted uppercase font-bold tracking-wide">Status</label>
              <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="bg-white border border-brand-border2 rounded-md px-3 py-1.5 text-brand-text outline-none text-[13px]">
                <option value="">Todos</option><option value="issued">Emitidas</option><option value="canceled">Canceladas</option><option value="pending">Pendentes</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                {['Número', 'Cliente', 'Valor', 'Competência', 'Emissão', 'Status', 'Ações'].map(h => (
                  <th key={h} className={`px-6 py-3 text-xs font-semibold text-brand-muted uppercase tracking-wide border-b border-brand-border bg-brand-surface2 ${h === 'Ações' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedNfses.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-brand-muted"><Receipt size={48} className="mx-auto mb-4 opacity-20" /><p>Nenhuma NFS-e encontrada.</p></td></tr>
              ) : paginatedNfses.map(n => (
                <tr key={n.id} className="border-b border-brand-border last:border-0 hover:bg-brand-surface2 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-brand-text font-mono text-sm">{n.numero || '—'}</div>
                    <div className="text-[10.5px] text-brand-dim">{n.provedor === 'nacional' ? 'Nacional' : 'WebISS'}{n.origem?.tipo === 'inter-extrato' ? ' · entrada Inter' : n.origem?.tipo === 'cobranca' ? ' · cobrança' : ''}</div>
                  </td>
                  <td className="px-6 py-4"><div className="font-medium text-brand-text">{n.clientName}</div>{n.clientDoc && <div className="text-[11px] text-brand-muted font-mono">{fmtDoc(n.clientDoc)}</div>}</td>
                  <td className="px-6 py-4 font-mono text-sm">{brl(n.value)}</td>
                  <td className="px-6 py-4 text-brand-text font-medium text-sm">{competenciaDe(n).split('-').reverse().join('/')}</td>
                  <td className="px-6 py-4 text-brand-muted text-sm">{String(n.issueDate || '').split('-').reverse().join('/')}</td>
                  <td className="px-6 py-4"><StatusNfse n={n} /></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-1.5 justify-end">
                      {(n.chaveAcesso || (n.numero && n.codigoVerificacao)) && (
                        <button onClick={() => openBlob(token, `/api/nfse/${n.id}/pdf`).catch(e => setMsg({ type: 'error', text: e.message }))} className="flex items-center p-1.5 text-brand-dim hover:text-brand-orange-dim bg-brand-surface border border-brand-border rounded transition-colors" title="DANFSe (PDF)">
                          <FileDown size={14} />
                        </button>
                      )}
                      <button onClick={() => openBlob(token, `/api/nfse/${n.id}/xml`, `${n.chaveAcesso || n.id}.xml`).catch(e => setMsg({ type: 'error', text: e.message }))} className="text-brand-muted hover:text-brand-text p-1" title="Baixar XML"><Download size={16} /></button>
                      <button onClick={() => setViewing(n)} className="text-brand-muted hover:text-brand-text p-1" title="Detalhes e XML"><Eye size={16} /></button>
                      <button onClick={() => setEmitir({ inicial: { clienteId: n.client, cliente: n.clientName, valor: n.value, descricao: n.descricao, competencia: new Date().toISOString().slice(0, 7) } })} className="text-brand-muted hover:text-brand-orange-dim p-1" title="Duplicar"><Copy size={16} /></button>
                      {n.provedor === 'nacional' && (
                        <button onClick={() => sincronizar(n)} disabled={busy === n.id} className="text-brand-muted hover:text-brand-text p-1" title="Consultar na Sefin Nacional">{busy === n.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}</button>
                      )}
                      {n.provedor === 'nacional' && n.status === 'issued' && (
                        <button onClick={() => setCancelando(n)} className="text-brand-muted hover:text-red-600 p-1" title="Cancelar NFS-e"><Ban size={16} /></button>
                      )}
                      <button onClick={() => handleDelete(n)} className="text-brand-muted hover:text-red-600 p-1" title="Excluir registro"><X size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 flex items-center justify-between border-t border-brand-border bg-brand-surface2/30">
          <div className="flex gap-4 items-center text-[12px] text-brand-muted">
            <span><span className="font-medium text-brand-text">{filteredNfses.length}</span> resultado(s)</span>
            <span className="text-[13px] font-medium bg-brand-green/10 px-3 py-1 rounded-full text-brand-green border border-brand-green/20">Total (sem canceladas): {brl(totalValue)}</span>
          </div>
          {totalPages > 1 && (
            <div className="flex gap-1">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1.5 rounded-md bg-brand-surface2 border border-brand-border text-brand-text text-[12px] disabled:opacity-50">Anterior</button>
              <span className="px-2 py-1.5 text-[12px] text-brand-muted">{currentPage}/{totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1.5 rounded-md bg-brand-surface2 border border-brand-border text-brand-text text-[12px] disabled:opacity-50">Próxima</button>
            </div>
          )}
        </div>
      </div>

      {emitir && <NfseEmitirModal token={token} inicial={emitir.inicial} onClose={() => setEmitir(null)} onSuccess={handleSuccess} />}
      {consultaNacional && <ConsultaNacionalModal token={token} onClose={() => setConsultaNacional(false)} onImportada={handleSuccess} />}
      {isBatchModalOpen && <BatchNfseModal onClose={() => setIsBatchModalOpen(false)} onSuccess={handleSuccess} token={token} />}
      {cancelando && <CancelarNfseModal token={token} n={cancelando} onClose={() => setCancelando(null)} onDone={(t) => { setMsg({ type: 'success', text: t }); handleSuccess(); }} />}

      {viewing && (
        <Modal title={`NFS-e ${viewing.numero || ''}`} subtitle={viewing.chaveAcesso ? `Chave de acesso: ${viewing.chaveAcesso}` : viewing.codigoVerificacao ? `Código de verificação: ${viewing.codigoVerificacao}` : viewing.id} onClose={() => setViewing(null)} width="max-w-4xl">
          {viewing.alertas?.length > 0 && <Alert type="warn">{viewing.alertas.map((a: any) => `${a.codigo ? `[${a.codigo}] ` : ''}${a.descricao}`).join('\n')}</Alert>}
          {viewing.cancelamento && <Alert type="info">Cancelada em {new Date(viewing.cancelamento.em).toLocaleString('pt-BR')}: {viewing.cancelamento.motivo}</Alert>}
          {viewing.nfseXml && <div><h4 className="text-sm font-bold text-brand-dim mb-2">XML da NFS-e (autorizada)</h4><JsonView data={viewing.nfseXml} /></div>}
          {viewing.responseXml && <div><h4 className="text-sm font-bold text-brand-dim mb-2">Retorno do WebISS</h4><JsonView data={viewing.responseXml} /></div>}
          <div><h4 className="text-sm font-bold text-brand-dim mb-2">XML enviado (DPS/RPS assinado)</h4><JsonView data={viewing.xml || ''} /></div>
        </Modal>
      )}
    </div>
  );
}

function CancelarNfseModal({ token, n, onClose, onDone }: { token: string; n: any; onClose: () => void; onDone: (t: string) => void }) {
  const [codigoMotivo, setCodigoMotivo] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setLoading(true); setErr('');
    try {
      const r = await apiFetch<any>(token, `/api/nfse/${n.id}/cancelar`, { method: 'POST', body: { codigoMotivo, motivo } });
      onDone(r.message);
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal title={`Cancelar NFS-e nº ${n.numero}`} subtitle={`${n.clientName} · ${brl(n.value)}`} onClose={onClose} width="max-w-lg"
      footer={<><Btn variant="ghost" onClick={onClose}>Voltar</Btn><Btn variant="danger" loading={loading} disabled={motivo.trim().length < 15} onClick={go}>Cancelar NFS-e</Btn></>}>
      {err && <Alert type="error">{err}</Alert>}
      <Alert type="warn">O cancelamento é registrado como evento na Sefin Nacional e não pode ser desfeito. Verifique o prazo de cancelamento do município.</Alert>
      <Field label="Motivo"><Select value={codigoMotivo} onChange={e => setCodigoMotivo(e.target.value)} options={[{ value: '1', label: '1 - Erro na emissão' }, { value: '2', label: '2 - Serviço não prestado' }, { value: '9', label: '9 - Outros' }]} /></Field>
      <Field label="Justificativa (mín. 15 caracteres)"><Textarea rows={3} maxLength={255} value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>
    </Modal>
  );
}

function BatchNfseModal({ onClose, onSuccess, token }: { onClose: () => void, onSuccess: () => void, token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [formData, setFormData] = useState({ descricao: '', cTribNac: '17.19', pAliq: '', competencia: new Date().toISOString().slice(0, 7), tpRetISSQN: '1' });
  const [selectedClients, setSelectedClients] = useState<{ [key: string]: boolean }>({});
  const [clientValues, setClientValues] = useState<{ [key: string]: number }>({});
  const [nfses, setNfses] = useState<any[]>([]);

  useEffect(() => {
    apiFetch<any[]>(token, '/api/nfse').then(setNfses).catch(console.error);
    apiFetch<any[]>(token, '/api/clients').then(data => {
      setClients(data);
      const cv: any = {};
      data.forEach((c: any) => { cv[c.id] = c.defaultNfseValue || 300; });
      setClientValues(cv);
    }).catch(console.error);
    apiFetch<any>(token, '/api/settings').then(s => setFormData(prev => ({
      ...prev,
      descricao: s.nfse?.descricaoPadrao || '',
      cTribNac: s.nfse?.cTribNac || '17.19',
      pAliq: s.nfse?.pAliq ? String(s.nfse.pAliq) : '',
      tpRetISSQN: s.nfse?.tpRetISSQN || '1',
    }))).catch(console.error);
  }, [token]);

  const clientsWithIssue = useMemo(() => {
    const list = new Set<string>();
    nfses.forEach(n => {
      if (n.status !== 'canceled' && competenciaDe(n) === formData.competencia) {
        if (n.client) list.add(n.client);
        if (n.clientName) list.add(n.clientName);
      }
    });
    return list;
  }, [nfses, formData.competencia]);

  const handleValueBlur = async (clientId: string, value: number) => {
    const client = clients.find(c => c.id === clientId);
    if (!client || client.defaultNfseValue === value) return;
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, defaultNfseValue: value } : c));
    apiFetch(token, `/api/clients/${clientId}`, { method: 'PUT', body: { ...client, defaultNfseValue: value } }).catch(console.error);
  };

  const handleSave = async () => {
    const clientsToEmit = clients.filter(c => selectedClients[c.id]);
    if (clientsToEmit.length === 0) { setError('Selecione ao menos um cliente'); return; }
    setLoading(true); setError(''); setSuccess(''); setProgress(0); setLog([]);
    let successes = 0, failures = 0;
    for (let i = 0; i < clientsToEmit.length; i++) {
      const c = clientsToEmit[i];
      try {
        const r = await apiFetch<any>(token, '/api/nfse/emitir', { method: 'POST', body: { ...formData, clienteId: c.id, cliente: c.name, valor: clientValues[c.id] || 0 } });
        successes++;
        setLog(l => [...l, `✓ ${c.name}: ${r.message}`]);
      } catch (err: any) {
        failures++;
        setLog(l => [...l, `✗ ${c.name}: ${err.message}`]);
      }
      setProgress(Math.round(((i + 1) / clientsToEmit.length) * 100));
      if (i < clientsToEmit.length - 1) await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (failures === 0) setSuccess(`Lote emitido com sucesso! (${successes} notas)`);
    else setError(`Emissão finalizada: ${successes} com sucesso, ${failures} falhas.`);
    setLoading(false);
    onSuccess();
  };

  return (
    <Modal title="Emitir NFS-e em lote" onClose={() => !loading && onClose()} width="max-w-5xl"
      footer={<>
        {loading && <div className="mr-auto w-1/2 h-2 bg-brand-surface2 rounded-full overflow-hidden self-center"><div className="h-full bg-brand-green transition-all" style={{ width: `${progress}%` }} /></div>}
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Fechar</Btn>
        <Btn variant="primary" loading={loading} icon={<Receipt size={15} />} onClick={handleSave} disabled={Object.values(selectedClients).filter(Boolean).length === 0}>Emitir lote</Btn>
      </>}>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {log.length > 0 && <div className="flex flex-col gap-0.5 text-[12px] font-mono max-h-40 overflow-y-auto">{log.map((l, i) => <div key={i} className={l.startsWith('✓') ? 'text-brand-green' : 'text-red-600'}>{l}</div>)}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Competência"><Input type="month" value={formData.competencia} onChange={e => setFormData({ ...formData, competencia: e.target.value })} /></Field>
            <Field label="Cód. tributação nacional"><Input value={formData.cTribNac} onChange={e => setFormData({ ...formData, cTribNac: e.target.value })} /></Field>
            <Field label="Retenção do ISSQN"><Select value={formData.tpRetISSQN} onChange={e => setFormData({ ...formData, tpRetISSQN: e.target.value })} options={[{ value: '1', label: 'Não retido' }, { value: '2', label: 'Retido pelo tomador' }]} /></Field>
            <Field label="Alíquota (%) opcional"><Input type="number" step="0.01" value={formData.pAliq} onChange={e => setFormData({ ...formData, pAliq: e.target.value })} /></Field>
          </div>
          <Field label="Descrição do serviço"><Textarea rows={5} value={formData.descricao} onChange={e => setFormData({ ...formData, descricao: e.target.value })} /></Field>
        </div>
        <div className="flex flex-col h-[420px]">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
              <input type="checkbox" className="accent-brand-green w-4 h-4" checked={clients.length > 0 && clients.every(c => selectedClients[c.id])} onChange={e => { const sc: any = {}; clients.forEach(c => sc[c.id] = e.target.checked); setSelectedClients(sc); }} />
              Selecionar todas
            </label>
            <span className="text-[12px] text-brand-muted">{Object.values(selectedClients).filter(Boolean).length} selecionadas</span>
          </div>
          <div className="flex-1 overflow-y-auto bg-brand-surface2/30 border border-brand-border rounded-lg p-2">
            {clients.map(client => {
              const hasIssue = clientsWithIssue.has(client.id) || clientsWithIssue.has(client.name);
              return (
                <div key={client.id} className={`flex items-center gap-3 p-2 rounded-lg border-b border-brand-border/50 last:border-0 ${hasIssue ? 'bg-amber-50' : 'hover:bg-brand-surface2'}`}>
                  <input type="checkbox" className="accent-brand-green w-4 h-4 shrink-0" checked={selectedClients[client.id] || false} onChange={e => setSelectedClients({ ...selectedClients, [client.id]: e.target.checked })} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium truncate ${hasIssue ? 'text-amber-700' : 'text-brand-text'}`} title={client.name}>{client.name} {hasIssue && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">Nota emitida</span>}</div>
                    <div className="text-[11px] font-mono text-brand-muted">{fmtDoc(client.cpfCnpj || client.cnpj)}</div>
                  </div>
                  <div className="w-28 shrink-0 relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-brand-muted">R$</span>
                    <input type="number" value={clientValues[client.id] || 0} onChange={e => setClientValues({ ...clientValues, [client.id]: Number(e.target.value) })} onBlur={e => handleValueBlur(client.id, Number(e.target.value))} disabled={!selectedClients[client.id]}
                      className="w-full bg-brand-surface border border-brand-border rounded py-1 pl-6 pr-2 text-[13px] text-brand-text outline-none focus:border-brand-orange" />
                  </div>
                </div>
              );
            })}
            {clients.length === 0 && <div className="p-4 text-center text-brand-muted text-[13px]">Nenhum cliente cadastrado.</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
