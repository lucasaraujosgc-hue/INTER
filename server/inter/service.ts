import crypto from 'crypto';
import { files, readJson, writeJson, onlyDigits, getSettings, newId, corteEntradas } from '../storage';
import { interRequest, InterError } from './client';
import { emitirNfse } from '../nfse/service';

// ---------------------------------------------------------------------------
// Utilidades de clientes
// ---------------------------------------------------------------------------

const COLORS = ['#0B4535', '#EA580C', '#0F766E', '#B45309', '#334155'];

export function getClients(): any[] {
  return readJson<any[]>(files.clients, []);
}

function normName(s: string) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function clientDoc(c: any) {
  return onlyDigits(c?.cpfCnpj || c?.document || c?.cnpj || '');
}

/** Outras pessoas/empresas que costumam pagar pelo cliente (ex.: sócio pagando no CPF). */
export function clientPagadores(c: any): { cpfCnpj?: string; nome?: string; criadoEm?: string }[] {
  return Array.isArray(c?.pagadores) ? c.pagadores : [];
}

export type ViaVinculo = 'documento' | 'pagador' | 'nome' | 'cobranca' | 'manual';

/**
 * Localiza o cliente de um pagamento: CPF/CNPJ do cliente, depois CPF/CNPJ de um pagador vinculado,
 * depois nome do cliente e, por fim, nome de um pagador vinculado.
 */
export function matchClientInfo(clients: any[], cpfCnpj?: string, nome?: string): { client: any; via: ViaVinculo } | null {
  const doc = onlyDigits(cpfCnpj);
  const docValido = doc.length === 11 || doc.length === 14;
  if (docValido) {
    const byDoc = clients.find(c => clientDoc(c) === doc);
    if (byDoc) return { client: byDoc, via: 'documento' };
    const byPagador = clients.find(c => clientPagadores(c).some(p => onlyDigits(p.cpfCnpj) === doc));
    if (byPagador) return { client: byPagador, via: 'pagador' };
  }
  const n = normName(nome || '');
  if (n.length >= 4) {
    const byName = clients.find(c => normName(c.name) === n);
    if (byName) return { client: byName, via: 'nome' };
    // Pelo nome do pagador vinculado só quando um dos lados não tem documento (evita homônimos).
    const byPagadorNome = clients.find(c => clientPagadores(c).some(p => {
      const pd = onlyDigits(p.cpfCnpj);
      return normName(p.nome || '') === n && (!docValido || !(pd.length === 11 || pd.length === 14));
    }));
    if (byPagadorNome) return { client: byPagadorNome, via: 'pagador' };
  }
  return null;
}

/** Localiza o cliente pelo CPF/CNPJ (preferencial), pagadores vinculados ou pelo nome. */
export function matchClient(clients: any[], cpfCnpj?: string, nome?: string) {
  return matchClientInfo(clients, cpfCnpj, nome)?.client || null;
}

/**
 * Vincula um pagador (CPF/CNPJ e/ou nome) a um cliente: os próximos pagamentos dele passam a ser
 * identificados como desse cliente. Remove o mesmo pagador de outros clientes para não haver ambiguidade.
 */
export function vincularPagador(clienteId: string, pagador: { cpfCnpj?: string; nome?: string }) {
  const clients = getClients();
  const alvo = clients.find(c => c.id === clienteId);
  if (!alvo) throw new InterError('Cliente não encontrado.', 404);
  const doc = onlyDigits(pagador?.cpfCnpj);
  const nome = String(pagador?.nome || '').trim();
  const docValido = doc.length === 11 || doc.length === 14;
  if (!docValido && normName(nome).length < 4) throw new InterError('Informe o CPF/CNPJ ou o nome do pagador.', 400);
  if (docValido && clientDoc(alvo) === doc) return alvo; // é o próprio cliente
  const mesmo = (p: any) => docValido ? onlyDigits(p.cpfCnpj) === doc : (!onlyDigits(p.cpfCnpj) && normName(p.nome || '') === normName(nome));
  for (const c of clients) {
    if (c.id !== alvo.id && clientPagadores(c).some(mesmo)) c.pagadores = clientPagadores(c).filter(p => !mesmo(p));
  }
  const lista = clientPagadores(alvo).filter(p => !mesmo(p));
  lista.push({ cpfCnpj: docValido ? doc : '', nome, criadoEm: new Date().toISOString() });
  alvo.pagadores = lista;
  writeJson(files.clients, clients);
  return alvo;
}

export function clientFromPagador(p: any) {
  const nome = String(p?.nome || '').trim();
  const tel = onlyDigits(`${p?.ddd || ''}${p?.telefone || ''}`);
  return {
    id: Date.now().toString() + Math.floor(Math.random() * 1000),
    name: nome,
    cpfCnpj: onlyDigits(p?.cpfCnpj),
    email: p?.email || '',
    telefone: tel,
    cep: onlyDigits(p?.cep),
    municipioUf: p?.cidade ? `${p.cidade}/${p.uf || ''}` : '',
    logradouro: p?.endereco || '',
    numero: p?.numero || '',
    complemento: p?.complemento || '',
    bairro: p?.bairro || '',
    init: (nome.charAt(0) || '?').toUpperCase(),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    origem: 'inter',
  };
}

// ---------------------------------------------------------------------------
// Extrato / entradas
// ---------------------------------------------------------------------------

/** O Inter aceita no máximo 90 dias por consulta de extrato: divide períodos maiores em janelas. */
function janelas(dataInicio: string, dataFim: string, maxDias = 89) {
  const out: [string, string][] = [];
  const dia = 86400000;
  let ini = new Date(`${dataInicio}T00:00:00Z`).getTime();
  const fim = new Date(`${dataFim}T00:00:00Z`).getTime();
  if (!(ini <= fim)) throw new InterError('Período inválido: a data inicial deve ser anterior à final.', 400);
  while (ini <= fim) {
    const end = Math.min(fim, ini + maxDias * dia);
    out.push([new Date(ini).toISOString().slice(0, 10), new Date(end).toISOString().slice(0, 10)]);
    ini = end + dia;
  }
  if (out.length > 8) throw new InterError('Período muito longo: consulte no máximo 2 anos por vez.', 400);
  return out;
}

export async function fetchExtratoCompleto(dataInicio: string, dataFim: string, tipoOperacao?: 'C' | 'D') {
  const all: any[] = [];
  for (const [ini, fim] of janelas(dataInicio, dataFim)) {
    for (let pagina = 0; pagina < 100; pagina++) {
      const r = await interRequest<any>({
        method: 'get',
        path: '/banking/v2/extrato/completo',
        scope: 'extrato.read',
        query: { dataInicio: ini, dataFim: fim, pagina, tamanhoPagina: 1000, tipoOperacao },
      });
      all.push(...(r?.transacoes || []));
      const total = Number(r?.totalPaginas || 1);
      if (r?.ultimaPagina === true || pagina + 1 >= total || !(r?.transacoes || []).length) break;
    }
  }
  return all;
}

export function entradaKey(t: any) {
  if (t.idTransacao) return String(t.idTransacao);
  const raw = [t.dataTransacao || t.dataInclusao, t.valor, t.tipoTransacao, t.titulo, t.descricao, t.detalhes?.endToEndId || ''].join('|');
  return 'h' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 20);
}

function pagadorDaTransacao(t: any) {
  const d = t.detalhes || {};
  const cpfCnpj = d.cpfCnpjPagador || d.cpfCnpj || '';
  const nome = d.nomePagador || d.nomeEmpresaPagador || d.nome || '';
  return { nome: String(nome).trim(), cpfCnpj: String(cpfCnpj).trim() };
}

/** Situação de uma entrada quanto à NFS-e. "antes" = recebida até a data de corte (não exige nota pelo sistema). */
export type SituacaoEntrada = 'emitida' | 'antes' | 'ignorada' | 'pendente';

/** Cruza os créditos do extrato com clientes, cobranças, NFS-e e marcações locais. */
export function classificarEntradas(transacoes: any[]) {
  const clients = getClients();
  const nfses = readJson<any[]>(files.nfse, []);
  const cobrancas = readJson<any[]>(files.cobrancas, []);
  const marcas = readJson<Record<string, any>>(files.interEntradas, {});
  const corte = corteEntradas();

  const nfseByTransacao = new Map<string, any>();
  for (const n of nfses) {
    if (n?.origem?.idTransacao && n.status !== 'canceled') nfseByTransacao.set(String(n.origem.idTransacao), n);
  }

  return transacoes
    .filter(t => (t.tipoOperacao || 'C') === 'C')
    .map(t => {
      const key = entradaKey(t);
      const pagador = pagadorDaTransacao(t);
      const marca = marcas[key] || null;
      const d = t.detalhes || {};
      // Recebimento de boleto emitido pelo sistema: herda a NFS-e da cobrança, se houver.
      const cobranca = d.nossoNumero || d.seuNumero
        ? cobrancas.find(c => (d.nossoNumero && c.boleto?.nossoNumero === d.nossoNumero) || (d.seuNumero && c.inter?.seuNumero === d.seuNumero))
        : (d.txId ? cobrancas.find(c => c.pix?.txid && c.pix.txid === d.txId) : null);

      // Cliente: vínculo manual desta entrada > cliente da cobrança > CPF/CNPJ/nome do pagador.
      let vinculo: { client: any; via: ViaVinculo } | null = null;
      const manual = marca?.clienteId ? clients.find(c => c.id === marca.clienteId) : null;
      if (manual) vinculo = { client: manual, via: 'manual' };
      if (!vinculo && cobranca?.client) {
        const c = clients.find(x => x.id === cobranca.client);
        if (c) vinculo = { client: c, via: 'cobranca' };
      }
      if (!vinculo) vinculo = matchClientInfo(clients, pagador.cpfCnpj, pagador.nome);

      const nfse = nfseByTransacao.get(key) || (cobranca?.nfse ? nfses.find(n => n.id === cobranca.nfse) : null);
      const data = String(t.dataTransacao || t.dataInclusao || '').slice(0, 10);
      const situacao: SituacaoEntrada = nfse ? 'emitida'
        : corte && data && data <= corte ? 'antes'
        : marca?.status === 'ignorada' ? 'ignorada'
        : 'pendente';
      return {
        idTransacao: key,
        data: t.dataTransacao || t.dataInclusao,
        valor: Number(t.valor || 0),
        tipoTransacao: t.tipoTransacao,
        titulo: t.titulo,
        descricao: t.descricao,
        pagador,
        cliente: vinculo ? { id: vinculo.client.id, name: vinculo.client.name, via: vinculo.via } : null,
        cobranca: cobranca ? { id: cobranca.id, codigoSolicitacao: cobranca.inter?.codigoSolicitacao } : null,
        nfse: nfse ? { id: nfse.id, numero: nfse.numero, status: nfse.status } : null,
        marcacao: marca,
        situacao,
        detalhes: d,
      };
    })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

export async function listarEntradas(dataInicio: string, dataFim: string) {
  return classificarEntradas(await fetchExtratoCompleto(dataInicio, dataFim, 'C'));
}

// Cache curto dos créditos do extrato (o dashboard consulta 6 meses; o Inter limita tokens por minuto).
const cacheCreditos = new Map<string, { em: number; transacoes: any[] }>();
export async function creditosComCache(dataInicio: string, dataFim: string, maxIdadeMs = 3 * 60_000, forcar = false) {
  const k = `${dataInicio}|${dataFim}`;
  const hit = cacheCreditos.get(k);
  if (!forcar && hit && Date.now() - hit.em < maxIdadeMs) return hit.transacoes;
  const transacoes = await fetchExtratoCompleto(dataInicio, dataFim, 'C');
  cacheCreditos.clear();
  cacheCreditos.set(k, { em: Date.now(), transacoes });
  return transacoes;
}

function salvarMarca(marcas: Record<string, any>, idTransacao: string, marca: Record<string, any>) {
  const util = Object.keys(marca).filter(k => k !== 'em' && marca[k] !== undefined && marca[k] !== null && marca[k] !== '');
  if (util.length) marcas[idTransacao] = marca; else delete marcas[idTransacao];
  writeJson(files.interEntradas, marcas);
  return marcas[idTransacao] || null;
}

export function marcarEntrada(idTransacao: string, marcacao: { status: 'ignorada' | 'pendente'; observacao?: string }) {
  const marcas = readJson<Record<string, any>>(files.interEntradas, {});
  const atual = { ...(marcas[idTransacao] || {}) };
  if (marcacao.status === 'pendente') {
    delete atual.status;
    delete atual.observacao;
  } else {
    Object.assign(atual, { status: marcacao.status, observacao: marcacao.observacao, em: new Date().toISOString() });
  }
  return salvarMarca(marcas, idTransacao, atual);
}

/**
 * Vincula uma entrada do extrato a um cliente (empresa). Com "lembrar", o pagador fica vinculado ao cliente
 * e os próximos pagamentos dele são identificados automaticamente; sem, vale só para esta entrada.
 */
export function vincularEntrada(idTransacao: string, input: { clienteId?: string | null; lembrar?: boolean; pagador?: { cpfCnpj?: string; nome?: string } }) {
  const marcas = readJson<Record<string, any>>(files.interEntradas, {});
  const atual = { ...(marcas[idTransacao] || {}) };
  if (!input.clienteId) {
    delete atual.clienteId;
    return { marcacao: salvarMarca(marcas, idTransacao, atual), cliente: null };
  }
  const cliente = getClients().find(c => c.id === input.clienteId);
  if (!cliente) throw new InterError('Cliente não encontrado.', 404);
  let lembrado = false;
  if (input.lembrar && input.pagador) {
    const doc = onlyDigits(input.pagador.cpfCnpj);
    if (doc.length === 11 || doc.length === 14 || normName(input.pagador.nome || '').length >= 4) {
      vincularPagador(cliente.id, input.pagador);
      lembrado = true;
    }
  }
  if (lembrado) delete atual.clienteId; // o vínculo do pagador já identifica esta e as próximas entradas
  else Object.assign(atual, { clienteId: cliente.id, em: new Date().toISOString() });
  return { marcacao: salvarMarca(marcas, idTransacao, atual), cliente: { id: cliente.id, name: cliente.name }, lembrado };
}

// ---------------------------------------------------------------------------
// Cobranças (boleto com Pix - API Cobrança v3)
// ---------------------------------------------------------------------------

export function statusFromSituacao(situacao?: string): string {
  switch (situacao) {
    case 'RECEBIDO':
    case 'MARCADO_RECEBIDO':
      return 'paid';
    case 'ATRASADO':
    case 'PROTESTO':
      return 'overdue';
    case 'CANCELADO':
    case 'EXPIRADO':
    case 'FALHA_EMISSAO':
      return 'canceled';
    default:
      return 'pending';
  }
}

function splitCidadeUf(municipioUf?: string) {
  const [cidade, uf] = String(municipioUf || '').split('/').map(s => s.trim());
  return { cidade: cidade || '', uf: (uf || '').toUpperCase() };
}

export function pagadorFromClient(c: any) {
  const doc = clientDoc(c);
  const { cidade, uf } = splitCidadeUf(c.municipioUf);
  const tel = onlyDigits(c.telefone || c.phone);
  const pagador: any = {
    cpfCnpj: doc,
    tipoPessoa: doc.length === 11 ? 'FISICA' : 'JURIDICA',
    nome: String(c.name || '').slice(0, 100),
    endereco: String(c.logradouro || c.address || '').slice(0, 100),
    numero: String(c.numero || c.number || '').slice(0, 10),
    complemento: String(c.complemento || '').slice(0, 30),
    bairro: String(c.bairro || c.neighborhood || '').slice(0, 60),
    cidade: (cidade || c.cidade || '').slice(0, 60),
    uf: uf || c.uf || c.state || '',
    cep: onlyDigits(c.cep || c.zipCode),
  };
  if (c.email) pagador.email = String(c.email).split(/[;,\s]/)[0].slice(0, 50);
  if (tel.length >= 10) {
    pagador.ddd = tel.slice(0, 2);
    pagador.telefone = tel.slice(2, 11);
  }
  const faltando = [
    !(doc.length === 11 || doc.length === 14) && 'CPF/CNPJ',
    !pagador.nome && 'nome',
    !pagador.endereco && 'logradouro',
    !pagador.cidade && 'cidade (campo Município/UF)',
    !/^[A-Z]{2}$/.test(pagador.uf) && 'UF (campo Município/UF)',
    pagador.cep.length !== 8 && 'CEP',
  ].filter(Boolean);
  if (faltando.length) {
    throw new InterError(`Cadastro do cliente "${c.name}" incompleto para emitir boleto: falta ${faltando.join(', ')}.`, 400);
  }
  return pagador;
}

function upsertCobrancaFromInter(item: any, opts: { criarClientes?: boolean } = {}) {
  const cob = item.cobranca || item;
  const cobrancas = readJson<any[]>(files.cobrancas, []);
  const clients = getClients();
  let client = matchClient(clients, cob.pagador?.cpfCnpj, cob.pagador?.nome);
  let clientCreated = false;
  if (!client && opts.criarClientes && cob.pagador?.nome) {
    client = clientFromPagador(cob.pagador);
    clients.push(client);
    writeJson(files.clients, clients);
    clientCreated = true;
  }

  const idx = cobrancas.findIndex(c => c.inter?.codigoSolicitacao === cob.codigoSolicitacao);
  const existing = idx >= 0 ? cobrancas[idx] : null;
  const record = {
    ...(existing || { id: `COB-${Date.now()}-${Math.floor(Math.random() * 1000)}`, origem: 'inter' }),
    client: client?.id || existing?.client || cob.pagador?.nome,
    clientName: client?.name || cob.pagador?.nome || existing?.clientName,
    value: Number(cob.valorNominal ?? existing?.value ?? 0),
    due: cob.dataVencimento || existing?.due,
    status: statusFromSituacao(cob.situacao),
    boleto: item.boleto ? { ...existing?.boleto, ...item.boleto } : existing?.boleto || null,
    pix: item.pix ? { ...existing?.pix, ...item.pix } : existing?.pix || null,
    inter: {
      ...(existing?.inter || {}),
      codigoSolicitacao: cob.codigoSolicitacao,
      seuNumero: cob.seuNumero,
      situacao: cob.situacao,
      dataSituacao: cob.dataSituacao,
      dataEmissao: cob.dataEmissao,
      valorTotalRecebido: cob.valorTotalRecebido != null ? Number(cob.valorTotalRecebido) : existing?.inter?.valorTotalRecebido,
      origemRecebimento: cob.origemRecebimento,
      tipoCobranca: cob.tipoCobranca,
      motivoCancelamento: cob.motivoCancelamento,
      pagador: cob.pagador,
    },
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) cobrancas[idx] = record; else cobrancas.push(record);
  writeJson(files.cobrancas, cobrancas);
  return { record, created: idx < 0, clientCreated };
}

export async function importarCobrancas(params: {
  dataInicial: string; dataFinal: string; filtrarDataPor?: string; situacao?: string; criarClientes?: boolean;
}) {
  let importadas = 0, atualizadas = 0, clientesCriados = 0, total = 0;
  const enriquecer: { clientId: string; codigoSolicitacao: string }[] = [];
  for (let pagina = 0; pagina < 200; pagina++) {
    const r = await interRequest<any>({
      method: 'get',
      path: '/cobranca/v3/cobrancas',
      scope: 'boleto-cobranca.read',
      query: {
        dataInicial: params.dataInicial,
        dataFinal: params.dataFinal,
        filtrarDataPor: params.filtrarDataPor || 'EMISSAO',
        situacao: params.situacao,
        'paginacao.itensPorPagina': 1000,
        'paginacao.paginaAtual': pagina,
      },
    });
    const lista = r?.cobrancas || [];
    for (const item of lista) {
      const res = upsertCobrancaFromInter(item, { criarClientes: params.criarClientes !== false });
      total++;
      if (res.created) importadas++; else atualizadas++;
      if (res.clientCreated) {
        clientesCriados++;
        enriquecer.push({ clientId: res.record.client, codigoSolicitacao: res.record.inter.codigoSolicitacao });
      }
    }
    if (r?.ultimaPagina === true || pagina + 1 >= Number(r?.totalPaginas || 1) || !lista.length) break;
  }

  // A listagem traz só nome e CPF/CNPJ do pagador; o detalhe tem o endereço para completar o cadastro.
  for (const e of enriquecer.slice(0, 100)) {
    try {
      const det = await interRequest<any>({
        method: 'get', path: `/cobranca/v3/cobrancas/${encodeURIComponent(e.codigoSolicitacao)}`, scope: 'boleto-cobranca.read',
      });
      const p = det?.cobranca?.pagador;
      if (!p) continue;
      const clients = getClients();
      const c = clients.find(x => x.id === e.clientId);
      if (!c) continue;
      const novo = clientFromPagador(p);
      for (const k of ['email', 'telefone', 'cep', 'municipioUf', 'logradouro', 'numero', 'complemento', 'bairro']) {
        if (!c[k] && (novo as any)[k]) c[k] = (novo as any)[k];
      }
      writeJson(files.clients, clients);
    } catch { /* cadastro fica só com nome e documento */ }
  }
  return { total, importadas, atualizadas, clientesCriados };
}

export async function sincronizarCobranca(codigoSolicitacao: string) {
  const detalhe = await interRequest<any>({
    method: 'get',
    path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigoSolicitacao)}`,
    scope: 'boleto-cobranca.read',
  });
  const res = upsertCobrancaFromInter(detalhe);
  await talvezEmitirNfseDaCobranca(res.record.id);
  return res.record;
}

export interface NovaCobrancaInput {
  clienteId?: string;
  cliente?: string;
  valor: number;
  vencimento: string;
  seuNumero?: string;
  numDiasAgenda?: number;
  mensagem?: string;
  multa?: { codigo: 'PERCENTUAL' | 'VALORFIXO'; taxa?: number; valor?: number } | null;
  mora?: { codigo: 'TAXAMENSAL' | 'VALORDIA'; taxa?: number; valor?: number } | null;
  desconto?: { codigo: 'PERCENTUALDATAINFORMADA' | 'VALORFIXODATAINFORMADA'; quantidadeDias: number; taxa?: number; valor?: number } | null;
  formasRecebimento?: string[];
  emitirNfse?: 'nao' | 'agora' | 'ao_pagar';
  nfse?: Record<string, any>;
}

export async function criarCobrancaInter(input: NovaCobrancaInput) {
  const clients = getClients();
  const client = clients.find(c => c.id === input.clienteId) || clients.find(c => c.name === input.cliente);
  if (!client) throw new InterError('Cliente não encontrado. Selecione um cliente cadastrado.', 400);
  const valor = Number(input.valor);
  if (!(valor >= 2.5)) throw new InterError('O valor mínimo de uma cobrança no Inter é R$ 2,50.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.vencimento || ''))) throw new InterError('Informe a data de vencimento.', 400);

  const pagador = pagadorFromClient(client);
  const seuNumero = String(input.seuNumero || `VC${Date.now().toString().slice(-11)}`).slice(0, 15);
  const body: any = {
    seuNumero,
    valorNominal: Number(valor.toFixed(2)),
    dataVencimento: input.vencimento,
    numDiasAgenda: Math.max(0, Math.min(60, Number(input.numDiasAgenda ?? 30))),
    pagador,
  };
  if (input.mensagem) {
    const linhas = String(input.mensagem).match(/.{1,78}/g) || [];
    body.mensagem = Object.fromEntries(linhas.slice(0, 5).map((l, i) => [`linha${i + 1}`, l]));
  }
  if (input.multa && (input.multa.taxa || input.multa.valor)) body.multa = input.multa;
  if (input.mora && (input.mora.taxa || input.mora.valor)) body.mora = input.mora;
  if (input.desconto && (input.desconto.taxa || input.desconto.valor)) body.desconto = input.desconto;
  if (input.formasRecebimento?.length) body.formasRecebimento = input.formasRecebimento;

  const r = await interRequest<{ codigoSolicitacao: string }>({
    method: 'post',
    path: '/cobranca/v3/cobrancas',
    scope: 'boleto-cobranca.write',
    body,
  });

  const cobrancas = readJson<any[]>(files.cobrancas, []);
  const record: any = {
    id: `COB-${Date.now()}`,
    origem: 'sistema',
    client: client.id,
    clientName: client.name,
    value: valor,
    due: input.vencimento,
    status: 'pending',
    boleto: null,
    pix: null,
    nfse: null,
    emitirNfseAoPagar: input.emitirNfse === 'ao_pagar',
    nfseDados: input.nfse || null,
    inter: { codigoSolicitacao: r.codigoSolicitacao, seuNumero, situacao: 'EM_PROCESSAMENTO' },
    createdAt: new Date().toISOString(),
  };
  cobrancas.push(record);
  writeJson(files.cobrancas, cobrancas);

  // A emissão é assíncrona no Inter; tentamos obter linha digitável/Pix em seguida.
  let atualizado = record;
  for (const espera of [1500, 3000]) {
    await new Promise(res => setTimeout(res, espera));
    try {
      atualizado = await sincronizarCobranca(r.codigoSolicitacao);
      if (atualizado.boleto?.linhaDigitavel || atualizado.pix?.pixCopiaECola) break;
    } catch { /* segue com o registro básico */ }
  }

  let nfseResult: any = null;
  if (input.emitirNfse === 'agora') {
    nfseResult = await emitirNfse({
      ...(input.nfse || {}),
      clienteId: client.id,
      cliente: client.name,
      valor,
      origem: { tipo: 'cobranca', cobrancaId: record.id, codigoSolicitacao: r.codigoSolicitacao },
    });
    if (nfseResult.success) vincularNfseNaCobranca(record.id, nfseResult.nfse.id);
  }
  return { cobranca: readJson<any[]>(files.cobrancas, []).find(c => c.id === record.id) || atualizado, nfse: nfseResult };
}

export function vincularNfseNaCobranca(cobrancaId: string, nfseId: string) {
  const cobrancas = readJson<any[]>(files.cobrancas, []);
  const c = cobrancas.find(x => x.id === cobrancaId);
  if (c) {
    c.nfse = nfseId;
    writeJson(files.cobrancas, cobrancas);
  }
}

const emitindo = new Set<string>();

/** Se a cobrança foi marcada para emitir NFS-e ao pagar e já está paga, emite a nota (uma única vez). */
export async function talvezEmitirNfseDaCobranca(cobrancaId: string) {
  const c = readJson<any[]>(files.cobrancas, []).find(x => x.id === cobrancaId);
  if (!c || !c.emitirNfseAoPagar || c.nfse || c.status !== 'paid' || emitindo.has(c.id)) return null;
  emitindo.add(c.id);
  try {
    const result = await emitirNfse({
      ...(c.nfseDados || {}),
      clienteId: c.client,
      cliente: c.clientName,
      valor: c.inter?.valorTotalRecebido || c.value,
      origem: { tipo: 'cobranca', cobrancaId: c.id, codigoSolicitacao: c.inter?.codigoSolicitacao },
    });
    const cobrancas = readJson<any[]>(files.cobrancas, []);
    const atual = cobrancas.find(x => x.id === c.id);
    if (atual) {
      if (result.success) atual.nfse = result.nfse.id;
      else atual.nfseErro = { em: new Date().toISOString(), erro: result.error };
      writeJson(files.cobrancas, cobrancas);
    }
    return result;
  } finally {
    emitindo.delete(c.id);
  }
}

export async function cancelarCobranca(codigoSolicitacao: string, motivoCancelamento: string) {
  await interRequest({
    method: 'post',
    path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigoSolicitacao)}/cancelar`,
    scope: 'boleto-cobranca.write',
    body: { motivoCancelamento: String(motivoCancelamento || 'Cancelado pelo emissor').slice(0, 50) },
  });
  const cobrancas = readJson<any[]>(files.cobrancas, []);
  const c = cobrancas.find(x => x.inter?.codigoSolicitacao === codigoSolicitacao);
  if (c) {
    c.status = 'canceled';
    c.inter = { ...c.inter, situacao: 'CANCELADO', motivoCancelamento };
    writeJson(files.cobrancas, cobrancas);
  }
  return c || null;
}

// ---------------------------------------------------------------------------
// Operações de saída (log local) e webhooks recebidos
// ---------------------------------------------------------------------------

export function registrarOperacao(op: Record<string, any>) {
  const ops = readJson<any[]>(files.interOperacoes, []);
  ops.unshift({ id: newId('OP'), em: new Date().toISOString(), ...op });
  writeJson(files.interOperacoes, ops.slice(0, 2000));
}

export function saidasPermitidas() {
  return getSettings().interPermitirSaidas === true;
}

export async function processarWebhook(tipo: string, payload: any) {
  const log = readJson<any[]>(files.interWebhookLog, []);
  log.unshift({ id: newId('WH'), tipo, recebidoEm: new Date().toISOString(), payload });
  writeJson(files.interWebhookLog, log.slice(0, 500));

  if (tipo === 'cobranca') {
    const eventos = Array.isArray(payload) ? payload : [payload];
    for (const ev of eventos) {
      if (!ev?.codigoSolicitacao) continue;
      const cobrancas = readJson<any[]>(files.cobrancas, []);
      const c = cobrancas.find(x => x.inter?.codigoSolicitacao === ev.codigoSolicitacao);
      if (!c) {
        // Cobrança emitida fora do sistema: busca o detalhe completo e importa.
        try { await sincronizarCobranca(ev.codigoSolicitacao); } catch (e) { console.error('Webhook cobrança: falha ao importar', (e as Error).message); }
        continue;
      }
      c.status = statusFromSituacao(ev.situacao);
      c.inter = {
        ...c.inter,
        situacao: ev.situacao,
        dataSituacao: ev.dataHoraSituacao || c.inter?.dataSituacao,
        valorTotalRecebido: ev.valorTotalRecebido != null ? Number(ev.valorTotalRecebido) : c.inter?.valorTotalRecebido,
        origemRecebimento: ev.origemRecebimento || c.inter?.origemRecebimento,
      };
      if (ev.linhaDigitavel || ev.codigoBarras || ev.nossoNumero) {
        c.boleto = { ...(c.boleto || {}), nossoNumero: ev.nossoNumero, linhaDigitavel: ev.linhaDigitavel, codigoBarras: ev.codigoBarras };
      }
      if (ev.txid || ev.pixCopiaECola) c.pix = { ...(c.pix || {}), txid: ev.txid, pixCopiaECola: ev.pixCopiaECola };
      c.updatedAt = new Date().toISOString();
      writeJson(files.cobrancas, cobrancas);
      talvezEmitirNfseDaCobranca(c.id).catch(e => console.error('Emissão automática de NFS-e falhou:', e));
    }
  }
}
