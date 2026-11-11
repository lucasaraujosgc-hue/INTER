import React, { useMemo, useState } from 'react';
import { Receipt, Search, EyeOff, Eye, FileDown, RefreshCw, Layers, Link2 } from 'lucide-react';
import { apiFetch, brl, fmtDate, fmtDoc, isoDate, firstDayOfMonth, openBlob } from '../../lib/api';
import { Card, Btn, Badge, DataTable, DateRange, Field, Input, Select, Alert, IconBtn, useLoader, Modal } from '../ui';
import NfseEmitirModal from '../NfseEmitirModal';
import VincularPagadorModal from '../VincularPagadorModal';

export const TIPO_TRANSACAO: Record<string, string> = { PIX: 'Pix', BOLETO_COBRANCA: 'Boleto', TRANSFERENCIA: 'Transferência', DEPOSITO_BOLETO: 'Depósito boleto' };

/** Como o cliente foi identificado no recebimento. */
export const VIA_VINCULO: Record<string, string> = {
  documento: 'pelo CPF/CNPJ',
  pagador: 'pagador vinculado',
  nome: 'pelo nome',
  cobranca: 'pela cobrança',
  manual: 'vínculo manual',
};

export function SituacaoEntradaBadge({ e }: { e: any }) {
  if (e.nfse) return <Badge color={e.nfse.status === 'canceled' ? 'gray' : 'green'}>{e.nfse.numero ? `NFS-e nº ${e.nfse.numero}` : 'NFS-e emitida'}</Badge>;
  if (e.situacao === 'antes') return <Badge color="blue">Antes</Badge>;
  if (e.situacao === 'ignorada') return <Badge color="gray">Ignorada</Badge>;
  return <Badge color="amber">Sem NFS-e</Badge>;
}

function diffDays(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/** O dashboard pode abrir esta tela já com período e filtro escolhidos. */
function lerPreset(): { inicio?: string; fim?: string; filtro?: string } {
  try {
    const raw = sessionStorage.getItem('vc_entradas_preset');
    sessionStorage.removeItem('vc_entradas_preset');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export default function InterEntradas({ token }: { token: string }) {
  const [preset] = useState(lerPreset);
  const [inicio, setInicio] = useState(preset.inicio || firstDayOfMonth());
  const [fim, setFim] = useState(preset.fim || isoDate());
  const [filtro, setFiltro] = useState(preset.filtro || 'pendentes');
  const [busca, setBusca] = useState('');
  const [emitindo, setEmitindo] = useState<any>(null);
  const [vinculando, setVinculando] = useState<any>(null);
  const [selecionadas, setSelecionadas] = useState<Record<string, boolean>>({});
  const [lote, setLote] = useState<{ running: boolean; done: number; total: number; log: string[] } | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [corte, setCorte] = useState('');

  const entradas = useLoader(async () => {
    if (diffDays(inicio, fim) < 0) throw new Error('A data inicial deve ser anterior à final.');
    apiFetch<any>(token, '/api/settings').then(s => setCorte(s.entradasCorteNfse || '')).catch(() => undefined);
    return apiFetch<any[]>(token, '/api/inter/entradas', { query: { dataInicio: inicio, dataFim: fim } });
  }, [token], []);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return entradas.data.filter(e => {
      if (filtro === 'pendentes' && e.situacao !== 'pendente') return false;
      if (filtro === 'sem-cliente' && (e.situacao !== 'pendente' || e.cliente)) return false;
      if (filtro === 'emitidas' && e.situacao !== 'emitida') return false;
      if (filtro === 'antes' && e.situacao !== 'antes') return false;
      if (filtro === 'ignoradas' && e.situacao !== 'ignorada') return false;
      if (!q) return true;
      return [e.pagador?.nome, e.pagador?.cpfCnpj, e.cliente?.name, e.descricao, e.titulo].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [entradas.data, filtro, busca]);

  const totais = useMemo(() => {
    const pend = entradas.data.filter(e => e.situacao === 'pendente');
    return {
      total: entradas.data.reduce((a, e) => a + e.valor, 0),
      pendente: pend.reduce((a, e) => a + e.valor, 0),
      semCliente: pend.filter(e => !e.cliente).length,
      antes: entradas.data.filter(e => e.situacao === 'antes').length,
    };
  }, [entradas.data]);

  const marcar = async (e: any, status: 'ignorada' | 'pendente') => {
    try {
      await apiFetch(token, `/api/inter/entradas/${encodeURIComponent(e.idTransacao)}/marcar`, { method: 'POST', body: { status } });
      entradas.reload();
    } catch (err: any) { setMsg({ type: 'error', text: err.message }); }
  };

  const selecionaveis = lista.filter(e => e.situacao === 'pendente' && e.cliente);
  const selecionadasLista = selecionaveis.filter(e => selecionadas[e.idTransacao]);
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every(e => selecionadas[e.idTransacao]);

  const emitirLote = async () => {
    const itens = selecionadasLista;
    if (!itens.length) return;
    if (!confirm(`Emitir ${itens.length} NFS-e com a configuração fiscal padrão (competência = mês do recebimento)?`)) return;
    setLote({ running: true, done: 0, total: itens.length, log: [] });
    for (let i = 0; i < itens.length; i++) {
      const e = itens[i];
      let linha = '';
      try {
        const r = await apiFetch<any>(token, '/api/nfse/emitir', {
          method: 'POST',
          body: {
            clienteId: e.cliente.id,
            cliente: e.cliente.name,
            valor: e.valor,
            competencia: String(e.data).slice(0, 7),
            origem: { tipo: 'inter-extrato', idTransacao: e.idTransacao, data: e.data, pagador: e.pagador },
          },
        });
        linha = `✓ ${e.cliente.name} — ${brl(e.valor)}: ${r.message}`;
      } catch (err: any) {
        linha = `✗ ${e.cliente.name} — ${brl(e.valor)}: ${err.message}`;
      }
      setLote(l => l && ({ ...l, done: i + 1, log: [...l.log, linha] }));
      if (i < itens.length - 1) await new Promise(r => setTimeout(r, 1500));
    }
    setLote(l => l && ({ ...l, running: false }));
    setSelecionadas({});
    entradas.reload();
  };

  return (
    <div className="flex flex-col gap-5">
      <Alert type="info">
        Créditos recebidos na conta Inter. O cliente é identificado pelo CPF/CNPJ do pagador, pelos <b>pagadores vinculados</b> ao cadastro
        ou pela cobrança. Se o boleto/Pix foi pago por outra pessoa (sócio, pessoa física), use <b>Vincular</b> para indicar a empresa da nota.
        {corte && <> Recebimentos até <b>{fmtDate(corte)}</b> aparecem como <b>Antes</b> e não entram nas pendências.</>}
      </Alert>
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {entradas.error && <Alert type="error">{entradas.error}</Alert>}

      <Card
        title="Entradas na conta"
        subtitle={`Total no período: ${brl(totais.total)} · sem NFS-e: ${brl(totais.pendente)}${totais.semCliente ? ` · ${totais.semCliente} sem cliente identificado` : ''}`}
        actions={<>
          {selecionadasLista.length > 0 && <Btn variant="primary" icon={<Layers size={15} />} onClick={emitirLote}>Emitir {selecionadasLista.length} NFS-e</Btn>}
        </>}
      >
        <div className="p-4 border-b border-brand-border flex flex-wrap items-end gap-3">
          <DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim}>
            <Btn icon={<RefreshCw size={14} />} onClick={entradas.reload} loading={entradas.loading}>Consultar</Btn>
          </DateRange>
          <Field label="Mostrar">
            <Select value={filtro} onChange={e => setFiltro(e.target.value)} options={[
              { value: 'pendentes', label: 'Sem NFS-e' },
              { value: 'sem-cliente', label: 'Sem cliente identificado' },
              { value: 'emitidas', label: 'Com NFS-e' },
              { value: 'antes', label: corte ? `Antes (até ${fmtDate(corte)})` : 'Antes' },
              { value: 'ignoradas', label: 'Ignoradas' },
              { value: 'todas', label: 'Todas' },
            ]} />
          </Field>
          <Field label="Buscar" className="flex-1 min-w-[180px]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" placeholder="Pagador, CPF/CNPJ, cliente…" />
            </div>
          </Field>
        </div>
        <DataTable
          loading={entradas.loading}
          rows={lista}
          rowKey={e => e.idTransacao}
          empty={filtro === 'pendentes' && totais.antes > 0 && !lista.length ? 'Nenhuma entrada pendente. Os recebimentos anteriores à data de corte estão em "Antes".' : 'Nenhuma entrada para os filtros escolhidos.'}
          columns={[
            {
              key: 'sel',
              label: (selecionaveis.length > 0 ? (
                <input type="checkbox" aria-label="Selecionar todas" className="accent-brand-green w-4 h-4 align-middle" checked={todasMarcadas}
                  onChange={ev => setSelecionadas(ev.target.checked ? Object.fromEntries(selecionaveis.map(e => [e.idTransacao, true])) : {})} />
              ) : '') as any,
              render: e => (e.situacao !== 'pendente' || !e.cliente) ? null : (
                <input type="checkbox" aria-label="Selecionar" className="accent-brand-green w-4 h-4" checked={!!selecionadas[e.idTransacao]} onChange={ev => setSelecionadas(s => ({ ...s, [e.idTransacao]: ev.target.checked }))} />
              ),
            },
            { key: 'data', label: 'Data', render: e => <span className="text-brand-muted whitespace-nowrap">{fmtDate(e.data)}</span> },
            {
              key: 'pagador', label: 'Pagador', render: e => (
                <div className="min-w-[180px]">
                  <div className="font-medium text-brand-text">{e.pagador?.nome || e.titulo || '—'}</div>
                  <div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(e.pagador?.cpfCnpj)} {TIPO_TRANSACAO[e.tipoTransacao] ? `· ${TIPO_TRANSACAO[e.tipoTransacao]}` : `· ${e.tipoTransacao || ''}`}</div>
                </div>
              ),
            },
            {
              key: 'cliente', label: 'Cliente (tomador)', render: e => e.cliente
                ? (
                  <div className="min-w-[150px]">
                    <div className="text-brand-text">{e.cliente.name}</div>
                    {e.cliente.via && e.cliente.via !== 'documento' && <div className="text-[11px] text-brand-orange-dim flex items-center gap-1"><Link2 size={11} />{VIA_VINCULO[e.cliente.via] || e.cliente.via}</div>}
                  </div>
                )
                : e.situacao === 'pendente' ? <Badge color="amber">Não identificado</Badge> : <span className="text-brand-dim">—</span>,
            },
            { key: 'valor', label: 'Valor', align: 'right', render: e => <span className="font-mono font-medium">{brl(e.valor)}</span> },
            { key: 'nfse', label: 'NFS-e', render: e => <SituacaoEntradaBadge e={e} /> },
            {
              key: 'acoes', label: '', align: 'right', render: e => (
                <div className="flex gap-1 justify-end items-center">
                  {e.situacao === 'pendente' && (e.cliente
                    ? <Btn variant="primary" className="!py-1 !px-2.5 !text-[12px]" icon={<Receipt size={13} />} onClick={() => setEmitindo(e)}>Emitir</Btn>
                    : <Btn variant="orange" className="!py-1 !px-2.5 !text-[12px]" icon={<Link2 size={13} />} onClick={() => setVinculando(e)}>Vincular</Btn>)}
                  {!e.nfse && (e.cliente || e.situacao !== 'pendente') && <IconBtn title={e.cliente ? 'Vincular a outra empresa' : 'Vincular a uma empresa'} onClick={() => setVinculando(e)}><Link2 size={13} /></IconBtn>}
                  {e.situacao === 'antes' && e.cliente && <IconBtn title="Emitir NFS-e mesmo assim" onClick={() => setEmitindo(e)}><Receipt size={13} /></IconBtn>}
                  {e.nfse && <IconBtn title="Baixar PDF da NFS-e" onClick={() => openBlob(token, `/api/nfse/${e.nfse.id}/pdf`).catch(err => setMsg({ type: 'error', text: err.message }))}><FileDown size={13} /></IconBtn>}
                  {e.situacao === 'ignorada' && <IconBtn title="Voltar para pendentes" onClick={() => marcar(e, 'pendente')}><Eye size={13} /></IconBtn>}
                  {e.situacao === 'pendente' && <IconBtn title="Ignorar (não exige NFS-e)" onClick={() => marcar(e, 'ignorada')}><EyeOff size={13} /></IconBtn>}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {emitindo && (
        <NfseEmitirModal
          token={token}
          titulo="Emitir NFS-e do recebimento"
          inicial={{
            clienteId: emitindo.cliente?.id,
            valor: emitindo.valor,
            competencia: String(emitindo.data).slice(0, 7),
            pagador: emitindo.pagador,
          }}
          origem={{ tipo: 'inter-extrato', idTransacao: emitindo.idTransacao, data: emitindo.data, pagador: emitindo.pagador }}
          onClose={() => setEmitindo(null)}
          onSuccess={() => entradas.reload()}
        />
      )}

      {vinculando && (
        <VincularPagadorModal
          token={token}
          entrada={vinculando}
          onClose={() => setVinculando(null)}
          onDone={text => { setMsg({ type: 'success', text }); entradas.reload(); }}
        />
      )}

      {lote && (
        <Modal title="Emissão em lote" subtitle={`${lote.done} de ${lote.total}`} onClose={() => !lote.running && setLote(null)}
          footer={<Btn onClick={() => setLote(null)} disabled={lote.running}>Fechar</Btn>}>
          <div className="w-full h-2 bg-brand-surface3 rounded-full overflow-hidden"><div className="h-full bg-brand-green transition-all" style={{ width: `${(lote.done / lote.total) * 100}%` }} /></div>
          <div className="flex flex-col gap-1 text-[12.5px] font-mono">{lote.log.map((l, i) => <div key={i} className={l.startsWith('✓') ? 'text-emerald-700' : 'text-red-600'}>{l}</div>)}</div>
        </Modal>
      )}
    </div>
  );
}
