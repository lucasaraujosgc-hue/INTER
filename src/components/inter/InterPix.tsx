import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, Plus, Undo2, Eye, Ban, Unlink } from 'lucide-react';
import { apiFetch, brl, fmtDateTime, fmtDoc, isoDate, pixRange, fmtDate } from '../../lib/api';
import { Card, Btn, Badge, DataTable, DateRange, Field, Input, Select, Alert, IconBtn, useLoader, Modal, CopyBtn, JsonView, JsonEditor, Tabs, Textarea } from '../ui';

const SUB = [
  { id: 'recebidos', label: 'Pix recebidos' },
  { id: 'cob', label: 'Cobranças imediatas' },
  { id: 'cobv', label: 'Cobranças com vencimento' },
  { id: 'lotecobv', label: 'Lotes (cobv)' },
  { id: 'loc', label: 'Payloads (locations)' },
];

const STATUS_COR: Record<string, any> = { ATIVA: 'amber', CONCLUIDA: 'green', REMOVIDA_PELO_USUARIO_RECEBEDOR: 'gray', REMOVIDA_PELO_PSP: 'gray' };

export function QrPix({ payload }: { payload: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(payload, { margin: 1, width: 220 }).then(setSrc).catch(() => setSrc('')); }, [payload]);
  return (
    <div className="flex flex-col items-center gap-2">
      {src && <img src={src} alt="QR Code Pix" className="w-44 h-44 bg-white rounded-lg p-1" />}
      <div className="text-[11px] font-mono break-all text-brand-muted max-w-sm text-center">{payload}</div>
      <CopyBtn text={payload} label="Copiar Pix copia e cola" />
    </div>
  );
}

export default function InterPix({ token }: { token: string }) {
  const [sub, setSub] = useState('recebidos');
  const [inicio, setInicio] = useState(isoDate(-7));
  const [fim, setFim] = useState(isoDate());
  const [chave, setChave] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { apiFetch<any>(token, '/api/inter/status').then(s => setChave(s.chavePix || '')).catch(() => undefined); }, [token]);

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={SUB} active={sub} onChange={setSub} />
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} />
      {sub === 'recebidos' && <Recebidos token={token} inicio={inicio} fim={fim} setMsg={setMsg} />}
      {sub === 'cob' && <Cobs token={token} tipo="cob" inicio={inicio} fim={fim} chave={chave} setMsg={setMsg} />}
      {sub === 'cobv' && <Cobs token={token} tipo="cobv" inicio={inicio} fim={fim} chave={chave} setMsg={setMsg} />}
      {sub === 'lotecobv' && <Lotes token={token} inicio={inicio} fim={fim} chave={chave} setMsg={setMsg} />}
      {sub === 'loc' && <Locs token={token} inicio={inicio} fim={fim} setMsg={setMsg} />}
    </div>
  );
}

type SetMsg = (m: { type: 'success' | 'error'; text: string } | null) => void;

function Recebidos({ token, inicio, fim, setMsg }: { token: string; inicio: string; fim: string; setMsg: SetMsg }) {
  const lista = useLoader(() => apiFetch<any>(token, '/api/inter/pix/recebidos', { query: { ...pixRange(inicio, fim), 'paginacao.itensPorPagina': 1000 } }), [token], { pix: [] });
  const [devolver, setDevolver] = useState<any>(null);
  const [ver, setVer] = useState<any>(null);
  return (
    <Card title="Pix recebidos" subtitle={`${lista.data?.pix?.length || 0} no período`} actions={<Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn>}>
      {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
      <DataTable loading={lista.loading} rows={lista.data?.pix || []} rowKey={(p: any) => p.endToEndId} columns={[
        { key: 'h', label: 'Horário', render: (p: any) => <span className="text-brand-muted whitespace-nowrap">{fmtDateTime(p.horario)}</span> },
        { key: 'pag', label: 'Pagador', render: (p: any) => <div><div className="font-medium">{p.pagador?.nome || '—'}</div><div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(p.pagador?.cpf || p.pagador?.cnpj)}</div></div> },
        { key: 'info', label: 'Informação', render: (p: any) => <span className="text-brand-muted">{p.infoPagador || p.txid || ''}</span> },
        { key: 'dev', label: 'Devoluções', render: (p: any) => (p.devolucoes || []).length ? <Badge color="gray">{p.devolucoes.length} · {brl(p.devolucoes.reduce((a: number, d: any) => a + Number(d.valor), 0))}</Badge> : null },
        { key: 'v', label: 'Valor', align: 'right', render: (p: any) => <span className="font-mono text-brand-green">{brl(p.valor)}</span> },
        { key: 'a', label: '', align: 'right', render: (p: any) => <div className="flex gap-1 justify-end"><IconBtn title="Detalhes" onClick={() => setVer(p)}><Eye size={13} /></IconBtn><IconBtn title="Devolver" onClick={() => setDevolver(p)}><Undo2 size={13} /></IconBtn></div> },
      ]} />
      {ver && <Modal title="Pix recebido" subtitle={ver.endToEndId} onClose={() => setVer(null)}><JsonView data={ver} /></Modal>}
      {devolver && <DevolucaoModal token={token} pix={devolver} onClose={() => setDevolver(null)} onDone={t => { setMsg({ type: 'success', text: t }); lista.reload(); }} />}
    </Card>
  );
}

function DevolucaoModal({ token, pix, onClose, onDone }: { token: string; pix: any; onClose: () => void; onDone: (t: string) => void }) {
  const [valor, setValor] = useState(Number(pix.valor));
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    if (!confirm(`Confirmar devolução de ${brl(valor)} para ${pix.pagador?.nome || 'o pagador'}?`)) return;
    setLoading(true); setErr('');
    try {
      const r = await apiFetch<any>(token, `/api/inter/pix/recebidos/${encodeURIComponent(pix.endToEndId)}/devolucao`, { method: 'PUT', body: { valor, descricao, natureza: 'ORIGINAL' } });
      onDone(`Devolução solicitada (${r.status || 'em processamento'}).`);
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal title="Devolver Pix" subtitle={`${pix.pagador?.nome || ''} · ${brl(pix.valor)}`} onClose={onClose} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>Voltar</Btn><Btn variant="danger" loading={loading} onClick={go}>Devolver</Btn></>}>
      {err && <Alert type="error">{err}</Alert>}
      <Field label="Valor a devolver (R$)"><Input type="number" step="0.01" max={pix.valor} value={valor} onChange={e => setValor(Number(e.target.value))} /></Field>
      <Field label="Descrição (opcional)"><Input maxLength={140} value={descricao} onChange={e => setDescricao(e.target.value)} /></Field>
    </Modal>
  );
}

function Cobs({ token, tipo, inicio, fim, chave, setMsg }: { token: string; tipo: 'cob' | 'cobv'; inicio: string; fim: string; chave: string; setMsg: SetMsg }) {
  const lista = useLoader(() => apiFetch<any>(token, `/api/inter/pix/${tipo}`, { query: { ...pixRange(inicio, fim), 'paginacao.itensPorPagina': 1000 } }), [token, tipo], { cobs: [] });
  const [nova, setNova] = useState(false);
  const [ver, setVer] = useState<any>(null);
  const remover = async (c: any) => {
    if (!confirm('Remover esta cobrança Pix? O QR Code deixará de aceitar pagamentos.')) return;
    try {
      await apiFetch(token, `/api/inter/pix/${tipo}/${c.txid}`, { method: 'PATCH', body: { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' } });
      setMsg({ type: 'success', text: 'Cobrança Pix removida.' });
      lista.reload();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  const rows = lista.data?.cobs || [];
  return (
    <Card title={tipo === 'cob' ? 'Cobranças Pix imediatas' : 'Cobranças Pix com vencimento'} subtitle={`${rows.length} no período (por data de criação)`}
      actions={<><Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn><Btn variant="primary" icon={<Plus size={14} />} onClick={() => setNova(true)}>Nova</Btn></>}>
      {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
      <DataTable loading={lista.loading} rows={rows} rowKey={(c: any) => c.txid} columns={[
        { key: 'c', label: tipo === 'cob' ? 'Criação' : 'Vencimento', render: (c: any) => <span className="text-brand-muted">{tipo === 'cob' ? fmtDateTime(c.calendario?.criacao) : fmtDate(c.calendario?.dataDeVencimento)}</span> },
        { key: 'd', label: 'Devedor', render: (c: any) => <div><div>{c.devedor?.nome || '—'}</div><div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(c.devedor?.cpf || c.devedor?.cnpj)}</div></div> },
        { key: 's', label: 'Status', render: (c: any) => <Badge color={STATUS_COR[c.status] || 'gray'}>{c.status}</Badge> },
        { key: 'v', label: 'Valor', align: 'right', render: (c: any) => <span className="font-mono">{brl(c.valor?.original)}</span> },
        { key: 'a', label: '', align: 'right', render: (c: any) => <div className="flex gap-1 justify-end"><IconBtn title="Ver / QR Code" onClick={() => setVer(c)}><Eye size={13} /></IconBtn>{c.status === 'ATIVA' && <IconBtn danger title="Remover" onClick={() => remover(c)}><Ban size={13} /></IconBtn>}</div> },
      ]} />
      {ver && (
        <Modal title={`Cobrança Pix (${tipo})`} subtitle={ver.txid} onClose={() => setVer(null)}>
          {ver.pixCopiaECola && <QrPix payload={ver.pixCopiaECola} />}
          <JsonView data={ver} />
        </Modal>
      )}
      {nova && <NovaCobPix token={token} tipo={tipo} chave={chave} onClose={() => setNova(false)} onDone={(c) => { setVer(c); lista.reload(); }} />}
    </Card>
  );
}

function NovaCobPix({ token, tipo, chave, onClose, onDone }: { token: string; tipo: 'cob' | 'cobv'; chave: string; onClose: () => void; onDone: (c: any) => void }) {
  const [f, setF] = useState({ valor: 100, chave, doc: '', nome: '', solicitacao: '', expiracao: 86400, vencimento: isoDate(7), validade: 30, multa: 2, juros: 1, permiteAlterar: false });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setLoading(true); setErr('');
    const doc = f.doc.replace(/\D/g, '');
    const devedor = doc ? { [doc.length === 11 ? 'cpf' : 'cnpj']: doc, nome: f.nome } : undefined;
    try {
      let r: any;
      if (tipo === 'cob') {
        r = await apiFetch(token, '/api/inter/pix/cob', {
          method: 'POST',
          body: {
            calendario: { expiracao: Number(f.expiracao) },
            ...(devedor ? { devedor } : {}),
            valor: { original: Number(f.valor).toFixed(2), modalidadeAlteracao: f.permiteAlterar ? 1 : 0 },
            chave: f.chave,
            ...(f.solicitacao ? { solicitacaoPagador: f.solicitacao } : {}),
          },
        });
      } else {
        if (!devedor) throw new Error('Cobrança com vencimento exige CPF/CNPJ e nome do devedor.');
        const { txid } = await apiFetch<any>(token, '/api/inter/pix/novo-txid');
        r = await apiFetch(token, `/api/inter/pix/cobv/${txid}`, {
          method: 'PUT',
          body: {
            calendario: { dataDeVencimento: f.vencimento, validadeAposVencimento: Number(f.validade) },
            devedor,
            valor: {
              original: Number(f.valor).toFixed(2),
              ...(Number(f.multa) > 0 ? { multa: { modalidade: 2, valorPerc: Number(f.multa).toFixed(2) } } : {}),
              ...(Number(f.juros) > 0 ? { juros: { modalidade: 2, valorPerc: Number(f.juros).toFixed(2) } } : {}),
            },
            chave: f.chave,
            ...(f.solicitacao ? { solicitacaoPagador: f.solicitacao } : {}),
          },
        });
      }
      onDone(r);
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal title={tipo === 'cob' ? 'Nova cobrança Pix imediata' : 'Nova cobrança Pix com vencimento'} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Fechar</Btn><Btn variant="primary" loading={loading} onClick={go}>Gerar QR Code</Btn></>}>
      {err && <Alert type="error">{err}</Alert>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Valor (R$)"><Input type="number" step="0.01" value={f.valor} onChange={e => setF({ ...f, valor: Number(e.target.value) })} /></Field>
        <Field label="Chave Pix recebedora"><Input value={f.chave} onChange={e => setF({ ...f, chave: e.target.value })} /></Field>
        <Field label={`CPF/CNPJ do devedor${tipo === 'cob' ? ' (opcional)' : ''}`}><Input value={f.doc} onChange={e => setF({ ...f, doc: e.target.value })} /></Field>
        <Field label="Nome do devedor"><Input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Field>
        {tipo === 'cob' ? (
          <>
            <Field label="Expira em (segundos)"><Input type="number" value={f.expiracao} onChange={e => setF({ ...f, expiracao: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-[13px] self-end pb-2"><input type="checkbox" className="accent-brand-green" checked={f.permiteAlterar} onChange={e => setF({ ...f, permiteAlterar: e.target.checked })} />Pagador pode alterar o valor</label>
          </>
        ) : (
          <>
            <Field label="Vencimento"><Input type="date" value={f.vencimento} onChange={e => setF({ ...f, vencimento: e.target.value })} /></Field>
            <Field label="Validade após vencimento (dias)"><Input type="number" value={f.validade} onChange={e => setF({ ...f, validade: Number(e.target.value) })} /></Field>
            <Field label="Multa (%)"><Input type="number" step="0.01" value={f.multa} onChange={e => setF({ ...f, multa: Number(e.target.value) })} /></Field>
            <Field label="Juros (% ao mês)"><Input type="number" step="0.01" value={f.juros} onChange={e => setF({ ...f, juros: Number(e.target.value) })} /></Field>
          </>
        )}
        <Field label="Mensagem ao pagador" className="md:col-span-2"><Textarea rows={2} maxLength={140} value={f.solicitacao} onChange={e => setF({ ...f, solicitacao: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function Lotes({ token, inicio, fim, chave, setMsg }: { token: string; inicio: string; fim: string; chave: string; setMsg: SetMsg }) {
  // O Inter responde 404 quando não há nenhum lote no período: tratamos como lista vazia.
  const lista = useLoader(() => apiFetch<any>(token, '/api/inter/pix/lotecobv', { query: { ...pixRange(inicio, fim) } })
    .catch((e: any) => { if (e.status === 404) return { lotes: [] }; throw e; }), [token], {});
  const [ver, setVer] = useState<any>(null);
  const [novo, setNovo] = useState(false);
  const exemplo = JSON.stringify({
    descricao: 'Cobranças do mês',
    cobsv: [{
      txid: 'SUBSTITUA_POR_TXID_UNICO_26_A_35_CARACTERES',
      calendario: { dataDeVencimento: isoDate(10), validadeAposVencimento: 30 },
      devedor: { cnpj: '00000000000000', nome: 'Cliente' },
      valor: { original: '100.00' },
      chave,
    }],
  }, null, 2);
  const [body, setBody] = useState(exemplo);
  const [id, setId] = useState(String(Date.now()).slice(-9));
  const abrir = async (loteId: string) => {
    try {
      const [lote, sumario] = await Promise.all([
        apiFetch(token, `/api/inter/pix/lotecobv/${loteId}`),
        apiFetch(token, `/api/inter/pix/lotecobv/${loteId}/sumario`).catch(() => null),
      ]);
      setVer({ lote, sumario });
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  const criar = async () => {
    try {
      await apiFetch(token, `/api/inter/pix/lotecobv/${id}`, { method: 'PUT', body: JSON.parse(body) });
      setMsg({ type: 'success', text: `Lote ${id} enviado.` });
      setNovo(false);
      lista.reload();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  const rows = lista.data?.lotes || lista.data?.loteCobV || [];
  return (
    <Card title="Lotes de cobranças com vencimento" actions={<><Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn><Btn variant="primary" icon={<Plus size={14} />} onClick={() => setNovo(true)}>Novo lote</Btn></>}>
      {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
      <DataTable loading={lista.loading} rows={rows} rowKey={(l: any, i) => String(l.id ?? i)} columns={[
        { key: 'id', label: 'Lote', render: (l: any) => <span className="font-mono">{l.id}</span> },
        { key: 'd', label: 'Descrição', render: (l: any) => l.descricao },
        { key: 'c', label: 'Criação', render: (l: any) => fmtDateTime(l.criacao) },
        { key: 'a', label: '', align: 'right', render: (l: any) => <IconBtn title="Abrir" onClick={() => abrir(l.id)}><Eye size={13} /></IconBtn> },
      ]} />
      {ver && <Modal title="Lote de cobranças" onClose={() => setVer(null)}><JsonView data={ver} maxHeight="max-h-[60vh]" /></Modal>}
      {novo && (
        <Modal title="Novo lote de cobranças com vencimento" subtitle="Corpo conforme a API Pix (PUT /lotecobv/{id})" onClose={() => setNovo(false)}
          footer={<><Btn variant="ghost" onClick={() => setNovo(false)}>Fechar</Btn><Btn variant="primary" onClick={criar}>Enviar lote</Btn></>}>
          <Field label="Id do lote (numérico)"><Input value={id} onChange={e => setId(e.target.value.replace(/\D/g, ''))} /></Field>
          <JsonEditor value={body} onChange={setBody} rows={18} />
        </Modal>
      )}
    </Card>
  );
}

function Locs({ token, inicio, fim, setMsg }: { token: string; inicio: string; fim: string; setMsg: SetMsg }) {
  const lista = useLoader(() => apiFetch<any>(token, '/api/inter/pix/loc', { query: { ...pixRange(inicio, fim), 'paginacao.itensPorPagina': 1000 } }), [token], { loc: [] });
  const [tipoCob, setTipoCob] = useState('cob');
  const criar = async () => {
    try {
      const r = await apiFetch<any>(token, '/api/inter/pix/loc', { method: 'POST', body: { tipoCob } });
      setMsg({ type: 'success', text: `Location ${r.id} criada: ${r.location}` });
      lista.reload();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  const desvincular = async (l: any) => {
    if (!confirm('Desvincular o txid desta location?')) return;
    try { await apiFetch(token, `/api/inter/pix/loc/${l.id}/txid`, { method: 'DELETE' }); lista.reload(); } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  return (
    <Card title="Payloads (locations)" actions={<>
      <Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn>
      <Select value={tipoCob} onChange={e => setTipoCob(e.target.value)} options={[{ value: 'cob', label: 'cob' }, { value: 'cobv', label: 'cobv' }]} className="!w-24" />
      <Btn variant="primary" icon={<Plus size={14} />} onClick={criar}>Criar location</Btn>
    </>}>
      {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
      <DataTable loading={lista.loading} rows={lista.data?.loc || []} rowKey={(l: any) => String(l.id)} columns={[
        { key: 'id', label: 'Id', render: (l: any) => <span className="font-mono">{l.id}</span> },
        { key: 't', label: 'Tipo', render: (l: any) => l.tipoCob },
        { key: 'l', label: 'Location', render: (l: any) => <span className="font-mono text-[11.5px] break-all">{l.location}</span> },
        { key: 'x', label: 'txid', render: (l: any) => <span className="font-mono text-[11.5px]">{l.txid || '—'}</span> },
        { key: 'c', label: 'Criação', render: (l: any) => fmtDateTime(l.criacao) },
        { key: 'a', label: '', align: 'right', render: (l: any) => l.txid ? <IconBtn title="Desvincular txid" onClick={() => desvincular(l)}><Unlink size={13} /></IconBtn> : null },
      ]} />
    </Card>
  );
}
