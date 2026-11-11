import React, { useEffect, useState } from 'react';
import { LayoutDashboard, ArrowDownToLine, ScrollText, FileText, QrCode, Repeat, Send, Webhook, Settings } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Tabs, Alert } from './ui';
import InterVisaoGeral from './inter/InterVisaoGeral';
import InterEntradas from './inter/InterEntradas';
import InterExtrato from './inter/InterExtrato';
import InterCobrancas from './inter/InterCobrancas';
import InterPix from './inter/InterPix';
import InterPixAutomatico from './inter/InterPixAutomatico';
import InterPagamentos from './inter/InterPagamentos';
import InterWebhooks from './inter/InterWebhooks';
import InterConfig from './inter/InterConfig';

const TABS = [
  { id: 'visao', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'entradas', label: 'Entradas → NFS-e', icon: ArrowDownToLine },
  { id: 'extrato', label: 'Extrato e saldo', icon: ScrollText },
  { id: 'cobrancas', label: 'Boletos / Cobranças', icon: FileText },
  { id: 'pix', label: 'Pix', icon: QrCode },
  { id: 'pixauto', label: 'Pix Automático', icon: Repeat },
  { id: 'pagamentos', label: 'Pagamentos', icon: Send },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'config', label: 'Configuração', icon: Settings },
];

export default function BancoInter({ token }: { token: string }) {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('vc_inter_tab') || 'visao'; } catch { return 'visao'; }
  });
  const [status, setStatus] = useState<any>(null);

  const loadStatus = () => apiFetch(token, '/api/inter/status').then(setStatus).catch(() => setStatus(null));
  useEffect(() => { loadStatus(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (id: string) => {
    setTab(id);
    try { localStorage.setItem('vc_inter_tab', id); } catch { /* ignore */ }
  };

  const naoConfigurado = status && !status.configured && tab !== 'config';

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-brand-orange flex items-center justify-center text-white font-serif font-bold text-lg">i</div>
        <div>
          <h2 className="text-[22px] font-semibold text-brand-forest font-serif tracking-[-0.01em]">Banco Inter Empresas</h2>
          <p className="text-[12.5px] text-brand-muted">
            {status?.configured
              ? <>Conectado · {status.ambiente === 'sandbox' ? 'Sandbox' : 'Produção'}{status.cert?.validTo ? ` · certificado válido até ${new Date(status.cert.validTo).toLocaleDateString('pt-BR')}` : ''}</>
              : 'Integração não configurada'}
          </p>
        </div>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={change} />
      {naoConfigurado && (
        <Alert type="warn">Configure o Client ID, Client Secret e o certificado da aplicação na aba Configuração para usar a integração.</Alert>
      )}
      {tab === 'visao' && <InterVisaoGeral token={token} onNavigate={change} />}
      {tab === 'entradas' && <InterEntradas token={token} />}
      {tab === 'extrato' && <InterExtrato token={token} />}
      {tab === 'cobrancas' && <InterCobrancas token={token} />}
      {tab === 'pix' && <InterPix token={token} />}
      {tab === 'pixauto' && <InterPixAutomatico token={token} />}
      {tab === 'pagamentos' && <InterPagamentos token={token} permitirSaidas={!!status?.permitirSaidas} onGoConfig={() => change('config')} />}
      {tab === 'webhooks' && <InterWebhooks token={token} />}
      {tab === 'config' && <InterConfig token={token} onSaved={loadStatus} />}
    </div>
  );
}
