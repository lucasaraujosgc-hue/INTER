import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const backupDir = path.join(process.cwd(), 'backup');
export const interDir = path.join(backupDir, 'inter');
export const pdfDir = path.join(backupDir, 'pdf');

export const files = {
  clients: path.join(backupDir, 'clients.json'),
  settings: path.join(backupDir, 'settings.json'),
  cobrancas: path.join(backupDir, 'cobrancas.json'),
  nfse: path.join(backupDir, 'nfse.json'),
  // Marcações locais sobre as entradas do extrato (ex.: "ignorar", vínculo com NFS-e)
  interEntradas: path.join(backupDir, 'inter_entradas.json'),
  // Boletos marcados como pagos por fora (ex.: cliente pagou por Pix direto na conta), por codigoSolicitacao
  cobrancasBaixas: path.join(backupDir, 'cobrancas_baixas.json'),
  // Histórico das operações de saída feitas pelo sistema (Pix, boletos, DARF, lotes)
  interOperacoes: path.join(backupDir, 'inter_operacoes.json'),
  // Últimos webhooks recebidos do Inter
  interWebhookLog: path.join(backupDir, 'inter_webhooks.json'),
  // Certificado A1 (NFS-e) extraído do PFX
  certPem: path.join(backupDir, 'cert.pem'),
  keyPem: path.join(backupDir, 'key.pem'),
  chainPem: path.join(backupDir, 'chain.pem'),
  // Certificado da aplicação no Banco Inter (mTLS)
  interCertPem: path.join(interDir, 'cert.pem'),
  interKeyPem: path.join(interDir, 'key.pem'),
};

export function ensureStorage() {
  for (const dir of [backupDir, interDir, pdfDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const arrays = [files.clients, files.cobrancas, files.nfse, files.interOperacoes, files.interWebhookLog];
  for (const f of arrays) {
    if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
  }
  if (!fs.existsSync(files.interEntradas)) fs.writeFileSync(files.interEntradas, '{}');
  if (!fs.existsSync(files.cobrancasBaixas)) fs.writeFileSync(files.cobrancasBaixas, '{}');
  if (!fs.existsSync(files.settings)) {
    fs.writeFileSync(files.settings, JSON.stringify({ interClientId: '', interClientSecret: '', interContaCorrente: '' }));
  }
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error(`Falha ao ler ${path.basename(file)}:`, (e as Error).message);
    return fallback;
  }
}

/** Escrita atômica: grava em arquivo temporário e renomeia, evitando JSON corrompido. */
export function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

export function writeSecretFile(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode: 0o600 });
}

export type Settings = Record<string, any>;

export function getSettings(): Settings {
  return readJson<Settings>(files.settings, {});
}

export function saveSettings(patch: Settings): Settings {
  const current = getSettings();
  const next = { ...current, ...patch };
  writeJson(files.settings, next);
  return next;
}

/** Campos que nunca voltam para o navegador em texto puro. */
export const SECRET_SETTINGS = ['interClientSecret', 'interWebhookSecret'];

export function publicSettings(s: Settings) {
  const out: Settings = { ...s };
  for (const k of SECRET_SETTINGS) {
    out[`${k}Set`] = !!s[k];
    delete out[k];
  }
  return out;
}

export function getWebhookSecret(): string {
  const s = getSettings();
  if (s.interWebhookSecret) return s.interWebhookSecret;
  const secret = crypto.randomBytes(18).toString('hex');
  saveSettings({ interWebhookSecret: secret });
  return secret;
}

export function onlyDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Fila simples para serializar operações que não podem rodar em paralelo (ex.: numeração da DPS). */
export function createMutex() {
  let last: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const next = last.then(fn, fn);
    last = next.catch(() => undefined);
    return next;
  };
}

/** Data de hoje (AAAA-MM-DD) no horário de Brasília. */
export function hojeBR(offsetDias = 0): string {
  return new Date(Date.now() - 3 * 3600_000 + offsetDias * 86400_000).toISOString().slice(0, 10);
}

/** Nome amigável para downloads: PREFIXO_NOME_DO_CLIENTE_DD-MM-AAAA.ext (sem acentos nem espaços). */
export function nomeArquivo(prefixo: string, nome: string, ext = 'pdf'): string {
  const slug = String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 60).replace(/_+$/, '');
  const [a, m, d] = hojeBR().split('-');
  return `${prefixo}_${slug || 'SEM_NOME'}_${d}-${m}-${a}.${ext}`;
}

/** Data de corte das entradas: recebimentos até esta data (inclusive) aparecem como "Antes" e não exigem NFS-e. */
export const CORTE_ENTRADAS_PADRAO = '2026-10-31';
export function corteEntradas(): string {
  const v = getSettings().entradasCorteNfse;
  if (v === undefined || v === null) return CORTE_ENTRADAS_PADRAO;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : '';
}
