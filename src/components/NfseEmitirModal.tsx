import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, UserPlus } from 'lucide-react';
import { apiFetch, brl, fmtDoc } from '../lib/api';
import { Modal, Field, Input, Select, Textarea, Btn, Alert, JsonView } from './ui';

export interface NfseInicial {
  clienteId?: string;
  cliente?: string;
  valor?: number;
  competencia?: string; // AAAA-MM
  descricao?: string;
  pagador?: { nome?: string; cpfCnpj?: string }; // dados de quem pagou (entrada do Inter)
}

export default function NfseEmitirModal({ token, inicial, origem, titulo, onClose, onSuccess }: {
  token: string;
  inicial?: NfseInicial;
  origem?: Record<string, any>;
  titulo?: string;
  onClose: () => void;
  onSuccess?: (nfse: any) => void;
}) {
  const [clients, setClients] = useState<any[]>([]);
  const [cfg, setCfg] = useState<any>(null);
  const [form, setForm] = useState({
    clienteId: inicial?.clienteId || '',
    valor: inicial?.valor ?? 0,
    competencia: inicial?.competencia || new Date().toISOString().slice(0, 7),
    descricao: inicial?.descricao || '',
    cTribNac: '',
    pAliq: '',
    tpRetISSQN: '1',
  });
  const [loading, setLoading] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [error, setError] = useState('');
  const [erros, setErros] = useState<any[]>([]);
  const [xmlPreview, setXmlPreview] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    apiFetch<any[]>(token, '/api/clients').then(list => {
      setClients(list);
      if (!form.clienteId && inicial?.cliente) {
        const c = list.find(x => x.name === inicial.cliente);
        if (c) setForm(f => ({ ...f, clienteId: c.id }));
      }
    }).catch(e => setError(e.message));
    apiFetch<any>(token, '/api/settings').then(s => {
      setCfg(s.nfse);
      setForm(f => ({
        ...f,
        descricao: f.descricao || s.nfse?.descricaoPadrao || '',
        cTribNac: s.nfse?.cTribNac || '17.19',
        pAliq: s.nfse?.pAliq !== '' && s.nfse?.pAliq != null ? String(s.nfse.pAliq) : '',
        tpRetISSQN: s.nfse?.tpRetISSQN || '1',
      }));
    }).catch(() => undefined);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const cliente = useMemo(() => clients.find(c => c.id === form.clienteId), [clients, form.clienteId]);
  const pagadorDoc = String(inicial?.pagador?.cpfCnpj || '').replace(/\D/g, '');
  const podeCriarCliente = !form.clienteId && !!inicial?.pagador?.nome && (pagadorDoc.length === 11 || pagadorDoc.length === 14);

  const criarCliente = async () => {
    setCreatingClient(true);
    setError('');
    try {
      let dados: any = { name: inicial!.pagador!.nome!.trim(), cpfCnpj: pagadorDoc };
      if (pagadorDoc.length === 14) {
        try {
          const r = await apiFetch<any>(token, `/api/receitaws/${pagadorDoc}`);
          if (r && r.status !== 'ERROR') {
            dados = {
              ...dados,
              name: r.nome || dados.name,
              logradouro: r.logradouro || '',
              numero: r.numero || '',
              complemento: r.complemento || '',
              bairro: r.bairro || '',
              municipioUf: r.municipio && r.uf ? `${r.municipio}/${r.uf}` : '',
              cep: String(r.cep || '').replace(/\D/g, ''),
              telefone: r.telefone || '',
              email: r.email || '',
            };
          }
        } catch { /* cadastra só com nome e documento */ }
      }
      const res = await apiFetch<any>(token, '/api/clients', { method: 'POST', body: dados });
      setClients(prev => [...prev, res.client]);
      setForm(f => ({ ...f, clienteId: res.client.id }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingClient(false);
    }
  };

  const emitir = async () => {
    if (!form.clienteId) { setError('Selecione o cliente (tomador).'); return; }
    if (!(Number(form.valor) > 0)) { setError('Informe o valor.'); return; }
    setLoading(true);
    setError(''); setErros([]); setXmlPreview(''); setSuccess('');
    try {
      const r = await apiFetch<any>(token, '/api/nfse/emitir', {
        method: 'POST',
        body: {
          clienteId: form.clienteId,
          cliente: cliente?.name,
          valor: Number(form.valor),
          competencia: form.competencia,
          descricao: form.descricao,
          cTribNac: form.cTribNac,
          pAliq: form.pAliq,
          tpRetISSQN: form.tpRetISSQN,
          origem,
        },
      });
      setSuccess(r.message);
      onSuccess?.(r.nfse);
      setTimeout(onClose, 1800);
    } catch (e: any) {
      setError(e.message);
      setErros(e.data?.erros || []);
      setXmlPreview(e.data?.xmlPreview || '');
    } finally {
      setLoading(false);
    }
  };

  const enderecoIncompleto = cliente && (!cliente.cep || !cliente.logradouro || !cliente.bairro);

  return (
    <Modal
      title={titulo || 'Emitir NFS-e (padrão nacional)'}
      subtitle={cfg ? `${cfg.provedor === 'webiss' ? 'WebISS (legado)' : 'Sefin Nacional'} · ${cfg.ambiente === '2' ? 'Produção restrita (teste)' : 'Produção'} · DPS série ${cfg.serie} nº ${cfg.proximoNumero}` : 'Carregando configuração…'}
      onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" loading={loading} icon={<Receipt size={15} />} onClick={emitir} disabled={!!success}>Emitir NFS-e</Btn>
      </>}
    >
      {cfg?.ambiente === '2' && <Alert type="warn">Ambiente de PRODUÇÃO RESTRITA: a nota é de teste e não tem valor fiscal.</Alert>}
      {error && <Alert type="error">{error}{erros.length > 0 && <ul className="mt-2 list-disc ml-4">{erros.map((x, i) => <li key={i}>{x.codigo ? `[${x.codigo}] ` : ''}{x.descricao}{x.complemento ? ` — ${x.complemento}` : ''}</li>)}</ul>}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {inicial?.pagador?.nome && (
        <div className="text-[12px] text-brand-muted bg-brand-surface2 rounded-lg p-3 flex flex-wrap items-center gap-2">
          <span>Pagador no banco: <b className="text-brand-text">{inicial.pagador.nome}</b> {pagadorDoc && `(${fmtDoc(pagadorDoc)})`}</span>
          {inicial.valor ? <span>· Valor recebido: <b className="text-brand-text">{brl(inicial.valor)}</b></span> : null}
          {podeCriarCliente && <Btn className="ml-auto" icon={<UserPlus size={14} />} loading={creatingClient} onClick={criarCliente}>Cadastrar como cliente</Btn>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Cliente (tomador)" className="md:col-span-2">
          <Select value={form.clienteId} onChange={e => setForm({ ...form, clienteId: e.target.value })}
            options={[{ value: '', label: 'Selecione o cliente…' }, ...clients.map(c => ({ value: c.id, label: `${c.name}${c.cpfCnpj ? ` — ${fmtDoc(c.cpfCnpj)}` : ''}` }))]} />
        </Field>
        {enderecoIncompleto && (
          <div className="md:col-span-2"><Alert type="info">O cadastro deste cliente está sem endereço completo; a NFS-e será emitida só com CPF/CNPJ e nome do tomador.</Alert></div>
        )}
        <Field label="Valor do serviço (R$)"><Input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm({ ...form, valor: Number(e.target.value) })} /></Field>
        <Field label="Competência"><Input type="month" value={form.competencia} onChange={e => setForm({ ...form, competencia: e.target.value })} /></Field>
        <Field label="Código de tributação nacional" hint="Item da LC 116 (ex.: 17.19) ou código de 6 dígitos (171901).">
          <Input value={form.cTribNac} onChange={e => setForm({ ...form, cTribNac: e.target.value })} />
        </Field>
        <Field label="Retenção do ISSQN">
          <Select value={form.tpRetISSQN} onChange={e => setForm({ ...form, tpRetISSQN: e.target.value })}
            options={[{ value: '1', label: 'Não retido' }, { value: '2', label: 'Retido pelo tomador' }, { value: '3', label: 'Retido pelo intermediário' }]} />
        </Field>
        <Field label="Alíquota ISS (%) — opcional" hint="Deixe vazio para usar a alíquota parametrizada pelo município.">
          <Input type="number" step="0.01" value={form.pAliq} onChange={e => setForm({ ...form, pAliq: e.target.value })} />
        </Field>
        <Field label="Descrição do serviço" className="md:col-span-2">
          <Textarea rows={4} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
        </Field>
      </div>
      {xmlPreview && (
        <details className="text-[12px] text-brand-muted">
          <summary className="cursor-pointer">XML da DPS enviada</summary>
          <JsonView data={xmlPreview} />
        </details>
      )}
    </Modal>
  );
}
