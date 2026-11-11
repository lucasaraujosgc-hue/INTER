import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Search, Receipt, Mail, Plus, Download, RefreshCw, FileDown, Trash2 } from 'lucide-react';
import { apiFetch, openBlob, brl, fmtDate } from '../lib/api';
import { Alert, Badge, IconBtn, CopyBtn, Btn } from './ui';
import NfseEmitirModal from './NfseEmitirModal';
import NovaCobrancaModal from './NovaCobrancaModal';
import { ImportarModal } from './inter/InterCobrancas';
import { SITUACAO_LABEL } from './inter/InterVisaoGeral';

export const STATUS_COBRANCA: Record<string, { label: string; color: any }> = {
  paid: { label: 'Pago', color: 'green' },
  pending: { label: 'Pendente', color: 'amber' },
  overdue: { label: 'Em atraso', color: 'red' },
  canceled: { label: 'Cancelado', color: 'gray' },
  draft: { label: 'Rascunho', color: 'gray' },
};

export async function enviarEmailCobranca(token: string, c: any) {
  if (!c.clientEmail) throw new Error('Este cliente não possui e-mail cadastrado. Atualize o cadastro do cliente antes de enviar.');
  const linhas = [
    `Olá ${c.clientName ? c.clientName.split(' ')[0] : ''},`,
    '',
    `Segue a sua cobrança com vencimento em ${fmtDate(c.due)} no valor de ${brl(c.value)}.`,
  ];
  if (c.boleto?.linhaDigitavel) linhas.push('', `Linha digitável: ${c.boleto.linhaDigitavel}`);
  if (c.pix?.pixCopiaECola) linhas.push('', `Pix copia e cola: ${c.pix.pixCopiaECola}`);
  linhas.push('', 'Se tiver qualquer dúvida, estamos à disposição.');
  return apiFetch<any>(token, '/api/send-email', {
    method: 'POST',
    body: {
      to: c.clientEmail,
      subject: `Cobrança - ${c.clientName || 'Cliente'} - Vírgula Contábil`,
      messageBody: linhas.join('\n'),
      documents: [
        ...(c.inter?.codigoSolicitacao ? [{ docName: 'Boleto com Pix', category: 'Boleto', cobrancaId: c.id, dueDate: c.due, competence: String(c.due).substring(0, 7) }] : []),
        ...(c.nfse ? [{ docName: 'Nota Fiscal', category: 'NFS-e', nfseId: c.nfse, dueDate: c.due, competence: String(c.due).substring(0, 7) }] : []),
      ],
    },
  });
}

export default function Cobrancas({ token, refreshKey }: { token: string, refreshKey?: number }) {
  const [cobrancas, setCobrancas] = useState<any[]>([]);
  const [nfses, setNfses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [nova, setNova] = useState(false);
  const [importar, setImportar] = useState(false);
  const [emitirNfse, setEmitirNfse] = useState<any>(null);

  const load = () => {
    Promise.all([apiFetch<any[]>(token, '/api/cobrancas'), apiFetch<any[]>(token, '/api/nfse')])
      .then(([c, n]) => { setCobrancas(c); setNfses(n); })
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    return cobrancas
      .filter(c => !status || c.status === status)
      .filter(c => !q || [c.clientName, c.id, c.inter?.seuNumero, c.boleto?.nossoNumero].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => String(b.due).localeCompare(String(a.due)));
  }, [cobrancas, busca, status]);

  const acao = async (id: string, fn: () => Promise<any>, ok: string) => {
    setBusy(id);
    try { await fn(); setMsg({ type: 'success', text: ok }); load(); } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(''); }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-green" /></div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-[22px] font-semibold text-brand-forest font-serif tracking-[-0.01em]">Gerenciamento de Cobranças</h2>
        <div className="flex gap-2">
          <Btn icon={<Download size={15} />} onClick={() => setImportar(true)}>Importar do Inter</Btn>
          <Btn variant="primary" icon={<Plus size={15} />} onClick={() => setNova(true)}>Nova cobrança</Btn>
        </div>
      </div>
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div className="bg-brand-surface border border-brand-border rounded-xl shadow-brand overflow-hidden">
        <div className="p-4 border-b border-brand-border flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dim" size={16} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por cliente, seu número ou nosso número..." className="w-full bg-white border border-brand-border2 rounded-md py-2 pl-10 pr-4 text-[13px] text-brand-text outline-none focus:border-brand-orange" />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)} className="bg-white border border-brand-border2 rounded-md px-3 text-[13px] text-brand-text outline-none">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_COBRANCA).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                {['Cliente', 'Valor', 'Vencimento', 'Status', 'Boleto / Pix', 'NFS-e', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold text-brand-muted uppercase tracking-wide border-b border-brand-border bg-brand-surface2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-brand-muted"><FileText size={44} className="mx-auto mb-3 opacity-20" /><p>Nenhuma cobrança. Crie uma nova ou importe as cobranças do Banco Inter.</p></td></tr>
              ) : lista.map(c => {
                const nf = c.nfse ? nfses.find(n => n.id === c.nfse) : null;
                const st = STATUS_COBRANCA[c.status] || { label: c.status, color: 'gray' };
                const codigo = c.inter?.codigoSolicitacao;
                return (
                  <tr key={c.id} className="border-b border-brand-border last:border-0 hover:bg-brand-surface2 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-brand-text">{c.clientName}</div>
                      <div className="text-[11px] text-brand-muted font-mono">{c.inter?.seuNumero || c.id}{c.origem === 'inter' ? ' · importada' : ''}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-sm">
                      <div>{brl(c.value)}</div>
                      {Number(c.inter?.valorTotalRecebido) > 0 && <div className="text-[11px] text-brand-green">recebido {brl(c.inter.valorTotalRecebido)}</div>}
                    </td>
                    <td className="px-5 py-3 text-brand-muted text-sm">{fmtDate(c.due)}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge color={st.color}>{st.label}</Badge>
                        {c.inter?.situacao && <span className="text-[10.5px] text-brand-dim">Inter: {SITUACAO_LABEL[c.inter.situacao]?.label || c.inter.situacao}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-1">
                        {c.boleto?.linhaDigitavel && <CopyBtn text={c.boleto.linhaDigitavel} label="Linha digitável" />}
                        {c.pix?.pixCopiaECola && <CopyBtn text={c.pix.pixCopiaECola} label="Pix copia e cola" />}
                        {!c.boleto?.linhaDigitavel && !c.pix?.pixCopiaECola && <span className="text-brand-dim text-[12px]">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[12.5px]">
                      {nf ? <Badge color={nf.status === 'canceled' ? 'gray' : 'green'}>{nf.numero ? `Nº ${nf.numero}` : 'Emitida'}</Badge>
                        : c.nfseErro ? <span className="text-red-600" title={c.nfseErro.erro}>Erro na emissão</span>
                        : c.emitirNfseAoPagar ? <Badge color="blue">Ao receber</Badge>
                        : <span className="text-brand-dim">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end">
                        {codigo && <IconBtn title="Atualizar com o Inter" disabled={busy === c.id} onClick={() => acao(c.id, () => apiFetch(token, `/api/inter/cobrancas/${codigo}/sincronizar`, { method: 'POST' }), 'Cobrança atualizada.')}>{busy === c.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}</IconBtn>}
                        {codigo && <IconBtn title="PDF do boleto" onClick={() => openBlob(token, `/api/inter/cobrancas/${codigo}/pdf`).catch(e => setMsg({ type: 'error', text: e.message }))}><FileDown size={13} /></IconBtn>}
                        {nf && <IconBtn title="PDF da NFS-e" onClick={() => openBlob(token, `/api/nfse/${nf.id}/pdf`).catch(e => setMsg({ type: 'error', text: e.message }))}><Receipt size={13} /></IconBtn>}
                        {!nf && c.status !== 'canceled' && <IconBtn title="Emitir NFS-e" onClick={() => setEmitirNfse(c)}><Receipt size={13} /></IconBtn>}
                        <IconBtn title="Enviar por e-mail" disabled={busy === c.id} onClick={() => acao(c.id, () => enviarEmailCobranca(token, c), 'E-mail enviado com sucesso!')}><Mail size={13} /></IconBtn>
                        {!codigo && <IconBtn danger title="Excluir cobrança local" onClick={() => confirm('Excluir esta cobrança do sistema?') && acao(c.id, () => apiFetch(token, `/api/cobrancas/${c.id}`, { method: 'DELETE' }), 'Cobrança excluída.')}><Trash2 size={13} /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {nova && <NovaCobrancaModal token={token} onClose={() => setNova(false)} onSuccess={load} />}
      {importar && <ImportarModal token={token} onClose={() => setImportar(false)} onDone={t => { setMsg({ type: 'success', text: t }); load(); }} />}
      {emitirNfse && (
        <NfseEmitirModal
          token={token}
          titulo="Emitir NFS-e da cobrança"
          inicial={{ clienteId: emitirNfse.client, cliente: emitirNfse.clientName, valor: Number(emitirNfse.inter?.valorTotalRecebido) || emitirNfse.value, competencia: String(emitirNfse.due).slice(0, 7) }}
          origem={{ tipo: 'cobranca', cobrancaId: emitirNfse.id, codigoSolicitacao: emitirNfse.inter?.codigoSolicitacao }}
          onClose={() => setEmitirNfse(null)}
          onSuccess={async nfse => {
            await apiFetch(token, `/api/cobrancas/${emitirNfse.id}`, { method: 'PATCH', body: { nfse: nfse.id } }).catch(() => undefined);
            load();
          }}
        />
      )}
    </div>
  );
}
