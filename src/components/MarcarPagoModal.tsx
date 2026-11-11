import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { apiFetch, brl, fmtDate, isoDate } from '../lib/api';
import { Modal, Btn, Alert, Field, Input, Select } from './ui';

export interface BoletoParaBaixa {
  codigo: string;
  pagador: string;
  valor: number;
  vencimento?: string;
  situacao?: string;
}

/**
 * Marca como pago um boleto que o cliente quitou por fora (Pix direto na conta, transferência…).
 * Opcionalmente baixa (cancela) o boleto no Inter para não ser pago de novo nem ir a protesto.
 */
export default function MarcarPagoModal({ token, boleto, onClose, onDone }: {
  token: string;
  boleto: BoletoParaBaixa;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [dataPagamento, setDataPagamento] = useState(isoDate());
  const [valor, setValor] = useState<number>(boleto.valor);
  const [forma, setForma] = useState('Pix direto na conta');
  const [observacao, setObservacao] = useState('');
  // Desmarcado por padrão: cancelar o boleto no Inter não tem volta.
  const [baixarNoInter, setBaixarNoInter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const aberto = ['A_RECEBER', 'ATRASADO'].includes(String(boleto.situacao));

  const salvar = async () => {
    setLoading(true); setErr('');
    try {
      const r = await apiFetch<any>(token, `/api/inter/cobrancas/${encodeURIComponent(boleto.codigo)}/marcar-pago`, {
        method: 'POST',
        body: { dataPagamento, valor, forma, observacao, baixarNoInter: aberto && baixarNoInter },
      });
      const partes = [`Boleto de ${boleto.pagador} marcado como pago (${forma.toLowerCase()}).`];
      if (r.baixa?.canceladoNoInter) partes.push('O boleto foi baixado no Inter e não aceita mais pagamento.');
      if (r.nfse?.success) partes.push(r.nfse.message);
      if (r.nfse && r.nfse.success === false) partes.push(`NFS-e automática não emitida: ${r.nfse.error}`);
      onDone(partes.join(' '));
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal
      title="Marcar boleto como pago"
      subtitle="Para quando o cliente pagou por fora do boleto, por exemplo com Pix direto na conta."
      onClose={onClose}
      width="max-w-lg"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" icon={<CheckCircle2 size={15} />} loading={loading} disabled={!(valor > 0) || !dataPagamento} onClick={salvar}>Marcar como pago</Btn>
      </>}
    >
      {err && <Alert type="error">{err}</Alert>}
      <div className="rounded-lg border border-brand-border bg-brand-bg p-3.5 flex items-center gap-3 text-[13px]">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-orange-dim">Boleto</div>
          <div className="font-semibold text-brand-forest truncate">{boleto.pagador}</div>
          {boleto.vencimento && <div className="text-brand-muted text-[12px]">Vencimento {fmtDate(boleto.vencimento)}</div>}
        </div>
        <div className="ml-auto font-serif text-[20px] font-semibold text-brand-forest tabular">{brl(boleto.valor)}</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Data do pagamento"><Input type="date" max={isoDate()} value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} /></Field>
        <Field label="Valor recebido (R$)"><Input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(Number(e.target.value))} /></Field>
        <Field label="Forma de pagamento" className="col-span-2">
          <Select value={forma} onChange={e => setForma(e.target.value)} options={['Pix direto na conta', 'Transferência', 'Dinheiro', 'Outro'].map(v => ({ value: v, label: v }))} />
        </Field>
        <Field label="Observação (opcional)" className="col-span-2"><Input maxLength={200} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: Pix recebido em 10/11 de Maria Souza" /></Field>
      </div>
      {aberto ? (
        <label className="flex items-start gap-2.5 text-[13px] cursor-pointer select-none rounded-lg border border-orange-200 bg-brand-orange-soft p-3">
          <input type="checkbox" className="accent-brand-orange w-4 h-4 mt-0.5" checked={baixarNoInter} onChange={e => setBaixarNoInter(e.target.checked)} />
          <span>
            <b className="text-brand-forest">Baixar o boleto no Inter</b>
            <span className="block text-brand-muted text-[12px]">
              Cancela o boleto e o QR Code no banco para o cliente não pagar duas vezes e o boleto não seguir para protesto.
              <b className="text-red-700"> Atenção: o cancelamento no Inter não pode ser desfeito</b>, nem se você tirar a marcação de pago depois.
              Sem esta opção, o pagamento fica registrado só no sistema e o boleto continua aberto no banco.
            </span>
          </span>
        </label>
      ) : (
        <Alert type="info">{boleto.situacao === 'CANCELADO' ? 'Este boleto está cancelado no Inter.' : 'Este boleto não está em aberto no Inter.'} O pagamento será registrado só no sistema.</Alert>
      )}
    </Modal>
  );
}
