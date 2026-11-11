import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, FileDown, FileCode2, Download, Globe } from 'lucide-react';
import { apiFetch, brl, fmtDate, fmtDoc, fmtDateTime, openBlob, isoDate } from '../lib/api';
import { Modal, Btn, Alert, Badge, Field, Input, Select, Tabs, DataTable, IconBtn } from './ui';

/**
 * Consulta das NFS-e no Ambiente de Dados Nacional (ADN): as emitidas pela empresa e as tomadas
 * (serviços contratados de terceiros). Os documentos são baixados por NSU e guardados no sistema.
 */
export default function ConsultaNacionalModal({ token, onClose, onImportada }: { token: string; onClose: () => void; onImportada?: () => void }) {
  const [papel, setPapel] = useState<'emitida' | 'tomada'>('emitida');
  const [por, setPor] = useState<'emissao' | 'competencia'>('emissao');
  const [inicio, setInicio] = useState(isoDate(-90));
  const [fim, setFim] = useState(isoDate());
  const [busca, setBusca] = useState('');
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      setDados(await apiFetch<any>(token, '/api/nfse-nacional', { query: { papel: 'todas', inicio, fim, por } }));
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setLoading(false); }
  };

  const sincronizar = async (desdeInicio = false) => {
    setSincronizando(true); setMsg(null);
    try {
      const r = await apiFetch<any>(token, '/api/nfse-nacional/sincronizar', { method: 'POST', body: { desdeInicio } });
      const partes = [r.novos ? `${r.novos} nota(s) nova(s) baixada(s)` : 'Nenhuma nota nova'];
      if (r.eventos) partes.push(`${r.eventos} cancelamento(s) atualizado(s)`);
      partes.push(`${r.total} nota(s) no total`);
      if (!r.completo && !r.alertas?.length) partes.push('ainda há documentos: clique em Sincronizar de novo para continuar');
      setMsg({ type: r.alertas?.length ? 'warn' : 'success', text: [partes.join(' · ') + '.', ...(r.alertas || [])].join('\n') });
      await carregar();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setSincronizando(false); }
  };

  // Primeira abertura: carrega o que já está salvo e busca as novidades no ADN.
  useEffect(() => { carregar().then(() => sincronizar()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return (dados?.docs || [])
      .filter((d: any) => d.papel === papel)
      .filter((d: any) => !q || [d.prestador?.nome, d.tomador?.nome, d.numero, d.descricao].some(v => String(v || '').toLowerCase().includes(q))
        || (qd.length >= 3 && [d.prestador?.doc, d.tomador?.doc, d.chave].some(v => String(v || '').includes(qd))));
  }, [dados, papel, busca]);

  const contagem = (p: string) => (dados?.docs || []).filter((d: any) => d.papel === p).length;
  const ativas = lista.filter((d: any) => !d.cancelada);
  const total = ativas.reduce((a: number, d: any) => a + (Number(d.valor) || 0), 0);
  const totalIss = ativas.reduce((a: number, d: any) => a + (Number(d.iss) || 0), 0);
  const totalRetido = ativas.filter((d: any) => d.issRetido).reduce((a: number, d: any) => a + (Number(d.iss) || 0), 0);

  const importar = async (d: any) => {
    setBusy(d.chave);
    try {
      const r = await apiFetch<any>(token, `/api/nfse-nacional/${d.chave}/importar`, { method: 'POST' });
      setMsg({ type: 'success', text: r.message });
      onImportada?.();
      await carregar();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(''); }
  };

  const outraParte = papel === 'emitida' ? 'tomador' : 'prestador';

  return (
    <Modal
      title={<span className="inline-flex items-center gap-2"><Globe size={18} className="text-brand-orange-dim" /> NFS-e no Ambiente Nacional</span>}
      subtitle={dados ? `${dados.ambiente === '2' ? 'Produção restrita' : 'Produção'} · CNPJ ${fmtDoc(dados.cnpj)} · ${dados.sincronizadoEm ? `sincronizado em ${fmtDateTime(dados.sincronizadoEm)}` : 'ainda não sincronizado'}` : 'Notas emitidas e tomadas registradas no ADN'}
      onClose={onClose}
      width="max-w-6xl"
      footer={<>
        <Btn variant="ghost" className="mr-auto" disabled={sincronizando} onClick={() => confirm('Baixar de novo todos os documentos do Ambiente Nacional, desde o primeiro? Pode levar alguns minutos.') && sincronizar(true)}>Baixar tudo de novo</Btn>
        <Btn onClick={onClose}>Fechar</Btn>
        <Btn variant="primary" icon={<RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''} />} disabled={sincronizando} onClick={() => sincronizar()}>{sincronizando ? 'Sincronizando…' : 'Sincronizar'}</Btn>
      </>}
    >
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <Tabs
          tabs={[
            { id: 'emitida', label: `Emitidas (${contagem('emitida')})` },
            { id: 'tomada', label: `Tomadas (${contagem('tomada')})` },
          ]}
          active={papel}
          onChange={id => setPapel(id as any)}
        />
        <Field label="Período por">
          <Select value={por} onChange={e => setPor(e.target.value as any)} options={[{ value: 'emissao', label: 'Emissão' }, { value: 'competencia', label: 'Competência' }]} />
        </Field>
        <Field label="De"><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></Field>
        <Field label="Até"><Input type="date" value={fim} onChange={e => setFim(e.target.value)} /></Field>
        <Btn icon={<Search size={14} />} loading={loading} onClick={carregar}>Filtrar</Btn>
        <Field label="Buscar" className="flex-1 min-w-[180px]">
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder={`Nome ou CPF/CNPJ do ${outraParte}, número, chave…`} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-brand-muted">
        <span><b className="text-brand-text">{lista.length}</b> nota(s)</span>
        <span>Valor (sem canceladas): <b className="text-brand-text font-mono">{brl(total)}</b></span>
        <span>ISS: <b className="text-brand-text font-mono">{brl(totalIss)}</b></span>
        {totalRetido > 0 && <span>ISS retido: <b className="text-brand-text font-mono">{brl(totalRetido)}</b></span>}
      </div>

      <div className="border border-brand-border rounded-lg overflow-hidden">
        <DataTable
          loading={loading || (sincronizando && !dados?.docs?.length)}
          rows={lista}
          rowKey={(d: any) => d.chave}
          empty={dados?.total ? 'Nenhuma nota para os filtros escolhidos.' : 'Nenhuma nota baixada ainda. Clique em Sincronizar.'}
          columns={[
            { key: 'numero', label: 'Número', render: (d: any) => <div><div className="font-mono">{d.numero || '—'}</div><div className="text-[10.5px] text-brand-dim font-mono" title={d.chave}>…{String(d.chave).slice(-10)}</div></div> },
            { key: 'emissao', label: 'Emissão', render: (d: any) => <div className="whitespace-nowrap"><div>{fmtDate(d.dhEmi || d.dhProc)}</div><div className="text-[11px] text-brand-muted">comp. {String(d.competencia).split('-').reverse().join('/')}</div></div> },
            {
              key: 'parte', label: papel === 'emitida' ? 'Tomador' : 'Prestador', render: (d: any) => {
                const p = papel === 'emitida' ? d.tomador : d.prestador;
                return <div className="min-w-[200px]"><div className="font-medium text-brand-text">{p?.nome || '—'}</div><div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(p?.doc)}{papel === 'tomada' && d.prestador?.municipio ? ` · ${d.prestador.municipio}` : ''}</div></div>;
              },
            },
            { key: 'servico', label: 'Serviço', render: (d: any) => <div className="text-[12px] text-brand-muted max-w-[260px] line-clamp-2" title={d.descricao}>{d.descricao || '—'}</div> },
            { key: 'valor', label: 'Valor', align: 'right', render: (d: any) => <div className="font-mono whitespace-nowrap"><div>{brl(d.valor)}</div>{d.iss > 0 && <div className="text-[11px] text-brand-muted">ISS {brl(d.iss)}{d.issRetido ? ' retido' : ''}</div>}</div> },
            {
              key: 'sit', label: 'Situação', render: (d: any) => (
                <div className="flex flex-col gap-1">
                  {d.cancelada ? <Badge color="gray">Cancelada</Badge> : <Badge color="green">Autorizada</Badge>}
                  {papel === 'emitida' && (d.noSistema ? <span className="text-[11px] text-brand-muted">no sistema</span> : <span className="text-[11px] text-brand-orange-dim">emitida fora do sistema</span>)}
                </div>
              ),
            },
            {
              key: 'acoes', label: '', align: 'right', render: (d: any) => (
                <div className="flex gap-1 justify-end">
                  <IconBtn title="Baixar PDF (DANFSe)" onClick={() => openBlob(token, `/api/nfse-nacional/${d.chave}/pdf`).catch(e => setMsg({ type: 'error', text: e.message }))}><FileDown size={13} /></IconBtn>
                  <IconBtn title="Baixar XML" onClick={() => openBlob(token, `/api/nfse-nacional/${d.chave}/xml`).catch(e => setMsg({ type: 'error', text: e.message }))}><FileCode2 size={13} /></IconBtn>
                  {papel === 'emitida' && !d.noSistema && <IconBtn title="Trazer para Notas emitidas" disabled={busy === d.chave} onClick={() => importar(d)}><Download size={13} /></IconBtn>}
                </div>
              ),
            },
          ]}
        />
      </div>
      <p className="text-[11.5px] text-brand-muted">
        As notas vêm do Ambiente de Dados Nacional pelo certificado A1 da empresa: as emitidas por ela e as que ela tomou de terceiros
        (em que aparece como tomadora). Notas de municípios que ainda não enviam ao ambiente nacional não aparecem aqui.
      </p>
    </Modal>
  );
}
