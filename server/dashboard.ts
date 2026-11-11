import fs from 'fs';
import { files, readJson, hojeBR, corteEntradas, onlyDigits } from './storage';
import { interStatus, describeCert, interRequest } from './inter/client';
import { classificarEntradas, creditosComCache, boletosComCache, enriquecerBoletos, statusFromSituacao } from './inter/service';

/** AAAA-MM de N meses atrás (0 = mês atual). */
function mesKey(hoje: string, voltar: number) {
  const [a, m] = hoje.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - voltar, 1));
  return d.toISOString().slice(0, 7);
}

function somaDias(data: string, dias: number) {
  return new Date(new Date(`${data}T00:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
}

function diasEntre(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

const soma = (arr: any[], f: (x: any) => number) => arr.reduce((acc, x) => acc + (Number(f(x)) || 0), 0);

function nfseValida(n: any) {
  return n.status !== 'canceled' && n.ambiente !== '2';
}

/** Só vira pendência quando o certificado vence em até 30 dias (ou já venceu). */
function certAlerta(info: { validTo?: string } | null | undefined, nome: string) {
  if (!info?.validTo) return null;
  const dias = diasEntre(hojeBR(), String(info.validTo).slice(0, 10));
  if (dias > 30) return null;
  return { nome, dias, validTo: info.validTo };
}

let cacheSaldo: { em: number; saldo: any } | null = null;
async function saldoComCache(forcar = false) {
  if (!forcar && cacheSaldo && Date.now() - cacheSaldo.em < 60_000) return cacheSaldo.saldo;
  const saldo = await interRequest<any>({ method: 'get', path: '/banking/v2/saldo', scope: 'extrato.read' });
  cacheSaldo = { em: Date.now(), saldo };
  return saldo;
}

/** Boleto num formato único, venha da API do Inter ou (sem integração) das cobranças locais. */
export interface BoletoResumo {
  codigo: string;
  seuNumero?: string;
  pagador: string;
  cliente: { id: string; name: string; email: string } | null;
  valor: number;
  valorRecebido: number;
  vencimento: string;
  emissao?: string;
  situacao: string;           // situação no Inter (RECEBIDO, A_RECEBER, ATRASADO…)
  status: 'paid' | 'pending' | 'overdue' | 'canceled';
  dataPagamento?: string;
  baixaManual: any | null;    // pago por fora (Pix direto na conta)
  linhaDigitavel?: string;
  local: any | null;          // registro no sistema (NFS-e vinculada)
}

function doInter(item: any, hoje: string): BoletoResumo {
  const c = item.cobranca || item;
  const baixa = item.baixaManual;
  let status = baixa ? 'paid' : statusFromSituacao(c.situacao);
  if (status === 'pending' && c.dataVencimento && c.dataVencimento < hoje) status = 'overdue';
  return {
    codigo: c.codigoSolicitacao,
    seuNumero: c.seuNumero,
    pagador: c.pagador?.nome || '',
    cliente: item.cliente || null,
    valor: Number(c.valorNominal || 0),
    valorRecebido: baixa ? Number(baixa.valor || 0) : Number(c.valorTotalRecebido || 0),
    vencimento: c.dataVencimento,
    emissao: c.dataEmissao,
    situacao: c.situacao,
    status: status as BoletoResumo['status'],
    dataPagamento: baixa ? baixa.dataPagamento : (status === 'paid' ? String(c.dataSituacao || '').slice(0, 10) : undefined),
    baixaManual: baixa || null,
    linhaDigitavel: item.boleto?.linhaDigitavel,
    local: item.local || null,
  };
}

function doLocal(c: any, clients: any[], hoje: string): BoletoResumo {
  const cli = clients.find(x => x.id === c.client) || null;
  let status = c.status;
  if (status === 'pending' && c.due && String(c.due).slice(0, 10) < hoje) status = 'overdue';
  return {
    codigo: c.inter?.codigoSolicitacao || c.id,
    seuNumero: c.inter?.seuNumero,
    pagador: c.clientName,
    cliente: cli ? { id: cli.id, name: cli.name, email: cli.email || '' } : null,
    valor: Number(c.value || 0),
    valorRecebido: Number(c.pagoManual?.valor || c.inter?.valorTotalRecebido || (c.status === 'paid' ? c.value : 0) || 0),
    vencimento: c.due,
    situacao: c.inter?.situacao || '',
    status,
    dataPagamento: c.pagoManual?.dataPagamento || (c.status === 'paid' ? String(c.inter?.dataSituacao || c.due || '').slice(0, 10) : undefined),
    baixaManual: c.pagoManual || null,
    linhaDigitavel: c.boleto?.linhaDigitavel,
    local: { id: c.id, nfse: c.nfse ? { id: c.nfse } : null, nfseErro: c.nfseErro || null, emitirNfseAoPagar: !!c.emitirNfseAoPagar },
  };
}

/** `transacoes`, `boletos` e `saldo` permitem montar o painel com dados já obtidos (testes/simulações). */
export async function montarDashboard(opts: { forcar?: boolean; transacoes?: any[]; boletos?: any[]; saldo?: any } = {}) {
  const hoje = hojeBR();
  const mesAtual = hoje.slice(0, 7);
  const corte = corteEntradas();

  const clients = readJson<any[]>(files.clients, []);
  const cobrancas = readJson<any[]>(files.cobrancas, []);
  const nfses = readJson<any[]>(files.nfse, []);

  const inter = { ...interStatus() };
  if (opts.boletos || opts.transacoes) inter.configured = true;
  const erros: string[] = [];

  // ---------------- Saldo e boletos (Banco Inter › Boletos / Cobranças) ----------------
  let saldo: any = null;
  let boletos: BoletoResumo[] = [];
  let fonteBoletos: 'inter' | 'sistema' = 'sistema';
  if (inter.configured) {
    try { saldo = opts.saldo !== undefined ? opts.saldo : await saldoComCache(opts.forcar); } catch (e: any) { erros.push(`saldo: ${e?.message}`); }
    try {
      const itens = opts.boletos || await boletosComCache(somaDias(hoje, -365), somaDias(hoje, 60), 3 * 60_000, opts.forcar);
      boletos = enriquecerBoletos(itens).map(i => doInter(i, hoje));
      fonteBoletos = 'inter';
    } catch (e: any) { erros.push(`boletos: ${e?.message}`); }
  }
  if (fonteBoletos === 'sistema') {
    boletos = cobrancas.filter(c => c.inter?.codigoSolicitacao || c.boleto).map(c => doLocal(c, clients, hoje));
  }

  const recebidos = boletos.filter(b => b.status === 'paid');
  const recebidosMes = recebidos.filter(b => String(b.dataPagamento || '').slice(0, 7) === mesAtual);
  const recebidosAno = recebidos.filter(b => String(b.dataPagamento || '').slice(0, 4) === hoje.slice(0, 4));
  const aReceber = boletos.filter(b => b.status === 'pending');
  const vencendo7 = aReceber.filter(b => b.vencimento && diasEntre(hoje, b.vencimento) <= 7);
  const atrasados = boletos.filter(b => b.status === 'overdue');
  const valorRecebido = (b: BoletoResumo) => b.valorRecebido || b.valor;

  // ---------------- Entradas do Inter (para as pendências de NFS-e) ----------------
  let entradas: any[] = [];
  const inicioEntradas = corte && corte >= `${mesKey(hoje, 5)}-01` ? somaDias(corte, 1) : `${mesKey(hoje, 5)}-01`;
  if (inter.configured) {
    try {
      entradas = classificarEntradas(opts.transacoes || await creditosComCache(inicioEntradas, hoje, 3 * 60_000, opts.forcar));
    } catch (e: any) { erros.push(`extrato: ${e?.message}`); }
  }
  const pendentes = entradas.filter(e => e.situacao === 'pendente');
  const prontas = pendentes.filter(e => e.cliente);
  const semCliente = pendentes.filter(e => !e.cliente);

  const errosEmissao = cobrancas.filter(c => c.nfseErro && !c.nfse);
  const aguardandoPagamento = cobrancas.filter(c => c.emitirNfseAoPagar && !c.nfse && c.status !== 'canceled' && c.status !== 'paid');
  const cadastrosIncompletos = clients.filter(c => {
    const doc = onlyDigits(c.cpfCnpj || c.cnpj);
    return !(doc.length === 11 || doc.length === 14) || onlyDigits(c.cep).length !== 8 || !c.logradouro || !String(c.municipioUf || '').includes('/');
  });
  const certificados = [
    certAlerta(fs.existsSync(files.certPem) ? describeCert(fs.readFileSync(files.certPem, 'utf-8')) : null, 'Certificado A1 (NFS-e)'),
    certAlerta(inter.cert, 'Certificado da API do Inter'),
  ].filter(Boolean);
  const nfseMes = nfses.filter(n => nfseValida(n) && String(n.issueDate || '').slice(0, 7) === mesAtual);

  // ---------------- Listas ----------------
  // Boletos recentes: os mais novos primeiro (emissão, depois vencimento).
  const boletosRecentes = [...boletos]
    .sort((a, b) => String(b.emissao || b.vencimento).localeCompare(String(a.emissao || a.vencimento)) || String(b.vencimento).localeCompare(String(a.vencimento)))
    .slice(0, 300);

  const vencimentos = [...atrasados, ...vencendo7]
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
    .slice(0, 8)
    .map(b => ({ ...b, dias: diasEntre(hoje, b.vencimento) }));

  // Maiores clientes pelo faturamento em NFS-e dos últimos 12 meses
  const inicio12 = mesKey(hoje, 11);
  const porCliente = new Map<string, { nome: string; valor: number; notas: number }>();
  for (const n of nfses) {
    if (!nfseValida(n) || String(n.competencia || n.issueDate || '').slice(0, 7) < inicio12) continue;
    const k = n.client || n.clientName;
    const cur = porCliente.get(k) || { nome: n.clientName, valor: 0, notas: 0 };
    cur.valor += Number(n.value) || 0;
    cur.notas += 1;
    porCliente.set(k, cur);
  }
  const topClientes = [...porCliente.values()].sort((a, b) => b.valor - a.valor).slice(0, 5);

  // Atividades recentes a partir do histórico real
  const atividades: { em: string; tipo: string; texto: string; valor?: number }[] = [];
  for (const n of nfses) {
    if (n.createdAt || n.issueDate) atividades.push({ em: n.createdAt || `${n.issueDate}T12:00:00`, tipo: 'nfse', texto: `NFS-e ${n.numero ? `nº ${n.numero} ` : ''}emitida para ${n.clientName}${n.ambiente === '2' ? ' (teste)' : ''}`, valor: n.value });
    if (n.cancelamento?.em) atividades.push({ em: n.cancelamento.em, tipo: 'cancelada', texto: `NFS-e ${n.numero ? `nº ${n.numero} ` : ''}cancelada (${n.clientName})`, valor: n.value });
  }
  for (const c of cobrancas) {
    if (c.pagoManual?.em) atividades.push({ em: c.pagoManual.em, tipo: 'pago', texto: `Boleto de ${c.clientName} marcado como pago (${String(c.pagoManual.forma || 'por fora').toLowerCase()})`, valor: c.pagoManual.valor });
    else if (c.status === 'paid' && c.inter?.dataSituacao) atividades.push({ em: String(c.inter.dataSituacao).length <= 10 ? `${c.inter.dataSituacao}T12:00:00` : c.inter.dataSituacao, tipo: 'pago', texto: `Boleto pago por ${c.clientName}`, valor: c.inter?.valorTotalRecebido || c.value });
    if (c.createdAt && c.origem === 'sistema') atividades.push({ em: c.createdAt, tipo: 'cobranca', texto: `Cobrança criada para ${c.clientName}`, valor: c.value });
    if (c.nfseErro?.em && !c.nfse) atividades.push({ em: c.nfseErro.em, tipo: 'erro', texto: `Falha na emissão automática da NFS-e de ${c.clientName}` });
  }
  atividades.sort((a, b) => String(b.em).localeCompare(String(a.em)));

  return {
    hoje,
    corte,
    interConfigurado: inter.configured,
    interErro: erros.length ? erros.join(' · ') : null,
    fonteBoletos,
    saldo: saldo ? {
      disponivel: Number(saldo.disponivel || 0),
      bloqueado: Number(saldo.bloqueadoCheque || 0) + Number(saldo.bloqueadoJudicialmente || 0) + Number(saldo.bloqueadoAdministrativo || 0),
      limite: Number(saldo.limite || 0),
    } : null,
    kpis: {
      recebidosMes: soma(recebidosMes, valorRecebido),
      recebidosMesQtd: recebidosMes.length,
      recebidosAno: soma(recebidosAno, valorRecebido),
      recebidosAnoQtd: recebidosAno.length,
      recebidosManualMesQtd: recebidosMes.filter(b => b.baixaManual).length,
      aReceber: soma(aReceber, b => b.valor),
      aReceberQtd: aReceber.length,
      vencendo7Qtd: vencendo7.length,
      emAtraso: soma(atrasados, b => b.valor),
      emAtrasoQtd: atrasados.length,
      emAtrasoClientes: new Set(atrasados.map(b => b.cliente?.id || b.pagador)).size,
      nfseMesQtd: nfseMes.length,
      nfseMesValor: soma(nfseMes, n => n.value),
    },
    pendencias: {
      periodo: { inicio: inicioEntradas, fim: hoje },
      prontas: { qtd: prontas.length, valor: soma(prontas, e => e.valor) },
      semCliente: { qtd: semCliente.length, valor: soma(semCliente, e => e.valor) },
      errosEmissao: errosEmissao.map(c => ({ id: c.id, clientName: c.clientName, erro: c.nfseErro?.erro })),
      aguardandoPagamento: aguardandoPagamento.length,
      cadastrosIncompletos: cadastrosIncompletos.length,
      certificados,
    },
    boletos: boletosRecentes,
    vencimentos,
    topClientes,
    atividades: atividades.slice(0, 10),
  };
}
