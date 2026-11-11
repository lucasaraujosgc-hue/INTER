import React, { useState } from 'react';
import { RefreshCw, Plus, Download, FileDown, Ban, Pencil, Eye, CheckCircle2, Undo2, Receipt } from 'lucide-react';
import { apiFetch, brl, fmtDate, fmtDoc, isoDate, openBlob } from '../../lib/api';
import { Card, Btn, Badge, DataTable, Field, Input, Select, Alert, IconBtn, useLoader, Modal, CopyBtn, JsonView } from '../ui';
import { SITUACAO_LABEL } from './InterVisaoGeral';
import NovaCobrancaModal from '../NovaCobrancaModal';
import MarcarPagoModal, { BoletoParaBaixa } from '../MarcarPagoModal';
import NfseEmitirModal from '../NfseEmitirModal';

export default function InterCobrancas({ token }: { token: string }) {
  const [f, setF] = useState({ dataInicial: isoDate(-90), dataFinal: isoDate(60), filtrarDataPor: 'VENCIMENTO', situacao: '', pessoaPagadora: '', cpfCnpjPessoaPagadora: '', seuNumero: '' });
  const [pagina, setPagina] = useState(0);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [nova, setNova] = useState(false);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [editar, setEditar] = useState<any>(null);
  const [cancelar, setCancelar] = useState<any>(null);
  const [importar, setImportar] = useState(false);
  const [marcarPago, setMarcarPago] = useState<BoletoParaBaixa | null>(null);
  const [emitirNfse, setEmitirNfse] = useState<any>(null);

  const desfazerBaixa = async (r: any) => {
    const aviso = r.baixaManual?.canceladoNoInter
      ? 'Remover a marcação de pago? O boleto continua cancelado no Inter (isso não volta atrás).'
      : 'Remover a marcação de pago deste boleto?';
    if (!confirm(aviso)) return;
    try {
      await apiFetch(token, `/api/inter/cobrancas/${r.cobranca.codigoSolicitacao}/marcar-pago`, { method: 'DELETE' });
      setMsg({ type: 'success', text: 'Marcação de pagamento removida.' });
      lista.reload();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const lista = useLoader(() => apiFetch<any>(token, '/api/inter/cobrancas', {
    query: { ...f, 'paginacao.paginaAtual': pagina, 'paginacao.itensPorPagina': 50, ordenarPor: 'DATA_VENCIMENTO', tipoOrdenacao: 'DESC' },
  }), [token, pagina], { cobrancas: [] });

  const ver = async (codigo: string) => {
    try { setDetalhe(await apiFetch(token, `/api/inter/cobrancas/${codigo}`)); } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const total = lista.data?.totalElementos ?? lista.data?.cobrancas?.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {lista.error && <Alert type="error">{lista.error}</Alert>}
      <Card
        title="Cobranças no Banco Inter"
        subtitle={`${total} cobrança(s) encontradas`}
        actions={<>
          <Btn icon={<Download size={14} />} onClick={() => setImportar(true)}>Importar para o sistema</Btn>
          <Btn variant="primary" icon={<Plus size={14} />} onClick={() => setNova(true)}>Nova cobrança</Btn>
        </>}
      >
        <div className="p-4 border-b border-brand-border grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 items-end">
          <Field label="De"><Input type="date" value={f.dataInicial} onChange={e => setF({ ...f, dataInicial: e.target.value })} /></Field>
          <Field label="Até"><Input type="date" value={f.dataFinal} onChange={e => setF({ ...f, dataFinal: e.target.value })} /></Field>
          <Field label="Filtrar por"><Select value={f.filtrarDataPor} onChange={e => setF({ ...f, filtrarDataPor: e.target.value })} options={[{ value: 'VENCIMENTO', label: 'Vencimento' }, { value: 'EMISSAO', label: 'Emissão' }, { value: 'PAGAMENTO', label: 'Pagamento' }]} /></Field>
          <Field label="Situação"><Select value={f.situacao} onChange={e => setF({ ...f, situacao: e.target.value })} options={[{ value: '', label: 'Todas' }, ...Object.entries(SITUACAO_LABEL).map(([v, s]) => ({ value: v, label: s.label }))]} /></Field>
          <Field label="Pagador"><Input value={f.pessoaPagadora} onChange={e => setF({ ...f, pessoaPagadora: e.target.value })} /></Field>
          <Field label="CPF/CNPJ"><Input value={f.cpfCnpjPessoaPagadora} onChange={e => setF({ ...f, cpfCnpjPessoaPagadora: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Seu número"><Input value={f.seuNumero} onChange={e => setF({ ...f, seuNumero: e.target.value })} /></Field>
          <Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={() => { setPagina(0); lista.reload(); }}>Buscar</Btn>
        </div>
        <DataTable
          loading={lista.loading}
          rows={lista.data?.cobrancas || []}
          rowKey={(r: any) => r.cobranca.codigoSolicitacao}
          columns={[
            {
              key: 'pagador', label: 'Pagador', render: (r: any) => (
                <div className="min-w-[180px]"><div className="font-medium">{r.cobranca.pagador?.nome}</div><div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(r.cobranca.pagador?.cpfCnpj)} · {r.cobranca.seuNumero}</div></div>
              ),
            },
            { key: 'emissao', label: 'Emissão', render: (r: any) => <span className="text-brand-muted">{fmtDate(r.cobranca.dataEmissao)}</span> },
            { key: 'venc', label: 'Vencimento', render: (r: any) => fmtDate(r.cobranca.dataVencimento) },
            { key: 'valor', label: 'Valor', align: 'right', render: (r: any) => <div className="font-mono"><div>{brl(r.cobranca.valorNominal)}</div>{Number(r.cobranca.valorTotalRecebido) > 0 && <div className="text-[11px] text-brand-green">recebido {brl(r.cobranca.valorTotalRecebido)}</div>}</div> },
            {
              key: 'sit', label: 'Situação', render: (r: any) => r.baixaManual ? (
                <div className="flex flex-col gap-1">
                  <Badge color="green">Pago por fora</Badge>
                  <span className="text-[11px] text-brand-muted">{r.baixaManual.forma} · {fmtDate(r.baixaManual.dataPagamento)}{r.baixaManual.canceladoNoInter ? ' · baixado no Inter' : ''}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1"><Badge color={SITUACAO_LABEL[r.cobranca.situacao]?.color || 'gray'}>{SITUACAO_LABEL[r.cobranca.situacao]?.label || r.cobranca.situacao}</Badge>{r.cobranca.origemRecebimento && <span className="text-[11px] text-brand-muted">via {r.cobranca.origemRecebimento}</span>}</div>
              ),
            },
            {
              key: 'nfse', label: 'NFS-e', render: (r: any) => r.local?.nfse
                ? <Badge color={r.local.nfse.status === 'canceled' ? 'gray' : 'green'}>{r.local.nfse.numero ? `Nº ${r.local.nfse.numero}` : 'Emitida'}</Badge>
                : r.local?.nfseErro ? <span className="text-[12px] text-red-600" title={r.local.nfseErro.erro}>Erro na emissão</span>
                : r.local?.emitirNfseAoPagar ? <Badge color="blue">Ao receber</Badge>
                : <span className="text-brand-dim">—</span>,
            },
            {
              key: 'copiar', label: 'Pagamento', render: (r: any) => (
                <div className="flex flex-col gap-1">
                  {r.boleto?.linhaDigitavel && <CopyBtn text={r.boleto.linhaDigitavel} label="Linha digitável" />}
                  {r.pix?.pixCopiaECola && <CopyBtn text={r.pix.pixCopiaECola} label="Pix copia e cola" />}
                </div>
              ),
            },
            {
              key: 'acoes', label: '', align: 'right', render: (r: any) => {
                const aberta = ['A_RECEBER', 'ATRASADO'].includes(r.cobranca.situacao) && !r.baixaManual;
                const paga = !!r.baixaManual || ['RECEBIDO', 'MARCADO_RECEBIDO'].includes(r.cobranca.situacao);
                const boleto: BoletoParaBaixa = { codigo: r.cobranca.codigoSolicitacao, pagador: r.cobranca.pagador?.nome, valor: Number(r.cobranca.valorNominal), vencimento: r.cobranca.dataVencimento, situacao: r.cobranca.situacao };
                return (
                  <div className="flex gap-1 justify-end items-center">
                    {r.cobranca.situacao === 'ATRASADO' && !r.baixaManual && (
                      <Btn variant="primary" className="!py-1 !px-2.5 !text-[12px] whitespace-nowrap" icon={<CheckCircle2 size={13} />} onClick={() => setMarcarPago(boleto)}>Marcar pago</Btn>
                    )}
                    {r.cobranca.situacao === 'A_RECEBER' && !r.baixaManual && <IconBtn title="Marcar como pago (pago por fora do boleto)" onClick={() => setMarcarPago(boleto)}><CheckCircle2 size={13} /></IconBtn>}
                    {r.baixaManual && <IconBtn title="Desfazer marcação de pago" onClick={() => desfazerBaixa(r)}><Undo2 size={13} /></IconBtn>}
                    {paga && !r.local?.nfse && <IconBtn title="Emitir NFS-e" onClick={() => setEmitirNfse(r)}><Receipt size={13} /></IconBtn>}
                    <IconBtn title="Detalhes" onClick={() => ver(r.cobranca.codigoSolicitacao)}><Eye size={13} /></IconBtn>
                    <IconBtn title="PDF do boleto" onClick={() => openBlob(token, `/api/inter/cobrancas/${r.cobranca.codigoSolicitacao}/pdf`).catch(e => setMsg({ type: 'error', text: e.message }))}><FileDown size={13} /></IconBtn>
                    {aberta && <IconBtn title="Alterar vencimento/valor" onClick={() => setEditar(r)}><Pencil size={13} /></IconBtn>}
                    {aberta && <IconBtn danger title="Cancelar cobrança" onClick={() => setCancelar(r)}><Ban size={13} /></IconBtn>}
                  </div>
                );
              },
            },
          ]}
        />
        {(lista.data?.totalPaginas || 1) > 1 && (
          <div className="p-3 flex justify-end gap-2 border-t border-brand-border">
            <Btn disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>Anterior</Btn>
            <span className="text-[12px] text-brand-muted self-center">Página {pagina + 1} de {lista.data.totalPaginas}</span>
            <Btn disabled={pagina + 1 >= lista.data.totalPaginas} onClick={() => setPagina(p => p + 1)}>Próxima</Btn>
          </div>
        )}
      </Card>

      {marcarPago && <MarcarPagoModal token={token} boleto={marcarPago} onClose={() => setMarcarPago(null)} onDone={t => { setMsg({ type: 'success', text: t }); lista.reload(); }} />}
      {emitirNfse && (
        <NfseEmitirModal
          token={token}
          titulo="Emitir NFS-e do boleto"
          inicial={{
            clienteId: emitirNfse.cliente?.id,
            valor: Number(emitirNfse.baixaManual?.valor || emitirNfse.cobranca.valorTotalRecebido || emitirNfse.cobranca.valorNominal),
            competencia: String(emitirNfse.baixaManual?.dataPagamento || emitirNfse.cobranca.dataSituacao || emitirNfse.cobranca.dataVencimento || '').slice(0, 7),
            pagador: { nome: emitirNfse.cobranca.pagador?.nome, cpfCnpj: emitirNfse.cobranca.pagador?.cpfCnpj },
          }}
          origem={emitirNfse.local ? { tipo: 'cobranca', cobrancaId: emitirNfse.local.id, codigoSolicitacao: emitirNfse.cobranca.codigoSolicitacao } : { tipo: 'cobranca', codigoSolicitacao: emitirNfse.cobranca.codigoSolicitacao }}
          onClose={() => setEmitirNfse(null)}
          onSuccess={() => lista.reload()}
        />
      )}
      {nova && <NovaCobrancaModal token={token} onClose={() => setNova(false)} onSuccess={lista.reload} />}
      {detalhe && (
        <Modal title="Detalhes da cobrança" subtitle={detalhe.cobranca?.codigoSolicitacao} onClose={() => setDetalhe(null)}>
          <JsonView data={detalhe} maxHeight="max-h-[60vh]" />
        </Modal>
      )}
      {editar && <EditarModal token={token} r={editar} onClose={() => setEditar(null)} onDone={(t) => { setMsg({ type: 'success', text: t }); lista.reload(); }} />}
      {cancelar && <CancelarModal token={token} r={cancelar} onClose={() => setCancelar(null)} onDone={(t) => { setMsg({ type: 'success', text: t }); lista.reload(); }} />}
      {importar && <ImportarModal token={token} onClose={() => setImportar(false)} onDone={(t) => setMsg({ type: 'success', text: t })} />}
    </div>
  );
}

function EditarModal({ token, r, onClose, onDone }: { token: string; r: any; onClose: () => void; onDone: (t: string) => void }) {
  const [venc, setVenc] = useState(r.cobranca.dataVencimento);
  const [valor, setValor] = useState(Number(r.cobranca.valorNominal));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const salvar = async () => {
    setLoading(true); setErr('');
    try {
      await apiFetch(token, `/api/inter/cobrancas/${r.cobranca.codigoSolicitacao}`, { method: 'PATCH', body: { dataVencimento: venc, valorNominal: valor } });
      onDone('Alteração enviada ao Inter (processamento assíncrono).');
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal title="Alterar cobrança" subtitle={r.cobranca.pagador?.nome} onClose={onClose} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>Fechar</Btn><Btn variant="primary" loading={loading} onClick={salvar}>Salvar</Btn></>}>
      {err && <Alert type="error">{err}</Alert>}
      <Field label="Novo vencimento"><Input type="date" value={venc} onChange={e => setVenc(e.target.value)} /></Field>
      <Field label="Novo valor (R$)"><Input type="number" step="0.01" value={valor} onChange={e => setValor(Number(e.target.value))} /></Field>
    </Modal>
  );
}

function CancelarModal({ token, r, onClose, onDone }: { token: string; r: any; onClose: () => void; onDone: (t: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setLoading(true); setErr('');
    try {
      await apiFetch(token, `/api/inter/cobrancas/${r.cobranca.codigoSolicitacao}/cancelar`, { method: 'POST', body: { motivoCancelamento: motivo } });
      onDone('Cobrança cancelada no Inter.');
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal title="Cancelar cobrança" subtitle={`${r.cobranca.pagador?.nome} · ${brl(r.cobranca.valorNominal)}`} onClose={onClose} width="max-w-md"
      footer={<><Btn variant="ghost" onClick={onClose}>Voltar</Btn><Btn variant="danger" loading={loading} disabled={!motivo.trim()} onClick={go}>Cancelar cobrança</Btn></>}>
      {err && <Alert type="error">{err}</Alert>}
      <Alert type="warn">O boleto e o QR Code Pix deixam de aceitar pagamento. Esta ação não pode ser desfeita.</Alert>
      <Field label="Motivo (até 50 caracteres)"><Input maxLength={50} value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>
    </Modal>
  );
}

export function ImportarModal({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: (t: string) => void }) {
  const [p, setP] = useState({ dataInicial: isoDate(-365), dataFinal: isoDate(60), filtrarDataPor: 'EMISSAO', criarClientes: true });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setLoading(true); setErr('');
    try {
      const r = await apiFetch<any>(token, '/api/inter/cobrancas/importar', { method: 'POST', body: p });
      onDone(`Importação concluída: ${r.total} cobranças (${r.importadas} novas, ${r.atualizadas} atualizadas, ${r.clientesCriados} clientes cadastrados).`);
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <Modal title="Importar cobranças do Inter" subtitle="Traz as cobranças já emitidas no banco para a lista de Cobranças do sistema" onClose={onClose} width="max-w-lg"
      footer={<><Btn variant="ghost" onClick={onClose}>Fechar</Btn><Btn variant="primary" loading={loading} onClick={go}>Importar</Btn></>}>
      {err && <Alert type="error">{err}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="De"><Input type="date" value={p.dataInicial} onChange={e => setP({ ...p, dataInicial: e.target.value })} /></Field>
        <Field label="Até"><Input type="date" value={p.dataFinal} onChange={e => setP({ ...p, dataFinal: e.target.value })} /></Field>
        <Field label="Período por" className="col-span-2"><Select value={p.filtrarDataPor} onChange={e => setP({ ...p, filtrarDataPor: e.target.value })} options={[{ value: 'EMISSAO', label: 'Data de emissão' }, { value: 'VENCIMENTO', label: 'Data de vencimento' }, { value: 'PAGAMENTO', label: 'Data de pagamento' }]} /></Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] cursor-pointer">
        <input type="checkbox" className="accent-brand-green w-4 h-4" checked={p.criarClientes} onChange={e => setP({ ...p, criarClientes: e.target.checked })} />
        Cadastrar automaticamente os pagadores que ainda não são clientes
      </label>
      <div className="text-[12px] text-brand-muted">Cobranças já importadas são apenas atualizadas (situação, valor recebido, linha digitável e Pix).</div>
    </Modal>
  );
}
