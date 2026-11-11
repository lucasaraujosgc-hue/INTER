/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Calculator, LayoutDashboard, FileText, Users, Building2, Globe, 
  Settings, BarChart2, Search, Bell, Plus, TrendingUp, TrendingDown, 
  AlertCircle, Clock, Eye, Mail, Receipt, LogOut, Loader2
} from 'lucide-react';
import Login from './components/Login';
import Configuracoes from './components/Configuracoes';
import Clientes from './components/Clientes';
import Cobrancas from './components/Cobrancas';
import Nfse from './components/Nfse';
import BancoInter from './components/BancoInter';
import Relatorios from './components/Relatorios';
import NovaCobrancaModal from './components/NovaCobrancaModal';
import NfseEmitirModal from './components/NfseEmitirModal';
import { enviarEmailCobranca, STATUS_COBRANCA } from './components/Cobrancas';

// --- DATA ---
const activities: any[] = [];
const barData = [
  {label:'Ago',val:0, pct:0},
  {label:'Set',val:0,pct:0},
  {label:'Out',val:0,pct:0},
  {label:'Nov',val:0,pct:0},
  {label:'Dez',val:0,pct:0},
  {label:'Jan',val:0,pct:0},
];

// --- COMPONENTS ---

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const storedToken = localStorage.getItem('vc_token') || sessionStorage.getItem('vc_token');
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('vc_token');
    sessionStorage.removeItem('vc_token');
    setToken(null);
  };

  if (!token) {
    return <Login onLogin={setToken} />;
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-brand-bg text-brand-text">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Topbar title={activeTab} onNew={() => setIsModalOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'Dashboard' ? (
            <Dashboard filter={filter} setFilter={setFilter} token={token} refreshKey={refreshKey} />
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
            <div className="flex items-center justify-center h-full text-brand-muted">
              Módulo em desenvolvimento
            </div>
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
    <aside className="w-[240px] min-w-[240px] bg-brand-surface border-r border-brand-border flex flex-col h-full">
      <div className="p-6 pb-5 border-b border-brand-border flex items-center space-x-4">
        <div className="w-12 h-12 bg-[#1f2937] rounded-xl border border-white/10 flex items-center justify-center text-brand-green shadow-[0_0_20px_rgba(16,185,129,0.25)] shrink-0">
          <Calculator size={30} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col justify-center">
          <span className="text-3xl font-bold text-white tracking-tight leading-none mb-0.5">Vírgula</span>
          <span className="text-base font-semibold text-brand-green tracking-widest leading-none uppercase">Contábil</span>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {navItems.map((item, idx) => {
          if (item.isLabel) {
            return <div key={idx} className="text-[10px] font-semibold text-brand-dim uppercase tracking-[1.5px] px-2.5 pt-3 pb-1">{item.label}</div>;
          }
          const Icon = item.icon!;
          const isActive = activeTab === item.id;
          return (
            <div 
              key={item.id}
              onClick={() => setActiveTab(item.id!)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-[13.5px] font-medium mb-px relative ${
                isActive ? 'bg-brand-green-subtle text-brand-green border border-brand-border-green' : 'text-brand-muted hover:bg-brand-surface2 hover:text-brand-text'
              }`}
            >
              {isActive && <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-green rounded-r-sm" />}
              <Icon size={16} strokeWidth={2} />
              {item.label}
              
            </div>
          );
        })}
      </nav>

      <div className="p-3.5 border-t border-brand-border flex items-center justify-between">
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-brand-surface2 cursor-pointer flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-green-dim to-brand-green flex items-center justify-center text-xs font-bold text-black shrink-0">VC</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-brand-text truncate">Vírgula Contábil</div>
            <div className="text-[11px] text-brand-muted">Administrador</div>
          </div>
        </div>
        <button onClick={onLogout} className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-2" title="Sair">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ title, onNew }: { title: string, onNew: () => void }) {
  const subMap: Record<string, string> = {
    'Dashboard': 'Visão geral de cobranças e integrações',
    'Cobranças': 'Gerencie todas as cobranças e boletos',
    'Clientes': 'Base de clientes cadastrados',
    'NFS-e': 'Notas fiscais de serviço — padrão nacional',
    'Banco Inter': 'Saldo, extrato, boletos, Pix, pagamentos e NFS-e das entradas',
    'Configurações': 'Ajustes do sistema',
    'Relatórios': 'Métricas e resultados'
  };

  return (
    <div className="px-7 py-4 border-b border-brand-border flex items-center gap-4 bg-brand-bg shrink-0">
      <div>
        <h1 className="text-lg font-bold text-brand-text tracking-tight">{title}</h1>
        <div className="text-[13px] text-brand-muted mt-0.5">{subMap[title] || ''}</div>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" size={14} strokeWidth={2.5} />
          <input 
            type="text" 
            placeholder="Buscar..." 
            className="bg-brand-surface2 border border-brand-border rounded-lg py-2 pl-8 pr-3 text-[13px] text-brand-text outline-none focus:border-brand-green transition-all w-[200px] focus:w-[240px]"
          />
        </div>
        <button className="relative bg-brand-surface2 border border-brand-border w-9 h-9 rounded-lg flex items-center justify-center text-brand-muted hover:text-brand-text hover:border-brand-border-green transition-colors cursor-pointer">
          <Bell size={16} strokeWidth={2} />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center border-2 border-brand-bg"></span>
        </button>
        <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 bg-brand-green hover:bg-brand-green-dim text-black rounded-lg text-[13px] font-semibold transition-colors cursor-pointer">
          <Plus size={16} strokeWidth={2.5} />
          Nova Cobrança
        </button>
      </div>
    </div>
  );
}

function Dashboard({ filter, setFilter, token, refreshKey }: { filter: string, setFilter: (f: string) => void, token: string, refreshKey: number }) {
  const [clients, setClients] = useState<any[]>([]);
  const [cobrancas, setCobrancas] = useState<any[]>([]);
  const [nfses, setNfses] = useState<any[]>([]);
  const [sysSettings, setSysSettings] = useState<any>({});

  useEffect(() => {
    fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setClients(data))
      .catch(console.error);

    fetch('/api/cobrancas', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setCobrancas(data))
      .catch(console.error);

    fetch('/api/nfse', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setNfses(data))
      .catch(console.error);

    fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setSysSettings(data))
      .catch(console.error);
  }, [token, refreshKey]);

  const [sendingEmail, setSendingEmail] = useState('');
  const [emitirNfse, setEmitirNfse] = useState<any>(null);
  const handleSendEmail = async (c: any) => {
    setSendingEmail(c.id);
    try {
      await enviarEmailCobranca(token, c);
      alert('E-mail enviado com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar e-mail');
    }
    setSendingEmail('');
  };

  const mesAtual = new Date().toISOString().slice(0, 7);
  const received = cobrancas.filter(c => c.status === 'paid' && String(c.inter?.dataSituacao || c.due || '').slice(0, 7) === mesAtual).reduce((acc, c) => acc + Number(c.inter?.valorTotalRecebido || c.value || 0), 0);
  const pending = cobrancas.filter(c => c.status === 'pending').reduce((acc, c) => acc + Number(c.value || 0), 0);
  const overdue = cobrancas.filter(c => c.status === 'overdue').reduce((acc, c) => acc + Number(c.value || 0), 0);
  const nfseIssued = nfses.filter(n => n.status !== 'canceled' && String(n.issueDate || '').slice(0, 7) === mesAtual).length;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3.5">
        <KpiCard 
          title="Recebido (mês)" 
          value={`R$ ${received.toLocaleString('pt-BR', {minimumFractionDigits:2})}`} 
          icon={TrendingUp} 
          color="green" 
          delta="0% vs mês anterior" 
          deltaType="neutral" 
          progress={0} 
        />
        <KpiCard 
          title="A Receber" 
          value={`R$ ${pending.toLocaleString('pt-BR', {minimumFractionDigits:2})}`} 
          icon={Clock} 
          color="amber" 
          delta={`${cobrancas.filter(c => c.status === 'pending').length} cobranças pendentes`} 
          deltaType="neutral" 
          progress={0} 
        />
        <KpiCard 
          title="Inadimplente" 
          value={`R$ ${overdue.toLocaleString('pt-BR', {minimumFractionDigits:2})}`} 
          icon={AlertCircle} 
          color="red" 
          delta={`${cobrancas.filter(c => c.status === 'overdue').length} clientes em atraso`} 
          deltaType="neutral" 
        />
        <KpiCard 
          title="NFS-e Emitidas" 
          value={nfseIssued.toString()} 
          icon={Receipt} 
          color="blue" 
          delta={`Mês atual · ${cobrancas.filter(c => c.emitirNfseAoPagar && !c.nfse).length} aguardando pagamento`} 
          deltaType="neutral" 
        />
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-4.5">
        {/* Table */}
        <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 px-5 border-b border-brand-border flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-bold text-brand-text">Cobranças Recentes</h2>
              <div className="text-[12px] text-brand-muted mt-0.5">Últimas movimentações</div>
            </div>
            <div className="flex gap-1 bg-brand-surface2 rounded-lg p-1">
              {['all', 'paid', 'pending', 'overdue', 'canceled'].map(f => (
                <button 
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${filter === f ? 'bg-brand-surface text-brand-green shadow-sm' : 'text-brand-muted hover:text-brand-text'}`}
                >
                  {f === 'all' ? 'Todas' : f === 'paid' ? 'Pagas' : f === 'pending' ? 'Pendentes' : f === 'overdue' ? 'Em atraso' : 'Canceladas'}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface">Cliente</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface">Valor</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface">Vencimento</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface">Status</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface">Boleto</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-brand-dim uppercase tracking-wide border-b border-brand-border bg-brand-surface">NFS-e</th>
                  <th className="px-4 py-2.5 border-b border-brand-border bg-brand-surface w-[100px]"></th>
                </tr>
              </thead>
              <tbody>
                {cobrancas.filter(c => filter === 'all' || c.status === filter).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-brand-muted">
                      Nenhuma cobrança encontrada.
                    </td>
                  </tr>
                ) : cobrancas.filter(c => filter === 'all' || c.status === filter).map((c) => {
                  const client = clients.find(cl => cl.id === c.client || cl.name === c.clientName) || { name: c.clientName || 'Cliente', init: (c.clientName || '?').charAt(0), color: '#666' };
                  return (
                    <tr key={c.id} className="hover:bg-brand-surface2 group border-b border-white/5 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-black shrink-0" style={{ backgroundColor: client.color }}>
                            {client.init}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-brand-text">{client.name}</div>
                            <div className="font-mono text-[12.5px] text-brand-muted">{c.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] font-medium">R$ {Number(c.value || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                      <td className="px-4 py-3 text-[13px] text-brand-muted">{String(c.due || '').split('-').reverse().join('/')}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        {c.boleto ? <span className="text-brand-green">✓ Gerado</span> : <span className="text-brand-dim">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] font-medium">
                        {c.nfse ? <span className="text-brand-green">✓ Emitida</span> : 
                         <span className="text-brand-dim">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="w-7 h-7 rounded-md border border-brand-border flex items-center justify-center text-brand-muted hover:bg-brand-surface3 hover:text-brand-text hover:border-brand-border-green transition-colors" title="Ver detalhes">
                            <Eye size={13} strokeWidth={2.5} />
                          </button>
                          <button onClick={() => !c.nfse && setEmitirNfse(c)} disabled={!!c.nfse} className="w-7 h-7 rounded-md border border-brand-border flex items-center justify-center text-brand-muted hover:bg-brand-surface3 hover:text-brand-text hover:border-brand-border-green transition-colors disabled:opacity-40" title={c.nfse ? 'NFS-e já emitida' : 'Emitir NFS-e'}>
                            <Receipt size={13} strokeWidth={2.5} />
                          </button>
                          <button 
                            onClick={() => handleSendEmail(c)}
                            disabled={sendingEmail === c.id}
                            className={`w-7 h-7 rounded-md border border-brand-border flex items-center justify-center transition-colors ${sendingEmail === c.id ? 'bg-brand-surface3 text-brand-green border-brand-green' : 'text-brand-muted hover:bg-brand-surface3 hover:text-brand-text hover:border-brand-border-green'}`} 
                            title="Enviar e-mail">
                            {sendingEmail === c.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} strokeWidth={2.5} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Stack */}
        <div className="flex flex-col gap-4">
          {/* Banco Inter */}
          <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
            <div className="p-3.5 px-4 border-b border-brand-border flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FF8C00] text-white flex items-center justify-center font-bold text-sm">i</div>
              <div>
                <div className="text-[13px] font-bold text-brand-text">Banco Inter</div>
                <div className="text-[11px] text-brand-muted mt-0.5">API PJ · OAuth2 + mTLS</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-brand-dim">
                {sysSettings?.interConfigured ? (
                  <><div className="w-1.5 h-1.5 rounded-full bg-brand-green" /> Conectado</>
                ) : (
                  <><div className="w-1.5 h-1.5 rounded-full bg-brand-dim" /> Desconectado</>
                )}
              </div>
            </div>
            <div className="p-3.5 px-4 text-[12.5px]">
              <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-brand-muted">Credenciais</span><span className="text-brand-text font-medium">{sysSettings?.interClientId ? 'Configuradas' : 'Não configuradas'}</span></div>
              <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-brand-muted">Certificado API</span><span className="text-brand-text font-medium">{sysSettings?.interHasCert ? 'Instalado' : 'Não instalado'}</span></div>
              <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-brand-muted">Cobranças com boleto</span><span className="text-brand-text font-medium">{cobrancas.filter(c => c.inter?.codigoSolicitacao).length}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-brand-muted">Saídas (pagamentos/Pix)</span><span className="text-brand-dim font-medium">{sysSettings?.interPermitirSaidas ? 'Permitidas' : 'Bloqueadas'}</span></div>
            </div>
          </div>

          {/* WebISS */}
          <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
            <div className="p-3.5 px-4 border-b border-brand-border flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-green text-black flex items-center justify-center font-bold text-[11px] tracking-tighter">NFS</div>
              <div>
                <div className="text-[13px] font-bold text-brand-text">NFS-e {sysSettings?.nfse?.provedor === 'webiss' ? 'WebISS' : 'Nacional'}</div>
                <div className="text-[11px] text-brand-muted mt-0.5">{sysSettings?.nfse?.provedor === 'webiss' ? 'ABRASF · SOAP/XML' : `Sefin Nacional · DPS v1.01 · ${sysSettings?.nfse?.ambiente === '2' ? 'produção restrita' : 'produção'}`}</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-brand-dim">
                {sysSettings?.hasCertificate ? (
                  <><div className="w-1.5 h-1.5 rounded-full bg-brand-green" /> Operante</>
                ) : (
                  <><div className="w-1.5 h-1.5 rounded-full bg-brand-dim" /> Não configurado</>
                )}
              </div>
            </div>
            <div className="p-3.5 px-4 text-[12.5px]">
              <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-brand-muted">Município</span><span className="text-brand-text font-medium">{sysSettings?.codigoMunicipio || '2929305'}</span></div>
              <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-brand-muted">CNPJ Prestador</span><span className="text-brand-text font-medium font-mono">{sysSettings?.prestadorCnpj || 'Configurado'}</span></div>
              <div className="flex justify-between py-1.5 border-b border-white/5"><span className="text-brand-muted">Cert. ICP-Brasil</span><span className="text-brand-dim font-medium">{sysSettings?.hasCertificate ? 'Instalado' : 'Não instalado'}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-brand-muted">Próxima DPS</span><span className="text-brand-text font-medium font-mono">{sysSettings?.nfse ? `série ${sysSettings.nfse.serie} nº ${sysSettings.nfse.proximoNumero}` : '—'}</span></div>
            </div>
            <div className="p-3 px-4 pb-4 bg-brand-surface2/30">
              <div className="text-[11px] font-semibold text-brand-muted uppercase tracking-wide mb-2.5">Fluxo automático pagamento → NFS-e</div>
              <div className="flex flex-col gap-0.5">
                <FlowStep num="1" text="Boleto com Pix emitido (Inter Cobrança v3)" state="done" />
                <div className="w-px h-2 bg-brand-border ml-[10px]" />
                <FlowStep num="2" text="Pagamento confirmado (webhook ou extrato)" state="done" />
                <div className="w-px h-2 bg-brand-border ml-[10px]" />
                <FlowStep num="3" text="DPS assinada enviada à Sefin Nacional" state="active" />
                <div className="w-px h-2 bg-brand-border ml-[10px]" />
                <FlowStep num="4" text="NFS-e autorizada, DANFSe e e-mail" state="next" />
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
            <div className="text-[11px] font-semibold text-brand-muted uppercase tracking-wide mb-3">Recebimentos — últimos 6 meses</div>
            <div className="flex items-end gap-1.5 h-[60px]">
              {barData.map((b, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full group">
                  <div 
                    className={`w-full rounded-t-sm transition-all relative ${i === 5 ? 'bg-brand-green border border-brand-green' : 'bg-brand-surface3 border border-brand-border'}`}
                    style={{ height: `${b.pct}%` }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-brand-text bg-brand-surface3 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
                      R$ {(b.val/1000).toFixed(1)}k
                    </div>
                  </div>
                  <span className="text-[9px] text-brand-dim">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {emitirNfse && (
        <NfseEmitirModal
          token={token}
          titulo="Emitir NFS-e da cobrança"
          inicial={{ clienteId: emitirNfse.client, cliente: emitirNfse.clientName, valor: Number(emitirNfse.inter?.valorTotalRecebido) || emitirNfse.value, competencia: String(emitirNfse.due || '').slice(0, 7) }}
          origem={{ tipo: 'cobranca', cobrancaId: emitirNfse.id, codigoSolicitacao: emitirNfse.inter?.codigoSolicitacao }}
          onClose={() => setEmitirNfse(null)}
        />
      )}

      {/* Activity Log */}
      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden mt-2">
        <div className="p-4 px-5 border-b border-brand-border">
          <h2 className="text-[14px] font-bold text-brand-text">Log de Atividades</h2>
          <div className="text-[12px] text-brand-muted mt-0.5">Ações automáticas do sistema</div>
        </div>
        <div>
          {activities.length === 0 ? (
            <div className="p-6 text-center text-brand-muted text-[13px]">Nenhuma atividade recente.</div>
          ) : activities.map((a, i) => (
            <div key={i} className="flex gap-2.5 p-2.5 px-3.5 border-b border-white/5 last:border-0 hover:bg-brand-surface2/50 transition-colors">
              <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: a.color }} />
              <div>
                <div className="text-[12.5px] text-brand-muted leading-relaxed" dangerouslySetInnerHTML={{ __html: a.text }} />
                <div className="text-[11px] text-brand-dim mt-0.5">{a.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color, delta, deltaType, progress }: any) {
  const colorMap: Record<string, string> = {
    green: 'var(--color-brand-green)',
    amber: '#f59e0b',
    red: '#ef4444',
    blue: '#3b82f6'
  };
  const bgMap: Record<string, string> = {
    green: 'rgba(16,185,129,0.1)',
    amber: 'rgba(245,158,11,0.1)',
    red: 'rgba(239,68,68,0.1)',
    blue: 'rgba(59,130,246,0.1)'
  };
  const deltaColor = deltaType === 'up' ? 'text-brand-green' : deltaType === 'down' ? 'text-red-500' : 'text-brand-muted';
  
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4.5 relative overflow-hidden hover:border-brand-border-green transition-colors group">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: colorMap[color] }} />
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[12px] font-medium text-brand-muted uppercase tracking-wide">{title}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: bgMap[color] }}>
          <Icon size={16} strokeWidth={2} style={{ color: colorMap[color] }} />
        </div>
      </div>
      <div className="text-[26px] font-bold text-brand-text tracking-tight leading-none mb-1.5 font-mono">{value}</div>
      <div className={`text-[12px] flex items-center gap-1 ${deltaColor}`}>
        {deltaType === 'up' && <TrendingUp size={12} strokeWidth={3} />}
        {deltaType === 'down' && <TrendingDown size={12} strokeWidth={3} />}
        {delta}
      </div>
      {progress !== undefined && (
        <div className="h-1 bg-brand-surface3 rounded-full mt-2.5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: colorMap[color] }} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, any> = {
    paid: { label: 'Pago', bg: 'rgba(16,185,129,0.12)', color: 'var(--color-brand-green)' },
    pending: { label: 'Pendente', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
    overdue: { label: 'Em atraso', bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
    canceled: { label: 'Cancelado', bg: 'rgba(125,133,144,0.12)', color: 'var(--color-brand-muted)' },
    draft: { label: 'Rascunho', bg: 'rgba(125,133,144,0.12)', color: 'var(--color-brand-muted)' }
  };
  const s = map[status] || { label: STATUS_COBRANCA[status]?.label || status, bg: 'rgba(125,133,144,0.12)', color: 'var(--color-brand-muted)' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }} />
      {s.label}
    </span>
  );
}

function FlowStep({ num, text, state }: { num: string, text: string, state: string }) {
  const stateMap: Record<string, any> = {
    done: { numBg: 'bg-brand-green', numColor: 'text-black', textColor: 'text-brand-muted', border: '' },
    active: { numBg: 'bg-amber-500', numColor: 'text-black', textColor: 'text-amber-500', border: '' },
    next: { numBg: 'bg-brand-surface3', numColor: 'text-brand-dim', textColor: 'text-brand-dim', border: 'border border-brand-border' }
  };
  const s = stateMap[state];
  return (
    <div className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-brand-surface2 transition-colors">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${s.numBg} ${s.numColor} ${s.border}`}>
        {num}
      </div>
      <div className={`text-[12.5px] font-medium ${s.textColor}`}>{text}</div>
    </div>
  );
}
