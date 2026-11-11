import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import axios, { Method } from 'axios';
import { files, getSettings } from '../storage';

/**
 * Cliente da API PJ do Banco Inter (OAuth2 client_credentials + mTLS).
 * Endpoints e escopos conforme as especificações OpenAPI publicadas em developers.inter.co.
 */

export const INTER_BASE_URL = {
  producao: 'https://cdpj.partners.bancointer.com.br',
  sandbox: 'https://cdpj-sandbox.partners.uatinter.co',
} as const;

export type InterAmbiente = keyof typeof INTER_BASE_URL;

/** Escopos agrupados como na tela de aplicações do Internet Banking PJ. */
export const INTER_SCOPE_GROUPS: Record<string, { label: string; scopes: string[] }> = {
  extrato: { label: 'Conferir saldo e movimentações', scopes: ['extrato.read'] },
  cobranca: { label: 'Emitir boletos com ou sem Pix', scopes: ['boleto-cobranca.read', 'boleto-cobranca.write'] },
  pix: {
    label: 'Receber e enviar pagamentos por Pix',
    scopes: [
      'cob.read', 'cob.write', 'cobv.read', 'cobv.write', 'lotecobv.read', 'lotecobv.write',
      'pix.read', 'pix.write', 'webhook.read', 'webhook.write', 'payloadlocation.read', 'payloadlocation.write',
    ],
  },
  pagamentos: {
    label: 'Pagar contas, fornecedores e despesas',
    scopes: [
      'pagamento-boleto.read', 'pagamento-boleto.write', 'pagamento-darf.write', 'pagamento-lote.read',
      'pagamento-lote.write', 'pagamento-pix.read', 'pagamento-pix.write', 'webhook-banking.read', 'webhook-banking.write',
    ],
  },
  pixAutomatico: {
    label: 'Cobranças recorrentes e Pix Automático',
    scopes: [
      'rec.read', 'rec.write', 'solicrec.read', 'solicrec.write', 'cobr.read', 'cobr.write',
      'payloadlocationrec.read', 'payloadlocationrec.write', 'webhookrec.read', 'webhookrec.write',
      'webhookcobr.read', 'webhookcobr.write',
    ],
  },
};

export const ALL_INTER_SCOPES = Object.values(INTER_SCOPE_GROUPS).flatMap(g => g.scopes);

export class InterError extends Error {
  status: number;
  data: any;
  constructor(message: string, status = 500, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface InterConfig {
  clientId: string;
  clientSecret: string;
  contaCorrente: string;
  ambiente: InterAmbiente;
  certPem: string;
  keyPem: string;
  scopes: string[];
}

function envPem(name: string): string {
  const raw = process.env[name];
  if (raw && raw.includes('BEGIN')) return raw.replace(/\\n/g, '\n');
  const p = process.env[`${name}_PATH`];
  if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  return '';
}

export function loadInterCert(): { certPem: string; keyPem: string } {
  const certPem = fs.existsSync(files.interCertPem) ? fs.readFileSync(files.interCertPem, 'utf-8') : envPem('INTER_CERT_PEM');
  const keyPem = fs.existsSync(files.interKeyPem) ? fs.readFileSync(files.interKeyPem, 'utf-8') : envPem('INTER_KEY_PEM');
  return { certPem, keyPem };
}

export function loadInterConfig(): InterConfig {
  const s = getSettings();
  const { certPem, keyPem } = loadInterCert();
  const scopes: string[] = Array.isArray(s.interScopes) && s.interScopes.length ? s.interScopes : ALL_INTER_SCOPES;
  return {
    clientId: s.interClientId || process.env.INTER_CLIENT_ID || '',
    clientSecret: s.interClientSecret || process.env.INTER_CLIENT_SECRET || '',
    contaCorrente: String(s.interContaCorrente || process.env.INTER_CONTA_CORRENTE || '').replace(/\D/g, ''),
    ambiente: (s.interAmbiente === 'sandbox' ? 'sandbox' : 'producao') as InterAmbiente,
    certPem,
    keyPem,
    scopes,
  };
}

export function describeCert(certPem: string) {
  try {
    const x = new crypto.X509Certificate(certPem);
    return {
      subject: x.subject.replace(/\n/g, ', '),
      issuer: x.issuer.replace(/\n/g, ', '),
      validFrom: new Date(x.validFrom).toISOString(),
      validTo: new Date(x.validTo).toISOString(),
      expired: new Date(x.validTo).getTime() < Date.now(),
    };
  } catch {
    return null;
  }
}

/** Confere se a chave privada corresponde ao certificado. */
export function certMatchesKey(certPem: string, keyPem: string): boolean {
  try {
    const x = new crypto.X509Certificate(certPem);
    return x.checkPrivateKey(crypto.createPrivateKey(keyPem));
  } catch {
    return false;
  }
}

export function interStatus() {
  const c = loadInterConfig();
  return {
    ambiente: c.ambiente,
    hasCredentials: !!(c.clientId && c.clientSecret),
    hasCert: !!(c.certPem && c.keyPem),
    certMatchesKey: c.certPem && c.keyPem ? certMatchesKey(c.certPem, c.keyPem) : false,
    cert: c.certPem ? describeCert(c.certPem) : null,
    contaCorrente: c.contaCorrente,
    clientIdHint: c.clientId ? `${c.clientId.slice(0, 8)}…` : '',
    scopes: c.scopes,
    configured: !!(c.clientId && c.clientSecret && c.certPem && c.keyPem),
  };
}

// ---------- mTLS agent ----------
let agentCache: { key: string; agent: https.Agent } | null = null;
function getAgent(c: InterConfig) {
  const key = crypto.createHash('sha256').update(c.certPem + c.keyPem).digest('hex');
  if (agentCache?.key === key) return agentCache.agent;
  const agent = new https.Agent({ cert: c.certPem, key: c.keyPem, keepAlive: true, minVersion: 'TLSv1.2' });
  agentCache = { key, agent };
  return agent;
}

// ---------- Token cache ----------
interface CachedToken { token: string; expiresAt: number; scopes: Set<string>; configKey: string }
const tokens: CachedToken[] = [];
const pending = new Map<string, Promise<CachedToken>>();
let fullScopeFailedAt = 0;
const failedScopes = new Map<string, number>();

function configKey(c: InterConfig) {
  return `${c.ambiente}|${c.clientId}|${crypto.createHash('sha1').update(c.clientSecret).digest('hex')}`;
}

export function clearInterTokens() {
  tokens.length = 0;
  pending.clear();
  fullScopeFailedAt = 0;
  failedScopes.clear();
  agentCache = null;
}

async function requestToken(c: InterConfig, scopes: string[]): Promise<CachedToken> {
  const scopeStr = [...new Set(scopes)].join(' ');
  const cacheKey = `${configKey(c)}::${scopeStr}`;
  const inflight = pending.get(cacheKey);
  if (inflight) return inflight;

  const p = (async () => {
    const body = new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'client_credentials',
      scope: scopeStr,
    });
    try {
      const res = await axios.post(`${INTER_BASE_URL[c.ambiente]}/oauth/v2/token`, body.toString(), {
        httpsAgent: getAgent(c),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
      });
      const granted = String(res.data.scope || scopeStr).split(/\s+/).filter(Boolean);
      const t: CachedToken = {
        token: res.data.access_token,
        // Token dura 1h; renovamos com 5 min de folga.
        expiresAt: Date.now() + (Number(res.data.expires_in || 3600) - 300) * 1000,
        scopes: new Set(granted),
        configKey: configKey(c),
      };
      tokens.push(t);
      return t;
    } catch (err: any) {
      throw toInterError(err, 'Falha ao obter token OAuth do Inter');
    } finally {
      pending.delete(cacheKey);
    }
  })();
  pending.set(cacheKey, p);
  return p;
}

/**
 * O Inter limita a geração de tokens a 5 por minuto. Por isso pedimos um único token com todos os
 * escopos habilitados; se a aplicação não tiver algum escopo, caímos para o grupo do escopo e,
 * por último, para o escopo isolado.
 */
async function getToken(c: InterConfig, scope: string): Promise<string> {
  const key = configKey(c);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.expiresAt <= Date.now() || t.configKey !== key) { tokens.splice(i, 1); continue; }
    if (t.scopes.has(scope)) return t.token;
  }

  const recentlyFailed = (ts?: number) => ts && Date.now() - ts < 10 * 60 * 1000;

  if (!recentlyFailed(fullScopeFailedAt)) {
    try {
      const t = await requestToken(c, c.scopes);
      if (t.scopes.has(scope)) return t.token;
    } catch (e: any) {
      if (e.status && e.status < 500) fullScopeFailedAt = Date.now(); else throw e;
    }
  }

  const group = Object.values(INTER_SCOPE_GROUPS).find(g => g.scopes.includes(scope));
  const groupKey = group ? group.scopes.join(' ') : '';
  if (group && !recentlyFailed(failedScopes.get(groupKey))) {
    try {
      const t = await requestToken(c, group.scopes.filter(s => c.scopes.includes(s) || s === scope));
      if (t.scopes.has(scope)) return t.token;
    } catch (e: any) {
      if (e.status && e.status < 500) failedScopes.set(groupKey, Date.now()); else throw e;
    }
  }

  const t = await requestToken(c, [scope]);
  return t.token;
}

function describeInterBody(data: any): string {
  if (!data) return '';
  if (typeof data === 'string') return data.slice(0, 500);
  const parts: string[] = [];
  if (data.title) parts.push(data.title);
  if (data.detail && data.detail !== data.title) parts.push(data.detail);
  if (data.message) parts.push(data.message);
  if (data.error_description) parts.push(data.error_description);
  else if (data.error && typeof data.error === 'string') parts.push(data.error);
  const viol = data.violacoes || data.violations;
  if (Array.isArray(viol)) {
    for (const v of viol) parts.push(`${v.propriedade || v.property || ''}: ${v.razao || v.reason || ''}${v.valor ? ` (${v.valor})` : ''}`.trim());
  }
  return parts.join(' — ') || JSON.stringify(data).slice(0, 500);
}

function toInterError(err: any, prefix = 'Erro na API do Inter'): InterError {
  if (err instanceof InterError) return err;
  if (err?.response) {
    const status = err.response.status;
    let data = err.response.data;
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      try { data = JSON.parse(Buffer.from(data as any).toString('utf-8')); } catch { data = Buffer.from(data as any).toString('utf-8'); }
    }
    return new InterError(`${prefix} (HTTP ${status}): ${describeInterBody(data)}`, status, data);
  }
  const code = err?.code ? ` [${err.code}]` : '';
  return new InterError(`${prefix}: ${err?.message || err}${code}`, 502);
}

export interface InterRequest {
  method: Method;
  path: string;
  scope: string;
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
}

function cleanQuery(q?: Record<string, any>) {
  if (!q) return undefined;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

export function assertInterConfigured(c = loadInterConfig()) {
  if (!c.clientId || !c.clientSecret) {
    throw new InterError('Credenciais do Banco Inter não configuradas (Client ID / Client Secret). Configure em Banco Inter › Configuração.', 400);
  }
  if (!c.certPem || !c.keyPem) {
    throw new InterError('Certificado da aplicação Inter (.crt e .key) não enviado. Configure em Banco Inter › Configuração.', 400);
  }
  return c;
}

export async function interRequest<T = any>(r: InterRequest, retried = false): Promise<T> {
  const c = assertInterConfigured();
  const token = await getToken(c, r.scope);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...(r.headers || {}) };
  if (c.contaCorrente) headers['x-conta-corrente'] = c.contaCorrente;
  if (r.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await axios.request({
      method: r.method,
      url: `${INTER_BASE_URL[c.ambiente]}${r.path}`,
      params: cleanQuery(r.query),
      data: r.body,
      headers,
      httpsAgent: getAgent(c),
      timeout: 60000,
    });
    return res.data as T;
  } catch (err: any) {
    if (err?.response?.status === 401 && !retried) {
      // Token revogado/expirado antes do previsto: descarta e tenta mais uma vez.
      clearTokensFor(token);
      return interRequest<T>(r, true);
    }
    throw toInterError(err);
  }
}

function clearTokensFor(token: string) {
  for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].token === token) tokens.splice(i, 1);
}

/** Lista os escopos efetivamente concedidos no token geral (útil para diagnóstico). */
export async function interTestConnection() {
  const c = assertInterConfigured();
  const t = await requestToken(c, c.scopes).catch(async (e: InterError) => {
    if (e.status && e.status < 500) {
      // Aplicação sem algum escopo: testa só o extrato.
      return requestToken(c, ['extrato.read']);
    }
    throw e;
  });
  return { scopes: [...t.scopes], expiresAt: new Date(t.expiresAt).toISOString() };
}

export function newTxid(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length];
  return s;
}
