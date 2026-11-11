import https from 'https';
import fs from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';

/**
 * NFS-e padrão nacional (Sistema Nacional NFS-e / Sefin Nacional).
 * Leiaute DPS v1.01 (namespace http://www.sped.fazenda.gov.br/nfse), envio síncrono via
 * POST {Sefin}/nfse com JSON { dpsXmlGZipB64 } e autenticação mútua TLS com o e-CNPJ A1.
 */

export const NFSE_NS = 'http://www.sped.fazenda.gov.br/nfse';
export const VERSAO_LEIAUTE = '1.01';
export const VERSAO_APLICATIVO = 'VirgulaContabil-2.0';

export type Ambiente = '1' | '2'; // 1 = produção, 2 = produção restrita (homologação)
export type Leiaute = 'atual' | 'nt009';

export const SEFIN_URL: Record<Ambiente, string> = {
  '1': 'https://sefin.nfse.gov.br/SefinNacional',
  '2': 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
};

export const CONSULTA_PUBLICA_URL = 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

const CHAR_MAP: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...',
  ' ': ' ', '•': '-', 'º': 'o', 'ª': 'a',
};

/** Ajusta o texto às regras do XSD (Latin-1, sem espaços nas pontas). */
export function sanitize(v: unknown, opts: { max?: number; multiline?: boolean } = {}): string {
  let s = String(v ?? '');
  s = s.replace(/[‘’“”–—… •]/g, c => CHAR_MAP[c] ?? ' ');
  s = s.normalize('NFC').replace(/[^\n\x20-\xFF]/g, '');
  if (opts.multiline) {
    s = s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  } else {
    s = s.replace(/\s+/g, ' ').trim();
  }
  if (opts.max && s.length > opts.max) s = s.slice(0, opts.max).trim();
  return s;
}

export function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function tag(name: string, value: unknown, opts: { max?: number; multiline?: boolean; raw?: boolean } = {}) {
  if (value === undefined || value === null || value === '') return '';
  const v = opts.raw ? String(value) : sanitize(value, opts);
  if (!v) return '';
  return `<${name}>${escapeXml(v)}</${name}>`;
}

function group(name: string, ...children: string[]) {
  const inner = children.filter(Boolean).join('');
  return inner ? `<${name}>${inner}</${name}>` : '';
}

export function dec2(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Valor numérico inválido: ${v}`);
  return n.toFixed(2);
}

/** Data/hora no fuso de Brasília (UTC-3, sem horário de verão desde 2019). */
export function dataHoraBrasilia(d: Date) {
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19) + '-03:00';
}

export function hojeBrasilia() {
  return dataHoraBrasilia(new Date()).slice(0, 10);
}

/**
 * Converte o item da LC 116 para o código de tributação nacional (6 dígitos: item + subitem + desdobro).
 * Ex.: "17.19" ou "1719" -> "171901"; "7.02" -> "070201".
 */
export function normalizarCTribNac(v: unknown): string {
  const raw = String(v ?? '').trim();
  const d = digits(raw);
  if (d.length === 6) return d;
  if (raw.includes('.')) {
    const [item, sub] = raw.split('.');
    return `${digits(item).padStart(2, '0')}${digits(sub).padStart(2, '0').slice(0, 2)}01`;
  }
  if (d.length === 4) return `${d}01`;
  if (d.length === 3) return `0${d}01`;
  throw new Error(`Código de tributação nacional inválido: "${raw}". Use 6 dígitos (ex.: 171901) ou o item da LC 116 (ex.: 17.19).`);
}

/** Competência no formato AAAA-MM-DD (aceita AAAA-MM). */
export function normalizarCompetencia(v?: string) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return hojeBrasilia();
}

// ---------------------------------------------------------------------------
// Montagem da DPS
// ---------------------------------------------------------------------------

export interface PrestadorDps {
  cnpj: string;
  inscricaoMunicipal?: string;
  codMunicipio: string;
  fone?: string;
  email?: string;
  opSimpNac: '1' | '2' | '3';
  regApTribSN?: '1' | '2' | '3';
  regEspTrib: string;
}

export interface TomadorDps {
  documento?: string;
  nome: string;
  inscricaoMunicipal?: string;
  codMunicipio?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  fone?: string;
  email?: string;
}

export interface ServicoDps {
  cTribNac: string;
  cTribMun?: string;
  cNBS?: string;
  descricao: string;
  cLocPrestacao?: string;
  tribISSQN: '1' | '2' | '3' | '4';
  tpRetISSQN: '1' | '2' | '3';
  pAliq?: number | string | null;
  pTotTribSN?: number | string | null;
  valor: number;
  ibscbs?: { cIndOp?: string; cClassTrib?: string } | null;
}

export interface DadosDps {
  ambiente: Ambiente;
  leiaute: Leiaute;
  serie: string;
  numero: number;
  competencia: string; // AAAA-MM-DD
  emitidaEm?: Date;
  prestador: PrestadorDps;
  tomador?: TomadorDps | null;
  servico: ServicoDps;
}

export function montarIdDps(codMunicipio: string, cnpjOuCpf: string, serie: string, numero: number) {
  const doc = digits(cnpjOuCpf);
  const tipo = doc.length === 11 ? '1' : '2';
  return `DPS${digits(codMunicipio)}${tipo}${doc.padStart(14, '0')}${digits(serie).padStart(5, '0')}${String(numero).padStart(15, '0')}`;
}

function docTag(doc: string) {
  const d = digits(doc);
  if (d.length === 11) return tag('CPF', d, { raw: true });
  if (d.length === 14) return tag('CNPJ', d, { raw: true });
  return '';
}

function fone(v?: string) {
  const d = digits(v);
  return d.length >= 6 && d.length <= 20 ? d : undefined;
}

function email(v?: string) {
  const first = String(v || '').split(/[;,\s]+/).find(e => /.+@.+\..+/.test(e));
  return first ? first.slice(0, 80) : undefined;
}

function enderecoTomador(t: TomadorDps) {
  // O endereço é opcional, mas quando informado exige município, CEP, logradouro, número e bairro.
  const cMun = digits(t.codMunicipio);
  const cep = digits(t.cep);
  if (cMun.length !== 7 || cep.length !== 8 || !sanitize(t.logradouro) || !sanitize(t.bairro)) return '';
  return group(
    'end',
    group('endNac', tag('cMun', cMun, { raw: true }), tag('CEP', cep, { raw: true })),
    tag('xLgr', t.logradouro, { max: 255 }),
    tag('nro', t.numero || 'S/N', { max: 60 }),
    tag('xCpl', t.complemento, { max: 156 }),
    tag('xBairro', t.bairro, { max: 60 }),
  );
}

export function montarDps(d: DadosDps): { id: string; xml: string } {
  const p = d.prestador;
  const s = d.servico;
  const t = d.tomador;
  if (digits(p.codMunicipio).length !== 7) throw new Error('Código IBGE do município emissor (7 dígitos) não configurado.');
  if (digits(p.cnpj).length !== 14 && digits(p.cnpj).length !== 11) throw new Error('CNPJ do prestador inválido.');
  if (!(Number(s.valor) > 0)) throw new Error('Valor do serviço deve ser maior que zero.');
  const descricao = sanitize(s.descricao, { multiline: true, max: 2000 });
  if (!descricao) throw new Error('Descrição do serviço é obrigatória.');

  const id = montarIdDps(p.codMunicipio, p.cnpj, d.serie, d.numero);
  // A Sefin rejeita dhEmi posterior ao horário de processamento: usamos 1 minuto de folga.
  const dhEmi = dataHoraBrasilia(new Date((d.emitidaEm ?? new Date()).getTime() - 60_000));

  const prest = group(
    'prest',
    docTag(p.cnpj),
    tag('IM', p.inscricaoMunicipal, { max: 15 }),
    tag('fone', fone(p.fone), { raw: true }),
    tag('email', email(p.email)),
    group(
      'regTrib',
      tag('opSimpNac', p.opSimpNac, { raw: true }),
      p.opSimpNac === '3' ? tag('regApTribSN', p.regApTribSN || '1', { raw: true }) : '',
      tag('regEspTrib', p.regEspTrib || '0', { raw: true }),
    ),
  );

  let toma = '';
  if (t && sanitize(t.nome)) {
    const doc = docTag(t.documento || '');
    if (!doc) throw new Error(`CPF/CNPJ do tomador "${t.nome}" inválido ou não informado.`);
    toma = group(
      'toma',
      doc,
      tag('IM', t.inscricaoMunicipal ? digits(t.inscricaoMunicipal) : '', { max: 15 }),
      tag('xNome', t.nome, { max: 300 }),
      enderecoTomador(t),
      tag('fone', fone(t.fone), { raw: true }),
      tag('email', email(t.email)),
    );
  }

  const cTribNac = normalizarCTribNac(s.cTribNac);
  const cTribMun = digits(s.cTribMun);
  const cNBS = digits(s.cNBS);
  const cServParts = [
    tag('cTribNac', cTribNac, { raw: true }),
    cTribMun.length === 3 ? tag('cTribMun', cTribMun, { raw: true }) : '',
  ];
  const xDesc = `<xDescServ>${escapeXml(descricao)}</xDescServ>`;
  const nbs = cNBS.length === 9 ? tag('cNBS', cNBS, { raw: true }) : '';
  const cServ = d.leiaute === 'nt009' ? group('cServ', ...cServParts, nbs, xDesc) : group('cServ', ...cServParts, xDesc, nbs);

  const serv = group(
    'serv',
    group('locPrest', tag('cLocPrestacao', digits(s.cLocPrestacao || p.codMunicipio), { raw: true })),
    cServ,
  );

  const pAliq = s.pAliq !== undefined && s.pAliq !== null && String(s.pAliq) !== '' && Number(s.pAliq) > 0 ? dec2(s.pAliq) : '';
  const pTotTribSN = s.pTotTribSN !== undefined && s.pTotTribSN !== null && String(s.pTotTribSN) !== '' ? dec2(s.pTotTribSN) : '';
  // Optante do Simples (ME/EPP) informa o percentual aproximado dos tributos do SN; demais usam indTotTrib=0.
  const totTrib = p.opSimpNac === '3' && pTotTribSN
    ? tag('pTotTribSN', pTotTribSN, { raw: true })
    : tag('indTotTrib', '0', { raw: true });

  const valores = group(
    'valores',
    group('vServPrest', tag('vServ', dec2(s.valor), { raw: true })),
    group(
      'trib',
      group(
        'tribMun',
        tag('tribISSQN', s.tribISSQN, { raw: true }),
        tag('tpRetISSQN', s.tpRetISSQN, { raw: true }),
        pAliq ? tag('pAliq', pAliq, { raw: true }) : '',
      ),
      group('totTrib', totTrib),
    ),
  );

  let ibscbs = '';
  const cClassTrib = digits(s.ibscbs?.cClassTrib);
  if (cClassTrib.length === 6) {
    const cst = cClassTrib.slice(0, 3);
    const cIndOp = digits(s.ibscbs?.cIndOp);
    const classif = tag('CST', cst, { raw: true }) + tag('cClassTrib', cClassTrib, { raw: true });
    if (d.leiaute === 'nt009') {
      ibscbs = group('IBSCBS', cIndOp.length === 6 ? tag('cIndOp', cIndOp, { raw: true }) : '', tag('indDest', '0', { raw: true }), group('valores', group('trib', classif)));
    } else {
      if (cIndOp.length !== 6) throw new Error('Para informar IBS/CBS no leiaute atual é obrigatório o indicador da operação (cIndOp, 6 dígitos).');
      ibscbs = group('IBSCBS', tag('finNFSe', '0', { raw: true }), tag('cIndOp', cIndOp, { raw: true }), tag('indDest', '0', { raw: true }), group('valores', group('trib', group('gIBSCBS', classif))));
    }
  }

  const infDps =
    `<infDPS Id="${id}">` +
    tag('tpAmb', d.ambiente, { raw: true }) +
    tag('dhEmi', dhEmi, { raw: true }) +
    tag('verAplic', VERSAO_APLICATIVO, { raw: true }) +
    tag('serie', String(Number(digits(d.serie) || '1')), { raw: true }) +
    tag('nDPS', String(d.numero), { raw: true }) +
    tag('dCompet', d.competencia, { raw: true }) +
    tag('tpEmit', '1', { raw: true }) +
    (d.leiaute === 'nt009' ? tag('finNFSe', '0', { raw: true }) : '') +
    tag('cLocEmi', digits(p.codMunicipio), { raw: true }) +
    prest + toma + serv + valores + ibscbs +
    `</infDPS>`;

  return { id, xml: `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NFSE_NS}" versao="${VERSAO_LEIAUTE}">${infDps}</DPS>` };
}

export function montarPedidoCancelamento(args: {
  ambiente: Ambiente; cnpjAutor: string; chaveAcesso: string; codigoMotivo: '1' | '2' | '9'; motivo: string;
}) {
  const chave = digits(args.chaveAcesso);
  if (chave.length !== 50) throw new Error('Chave de acesso da NFS-e inválida (50 dígitos).');
  const motivo = sanitize(args.motivo, { max: 255 });
  if (motivo.length < 15) throw new Error('A justificativa do cancelamento deve ter pelo menos 15 caracteres.');
  const id = `PRE${chave}101101`;
  const doc = digits(args.cnpjAutor);
  const inf =
    `<infPedReg Id="${id}">` +
    tag('tpAmb', args.ambiente, { raw: true }) +
    tag('verAplic', VERSAO_APLICATIVO, { raw: true }) +
    tag('dhEvento', dataHoraBrasilia(new Date(Date.now() - 60_000)), { raw: true }) +
    (doc.length === 11 ? tag('CPFAutor', doc, { raw: true }) : tag('CNPJAutor', doc, { raw: true })) +
    tag('chNFSe', chave, { raw: true }) +
    group('e101101', tag('xDesc', 'Cancelamento de NFS-e', { raw: true }), tag('cMotivo', args.codigoMotivo, { raw: true }), `<xMotivo>${escapeXml(motivo)}</xMotivo>`) +
    `</infPedReg>`;
  return { id, xml: `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="${NFSE_NS}" versao="${VERSAO_LEIAUTE}">${inf}</pedRegEvento>` };
}

// ---------------------------------------------------------------------------
// Assinatura XMLDSig (enveloped, C14N) do elemento infDPS / infPedReg
// ---------------------------------------------------------------------------

const ALGS = {
  sha1: { sig: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1', digest: 'http://www.w3.org/2000/09/xmldsig#sha1' },
  sha256: { sig: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', digest: 'http://www.w3.org/2001/04/xmlenc#sha256' },
};

export function assinarXml(xml: string, elemento: 'infDPS' | 'infPedReg', keyPem: string, certPem: string, alg: 'sha1' | 'sha256' = 'sha1') {
  const a = ALGS[alg] || ALGS.sha1;
  const xpath = `//*[local-name(.)='${elemento}']`;
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: a.sig,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: a.digest,
  });
  sig.computeSignature(xml, { location: { reference: xpath, action: 'after' } });
  return sig.getSignedXml();
}

// ---------------------------------------------------------------------------
// Comunicação com a Sefin Nacional (mTLS)
// ---------------------------------------------------------------------------

export interface CertA1 { certPem: string; keyPem: string; chainPem?: string }

export class SefinError extends Error {
  status: number;
  erros: { codigo?: string; descricao: string; complemento?: string }[];
  comunicacao: boolean;
  constructor(message: string, status: number, erros: SefinError['erros'] = [], comunicacao = false) {
    super(message);
    this.status = status;
    this.erros = erros;
    this.comunicacao = comunicacao;
  }
}

export const gz64 = (xml: string) => gzipSync(Buffer.from(xml, 'utf-8')).toString('base64');
export const ungz64 = (b64: string) => gunzipSync(Buffer.from(b64, 'base64')).toString('utf-8');

function field(obj: any, name: string) {
  if (!obj || typeof obj !== 'object') return undefined;
  const k = Object.keys(obj).find(x => x.toLowerCase() === name.toLowerCase());
  return k ? obj[k] : undefined;
}

function mensagens(v: any) {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list.filter(m => m && typeof m === 'object').map((m: any) => ({
    codigo: field(m, 'codigo') ? String(field(m, 'codigo')) : undefined,
    descricao: String(field(m, 'descricao') ?? field(m, 'mensagem') ?? JSON.stringify(m)),
    complemento: field(m, 'complemento') ? String(field(m, 'complemento')) : undefined,
  }));
}

export function sefinBaseUrl(ambiente: Ambiente) {
  return process.env.NFSE_URL_SEFIN || SEFIN_URL[ambiente];
}

export function sefinRequest(url: string, cert: CertA1, method: string, body?: unknown): Promise<{ status: number; json: any; text: string; buffer: Buffer; contentType: string }> {
  const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const ca = process.env.NFSE_CA_PATH && fs.existsSync(process.env.NFSE_CA_PATH) ? fs.readFileSync(process.env.NFSE_CA_PATH) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(url), {
      method,
      key: cert.keyPem,
      cert: [cert.certPem, cert.chainPem || ''].filter(Boolean).join('\n'),
      ...(ca ? { ca } : {}),
      headers: {
        Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
      },
      timeout: 60_000,
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf-8');
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
        resolve({ status: res.statusCode || 0, json, text, buffer, contentType: String(res.headers['content-type'] || '') });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`tempo esgotado aguardando ${new URL(url).host}`)));
    req.on('error', e => reject(new SefinError(`Falha de comunicação com a Sefin Nacional: ${e.message}`, 0, [], true)));
    if (data) req.write(data);
    req.end();
  });
}

function errosDaResposta(r: { status: number; json: any; text: string }) {
  const e = mensagens(field(r.json, 'erros') ?? field(r.json, 'erro'));
  if (e.length) return e;
  return [{ codigo: String(r.status), descricao: r.text.slice(0, 500) || 'Resposta vazia da Sefin Nacional' }];
}

function formatErros(erros: SefinError['erros']) {
  return erros.map(e => `${e.codigo ? `[${e.codigo}] ` : ''}${e.descricao}${e.complemento ? ` (${e.complemento})` : ''}`).join(' | ');
}

export async function enviarDps(ambiente: Ambiente, cert: CertA1, xmlAssinado: string) {
  const r = await sefinRequest(`${sefinBaseUrl(ambiente)}/nfse`, cert, 'POST', { dpsXmlGZipB64: gz64(xmlAssinado) });
  if (r.status >= 500) throw new SefinError(`Sefin Nacional indisponível (HTTP ${r.status}).`, r.status, errosDaResposta(r), true);
  const chave = field(r.json, 'chaveAcesso');
  const xmlB64 = field(r.json, 'nfseXmlGZipB64');
  if (r.status >= 200 && r.status < 300 && chave && xmlB64) {
    return { chaveAcesso: String(chave), xmlNfse: ungz64(String(xmlB64)), alertas: mensagens(field(r.json, 'alertas')), idDps: field(r.json, 'idDps') };
  }
  const erros = errosDaResposta(r);
  throw new SefinError(`NFS-e rejeitada pela Sefin Nacional: ${formatErros(erros)}`, r.status, erros);
}

export async function consultarChavePorDps(ambiente: Ambiente, cert: CertA1, idDps: string): Promise<string | null> {
  const r = await sefinRequest(`${sefinBaseUrl(ambiente)}/dps/${encodeURIComponent(idDps)}`, cert, 'GET');
  if (r.status === 404) return null;
  if (r.status >= 500) throw new SefinError(`Sefin Nacional indisponível (HTTP ${r.status}).`, r.status, [], true);
  const chave = field(r.json, 'chaveAcesso');
  return chave ? String(chave) : null;
}

export async function consultarNfse(ambiente: Ambiente, cert: CertA1, chaveAcesso: string) {
  const r = await sefinRequest(`${sefinBaseUrl(ambiente)}/nfse/${encodeURIComponent(chaveAcesso)}`, cert, 'GET');
  const xmlB64 = field(r.json, 'nfseXmlGZipB64');
  if (r.status !== 200 || !xmlB64) throw new SefinError(`Falha ao consultar NFS-e: ${formatErros(errosDaResposta(r))}`, r.status, errosDaResposta(r));
  return ungz64(String(xmlB64));
}

export async function consultarEventos(ambiente: Ambiente, cert: CertA1, chaveAcesso: string) {
  const r = await sefinRequest(`${sefinBaseUrl(ambiente)}/nfse/${encodeURIComponent(chaveAcesso)}/eventos`, cert, 'GET');
  if (r.status === 404) return [];
  if (r.status !== 200) throw new SefinError(`Falha ao consultar eventos: ${formatErros(errosDaResposta(r))}`, r.status, errosDaResposta(r));
  return r.json;
}

export async function registrarEvento(ambiente: Ambiente, cert: CertA1, chaveAcesso: string, xmlAssinado: string) {
  const r = await sefinRequest(`${sefinBaseUrl(ambiente)}/nfse/${encodeURIComponent(chaveAcesso)}/eventos`, cert, 'POST', {
    pedidoRegistroEventoXmlGZipB64: gz64(xmlAssinado),
  });
  if (r.status >= 500) throw new SefinError(`Sefin Nacional indisponível (HTTP ${r.status}).`, r.status, errosDaResposta(r), true);
  const xmlB64 = field(r.json, 'eventoXmlGZipB64');
  if (r.status >= 200 && r.status < 300 && xmlB64) return ungz64(String(xmlB64));
  const erros = errosDaResposta(r);
  throw new SefinError(`Evento rejeitado pela Sefin Nacional: ${formatErros(erros)}`, r.status, erros);
}

/** Parâmetros municipais (convênio, alíquotas por serviço) - usados no teste de conexão. */
export async function consultarParametrosMunicipais(ambiente: Ambiente, cert: CertA1, codMunicipio: string, sufixo = 'convenio') {
  const r = await sefinRequest(`${sefinBaseUrl(ambiente)}/parametros_municipais/${digits(codMunicipio)}/${sufixo}`, cert, 'GET');
  return { status: r.status, body: r.json ?? r.text.slice(0, 2000) };
}

// ---------------------------------------------------------------------------
// Leitura do XML da NFS-e gerada
// ---------------------------------------------------------------------------

function firstText(doc: any, name: string, parent?: string): string {
  let scope: any = doc;
  if (parent) {
    const p = doc.getElementsByTagNameNS('*', parent)[0];
    if (!p) return '';
    scope = p;
  }
  const el = scope.getElementsByTagNameNS('*', name)[0];
  return el?.textContent?.trim() || '';
}

export function lerNfse(xmlNfse: string) {
  const doc = new DOMParser().parseFromString(xmlNfse, 'text/xml') as any;
  const inf = doc.getElementsByTagNameNS('*', 'infNFSe')[0];
  const id = inf?.getAttribute('Id') || '';
  return {
    chaveAcesso: digits(id) || '',
    nNFSe: firstText(doc, 'nNFSe'),
    nDFSe: firstText(doc, 'nDFSe'),
    cStat: firstText(doc, 'cStat'),
    dhProc: firstText(doc, 'dhProc'),
    xLocEmi: firstText(doc, 'xLocEmi'),
    xLocPrestacao: firstText(doc, 'xLocPrestacao'),
    xTribNac: firstText(doc, 'xTribNac'),
    xTribMun: firstText(doc, 'xTribMun'),
    xNBS: firstText(doc, 'xNBS'),
    xOutInf: firstText(doc, 'xOutInf'),
    emit: {
      doc: firstText(doc, 'CNPJ', 'emit') || firstText(doc, 'CPF', 'emit'),
      im: firstText(doc, 'IM', 'emit'),
      nome: firstText(doc, 'xNome', 'emit'),
      fantasia: firstText(doc, 'xFant', 'emit'),
      logradouro: firstText(doc, 'xLgr', 'emit'),
      numero: firstText(doc, 'nro', 'emit'),
      complemento: firstText(doc, 'xCpl', 'emit'),
      bairro: firstText(doc, 'xBairro', 'emit'),
      cMun: firstText(doc, 'cMun', 'emit'),
      uf: firstText(doc, 'UF', 'emit'),
      cep: firstText(doc, 'CEP', 'emit'),
      fone: firstText(doc, 'fone', 'emit'),
      email: firstText(doc, 'email', 'emit'),
    },
    valores: {
      vBC: firstText(doc, 'vBC', 'valores'),
      pAliqAplic: firstText(doc, 'pAliqAplic', 'valores'),
      vISSQN: firstText(doc, 'vISSQN', 'valores'),
      vTotalRet: firstText(doc, 'vTotalRet', 'valores'),
      vLiq: firstText(doc, 'vLiq', 'valores'),
    },
    dps: {
      dhEmi: firstText(doc, 'dhEmi'),
      dCompet: firstText(doc, 'dCompet'),
      serie: firstText(doc, 'serie'),
      nDPS: firstText(doc, 'nDPS'),
      tpAmb: firstText(doc, 'tpAmb'),
      toma: {
        doc: firstText(doc, 'CNPJ', 'toma') || firstText(doc, 'CPF', 'toma'),
        nome: firstText(doc, 'xNome', 'toma'),
        im: firstText(doc, 'IM', 'toma'),
        logradouro: firstText(doc, 'xLgr', 'toma'),
        numero: firstText(doc, 'nro', 'toma'),
        complemento: firstText(doc, 'xCpl', 'toma'),
        bairro: firstText(doc, 'xBairro', 'toma'),
        cMun: firstText(doc, 'cMun', 'toma'),
        cep: firstText(doc, 'CEP', 'toma'),
        fone: firstText(doc, 'fone', 'toma'),
        email: firstText(doc, 'email', 'toma'),
      },
      cTribNac: firstText(doc, 'cTribNac'),
      cTribMun: firstText(doc, 'cTribMun'),
      cNBS: firstText(doc, 'cNBS'),
      xDescServ: firstText(doc, 'xDescServ'),
      cLocPrestacao: firstText(doc, 'cLocPrestacao'),
      vServ: firstText(doc, 'vServ'),
      tribISSQN: firstText(doc, 'tribISSQN'),
      tpRetISSQN: firstText(doc, 'tpRetISSQN'),
      pAliq: firstText(doc, 'pAliq'),
      opSimpNac: firstText(doc, 'opSimpNac'),
      regApTribSN: firstText(doc, 'regApTribSN'),
      regEspTrib: firstText(doc, 'regEspTrib'),
      pTotTribSN: firstText(doc, 'pTotTribSN'),
    },
  };
}

export type NfseLida = ReturnType<typeof lerNfse>;
