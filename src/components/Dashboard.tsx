import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, Clock, AlertCircle, Receipt, RefreshCw, Link2, ArrowRight, Mail, FileDown, CheckCircle2,
  UserX, ShieldAlert, UserCog, Hourglass, FileWarning, Loader2, Copy,
} from 'lucide-react';
import { apiFetch, brl, fmtDate, fmtDoc, openBlob, copyText } from '../lib/api';
import { Alert, Badge, Btn, IconBtn } from './ui';
import NfseEmitirModal from './NfseEmitirModal';
import VincularPagadorModal from './VincularPagadorModal';
import { enviarEmailCobranca, STATUS_COBRANCA } from './Cobrancas';
import { SituacaoEntradaBadge, VIA_VINCULO } from './inter/InterEntradas';

export type Navegar = (tab: string, opts?: { interTab?: string; entradas?: { inicio: string; fim: string; filtro: string } }) => void;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesCurto = (m: string) => MESES[Number(m.slice(5, 7)) - 1] || m;
const brlCurto = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v);

function Painel({ titulo, kicker, acoes, children, className = '' }: { titulo: React.ReactNode; kicker?: string; acoes?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-brand-border rounded-[10px] shadow-brand overflow-hidden flex flex-col ${className}`}>
      <header className="px-5 pt-4 pb-3 flex items-start gap-3 border-b border-brand-border">
        <div className="min-w-0">
          {kicker && <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-orange-dim">{kicker}</div>}
          <h2 className="font-serif text-[17px] font-semibold text-brand-forest tracking-[-0.01em] leading-snug">{titulo}</h2>
        </div>
        {acoes && <div className="ml-auto flex items-center gap-2 shrink-0">{acoes}</div>}
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
    </section>
  );
}

function Kpi({ titulo, valor, sub, icone: Icone, tom, delta }: { titulo: string; valor: string; sub: React.ReactNode; icone: React.ElementType; tom: 'forest' | 'orange' | 'red' | 'teal'; delta?: { pct: number | null; texto: string } }) {
  const tons = {
    forest: { barra: 'bg-brand-forest', icone: 'bg-brand-green-subtle text-brand-green' },
    orange: { barra: 'bg-brand-orange', icone: 'bg-brand-orange-soft text-brand-orange-dim' },
    red: { barra: 'bg-red-600', icone: 'bg-red-50 text-red-600' },
    teal: { barra: 'bg-teal-600', icone: 'bg-teal-50 text-teal-700' },
  }[tom];
  return (
    <div className="bg-white border border-brand-border rounded-[10px] p-4 pt-[18px] relative overflow-hidden shadow-brand">
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${tons.barra}`} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-brand-muted uppercase tracking-[0.08em]">{titulo}</span>
        <span className={`w-8 h-8 rounded-md flex items-center justify-center ${tons.icone}`}><Icone size={16} /></span>
      </div>
      <div className="font-serif text-[26px] font-semibold text-brand-forest tabular leading-tight tracking-[-0.01em]">{valor}</div>
      <div className="text-[12px] text-brand-muted mt-1.5 flex items-center gap-1.5 flex-wrap">
        {delta && delta.pct !== null && (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${delta.pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {delta.pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(delta.pct).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
          </span>
        )}
        {delta && <span>{delta.texto}</span>}
        {sub}
      </div>
    </div>
  );
}

function Grafico({ serie }: { serie: { mes: string; recebido: number; faturado: number; notas: number }[] }) {
  const max = Math.max(1, ...serie.flatMap(s => [s.recebido, s.faturado]));
  const totalRec = serie.reduce((a, s) => a + s.recebido, 0);
  const totalFat = serie.reduce((a, s) => a + s.faturado, 0);
  return (
    <div className="p-5 pt-4 h-full flex flex-col">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-brand-muted mb-4">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-forest" /> Recebido <b className="text-brand-text tabular">{brl(totalRec)}</b></span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-orange" /> Faturado em NFS-e <b className="text-brand-text tabular">{brl(totalFat)}</b></span>
      </div>
      <div className="grid grid-cols-6 gap-3 h-[230px] items-end border-b border-brand-border">
        {serie.map((s, i) => (
          <div key={s.mes} className="h-full flex items-end justify-center gap-1 group relative">
            <div
              className={`w-[38%] max-w-7 rounded-t-[3px] transition-all ${i === serie.length - 1 ? 'bg-brand-forest' : 'bg-brand-forest/75'}`}
              style={{ height: `${Math.max(s.recebido ? 2 : 0, (s.recebido / max) * 100)}%` }}
              title={`Recebido em ${mesCurto(s.mes)}: ${brl(s.recebido)}`}
            />
            <div
              className="w-[38%] max-w-7 rounded-t-[3px] bg-brand-orange transition-all"
              style={{ height: `${Math.max(s.faturado ? 2 : 0, (s.faturado / max) * 100)}%` }}
              title={`NFS-e de ${mesCurto(s.mes)}: ${brl(s.faturado)} (${s.notas} nota${s.notas === 1 ? '' : 's'})`}
            />
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full bg-brand-forest text-white text-[11px] rounded-md px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 shadow-brand">
              <div>Recebido: <b>{brl(s.recebido)}</b></div>
              <div>NFS-e: <b>{brl(s.faturado)}</b> · {s.notas} nota{s.notas === 1 ? '' : 's'}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-3 mt-2">
        {serie.map((s, i) => (
          <div key={s.mes} className={`text-center text-[11.5px] ${i === serie.length - 1 ? 'text-brand-forest font-semibold' : 'text-brand-muted'}`}>
            {mesCurto(s.mes)}
            <div className="text-[10.5px] text-brand-dim tabular">{s.recebido ? brlCurto(s.recebido) : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemPendencia({ icone: Icone, tom, titulo, detalhe, acao, onClick }: { key?: string; icone: React.ElementType; tom: 'orange' | 'red' | 'amber' | 'forest' | 'gray'; titulo: React.ReactNode; detalhe?: React.ReactNode; acao?: string; onClick?: () => void }) {
  const tons = {
    orange: 'bg-brand-orange-soft text-brand-orange-dim',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
    forest: 'bg-brand-green-subtle text-brand-green',
    gray: 'bg-brand-surface3 text-brand-muted',
  }[tom];
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-brand-border last:border-0">
      <span className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${tons}`}><Icone size={17} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-brand-text leading-snug">{titulo}</div>
        {detalhe && <div className="text-[12px] text-brand-muted leading-snug">{detalhe}</div>}
      </div>
      {acao && onClick && (
        <button onClick={onClick} className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-orange-dim hover:text-brand-forest transition-colors">
          {acao} <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

function tempoRelativo(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 30) return `há ${dias} dia${dias === 1 ? '' : 's'}`;
  return d.toLocaleDateString('pt-BR');
}

const COR_ATIVIDADE: Record<string, string> = { nfse: 'bg-brand-orange', pago: 'bg-emerald-600', cobranca: 'bg-brand-forest', cancelada: 'bg-slate-400', erro: 'bg-red-600' };

export default function Dashboard({ token, refreshKey, navegar }: { token: string; refreshKey: number; navegar: Navegar }) {
  const [dados, setDados] = useState<any>(null);
  const [cobrancas, setCobrancas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filtro, setFiltro] = useState('all');
  const [emitirEntrada, setEmitirEntrada] = useState<any>(null);
  const [emitirCobranca, setEmitirCobranca] = useState<any>(null);
  const [vinculando, setVinculando] = useState<any>(null);
  const [enviando, setEnviando] = useState('');

  const carregar = async (forcar = false) => {
    if (forcar) setAtualizando(true);
    setErro('');
    try {
      const [d, c] = await Promise.all([
        apiFetch<any>(token, '/api/dashboard', { query: forcar ? { atualizar: 1 } : undefined }),
        apiFetch<any[]>(token, '/api/cobrancas'),
      ]);
      setDados(d);
      setCobrancas(c);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  };
  useEffect(() => { carregar(); }, [token, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviarEmail = async (c: any) => {
    setEnviando(c.id);
    try {
      await enviarEmailCobranca(token, c);
      setMsg({ type: 'success', text: `E-mail enviado para ${c.clientEmail}.` });
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message || 'Erro ao enviar e-mail' });
    } finally {
      setEnviando('');
    }
  };

  const cobrancasRecentes = useMemo(() => cobrancas
    .filter(c => filtro === 'all' || c.status === filtro)
    .sort((a, b) => String(b.createdAt || b.updatedAt || b.due || '').localeCompare(String(a.createdAt || a.updatedAt || a.due || '')))
    .slice(0, 8), [cobrancas, filtro]);

  if (loading) {
    return <div className="flex flex-col items-center justify-center h-full gap-3 text-brand-muted text-[13px]"><Loader2 className="animate-spin text-brand-green" />Montando o painel…</div>;
  }
  if (!dados) return <Alert type="error">{erro || 'Não foi possível carregar o dashboard.'}</Alert>;

  const k = dados.kpis;
  const p = dados.pendencias;
  const deltaRec = k.recebidoMesAnterior > 0 ? ((k.recebidoMes - k.recebidoMesAnterior) / k.recebidoMesAnterior) * 100 : null;
  const mesNome = MESES_LONGOS[Number(String(dados.hoje).slice(5, 7)) - 1];
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const irEntradas = (filtroEntradas: string) => navegar('Banco Inter', { interTab: 'entradas', entradas: { inicio: p.periodo.inicio, fim: p.periodo.fim, filtro: filtroEntradas } });

  const pendencias: React.ReactNode[] = [];
  if (p.prontas.qtd) pendencias.push(<ItemPendencia key="prontas" icone={Receipt} tom="orange" titulo={`${p.prontas.qtd} recebimento${p.prontas.qtd > 1 ? 's' : ''} sem NFS-e`} detalhe={`${brl(p.prontas.valor)} com cliente identificado, prontos para emitir`} acao="Emitir" onClick={() => irEntradas('pendentes')} />);
  if (p.semCliente.qtd) pendencias.push(<ItemPendencia key="semcliente" icone={UserX} tom="amber" titulo={`${p.semCliente.qtd} pagamento${p.semCliente.qtd > 1 ? 's' : ''} sem cliente identificado`} detalhe={`${brl(p.semCliente.valor)} · pago por outra pessoa? Vincule à empresa`} acao="Vincular" onClick={() => irEntradas('sem-cliente')} />);
  if (k.emAtrasoQtd) pendencias.push(<ItemPendencia key="atraso" icone={AlertCircle} tom="red" titulo={`${k.emAtrasoQtd} cobrança${k.emAtrasoQtd > 1 ? 's' : ''} em atraso`} detalhe={`${brl(k.emAtraso)} de ${k.emAtrasoClientes} cliente${k.emAtrasoClientes > 1 ? 's' : ''}`} acao="Cobrar" onClick={() => navegar('Cobranças')} />);
  if (p.errosEmissao.length) pendencias.push(<ItemPendencia key="erros" icone={FileWarning} tom="red" titulo={`${p.errosEmissao.length} falha${p.errosEmissao.length > 1 ? 's' : ''} na emissão automática`} detalhe={p.errosEmissao[0]?.erro ? `${p.errosEmissao[0].clientName}: ${String(p.errosEmissao[0].erro).slice(0, 90)}` : undefined} acao="Ver" onClick={() => navegar('Cobranças')} />);
  for (const c of p.certificados || []) pendencias.push(<ItemPendencia key={c.nome} icone={ShieldAlert} tom="red" titulo={c.dias < 0 ? `${c.nome} vencido` : `${c.nome} vence em ${c.dias} dia${c.dias === 1 ? '' : 's'}`} detalhe={`Validade: ${fmtDate(c.validTo)}`} acao="Renovar" onClick={() => c.nome.includes('Inter') ? navegar('Banco Inter', { interTab: 'config' }) : navegar('Configurações')} />);
  if (p.cadastrosIncompletos) pendencias.push(<ItemPendencia key="cadastros" icone={UserCog} tom="gray" titulo={`${p.cadastrosIncompletos} cadastro${p.cadastrosIncompletos > 1 ? 's' : ''} incompleto${p.cadastrosIncompletos > 1 ? 's' : ''}`} detalhe="Sem CPF/CNPJ, CEP ou endereço: atrapalha boleto e NFS-e" acao="Revisar" onClick={() => navegar('Clientes')} />);
  if (p.aguardandoPagamento) pendencias.push(<ItemPendencia key="aguardando" icone={Hourglass} tom="forest" titulo={`${p.aguardandoPagamento} NFS-e programada${p.aguardandoPagamento > 1 ? 's' : ''} para o pagamento`} detalhe="Emitidas automaticamente quando o boleto for pago" />);

  const resumoHero = p.prontas.qtd || p.semCliente.qtd
    ? <>Você tem <b className="text-white">{p.prontas.qtd + p.semCliente.qtd} recebimento{p.prontas.qtd + p.semCliente.qtd > 1 ? 's' : ''}</b> aguardando nota fiscal{p.semCliente.qtd ? <>, {p.semCliente.qtd} sem cliente identificado</> : ''}.</>
    : k.emAtrasoQtd ? <>Notas em dia. Há <b className="text-white">{k.emAtrasoQtd} cobrança{k.emAtrasoQtd > 1 ? 's' : ''} em atraso</b> para acompanhar.</>
    : <>Tudo em dia: nenhum recebimento sem nota e nenhuma cobrança em atraso.</>;

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Abertura, no estilo do site */}
      <div className="virgula-marca bg-brand-forest rounded-[10px] px-6 py-5 text-white/75 flex flex-wrap items-center gap-4" style={{ ['--virgula-right' as any]: '19rem' }}>
        <div className="relative min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-orange-light">Painel · {mesNome} de {String(dados.hoje).slice(0, 4)}</div>
          <h2 className="font-serif text-[24px] font-semibold text-white tracking-[-0.015em] mt-1.5 leading-tight">{saudacao}!</h2>
          <p className="text-[14px] mt-1 max-w-2xl">{resumoHero}</p>
        </div>
        <div className="relative ml-auto flex gap-2">
          {(p.prontas.qtd > 0 || p.semCliente.qtd > 0) && (
            <button onClick={() => irEntradas('pendentes')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand-orange hover:bg-brand-orange-dim text-white text-[13px] font-semibold transition-colors">
              <Receipt size={15} /> Emitir notas
            </button>
          )}
          <button onClick={() => carregar(true)} disabled={atualizando} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-white/20 text-white hover:bg-white/10 text-[13px] font-semibold transition-colors disabled:opacity-60">
            <RefreshCw size={14} className={atualizando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {erro && <Alert type="error" onClose={() => setErro('')}>{erro}</Alert>}
      {dados.interErro && <Alert type="warn">Não foi possível ler o extrato do Banco Inter agora ({dados.interErro}). Os valores recebidos abaixo vêm só das cobranças.</Alert>}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <Kpi titulo="Recebido no mês" valor={brl(k.recebidoMes)} icone={TrendingUp} tom="forest"
          delta={{ pct: deltaRec, texto: `vs ${brl(k.recebidoMesAnterior)} no mês anterior` }}
          sub={dados.fonteRecebidos === 'inter' ? null : <span>(cobranças pagas)</span>} />
        <Kpi titulo="A receber" valor={brl(k.aReceber)} icone={Clock} tom="orange"
          sub={<span>{k.aReceberQtd} cobrança{k.aReceberQtd === 1 ? '' : 's'}{k.vencendo7Qtd ? ` · ${k.vencendo7Qtd} vence${k.vencendo7Qtd > 1 ? 'm' : ''} em 7 dias` : ''}</span>} />
        <Kpi titulo="Em atraso" valor={brl(k.emAtraso)} icone={AlertCircle} tom="red"
          sub={<span>{k.emAtrasoQtd ? `${k.emAtrasoQtd} cobrança${k.emAtrasoQtd > 1 ? 's' : ''} · ${k.emAtrasoClientes} cliente${k.emAtrasoClientes > 1 ? 's' : ''}` : 'Nenhuma cobrança vencida'}</span>} />
        <Kpi titulo="NFS-e no mês" valor={String(k.nfseMesQtd)} icone={Receipt} tom="teal"
          sub={<span>{brl(k.nfseMesValor)} emitidos{p.prontas.qtd + p.semCliente.qtd ? ` · ${p.prontas.qtd + p.semCliente.qtd} pendente${p.prontas.qtd + p.semCliente.qtd > 1 ? 's' : ''}` : ''}</span>} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <Painel kicker="Últimos 6 meses" titulo="Recebido × faturado em NFS-e">
          <Grafico serie={dados.serie} />
        </Painel>
        <Painel kicker="Pendências" titulo="O que precisa de atenção">
          {pendencias.length ? pendencias : (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 size={34} className="mx-auto text-emerald-600 mb-2" />
              <div className="font-serif text-[16px] text-brand-forest font-semibold">Tudo em dia</div>
              <div className="text-[12.5px] text-brand-muted mt-1">Nenhuma pendência de nota, cobrança ou cadastro.</div>
            </div>
          )}
          {!dados.interConfigurado && (
            <ItemPendencia icone={Link2} tom="gray" titulo="Recebimentos do Banco Inter" detalhe="Configure a integração para acompanhar as entradas e emitir as notas dos recebimentos." acao="Configurar" onClick={() => navegar('Banco Inter', { interTab: 'config' })} />
          )}
        </Painel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <Painel kicker="Conta Inter" titulo="Recebimentos recentes"
          acoes={dados.interConfigurado && <button onClick={() => navegar('Banco Inter', { interTab: 'entradas' })} className="text-[12.5px] font-semibold text-brand-orange-dim hover:text-brand-forest inline-flex items-center gap-1">Ver entradas <ArrowRight size={13} /></button>}>
          {dados.recebimentos.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-brand-muted">{dados.interConfigurado ? 'Nenhum recebimento nos últimos meses.' : 'Integração com o Banco Inter não configurada.'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>{['Data', 'Pagador → cliente', 'Valor', 'NFS-e', ''].map(h => <th key={h} className={`px-4 py-2 text-[11px] font-semibold text-brand-muted uppercase tracking-[0.06em] border-b border-brand-border bg-brand-surface2 ${h === 'Valor' ? 'text-right' : ''}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {dados.recebimentos.map((e: any) => (
                    <tr key={e.idTransacao} className="border-b border-brand-border last:border-0 hover:bg-brand-surface2">
                      <td className="px-4 py-2.5 text-[12.5px] text-brand-muted whitespace-nowrap">{fmtDate(e.data)}</td>
                      <td className="px-4 py-2.5 text-[13px] min-w-[200px]">
                        <div className="font-medium text-brand-text truncate max-w-[320px]">{e.pagador?.nome || e.titulo || '—'}</div>
                        <div className="text-[11.5px] text-brand-muted">
                          {e.cliente
                            ? <>→ {e.cliente.name}{e.cliente.via && e.cliente.via !== 'documento' ? <span className="text-brand-orange-dim"> · {VIA_VINCULO[e.cliente.via]}</span> : ''}</>
                            : <span className={e.situacao === 'pendente' ? 'text-amber-700' : 'text-brand-dim'}>cliente não identificado {e.pagador?.cpfCnpj ? `· ${fmtDoc(e.pagador.cpfCnpj)}` : ''}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[13px] font-medium whitespace-nowrap">{brl(e.valor)}</td>
                      <td className="px-4 py-2.5"><SituacaoEntradaBadge e={e} /></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {e.situacao === 'pendente' && e.cliente && <Btn variant="primary" className="!py-1 !px-2.5 !text-[12px]" icon={<Receipt size={13} />} onClick={() => setEmitirEntrada(e)}>Emitir</Btn>}
                        {e.situacao === 'pendente' && !e.cliente && <Btn variant="orange" className="!py-1 !px-2.5 !text-[12px]" icon={<Link2 size={13} />} onClick={() => setVinculando(e)}>Vincular</Btn>}
                        {e.nfse && <IconBtn title="Baixar PDF da NFS-e" onClick={() => openBlob(token, `/api/nfse/${e.nfse.id}/pdf`).catch(err => setMsg({ type: 'error', text: err.message }))}><FileDown size={13} /></IconBtn>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Painel>

        <Painel kicker="Cobranças" titulo="Vencimentos e atrasos"
          acoes={<button onClick={() => navegar('Cobranças')} className="text-[12.5px] font-semibold text-brand-orange-dim hover:text-brand-forest inline-flex items-center gap-1">Todas <ArrowRight size={13} /></button>}>
          {dados.vencimentos.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-brand-muted">Nada vencido nem vencendo nos próximos 7 dias.</div>
          ) : dados.vencimentos.map((c: any) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3 border-b border-brand-border last:border-0">
              <div className={`w-11 shrink-0 text-center rounded-md py-1 ${c.status === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-brand-orange-soft text-brand-orange-dim'}`}>
                <div className="text-[15px] font-bold leading-none tabular">{String(c.due).slice(8, 10)}</div>
                <div className="text-[10px] uppercase font-semibold">{mesCurto(String(c.due))}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-brand-text truncate">{c.clientName}</div>
                <div className={`text-[11.5px] ${c.status === 'overdue' ? 'text-red-600' : 'text-brand-muted'}`}>
                  {c.dias < 0 ? `${Math.abs(c.dias)} dia${Math.abs(c.dias) === 1 ? '' : 's'} em atraso` : c.dias === 0 ? 'vence hoje' : `vence em ${c.dias} dia${c.dias === 1 ? '' : 's'}`}
                  {' · '}<span className="font-mono text-brand-text">{brl(c.value)}</span>
                </div>
              </div>
              <div className="flex gap-1">
                {c.boleto?.linhaDigitavel && <IconBtn title="Copiar linha digitável" onClick={() => copyText(c.boleto.linhaDigitavel).then(ok => ok && setMsg({ type: 'success', text: 'Linha digitável copiada.' }))}><Copy size={13} /></IconBtn>}
                {c.inter?.codigoSolicitacao && <IconBtn title="Baixar PDF do boleto" onClick={() => openBlob(token, `/api/inter/cobrancas/${c.inter.codigoSolicitacao}/pdf`).catch(err => setMsg({ type: 'error', text: err.message }))}><FileDown size={13} /></IconBtn>}
                <IconBtn title={c.clientEmail ? `Enviar cobrança para ${c.clientEmail}` : 'Cliente sem e-mail cadastrado'} disabled={enviando === c.id} onClick={() => enviarEmail(c)}>
                  {enviando === c.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                </IconBtn>
              </div>
            </div>
          ))}
        </Painel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <Painel kicker="Cobranças" titulo="Cobranças recentes"
          acoes={
            <div className="flex gap-1 bg-brand-surface3 rounded-md p-0.5">
              {['all', 'paid', 'pending', 'overdue', 'canceled'].map(f => (
                <button key={f} onClick={() => setFiltro(f)} className={`px-2.5 py-1 rounded text-[12px] font-medium transition-all ${filtro === f ? 'bg-white text-brand-forest shadow-sm' : 'text-brand-muted hover:text-brand-forest'}`}>
                  {f === 'all' ? 'Todas' : f === 'paid' ? 'Pagas' : f === 'pending' ? 'Pendentes' : f === 'overdue' ? 'Em atraso' : 'Canceladas'}
                </button>
              ))}
            </div>
          }>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>{['Cliente', 'Valor', 'Vencimento', 'Status', 'NFS-e', ''].map(h => <th key={h} className="px-4 py-2 text-[11px] font-semibold text-brand-muted uppercase tracking-[0.06em] border-b border-brand-border bg-brand-surface2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {cobrancasRecentes.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-brand-muted">Nenhuma cobrança encontrada.</td></tr>
                ) : cobrancasRecentes.map(c => {
                  const st = STATUS_COBRANCA[c.status] || { label: c.status, color: 'gray' };
                  return (
                    <tr key={c.id} className="border-b border-brand-border last:border-0 hover:bg-brand-surface2">
                      <td className="px-4 py-2.5">
                        <div className="text-[13px] font-medium text-brand-text">{c.clientName || 'Cliente'}</div>
                        <div className="font-mono text-[11px] text-brand-muted">{c.inter?.seuNumero || c.id}</div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[13px] whitespace-nowrap">{brl(c.value)}</td>
                      <td className="px-4 py-2.5 text-[12.5px] text-brand-muted whitespace-nowrap">{fmtDate(c.due)}</td>
                      <td className="px-4 py-2.5"><Badge color={st.color}>{st.label}</Badge></td>
                      <td className="px-4 py-2.5 text-[12px]">
                        {c.nfse ? <span className="text-emerald-700 font-medium">✓ Emitida</span> : c.nfseErro ? <span className="text-red-600" title={c.nfseErro.erro}>Erro</span> : c.emitirNfseAoPagar ? <span className="text-sky-700">Ao receber</span> : <span className="text-brand-dim">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 justify-end">
                          {!c.nfse && c.status !== 'canceled' && <IconBtn title="Emitir NFS-e" onClick={() => setEmitirCobranca(c)}><Receipt size={13} /></IconBtn>}
                          <IconBtn title="Enviar por e-mail" disabled={enviando === c.id} onClick={() => enviarEmail(c)}>{enviando === c.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}</IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Painel>

        <div className="flex flex-col gap-5">
          <Painel kicker="Histórico" titulo="Atividades recentes">
            {dados.atividades.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-brand-muted">Nenhuma atividade registrada ainda.</div>
            ) : (
              <ul className="py-1.5">
                {dados.atividades.map((a: any, i: number) => (
                  <li key={i} className="flex gap-3 px-5 py-2">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${COR_ATIVIDADE[a.tipo] || 'bg-brand-dim'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-brand-body leading-snug">{a.texto}{a.valor ? <span className="font-mono text-brand-text"> · {brl(a.valor)}</span> : ''}</div>
                      <div className="text-[11px] text-brand-dim">{tempoRelativo(a.em)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Painel>

          {dados.topClientes.length > 0 && (
            <Painel kicker="Últimos 12 meses" titulo="Maiores clientes (NFS-e)">
              <div className="px-5 py-3 flex flex-col gap-2.5">
                {dados.topClientes.map((c: any) => (
                  <div key={c.nome}>
                    <div className="flex justify-between gap-2 text-[12.5px]">
                      <span className="truncate text-brand-text font-medium">{c.nome}</span>
                      <span className="font-mono text-brand-muted shrink-0">{brl(c.valor)}</span>
                    </div>
                    <div className="h-1.5 bg-brand-surface3 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-brand-forest rounded-full" style={{ width: `${(c.valor / dados.topClientes[0].valor) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Painel>
          )}
        </div>
      </div>

      {emitirEntrada && (
        <NfseEmitirModal
          token={token}
          titulo="Emitir NFS-e do recebimento"
          inicial={{ clienteId: emitirEntrada.cliente?.id, valor: emitirEntrada.valor, competencia: String(emitirEntrada.data).slice(0, 7), pagador: emitirEntrada.pagador }}
          origem={{ tipo: 'inter-extrato', idTransacao: emitirEntrada.idTransacao, data: emitirEntrada.data, pagador: emitirEntrada.pagador }}
          onClose={() => setEmitirEntrada(null)}
          onSuccess={() => carregar()}
        />
      )}
      {emitirCobranca && (
        <NfseEmitirModal
          token={token}
          titulo="Emitir NFS-e da cobrança"
          inicial={{ clienteId: emitirCobranca.client, cliente: emitirCobranca.clientName, valor: Number(emitirCobranca.inter?.valorTotalRecebido) || emitirCobranca.value, competencia: String(emitirCobranca.due || '').slice(0, 7) }}
          origem={{ tipo: 'cobranca', cobrancaId: emitirCobranca.id, codigoSolicitacao: emitirCobranca.inter?.codigoSolicitacao }}
          onClose={() => setEmitirCobranca(null)}
          onSuccess={() => carregar()}
        />
      )}
      {vinculando && (
        <VincularPagadorModal token={token} entrada={vinculando} onClose={() => setVinculando(null)} onDone={text => { setMsg({ type: 'success', text }); carregar(); }} />
      )}
    </div>
  );
}
