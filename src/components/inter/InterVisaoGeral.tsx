import React from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch, brl, isoDate, firstDayOfMonth } from '../../lib/api';
import { Card, Stat, Btn, Alert, useLoader, Badge } from '../ui';

export const SITUACAO_LABEL: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'orange' }> = {
  RECEBIDO: { label: 'Recebido', color: 'green' },
  MARCADO_RECEBIDO: { label: 'Marcado recebido', color: 'green' },
  A_RECEBER: { label: 'A receber', color: 'amber' },
  ATRASADO: { label: 'Atrasado', color: 'red' },
  CANCELADO: { label: 'Cancelado', color: 'gray' },
  EXPIRADO: { label: 'Expirado', color: 'gray' },
  FALHA_EMISSAO: { label: 'Falha na emissão', color: 'red' },
  EM_PROCESSAMENTO: { label: 'Em processamento', color: 'blue' },
  PROTESTO: { label: 'Protesto', color: 'red' },
};

export default function InterVisaoGeral({ token, onNavigate }: { token: string; onNavigate: (tab: string) => void }) {
  const saldo = useLoader(() => apiFetch<any>(token, '/api/inter/saldo'), [token], null);
  const sumario = useLoader(
    () => apiFetch<any[]>(token, '/api/inter/cobrancas/sumario', { query: { dataInicial: firstDayOfMonth(), dataFinal: isoDate(60), filtrarDataPor: 'VENCIMENTO' } }),
    [token], [],
  );
  const entradas = useLoader(
    () => apiFetch<any[]>(token, '/api/inter/entradas', { query: { dataInicio: firstDayOfMonth(), dataFim: isoDate() } }),
    [token], [],
  );

  const semNota = entradas.data.filter(e => !e.nfse && e.marcacao?.status !== 'ignorada');
  const totalRecebidoMes = entradas.data.reduce((a, e) => a + e.valor, 0);

  return (
    <div className="flex flex-col gap-5">
      {(saldo.error || sumario.error || entradas.error) && <Alert type="error">{saldo.error || sumario.error || entradas.error}</Alert>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Saldo disponível" value={saldo.data ? brl(saldo.data.disponivel) : '—'} color="text-brand-green" sub={saldo.data?.limite ? `Limite: ${brl(saldo.data.limite)}` : undefined} />
        <Stat label="Bloqueado" value={saldo.data ? brl((saldo.data.bloqueadoCheque || 0) + (saldo.data.bloqueadoJudicialmente || 0) + (saldo.data.bloqueadoAdministrativo || 0)) : '—'} sub="Cheque, judicial e administrativo" />
        <Stat label="Entradas no mês" value={brl(totalRecebidoMes)} sub={`${entradas.data.length} créditos`} />
        <Stat label="Entradas sem NFS-e" value={semNota.length} color={semNota.length ? 'text-amber-400' : 'text-brand-text'} sub={semNota.length ? brl(semNota.reduce((a, e) => a + e.valor, 0)) : 'Tudo emitido'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Cobranças por situação" subtitle="Vencimento do início do mês até os próximos 60 dias" actions={<Btn variant="ghost" icon={<RefreshCw size={14} />} onClick={sumario.reload}>Atualizar</Btn>}>
          <div className="p-4 flex flex-col gap-2">
            {sumario.data.length === 0 && !sumario.loading && <div className="text-[13px] text-brand-muted">Sem cobranças no período.</div>}
            {sumario.data.filter(s => s.quantidade > 0).map(s => (
              <div key={s.situacao} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <Badge color={SITUACAO_LABEL[s.situacao]?.color || 'gray'}>{SITUACAO_LABEL[s.situacao]?.label || s.situacao}</Badge>
                <span className="text-[13px] text-brand-muted">{s.quantidade} · <b className="font-mono text-brand-text">{brl(s.valor)}</b></span>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4"><Btn onClick={() => onNavigate('cobrancas')}>Ver cobranças</Btn></div>
        </Card>

        <Card title="Pendências de NFS-e" subtitle="Créditos do mês ainda sem nota fiscal">
          <div className="p-4 flex flex-col gap-2">
            {semNota.slice(0, 8).map(e => (
              <div key={e.idTransacao} className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5 last:border-0 text-[13px]">
                <span className="truncate">{e.cliente?.name || e.pagador.nome || e.titulo}</span>
                <span className="font-mono shrink-0">{brl(e.valor)}</span>
              </div>
            ))}
            {semNota.length === 0 && !entradas.loading && <div className="text-[13px] text-brand-muted">Nenhuma pendência.</div>}
          </div>
          <div className="px-4 pb-4"><Btn variant="primary" onClick={() => onNavigate('entradas')}>Emitir notas das entradas</Btn></div>
        </Card>
      </div>
    </div>
  );
}
