import React, { useRef, useState } from 'react';
import { RefreshCw, Send, Ban, Search, ShieldAlert } from 'lucide-react';
import { apiFetch, brl, fmtDate, fmtDateTime, fmtDoc, isoDate } from '../../lib/api';
import { Card, Btn, Badge, DataTable, DateRange, Field, Input, Select, Alert, IconBtn, useLoader, JsonView, JsonEditor, Tabs } from '../ui';

const SUB = [
  { id: 'boleto', label: 'Boletos, convênios e tributos' },
  { id: 'darf', label: 'DARF' },
  { id: 'pix', label: 'Pix / Transferência' },
  { id: 'lote', label: 'Pagamentos em lote' },
  { id: 'historico', label: 'Histórico do sistema' },
];

const STATUS: Record<string, any> = { REALIZADO: 'green', APROVADO: 'green', AGENDADO: 'blue', EMPROCESSAMENTO: 'amber', AGUARDANDO_APROVACAO: 'amber', CANCELADO: 'gray', AGENDADO_CANCELADO: 'gray', ERRO: 'red', REPROVADO: 'red', APROVACAO_EXPIRADA: 'red', NAO_COMPENSADO: 'red' };

type SetMsg = (m: { type: 'success' | 'error'; text: string } | null) => void;

export default function InterPagamentos({ token, permitirSaidas, onGoConfig }: { token: string; permitirSaidas: boolean; onGoConfig: () => void }) {
  const [sub, setSub] = useState('boleto');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={SUB} active={sub} onChange={setSub} />
      {!permitirSaidas && sub !== 'historico' && (
        <Alert type="warn">
          <span className="flex flex-wrap items-center gap-2"><ShieldAlert size={14} /> Operações de saída estão desativadas. As consultas funcionam normalmente; para pagar ou transferir, ative em
            <button className="underline" onClick={onGoConfig}>Configuração</button>.</span>
        </Alert>
      )}
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {sub === 'boleto' && <Boletos token={token} setMsg={setMsg} />}
      {sub === 'darf' && <Darf token={token} setMsg={setMsg} />}
      {sub === 'pix' && <PixPagamento token={token} setMsg={setMsg} />}
      {sub === 'lote' && <Lote token={token} setMsg={setMsg} />}
      {sub === 'historico' && <Historico token={token} />}
    </div>
  );
}

function Boletos({ token, setMsg }: { token: string; setMsg: SetMsg }) {
  const [inicio, setInicio] = useState(isoDate(-30));
  const [fim, setFim] = useState(isoDate(30));
  const lista = useLoader(() => apiFetch<any[]>(token, '/api/inter/pagamentos', { query: { dataInicio: inicio, dataFim: fim } }), [token], []);
  const [f, setF] = useState({ codBarraLinhaDigitavel: '', valorPagar: '', dataVencimento: isoDate(), dataPagamento: '', cpfCnpjBeneficiario: '' });
  const [loading, setLoading] = useState(false);
  const pagar = async () => {
    const codigo = f.codBarraLinhaDigitavel.replace(/\D/g, '');
    if (codigo.length < 44) { setMsg({ type: 'error', text: 'Informe o código de barras ou a linha digitável completa.' }); return; }
    if (!confirm(`Confirmar pagamento de ${brl(f.valorPagar)}${f.dataPagamento ? ` agendado para ${fmtDate(f.dataPagamento)}` : ' hoje'}?`)) return;
    setLoading(true);
    try {
      const r = await apiFetch<any>(token, '/api/inter/pagamentos/boleto', {
        method: 'POST',
        body: { codBarraLinhaDigitavel: codigo, valorPagar: Number(f.valorPagar).toFixed(2), dataVencimento: f.dataVencimento, ...(f.dataPagamento ? { dataPagamento: f.dataPagamento } : {}), ...(f.cpfCnpjBeneficiario ? { cpfCnpjBeneficiario: f.cpfCnpjBeneficiario.replace(/\D/g, '') } : {}) },
      });
      setMsg({ type: 'success', text: `Pagamento enviado: ${r.statusPagamento}${r.quantidadeAprovadores ? ` (aguarda ${r.quantidadeAprovadores} aprovação(ões) no app)` : ''}. Código: ${r.codigoTransacao}` });
      setF({ ...f, codBarraLinhaDigitavel: '', valorPagar: '' });
      lista.reload();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setLoading(false); }
  };
  const cancelar = async (p: any) => {
    if (!confirm('Cancelar este agendamento de pagamento?')) return;
    try { await apiFetch(token, `/api/inter/pagamentos/${p.codigoTransacao}`, { method: 'DELETE' }); setMsg({ type: 'success', text: 'Agendamento cancelado.' }); lista.reload(); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };
  return (
    <>
      <Card title="Pagar com código de barras" subtitle="Boletos, contas de consumo (convênios) e tributos com código de barras">
        <div className="p-5 grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <Field label="Código de barras / linha digitável" className="md:col-span-6"><Input value={f.codBarraLinhaDigitavel} onChange={e => setF({ ...f, codBarraLinhaDigitavel: e.target.value })} className="font-mono" /></Field>
          <Field label="Valor (R$)" className="md:col-span-1"><Input type="number" step="0.01" value={f.valorPagar} onChange={e => setF({ ...f, valorPagar: e.target.value })} /></Field>
          <Field label="Vencimento" className="md:col-span-1"><Input type="date" value={f.dataVencimento} onChange={e => setF({ ...f, dataVencimento: e.target.value })} /></Field>
          <Field label="Agendar para (opcional)" className="md:col-span-2"><Input type="date" value={f.dataPagamento} onChange={e => setF({ ...f, dataPagamento: e.target.value })} /></Field>
          <Field label="CPF/CNPJ beneficiário (opc.)" className="md:col-span-1"><Input value={f.cpfCnpjBeneficiario} onChange={e => setF({ ...f, cpfCnpjBeneficiario: e.target.value })} /></Field>
          <Btn variant="orange" icon={<Send size={14} />} loading={loading} onClick={pagar} className="md:col-span-1">Pagar</Btn>
        </div>
      </Card>
      <Card title="Pagamentos" actions={<Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn>}>
        <div className="p-4 border-b border-brand-border"><DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} /></div>
        {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
        <DataTable loading={lista.loading} rows={Array.isArray(lista.data) ? lista.data : []} rowKey={(p: any) => p.codigoTransacao} columns={[
          { key: 'd', label: 'Data', render: (p: any) => <span className="text-brand-muted">{fmtDate(p.dataPagamento || p.dataInclusao)}</span> },
          { key: 'b', label: 'Beneficiário', render: (p: any) => <div><div>{p.nomeBeneficiario || p.tipo}</div><div className="text-[11.5px] text-brand-muted font-mono">{fmtDoc(p.cpfCnpjBeneficiario)}</div></div> },
          { key: 'v', label: 'Vencimento', render: (p: any) => fmtDate(p.dataVencimentoTitulo || p.dataVencimentoDigitada) },
          { key: 's', label: 'Status', render: (p: any) => <Badge color={STATUS[p.statusPagamento] || 'gray'}>{p.statusPagamento}</Badge> },
          { key: 'valor', label: 'Valor', align: 'right', render: (p: any) => <span className="font-mono">{brl(p.valorPago || p.valorNominal)}</span> },
          { key: 'a', label: '', align: 'right', render: (p: any) => p.statusPagamento === 'AGENDADO' ? <IconBtn danger title="Cancelar agendamento" onClick={() => cancelar(p)}><Ban size={13} /></IconBtn> : null },
        ]} />
      </Card>
    </>
  );
}

function Darf({ token, setMsg }: { token: string; setMsg: SetMsg }) {
  const [inicio, setInicio] = useState(isoDate(-60));
  const [fim, setFim] = useState(isoDate(30));
  const lista = useLoader(() => apiFetch<any[]>(token, '/api/inter/pagamentos/darf', { query: { dataInicio: inicio, dataFim: fim } }), [token], []);
  const [f, setF] = useState({ cnpjCpf: '', nomeEmpresa: '', telefoneEmpresa: '', codigoReceita: '', periodoApuracao: '', dataVencimento: isoDate(), referencia: '', descricao: '', valorPrincipal: '', valorMulta: '', valorJuros: '' });
  const [loading, setLoading] = useState(false);
  const pagar = async () => {
    const total = Number(f.valorPrincipal || 0) + Number(f.valorMulta || 0) + Number(f.valorJuros || 0);
    if (!confirm(`Confirmar pagamento de DARF ${f.codigoReceita} no total de ${brl(total)}?`)) return;
    setLoading(true);
    try {
      const r = await apiFetch<any>(token, '/api/inter/pagamentos/darf', {
        method: 'POST',
        body: {
          cnpjCpf: f.cnpjCpf.replace(/\D/g, ''), nomeEmpresa: f.nomeEmpresa, ...(f.telefoneEmpresa ? { telefoneEmpresa: f.telefoneEmpresa.replace(/\D/g, '') } : {}),
          codigoReceita: f.codigoReceita, periodoApuracao: f.periodoApuracao, dataVencimento: f.dataVencimento, referencia: f.referencia.replace(/\D/g, ''),
          descricao: f.descricao || `DARF ${f.codigoReceita}`, valorPrincipal: Number(f.valorPrincipal),
          ...(Number(f.valorMulta) ? { valorMulta: Number(f.valorMulta) } : {}), ...(Number(f.valorJuros) ? { valorJuros: Number(f.valorJuros) } : {}),
        },
      });
      setMsg({ type: 'success', text: `DARF enviado: ${r.tipoRetorno} (${r.codigoSolicitacao}).` });
      lista.reload();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setLoading(false); }
  };
  return (
    <>
      <Card title="Pagar DARF (sem código de barras)">
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <Field label="CNPJ/CPF do contribuinte"><Input value={f.cnpjCpf} onChange={e => setF({ ...f, cnpjCpf: e.target.value })} /></Field>
          <Field label="Nome / razão social" className="md:col-span-2"><Input value={f.nomeEmpresa} onChange={e => setF({ ...f, nomeEmpresa: e.target.value })} /></Field>
          <Field label="Telefone (opc.)"><Input value={f.telefoneEmpresa} onChange={e => setF({ ...f, telefoneEmpresa: e.target.value })} /></Field>
          <Field label="Código da receita"><Input value={f.codigoReceita} onChange={e => setF({ ...f, codigoReceita: e.target.value })} /></Field>
          <Field label="Período de apuração"><Input type="date" value={f.periodoApuracao} onChange={e => setF({ ...f, periodoApuracao: e.target.value })} /></Field>
          <Field label="Vencimento"><Input type="date" value={f.dataVencimento} onChange={e => setF({ ...f, dataVencimento: e.target.value })} /></Field>
          <Field label="Número de referência"><Input value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })} /></Field>
          <Field label="Valor principal"><Input type="number" step="0.01" value={f.valorPrincipal} onChange={e => setF({ ...f, valorPrincipal: e.target.value })} /></Field>
          <Field label="Multa"><Input type="number" step="0.01" value={f.valorMulta} onChange={e => setF({ ...f, valorMulta: e.target.value })} /></Field>
          <Field label="Juros"><Input type="number" step="0.01" value={f.valorJuros} onChange={e => setF({ ...f, valorJuros: e.target.value })} /></Field>
          <Field label="Descrição"><Input value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></Field>
          <Btn variant="orange" icon={<Send size={14} />} loading={loading} onClick={pagar}>Pagar DARF</Btn>
        </div>
      </Card>
      <Card title="DARFs pagos/agendados" actions={<Btn icon={<RefreshCw size={14} />} loading={lista.loading} onClick={lista.reload}>Consultar</Btn>}>
        <div className="p-4 border-b border-brand-border"><DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} /></div>
        {lista.error && <div className="p-4"><Alert type="error">{lista.error}</Alert></div>}
        <DataTable loading={lista.loading} rows={Array.isArray(lista.data) ? lista.data : []} rowKey={(d: any) => d.codigoSolicitacao} columns={[
          { key: 'r', label: 'Receita', render: (d: any) => <span className="font-mono">{d.codigoReceita}</span> },
          { key: 'p', label: 'Apuração', render: (d: any) => fmtDate(d.periodoApuracao) },
          { key: 'v', label: 'Vencimento', render: (d: any) => fmtDate(d.dataVencimento) },
          { key: 's', label: 'Status', render: (d: any) => <Badge color={STATUS[d.statusPagamento] || 'gray'}>{d.statusPagamento}</Badge> },
          { key: 't', label: 'Total', align: 'right', render: (d: any) => <span className="font-mono">{brl(d.valorTotal || d.valor)}</span> },
        ]} />
      </Card>
    </>
  );
}

function PixPagamento({ token, setMsg }: { token: string; setMsg: SetMsg }) {
  const [tipo, setTipo] = useState('CHAVE');
  const [f, setF] = useState({ valor: '', descricao: '', dataPagamento: '', chave: '', pixCopiaECola: '', nome: '', cpfCnpj: '', ispb: '', agencia: '', contaCorrente: '', tipoConta: 'CONTA_CORRENTE' });
  const [loading, setLoading] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [consulta, setConsulta] = useState<any>(null);
  const idem = useRef(crypto.randomUUID());

  const enviar = async () => {
    const destinatario: any = { tipo };
    if (tipo === 'CHAVE') destinatario.chave = f.chave.trim();
    if (tipo === 'PIX_COPIA_E_COLA') destinatario.pixCopiaECola = f.pixCopiaECola.trim();
    if (tipo === 'DADOS_BANCARIOS') Object.assign(destinatario, { nome: f.nome, cpfCnpj: f.cpfCnpj.replace(/\D/g, ''), agencia: f.agencia, contaCorrente: f.contaCorrente, tipoConta: f.tipoConta, instituicaoFinanceira: { ispb: f.ispb } });
    const alvo = destinatario.chave || destinatario.nome || 'Pix copia e cola';
    if (!confirm(`Confirmar envio de ${brl(f.valor)} para ${alvo}${f.dataPagamento ? ` em ${fmtDate(f.dataPagamento)}` : ''}?`)) return;
    setLoading(true);
    try {
      const r = await apiFetch<any>(token, '/api/inter/pagamentos/pix', {
        method: 'POST',
        body: { idempotencia: idem.current, valor: Number(f.valor), ...(f.descricao ? { descricao: f.descricao } : {}), ...(f.dataPagamento ? { dataPagamento: f.dataPagamento } : {}), destinatario },
      });
      setMsg({ type: 'success', text: `Pix ${r.tipoRetorno === 'APROVACAO' ? 'aguardando aprovação no app' : r.tipoRetorno === 'AGENDADO' ? 'agendado' : 'enviado'}. Código: ${r.codigoSolicitacao}` });
      setCodigo(r.codigoSolicitacao || '');
      idem.current = crypto.randomUUID();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setLoading(false); }
  };

  const consultar = async () => {
    try { setConsulta(await apiFetch(token, `/api/inter/pagamentos/pix/${codigo.trim()}`)); } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  return (
    <>
      <Card title="Enviar Pix" subtitle="Transferência para outra conta: use 'Dados bancários' (a API do Inter não expõe TED; a transferência é feita via Pix)">
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <Field label="Destino"><Select value={tipo} onChange={e => setTipo(e.target.value)} options={[{ value: 'CHAVE', label: 'Chave Pix' }, { value: 'DADOS_BANCARIOS', label: 'Dados bancários' }, { value: 'PIX_COPIA_E_COLA', label: 'Pix copia e cola' }]} /></Field>
          <Field label="Valor (R$)"><Input type="number" step="0.01" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></Field>
          <Field label="Agendar para (opcional)"><Input type="date" value={f.dataPagamento} onChange={e => setF({ ...f, dataPagamento: e.target.value })} /></Field>
          <Field label="Descrição (opcional)"><Input maxLength={140} value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></Field>
          {tipo === 'CHAVE' && <Field label="Chave Pix" className="md:col-span-4"><Input value={f.chave} onChange={e => setF({ ...f, chave: e.target.value })} /></Field>}
          {tipo === 'PIX_COPIA_E_COLA' && <Field label="Pix copia e cola" className="md:col-span-4"><Input value={f.pixCopiaECola} onChange={e => setF({ ...f, pixCopiaECola: e.target.value })} className="font-mono" /></Field>}
          {tipo === 'DADOS_BANCARIOS' && <>
            <Field label="Nome do favorecido" className="md:col-span-2"><Input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Field>
            <Field label="CPF/CNPJ"><Input value={f.cpfCnpj} onChange={e => setF({ ...f, cpfCnpj: e.target.value })} /></Field>
            <Field label="ISPB do banco (8 dígitos)"><Input value={f.ispb} onChange={e => setF({ ...f, ispb: e.target.value })} /></Field>
            <Field label="Agência"><Input value={f.agencia} onChange={e => setF({ ...f, agencia: e.target.value })} /></Field>
            <Field label="Conta (com dígito)"><Input value={f.contaCorrente} onChange={e => setF({ ...f, contaCorrente: e.target.value })} /></Field>
            <Field label="Tipo de conta"><Select value={f.tipoConta} onChange={e => setF({ ...f, tipoConta: e.target.value })} options={[{ value: 'CONTA_CORRENTE', label: 'Corrente' }, { value: 'CONTA_POUPANCA', label: 'Poupança' }, { value: 'CONTA_PAGAMENTO', label: 'Pagamento' }, { value: 'CONTA_SALARIO', label: 'Salário' }]} /></Field>
          </>}
          <Btn variant="orange" icon={<Send size={14} />} loading={loading} onClick={enviar}>Enviar Pix</Btn>
        </div>
      </Card>
      <Card title="Consultar Pix enviado">
        <div className="p-4 flex flex-wrap items-end gap-3">
          <Field label="Código da solicitação" className="flex-1 min-w-[260px]"><Input value={codigo} onChange={e => setCodigo(e.target.value)} className="font-mono" /></Field>
          <Btn icon={<Search size={14} />} onClick={consultar} disabled={!codigo.trim()}>Consultar</Btn>
        </div>
        {consulta && <div className="p-4 pt-0"><JsonView data={consulta} /></div>}
      </Card>
    </>
  );
}

function Lote({ token, setMsg }: { token: string; setMsg: SetMsg }) {
  const [body, setBody] = useState(JSON.stringify({
    meuIdentificador: `LOTE-${isoDate()}`,
    pagamentos: [
      { tipoPagamento: 'BOLETO', codBarraLinhaDigitavel: '00000000000000000000000000000000000000000000000', valorPagar: 100.0, dataVencimento: isoDate(5) },
      { tipoPagamento: 'DARF', cnpjCpf: '00000000000000', nomeEmpresa: 'Empresa', codigoReceita: '0000', periodoApuracao: isoDate(-30), dataVencimento: isoDate(5), referencia: '0', valorPrincipal: 50.0 },
    ],
  }, null, 2));
  const [loading, setLoading] = useState(false);
  const [idLote, setIdLote] = useState('');
  const [res, setRes] = useState<any>(null);
  const enviar = async () => {
    let parsed: any;
    try { parsed = JSON.parse(body); } catch { setMsg({ type: 'error', text: 'JSON inválido.' }); return; }
    if (!confirm(`Enviar lote com ${parsed.pagamentos?.length || 0} pagamentos?`)) return;
    setLoading(true);
    try { const r = await apiFetch<any>(token, '/api/inter/pagamentos/lote', { method: 'POST', body: parsed }); setIdLote(r.idLote); setRes(r); setMsg({ type: 'success', text: `Lote ${r.idLote} recebido (${r.status}).` }); }
    catch (e: any) { setMsg({ type: 'error', text: e.message }); } finally { setLoading(false); }
  };
  const consultar = async () => { try { setRes(await apiFetch(token, `/api/inter/pagamentos/lote/${idLote.trim()}`)); } catch (e: any) { setMsg({ type: 'error', text: e.message }); } };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card title="Novo lote (2 a 150 pagamentos de boleto/DARF)">
        <div className="p-4 flex flex-col gap-3"><JsonEditor value={body} onChange={setBody} rows={22} /><div><Btn variant="orange" icon={<Send size={14} />} loading={loading} onClick={enviar}>Enviar lote</Btn></div></div>
      </Card>
      <Card title="Consultar lote">
        <div className="p-4 flex flex-wrap items-end gap-3"><Field label="Id do lote" className="flex-1"><Input value={idLote} onChange={e => setIdLote(e.target.value)} className="font-mono" /></Field><Btn icon={<Search size={14} />} onClick={consultar} disabled={!idLote.trim()}>Consultar</Btn></div>
        {res && <div className="p-4 pt-0"><JsonView data={res} /></div>}
      </Card>
    </div>
  );
}

function Historico({ token }: { token: string }) {
  const ops = useLoader(() => apiFetch<any[]>(token, '/api/inter/operacoes'), [token], []);
  return (
    <Card title="Operações de saída feitas pelo sistema" subtitle="Registro local de pagamentos, Pix e devoluções enviados por aqui" actions={<Btn icon={<RefreshCw size={14} />} loading={ops.loading} onClick={ops.reload}>Atualizar</Btn>}>
      <DataTable loading={ops.loading} rows={ops.data} rowKey={(o: any) => o.id} columns={[
        { key: 'em', label: 'Quando', render: (o: any) => <span className="text-brand-muted whitespace-nowrap">{fmtDateTime(o.em)}</span> },
        { key: 'tipo', label: 'Operação', render: (o: any) => o.tipo },
        { key: 'dest', label: 'Destino', render: (o: any) => o.destinatario || o.e2eId || o.requisicao?.codBarraLinhaDigitavel || o.requisicao?.codigoReceita || '' },
        { key: 'res', label: 'Retorno', render: (o: any) => <span className="text-[11.5px] font-mono text-brand-muted">{o.resposta?.codigoSolicitacao || o.resposta?.codigoTransacao || o.resposta?.idLote || o.resposta?.status || ''}</span> },
        { key: 'v', label: 'Valor', align: 'right', render: (o: any) => o.valor ? <span className="font-mono">{brl(o.valor)}</span> : null },
      ]} />
    </Card>
  );
}
