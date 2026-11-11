import QRCode from 'qrcode';
import { lerNfse, CONSULTA_PUBLICA_URL } from './nacional';
import { htmlToPdf } from '../pdf';

/**
 * DANFSe (Documento Auxiliar da NFS-e) gerado localmente a partir do XML autorizado pela Sefin Nacional.
 * Segue a estrutura de blocos do DANFSe do portal nacional, com QR Code para a consulta pública.
 */

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

function fmtDoc(d: string) {
  const x = String(d || '').replace(/\D/g, '');
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return x;
}

function fmtMoney(v: string | number) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(s: string) {
  if (!s) return '';
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}${t ? ' ' + t.slice(0, 8) : ''}`;
}

function fmtCep(c: string) {
  const x = String(c || '').replace(/\D/g, '');
  return x.length === 8 ? `${x.slice(0, 5)}-${x.slice(5)}` : x;
}

const RET: Record<string, string> = { '1': 'Não retido', '2': 'Retido pelo tomador', '3': 'Retido pelo intermediário' };
const TRIB: Record<string, string> = { '1': 'Operação tributável', '2': 'Imunidade', '3': 'Exportação de serviço', '4': 'Não incidência' };
const SN: Record<string, string> = { '1': 'Não optante', '2': 'Optante - MEI', '3': 'Optante - ME/EPP' };

export async function danfseHtml(xmlNfse: string, opts: { cancelada?: boolean; homologacao?: boolean } = {}) {
  const n = lerNfse(xmlNfse);
  const chave = n.chaveAcesso;
  const qr = await QRCode.toDataURL(CONSULTA_PUBLICA_URL + chave, { margin: 0, width: 220 });
  const t = n.dps.toma;
  const e = n.emit;
  const homolog = opts.homologacao || n.dps.tpAmb === '2';
  const chaveFmt = chave.replace(/(\d{4})/g, '$1 ').trim();

  const cell = (label: string, value: unknown, span = 1) =>
    `<td colspan="${span}"><div class="l">${esc(label)}</div><div class="v">${esc(value) || '&nbsp;'}</div></td>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #111; margin: 0; }
    .wrap { border: 1px solid #000; position: relative; }
    .wm { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 64px; color: rgba(200,0,0,.18); transform: rotate(-24deg); font-weight: bold; pointer-events: none; }
    .head { display: flex; align-items: center; border-bottom: 1px solid #000; padding: 6px 8px; gap: 10px; }
    .head h1 { font-size: 14px; margin: 0; }
    .head .sub { font-size: 9px; color: #333; }
    .head .qr { margin-left: auto; text-align: center; font-size: 7.5px; }
    .head .qr img { width: 86px; height: 86px; display: block; margin: 0 auto 2px; }
    .sec { background: #e9e9e9; font-weight: bold; font-size: 9px; padding: 3px 6px; border-bottom: 1px solid #000; border-top: 1px solid #000; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { border-right: 1px solid #bbb; border-bottom: 1px solid #ddd; padding: 3px 6px; vertical-align: top; }
    td:last-child { border-right: 0; }
    .l { font-size: 7.5px; color: #555; text-transform: uppercase; }
    .v { font-size: 10px; font-weight: 600; word-break: break-word; }
    .desc { padding: 6px 8px; white-space: pre-wrap; font-size: 10px; min-height: 60px; }
    .chave { font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: .5px; }
    .tot td .v { font-size: 11px; }
    .foot { padding: 5px 8px; font-size: 8px; color: #444; }
  </style></head><body><div class="wrap">
    ${opts.cancelada ? '<div class="wm">CANCELADA</div>' : homolog ? '<div class="wm">SEM VALOR FISCAL</div>' : ''}
    <div class="head">
      <div>
        <h1>DANFSe v2.0 — Documento Auxiliar da NFS-e</h1>
        <div class="sub">Nota Fiscal de Serviço eletrônica — padrão nacional${homolog ? ' — PRODUÇÃO RESTRITA (homologação)' : ''}</div>
        <div style="margin-top:6px" class="l">Chave de acesso</div>
        <div class="chave">${esc(chaveFmt)}</div>
      </div>
      <div class="qr"><img src="${qr}" alt="QR Code"/>Consulta pública<br/>www.nfse.gov.br</div>
    </div>
    <table>
      <tr>${cell('Número da NFS-e', n.nNFSe)}${cell('Competência', fmtDate(n.dps.dCompet))}${cell('Data/hora da emissão', fmtDate(n.dps.dhEmi))}${cell('Data/hora do processamento', fmtDate(n.dhProc))}</tr>
      <tr>${cell('Número da DPS', n.dps.nDPS)}${cell('Série da DPS', n.dps.serie)}${cell('Local de emissão', n.xLocEmi)}${cell('Local da prestação', n.xLocPrestacao)}</tr>
    </table>
    <div class="sec">Prestador / Emitente</div>
    <table>
      <tr>${cell('CNPJ / CPF', fmtDoc(e.doc))}${cell('Inscrição municipal', e.im)}${cell('Telefone', e.fone)}${cell('E-mail', e.email)}</tr>
      <tr>${cell('Nome / Razão social', e.nome, 2)}${cell('Simples Nacional', SN[n.dps.opSimpNac] || n.dps.opSimpNac)}${cell('Regime de apuração SN', n.dps.regApTribSN)}</tr>
      <tr>${cell('Endereço', [e.logradouro, e.numero, e.complemento, e.bairro].filter(Boolean).join(', '), 2)}${cell('Município / UF', [n.xLocEmi, e.uf].filter(Boolean).join(' / '))}${cell('CEP', fmtCep(e.cep))}</tr>
    </table>
    <div class="sec">Tomador do serviço</div>
    <table>
      ${t.nome ? `<tr>${cell('CNPJ / CPF', fmtDoc(t.doc))}${cell('Inscrição municipal', t.im)}${cell('Telefone', t.fone)}${cell('E-mail', t.email)}</tr>
      <tr>${cell('Nome / Razão social', t.nome, 2)}${cell('Endereço', [t.logradouro, t.numero, t.complemento, t.bairro].filter(Boolean).join(', '), 2)}</tr>
      <tr>${cell('Código do município (IBGE)', t.cMun)}${cell('CEP', fmtCep(t.cep))}${cell('', '', 2)}</tr>` : `<tr>${cell('Tomador', 'NÃO IDENTIFICADO NA NFS-e', 4)}</tr>`}
    </table>
    <div class="sec">Serviço prestado</div>
    <table>
      <tr>${cell('Código de tributação nacional', `${n.dps.cTribNac} - ${n.xTribNac}`, 3)}${cell('Código de tributação municipal', n.dps.cTribMun ? `${n.dps.cTribMun} - ${n.xTribMun}` : '')}</tr>
      ${n.dps.cNBS ? `<tr>${cell('NBS', `${n.dps.cNBS} - ${n.xNBS}`, 4)}</tr>` : ''}
    </table>
    <div class="desc">${esc(n.dps.xDescServ)}</div>
    <div class="sec">Tributação municipal (ISSQN)</div>
    <table>
      <tr>${cell('Tributação do ISSQN', TRIB[n.dps.tribISSQN] || n.dps.tribISSQN)}${cell('Retenção do ISSQN', RET[n.dps.tpRetISSQN] || n.dps.tpRetISSQN)}${cell('Município de incidência', n.xLocPrestacao)}${cell('Alíquota aplicada', n.valores.pAliqAplic ? `${n.valores.pAliqAplic}%` : (n.dps.pAliq ? `${n.dps.pAliq}%` : '-'))}</tr>
      <tr>${cell('Base de cálculo', n.valores.vBC ? fmtMoney(n.valores.vBC) : '-')}${cell('ISSQN apurado', n.valores.vISSQN ? fmtMoney(n.valores.vISSQN) : '-')}${cell('Total de retenções', n.valores.vTotalRet ? fmtMoney(n.valores.vTotalRet) : fmtMoney(0))}${cell('Tributos aprox. (SN)', n.dps.pTotTribSN ? `${n.dps.pTotTribSN}%` : '-')}</tr>
    </table>
    <div class="sec">Valor total</div>
    <table class="tot">
      <tr>${cell('Valor do serviço', fmtMoney(n.dps.vServ))}${cell('Descontos', fmtMoney(0))}${cell('Retenções', fmtMoney(n.valores.vTotalRet || 0))}${cell('Valor líquido da NFS-e', fmtMoney(n.valores.vLiq || n.dps.vServ))}</tr>
    </table>
    ${n.xOutInf ? `<div class="sec">Informações complementares</div><div class="desc" style="min-height:0">${esc(n.xOutInf)}</div>` : ''}
    <div class="foot">Documento auxiliar gerado pelo sistema emissor a partir do XML oficial da NFS-e. A autenticidade pode ser verificada na consulta pública em www.nfse.gov.br com a chave de acesso acima.</div>
  </div></body></html>`;
}

export async function danfsePdf(xmlNfse: string, opts: { cancelada?: boolean } = {}) {
  return htmlToPdf(await danfseHtml(xmlNfse, opts));
}
