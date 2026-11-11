import fs from 'fs';
import { files, readJson, hojeBR, corteEntradas, onlyDigits } from './storage';
import { interStatus, describeCert } from './inter/client';
import { classificarEntradas, creditosComCache } from './inter/service';

/** AAAA-MM de N meses atrás (0 = mês atual). */
function mesKey(hoje: string, voltar: number) {
  const [a, m] = hoje.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - voltar, 1));
  return d.toISOString().slice(0, 7);
}

function diasEntre(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

const soma = (arr: any[], f: (x: any) => number) => arr.reduce((acc, x) => acc + (Number(f(x)) || 0), 0);

/** Status efetivo da cobrança: pendente com vencimento passado conta como em atraso. */
function statusEfetivo(c: any, hoje: string) {
  if (c.status === 'pending' && c.due && String(c.due).slice(0, 10) < hoje) return 'overdue';
  return c.status;
}

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

/** `transacoes` permite montar o painel a partir de créditos já obtidos (testes/simulações). */
export async function montarDashboard(opts: { forcar?: boolean; transacoes?: any[] } = {}) {
  const hoje = hojeBR();
  const mesAtual = hoje.slice(0, 7);
  const mesAnterior = mesKey(hoje, 1);
  const meses = [5, 4, 3, 2, 1, 0].map(n => mesKey(hoje, n));
  const corte = corteEntradas();

  const clients = readJson<any[]>(files.clients, []);
  const cobrancas = readJson<any[]>(files.cobrancas, []);
  const nfses = readJson<any[]>(files.nfse, []);

  // ---------------- Entradas do Inter (últimos 6 meses) ----------------
  let entradas: any[] = [];
  let interErro: string | null = null;
  const inter = { ...interStatus() };
  if (opts.transacoes) inter.configured = true;
  if (inter.configured) {
    try {
      entradas = classificarEntradas(opts.transacoes || await creditosComCache(`${meses[0]}-01`, hoje, 3 * 60_000, opts.forcar));
    } catch (e: any) {
      interErro = e?.message || 'Falha ao consultar o extrato do Banco Inter.';
    }
  }
  const temEntradas = inter.configured && !interErro;
  const contaComoRecebido = (e: any) => e.marcacao?.status !== 'ignorada';

  // ---------------- Série mensal: recebido x faturado (NFS-e) ----------------
  const serie = meses.map(m => {
    const recebido = temEntradas
      ? soma(entradas.filter(e => String(e.data).slice(0, 7) === m && contaComoRecebido(e)), e => e.valor)
      : soma(cobrancas.filter(c => c.status === 'paid' && String(c.inter?.dataSituacao || c.due || '').slice(0, 7) === m), c => c.inter?.valorTotalRecebido || c.value);
    const notas = nfses.filter(n => nfseValida(n) && String(n.competencia || n.issueDate || '').slice(0, 7) === m);
    return { mes: m, recebido, faturado: soma(notas, n => n.value), notas: notas.length };
  });

  // ---------------- KPIs ----------------
  const abertas = cobrancas.filter(c => ['pending', 'overdue'].includes(statusEfetivo(c, hoje)));
  const atrasadas = abertas.filter(c => statusEfetivo(c, hoje) === 'overdue');
  const aVencer = abertas.filter(c => statusEfetivo(c, hoje) === 'pending');
  const vencendo7 = aVencer.filter(c => c.due && diasEntre(hoje, String(c.due).slice(0, 10)) <= 7);
  const nfseMes = nfses.filter(n => nfseValida(n) && String(n.issueDate || '').slice(0, 7) === mesAtual);
  const serieAtual = serie[serie.length - 1];
  const serieAnterior = serie[serie.length - 2];

  // ---------------- Pendências (entradas depois da data de corte) ----------------
  const aposCorte = entradas.filter(e => e.situacao === 'pendente');
  const prontas = aposCorte.filter(e => e.cliente);
  const semCliente = aposCorte.filter(e => !e.cliente);
  const periodoPendencias = {
    inicio: corte && corte >= `${meses[0]}-01` ? new Date(new Date(`${corte}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) : `${meses[0]}-01`,
    fim: hoje,
  };
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

  // ---------------- Listas ----------------
  const recebimentos = entradas
    .filter(e => e.situacao !== 'ignorada')
    .slice(0, 8)
    .map(({ detalhes, ...e }) => e);

  const vencimentos = [...atrasadas, ...vencendo7]
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))
    .slice(0, 8)
    .map(c => {
      const cli = clients.find(x => x.id === c.client || x.name === c.clientName);
      return {
        id: c.id, clientName: c.clientName, clientEmail: cli?.email || '', value: c.value, due: c.due,
        status: statusEfetivo(c, hoje), dias: diasEntre(hoje, String(c.due).slice(0, 10)),
        boleto: c.boleto ? { linhaDigitavel: c.boleto.linhaDigitavel } : null,
        pix: c.pix ? { pixCopiaECola: c.pix.pixCopiaECola } : null,
        inter: c.inter ? { codigoSolicitacao: c.inter.codigoSolicitacao } : null,
        nfse: c.nfse || null,
      };
    });

  // Maiores clientes pelo faturamento em NFS-e dos últimos 12 meses
  const inicio12 = `${mesKey(hoje, 11)}`;
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
    if (c.status === 'paid' && c.inter?.dataSituacao) atividades.push({ em: String(c.inter.dataSituacao).length <= 10 ? `${c.inter.dataSituacao}T12:00:00` : c.inter.dataSituacao, tipo: 'pago', texto: `Boleto pago por ${c.clientName}`, valor: c.inter?.valorTotalRecebido || c.value });
    if (c.createdAt && c.origem === 'sistema') atividades.push({ em: c.createdAt, tipo: 'cobranca', texto: `Cobrança criada para ${c.clientName}`, valor: c.value });
    if (c.nfseErro?.em && !c.nfse) atividades.push({ em: c.nfseErro.em, tipo: 'erro', texto: `Falha na emissão automática da NFS-e de ${c.clientName}` });
  }
  atividades.sort((a, b) => String(b.em).localeCompare(String(a.em)));

  return {
    hoje,
    corte,
    fonteRecebidos: temEntradas ? 'inter' : 'cobrancas',
    interConfigurado: inter.configured,
    interErro,
    kpis: {
      recebidoMes: serieAtual.recebido,
      recebidoMesAnterior: serieAnterior.recebido,
      aReceber: soma(aVencer, c => c.value),
      aReceberQtd: aVencer.length,
      vencendo7Qtd: vencendo7.length,
      emAtraso: soma(atrasadas, c => c.value),
      emAtrasoQtd: atrasadas.length,
      emAtrasoClientes: new Set(atrasadas.map(c => c.client || c.clientName)).size,
      nfseMesQtd: nfseMes.length,
      nfseMesValor: soma(nfseMes, n => n.value),
    },
    serie,
    pendencias: {
      periodo: periodoPendencias,
      prontas: { qtd: prontas.length, valor: soma(prontas, e => e.valor) },
      semCliente: { qtd: semCliente.length, valor: soma(semCliente, e => e.valor) },
      errosEmissao: errosEmissao.map(c => ({ id: c.id, clientName: c.clientName, erro: c.nfseErro?.erro })),
      aguardandoPagamento: aguardandoPagamento.length,
      cadastrosIncompletos: cadastrosIncompletos.length,
      certificados,
    },
    recebimentos,
    vencimentos,
    topClientes,
    atividades: atividades.slice(0, 10),
  };
}
