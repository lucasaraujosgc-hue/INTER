import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Clock, AlertCircle, Receipt, RefreshCw, Link2, ArrowRight, Mail, FileDown, CheckCircle2,
  UserX, ShieldAlert, UserCog, Hourglass, FileWarning, Loader2, Copy,
} from 'lucide-react';
import { apiFetch, brl, fmtDate, openBlob, copyText } from '../lib/api';
import { Alert, Badge, Btn, IconBtn } from './ui';
import NfseEmitirModal from './NfseEmitirModal';
import MarcarPagoModal, { BoletoParaBaixa } from './MarcarPagoModal';
import { enviarEmailCobranca } from './Cobrancas';

export type Navegar = (tab: string, opts?: { interTab?: string; entradas?: { inicio: string; fim: string; filtro: string } }) => void;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesCurto = (m: string) => MESES[Number(String(m).slice(5, 7)) - 1] || m;

const STATUS_BOLETO: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'gray' }> = {
  paid: { label: 'Pago', color: 'green' },
  pending: { label: 'A receber', color: 'amber' },
  overdue: { label: 'Em atraso', color: 'red' },
  canceled: { label: 'Cancelado', color: 'gray' },
};

function Painel({ titulo, kicker, acoes, children, className = '' }: { titulo: React.ReactNode; kicker?: string; acoes?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-brand-border rounded-[10px] shadow-brand overflow-hidden flex flex-col ${className}`}>
      <header className="px-5 pt-4 pb-3 flex flex-wrap items-start gap-3 border-b border-brand-border">
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

function Kpi({ titulo, valor, sub, icone: Icone, tom, onClick }: { titulo: string; valor: string; sub: React.ReactNode; icone: React.ElementType; tom: 'destaque' | 'forest' | 'orange' | 'red'; onClick?: () => void }) {
  const destaque = tom === 'destaque';
  const tons = {
    destaque: { barra: 'bg-brand-orange', icone: 'bg-white/10 text-brand-orange-light' },
    forest: { barra: 'bg-emerald-600', icone: 'bg-emerald-50 text-emerald-700' },
    orange: { barra: 'bg-brand-orange', icone: 'bg-brand-orange-soft text-brand-orange-dim' },
    red: { barra: 'bg-red-600', icone: 'bg-red-50 text-red-600' },
  }[tom];
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`text-left rounded-[10px] p-4 pt-[18px] relative overflow-hidden shadow-brand border transition-colors ${destaque ? 'virgula-marca bg-brand-forest border-brand-forest text-white' : 'bg-white border-brand-border'} ${onClick ? (destaque ? 'hover:bg-brand-forest2' : 'hover:border-brand-border-green') : ''}`}>
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${tons.barra}`} />
      <div className="relative flex items-center justify-between mb-2">
        <span className={`text-[11px] font-bold uppercase tracking-[0.08em] ${destaque ? 'text-brand-orange-light' : 'text-brand-muted'}`}>{titulo}</span>
        <span className={`w-8 h-8 rounded-md flex items-center justify-center ${tons.icone}`}><Icone size={16} /></span>
      </div>
      <div className={`relative font-serif text-[26px] font-semibold tabular leading-tight tracking-[-0.01em] ${destaque ? 'text-white' : 'text-brand-forest'}`}>{valor}</div>
      <div className={`relative text-[12px] mt-1.5 ${destaque ? 'text-white/65' : 'text-brand-muted'}`}>{sub}</div>
    </Tag>
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

const paraBaixa = (b: any): BoletoParaBaixa => ({ codigo: b.codigo, pagador: b.cliente?.name || b.pagador, valor: b.valor, vencimento: b.vencimento, situacao: b.situacao });

/** Formato esperado pelo envio de e-mail das cobranças. */
const paraEmail = (b: any) => ({
  id: b.local?.id || b.codigo,
  clientName: b.cliente?.name || b.pagador,
  clientEmail: b.cliente?.email || '',
  value: b.valor,
  due: b.vencimento,
  boleto: b.linhaDigitavel ? { linhaDigitavel: b.linhaDigitavel } : null,
  inter: b.local ? { codigoSolicitacao: b.codigo } : null,
  nfse: b.local?.nfse?.id || null,
});

export default function Dashboard({ token, refreshKey, navegar }: { token: string; refreshKey: number; navegar: Navegar }) {
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filtro, setFiltro] = useState('all');
  const [emitirBoleto, setEmitirBoleto] = useState<any>(null);
  const [marcarPago, setMarcarPago] = useState<BoletoParaBaixa | null>(null);
  const [enviando, setEnviando] = useState('');

  const carregar = async (forcar = false) => {
    if (forcar) setAtualizando(true);
    setErro('');
    try {
      setDados(await apiFetch<any>(token, '/api/dashboard', { query: forcar ? { atualizar: 1 } : undefined }));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  };
  useEffect(() => { carregar(); }, [token, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviarEmail = async (b: any) => {
    setEnviando(b.codigo);
    try {
      await enviarEmailCobranca(token, paraEmail(b));
      setMsg({ type: 'success', text: `E-mail enviado para ${b.cliente?.email}.` });
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message || 'Erro ao enviar e-mail' });
    } finally {
      setEnviando('');
    }
  };

  const boletosFiltrados = useMemo(() => (dados?.boletos || [])
    .filter((b: any) => filtro === 'all' || b.status === filtro)
    .slice(0, 8), [dados, filtro]);

  if (loading) {
    return <div className="flex flex-col items-center justify-center h-full gap-3 text-brand-muted text-[13px]"><Loader2 className="animate-spin text-brand-green" />Montando o painel…</div>;
  }
  if (!dados) return <Alert type="error">{erro || 'Não foi possível carregar o dashboard.'}</Alert>;

  const k = dados.kpis;
  const p = dados.pendencias;
  const mesNome = MESES_LONGOS[Number(String(dados.hoje).slice(5, 7)) - 1];
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const irEntradas = (filtroEntradas: string) => navegar('Entradas → NFS-e', { entradas: { inicio: p.periodo.inicio, fim: p.periodo.fim, filtro: filtroEntradas } });
  const irBoletos = () => navegar('Boletos / Cobranças');

  const pendencias: React.ReactNode[] = [];
  if (p.prontas.qtd) pendencias.push(<ItemPendencia key="prontas" icone={Receipt} tom="orange" titulo={`${p.prontas.qtd} recebimento${p.prontas.qtd > 1 ? 's' : ''} sem NFS-e`} detalhe={`${brl(p.prontas.valor)} com cliente identificado, prontos para emitir`} acao="Emitir" onClick={() => irEntradas('pendentes')} />);
  if (p.semCliente.qtd) pendencias.push(<ItemPendencia key="semcliente" icone={UserX} tom="amber" titulo={`${p.semCliente.qtd} pagamento${p.semCliente.qtd > 1 ? 's' : ''} sem cliente identificado`} detalhe={`${brl(p.semCliente.valor)} · pago por outra pessoa? Vincule à empresa`} acao="Vincular" onClick={() => irEntradas('sem-cliente')} />);
  if (k.emAtrasoQtd) pendencias.push(<ItemPendencia key="atraso" icone={AlertCircle} tom="red" titulo={`${k.emAtrasoQtd} boleto${k.emAtrasoQtd > 1 ? 's' : ''} em atraso`} detalhe={`${brl(k.emAtraso)} de ${k.emAtrasoClientes} cliente${k.emAtrasoClientes > 1 ? 's' : ''} · pagou por Pix? Marque como pago`} acao="Ver" onClick={irBoletos} />);
  if (p.errosEmissao.length) pendencias.push(<ItemPendencia key="erros" icone={FileWarning} tom="red" titulo={`${p.errosEmissao.length} falha${p.errosEmissao.length > 1 ? 's' : ''} na emissão automática`} detalhe={p.errosEmissao[0]?.erro ? `${p.errosEmissao[0].clientName}: ${String(p.errosEmissao[0].erro).slice(0, 90)}` : undefined} acao="Ver" onClick={irBoletos} />);
  for (const c of p.certificados || []) pendencias.push(<ItemPendencia key={c.nome} icone={ShieldAlert} tom="red" titulo={c.dias < 0 ? `${c.nome} vencido` : `${c.nome} vence em ${c.dias} dia${c.dias === 1 ? '' : 's'}`} detalhe={`Validade: ${fmtDate(c.validTo)}`} acao="Renovar" onClick={() => c.nome.includes('Inter') ? navegar('Banco Inter', { interTab: 'config' }) : navegar('Configurações')} />);
  if (p.cadastrosIncompletos) pendencias.push(<ItemPendencia key="cadastros" icone={UserCog} tom="gray" titulo={`${p.cadastrosIncompletos} cadastro${p.cadastrosIncompletos > 1 ? 's' : ''} incompleto${p.cadastrosIncompletos > 1 ? 's' : ''}`} detalhe="Sem CPF/CNPJ, CEP ou endereço: atrapalha boleto e NFS-e" acao="Revisar" onClick={() => navegar('Clientes')} />);
  if (p.aguardandoPagamento) pendencias.push(<ItemPendencia key="aguardando" icone={Hourglass} tom="forest" titulo={`${p.aguardandoPagamento} NFS-e programada${p.aguardandoPagamento > 1 ? 's' : ''} para o pagamento`} detalhe="Emitidas automaticamente quando o boleto for pago" />);

  const semNota = p.prontas.qtd + p.semCliente.qtd;
  const resumoHero = semNota
    ? <>Você tem <b className="text-white">{semNota} recebimento{semNota > 1 ? 's' : ''}</b> aguardando nota fiscal{p.semCliente.qtd ? <>, {p.semCliente.qtd} sem cliente identificado</> : ''}.</>
    : k.emAtrasoQtd ? <>Notas em dia. Há <b className="text-white">{k.emAtrasoQtd} boleto{k.emAtrasoQtd > 1 ? 's' : ''} em atraso</b> para acompanhar.</>
    : <>Tudo em dia: nenhum recebimento sem nota e nenhum boleto em atraso.</>;

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
          {semNota > 0 && (
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
      {dados.interErro && <Alert type="warn">Parte dos dados do Banco Inter não pôde ser lida agora ({dados.interErro}).{dados.fonteBoletos === 'sistema' ? ' Os boletos abaixo vêm das cobranças registradas no sistema.' : ''}</Alert>}

      {/* Cards: saldo e boletos do Banco Inter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <Kpi titulo="Saldo" tom="destaque" icone={Wallet}
          valor={dados.saldo ? brl(dados.saldo.disponivel) : '—'}
          sub={dados.saldo
            ? <>Disponível na conta Inter{dados.saldo.bloqueado ? ` · ${brl(dados.saldo.bloqueado)} bloqueado` : ''}</>
            : dados.interConfigurado ? 'Saldo indisponível no momento' : 'Configure o Banco Inter para ver o saldo'}
          onClick={() => navegar('Banco Inter', { interTab: 'extrato' })} />
        <Kpi titulo="Boletos recebidos" tom="forest" icone={CheckCircle2} valor={brl(k.recebidosMes)}
          sub={<>{k.recebidosMesQtd} no mês{k.recebidosManualMesQtd ? ` (${k.recebidosManualMesQtd} por fora)` : ''} · {brl(k.recebidosAno)} no ano</>}
          onClick={irBoletos} />
        <Kpi titulo="Boletos a receber" tom="orange" icone={Clock} valor={brl(k.aReceber)}
          sub={<>{k.aReceberQtd} boleto{k.aReceberQtd === 1 ? '' : 's'}{k.vencendo7Qtd ? ` · ${k.vencendo7Qtd} vence${k.vencendo7Qtd > 1 ? 'm' : ''} em 7 dias` : ''}</>}
          onClick={irBoletos} />
        <Kpi titulo="Boletos em atraso" tom="red" icone={AlertCircle} valor={brl(k.emAtraso)}
          sub={k.emAtrasoQtd ? `${k.emAtrasoQtd} boleto${k.emAtrasoQtd > 1 ? 's' : ''} · ${k.emAtrasoClientes} cliente${k.emAtrasoClientes > 1 ? 's' : ''}` : 'Nenhum boleto vencido'}
          onClick={irBoletos} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <Painel kicker={dados.fonteBoletos === 'inter' ? 'Conta Inter' : 'Cobranças do sistema'} titulo="Boletos / Cobranças"
          acoes={
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-brand-surface3 rounded-md p-0.5">
                {[['all', 'Todos'], ['paid', 'Pagos'], ['pending', 'A receber'], ['overdue', 'Em atraso'], ['canceled', 'Cancelados']].map(([f, l]) => (
                  <button key={f} onClick={() => setFiltro(f)} className={`px-2.5 py-1 rounded text-[12px] font-medium transition-all ${filtro === f ? 'bg-white text-brand-forest shadow-sm' : 'text-brand-muted hover:text-brand-forest'}`}>{l}</button>
                ))}
              </div>
              <button onClick={irBoletos} className="text-[12.5px] font-semibold text-brand-orange-dim hover:text-brand-forest inline-flex items-center gap-1">Todos <ArrowRight size={13} /></button>
            </div>
          }>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>{['Cliente', 'Valor', 'Vencimento', 'Status', 'NFS-e', ''].map(h => <th key={h} className="px-3 py-2 text-[11px] font-semibold text-brand-muted uppercase tracking-[0.06em] border-b border-brand-border bg-brand-surface2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {boletosFiltrados.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-brand-muted">Nenhum boleto encontrado.</td></tr>
                ) : boletosFiltrados.map((b: any) => {
                  const st = STATUS_BOLETO[b.status] || { label: b.status, color: 'gray' };
                  return (
                    <tr key={b.codigo} className="border-b border-brand-border last:border-0 hover:bg-brand-surface2">
                      <td className="px-3 py-2.5">
                        <div className="text-[13px] font-medium text-brand-text min-w-[150px]">{b.cliente?.name || b.pagador || 'Cliente'}</div>
                        <div className="font-mono text-[11px] text-brand-muted">{b.seuNumero || b.codigo.slice(0, 8)}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[13px] whitespace-nowrap">
                        <div>{brl(b.valor)}</div>
                        {b.status === 'paid' && b.valorRecebido > 0 && b.valorRecebido !== b.valor && <div className="text-[11px] text-emerald-700">recebido {brl(b.valorRecebido)}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] text-brand-muted whitespace-nowrap">{fmtDate(b.vencimento)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <Badge color={st.color}>{b.baixaManual ? 'Pago por fora' : st.label}</Badge>
                          {b.baixaManual && <span className="text-[10.5px] text-brand-muted">{b.baixaManual.forma}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap">
                        {b.local?.nfse ? <span className="text-emerald-700 font-medium">✓ {b.local.nfse.numero ? `Nº ${b.local.nfse.numero}` : 'Emitida'}</span>
                          : b.local?.nfseErro ? <span className="text-red-600" title={b.local.nfseErro.erro}>Erro</span>
                          : b.local?.emitirNfseAoPagar ? <span className="text-sky-700">Ao receber</span>
                          : <span className="text-brand-dim">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 justify-end items-center">
                          {b.status === 'overdue' && dados.fonteBoletos === 'inter' && <Btn variant="primary" title="Marcar como pago (cliente pagou por Pix/transferência)" className="!py-1 !px-2 !text-[12px] whitespace-nowrap" icon={<CheckCircle2 size={13} />} onClick={() => setMarcarPago(paraBaixa(b))}>Pago</Btn>}
                          {b.status === 'canceled' && dados.fonteBoletos === 'inter' && <IconBtn title="Marcar como pago (cliente pagou por fora)" onClick={() => setMarcarPago(paraBaixa(b))}><CheckCircle2 size={13} /></IconBtn>}
                          {b.status === 'paid' && !b.local?.nfse && <IconBtn title="Emitir NFS-e" onClick={() => setEmitirBoleto(b)}><Receipt size={13} /></IconBtn>}
                          {dados.fonteBoletos === 'inter' && <IconBtn title="Baixar PDF do boleto" onClick={() => openBlob(token, `/api/inter/cobrancas/${b.codigo}/pdf`).catch(err => setMsg({ type: 'error', text: err.message }))}><FileDown size={13} /></IconBtn>}
                          {b.status !== 'canceled' && b.status !== 'paid' && (
                            <IconBtn title={b.cliente?.email ? `Enviar cobrança para ${b.cliente.email}` : 'Cliente sem e-mail cadastrado'} disabled={enviando === b.codigo} onClick={() => enviarEmail(b)}>
                              {enviando === b.codigo ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                            </IconBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Painel>

        <Painel kicker="Pendências" titulo="O que precisa de atenção">
          {pendencias.length ? pendencias : (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 size={34} className="mx-auto text-emerald-600 mb-2" />
              <div className="font-serif text-[16px] text-brand-forest font-semibold">Tudo em dia</div>
              <div className="text-[12.5px] text-brand-muted mt-1">Nenhuma pendência de nota, boleto ou cadastro.</div>
            </div>
          )}
          {!dados.interConfigurado && (
            <ItemPendencia icone={Link2} tom="gray" titulo="Banco Inter não configurado" detalhe="Configure a integração para ver saldo, boletos e as entradas da conta." acao="Configurar" onClick={() => navegar('Banco Inter', { interTab: 'config' })} />
          )}
        </Painel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
        <Painel kicker="Boletos" titulo="Vencimentos e atrasos"
          acoes={<button onClick={irBoletos} className="text-[12.5px] font-semibold text-brand-orange-dim hover:text-brand-forest inline-flex items-center gap-1">Todos <ArrowRight size={13} /></button>}>
          {dados.vencimentos.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-brand-muted">Nada vencido nem vencendo nos próximos 7 dias.</div>
          ) : dados.vencimentos.map((b: any) => (
            <div key={b.codigo} className="flex items-center gap-3 px-5 py-3 border-b border-brand-border last:border-0">
              <div className={`w-11 shrink-0 text-center rounded-md py-1 ${b.status === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-brand-orange-soft text-brand-orange-dim'}`}>
                <div className="text-[15px] font-bold leading-none tabular">{String(b.vencimento).slice(8, 10)}</div>
                <div className="text-[10px] uppercase font-semibold">{mesCurto(b.vencimento)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-brand-text truncate">{b.cliente?.name || b.pagador}</div>
                <div className={`text-[11.5px] ${b.status === 'overdue' ? 'text-red-600' : 'text-brand-muted'}`}>
                  {b.dias < 0 ? `${Math.abs(b.dias)} dia${Math.abs(b.dias) === 1 ? '' : 's'} em atraso` : b.dias === 0 ? 'vence hoje' : `vence em ${b.dias} dia${b.dias === 1 ? '' : 's'}`}
                  {' · '}<span className="font-mono text-brand-text">{brl(b.valor)}</span>
                </div>
              </div>
              <div className="flex gap-1">
                {b.status === 'overdue' && dados.fonteBoletos === 'inter' && <IconBtn title="Marcar como pago (pagou por Pix/transferência)" onClick={() => setMarcarPago(paraBaixa(b))}><CheckCircle2 size={13} /></IconBtn>}
                {b.linhaDigitavel && <IconBtn title="Copiar linha digitável" onClick={() => copyText(b.linhaDigitavel).then(ok => ok && setMsg({ type: 'success', text: 'Linha digitável copiada.' }))}><Copy size={13} /></IconBtn>}
                <IconBtn title={b.cliente?.email ? `Enviar cobrança para ${b.cliente.email}` : 'Cliente sem e-mail cadastrado'} disabled={enviando === b.codigo} onClick={() => enviarEmail(b)}>
                  {enviando === b.codigo ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                </IconBtn>
              </div>
            </div>
          ))}
        </Painel>

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

        <Painel kicker="Últimos 12 meses" titulo="Maiores clientes (NFS-e)">
          {dados.topClientes.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-brand-muted">Nenhuma NFS-e emitida nos últimos 12 meses.</div>
          ) : (
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
          )}
        </Painel>
      </div>

      {emitirBoleto && (
        <NfseEmitirModal
          token={token}
          titulo="Emitir NFS-e do boleto"
          inicial={{ clienteId: emitirBoleto.cliente?.id, cliente: emitirBoleto.cliente?.name, valor: emitirBoleto.valorRecebido || emitirBoleto.valor, competencia: String(emitirBoleto.dataPagamento || emitirBoleto.vencimento || '').slice(0, 7) }}
          origem={{ tipo: 'cobranca', cobrancaId: emitirBoleto.local?.id, codigoSolicitacao: emitirBoleto.codigo }}
          onClose={() => setEmitirBoleto(null)}
          onSuccess={() => carregar(true)}
        />
      )}
      {marcarPago && (
        <MarcarPagoModal token={token} boleto={marcarPago} onClose={() => setMarcarPago(null)} onDone={text => { setMsg({ type: 'success', text }); carregar(true); }} />
      )}
    </div>
  );
}
