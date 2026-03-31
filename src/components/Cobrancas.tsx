import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Search, Plus, Eye, Receipt, Mail } from 'lucide-react';

export default function Cobrancas({ token, refreshKey }: { token: string, refreshKey?: number }) {
  const [cobrancas, setCobrancas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/cobrancas', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setCobrancas(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [token, refreshKey]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-green" /></div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-brand-text">Gerenciamento de Cobranças</h2>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-brand-border flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" size={16} />
            <input 
              type="text" 
              placeholder="Buscar cobrança..." 
              className="w-full bg-brand-surface2 border border-brand-border rounded-lg py-2 pl-10 pr-4 text-brand-text outline-none focus:border-brand-green transition-colors"
            />
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">ID</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Cliente</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Valor</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Vencimento</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Status</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Boleto</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">NFS-e</th>
              <th className="px-6 py-3 text-xs font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {cobrancas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-brand-muted">
                  <FileText size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Nenhuma cobrança encontrada.</p>
                </td>
              </tr>
            ) : (
              cobrancas.map(c => (
                <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-brand-surface2 transition-colors">
                  <td className="px-6 py-4 text-brand-muted font-mono text-sm">{c.id}</td>
                  <td className="px-6 py-4 font-medium text-brand-text">{c.clientName}</td>
                  <td className="px-6 py-4 font-mono text-sm">R$ {c.value.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                  <td className="px-6 py-4 text-brand-muted text-sm">{c.due.split('-').reverse().join('/')}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-surface3 text-brand-muted">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[12.5px]">
                    {c.boleto ? <span className="text-brand-green">✓ Gerado</span> : <span className="text-brand-dim">—</span>}
                  </td>
                  <td className="px-6 py-4 text-[12.5px] font-medium">
                    {c.nfse ? <span className="text-brand-green">✓ Emitida</span> : <span className="text-brand-dim">—</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button className="text-brand-muted hover:text-brand-text transition-colors"><Eye size={16} /></button>
                      <button className="text-brand-muted hover:text-brand-text transition-colors"><Receipt size={16} /></button>
                      <button className="text-brand-muted hover:text-brand-text transition-colors"><Mail size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
