import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import forge from 'node-forge';
import {
  interRequest, InterError, interStatus, interTestConnection, clearInterTokens, certMatchesKey,
  describeCert, INTER_SCOPE_GROUPS, ALL_INTER_SCOPES, newTxid, loadInterConfig,
} from './client';
import {
  listarEntradas, marcarEntrada, vincularEntrada, importarCobrancas, sincronizarCobranca, criarCobrancaInter, cancelarCobranca,
  registrarOperacao, saidasPermitidas, processarWebhook, enriquecerBoletos, marcarCobrancaPaga, desfazerBaixa,
} from './service';
import { files, getSettings, saveSettings, writeSecretFile, readJson, getWebhookSecret, nomeArquivo } from '../storage';

type Handler = (req: express.Request, res: express.Response) => Promise<any>;

function wrap(fn: Handler): express.RequestHandler {
  return (req, res) => {
    fn(req, res).catch((err: any) => {
      const status = err instanceof InterError ? (err.status >= 400 && err.status < 600 ? err.status : 502) : 500;
      if (status >= 500) console.error('[inter]', err?.message || err);
      if (!res.headersSent) res.status(status).json({ error: err?.message || 'Erro interno', details: err?.data });
    });
  };
}

function requireSaidas() {
  if (!saidasPermitidas()) {
    throw new InterError(
      'Operações que movimentam dinheiro (pagamentos, Pix, devoluções) estão desativadas. Ative em Banco Inter › Configuração › "Permitir operações de saída".',
      403,
    );
  }
}

function sendPdf(res: express.Response, base64: string, filename: string) {
  const buf = Buffer.from(base64 || '', 'base64');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

// Rotas de repasse (proxy) para os endpoints oficiais do Inter, com o escopo exigido por cada um.
interface ProxyRoute {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  local: string;
  remote: string;
  scope: string;
  saida?: string; // descrição da operação de saída (exige permissão e é registrada)
  pdf?: () => string; // nome do arquivo quando a resposta é { pdf: base64 }
  sandboxOnly?: boolean;
}

const PROXIES: ProxyRoute[] = [
  // Banking: saldo e extrato
  { method: 'get', local: '/saldo', remote: '/banking/v2/saldo', scope: 'extrato.read' },
  { method: 'get', local: '/extrato', remote: '/banking/v2/extrato/completo', scope: 'extrato.read' },
  { method: 'get', local: '/extrato/simples', remote: '/banking/v2/extrato', scope: 'extrato.read' },
  { method: 'get', local: '/extrato/pdf', remote: '/banking/v2/extrato/exportar', scope: 'extrato.read', pdf: () => nomeArquivo('EXTRATO', 'INTER') },
  // Banking: pagamentos
  { method: 'get', local: '/pagamentos', remote: '/banking/v2/pagamento', scope: 'pagamento-boleto.read' },
  { method: 'post', local: '/pagamentos/boleto', remote: '/banking/v2/pagamento', scope: 'pagamento-boleto.write', saida: 'Pagamento com código de barras' },
  { method: 'get', local: '/pagamentos/darf', remote: '/banking/v2/pagamento/darf', scope: 'pagamento-boleto.read' },
  { method: 'post', local: '/pagamentos/darf', remote: '/banking/v2/pagamento/darf', scope: 'pagamento-darf.write', saida: 'Pagamento de DARF' },
  { method: 'post', local: '/pagamentos/lote', remote: '/banking/v2/pagamento/lote', scope: 'pagamento-lote.write', saida: 'Lote de pagamentos' },
  { method: 'get', local: '/pagamentos/lote/:idLote', remote: '/banking/v2/pagamento/lote/{idLote}', scope: 'pagamento-lote.read' },
  { method: 'get', local: '/pagamentos/pix/:codigoSolicitacao', remote: '/banking/v2/pix/{codigoSolicitacao}', scope: 'pagamento-pix.read' },
  { method: 'delete', local: '/pagamentos/:codigoTransacao', remote: '/banking/v2/pagamento/{codigoTransacao}', scope: 'pagamento-boleto.write', saida: 'Cancelamento de agendamento' },
  // Cobrança v3 (boleto com Pix)
  { method: 'get', local: '/cobrancas/sumario', remote: '/cobranca/v3/cobrancas/sumario', scope: 'boleto-cobranca.read' },
  { method: 'get', local: '/cobrancas/edicao/:codigoEdicao', remote: '/cobranca/v3/cobrancas/edicao/{codigoEdicao}', scope: 'boleto-cobranca.read' },
  { method: 'get', local: '/cobrancas/:codigoSolicitacao', remote: '/cobranca/v3/cobrancas/{codigoSolicitacao}', scope: 'boleto-cobranca.read' },
  { method: 'patch', local: '/cobrancas/:codigoSolicitacao', remote: '/cobranca/v3/cobrancas/{codigoSolicitacao}', scope: 'boleto-cobranca.write' },
  { method: 'post', local: '/cobrancas/:codigoSolicitacao/pagar-sandbox', remote: '/cobranca/v3/cobrancas/{codigoSolicitacao}/pagar', scope: 'boleto-cobranca.write', sandboxOnly: true },
  // Pix: recebidos
  { method: 'get', local: '/pix/recebidos', remote: '/pix/v2/pix', scope: 'pix.read' },
  { method: 'get', local: '/pix/recebidos/:e2eId', remote: '/pix/v2/pix/{e2eId}', scope: 'pix.read' },
  { method: 'get', local: '/pix/recebidos/:e2eId/devolucao/:id', remote: '/pix/v2/pix/{e2eId}/devolucao/{id}', scope: 'pix.read' },
  // Pix: cobranças imediatas
  { method: 'get', local: '/pix/cob', remote: '/pix/v2/cob', scope: 'cob.read' },
  { method: 'post', local: '/pix/cob', remote: '/pix/v2/cob', scope: 'cob.write' },
  { method: 'get', local: '/pix/cob/:txid', remote: '/pix/v2/cob/{txid}', scope: 'cob.read' },
  { method: 'put', local: '/pix/cob/:txid', remote: '/pix/v2/cob/{txid}', scope: 'cob.write' },
  { method: 'patch', local: '/pix/cob/:txid', remote: '/pix/v2/cob/{txid}', scope: 'cob.write' },
  // Pix: cobranças com vencimento
  { method: 'get', local: '/pix/cobv', remote: '/pix/v2/cobv', scope: 'cobv.read' },
  { method: 'get', local: '/pix/cobv/:txid', remote: '/pix/v2/cobv/{txid}', scope: 'cobv.read' },
  { method: 'put', local: '/pix/cobv/:txid', remote: '/pix/v2/cobv/{txid}', scope: 'cobv.write' },
  { method: 'patch', local: '/pix/cobv/:txid', remote: '/pix/v2/cobv/{txid}', scope: 'cobv.write' },
  // Pix: lotes de cobranças com vencimento
  { method: 'get', local: '/pix/lotecobv', remote: '/pix/v2/lotecobv', scope: 'lotecobv.read' },
  { method: 'get', local: '/pix/lotecobv/:id/sumario', remote: '/pix/v2/lotecobv/{id}/sumario', scope: 'lotecobv.read' },
  { method: 'get', local: '/pix/lotecobv/:id/situacao/:situacao', remote: '/pix/v2/lotecobv/{id}/situacao/{situacao}', scope: 'lotecobv.read' },
  { method: 'get', local: '/pix/lotecobv/:id', remote: '/pix/v2/lotecobv/{id}', scope: 'lotecobv.read' },
  { method: 'put', local: '/pix/lotecobv/:id', remote: '/pix/v2/lotecobv/{id}', scope: 'lotecobv.write' },
  { method: 'patch', local: '/pix/lotecobv/:id', remote: '/pix/v2/lotecobv/{id}', scope: 'lotecobv.write' },
  // Pix: payloads (locations)
  { method: 'get', local: '/pix/loc', remote: '/pix/v2/loc', scope: 'payloadlocation.read' },
  { method: 'post', local: '/pix/loc', remote: '/pix/v2/loc', scope: 'payloadlocation.write' },
  { method: 'get', local: '/pix/loc/:id', remote: '/pix/v2/loc/{id}', scope: 'payloadlocation.read' },
  { method: 'delete', local: '/pix/loc/:id/txid', remote: '/pix/v2/loc/{id}/txid', scope: 'payloadlocation.write' },
  // Pix Automático
  { method: 'get', local: '/pixauto/rec', remote: '/pix/v2/rec', scope: 'rec.read' },
  { method: 'post', local: '/pixauto/rec', remote: '/pix/v2/rec', scope: 'rec.write' },
  { method: 'get', local: '/pixauto/rec/:idRec', remote: '/pix/v2/rec/{idRec}', scope: 'rec.read' },
  { method: 'patch', local: '/pixauto/rec/:idRec', remote: '/pix/v2/rec/{idRec}', scope: 'rec.write' },
  { method: 'post', local: '/pixauto/solicrec', remote: '/pix/v2/solicrec', scope: 'solicrec.write' },
  { method: 'get', local: '/pixauto/solicrec/:id', remote: '/pix/v2/solicrec/{id}', scope: 'solicrec.read' },
  { method: 'patch', local: '/pixauto/solicrec/:id', remote: '/pix/v2/solicrec/{id}', scope: 'solicrec.write' },
  { method: 'get', local: '/pixauto/cobr', remote: '/pix/v2/cobr', scope: 'cobr.read' },
  { method: 'post', local: '/pixauto/cobr', remote: '/pix/v2/cobr', scope: 'cobr.write' },
  { method: 'get', local: '/pixauto/cobr/:txid', remote: '/pix/v2/cobr/{txid}', scope: 'cobr.read' },
  { method: 'put', local: '/pixauto/cobr/:txid', remote: '/pix/v2/cobr/{txid}', scope: 'cobr.write' },
  { method: 'patch', local: '/pixauto/cobr/:txid', remote: '/pix/v2/cobr/{txid}', scope: 'cobr.write' },
  { method: 'post', local: '/pixauto/cobr/:txid/retentativa/:data', remote: '/pix/v2/cobr/{txid}/retentativa/{data}', scope: 'cobr.write' },
  { method: 'get', local: '/pixauto/locrec', remote: '/pix/v2/locrec', scope: 'payloadlocationrec.read' },
  { method: 'post', local: '/pixauto/locrec', remote: '/pix/v2/locrec', scope: 'payloadlocationrec.write' },
  { method: 'get', local: '/pixauto/locrec/:id', remote: '/pix/v2/locrec/{id}', scope: 'payloadlocationrec.read' },
  { method: 'delete', local: '/pixauto/locrec/:id/idRec', remote: '/pix/v2/locrec/{id}/idRec', scope: 'payloadlocationrec.write' },
];

// Webhooks que o Inter oferece, com os endpoints de cadastro/consulta/callbacks de cada um.
interface WebhookDef {
  label: string;
  base: string; // pode conter {chave}
  readScope: string;
  writeScope: string;
  callbacks?: string;
  retry?: string;
}

export const WEBHOOKS: Record<string, WebhookDef> = {
  cobranca: {
    label: 'Cobranças (boleto com Pix)', base: '/cobranca/v3/cobrancas/webhook',
    readScope: 'boleto-cobranca.read', writeScope: 'boleto-cobranca.write',
    callbacks: '/cobranca/v3/cobrancas/webhook/callbacks', retry: '/cobranca/v3/webhook/callbacks/retry',
  },
  pix: {
    label: 'Pix recebidos (chave Pix)', base: '/pix/v2/webhook/{chave}',
    readScope: 'webhook.read', writeScope: 'webhook.write',
    callbacks: '/pix/v2/webhook/callbacks', retry: '/pix/v2/webhook/callbacks/retry',
  },
  'pix-pagamento': {
    label: 'Pagamentos Pix enviados', base: '/banking/v2/webhooks/pix-pagamento',
    readScope: 'webhook-banking.read', writeScope: 'webhook-banking.write',
    callbacks: '/banking/v2/webhooks/pix-pagamento/callbacks', retry: '/banking/v2/webhooks/pix-pagamento/callbacks/retry',
  },
  'boleto-pagamento': {
    label: 'Pagamentos de boleto', base: '/banking/v2/webhooks/boleto-pagamento',
    readScope: 'webhook-banking.read', writeScope: 'webhook-banking.write',
    callbacks: '/banking/v2/webhooks/boleto-pagamento/callbacks', retry: '/banking/v2/webhooks/boleto-pagamento/callbacks/retry',
  },
  rec: { label: 'Pix Automático: recorrências', base: '/pix/v2/webhookrec', readScope: 'webhookrec.read', writeScope: 'webhookrec.write' },
  cobr: { label: 'Pix Automático: cobranças recorrentes', base: '/pix/v2/webhookcobr', readScope: 'webhookcobr.read', writeScope: 'webhookcobr.write' },
};

function webhookPath(def: WebhookDef) {
  if (!def.base.includes('{chave}')) return def.base;
  const chave = getSettings().interChavePix;
  if (!chave) throw new InterError('Informe a chave Pix da conta em Banco Inter › Configuração para gerenciar o webhook de Pix.', 400);
  return def.base.replace('{chave}', encodeURIComponent(chave));
}

export function webhookReceiverUrl(tipo: string) {
  const base = String(getSettings().publicUrl || process.env.APP_URL || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return '';
  return `${base}/api/webhooks/inter/${getWebhookSecret()}/${tipo}`;
}

const upload = multer({ dest: path.join(process.cwd(), 'tmp'), limits: { fileSize: 2 * 1024 * 1024 } });

export function createInterRouter() {
  const r = express.Router();

  // ---------------- Configuração ----------------
  r.get('/status', wrap(async (_req, res) => {
    const s = getSettings();
    res.json({
      ...interStatus(),
      permitirSaidas: s.interPermitirSaidas === true,
      chavePix: s.interChavePix || '',
      publicUrl: s.publicUrl || process.env.APP_URL || '',
      scopeGroups: INTER_SCOPE_GROUPS,
    });
  }));

  r.post('/config', wrap(async (req, res) => {
    const b = req.body || {};
    const patch: Record<string, any> = {};
    if (typeof b.clientId === 'string') patch.interClientId = b.clientId.trim();
    if (typeof b.clientSecret === 'string' && b.clientSecret.trim()) patch.interClientSecret = b.clientSecret.trim();
    if (typeof b.contaCorrente === 'string') patch.interContaCorrente = b.contaCorrente.replace(/\D/g, '');
    if (b.ambiente === 'sandbox' || b.ambiente === 'producao') patch.interAmbiente = b.ambiente;
    if (Array.isArray(b.scopes)) patch.interScopes = b.scopes.filter((s: string) => ALL_INTER_SCOPES.includes(s));
    if (typeof b.permitirSaidas === 'boolean') patch.interPermitirSaidas = b.permitirSaidas;
    if (typeof b.chavePix === 'string') patch.interChavePix = b.chavePix.trim();
    if (typeof b.publicUrl === 'string') patch.publicUrl = b.publicUrl.trim().replace(/\/+$/, '');
    saveSettings(patch);
    clearInterTokens();
    res.json({ success: true, status: interStatus() });
  }));

  r.post('/certificado', upload.fields([{ name: 'crt', maxCount: 1 }, { name: 'key', maxCount: 1 }, { name: 'pfx', maxCount: 1 }]), wrap(async (req, res) => {
    const up = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const tmpFiles = Object.values(up).flat().map(f => f.path);
    try {
      let certPem = '';
      let keyPem = '';
      if (up.pfx?.[0]) {
        const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(fs.readFileSync(up.pfx[0].path).toString('binary')), false, String(req.body.password || ''));
        const keyBags = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []), ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])];
        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
        if (!keyBags[0]?.key) throw new InterError('Chave privada não encontrada no arquivo .pfx.', 400);
        keyPem = forge.pki.privateKeyToPem(keyBags[0].key);
        const match = certBags.find(b => b.cert && certMatchesKey(forge.pki.certificateToPem(b.cert), keyPem));
        if (!match?.cert) throw new InterError('Certificado correspondente à chave não encontrado no .pfx.', 400);
        certPem = forge.pki.certificateToPem(match.cert);
      } else {
        if (!up.crt?.[0] || !up.key?.[0]) throw new InterError('Envie os dois arquivos: certificado (.crt) e chave (.key).', 400);
        certPem = fs.readFileSync(up.crt[0].path, 'utf-8');
        keyPem = fs.readFileSync(up.key[0].path, 'utf-8');
      }
      if (!certPem.includes('BEGIN CERTIFICATE')) throw new InterError('Arquivo de certificado inválido (esperado PEM .crt).', 400);
      if (!/BEGIN (RSA |EC )?PRIVATE KEY/.test(keyPem)) throw new InterError('Arquivo de chave inválido (esperado PEM .key sem senha).', 400);
      if (!certMatchesKey(certPem, keyPem)) throw new InterError('A chave (.key) não corresponde ao certificado (.crt).', 400);
      writeSecretFile(files.interCertPem, certPem);
      writeSecretFile(files.interKeyPem, keyPem);
      clearInterTokens();
      res.json({ success: true, cert: describeCert(certPem) });
    } finally {
      for (const f of tmpFiles) fs.promises.unlink(f).catch(() => undefined);
    }
  }));

  r.post('/testar', wrap(async (_req, res) => {
    const token = await interTestConnection();
    let saldo: any = null;
    if (token.scopes.includes('extrato.read')) {
      saldo = await interRequest({ method: 'get', path: '/banking/v2/saldo', scope: 'extrato.read' });
    }
    const missing = loadInterConfig().scopes.filter(s => !token.scopes.includes(s));
    res.json({ success: true, scopesConcedidos: token.scopes, scopesAusentes: missing, saldo });
  }));

  // ---------------- Entradas (créditos do extrato) ----------------
  r.get('/entradas', wrap(async (req, res) => {
    const { dataInicio, dataFim } = req.query as Record<string, string>;
    if (!dataInicio || !dataFim) throw new InterError('Informe dataInicio e dataFim (AAAA-MM-DD).', 400);
    res.json(await listarEntradas(dataInicio, dataFim));
  }));

  r.post('/entradas/:idTransacao/marcar', wrap(async (req, res) => {
    const status = req.body?.status === 'ignorada' ? 'ignorada' : 'pendente';
    res.json({ success: true, marcacao: marcarEntrada(req.params.idTransacao, { status, observacao: req.body?.observacao }) });
  }));

  // Vincula o recebimento a um cliente (empresa); com "lembrar", o pagador fica vinculado para os próximos.
  r.post('/entradas/:idTransacao/vincular', wrap(async (req, res) => {
    const { clienteId, lembrar, pagador } = req.body || {};
    if (!clienteId) throw new InterError('Selecione o cliente (empresa).', 400);
    res.json({ success: true, ...vincularEntrada(req.params.idTransacao, { clienteId, lembrar: lembrar !== false, pagador }) });
  }));

  r.delete('/entradas/:idTransacao/vincular', wrap(async (req, res) => {
    res.json({ success: true, ...vincularEntrada(req.params.idTransacao, { clienteId: null }) });
  }));

  // ---------------- Cobranças: operações com regra de negócio ----------------
  r.post('/cobrancas', wrap(async (req, res) => {
    const result = await criarCobrancaInter(req.body || {});
    res.json({ success: true, ...result });
  }));

  r.post('/cobrancas/importar', wrap(async (req, res) => {
    const { dataInicial, dataFinal, filtrarDataPor, situacao, criarClientes } = req.body || {};
    if (!dataInicial || !dataFinal) throw new InterError('Informe o período (dataInicial e dataFinal).', 400);
    res.json({ success: true, ...(await importarCobrancas({ dataInicial, dataFinal, filtrarDataPor, situacao, criarClientes })) });
  }));

  // Lista do Inter com a baixa manual, o vínculo local (NFS-e) e o cliente identificado.
  r.get('/cobrancas', wrap(async (req, res) => {
    const data = await interRequest<any>({ method: 'get', path: '/cobranca/v3/cobrancas', scope: 'boleto-cobranca.read', query: req.query as any });
    res.json({ ...(data || {}), cobrancas: enriquecerBoletos(data?.cobrancas || []) });
  }));

  // Boleto pago por fora (Pix direto na conta): marca como pago e, opcionalmente, baixa (cancela) no Inter.
  r.post('/cobrancas/:codigoSolicitacao/marcar-pago', wrap(async (req, res) => {
    res.json({ success: true, ...(await marcarCobrancaPaga(req.params.codigoSolicitacao, req.body || {})) });
  }));

  r.delete('/cobrancas/:codigoSolicitacao/marcar-pago', wrap(async (req, res) => {
    res.json({ success: true, ...desfazerBaixa(req.params.codigoSolicitacao) });
  }));

  // PDF do boleto com nome amigável: BOLETO_CLIENTE_DD-MM-AAAA.pdf
  r.get('/cobrancas/:codigoSolicitacao/pdf', wrap(async (req, res) => {
    const codigo = req.params.codigoSolicitacao;
    const data = await interRequest<{ pdf: string }>({ method: 'get', path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigo)}/pdf`, scope: 'boleto-cobranca.read' });
    let nome = readJson<any[]>(files.cobrancas, []).find(c => c.inter?.codigoSolicitacao === codigo)?.clientName || '';
    if (!nome) {
      try {
        const det = await interRequest<any>({ method: 'get', path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigo)}`, scope: 'boleto-cobranca.read' });
        nome = det?.cobranca?.pagador?.nome || '';
      } catch { /* usa o código */ }
    }
    sendPdf(res, data?.pdf, nomeArquivo('BOLETO', nome || codigo));
  }));

  r.post('/cobrancas/:codigoSolicitacao/sincronizar', wrap(async (req, res) => {
    res.json({ success: true, cobranca: await sincronizarCobranca(req.params.codigoSolicitacao) });
  }));

  r.post('/cobrancas/:codigoSolicitacao/cancelar', wrap(async (req, res) => {
    const motivo = String(req.body?.motivoCancelamento || '').trim();
    if (!motivo) throw new InterError('Informe o motivo do cancelamento.', 400);
    res.json({ success: true, cobranca: await cancelarCobranca(req.params.codigoSolicitacao, motivo) });
  }));

  // ---------------- Pix: pagamento e devolução (saídas) ----------------
  r.post('/pagamentos/pix', wrap(async (req, res) => {
    requireSaidas();
    const { idempotencia, ...body } = req.body || {};
    if (!(Number(body.valor) > 0)) throw new InterError('Informe o valor do Pix.', 400);
    if (!body.destinatario?.tipo) throw new InterError('Informe o destinatário do Pix.', 400);
    const idem = String(idempotencia || crypto.randomUUID());
    const result = await interRequest({
      method: 'post', path: '/banking/v2/pix', scope: 'pagamento-pix.write', body,
      headers: { 'x-id-idempotente': idem },
    });
    registrarOperacao({ tipo: 'Pix enviado', valor: Number(body.valor), destinatario: body.destinatario?.chave || body.destinatario?.nome || body.destinatario?.tipo, descricao: body.descricao, resposta: result });
    res.json({ success: true, ...result });
  }));

  r.put('/pix/recebidos/:e2eId/devolucao', wrap(async (req, res) => {
    requireSaidas();
    const id = String(req.body?.id || `D${newTxid(20)}`).slice(0, 35);
    const body: any = { valor: Number(req.body?.valor).toFixed(2) };
    if (req.body?.natureza) body.natureza = req.body.natureza;
    if (req.body?.descricao) body.descricao = String(req.body.descricao).slice(0, 140);
    const result = await interRequest({
      method: 'put', path: `/pix/v2/pix/${encodeURIComponent(req.params.e2eId)}/devolucao/${encodeURIComponent(id)}`,
      scope: 'pix.write', body,
    });
    registrarOperacao({ tipo: 'Devolução de Pix', valor: Number(body.valor), e2eId: req.params.e2eId, resposta: result });
    res.json({ success: true, ...result });
  }));

  // Gera um txid válido para cob/cobv (26 a 35 caracteres alfanuméricos)
  r.get('/pix/novo-txid', (_req, res) => { res.json({ txid: newTxid(32) }); });

  r.get('/operacoes', wrap(async (_req, res) => { res.json(readJson<any[]>(files.interOperacoes, [])); }));

  // ---------------- Webhooks ----------------
  r.get('/webhooks', wrap(async (_req, res) => {
    const out: any[] = [];
    for (const [tipo, def] of Object.entries(WEBHOOKS)) {
      const item: any = { tipo, label: def.label, urlSugerida: webhookReceiverUrl(tipo), temCallbacks: !!def.callbacks };
      try {
        const data = await interRequest<any>({ method: 'get', path: webhookPath(def), scope: def.readScope });
        item.configurado = true;
        item.webhookUrl = data?.webhookUrl;
        item.criacao = data?.criacao;
      } catch (e: any) {
        item.configurado = false;
        if (e.status !== 404) item.erro = e.message;
      }
      out.push(item);
    }
    res.json(out);
  }));

  r.put('/webhooks/:tipo', wrap(async (req, res) => {
    const def = WEBHOOKS[req.params.tipo];
    if (!def) throw new InterError('Tipo de webhook desconhecido.', 404);
    const webhookUrl = String(req.body?.webhookUrl || webhookReceiverUrl(req.params.tipo));
    if (!/^https:\/\//.test(webhookUrl)) throw new InterError('A URL do webhook precisa começar com https://. Configure a URL pública do sistema.', 400);
    await interRequest({ method: 'put', path: webhookPath(def), scope: def.writeScope, body: { webhookUrl } });
    res.json({ success: true, webhookUrl });
  }));

  r.delete('/webhooks/:tipo', wrap(async (req, res) => {
    const def = WEBHOOKS[req.params.tipo];
    if (!def) throw new InterError('Tipo de webhook desconhecido.', 404);
    await interRequest({ method: 'delete', path: webhookPath(def), scope: def.writeScope });
    res.json({ success: true });
  }));

  r.get('/webhooks/:tipo/callbacks', wrap(async (req, res) => {
    const def = WEBHOOKS[req.params.tipo];
    if (!def?.callbacks) throw new InterError('Este webhook não possui consulta de callbacks.', 400);
    res.json(await interRequest({ method: 'get', path: def.callbacks, scope: def.readScope, query: req.query as any }));
  }));

  r.post('/webhooks/:tipo/callbacks/retry', wrap(async (req, res) => {
    const def = WEBHOOKS[req.params.tipo];
    if (!def?.retry) throw new InterError('Este webhook não possui reenvio de callbacks.', 400);
    const body = { ...(req.body || {}) };
    if (req.params.tipo === 'pix' && !body.chavePix) body.chavePix = getSettings().interChavePix;
    res.json(await interRequest({ method: 'post', path: def.retry, scope: def.writeScope, body }));
  }));

  r.get('/webhooks-recebidos', wrap(async (_req, res) => { res.json(readJson<any[]>(files.interWebhookLog, [])); }));

  // ---------------- Repasse genérico ----------------
  for (const p of PROXIES) {
    r[p.method](p.local, wrap(async (req, res) => {
      if (p.saida) requireSaidas();
      if (p.sandboxOnly && loadInterConfig().ambiente !== 'sandbox') throw new InterError('Operação disponível apenas no ambiente Sandbox.', 400);
      const remote = p.remote.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(String(req.params[k] ?? '')));
      const hasBody = ['post', 'put', 'patch'].includes(p.method);
      const data = await interRequest<any>({
        method: p.method,
        path: remote,
        scope: p.scope,
        query: hasBody ? undefined : (req.query as any),
        body: hasBody ? (req.body ?? {}) : undefined,
      });
      if (p.saida) registrarOperacao({ tipo: p.saida, requisicao: hasBody ? req.body : req.params, resposta: data });
      if (p.pdf) return sendPdf(res, data?.pdf, p.pdf());
      res.json(data ?? { success: true });
    }));
  }

  return r;
}

/** Recebedor público dos webhooks (sem JWT): protegido por segredo aleatório na URL. */
export function createInterWebhookReceiver() {
  const r = express.Router();
  r.post('/:secret/:tipo', express.json({ limit: '2mb' }), (req, res) => {
    const expected = Buffer.from(getWebhookSecret());
    const got = Buffer.from(String(req.params.secret));
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected) || !WEBHOOKS[req.params.tipo]) {
      return res.status(404).send('Not found');
    }
    // Responde rápido para o Inter não reenviar; processa em seguida.
    res.status(200).send('OK');
    processarWebhook(req.params.tipo, req.body).catch(e => console.error('Erro ao processar webhook Inter:', e));
  });
  return r;
}
