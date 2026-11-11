import React, { useState } from 'react';
import { RefreshCw, Plus, Eye, Ban, RotateCw, Unlink, Search } from 'lucide-react';
import { apiFetch, brl, fmtDate, fmtDateTime, fmtDoc, isoDate, pixRange } from '../../lib/api';
import { Card, Btn, Badge, DataTable, DateRange, Field, Input, Alert, IconBtn, useLoader, Modal, JsonView, JsonEditor, Tabs } from '../ui';

const SUB = [
  { id: 'rec', label: 'Recorrências' },
  { id: 'solicrec', label: 'Solicitações de recorrência' },
  { id: 'cobr', label: 'Cobranças recorrentes' },
  { id: 'locrec', label: 'Payloads de recorrência' },
];

type SetMsg = (m: { type: 'success' | 'error'; text: string } | null) => void;

const cor = (s: string): any => (/CANCEL|REJEIT|EXPIR/.test(s) ? 'gray' : /APROV|CONCLU|ACEIT|PAG/.test(s) ? 'green' : 'amber');

export default function InterPixAutomatico({ token }: { token: string }) {
  const [sub, setSub] = useState('rec');
  const [inicio, setInicio] = useState(isoDate(-30));
  const [fim, setFim] = useState(isoDate(30));
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Alert type="info">Pix Automático: o cliente autoriza uma vez (recorrência) e as cobranças recorrentes são debitadas automaticamente na periodicidade combinada.</Alert>
      <Tabs tabs={SUB} active={sub} onChange={setSub} />
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {sub !== 'solicrec' && <DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} />}
      {sub === 'rec' && <Recs token={token} inicio={inicio} fim={fim} setMsg={setMsg} />}
      {sub === 'solicrec' && <Solicitacoes token={token} setMsg={setMsg} />}
      {sub === 'cobr' && <Cobrs token={token} inicio={inicio} fim={fim} setMsg={setMsg} />}
      {sub === 'locrec' && <LocRecs token={token} inicio={inicio} fim={fim} setMsg={setMsg} />}
    </div>
  );
}

function CriarJson({ titulo, subtitulo, template, onSend, onClose }: { titulo: string; subtitulo: string; template: any; onSend: (body: any) => Promise<any>; onClose: () => void }) {
  const [body, setBody] = useState(JSON.stringify(template, null, 2));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<any>(null);
  const go = async () => {
    setLoading(true); setErr('');
    try { setRes(await onSend(JSON.parse(body))); } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal title={titulo} subtitle={subtitulo} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Fechar</Btn><Btn variant="primary" loading={loading} onClick={go} disabled={!!res}>Enviar</Btn></>}>
      {err && <Alert type="error">{err}</Alert>}
      {res ? <><Alert type="success">Enviado com sucesso.</Alert><JsonView data={res} /></> : <JsonEditor value={body} onChange={setBody} rows={20} />}
    </Modal>
  );
}

function Recs({ token, inicio, fim, setMsg }: { token: string; inicio: string; fim: string; setMsg: SetMsg }) {
  const lista = useLoader(() => apiFetch<any>(token, '/api/inter/pixauto/rec', { query: { ...pixRange(inicio, fim), 'paginacao.itensPorPagina': 1000 } }), [token], { recs: [] });
  const [ver, setVer] = useState<any>(null);
  const [nova, setNova] = useState(false);
  const cancelar = async (r: any) => {
    if (!confirm('Cancelar esta recorrência? Novas cobranças não serão mais debitadas.')) return;
    try { await apiFetch(token, `/api/inter/pixauto/rec/${r.idRec}`, { method: 'PATCH', body: { status: 'CANCELADA' } }); setMsg({ type: 'success', text: 'Recorrência cancelada.' }); lista.reload(); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  const abrir = async (r: any) => { try { setVer(await apiFetch(token, `/api/inter/pixauto/rec/${r.idRec}`)); } catch (e: any) { setMsg({ type: 'error', text: e.message }); } };
  return (
    <Card title="Recorrências" actions={<><Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn><Btn variant="primary" icon={<Plus size={14} />} onClick={() => setNova(true)}>Nova recorrência</Btn></>}>
      {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
      <DataTable loading={lista.loading} rows={lista.data?.recs || []} rowKey={(r: any) => r.idRec} columns={[
        { key: 'id', label: 'idRec', render: (r: any) => <span className="font-mono text-[11.5px]">{r.idRec}</span> },
        { key: 'dev', label: 'Devedor', render: (r: any) => <div><div>{r.vinculo?.devedor?.nome}</div><div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(r.vinculo?.devedor?.cpf || r.vinculo?.devedor?.cnpj)} · {r.vinculo?.contrato}</div></div> },
        { key: 'per', label: 'Periodicidade', render: (r: any) => `${r.calendario?.periodicidade || ''} desde ${fmtDate(r.calendario?.dataInicial)}` },
        { key: 'v', label: 'Valor', align: 'right', render: (r: any) => <span className="font-mono">{r.valor?.valorRec ? brl(r.valor.valorRec) : r.valor?.valorMinimoRecebedor ? `mín. ${brl(r.valor.valorMinimoRecebedor)}` : 'variável'}</span> },
        { key: 's', label: 'Status', render: (r: any) => <Badge color={cor(r.status || '')}>{r.status}</Badge> },
        { key: 'a', label: '', align: 'right', render: (r: any) => <div className="flex gap-1 justify-end"><IconBtn title="Detalhes" onClick={() => abrir(r)}><Eye size={13} /></IconBtn>{!/CANCEL/.test(r.status || '') && <IconBtn danger title="Cancelar" onClick={() => cancelar(r)}><Ban size={13} /></IconBtn>}</div> },
      ]} />
      {ver && <Modal title="Recorrência" subtitle={ver.idRec} onClose={() => setVer(null)}><JsonView data={ver} maxHeight="max-h-[60vh]" /></Modal>}
      {nova && <CriarJson titulo="Nova recorrência (Pix Automático)" subtitulo="POST /pix/v2/rec" onClose={() => { setNova(false); lista.reload(); }}
        template={{
          vinculo: { objeto: 'Honorários contábeis', contrato: `CT-${Date.now().toString().slice(-8)}`, devedor: { cnpj: '00000000000000', nome: 'Nome do cliente' } },
          calendario: { dataInicial: isoDate(5), periodicidade: 'MENSAL' },
          valor: { valorRec: '300.00' },
          politicaRetentativa: 'PERMITE_3R_7D',
        }}
        onSend={b => apiFetch(token, '/api/inter/pixauto/rec', { method: 'POST', body: b })} />}
    </Card>
  );
}

function Solicitacoes({ token, setMsg }: { token: string; setMsg: SetMsg }) {
  const [id, setId] = useState('');
  const [ver, setVer] = useState<any>(null);
  const [nova, setNova] = useState(false);
  const consultar = async () => { try { setVer(await apiFetch(token, `/api/inter/pixauto/solicrec/${id.trim()}`)); } catch (e: any) { setMsg({ type: 'error', text: e.message }); } };
  const cancelar = async () => {
    if (!confirm('Cancelar esta solicitação de recorrência?')) return;
    try { setVer(await apiFetch(token, `/api/inter/pixauto/solicrec/${ver.idSolicRec}`, { method: 'PATCH', body: { status: 'CANCELADA' } })); setMsg({ type: 'success', text: 'Solicitação cancelada.' }); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  return (
    <Card title="Solicitações de recorrência" subtitle="Envia ao app do banco do pagador o pedido de autorização da recorrência"
      actions={<Btn variant="primary" icon={<Plus size={14} />} onClick={() => setNova(true)}>Nova solicitação</Btn>}>
      <div className="p-4 flex flex-wrap items-end gap-3">
        <Field label="idSolicRec" className="flex-1 min-w-[260px]"><Input value={id} onChange={e => setId(e.target.value)} className="font-mono" /></Field>
        <Btn icon={<Search size={14} />} onClick={consultar} disabled={!id.trim()}>Consultar</Btn>
      </div>
      {ver && <div className="p-4 pt-0 flex flex-col gap-3">
        <div className="flex items-center gap-2"><Badge color={cor(ver.status || '')}>{ver.status}</Badge>{!/CANCEL|REJEIT|EXPIR|ACEIT/.test(ver.status || '') && <Btn variant="danger" onClick={cancelar}>Cancelar solicitação</Btn>}</div>
        <JsonView data={ver} />
      </div>}
      {nova && <CriarJson titulo="Nova solicitação de recorrência" subtitulo="POST /pix/v2/solicrec" onClose={() => setNova(false)}
        template={{
          idRec: 'RR0000000000000000000000000000',
          calendario: { dataExpiracaoSolicitacao: `${isoDate(7)}T23:59:59Z` },
          destinatario: { cnpj: '00000000000000', conta: '00000000', agencia: '0001', ispbParticipante: '00416968' },
        }}
        onSend={async b => { const r = await apiFetch<any>(token, '/api/inter/pixauto/solicrec', { method: 'POST', body: b }); if (r?.idSolicRec) setId(r.idSolicRec); return r; }} />}
    </Card>
  );
}

function Cobrs({ token, inicio, fim, setMsg }: { token: string; inicio: string; fim: string; setMsg: SetMsg }) {
  const lista = useLoader(() => apiFetch<any>(token, '/api/inter/pixauto/cobr', { query: { ...pixRange(inicio, fim), 'paginacao.itensPorPagina': 1000 } }), [token], { cobsr: [] });
  const [ver, setVer] = useState<any>(null);
  const [nova, setNova] = useState(false);
  const cancelar = async (c: any) => {
    if (!confirm('Cancelar esta cobrança recorrente?')) return;
    try { await apiFetch(token, `/api/inter/pixauto/cobr/${c.txid}`, { method: 'PATCH', body: { status: 'CANCELADA' } }); setMsg({ type: 'success', text: 'Cobrança recorrente cancelada.' }); lista.reload(); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  const retentar = async (c: any) => {
    const data = prompt('Data da nova tentativa (AAAA-MM-DD):', isoDate(1));
    if (!data) return;
    try { await apiFetch(token, `/api/inter/pixauto/cobr/${c.txid}/retentativa/${data}`, { method: 'POST', body: {} }); setMsg({ type: 'success', text: 'Retentativa agendada.' }); lista.reload(); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  return (
    <Card title="Cobranças recorrentes" actions={<><Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn><Btn variant="primary" icon={<Plus size={14} />} onClick={() => setNova(true)}>Nova cobrança</Btn></>}>
      {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
      <DataTable loading={lista.loading} rows={lista.data?.cobsr || []} rowKey={(c: any) => c.txid} columns={[
        { key: 'tx', label: 'txid', render: (c: any) => <span className="font-mono text-[11.5px]">{c.txid}</span> },
        { key: 'rec', label: 'Recorrência', render: (c: any) => <span className="font-mono text-[11.5px]">{c.idRec}</span> },
        { key: 'venc', label: 'Vencimento', render: (c: any) => fmtDate(c.calendario?.dataDeVencimento) },
        { key: 'v', label: 'Valor', align: 'right', render: (c: any) => <span className="font-mono">{brl(c.valor?.original)}</span> },
        { key: 's', label: 'Status', render: (c: any) => <Badge color={cor(c.status || '')}>{c.status}</Badge> },
        { key: 'a', label: '', align: 'right', render: (c: any) => <div className="flex gap-1 justify-end">
          <IconBtn title="Detalhes" onClick={async () => { try { setVer(await apiFetch(token, `/api/inter/pixauto/cobr/${c.txid}`)); } catch (e: any) { setMsg({ type: 'error', text: e.message }); } }}><Eye size={13} /></IconBtn>
          <IconBtn title="Agendar retentativa" onClick={() => retentar(c)}><RotateCw size={13} /></IconBtn>
          {!/CANCEL|CONCLU/.test(c.status || '') && <IconBtn danger title="Cancelar" onClick={() => cancelar(c)}><Ban size={13} /></IconBtn>}
        </div> },
      ]} />
      {ver && <Modal title="Cobrança recorrente" subtitle={ver.txid} onClose={() => setVer(null)}><JsonView data={ver} maxHeight="max-h-[60vh]" /></Modal>}
      {nova && <CriarJson titulo="Nova cobrança recorrente" subtitulo="POST /pix/v2/cobr" onClose={() => { setNova(false); lista.reload(); }}
        template={{
          idRec: 'RR0000000000000000000000000000',
          infoAdicional: 'Honorários contábeis',
          calendario: { dataDeVencimento: isoDate(10) },
          valor: { original: '300.00' },
          ajusteDiaUtil: true,
          recebedor: { conta: '000000000', tipoConta: 'CORRENTE', agencia: '0001' },
        }}
        onSend={b => apiFetch(token, '/api/inter/pixauto/cobr', { method: 'POST', body: b })} />}
    </Card>
  );
}

function LocRecs({ token, inicio, fim, setMsg }: { token: string; inicio: string; fim: string; setMsg: SetMsg }) {
  const lista = useLoader(() => apiFetch<any>(token, '/api/inter/pixauto/locrec', { query: { ...pixRange(inicio, fim), 'paginacao.itensPorPagina': 1000 } }), [token], { loc: [] });
  const criar = async () => {
    try { const r = await apiFetch<any>(token, '/api/inter/pixauto/locrec', { method: 'POST', body: {} }); setMsg({ type: 'success', text: `Location ${r.id} criada.` }); lista.reload(); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  const desvincular = async (l: any) => {
    if (!confirm('Desvincular a recorrência desta location?')) return;
    try { await apiFetch(token, `/api/inter/pixauto/locrec/${l.id}/idRec`, { method: 'DELETE' }); lista.reload(); } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  return (
    <Card title="Payloads de recorrência (locrec)" actions={<><Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn><Btn variant="primary" icon={<Plus size={14} />} onClick={criar}>Criar location</Btn></>}>
      {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
      <DataTable loading={lista.loading} rows={lista.data?.loc || []} rowKey={(l: any) => String(l.id)} columns={[
        { key: 'id', label: 'Id', render: (l: any) => <span className="font-mono">{l.id}</span> },
        { key: 'l', label: 'Location', render: (l: any) => <span className="font-mono text-[11.5px] break-all">{l.location}</span> },
        { key: 'r', label: 'idRec', render: (l: any) => <span className="font-mono text-[11.5px]">{l.idRec || '—'}</span> },
        { key: 'c', label: 'Criação', render: (l: any) => fmtDateTime(l.criacao) },
        { key: 'a', label: '', align: 'right', render: (l: any) => l.idRec ? <IconBtn title="Desvincular" onClick={() => desvincular(l)}><Unlink size={13} /></IconBtn> : null },
      ]} />
    </Card>
  );
}
