import React, { useEffect, useMemo, useState } from 'react';
import { Link2, Search, UserPlus, Unlink } from 'lucide-react';
import { apiFetch, brl, fmtDate, fmtDoc } from '../lib/api';
import { Modal, Btn, Alert, Input, Field } from './ui';

/**
 * Vincula um recebimento (entrada do Inter) a um cliente/empresa. Resolve o caso do boleto ou Pix pago
 * por outra pessoa (sócio, pessoa física, parente): a NFS-e sai no nome da empresa vinculada.
 */
export default function VincularPagadorModal({ token, entrada, onClose, onDone }: {
  token: string;
  entrada: any;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [clients, setClients] = useState<any[]>([]);
  const [busca, setBusca] = useState('');
  const [clienteId, setClienteId] = useState<string>(entrada?.cliente?.id || '');
  const [lembrar, setLembrar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const pagador = entrada?.pagador || {};
  const doc = String(pagador.cpfCnpj || '').replace(/\D/g, '');
  const docValido = doc.length === 11 || doc.length === 14;
  const podeLembrar = docValido || String(pagador.nome || '').trim().length >= 4;

  useEffect(() => {
    apiFetch<any[]>(token, '/api/clients').then(setClients).catch(e => setError(e.message));
  }, [token]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return clients
      .filter(c => !q || String(c.name || '').toLowerCase().includes(q) || (qd.length >= 3 && String(c.cpfCnpj || '').replace(/\D/g, '').includes(qd)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [clients, busca]);

  const vincular = async () => {
    if (!clienteId) { setError('Selecione a empresa (cliente) que deve receber a nota.'); return; }
    setLoading(true); setError('');
    try {
      const r = await apiFetch<any>(token, `/api/inter/entradas/${encodeURIComponent(entrada.idTransacao)}/vincular`, {
        method: 'POST',
        body: { clienteId, lembrar: lembrar && podeLembrar, pagador: { cpfCnpj: doc, nome: pagador.nome } },
      });
      onDone(r.lembrado
        ? `Pagador vinculado a ${r.cliente?.name}. Os próximos pagamentos de ${pagador.nome || fmtDoc(doc)} já entram como dessa empresa.`
        : `Recebimento vinculado a ${r.cliente?.name}.`);
      onClose();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const desvincular = async () => {
    setLoading(true); setError('');
    try {
      await apiFetch(token, `/api/inter/entradas/${encodeURIComponent(entrada.idTransacao)}/vincular`, { method: 'DELETE' });
      onDone('Vínculo manual removido deste recebimento.');
      onClose();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  // Cadastra o próprio pagador como cliente (caso em que ele mesmo é o tomador).
  const cadastrar = async () => {
    setCreating(true); setError('');
    try {
      let dados: any = { name: String(pagador.nome || '').trim() || fmtDoc(doc), cpfCnpj: doc };
      if (doc.length === 14) {
        try {
          const r = await apiFetch<any>(token, `/api/receitaws/${doc}`);
          if (r && r.status !== 'ERROR') {
            dados = {
              ...dados, name: r.nome || dados.name, logradouro: r.logradouro || '', numero: r.numero || '', complemento: r.complemento || '',
              bairro: r.bairro || '', municipioUf: r.municipio && r.uf ? `${r.municipio}/${r.uf}` : '', cep: String(r.cep || '').replace(/\D/g, ''),
              telefone: r.telefone || '', email: r.email || '',
            };
          }
        } catch { /* cadastra só com nome e documento */ }
      }
      const res = await apiFetch<any>(token, '/api/clients', { method: 'POST', body: dados });
      onDone(`${res.client.name} cadastrado como cliente.`);
      onClose();
    } catch (e: any) { setError(e.message); } finally { setCreating(false); }
  };

  const selecionado = clients.find(c => c.id === clienteId);

  return (
    <Modal
      title="Vincular recebimento a uma empresa"
      subtitle="Use quando o pagamento foi feito por outra pessoa: sócio, pessoa física, parente ou outra empresa."
      onClose={onClose}
      width="max-w-xl"
      footer={<>
        {entrada?.marcacao?.clienteId && <Btn variant="ghost" className="mr-auto" icon={<Unlink size={14} />} onClick={desvincular} disabled={loading}>Remover vínculo</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" icon={<Link2 size={15} />} loading={loading} onClick={vincular} disabled={!clienteId}>Vincular</Btn>
      </>}
    >
      {error && <Alert type="error">{error}</Alert>}
      <div className="rounded-lg border border-brand-border bg-brand-bg p-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-orange-dim">Quem pagou</div>
          <div className="font-semibold text-brand-forest truncate">{pagador.nome || entrada?.titulo || 'Pagador sem nome'}</div>
          <div className="text-brand-muted font-mono text-[12px]">{docValido ? fmtDoc(doc) : 'sem CPF/CNPJ no extrato'}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="font-serif text-[20px] font-semibold text-brand-forest tabular">{brl(entrada?.valor)}</div>
          <div className="text-brand-muted text-[12px]">{fmtDate(entrada?.data)}</div>
        </div>
      </div>

      <Field label="Empresa (cliente) que recebe a NFS-e">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" placeholder="Buscar por nome ou CNPJ…" autoFocus />
        </div>
      </Field>
      <div className="border border-brand-border rounded-lg max-h-64 overflow-y-auto divide-y divide-brand-border">
        {lista.length === 0 && <div className="p-4 text-[13px] text-brand-muted text-center">Nenhum cliente encontrado.</div>}
        {lista.map(c => (
          <label key={c.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${clienteId === c.id ? 'bg-brand-orange-soft' : 'hover:bg-brand-surface2'}`}>
            <input type="radio" name="vincular-cliente" className="accent-brand-orange w-4 h-4 shrink-0" checked={clienteId === c.id} onChange={() => setClienteId(c.id)} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-brand-text truncate">{c.name}</div>
              <div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(c.cpfCnpj || c.cnpj) || '—'}{Array.isArray(c.pagadores) && c.pagadores.length ? ` · ${c.pagadores.length} pagador(es) vinculado(s)` : ''}</div>
            </div>
          </label>
        ))}
      </div>

      {podeLembrar ? (
        <label className="flex items-start gap-2.5 text-[13px] cursor-pointer select-none">
          <input type="checkbox" className="accent-brand-green w-4 h-4 mt-0.5" checked={lembrar} onChange={e => setLembrar(e.target.checked)} />
          <span>
            <b className="text-brand-forest">Lembrar este pagador</b>
            <span className="block text-brand-muted text-[12px]">
              Os próximos pagamentos de {pagador.nome || fmtDoc(doc)}{docValido ? ` (${fmtDoc(doc)})` : ''} entram automaticamente
              {selecionado ? ` como de ${selecionado.name}` : ' como da empresa escolhida'}. Desmarque para vincular só este recebimento.
            </span>
          </span>
        </label>
      ) : (
        <Alert type="info">O extrato não trouxe nome nem CPF/CNPJ do pagador: o vínculo vale só para este recebimento.</Alert>
      )}

      {docValido && !entrada?.cliente && (
        <div className="text-[12.5px] text-brand-muted flex flex-wrap items-center gap-2 pt-1 border-t border-brand-border">
          <span className="pt-3">O próprio pagador é o tomador do serviço?</span>
          <Btn className="mt-3" icon={<UserPlus size={14} />} loading={creating} onClick={cadastrar}>Cadastrar como cliente</Btn>
        </div>
      )}
    </Modal>
  );
}
