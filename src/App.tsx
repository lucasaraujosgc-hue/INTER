/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Users, Building2, Settings, BarChart2, Plus, Receipt, LogOut } from 'lucide-react';
import Login from './components/Login';
import Configuracoes from './components/Configuracoes';
import Clientes from './components/Clientes';
import Cobrancas from './components/Cobrancas';
import Nfse from './components/Nfse';
import BancoInter from './components/BancoInter';
import Relatorios from './components/Relatorios';
import NovaCobrancaModal from './components/NovaCobrancaModal';
import Dashboard, { Navegar } from './components/Dashboard';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const storedToken = localStorage.getItem('vc_token') || sessionStorage.getItem('vc_token');
    if (storedToken) setToken(storedToken);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('vc_token');
    sessionStorage.removeItem('vc_token');
    setToken(null);
  };

  /** Navegação usada pelos atalhos do dashboard (inclusive para uma aba do Banco Inter). */
  const navegar: Navegar = (tab, opts) => {
    try {
      if (opts?.interTab) localStorage.setItem('vc_inter_tab', opts.interTab);
      if (opts?.entradas) sessionStorage.setItem('vc_entradas_preset', JSON.stringify(opts.entradas));
    } catch { /* armazenamento indisponível */ }
    setActiveTab(tab);
  };

  if (!token) return <Login onLogin={setToken} />;

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-brand-bg text-brand-text">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <Topbar title={activeTab} onNew={() => setIsModalOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-7">
          {activeTab === 'Dashboard' ? (
            <Dashboard token={token} refreshKey={refreshKey} navegar={navegar} />
          ) : activeTab === 'Configurações' ? (
            <Configuracoes token={token} />
          ) : activeTab === 'Clientes' ? (
            <Clientes token={token} />
          ) : activeTab === 'Cobranças' ? (
            <Cobrancas token={token} refreshKey={refreshKey} />
          ) : activeTab === 'NFS-e' ? (
            <Nfse token={token} refreshKey={refreshKey} setRefreshKey={setRefreshKey} />
          ) : activeTab === 'Banco Inter' ? (
            <BancoInter token={token} />
          ) : activeTab === 'Relatórios' ? (
            <Relatorios token={token} />
          ) : (
            <div className="flex items-center justify-center h-full text-brand-muted">Módulo em desenvolvimento</div>
          )}
        </main>
      </div>
      {isModalOpen && <NovaCobrancaModal onClose={() => setIsModalOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} token={token} />}
    </div>
  );
}

function Sidebar({ activeTab, setActiveTab, onLogout }: { activeTab: string, setActiveTab: (t: string) => void, onLogout: () => void }) {
  const navItems = [
    { label: 'Principal', isLabel: true },
    { id: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'Cobranças', icon: FileText, label: 'Cobranças' },
    { id: 'Clientes', icon: Users, label: 'Clientes' },
    { id: 'NFS-e', icon: Receipt, label: 'NFS-e' },
    { label: 'Integrações', isLabel: true },
    { id: 'Banco Inter', icon: Building2, label: 'Banco Inter' },
    { label: 'Sistema', isLabel: true },
    { id: 'Configurações', icon: Settings, label: 'Configurações' },
    { id: 'Relatórios', icon: BarChart2, label: 'Relatórios' },
  ];

  return (
    <aside className="virgula-marca w-[240px] min-w-[240px] bg-brand-forest text-white flex flex-col h-full" style={{ ['--virgula-bottom' as any]: '4.5rem' }}>
      <a href="https://www.virgulacontabil.com.br" target="_blank" rel="noopener noreferrer" className="px-6 pt-6 pb-5 border-b border-white/10 block group" title="www.virgulacontabil.com.br">
        <div className="font-serif text-[30px] font-semibold leading-none tracking-[-0.02em] text-white">
          Vírgula<span className="text-brand-orange">,</span>
        </div>
        <div className="text-[11px] font-bold tracking-[0.32em] uppercase text-brand-orange-light mt-1.5">Contábil</div>
        <div className="text-[11.5px] text-white/50 mt-3 leading-snug">Cobrança, Banco Inter e NFS-e</div>
      </a>

      <nav className="flex-1 p-3 overflow-y-auto relative z-[1]">
        {navItems.map((item, idx) => {
          if (item.isLabel) {
            return <div key={idx} className="text-[10px] font-bold text-white/40 uppercase tracking-[0.14em] px-3 pt-4 pb-1.5">{item.label}</div>;
          }
          const Icon = item.icon!;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id!)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer transition-colors text-[13.5px] font-medium mb-0.5 relative text-left ${
                isActive ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
              }`}
            >
              {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-orange rounded-r-sm" />}
              <Icon size={16} strokeWidth={2} className={isActive ? 'text-brand-orange-light' : ''} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3.5 border-t border-white/10 flex items-center justify-between relative z-[1]">
        <div className="flex items-center gap-2.5 p-2 rounded-md bg-white/5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-brand-orange flex items-center justify-center text-xs font-bold text-white shrink-0">VC</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-white truncate">Vírgula Contábil</div>
            <div className="text-[11px] text-white/50">Administrador</div>
          </div>
        </div>
        <button onClick={onLogout} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-colors ml-2" title="Sair" aria-label="Sair">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ title, onNew }: { title: string, onNew: () => void }) {
  const subMap: Record<string, string> = {
    'Dashboard': 'Recebimentos, notas e cobranças que pedem atenção',
    'Cobranças': 'Gerencie todas as cobranças e boletos',
    'Clientes': 'Base de clientes e pagadores vinculados',
    'NFS-e': 'Notas fiscais de serviço — padrão nacional',
    'Banco Inter': 'Saldo, extrato, boletos, Pix, pagamentos e NFS-e das entradas',
    'Configurações': 'Ajustes do sistema',
    'Relatórios': 'Métricas e resultados',
  };
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="px-7 py-4 border-b border-brand-border flex items-center gap-4 bg-white/70 backdrop-blur shrink-0">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold text-brand-forest font-serif tracking-[-0.015em] leading-tight">{title}</h1>
        <div className="text-[13px] text-brand-muted mt-0.5 truncate">{subMap[title] || ''}</div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden md:inline text-[12.5px] text-brand-muted first-letter:uppercase">{hoje}</span>
        <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 bg-brand-orange hover:bg-brand-orange-dim text-white rounded-md text-[13px] font-semibold transition-colors cursor-pointer">
          <Plus size={16} strokeWidth={2.5} />
          Nova cobrança
        </button>
      </div>
    </div>
  );
}
