import { files, readJson, writeJson, onlyDigits, createMutex } from '../storage';
import { sefinRequest, ungz64, lerNfse, Ambiente, CertA1, SefinError } from './nacional';

/**
 * Distribuição de documentos do Ambiente de Dados Nacional (ADN) da NFS-e.
 * GET /contribuintes/DFe/{NSU}?lote=true devolve, em ordem de NSU, as NFS-e e os eventos em que o CNPJ do
 * certificado aparece como prestador, tomador ou intermediário. Guardamos tudo localmente e consultamos daqui.
 */
export const ADN_URL: Record<Ambiente, string> = {
  '1': 'https://adn.nfse.gov.br/contribuintes',
  '2': 'https://adn.producaorestrita.nfse.gov.br/contribuintes',
};

export type PapelNfse = 'emitida' | 'tomada' | 'intermediario' | 'outro';

export interface NfseAdn {
  chave: string;
  nsu: number;
  papel: PapelNfse;
  numero: string;
  dhEmi: string;
  dhProc: string;
  competencia: string; // AAAA-MM
  prestador: { doc: string; nome: string; municipio: string };
  tomador: { doc: string; nome: string };
  valor: number;
  valorLiquido: number;
  iss: number;
  issRetido: boolean;
  descricao: string;
  cancelada: boolean;
  canceladaEm?: string;
  xml: string;
}

interface StoreAdn {
  ambiente: Ambiente;
  cnpj: string;
  ultimoNsu: number;
  sincronizadoEm?: string;
  docs: Record<string, NfseAdn>;
  eventosPendentes: Record<string, { tipo: string; em: string }>; // cancelamento recebido antes da nota
}

function field(obj: any, name: string) {
  if (!obj || typeof obj !== 'object') return undefined;
  const k = Object.keys(obj).find(x => x.toLowerCase() === name.toLowerCase());
  return k ? obj[k] : undefined;
}

function lerStore(ambiente: Ambiente, cnpj: string): StoreAdn {
  const s = readJson<StoreAdn | null>(files.nfseAdn, null);
  // Mudou ambiente ou CNPJ: recomeça do zero (NSU é por ambiente/contribuinte).
  if (!s || s.ambiente !== ambiente || s.cnpj !== cnpj) return { ambiente, cnpj, ultimoNsu: 0, docs: {}, eventosPendentes: {} };
  return { eventosPendentes: {}, ...s };
}

function papelDe(l: ReturnType<typeof lerNfse>, cnpj: string): PapelNfse {
  if (onlyDigits(l.emit.doc) === cnpj) return 'emitida';
  if (onlyDigits(l.dps.toma.doc) === cnpj) return 'tomada';
  return l.emit.doc || l.dps.toma.doc ? 'intermediario' : 'outro';
}

function docDaNfse(xml: string, nsu: number, cnpj: string, chaveInformada: string): NfseAdn {
  const l = lerNfse(xml);
  const valor = Number(l.dps.vServ || 0);
  return {
    chave: l.chaveAcesso || onlyDigits(chaveInformada),
    nsu,
    papel: papelDe(l, cnpj),
    numero: l.nNFSe,
    dhEmi: l.dps.dhEmi,
    dhProc: l.dhProc,
    competencia: String(l.dps.dCompet || l.dps.dhEmi || '').slice(0, 7),
    prestador: { doc: onlyDigits(l.emit.doc), nome: l.emit.nome, municipio: l.xLocEmi },
    tomador: { doc: onlyDigits(l.dps.toma.doc), nome: l.dps.toma.nome },
    valor,
    valorLiquido: Number(l.valores.vLiq || valor),
    iss: Number(l.valores.vISSQN || 0),
    issRetido: l.dps.tpRetISSQN === '2' || l.dps.tpRetISSQN === '3',
    descricao: l.dps.xDescServ,
    cancelada: false,
    xml,
  };
}

const syncMutex = createMutex();

/** Busca no ADN os documentos novos (a partir do último NSU guardado). */
export function sincronizarAdn(args: { ambiente: Ambiente; cnpj: string; cert: CertA1; desdeInicio?: boolean; maxLotes?: number }) {
  return syncMutex(async () => {
    const cnpj = onlyDigits(args.cnpj);
    const store = args.desdeInicio ? { ...lerStore(args.ambiente, cnpj), ultimoNsu: 0 } : lerStore(args.ambiente, cnpj);
    const base = process.env.NFSE_URL_ADN || ADN_URL[args.ambiente];
    let novos = 0, eventos = 0, lotes = 0, fim = false;
    const alertas: string[] = [];

    for (; lotes < (args.maxLotes || 40) && !fim; lotes++) {
      const nsuInicial = store.ultimoNsu + 1;
      const r = await sefinRequest(`${base}/DFe/${nsuInicial}?lote=true&cnpjConsulta=${cnpj}`, args.cert, 'GET');
      const status = String(field(r.json, 'StatusProcessamento') || '');
      if (r.status === 404 || /NENHUM_DOCUMENTO/i.test(status)) { fim = true; break; }
      if (r.status === 429) { alertas.push('O ADN limitou as consultas por agora; a sincronização continua na próxima vez.'); break; }
      if (r.status >= 400 || /REJEICAO/i.test(status)) {
        const erros = field(r.json, 'Erros') || field(r.json, 'erros') || [];
        const msg = (Array.isArray(erros) ? erros : [erros]).map((e: any) => `${field(e, 'Codigo') || ''} ${field(e, 'Descricao') || ''}`.trim()).filter(Boolean).join(' | ');
        throw new SefinError(`ADN respondeu HTTP ${r.status}${msg ? `: ${msg}` : `: ${r.text.slice(0, 300)}`}`, r.status || 502, []);
      }
      const lote: any[] = field(r.json, 'LoteDFe') || [];
      if (!lote.length) { fim = true; break; }

      for (const item of lote) {
        const nsu = Number(field(item, 'NSU') || 0);
        const tipo = String(field(item, 'TipoDocumento') || '').toUpperCase();
        const chave = onlyDigits(field(item, 'ChaveAcesso'));
        const b64 = field(item, 'ArquivoXml');
        if (nsu > store.ultimoNsu) store.ultimoNsu = nsu;
        if (!b64) continue;
        let xml = '';
        try { xml = ungz64(String(b64)); } catch { try { xml = Buffer.from(String(b64), 'base64').toString('utf-8'); } catch { continue; } }

        if (tipo.includes('EVENTO') || (/<(\w+:)?evento[\s>]/i.test(xml) && !/<(\w+:)?infNFSe/i.test(xml))) {
          // e101101 = cancelamento; e105102 = cancelamento por substituição
          const tpEv = String(field(item, 'TipoEvento') || (xml.match(/e10[15]10[12]/)?.[0] || ''));
          if (/101101|105102|CANCEL/i.test(tpEv) && chave) {
            const em = (xml.match(/<dhEvento>([^<]+)</) || xml.match(/<dhProc>([^<]+)</))?.[1] || String(field(item, 'DataHoraGeracao') || '');
            if (store.docs[chave]) { store.docs[chave].cancelada = true; store.docs[chave].canceladaEm = em; }
            else store.eventosPendentes[chave] = { tipo: tpEv, em };
            eventos++;
          }
          continue;
        }
        if (!/<(\w+:)?infNFSe/i.test(xml)) continue; // DPS e outros documentos não são listados
        const doc = docDaNfse(xml, nsu, cnpj, chave);
        if (!doc.chave) continue;
        const pend = store.eventosPendentes[doc.chave];
        if (pend) { doc.cancelada = true; doc.canceladaEm = pend.em; delete store.eventosPendentes[doc.chave]; }
        if (!store.docs[doc.chave]) novos++;
        store.docs[doc.chave] = { ...store.docs[doc.chave], ...doc, cancelada: doc.cancelada || !!store.docs[doc.chave]?.cancelada };
      }
      // Grava a cada lote: se cair no meio, continua de onde parou.
      store.sincronizadoEm = new Date().toISOString();
      writeJson(files.nfseAdn, store);
    }
    store.sincronizadoEm = new Date().toISOString();
    writeJson(files.nfseAdn, store);
    return { novos, eventos, lotes, completo: fim, ultimoNsu: store.ultimoNsu, total: Object.keys(store.docs).length, alertas };
  });
}

export function listarAdn(filtro: { ambiente: Ambiente; cnpj: string; papel?: string; inicio?: string; fim?: string; por?: 'emissao' | 'competencia'; busca?: string }) {
  const store = lerStore(filtro.ambiente, onlyDigits(filtro.cnpj));
  const q = String(filtro.busca || '').trim().toLowerCase();
  const qd = q.replace(/\D/g, '');
  const docs = Object.values(store.docs)
    .filter(d => !filtro.papel || filtro.papel === 'todas' || d.papel === filtro.papel)
    .filter(d => {
      const ref = filtro.por === 'competencia' ? d.competencia : String(d.dhEmi || d.dhProc).slice(0, 10);
      if (filtro.inicio && ref < (filtro.por === 'competencia' ? filtro.inicio.slice(0, 7) : filtro.inicio)) return false;
      if (filtro.fim && ref > (filtro.por === 'competencia' ? filtro.fim.slice(0, 7) : filtro.fim)) return false;
      return true;
    })
    .filter(d => !q || [d.prestador.nome, d.tomador.nome, d.numero, d.descricao].some(v => String(v || '').toLowerCase().includes(q))
      || (qd.length >= 3 && [d.prestador.doc, d.tomador.doc, d.chave].some(v => String(v).includes(qd))))
    .sort((a, b) => String(b.dhEmi || b.dhProc).localeCompare(String(a.dhEmi || a.dhProc)))
    .map(({ xml, ...d }) => d);
  return { ultimoNsu: store.ultimoNsu, sincronizadoEm: store.sincronizadoEm || null, total: Object.keys(store.docs).length, docs };
}

export function obterDocAdn(ambiente: Ambiente, cnpj: string, chave: string) {
  return lerStore(ambiente, onlyDigits(cnpj)).docs[onlyDigits(chave)] || null;
}
