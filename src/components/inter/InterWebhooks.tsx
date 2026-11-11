import React, { useState } from 'react';
import { RefreshCw, Link2, Trash2, History, RotateCw } from 'lucide-react';
import { apiFetch, fmtDateTime, isoDate } from '../../lib/api';
import { Card, Btn, Badge, DataTable, Field, Input, Alert, useLoader, Modal, JsonView, Select } from '../ui';

export default function InterWebhooks({ token }: { token: string }) {
  const lista = useLoader(() => apiFetch<any[]>(token, '/api/inter/webhooks'), [token], []);
  const recebidos = useLoader(() => apiFetch<any[]>(token, '/api/inter/webhooks-recebidos'), [token], []);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editar, setEditar] = useState<any>(null);
  const [callbacks, setCallbacks] = useState<any>(null);
  const [verPayload, setVerPayload] = useState<any>(null);

  const remover = async (w: any) => {
    if (!confirm(`Remover o webhook "${w.label}"? O Inter deixará de avisar o sistema.`)) return;
    try { await apiFetch(token, `/api/inter/webhooks/${w.tipo}`, { method: 'DELETE' }); setMsg({ type: 'success', text: 'Webhook removido.' }); lista.reload(); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  return (
    <div className="flex flex-col gap-5">
      <Alert type="info">
        Com o webhook de <b>Cobranças</b> ativo, o sistema atualiza a situação dos boletos assim que são pagos e emite a NFS-e automaticamente
        nas cobranças marcadas para "emitir ao receber". Os webhooks exigem a URL pública (https) configurada na aba Configuração.
      </Alert>
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {lista.error && <Alert type="error">{lista.error}</Alert>}
      <Card title="Webhooks no Banco Inter" actions={<Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Atualizar</Btn>}>
        <DataTable loading={lista.loading} rows={lista.data} rowKey={(w: any) => w.tipo} columns={[
          { key: 'l', label: 'Evento', render: (w: any) => <div><div className="font-medium">{w.label}</div><div className="text-[11px] text-brand-muted font-mono">{w.tipo}</div></div> },
          { key: 's', label: 'Status', render: (w: any) => w.configurado ? <Badge color="green">Ativo</Badge> : w.erro ? <Badge color="red">Erro</Badge> : <Badge color="gray">Não configurado</Badge> },
          { key: 'u', label: 'URL cadastrada', render: (w: any) => <span className="text-[11.5px] font-mono break-all text-brand-muted">{w.webhookUrl || w.erro || '—'}</span> },
          {
            key: 'a', label: '', align: 'right', render: (w: any) => (
              <div className="flex gap-1.5 justify-end">
                <Btn className="!py-1 !px-2.5 !text-[12px]" icon={<Link2 size={13} />} onClick={() => setEditar(w)}>{w.configurado ? 'Alterar' : 'Ativar'}</Btn>
                {w.temCallbacks && <Btn className="!py-1 !px-2.5 !text-[12px]" icon={<History size={13} />} onClick={() => setCallbacks(w)}>Disparos</Btn>}
                {w.configurado && <Btn variant="danger" className="!py-1 !px-2.5 !text-[12px]" icon={<Trash2 size={13} />} onClick={() => remover(w)}>Remover</Btn>}
              </div>
            ),
          },
        ]} />
      </Card>

      <Card title="Notificações recebidas pelo sistema" subtitle="Últimos 500 webhooks recebidos" actions={<Btn icon={<RefreshCw size={14} />} loading={recebidos.loading} onClick={recebidos.reload}>Atualizar</Btn>}>
        <DataTable loading={recebidos.loading} rows={recebidos.data.slice(0, 100)} rowKey={(r: any) => r.id} empty="Nenhuma notificação recebida ainda." columns={[
          { key: 'em', label: 'Recebido em', render: (r: any) => <span className="text-brand-muted whitespace-nowrap">{fmtDateTime(r.recebidoEm)}</span> },
          { key: 't', label: 'Tipo', render: (r: any) => <Badge color="blue">{r.tipo}</Badge> },
          { key: 'p', label: 'Resumo', render: (r: any) => <span className="text-[12px] text-brand-muted">{Array.isArray(r.payload) ? `${r.payload.length} evento(s): ${r.payload.map((x: any) => x.situacao || x.status || '').filter(Boolean).join(', ')}` : r.payload?.pix ? `${r.payload.pix.length} Pix` : ''}</span> },
          { key: 'a', label: '', align: 'right', render: (r: any) => <Btn variant="ghost" className="!py-1 !text-[12px]" onClick={() => setVerPayload(r)}>Ver</Btn> },
        ]} />
      </Card>

      {editar && <EditarWebhook token={token} w={editar} onClose={() => setEditar(null)} onDone={t => { setMsg({ type: 'success', text: t }); lista.reload(); }} />}
      {callbacks && <Callbacks token={token} w={callbacks} onClose={() => setCallbacks(null)} />}
      {verPayload && <Modal title={`Webhook ${verPayload.tipo}`} subtitle={fmtDateTime(verPayload.recebidoEm)} onClose={() => setVerPayload(null)}><JsonView data={verPayload.payload} maxHeight="max-h-[60vh]" /></Modal>}
    </div>
  );
}

function EditarWebhook({ token, w, onClose, onDone }: { token: string; w: any; onClose: () => void; onDone: (t: string) => void }) {
  const [url, setUrl] = useState(w.urlSugerida || w.webhookUrl || '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setLoading(true); setErr('');
    try { await apiFetch(token, `/api/inter/webhooks/${w.tipo}`, { method: 'PUT', body: { webhookUrl: url } }); onDone('Webhook cadastrado no Inter.'); onClose(); }
    catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal title={`Webhook: ${w.label}`} onClose={onClose} width="max-w-xl"
      footer={<><Btn variant="ghost" onClick={onClose}>Fechar</Btn><Btn variant="primary" loading={loading} onClick={go} disabled={!url.startsWith('https://')}>Salvar no Inter</Btn></>}>
      {err && <Alert type="error">{err}</Alert>}
      {!w.urlSugerida && <Alert type="warn">Configure a URL pública (https) do sistema na aba Configuração para gerar o endereço automaticamente.</Alert>}
      <Field label="URL que receberá as notificações" hint="O endereço sugerido contém um código secreto; não compartilhe."><Input value={url} onChange={e => setUrl(e.target.value)} className="font-mono text-[12px]" /></Field>
    </Modal>
  );
}

function Callbacks({ token, w, onClose }: { token: string; w: any; onClose: () => void }) {
  const [inicio, setInicio] = useState(`${isoDate(-2)}T00:00`);
  const [fim, setFim] = useState(`${isoDate()}T23:59`);
  const [sucesso, setSucesso] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const consultar = async () => {
    setLoading(true); setErr('');
    try {
      const toIso = (v: string) => new Date(v).toISOString().replace(/\.\d{3}Z$/, 'Z');
      setData(await apiFetch(token, `/api/inter/webhooks/${w.tipo}/callbacks`, { query: { dataHoraInicio: toIso(inicio), dataHoraFim: toIso(fim), tamanhoPagina: 100 } }));
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  const itens: any[] = (data?.data || []).filter((c: any) => sucesso === '' || String(c.sucesso) === sucesso);
  const reenviar = async () => {
    try {
      const falhas = itens.filter(c => !c.sucesso);
      let body: any;
      if (w.tipo === 'cobranca') body = { codigoSolicitacao: [...new Set(falhas.flatMap(c => (Array.isArray(c.payload) ? c.payload : [c.payload]).map((p: any) => p?.codigoSolicitacao)).filter(Boolean))].slice(0, 50) };
      else if (w.tipo === 'pix') body = { txId: [...new Set(falhas.flatMap(c => (c.payload?.pix || []).map((p: any) => p.txid)).filter(Boolean))], chavePix: '' };
      else if (w.tipo === 'pix-pagamento') body = { codigoSolicitacao: [...new Set(falhas.map(c => c.payload?.codigoSolicitacao).filter(Boolean))].slice(0, 50) };
      else body = { codigoTransacao: [...new Set(falhas.map(c => c.payload?.codigoTransacao).filter(Boolean))].slice(0, 50) };
      const r = await apiFetch(token, `/api/inter/webhooks/${w.tipo}/callbacks/retry`, { method: 'POST', body });
      setData({ ...data, retry: r });
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal title={`Disparos do webhook: ${w.label}`} onClose={onClose} width="max-w-4xl">
      {err && <Alert type="error">{err}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="De"><Input type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} /></Field>
        <Field label="Até"><Input type="datetime-local" value={fim} onChange={e => setFim(e.target.value)} /></Field>
        <Field label="Resultado"><Select value={sucesso} onChange={e => setSucesso(e.target.value)} options={[{ value: '', label: 'Todos' }, { value: 'true', label: 'Sucesso' }, { value: 'false', label: 'Falha' }]} /></Field>
        <Btn icon={<RefreshCw size={14} />} loading={loading} onClick={consultar}>Consultar</Btn>
        {itens.some(c => !c.sucesso) && <Btn icon={<RotateCw size={14} />} onClick={reenviar}>Reenviar falhas</Btn>}
      </div>
      {data && (
        <DataTable rows={itens} rowKey={(_c: any, i) => String(i)} columns={[
          { key: 'd', label: 'Disparo', render: (c: any) => fmtDateTime(c.dataHoraDisparo || c.dataEnvio) },
          { key: 't', label: 'Tentativa', render: (c: any) => c.numeroTentativa },
          { key: 's', label: 'Resultado', render: (c: any) => c.sucesso ? <Badge color="green">HTTP {c.httpStatus}</Badge> : <Badge color="red">{c.httpStatus || 'falha'}</Badge> },
          { key: 'm', label: 'Mensagem', render: (c: any) => <span className="text-[11.5px] text-brand-muted">{c.mensagemErro || ''}</span> },
        ]} />
      )}
      {data?.retry && <JsonView data={data.retry} />}
    </Modal>
  );
}
