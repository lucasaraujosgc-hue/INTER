import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { apiFetch, isoDate, fmtDoc } from '../lib/api';
import { Modal, Field, Input, Select, Textarea, Btn, Alert, JsonView } from './ui';

export default function NovaCobrancaModal({ token, onClose, onSuccess, inicial }: { token: string; onClose: () => void; onSuccess?: () => void; inicial?: { clienteId?: string; valor?: number } }) {
  const [clients, setClients] = useState<any[]>([]);
  const [form, setForm] = useState({
    clienteId: inicial?.clienteId || '',
    valor: inicial?.valor || 300,
    vencimento: isoDate(10),
    descricao: '',
    competencia: new Date().toISOString().slice(0, 7),
    multaPerc: 2,
    jurosMes: 1,
    mensagemBoleto: '',
    numDiasAgenda: 30,
  });
  const [boleto, setBoleto] = useState(true);
  const [nfse, setNfse] = useState<'nao' | 'agora' | 'ao_pagar'>('ao_pagar');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [xml, setXml] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    apiFetch<any[]>(token, '/api/clients').then(setClients).catch(e => setError(e.message));
    apiFetch<any>(token, '/api/settings').then(s => setForm(f => ({ ...f, descricao: s.nfse?.descricaoPadrao || '' }))).catch(() => undefined);
  }, [token]);

  useEffect(() => { if (!boleto && nfse === 'ao_pagar') setNfse('agora'); }, [boleto, nfse]);

  const cliente = clients.find(c => c.id === form.clienteId);

  const salvar = async () => {
    if (!cliente) { setError('Selecione o cliente.'); return; }
    setLoading(true); setError(''); setXml(''); setSuccess('');
    try {
      const r = await apiFetch<any>(token, '/api/cobrancas', {
        method: 'POST',
        body: {
          clienteId: cliente.id,
          cliente: cliente.name,
          valor: Number(form.valor),
          vencimento: form.vencimento,
          descricao: form.descricao,
          competencia: form.competencia,
          mensagemBoleto: form.mensagemBoleto,
          numDiasAgenda: Number(form.numDiasAgenda),
          multa: Number(form.multaPerc) > 0 ? { codigo: 'PERCENTUAL', taxa: Number(form.multaPerc) } : null,
          mora: Number(form.jurosMes) > 0 ? { codigo: 'TAXAMENSAL', taxa: Number(form.jurosMes) } : null,
          toggles: { boleto, nfse: nfse !== 'nao', nfseAoPagar: nfse === 'ao_pagar' },
        },
      });
      setSuccess(r.message);
      onSuccess?.();
      setTimeout(onClose, 2500);
    } catch (e: any) {
      setError(e.message);
      setXml(e.data?.xmlPreview || '');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Nova cobrança" subtitle="Boleto com Pix no Banco Inter + NFS-e nacional" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" icon={<Check size={15} />} loading={loading} onClick={salvar} disabled={!!success}>Criar cobrança</Btn>
      </>}>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Cliente" className="md:col-span-2">
          <Select value={form.clienteId} onChange={e => setForm({ ...form, clienteId: e.target.value })}
            options={[{ value: '', label: 'Selecione o cliente…' }, ...clients.map(c => ({ value: c.id, label: `${c.name}${c.cpfCnpj ? ` — ${fmtDoc(c.cpfCnpj)}` : ''}` }))]} />
        </Field>
        <Field label="Valor (R$)"><Input type="number" step="0.01" min="2.5" value={form.valor} onChange={e => setForm({ ...form, valor: Number(e.target.value) })} /></Field>
        <Field label="Vencimento"><Input type="date" value={form.vencimento} onChange={e => setForm({ ...form, vencimento: e.target.value })} /></Field>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between p-3 bg-brand-surface2 rounded-lg border border-brand-border cursor-pointer">
          <span><span className="text-[13px] font-medium text-brand-text block">Gerar boleto com Pix (Banco Inter)</span><span className="text-[11px] text-brand-muted">Emite a cobrança na API Cobrança v3; o cliente paga por boleto ou QR Code Pix.</span></span>
          <input type="checkbox" className="accent-brand-green w-5 h-5" checked={boleto} onChange={e => setBoleto(e.target.checked)} />
        </label>
        <Field label="NFS-e">
          <Select value={nfse} onChange={e => setNfse(e.target.value as any)} options={[
            ...(boleto ? [{ value: 'ao_pagar', label: 'Emitir automaticamente quando o pagamento for confirmado' }] : []),
            { value: 'agora', label: 'Emitir agora' },
            { value: 'nao', label: 'Não emitir' },
          ]} />
        </Field>
      </div>

      {boleto && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Multa (%)"><Input type="number" step="0.01" value={form.multaPerc} onChange={e => setForm({ ...form, multaPerc: Number(e.target.value) })} /></Field>
          <Field label="Juros (% ao mês)"><Input type="number" step="0.01" value={form.jurosMes} onChange={e => setForm({ ...form, jurosMes: Number(e.target.value) })} /></Field>
          <Field label="Dias para baixa após vencimento"><Input type="number" min="0" max="60" value={form.numDiasAgenda} onChange={e => setForm({ ...form, numDiasAgenda: Number(e.target.value) })} /></Field>
          <Field label="Mensagem no boleto (opcional)" className="md:col-span-3"><Input maxLength={390} value={form.mensagemBoleto} onChange={e => setForm({ ...form, mensagemBoleto: e.target.value })} /></Field>
        </div>
      )}

      {nfse !== 'nao' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Competência da NFS-e"><Input type="month" value={form.competencia} onChange={e => setForm({ ...form, competencia: e.target.value })} /></Field>
          <div />
          <Field label="Descrição do serviço (NFS-e)" className="md:col-span-2"><Textarea rows={3} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></Field>
        </div>
      )}
      {xml && <details className="text-[12px] text-brand-muted"><summary className="cursor-pointer">XML da DPS</summary><JsonView data={xml} /></details>}
    </Modal>
  );
}
