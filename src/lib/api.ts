export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = any>(token: string, url: string, opts: { method?: string; body?: any; query?: Record<string, any> } = {}): Promise<T> {
  let full = url;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    const s = qs.toString();
    if (s) full += (url.includes('?') ? '&' : '?') + s;
  }
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const res = await fetch(full, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body === undefined ? undefined : isForm ? opts.body : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data.error || data.message)) || `Erro HTTP ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

/** Nome do arquivo informado pelo servidor em Content-Disposition (ex.: NFS_CLIENTE_11-11-2026.pdf). */
function filenameFrom(res: Response) {
  const cd = res.headers.get('Content-Disposition') || '';
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) { try { return decodeURIComponent(star[1]); } catch { /* segue */ } }
  return cd.match(/filename="?([^";]+)"?/i)?.[1] || '';
}

/**
 * Baixa um PDF (ou outro binário) autenticado. Usa o nome sugerido pelo servidor
 * (NFS_CLIENTE_data.pdf, BOLETO_CLIENTE_data.pdf…); sem nome, abre em nova aba.
 */
export async function openBlob(token: string, url: string, download?: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = `Erro HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* binário */ }
    throw new Error(msg);
  }
  const nome = download || filenameFrom(res);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  if (nome) a.download = nome; else a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function fmtDate(s?: string) {
  if (!s) return '';
  const d = String(s).slice(0, 10).split('-');
  if (d.length !== 3) return String(s);
  return `${d[2]}/${d[1]}/${d[0]}`;
}

export function fmtDateTime(s?: string) {
  if (!s) return '';
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return String(s);
  return dt.toLocaleString('pt-BR');
}

export function isoDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function firstDayOfMonth() {
  return isoDate().slice(0, 8) + '01';
}

export function fmtDoc(d?: string) {
  const x = String(d || '').replace(/\D/g, '');
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return d || '';
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Converte AAAA-MM-DD para o intervalo RFC 3339 usado pelas APIs Pix. */
export function pixRange(inicio: string, fim: string) {
  // 00:00 e 23:59:59 no horário de Brasília (UTC-3), enviados em UTC.
  const ini = new Date(`${inicio}T03:00:00Z`);
  const end = new Date(new Date(`${fim}T03:00:00Z`).getTime() + 86400000 - 1000);
  const z = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { inicio: z(ini), fim: z(end) };
}
