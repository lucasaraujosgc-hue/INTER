import React, { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Loader2, MapPin, Phone, Mail, Trash2, Edit2, Search, Link2, X, Save } from 'lucide-react';
import { apiFetch, fmtDoc } from '../lib/api';
import { Btn, Card, Field, Input, Alert } from './ui';

type Pagador = { cpfCnpj?: string; nome?: string; criadoEm?: string };

const initialFormState = {
  cpfCnpj: '',
  inscricaoMunicipal: '',
  inscricaoEstadual: '',
  name: '', // Nome/Razão social
  email: '',
  telefone: '',
  cep: '',
  municipioUf: '',
  logradouro: '',
  bairro: '',
  numero: '',
  complemento: '',
  codigoMunicipio: '', // código IBGE (usado na NFS-e nacional)
  pagadores: [] as Pagador[], // outras pessoas/empresas que pagam por este cliente
};

export default function Clientes({ token }: { token: string }) {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newClient, setNewClient] = useState(initialFormState);
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [searchingCnpj, setSearchingCnpj] = useState(false);
  const [busca, setBusca] = useState('');
  const [novoPagador, setNovoPagador] = useState({ cpfCnpj: '', nome: '' });
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { fetchClients(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchClients = async () => {
    try {
      setClients(await apiFetch<any[]>(token, '/api/clients'));
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Erro ao buscar clientes' });
    } finally {
      setLoading(false);
    }
  };

  const set = (k: keyof typeof initialFormState, v: any) => setNewClient(prev => ({ ...prev, [k]: v }));

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este cliente?')) return;
    setDeletingId(id);
    try {
      await apiFetch(token, `/api/clients/${id}`, { method: 'DELETE' });
      setClients(clients.filter(c => c.id !== id));
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Erro ao excluir cliente' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '');
    set('cep', e.target.value);
    if (cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setNewClient(prev => ({
            ...prev,
            logradouro: data.logradouro || '',
            bairro: data.bairro || '',
            municipioUf: `${data.localidade || ''}/${data.uf || ''}`,
            codigoMunicipio: data.ibge || '',
          }));
        }
      } catch (err) {
        console.error('Erro ao buscar CEP', err);
      }
    }
  };

  const fecharForm = () => {
    setNewClient(initialFormState);
    setEditClientId(null);
    setNovoPagador({ cpfCnpj: '', nome: '' });
    setShowForm(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const pagadores = [...newClient.pagadores];
      // Pagador digitado e não adicionado ainda: salva junto.
      if (novoPagador.cpfCnpj.replace(/\D/g, '') || novoPagador.nome.trim()) pagadores.push({ cpfCnpj: novoPagador.cpfCnpj.replace(/\D/g, ''), nome: novoPagador.nome.trim(), criadoEm: new Date().toISOString() });
      await apiFetch(token, editClientId ? `/api/clients/${editClientId}` : '/api/clients', {
        method: editClientId ? 'PUT' : 'POST',
        body: { ...newClient, pagadores },
      });
      setMsg({ type: 'success', text: editClientId ? 'Cliente atualizado.' : 'Cliente cadastrado.' });
      fecharForm();
      fetchClients();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Erro ao salvar cliente' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (client: any) => {
    setNewClient({
      cpfCnpj: client.cpfCnpj || client.cnpj || '',
      inscricaoMunicipal: client.inscricaoMunicipal || '',
      inscricaoEstadual: client.inscricaoEstadual || '',
      name: client.name || '',
      email: client.email || '',
      telefone: client.telefone || '',
      cep: client.cep || '',
      municipioUf: client.municipioUf || '',
      logradouro: client.logradouro || '',
      bairro: client.bairro || '',
      numero: client.numero || '',
      complemento: client.complemento || '',
      codigoMunicipio: client.codigoMunicipio || '',
      pagadores: Array.isArray(client.pagadores) ? client.pagadores : [],
    });
    setEditClientId(client.id);
    setShowForm(true);
  };

  const handleCnpjSearch = async () => {
    const cnpj = newClient.cpfCnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) {
      setMsg({ type: 'error', text: 'CNPJ deve ter 14 dígitos para a busca automatizada.' });
      return;
    }
    setSearchingCnpj(true);
    try {
      const data = await apiFetch<any>(token, `/api/receitaws/${cnpj}`);
      if (data.status === 'ERROR') {
        setMsg({ type: 'error', text: 'Erro ao buscar CNPJ: ' + (data.message || '') });
        return;
      }
      setNewClient(prev => ({
        ...prev,
        name: data.nome || data.fantasia || prev.name,
        logradouro: data.logradouro || prev.logradouro,
        numero: data.numero || prev.numero,
        complemento: data.complemento || prev.complemento,
        bairro: data.bairro || prev.bairro,
        municipioUf: (data.municipio && data.uf) ? `${data.municipio}/${data.uf}` : prev.municipioUf,
        cep: data.cep ? data.cep.replace(/\D/g, '') : prev.cep,
        // CEP mudou: o código IBGE é recalculado pelo servidor na emissão da NFS-e
        codigoMunicipio: data.cep && data.cep.replace(/\D/g, '') !== String(prev.cep).replace(/\D/g, '') ? '' : prev.codigoMunicipio,
        telefone: data.telefone || prev.telefone,
        email: data.email || prev.email,
      }));
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Erro de conexão ao consultar CNPJ' });
    } finally {
      setSearchingCnpj(false);
    }
  };

  const adicionarPagador = () => {
    const doc = novoPagador.cpfCnpj.replace(/\D/g, '');
    const nome = novoPagador.nome.trim();
    if (!(doc.length === 11 || doc.length === 14) && nome.length < 4) {
      setMsg({ type: 'error', text: 'Informe o CPF/CNPJ (11 ou 14 dígitos) ou o nome de quem paga por este cliente.' });
      return;
    }
    setNewClient(prev => ({
      ...prev,
      pagadores: [...prev.pagadores.filter(p => doc ? String(p.cpfCnpj || '').replace(/\D/g, '') !== doc : p.nome !== nome), { cpfCnpj: doc, nome, criadoEm: new Date().toISOString() }],
    }));
    setNovoPagador({ cpfCnpj: '', nome: '' });
  };

  const removerPagador = (i: number) => setNewClient(prev => ({ ...prev, pagadores: prev.pagadores.filter((_, j) => j !== i) }));

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return clients
      .filter(c => !q || String(c.name || '').toLowerCase().includes(q)
        || (qd.length >= 3 && [c.cpfCnpj, ...(c.pagadores || []).map((p: Pagador) => p.cpfCnpj)].some(d => String(d || '').replace(/\D/g, '').includes(qd)))
        || (c.pagadores || []).some((p: Pagador) => String(p.nome || '').toLowerCase().includes(q)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [clients, busca]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-green" /></div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-[22px] font-semibold text-brand-forest font-serif tracking-[-0.01em]">Gerenciamento de Clientes</h2>
        <Btn variant={showForm ? 'secondary' : 'primary'} icon={showForm ? <X size={16} /> : <Plus size={16} />} onClick={() => (showForm ? fecharForm() : setShowForm(true))}>
          {showForm ? 'Cancelar' : 'Novo cliente'}
        </Btn>
      </div>
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      {showForm && (
        <form onSubmit={handleAdd}>
          <Card title={editClientId ? 'Editar cliente' : 'Novo cliente'} subtitle="Dados do tomador usados no boleto e na NFS-e">
            <div className="p-5 flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="CPF/CNPJ *">
                  <div className="flex gap-2">
                    <Input value={newClient.cpfCnpj} onChange={e => set('cpfCnpj', e.target.value)} placeholder="Número do documento" required />
                    <Btn type="button" onClick={handleCnpjSearch} loading={searchingCnpj} icon={<Search size={16} />} title="Buscar dados do CNPJ" />
                  </div>
                </Field>
                <Field label="Inscrição municipal"><Input value={newClient.inscricaoMunicipal} onChange={e => set('inscricaoMunicipal', e.target.value)} /></Field>
                <Field label="Inscrição estadual"><Input value={newClient.inscricaoEstadual} onChange={e => set('inscricaoEstadual', e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Nome / razão social *" className="md:col-span-2"><Input value={newClient.name} onChange={e => set('name', e.target.value)} placeholder="Razão social do tomador" required /></Field>
                <Field label="Telefone"><Input value={newClient.telefone} onChange={e => set('telefone', e.target.value)} /></Field>
                <Field label="E-mail" className="md:col-span-3"><Input type="email" value={newClient.email} onChange={e => set('email', e.target.value)} placeholder="E-mail principal de contato do tomador" /></Field>
              </div>

              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-orange-dim mb-3">Endereço</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="CEP"><Input value={newClient.cep} onChange={handleCepChange} maxLength={9} /></Field>
                  <Field label="Município/UF"><Input value={newClient.municipioUf} onChange={e => set('municipioUf', e.target.value)} placeholder="Cidade/UF" /></Field>
                  <Field label="Logradouro"><Input value={newClient.logradouro} onChange={e => set('logradouro', e.target.value)} /></Field>
                  <Field label="Bairro"><Input value={newClient.bairro} onChange={e => set('bairro', e.target.value)} /></Field>
                  <Field label="Número"><Input value={newClient.numero} onChange={e => set('numero', e.target.value)} /></Field>
                  <Field label="Complemento"><Input value={newClient.complemento} onChange={e => set('complemento', e.target.value)} /></Field>
                </div>
              </div>

              <div className="rounded-lg border border-brand-border bg-brand-bg p-4">
                <div className="flex items-start gap-2 mb-3">
                  <Link2 size={16} className="text-brand-orange-dim mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[13.5px] font-semibold text-brand-forest">Pagadores vinculados</div>
                    <div className="text-[12px] text-brand-muted">Pessoas ou empresas que pagam por este cliente (ex.: o sócio que paga o boleto no CPF). Os recebimentos delas entram como deste cliente e a NFS-e sai em nome dele.</div>
                  </div>
                </div>
                {newClient.pagadores.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {newClient.pagadores.map((p, i) => (
                      <span key={`${p.cpfCnpj}-${p.nome}-${i}`} className="inline-flex items-center gap-2 bg-white border border-brand-border2 rounded-full pl-3 pr-1 py-1 text-[12px]">
                        <span className="font-medium text-brand-text">{p.nome || 'Sem nome'}</span>
                        {p.cpfCnpj && <span className="font-mono text-brand-muted">{fmtDoc(p.cpfCnpj)}</span>}
                        <button type="button" onClick={() => removerPagador(i)} className="w-5 h-5 rounded-full flex items-center justify-center text-brand-muted hover:bg-red-50 hover:text-red-600" title="Remover vínculo" aria-label="Remover vínculo"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-2 items-end">
                  <Field label="CPF/CNPJ do pagador"><Input value={novoPagador.cpfCnpj} onChange={e => setNovoPagador(p => ({ ...p, cpfCnpj: e.target.value }))} placeholder="000.000.000-00" /></Field>
                  <Field label="Nome"><Input value={novoPagador.nome} onChange={e => setNovoPagador(p => ({ ...p, nome: e.target.value }))} placeholder="Nome de quem paga" /></Field>
                  <Btn type="button" icon={<Plus size={14} />} onClick={adicionarPagador}>Adicionar</Btn>
                </div>
              </div>

              <div className="flex justify-end">
                <Btn type="submit" variant="primary" loading={saving} icon={<Save size={16} />} className="px-6">Salvar cliente</Btn>
              </div>
            </div>
          </Card>
        </form>
      )}

      <Card
        title="Clientes"
        subtitle={`${clients.length} cadastrado(s)`}
        actions={
          <div className="relative w-[280px] max-w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" placeholder="Buscar nome, CPF/CNPJ ou pagador…" />
          </div>
        }
      >
        {clients.length === 0 ? (
          <div className="p-10 text-center text-brand-muted">
            <Users size={44} className="mx-auto mb-3 text-brand-border2" />
            <p>Nenhum cliente cadastrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  {['Cliente', 'CPF/CNPJ', 'Contato', 'Localidade', ''].map(h => (
                    <th key={h} className={`px-5 py-2.5 text-[11px] font-semibold text-brand-muted uppercase tracking-[0.06em] border-b border-brand-border bg-brand-surface2 ${h === '' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(client => (
                  <tr key={client.id} className="border-b border-brand-border last:border-0 hover:bg-brand-surface2 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0" style={{ backgroundColor: client.color || '#0B4535' }}>
                          {client.init || String(client.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-brand-text">{client.name}</div>
                          {Array.isArray(client.pagadores) && client.pagadores.length > 0 && (
                            <div className="text-[11px] text-brand-orange-dim flex items-center gap-1" title={client.pagadores.map((p: Pagador) => `${p.nome || ''} ${p.cpfCnpj ? fmtDoc(p.cpfCnpj) : ''}`.trim()).join('\n')}>
                              <Link2 size={11} /> {client.pagadores.length} pagador(es) vinculado(s)
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-brand-muted font-mono">{fmtDoc(client.cpfCnpj || client.cnpj) || '-'}</td>
                    <td className="px-5 py-3 text-[13px] text-brand-muted">
                      <div className="flex flex-col gap-1">
                        {client.email && <div className="flex items-center gap-1.5"><Mail size={12} /> {client.email}</div>}
                        {client.telefone && <div className="flex items-center gap-1.5"><Phone size={12} /> {client.telefone}</div>}
                        {!client.email && !client.telefone && '-'}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-brand-muted">
                      {client.municipioUf ? <div className="flex items-center gap-1.5"><MapPin size={12} /> {client.municipioUf}</div> : '-'}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => handleEdit(client)} className="p-2 text-brand-muted hover:text-brand-green hover:bg-brand-green-subtle rounded-md transition-colors mr-1" title="Editar cliente">
                        <Edit2 size={17} />
                      </button>
                      <button onClick={() => handleDelete(client.id)} disabled={deletingId === client.id} className="p-2 text-brand-muted hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50" title="Excluir cliente">
                        {deletingId === client.id ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-[13px] text-brand-muted">Nenhum cliente para "{busca}".</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
