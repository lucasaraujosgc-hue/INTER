import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import https from 'https';
import axios from 'axios';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import forge from 'node-forge';
import nodemailer from 'nodemailer';
import {
  ensureStorage, files, readJson, writeJson, getSettings, saveSettings, publicSettings, writeSecretFile, SECRET_SETTINGS,
} from './server/storage';
import { createInterRouter, createInterWebhookReceiver } from './server/inter/routes';
import { InterError, interRequest, interStatus, describeCert, certMatchesKey } from './server/inter/client';
import { criarCobrancaInter } from './server/inter/service';
import {
  emitirNfse, obterPdfNfse, cancelarNfse, sincronizarNfse, testarConexaoNacional, nfseConfig, DESCRICAO_PADRAO,
} from './server/nfse/service';
import { WEBSERVICE_URL } from './server/nfse/webiss';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'virgula-contabil-secret-key-2025';

if (!process.env.JWT_SECRET || !process.env.PASSWORD) {
  console.warn('[segurança] Defina JWT_SECRET e PASSWORD no ambiente: o sistema agora movimenta a conta do Banco Inter.');
}

ensureStorage();
app.use(cors());

// Webhooks do Banco Inter (rota pública, protegida por segredo na URL)
app.use('/api/webhooks/inter', createInterWebhookReceiver());

app.use(express.json({ limit: '2mb' }));

// --- HTML Builder Helper ---
const buildEmailHtml = (messageBody: string, documents: any[], emailSignature: string) => {
  let docsTable = '';
  if (documents && documents.length > 0) {
    const sortedDocs = [...documents].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    let rows = '';
    sortedDocs.forEach(doc => {
      rows += `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px; color: #333;">${doc.docName}</td><td style="padding: 10px; color: #555;">${doc.category}</td><td style="padding: 10px; color: #555;">${doc.dueDate || 'N/A'}</td><td style="padding: 10px; color: #555;">${doc.competence}</td></tr>`;
    });
    docsTable = `<h3 style="color: #2c3e50; border-bottom: 2px solid #eff6ff; padding-bottom: 10px; margin-top: 30px; font-size: 16px;">Documentos em Anexo:</h3><table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;"><thead><tr style="background-color: #f8fafc; color: #64748b;"><th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Documento</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Categoria</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Vencimento</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Competência</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  return `<html><body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"><div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #2563eb; margin-bottom: 25px;">${messageBody.replace(/\\n/g, '<br>').replace(/\n/g, '<br>')}</div>${docsTable}<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b;">${emailSignature || ''}</div></div></body></html>`;
};

const upload = multer({ dest: path.join(process.cwd(), 'tmp'), limits: { fileSize: 5 * 1024 * 1024 } });

// --- Auth Middleware ---
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

function errorStatus(err: any) {
  const s = Number(err?.status);
  return s >= 400 && s < 600 ? s : 500;
}

// --- API Routes ---
app.post('/api/auth/login', (req, res) => {
  const { password, remember } = req.body;
  const systemPassword = process.env.PASSWORD || 'admin123';

  if (password === systemPassword) {
    const expiresIn = remember ? '30d' : '1d';
    const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Senha incorreta' });
  }
});

// Certificado Digital A1 (e-CNPJ) usado na assinatura e no mTLS da NFS-e
app.post('/api/cert/upload', authenticate, upload.single('pfxFile'), (req, res) => {
  const file = req.file;
  try {
    const { password } = req.body;
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    if (!password) return res.status(400).json({ error: 'Senha do certificado não fornecida' });

    const pfxBuffer = fs.readFileSync(file.path);
    let privateKeyPem = '';
    let certPem = '';
    let chainPem = '';
    try {
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfxBuffer.toString('binary')), false, password);
      const keyBags = [
        ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
        ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
      ];
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
      if (!keyBags[0]?.key) throw new Error('Chave privada não encontrada no arquivo PFX.');
      privateKeyPem = forge.pki.privateKeyToPem(keyBags[0].key);
      // O PFX costuma trazer a cadeia (AC raiz/intermediária): usa o certificado que corresponde à chave.
      const pems = certBags.filter(b => b.cert).map(b => forge.pki.certificateToPem(b.cert!));
      certPem = pems.find(p => certMatchesKey(p, privateKeyPem)) || '';
      chainPem = pems.filter(p => p !== certPem).join('\n');
      if (!certPem) throw new Error('Certificado correspondente à chave privada não encontrado no PFX.');
    } catch (err: any) {
      return res.status(400).json({ error: 'Senha do certificado incorreta ou arquivo inválido: ' + err.message });
    }

    fs.copyFileSync(file.path, path.join(path.dirname(files.certPem), 'certificado.pfx'));
    writeSecretFile(files.keyPem, privateKeyPem);
    writeSecretFile(files.certPem, certPem);
    if (chainPem) writeSecretFile(files.chainPem, chainPem); else if (fs.existsSync(files.chainPem)) fs.unlinkSync(files.chainPem);
    // Remove o PDF em cache de notas antigas não é necessário; apenas apaga a senha em texto puro de versões anteriores.
    const legacyInfo = path.join(path.dirname(files.certPem), 'cert_info.json');
    if (fs.existsSync(legacyInfo)) fs.unlinkSync(legacyInfo);

    const info = describeCert(certPem);
    res.json({ success: true, message: `Certificado importado e validado: ${info?.subject || ''} (válido até ${info?.validTo?.slice(0, 10) || '?'})`, cert: info });
  } catch (error: any) {
    console.error('Erro ao processar certificado:', error);
    res.status(500).json({ error: 'Erro interno ao processar certificado' });
  } finally {
    if (file) fs.promises.unlink(file.path).catch(() => undefined);
  }
});

app.get('/api/clients', authenticate, (_req, res) => {
  res.json(readJson<any[]>(files.clients, []));
});

app.post('/api/clients', authenticate, (req, res) => {
  try {
    const clients = readJson<any[]>(files.clients, []);
    const newClient = {
      id: Date.now().toString(),
      ...req.body,
      init: String(req.body.name || '?').charAt(0).toUpperCase(),
      color: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'][Math.floor(Math.random() * 5)],
    };
    clients.push(newClient);
    writeJson(files.clients, clients);
    res.json({ success: true, client: newClient });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar cliente' });
  }
});

app.put('/api/clients/:id', authenticate, (req, res) => {
  try {
    const clients = readJson<any[]>(files.clients, []);
    const index = clients.findIndex((c: any) => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Cliente não encontrado' });
    clients[index] = { ...clients[index], ...req.body };
    writeJson(files.clients, clients);
    res.json({ success: true, client: clients[index] });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

app.get('/api/receitaws/:cnpj', authenticate, async (req, res) => {
  try {
    const cleanCnpj = req.params.cnpj.replace(/\D/g, '');
    const receitawsRes = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`);
    if (!receitawsRes.ok) return res.status(receitawsRes.status).json({ error: 'Erro na ReceitaWS' });
    res.json(await receitawsRes.json());
  } catch (error) {
    res.status(500).json({ error: 'Erro ao consultar ReceitaWS' });
  }
});

app.delete('/api/clients/:id', authenticate, (req, res) => {
  try {
    const clients = readJson<any[]>(files.clients, []);
    const updatedClients = clients.filter((c: any) => c.id !== req.params.id);
    if (clients.length === updatedClients.length) return res.status(404).json({ error: 'Cliente não encontrado' });
    writeJson(files.clients, updatedClients);
    res.json({ success: true, message: 'Cliente excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir cliente' });
  }
});

app.get('/api/settings', authenticate, (_req, res) => {
  try {
    const settings = getSettings();
    const hasCertificate = fs.existsSync(files.certPem) && fs.existsSync(files.keyPem);
    const certInfo = hasCertificate ? describeCert(fs.readFileSync(files.certPem, 'utf-8')) : null;
    const inter = interStatus();
    res.json({
      ...publicSettings(settings),
      hasCertificate,
      certInfo,
      interConfigured: inter.configured,
      interHasCert: inter.hasCert,
      nfse: nfseConfig(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler configurações' });
  }
});

app.post('/api/settings', authenticate, (req, res) => {
  try {
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (['hasCertificate', 'certInfo', 'nfse', 'interConfigured', 'interHasCert'].includes(k) || k.endsWith('Set')) continue;
      if (SECRET_SETTINGS.includes(k) && (!v || k === 'interWebhookSecret')) continue; // segredo vazio não apaga o salvo
      patch[k] = v;
    }
    const newSettings = saveSettings(patch);
    res.json({ success: true, settings: publicSettings(newSettings) });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// --- Cobranças ---
app.get('/api/cobrancas', authenticate, (_req, res) => {
  try {
    const cobrancas = readJson<any[]>(files.cobrancas, []);
    const clients = readJson<any[]>(files.clients, []);
    const enriched = cobrancas.map((c: any) => {
      const clientObj = clients.find(cl => cl.id === c.client || cl.name === c.clientName);
      return { ...c, clientEmail: clientObj ? clientObj.email : '' };
    });
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler cobranças' });
  }
});

app.post('/api/cobrancas', authenticate, async (req, res) => {
  try {
    const data = req.body || {};
    const toggles = data.toggles || {};
    const modoNfse: 'nao' | 'agora' | 'ao_pagar' = !toggles.nfse ? 'nao' : (toggles.boleto && toggles.nfseAoPagar !== false ? 'ao_pagar' : 'agora');
    const dadosNfse = {
      descricao: data.descricao,
      competencia: data.competencia,
      cTribNac: data.cTribNac,
      pAliq: data.pAliq,
      tpRetISSQN: data.tpRetISSQN,
    };

    if (toggles.boleto) {
      const result = await criarCobrancaInter({
        clienteId: data.clienteId,
        cliente: data.cliente,
        valor: Number(data.valor),
        vencimento: data.vencimento,
        mensagem: data.mensagemBoleto,
        multa: data.multa,
        mora: data.mora,
        desconto: data.desconto,
        numDiasAgenda: data.numDiasAgenda,
        emitirNfse: modoNfse,
        nfse: dadosNfse,
      });
      const partes = ['Boleto com Pix emitido no Banco Inter.'];
      if (modoNfse === 'ao_pagar') partes.push('A NFS-e será emitida automaticamente quando o pagamento for confirmado.');
      if (result.nfse?.success) partes.push(result.nfse.message);
      if (result.nfse && !result.nfse.success) partes.push(`NFS-e não emitida: ${result.nfse.error}`);
      return res.json({ success: true, message: partes.join(' '), cobranca: result.cobranca, nfse: result.nfse });
    }

    // Cobrança apenas local (sem boleto)
    const clients = readJson<any[]>(files.clients, []);
    const client = clients.find(c => c.id === data.clienteId) || clients.find(c => c.name === data.cliente);
    let nfseId: string | null = null;
    let message = 'Cobrança registrada no sistema.';
    if (modoNfse === 'agora') {
      const r = await emitirNfse({ ...dadosNfse, clienteId: client?.id, cliente: data.cliente, valor: data.valor, origem: { tipo: 'cobranca' } });
      if (!r.success) return res.status(r.status || 400).json({ error: r.error, xmlPreview: r.xmlPreview });
      nfseId = r.nfse.id;
      message += ' ' + r.message;
    }
    const cobrancasList = readJson<any[]>(files.cobrancas, []);
    const newCobranca = {
      id: `COB-${Date.now()}`,
      origem: 'sistema',
      client: client?.id || data.cliente,
      clientName: client?.name || data.cliente,
      value: Number(data.valor),
      due: data.vencimento,
      status: 'pending',
      boleto: null,
      nfse: nfseId,
    };
    cobrancasList.push(newCobranca);
    writeJson(files.cobrancas, cobrancasList);
    res.json({ success: true, message, cobranca: newCobranca });
  } catch (error: any) {
    console.error('Erro ao criar cobrança:', error.message);
    res.status(errorStatus(error)).json({ error: error.message || 'Erro interno ao criar cobrança' });
  }
});

app.patch('/api/cobrancas/:id', authenticate, (req, res) => {
  const list = readJson<any[]>(files.cobrancas, []);
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Cobrança não encontrada' });
  const allowed = ['status', 'emitirNfseAoPagar', 'nfseDados', 'nfse'];
  for (const k of allowed) if (k in (req.body || {})) c[k] = req.body[k];
  writeJson(files.cobrancas, list);
  res.json({ success: true, cobranca: c });
});

app.delete('/api/cobrancas/:id', authenticate, (req, res) => {
  const list = readJson<any[]>(files.cobrancas, []);
  const next = list.filter(x => x.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'Cobrança não encontrada' });
  writeJson(files.cobrancas, next);
  res.json({ success: true });
});

// --- NFS-e ---
app.get('/api/nfse', authenticate, (_req, res) => {
  res.json(readJson<any[]>(files.nfse, []));
});

app.post('/api/nfse/emitir', authenticate, async (req, res) => {
  try {
    const r = await emitirNfse(req.body || {});
    if (!r.success) return res.status(r.status || 400).json({ error: r.error, erros: r.erros, xmlPreview: r.xmlPreview });
    res.json({ success: true, message: r.message, nfse: r.nfse });
  } catch (error: any) {
    console.error('Erro ao emitir NFS-e:', error);
    res.status(500).json({ error: error.message || 'Erro interno ao emitir NFS-e' });
  }
});

app.get('/api/nfse/:id/pdf', authenticate, async (req, res) => {
  try {
    const pdfPath = await obterPdfNfse(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.id}.pdf"`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (error: any) {
    console.error('Erro ao gerar/obter PDF:', error.message);
    res.status(errorStatus(error)).json({ error: error.message || 'Erro ao gerar o PDF da nota fiscal.' });
  }
});

app.get('/api/nfse/:id/xml', authenticate, (req, res) => {
  const nfse = readJson<any[]>(files.nfse, []).find(n => n.id === req.params.id);
  if (!nfse) return res.status(404).json({ error: 'NFS-e não encontrada' });
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nfse.chaveAcesso || nfse.id}.xml"`);
  res.send(nfse.nfseXml || nfse.xml || '');
});

app.post('/api/nfse/:id/sincronizar', authenticate, async (req, res) => {
  try {
    res.json({ success: true, nfse: await sincronizarNfse(req.params.id) });
  } catch (error: any) {
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.post('/api/nfse/:id/cancelar', authenticate, async (req, res) => {
  try {
    const { codigoMotivo, motivo } = req.body || {};
    const cod = ['1', '2', '9'].includes(String(codigoMotivo)) ? String(codigoMotivo) as '1' | '2' | '9' : '9';
    res.json({ success: true, message: 'NFS-e cancelada na Sefin Nacional.', nfse: await cancelarNfse(req.params.id, cod, motivo) });
  } catch (error: any) {
    res.status(errorStatus(error)).json({ error: error.message, erros: error.erros });
  }
});

app.delete('/api/nfse/:id', authenticate, (req, res) => {
  try {
    const nfse = readJson<any[]>(files.nfse, []);
    const index = nfse.findIndex((n: any) => n.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'NFS-e não encontrada' });
    const n = nfse[index];
    if (n.provedor === 'nacional' && n.status === 'issued' && n.ambiente === '1') {
      return res.status(400).json({ error: 'Esta NFS-e está autorizada na Sefin Nacional. Cancele a nota antes de excluir o registro.' });
    }
    nfse.splice(index, 1);
    writeJson(files.nfse, nfse);
    res.json({ success: true, message: 'Registro da NFS-e excluído.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir NFS-e' });
  }
});

app.post('/api/nfse/test-connection', authenticate, async (_req, res) => {
  try {
    if (nfseConfig().provedor === 'nacional') {
      const r = await testarConexaoNacional();
      const ok = r.status >= 200 && r.status < 500;
      return res.status(ok ? 200 : 502).json({
        success: ok,
        message: ok
          ? `Conexão mTLS com a Sefin Nacional estabelecida (${r.ambiente === '2' ? 'produção restrita' : 'produção'}, HTTP ${r.status}).`
          : `Sefin Nacional respondeu HTTP ${r.status}.`,
        convenio: r.convenio,
      });
    }
    const certPem = fs.readFileSync(files.certPem, 'utf-8');
    const keyPem = fs.readFileSync(files.keyPem, 'utf-8');
    const httpsAgent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false });
    try {
      const response = await axios.get(WEBSERVICE_URL, { httpsAgent, timeout: 10000 });
      res.json({ success: true, message: 'Conexão bem-sucedida!', status: response.status });
    } catch (axiosError: any) {
      if (axiosError.response) return res.json({ success: true, message: `Conexão estabelecida (Status: ${axiosError.response.status})` });
      throw axiosError;
    }
  } catch (error: any) {
    console.error('Erro ao testar conexão:', error.message);
    res.status(errorStatus(error)).json({ error: `Falha na conexão: ${error.message}` });
  }
});

// --- Banco Inter (todas as APIs) ---
app.use('/api/inter', authenticate, createInterRouter());

// --- E-mail ---
app.post('/api/send-email', authenticate, async (req, res) => {
  try {
    const { to, subject, messageBody, documents, cc, bcc } = req.body;
    if (!process.env.MAIL_USERNAME || !process.env.MAIL_PASSWORD) {
      return res.status(400).json({ error: 'Configurações de SMTP (MAIL_USERNAME, MAIL_PASSWORD) não definidas no .env' });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_SERVER || 'smtp.hostinger.com',
      port: Number(process.env.MAIL_PORT) || 465,
      secure: process.env.MAIL_PORT ? process.env.MAIL_PORT === '465' : true,
      auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD },
      tls: { rejectUnauthorized: false },
    });

    const emailSignature = `<p>Atenciosamente,</p>

<table style="margin-top: 20px; border-top: 1px solid #eee;" cellpadding="0" cellspacing="0">
  <tr>
    <td style="vertical-align: middle; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4; padding-right: 15px;">
      <strong style="color: #38b38d; font-size: 16px;">Lucas Araujo</strong><br>
      <span style="color: #555;">Contador | CRC-BA 046968/O</span><br>
      <span style="color: #555;">contato@virgulacontabil.com.br</span><br>
      <strong style="color: #38b38d;">(75) 98120-0125</strong>
    </td>
    <td style="vertical-align: middle;">
      <a href="https://www.virgulacontabil.com.br">
        <img src="https://www.virgulacontabil.com.br/wp-content/uploads/2026/03/Sem-titulo-1.png"
             width="220"
             style="display: block;"
             alt="Logo Virgula Contábil">
      </a>
    </td>
  </tr>
</table>`;

    const htmlContent = buildEmailHtml(messageBody, documents || [], emailSignature);
    const attachments: any[] = [];
    const nfseList = readJson<any[]>(files.nfse, []);
    const cobrancas = readJson<any[]>(files.cobrancas, []);
    for (const doc of documents || []) {
      if (doc.contentStr) attachments.push({ filename: `${doc.docName}.xml`, content: doc.contentStr });
      if (doc.cobrancaId) {
        const cob = cobrancas.find(c => c.id === doc.cobrancaId);
        const codigo = cob?.inter?.codigoSolicitacao;
        if (codigo) {
          try {
            const r = await interRequest<{ pdf: string }>({ method: 'get', path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigo)}/pdf`, scope: 'boleto-cobranca.read' });
            if (r?.pdf) attachments.push({ filename: `Boleto_${cob.inter.seuNumero || cob.id}.pdf`, content: Buffer.from(r.pdf, 'base64') });
          } catch (e: any) {
            console.error('Erro ao anexar boleto:', e.message);
          }
        }
      }
      if (doc.nfseId) {
        try {
          const nfse = nfseList.find((n: any) => n.id === doc.nfseId);
          if (nfse) {
            const pdfPath = await obterPdfNfse(nfse.id);
            attachments.push({ filename: `NFS-e_${nfse.numero || nfse.id}.pdf`, path: pdfPath });
            if (nfse.nfseXml) attachments.push({ filename: `NFS-e_${nfse.numero || nfse.id}.xml`, content: nfse.nfseXml });
          }
        } catch (e) {
          console.error('Erro ao anexar PDF da nfse:', e);
        }
      }
    }

    await transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || 'Vírgula Contábil'}" <${process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME}>`,
      to, cc, bcc, subject, html: htmlContent, attachments,
    });
    res.json({ success: true, message: 'E-mail enviado com sucesso!', anexos: attachments.map(a => a.filename) });
  } catch (error: any) {
    console.error('Erro ao enviar e-mail:', error);
    res.status(500).json({ error: error.message || 'Erro interno ao enviar e-mail' });
  }
});

app.get('/api/nfse-defaults', authenticate, (_req, res) => {
  res.json({ descricaoPadrao: DESCRICAO_PADRAO });
});

// Erros inesperados nas rotas da API
app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err instanceof InterError ? errorStatus(err) : 500;
  res.status(status).json({ error: err?.message || 'Erro interno' });
});

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

startServer();
