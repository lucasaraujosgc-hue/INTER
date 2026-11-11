import React, { useMemo, useState } from 'react';
import { RefreshCw, FileDown } from 'lucide-react';
import { apiFetch, brl, fmtDate, isoDate, openBlob, fmtDoc } from '../../lib/api';
import { Card, Btn, DataTable, DateRange, Field, Select, Alert, Stat, useLoader, Badge } from '../ui';

export default function InterExtrato({ token }: { token: string }) {
  const [inicio, setInicio] = useState(isoDate(-30));
  const [fim, setFim] = useState(isoDate());
  const [tipo, setTipo] = useState('');
  const [msg, setMsg] = useState('');

  const saldo = useLoader(() => apiFetch<any>(token, '/api/inter/saldo'), [token], null);
  const extrato = useLoader(async () => {
    if ((new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000 > 90) throw new Error('O Inter permite consultar o extrato de no máximo 90 dias por vez.');
    const all: any[] = [];
    for (let pagina = 0; pagina < 50; pagina++) {
      const r = await apiFetch<any>(token, '/api/inter/extrato', { query: { dataInicio: inicio, dataFim: fim, pagina, tamanhoPagina: 1000, tipoOperacao: tipo } });
      all.push(...(r.transacoes || []));
      if (r.ultimaPagina !== false || pagina + 1 >= (r.totalPaginas || 1)) break;
    }
    return all;
  }, [token], []);

  const tot = useMemo(() => ({
    entradas: extrato.data.filter(t => t.tipoOperacao === 'C').reduce((a, t) => a + Number(t.valor), 0),
    saidas: extrato.data.filter(t => t.tipoOperacao === 'D').reduce((a, t) => a + Number(t.valor), 0),
  }), [extrato.data]);

  const pdf = () => openBlob(token, `/api/inter/extrato/pdf?dataInicio=${inicio}&dataFim=${fim}`, `extrato_${inicio}_${fim}.pdf`).catch(e => setMsg(e.message));

  return (
    <div className="flex flex-col gap-5">
      {(msg || saldo.error || extrato.error) && <Alert type="error" onClose={() => setMsg('')}>{msg || saldo.error || extrato.error}</Alert>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Saldo disponível" value={saldo.data ? brl(saldo.data.disponivel) : '—'} color="text-brand-green" />
        <Stat label="Limite" value={saldo.data ? brl(saldo.data.limite) : '—'} />
        <Stat label="Entradas no período" value={brl(tot.entradas)} color="text-brand-green" />
        <Stat label="Saídas no período" value={brl(tot.saidas)} color="text-red-400" />
      </div>
      <Card title="Extrato" subtitle="Até 90 dias por consulta" actions={<Btn icon={<FileDown size={14} />} onClick={pdf}>Exportar PDF</Btn>}>
        <div className="p-4 border-b border-brand-border flex flex-wrap items-end gap-3">
          <DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} />
          <Field label="Tipo"><Select value={tipo} onChange={e => setTipo(e.target.value)} options={[{ value: '', label: 'Entradas e saídas' }, { value: 'C', label: 'Somente entradas' }, { value: 'D', label: 'Somente saídas' }]} /></Field>
          <Btn icon={<RefreshCw size={14} />} loading={extrato.loading} onClick={extrato.reload}>Consultar</Btn>
        </div>
        <DataTable
          loading={extrato.loading}
          rows={extrato.data}
          rowKey={(t, i) => t.idTransacao || String(i)}
          columns={[
            { key: 'data', label: 'Data', render: t => <span className="text-brand-muted whitespace-nowrap">{fmtDate(t.dataTransacao || t.dataInclusao)}</span> },
            { key: 'tipo', label: 'Tipo', render: t => <Badge color={t.tipoOperacao === 'C' ? 'green' : 'red'}>{t.tipoTransacao}</Badge> },
            {
              key: 'desc', label: 'Descrição', render: t => {
                const d = t.detalhes || {};
                const quem = t.tipoOperacao === 'C' ? (d.nomePagador || d.nome) : (d.nomeRecebedor || d.nomeDestinatario || d.nomeEmpresaRecebedor);
                const doc = t.tipoOperacao === 'C' ? (d.cpfCnpjPagador || d.cpfCnpj) : (d.cpfCnpjRecebedor || d.cpfCnpj);
                return (
                  <div className="min-w-[220px]">
                    <div className="text-brand-text">{t.titulo}{quem ? ` · ${quem}` : ''}</div>
                    <div className="text-[11.5px] text-brand-muted">{t.descricao}{doc ? ` · ${fmtDoc(doc)}` : ''}</div>
                  </div>
                );
              },
            },
            { key: 'valor', label: 'Valor', align: 'right', render: t => <span className={`font-mono font-medium ${t.tipoOperacao === 'C' ? 'text-brand-green' : 'text-red-400'}`}>{t.tipoOperacao === 'D' ? '-' : ''}{brl(t.valor)}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
