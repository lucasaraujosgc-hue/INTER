import React, { useState, useEffect } from 'react';
import { BarChart3, Loader2, Download, Calendar, Filter } from 'lucide-react';

export default function Relatorios({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading reports data
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, [token]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-green" /></div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-brand-text">Relatórios Financeiros</h2>
        <div className="flex gap-2">
          <button className="bg-brand-surface2 hover:bg-brand-surface3 text-brand-text font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors border border-brand-border">
            <Filter size={16} />
            Filtros
          </button>
          <button className="bg-brand-green hover:bg-brand-green-dim text-black font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors">
            <Download size={16} />
            Exportar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receitas vs Despesas */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-brand-text">Receitas vs Despesas</h3>
            <select className="bg-brand-surface2 border border-brand-border rounded-lg text-sm text-brand-text py-1 px-2 outline-none">
              <option>Este Mês</option>
              <option>Último Mês</option>
              <option>Este Ano</option>
            </select>
          </div>
          <div className="h-64 flex items-end justify-between gap-2">
            {/* Placeholder for chart */}
            {[40, 70, 45, 90, 65, 85, 100].map((h, i) => (
              <div key={i} className="w-full flex flex-col gap-1 justify-end h-full group">
                <div className="w-full bg-brand-green/20 rounded-t-sm relative group-hover:bg-brand-green/30 transition-colors" style={{ height: `${h}%` }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-surface3 text-brand-text text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    R$ {(h * 150).toFixed(0)}
                  </div>
                </div>
                <div className="text-center text-xs text-brand-dim mt-2">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inadimplência */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-brand-text">Taxa de Inadimplência</h3>
            <select className="bg-brand-surface2 border border-brand-border rounded-lg text-sm text-brand-text py-1 px-2 outline-none">
              <option>Últimos 6 meses</option>
              <option>Últimos 12 meses</option>
            </select>
          </div>
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-bold text-red-400 mb-2">0,0%</div>
              <div className="text-sm text-brand-muted">Nenhuma cobrança em atraso no período</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
