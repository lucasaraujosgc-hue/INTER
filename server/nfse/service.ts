import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { files, readJson, writeJson, getSettings, saveSettings, onlyDigits, createMutex, pdfDir } from '../storage';
import {
  montarDps, assinarXml, enviarDps, consultarChavePorDps, consultarNfse, montarPedidoCancelamento, registrarEvento,
  lerNfse, normalizarCompetencia, normalizarCTribNac, SefinError, Ambiente, Leiaute, CertA1, consultarParametrosMunicipais,
} from './nacional';
import { emitirWebIss } from './webiss';
import { danfsePdf } from './danfse';
import { urlToPdf } from '../pdf';

export const DESCRICAO_PADRAO = 'Prestação de serviços contábeis, compreendendo escrituração contábil e fiscal, apuração de tributos, elaboração e entrega de obrigações acessórias, assessoria e consultoria contábil.';

/** Configuração fiscal efetiva (novos campos da NFS-e nacional com fallback para os antigos). */
export function nfseConfig() {
  const s = getSettings();
  const legacyOptante = Number(s.optanteSimplesNacional || 1) === 1;
  return {
    provedor: (s.nfseProvedor === 'webiss' ? 'webiss' : 'nacional') as 'nacional' | 'webiss',
    ambiente: (s.nfseAmbiente === '2' ? '2' : '1') as Ambiente,
    leiaute: (s.nfseLeiaute === 'nt009' ? 'nt009' : 'atual') as Leiaute,
    assinatura: (s.nfseAssinatura === 'sha256' ? 'sha256' : 'sha1') as 'sha1' | 'sha256',
    cnpj: onlyDigits(s.prestadorCnpj || '52613515000160'),
    inscricaoMunicipal: s.nfsePrestadorIm || '',
    codMunicipio: onlyDigits(s.codigoMunicipio || '2929305'),
    fone: s.nfsePrestadorFone || '',
    email: s.nfsePrestadorEmail || '',
    opSimpNac: (s.nfseOpSimpNac || (legacyOptante ? '3' : '1')) as '1' | '2' | '3',
    regApTribSN: (s.nfseRegApTribSN || '1') as '1' | '2' | '3',
    regEspTrib: String(s.nfseRegEspTrib ?? '0'),
    cTribNac: s.nfseCTribNac || s.itemLc116 || '17.19',
    cTribMun: s.nfseCTribMun || '',
    cNBS: s.nfseCNBS || s.codigoNbs || '',
    pAliq: s.nfseInformarAliquota ? (s.aliquota ?? '') : '',
    pTotTribSN: s.nfsePTotTribSN ?? '',
    tpRetISSQN: String(s.nfseTpRetISSQN || '1') as '1' | '2' | '3',
    serie: String(s.nfseSerie || '1'),
    proximoNumero: Math.max(1, Number(s.nfseProximoNumero || 1)),
    descricaoPadrao: s.nfseDescricaoPadrao || DESCRICAO_PADRAO,
    ibscbs: s.nfseIbsCbsAtivo ? { cIndOp: s.nfseCIndOp || '', cClassTrib: s.nfseCClassTrib || '' } : null,
  };
}

export function loadCertA1(): CertA1 | null {
  if (fs.existsSync(files.certPem) && fs.existsSync(files.keyPem)) {
    return {
      certPem: fs.readFileSync(files.certPem, 'utf-8'),
      keyPem: fs.readFileSync(files.keyPem, 'utf-8'),
      chainPem: fs.existsSync(files.chainPem) ? fs.readFileSync(files.chainPem, 'utf-8') : undefined,
    };
  }
  if (process.env.CERT_PEM && process.env.KEY_PEM) {
    return { certPem: process.env.CERT_PEM.replace(/\\n/g, '\n'), keyPem: process.env.KEY_PEM.replace(/\\n/g, '\n') };
  }
  return null;
}

async function codigoIbgePorCep(cep: string): Promise<string> {
  const c = onlyDigits(cep);
  if (c.length !== 8) return '';
  try {
    const r = await axios.get(`https://viacep.com.br/ws/${c}/json/`, { timeout: 8000 });
    return onlyDigits(r.data?.ibge);
  } catch {
    return '';
  }
}

function findClient(input: { clienteId?: string; cliente?: string }) {
  const clients = readJson<any[]>(files.clients, []);
  return clients.find(c => input.clienteId && c.id === input.clienteId) || clients.find(c => input.cliente && c.name === input.cliente) || null;
}

export interface EmitirNfseInput {
  clienteId?: string;
  cliente?: string;
  valor: number | string;
  descricao?: string;
  competencia?: string;
  cTribNac?: string;
  cTribMun?: string;
  cNBS?: string;
  pAliq?: number | string;
  pTotTribSN?: number | string;
  tpRetISSQN?: '1' | '2' | '3';
  issRetido?: number | string; // legado (1 = sim, 2 = não)
  semTomador?: boolean;
  origem?: Record<string, any>;
  [k: string]: any;
}

export interface EmitirNfseResult {
  success: boolean;
  message?: string;
  nfse?: any;
  status?: number;
  error?: string;
  xmlPreview?: string;
  erros?: any[];
}

const emissaoMutex = createMutex();

/** Quando a nota nasce de uma cobrança, grava o vínculo na própria cobrança. */
function vincularCobranca(origem: Record<string, any> | undefined, nfseId: string) {
  if (!origem?.cobrancaId && !origem?.codigoSolicitacao) return;
  const cobrancas = readJson<any[]>(files.cobrancas, []);
  const c = cobrancas.find(x => (origem.cobrancaId && x.id === origem.cobrancaId) || (origem.codigoSolicitacao && x.inter?.codigoSolicitacao === origem.codigoSolicitacao));
  if (c && !c.nfse) {
    c.nfse = nfseId;
    delete c.nfseErro;
    writeJson(files.cobrancas, cobrancas);
  }
}

export function emitirNfse(input: EmitirNfseInput): Promise<EmitirNfseResult> {
  return emissaoMutex(() => emitirNfseInterno(input));
}

async function emitirNfseInterno(input: EmitirNfseInput): Promise<EmitirNfseResult> {
  const cfg = nfseConfig();
  const client = findClient(input);
  if (!client && !input.semTomador) {
    return { success: false, status: 400, error: 'Cliente (tomador) não encontrado. Cadastre o cliente antes de emitir a NFS-e.' };
  }
  const valor = Number(input.valor);
  if (!(valor > 0)) return { success: false, status: 400, error: 'Informe um valor maior que zero.' };

  // Evita nota em duplicidade para a mesma entrada do extrato.
  if (input.origem?.idTransacao) {
    const dup = readJson<any[]>(files.nfse, []).find(n => n.origem?.idTransacao === input.origem!.idTransacao && n.status !== 'canceled');
    if (dup) return { success: false, status: 409, error: `Já existe NFS-e (${dup.numero || dup.id}) para esta entrada do extrato.` };
  }

  const cert = loadCertA1();
  if (!cert) return { success: false, status: 400, error: 'Certificado Digital A1 não configurado. Importe o arquivo .pfx em Configurações.' };

  if (cfg.provedor === 'webiss') return emitirViaWebIss(input, client, cert);

  const competencia = normalizarCompetencia(input.competencia);
  const descricao = String(input.descricao || cfg.descricaoPadrao);
  const tpRet = (input.tpRetISSQN || (Number(input.issRetido) === 1 ? '2' : cfg.tpRetISSQN)) as '1' | '2' | '3';

  let tomador = null;
  if (client) {
    let codMunicipio = onlyDigits(client.codigoMunicipio || client.cityCode);
    if (codMunicipio.length !== 7 && client.cep) {
      codMunicipio = await codigoIbgePorCep(client.cep);
      if (codMunicipio) {
        const clients = readJson<any[]>(files.clients, []);
        const c = clients.find(x => x.id === client.id);
        if (c) { c.codigoMunicipio = codMunicipio; writeJson(files.clients, clients); }
      }
    }
    tomador = {
      documento: client.cpfCnpj || client.document,
      nome: client.name,
      inscricaoMunicipal: client.inscricaoMunicipal,
      codMunicipio,
      cep: client.cep,
      logradouro: client.logradouro || client.address,
      numero: client.numero || client.number,
      complemento: client.complemento,
      bairro: client.bairro || client.neighborhood,
      fone: client.telefone || client.phone,
      email: client.email,
    };
  }

  let numero = cfg.proximoNumero;
  let dps: { id: string; xml: string };
  let signed: string;
  try {
    dps = montarDps({
      ambiente: cfg.ambiente,
      leiaute: cfg.leiaute,
      serie: cfg.serie,
      numero,
      competencia,
      prestador: {
        cnpj: cfg.cnpj,
        inscricaoMunicipal: cfg.inscricaoMunicipal,
        codMunicipio: cfg.codMunicipio,
        fone: cfg.fone,
        email: cfg.email,
        opSimpNac: cfg.opSimpNac,
        regApTribSN: cfg.regApTribSN,
        regEspTrib: cfg.regEspTrib,
      },
      tomador,
      servico: {
        cTribNac: normalizarCTribNac(input.cTribNac || cfg.cTribNac),
        cTribMun: input.cTribMun ?? cfg.cTribMun,
        cNBS: input.cNBS ?? cfg.cNBS,
        descricao,
        tribISSQN: '1',
        tpRetISSQN: tpRet,
        pAliq: input.pAliq !== undefined && input.pAliq !== '' ? input.pAliq : cfg.pAliq,
        pTotTribSN: input.pTotTribSN !== undefined && input.pTotTribSN !== '' ? input.pTotTribSN : cfg.pTotTribSN,
        valor,
        ibscbs: cfg.ibscbs,
      },
    });
    signed = assinarXml(dps.xml, 'infDPS', cert.keyPem, cert.certPem, cfg.assinatura);
  } catch (e: any) {
    return { success: false, status: 400, error: `Erro ao montar a DPS: ${e.message}` };
  }

  let resultado: { chaveAcesso: string; xmlNfse: string; alertas: any[] } | null = null;
  try {
    resultado = await enviarDps(cfg.ambiente, cert, signed);
  } catch (e: any) {
    if (e instanceof SefinError && e.comunicacao) {
      // Falha de comunicação: a Sefin pode ter gerado a nota. Consulta pelo Id da DPS antes de desistir.
      try {
        const chave = await consultarChavePorDps(cfg.ambiente, cert, dps.id);
        if (chave) resultado = { chaveAcesso: chave, xmlNfse: await consultarNfse(cfg.ambiente, cert, chave), alertas: [] };
      } catch { /* mantém o erro original */ }
    }
    if (!resultado) {
      return { success: false, status: e instanceof SefinError && e.status >= 400 && e.status < 500 ? 400 : 502, error: e.message, erros: e.erros, xmlPreview: signed };
    }
  }

  // DPS aceita: avança a numeração.
  saveSettings({ nfseProximoNumero: numero + 1 });

  const lida = lerNfse(resultado.xmlNfse);
  const nfseList = readJson<any[]>(files.nfse, []);
  const record = {
    id: `NFS-${lida.nNFSe || Date.now()}-${resultado.chaveAcesso.slice(-6)}`,
    provedor: 'nacional',
    ambiente: cfg.ambiente,
    numero: lida.nNFSe,
    chaveAcesso: resultado.chaveAcesso,
    idDps: dps.id,
    serieDps: cfg.serie,
    numeroDps: numero,
    client: client?.id || input.cliente || '',
    clientName: client?.name || input.cliente || 'Consumidor não identificado',
    clientDoc: onlyDigits(client?.cpfCnpj || client?.document),
    value: valor,
    competencia: competencia.slice(0, 7),
    descricao,
    issueDate: (lida.dhProc || new Date().toISOString()).slice(0, 10),
    dhProc: lida.dhProc,
    status: 'issued',
    valores: lida.valores,
    alertas: resultado.alertas,
    origem: input.origem || { tipo: 'manual' },
    xml: signed,
    nfseXml: resultado.xmlNfse,
    createdAt: new Date().toISOString(),
  };
  nfseList.push(record);
  writeJson(files.nfse, nfseList);
  vincularCobranca(input.origem, record.id);

  return {
    success: true,
    message: `NFS-e nº ${lida.nNFSe || '?'} autorizada na Sefin Nacional${cfg.ambiente === '2' ? ' (produção restrita)' : ''}.`,
    nfse: record,
  };
}

async function emitirViaWebIss(input: EmitirNfseInput, client: any, cert: CertA1): Promise<EmitirNfseResult> {
  const settings = getSettings();
  const data: any = { ...input, cliente: client?.name || input.cliente };
  if (client) {
    data.clienteCpfCnpj = client.cpfCnpj || client.document;
    data.clienteEndereco = client.logradouro || client.address;
    data.clienteNumero = client.numero || client.number;
    data.clienteBairro = client.bairro || client.neighborhood;
    data.clienteCodigoMunicipio = client.codigoMunicipio || client.cityCode || '2929305';
    data.clienteUf = client.municipioUf ? client.municipioUf.split('/')[1] : (client.state || 'BA');
    data.clienteCep = onlyDigits(client.cep || client.zipCode);
    data.clienteTelefone = onlyDigits(client.telefone || client.phone);
    data.clienteEmail = client.email || '';
  }
  data.itemLc116 = data.itemLc116 || settings.itemLc116 || '1719';
  data.cnae = data.cnae || settings.cnae || '6920601';
  data.codigoTributacaoMunicipio = data.codigoTributacaoMunicipio || settings.codigoTributacaoMunicipio || '1719';
  data.aliquota = data.aliquota || settings.aliquota || 2.01;
  data.descricao = data.descricao || DESCRICAO_PADRAO;
  try {
    const r = await emitirWebIss(data, settings, cert.certPem, cert.keyPem);
    if (r.errors.length) {
      return { success: false, status: 400, error: 'Erro retornado pela Prefeitura: ' + r.errors.join(' | '), xmlPreview: r.responseXml + '\n\n--- XML ENVIADO ---\n\n' + r.signedXml };
    }
    const nfseList = readJson<any[]>(files.nfse, []);
    const record = {
      id: r.numero ? `NFS-${r.numero}` : `NFS-${Date.now()}`,
      provedor: 'webiss',
      numero: r.numero,
      codigoVerificacao: r.codigoVerificacao,
      client: client?.id || data.cliente,
      clientName: data.cliente,
      value: Number(data.valor),
      competencia: normalizarCompetencia(data.competencia).slice(0, 7),
      descricao: data.descricao,
      issueDate: new Date().toISOString().split('T')[0],
      status: r.numero ? 'issued' : 'pending',
      origem: input.origem || { tipo: 'manual' },
      xml: r.signedXml,
      responseXml: r.responseXml,
    };
    nfseList.push(record);
    writeJson(files.nfse, nfseList);
    vincularCobranca(input.origem, record.id);
    return { success: true, message: r.numero ? `NFS-e gerada com sucesso! Número: ${r.numero}` : 'RPS enviado ao WebISS.', nfse: record };
  } catch (e: any) {
    return { success: false, status: 502, error: 'Erro ao emitir NFS-e no WebISS: ' + e.message };
  }
}

// ---------------------------------------------------------------------------
// Pós-emissão: consulta, cancelamento e DANFSe
// ---------------------------------------------------------------------------

function getNfse(id: string) {
  const list = readJson<any[]>(files.nfse, []);
  const idx = list.findIndex(n => n.id === id);
  return { list, idx, nfse: idx >= 0 ? list[idx] : null };
}

export async function sincronizarNfse(id: string) {
  const { list, idx, nfse } = getNfse(id);
  if (!nfse) throw Object.assign(new Error('NFS-e não encontrada.'), { status: 404 });
  if (nfse.provedor !== 'nacional') throw Object.assign(new Error('Consulta disponível apenas para NFS-e nacional.'), { status: 400 });
  const cert = loadCertA1();
  if (!cert) throw Object.assign(new Error('Certificado A1 não configurado.'), { status: 400 });
  let chave = nfse.chaveAcesso;
  if (!chave && nfse.idDps) chave = await consultarChavePorDps(nfse.ambiente || nfseConfig().ambiente, cert, nfse.idDps);
  if (!chave) throw Object.assign(new Error('A Sefin Nacional não localizou NFS-e para esta DPS.'), { status: 404 });
  const xml = await consultarNfse(nfse.ambiente || nfseConfig().ambiente, cert, chave);
  const lida = lerNfse(xml);
  list[idx] = { ...nfse, chaveAcesso: chave, nfseXml: xml, numero: lida.nNFSe || nfse.numero, valores: lida.valores, status: nfse.status === 'canceled' ? 'canceled' : 'issued' };
  writeJson(files.nfse, list);
  return list[idx];
}

export async function cancelarNfse(id: string, codigoMotivo: '1' | '2' | '9', motivo: string) {
  const { list, idx, nfse } = getNfse(id);
  if (!nfse) throw Object.assign(new Error('NFS-e não encontrada.'), { status: 404 });
  if (nfse.provedor !== 'nacional' || !nfse.chaveAcesso) throw Object.assign(new Error('Cancelamento pelo sistema disponível apenas para NFS-e nacional.'), { status: 400 });
  if (nfse.status === 'canceled') return nfse;
  const cert = loadCertA1();
  if (!cert) throw Object.assign(new Error('Certificado A1 não configurado.'), { status: 400 });
  const cfg = nfseConfig();
  const ped = montarPedidoCancelamento({ ambiente: nfse.ambiente || cfg.ambiente, cnpjAutor: cfg.cnpj, chaveAcesso: nfse.chaveAcesso, codigoMotivo, motivo });
  const signed = assinarXml(ped.xml, 'infPedReg', cert.keyPem, cert.certPem, cfg.assinatura);
  const eventoXml = await registrarEvento(nfse.ambiente || cfg.ambiente, cert, nfse.chaveAcesso, signed);
  list[idx] = { ...nfse, status: 'canceled', cancelamento: { em: new Date().toISOString(), codigoMotivo, motivo, eventoXml } };
  writeJson(files.nfse, list);
  const pdf = path.join(pdfDir, `${nfse.id}.pdf`);
  if (fs.existsSync(pdf)) fs.unlinkSync(pdf);
  return list[idx];
}

export async function obterPdfNfse(id: string): Promise<string> {
  const { nfse } = getNfse(id);
  if (!nfse) throw Object.assign(new Error('NFS-e não encontrada.'), { status: 404 });
  const pdfPath = path.join(pdfDir, `${nfse.id}.pdf`);
  if (fs.existsSync(pdfPath)) return pdfPath;

  if (nfse.provedor === 'nacional' || nfse.chaveAcesso) {
    let xml = nfse.nfseXml;
    if (!xml) xml = (await sincronizarNfse(id)).nfseXml;
    fs.writeFileSync(pdfPath, await danfsePdf(xml, { cancelada: nfse.status === 'canceled' }));
    return pdfPath;
  }

  // Legado WebISS: imprime a página pública da prefeitura.
  if (!nfse.numero || !nfse.codigoVerificacao) throw Object.assign(new Error('NFS-e ainda não emitida.'), { status: 404 });
  const cnpj = onlyDigits(getSettings().prestadorCnpj || '52613515000160');
  const url = `https://saogoncalodoscamposba.webiss.com.br/externo/nfse/visualizar/${cnpj}/${nfse.codigoVerificacao}/${nfse.numero}`;
  fs.writeFileSync(pdfPath, await urlToPdf(url));
  return pdfPath;
}

export async function testarConexaoNacional() {
  const cert = loadCertA1();
  if (!cert) throw Object.assign(new Error('Certificado Digital A1 não configurado.'), { status: 400 });
  const cfg = nfseConfig();
  const r = await consultarParametrosMunicipais(cfg.ambiente, cert, cfg.codMunicipio, 'convenio');
  return { ambiente: cfg.ambiente, codMunicipio: cfg.codMunicipio, status: r.status, convenio: r.body };
}
