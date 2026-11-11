import React, { useMemo, useState } from 'react';
import { Receipt, Search, EyeOff, Eye, FileDown, RefreshCw, Layers } from 'lucide-react';
import { apiFetch, brl, fmtDate, fmtDoc, isoDate, firstDayOfMonth, openBlob } from '../../lib/api';
import { Card, Btn, Badge, DataTable, DateRange, Field, Input, Select, Alert, IconBtn, useLoader, Modal } from '../ui';
import NfseEmitirModal from '../NfseEmitirModal';

const TIPO: Record<string, string> = { PIX: 'Pix', BOLETO_COBRANCA: 'Boleto', TRANSFERENCIA: 'Transferência', DEPOSITO_BOLETO: 'Depósito boleto' };

function diffDays(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export default function InterEntradas({ token }: { token: string }) {
  const [inicio, setInicio] = useState(firstDayOfMonth());
  const [fim, setFim] = useState(isoDate());
  const [filtro, setFiltro] = useState('pendentes');
  const [busca, setBusca] = useState('');
  const [emitindo, setEmitindo] = useState<any>(null);
  const [selecionadas, setSelecionadas] = useState<Record<string, boolean>>({});
  const [lote, setLote] = useState<{ running: boolean; done: number; total: number; log: string[] } | null>(null);
  const [msg, setMsg] = useState('');

  const entradas = useLoader(async () => {
    if (diffDays(inicio, fim) < 0) throw new Error('A data inicial deve ser anterior à final.');
    return apiFetch<any[]>(token, '/api/inter/entradas', { query: { dataInicio: inicio, dataFim: fim } });
  }, [token], []);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return entradas.data.filter(e => {
      const ignorada = e.marcacao?.status === 'ignorada';
      if (filtro === 'pendentes' && (e.nfse || ignorada)) return false;
      if (filtro === 'emitidas' && !e.nfse) return false;
      if (filtro === 'ignoradas' && !ignorada) return false;
      if (!q) return true;
      return [e.pagador?.nome, e.pagador?.cpfCnpj, e.cliente?.name, e.descricao, e.titulo].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [entradas.data, filtro, busca]);

  const totais = useMemo(() => ({
    total: entradas.data.reduce((a, e) => a + e.valor, 0),
    pendente: entradas.data.filter(e => !e.nfse && e.marcacao?.status !== 'ignorada').reduce((a, e) => a + e.valor, 0),
  }), [entradas.data]);

  const marcar = async (e: any, status: 'ignorada' | 'pendente') => {
    try {
      await apiFetch(token, `/api/inter/entradas/${encodeURIComponent(e.idTransacao)}/marcar`, { method: 'POST', body: { status } });
      entradas.reload();
    } catch (err: any) { setMsg(err.message); }
  };

  const selecionaveis = lista.filter(e => !e.nfse && e.cliente && e.marcacao?.status !== 'ignorada');
  const selecionadasLista = selecionaveis.filter(e => selecionadas[e.idTransacao]);

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
        Créditos recebidos na conta Inter. Emita a NFS-e de cada recebimento: o cliente é identificado pelo CPF/CNPJ (ou nome) do pagador.
        Recebimentos de boletos emitidos pelo sistema herdam a nota da cobrança.
      </Alert>
      {msg && <Alert type="error" onClose={() => setMsg('')}>{msg}</Alert>}
      {entradas.error && <Alert type="error">{entradas.error}</Alert>}

      <Card
        title="Entradas na conta"
        subtitle={`Total no período: ${brl(totais.total)} · sem NFS-e: ${brl(totais.pendente)}`}
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
              { value: 'pendentes', label: 'Sem NFS-e' }, { value: 'emitidas', label: 'Com NFS-e' }, { value: 'ignoradas', label: 'Ignoradas' }, { value: 'todas', label: 'Todas' },
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
          empty="Nenhuma entrada para os filtros escolhidos."
          columns={[
            {
              key: 'sel', label: '', render: e => (e.nfse || !e.cliente || e.marcacao?.status === 'ignorada') ? null : (
                <input type="checkbox" className="accent-brand-green w-4 h-4" checked={!!selecionadas[e.idTransacao]} onChange={ev => setSelecionadas(s => ({ ...s, [e.idTransacao]: ev.target.checked }))} />
              ),
            },
            { key: 'data', label: 'Data', render: e => <span className="text-brand-muted whitespace-nowrap">{fmtDate(e.data)}</span> },
            {
              key: 'pagador', label: 'Pagador', render: e => (
                <div className="min-w-[180px]">
                  <div className="font-medium text-brand-text">{e.pagador?.nome || e.titulo || '—'}</div>
                  <div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(e.pagador?.cpfCnpj)} {TIPO[e.tipoTransacao] ? `· ${TIPO[e.tipoTransacao]}` : `· ${e.tipoTransacao || ''}`}</div>
                </div>
              ),
            },
            {
              key: 'cliente', label: 'Cliente', render: e => e.cliente
                ? <span className="text-brand-text">{e.cliente.name}</span>
                : <Badge color="amber">Não cadastrado</Badge>,
            },
            { key: 'valor', label: 'Valor', align: 'right', render: e => <span className="font-mono font-medium">{brl(e.valor)}</span> },
            {
              key: 'nfse', label: 'NFS-e', render: e => e.nfse
                ? <Badge color={e.nfse.status === 'canceled' ? 'gray' : 'green'}>{e.nfse.numero ? `Nº ${e.nfse.numero}` : 'Emitida'}</Badge>
                : e.marcacao?.status === 'ignorada' ? <Badge color="gray">Ignorada</Badge> : <Badge color="amber">Pendente</Badge>,
            },
            {
              key: 'acoes', label: '', align: 'right', render: e => (
                <div className="flex gap-1 justify-end">
                  {!e.nfse && e.marcacao?.status !== 'ignorada' && (
                    <Btn variant="primary" className="!py-1 !px-2.5 !text-[12px]" icon={<Receipt size={13} />} onClick={() => setEmitindo(e)}>Emitir</Btn>
                  )}
                  {e.nfse && <IconBtn title="PDF da NFS-e" onClick={() => openBlob(token, `/api/nfse/${e.nfse.id}/pdf`).catch(err => setMsg(err.message))}><FileDown size={13} /></IconBtn>}
                  {!e.nfse && (e.marcacao?.status === 'ignorada'
                    ? <IconBtn title="Voltar para pendentes" onClick={() => marcar(e, 'pendente')}><Eye size={13} /></IconBtn>
                    : <IconBtn title="Ignorar (não exige NFS-e)" onClick={() => marcar(e, 'ignorada')}><EyeOff size={13} /></IconBtn>)}
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

      {lote && (
        <Modal title="Emissão em lote" subtitle={`${lote.done} de ${lote.total}`} onClose={() => !lote.running && setLote(null)}
          footer={<Btn onClick={() => setLote(null)} disabled={lote.running}>Fechar</Btn>}>
          <div className="w-full h-2 bg-brand-surface2 rounded-full overflow-hidden"><div className="h-full bg-brand-green transition-all" style={{ width: `${(lote.done / lote.total) * 100}%` }} /></div>
          <div className="flex flex-col gap-1 text-[12.5px] font-mono">{lote.log.map((l, i) => <div key={i} className={l.startsWith('✓') ? 'text-brand-green' : 'text-red-400'}>{l}</div>)}</div>
        </Modal>
      )}
    </div>
  );
}
