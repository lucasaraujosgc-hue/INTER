import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, X, Copy } from 'lucide-react';
import { copyText } from '../lib/api';

export function Card({ title, subtitle, actions, children, className = '' }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-brand-surface border border-brand-border rounded-[10px] overflow-hidden shadow-brand ${className}`}>
      {(title || actions) && (
        <div className="p-4 px-5 border-b border-brand-border flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold text-brand-forest font-serif tracking-[-0.01em]">{title}</h3>}
            {subtitle && <div className="text-[12px] text-brand-muted mt-0.5">{subtitle}</div>}
          </div>
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'orange';
export function Btn({ variant = 'secondary', loading, icon, children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; icon?: React.ReactNode }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-brand-green hover:bg-brand-green-dim text-white border-brand-green',
    orange: 'bg-brand-orange hover:bg-brand-orange-dim text-white border-brand-orange',
    secondary: 'bg-white hover:border-brand-border-green hover:text-brand-green text-brand-text border-brand-border2',
    danger: 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200',
    ghost: 'bg-transparent hover:bg-brand-surface3 text-brand-muted hover:text-brand-text border-transparent',
  };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-semibold border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconBtn({ title, onClick, children, danger, disabled }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 rounded-md border border-brand-border bg-white flex items-center justify-center transition-colors disabled:opacity-40 ${danger ? 'text-brand-muted hover:text-red-600 hover:border-red-300 hover:bg-red-50' : 'text-brand-muted hover:bg-brand-green-subtle hover:text-brand-green hover:border-brand-border-green'}`}
    >
      {children}
    </button>
  );
}

const inputCls = 'w-full bg-white border border-brand-border2 rounded-md py-2 px-3 text-[13px] text-brand-text outline-none focus:border-brand-orange focus:ring-3 focus:ring-brand-orange/20 transition-colors disabled:bg-brand-surface3 disabled:text-brand-muted';

export function Field({ label, hint, children, className = '' }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className="text-[12px] font-semibold text-brand-forest">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-brand-muted leading-snug">{hint}</span>}
    </label>
  );
}

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`${inputCls} ${props.className || ''}`} />;
export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={`${inputCls} resize-y ${props.className || ''}`} />;
export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string | number; label: string }[] }) {
  return (
    <select {...props} className={`${inputCls} ${props.className || ''}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Alert({ type = 'error', children, onClose }: { type?: 'error' | 'success' | 'info' | 'warn'; children: React.ReactNode; onClose?: () => void }) {
  const map = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    info: 'bg-brand-bg border-brand-border border-l-[3px] border-l-brand-orange text-brand-forest',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
  };
  return (
    <div className={`p-3 rounded-lg border text-[13px] leading-relaxed flex items-start gap-2 ${map[type]}`}>
      {type === 'success' ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0 break-words whitespace-pre-wrap">{children}</div>
      {onClose && <button onClick={onClose} className="opacity-70 hover:opacity-100"><X size={14} /></button>}
    </div>
  );
}

export function Badge({ color = 'gray', children }: { color?: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'orange'; children: React.ReactNode }) {
  const map = {
    green: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
    blue: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200',
    gray: 'bg-brand-surface3 text-brand-muted ring-1 ring-inset ring-brand-border',
    orange: 'bg-brand-orange-soft text-brand-orange-dim ring-1 ring-inset ring-orange-200',
  };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${map[color]}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{children}</span>;
}

export function Modal({ title, subtitle, onClose, children, footer, width = 'max-w-2xl' }: { title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-brand-forest/45 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onMouseDown={onClose}>
      <div className={`bg-brand-surface border border-brand-border rounded-xl w-full ${width} shadow-brand-lg flex flex-col max-h-[92vh]`} onMouseDown={e => e.stopPropagation()}>
        <div className="p-5 px-6 border-b border-brand-border flex items-start gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-brand-forest font-serif tracking-[-0.01em]">{title}</h2>
            {subtitle && <div className="text-xs text-brand-muted mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="ml-auto p-1 text-brand-muted hover:text-brand-text hover:bg-brand-surface3 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5 px-6 overflow-y-auto flex-1 flex flex-col gap-4">{children}</div>
        {footer && <div className="p-4 px-6 border-t border-brand-border bg-brand-surface2 rounded-b-xl flex flex-wrap justify-end gap-2.5 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  className?: string;
  align?: 'right' | 'left' | 'center';
}

export function DataTable({ columns, rows, rowKey, empty = 'Nenhum registro encontrado.', loading }: { columns: Column<any>[]; rows: any[]; rowKey: (r: any, i: number) => string; empty?: string; loading?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} className={`px-4 py-2.5 text-[11px] font-semibold text-brand-muted uppercase tracking-[0.06em] border-b border-brand-border bg-brand-surface2 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-brand-muted"><Loader2 className="animate-spin inline" size={18} /></td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-brand-muted text-[13px]">{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-b border-brand-border last:border-0 hover:bg-brand-surface2 transition-colors">
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-2.5 text-[13px] align-top ${c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`}>
                  {c.render ? c.render(r) : String((r as any)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; icon?: React.ElementType }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 bg-white border border-brand-border rounded-lg p-1 overflow-x-auto shadow-brand">
      {tabs.map(t => {
        const Icon = t.icon;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium whitespace-nowrap transition-all ${active === t.id ? 'bg-brand-forest text-white shadow-sm' : 'text-brand-muted hover:text-brand-forest hover:bg-brand-surface3'}`}>
            {Icon && <Icon size={14} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function CopyBtn({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { if (await copyText(text)) { setOk(true); setTimeout(() => setOk(false), 1500); } }}
      className="inline-flex items-center gap-1 text-[11px] text-brand-muted hover:text-brand-orange-dim"
      title={text}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />}{ok ? 'Copiado' : label}
    </button>
  );
}

export function JsonView({ data, maxHeight = 'max-h-80' }: { data: any; maxHeight?: string }) {
  return (
    <pre className={`text-[11px] text-brand-body font-mono whitespace-pre-wrap break-all bg-brand-surface2 p-3 rounded-lg border border-brand-border overflow-auto ${maxHeight}`}>
      {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

/** Editor JSON com validação, para os corpos avançados das APIs Pix/Pix Automático. */
export function JsonEditor({ value, onChange, rows = 14 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  let err = '';
  try { JSON.parse(value); } catch (e: any) { err = e.message; }
  return (
    <div className="flex flex-col gap-1">
      <Textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} className="font-mono text-[12px]" spellCheck={false} />
      {err && <span className="text-[11px] text-red-600">JSON inválido: {err}</span>}
    </div>
  );
}

export function DateRange({ inicio, fim, onInicio, onFim, children }: { inicio: string; fim: string; onInicio: (v: string) => void; onFim: (v: string) => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="De"><Input type="date" value={inicio} onChange={e => onInicio(e.target.value)} /></Field>
      <Field label="Até"><Input type="date" value={fim} onChange={e => onFim(e.target.value)} /></Field>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, color = 'text-brand-forest' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-[10px] p-4 shadow-brand">
      <div className="text-[11px] font-bold text-brand-muted uppercase tracking-[0.08em]">{label}</div>
      <div className={`text-[24px] font-bold font-serif tabular mt-1.5 leading-tight ${color}`}>{value}</div>
      {sub && <div className="text-[12px] text-brand-muted mt-1">{sub}</div>}
    </div>
  );
}

/** Hook simples de carregamento com estado de erro. */
export function useLoader<T>(fn: () => Promise<T>, deps: any[], initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try { setData(await fn()); } catch (e: any) { setError(e.message || 'Erro ao carregar'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, setData, loading, error, reload: load, setError };
}
