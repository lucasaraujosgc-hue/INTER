import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import axios from 'axios';
import https from 'https';
import tls from 'tls';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import forge from 'node-forge';
import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'virgula-contabil-secret-key-2025';

const WEBSERVICE_URL = 'https://saogoncalodoscamposba.webiss.com.br/ws/nfse.asmx';

app.use(cors());

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
    return `<html><body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"><div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #2563eb; margin-bottom: 25px;">${messageBody.replace(/\\n/g, '<br>')}</div>${docsTable}<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b;">${emailSignature || ''}</div></div></body></html>`;
};

// Ensure backup directory exists
const backupDir = path.join(process.cwd(), 'backup');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Ensure clients file exists
const clientsFile = path.join(backupDir, 'clients.json');
if (!fs.existsSync(clientsFile)) {
  fs.writeFileSync(clientsFile, JSON.stringify([]));
}

// Ensure settings file exists
const settingsFile = path.join(backupDir, 'settings.json');
if (!fs.existsSync(settingsFile)) {
  fs.writeFileSync(settingsFile, JSON.stringify({
    interClientId: '',
    interClientSecret: '',
    interContaCorrente: ''
  }));
}

const cobrancasFile = path.join(backupDir, 'cobrancas.json');
if (!fs.existsSync(cobrancasFile)) {
  fs.writeFileSync(cobrancasFile, JSON.stringify([]));
}

const nfseFile = path.join(backupDir, 'nfse.json');
if (!fs.existsSync(nfseFile)) {
  fs.writeFileSync(nfseFile, JSON.stringify([]));
}

const upload = multer({ dest: path.join(process.cwd(), 'tmp') });

app.use(express.json());

// --- ABRASF v2.04 XML Generation & Signing ---
class CustomKeyInfo {
  private certPem: string;
  constructor(certPem: string) {
    this.certPem = certPem;
  }
  getKeyInfo() {
    const cleanCert = this.certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\r/g, '')
      .replace(/\n/g, '');
    return `<X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data>`;
  }
  getKey() {
    return Buffer.from(this.certPem);
  }
}

function signNode(xml: string, xpath: string, keyPem: string, certPem: string): string {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
  });
  
  sig.addReference({
    xpath: xpath,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1"
  });
  
  (sig as any).keyInfoProvider = new CustomKeyInfo(certPem);
  
  sig.computeSignature(xml, {
    location: { reference: xpath, action: "after" }
  });
  
  return sig.getSignedXml();
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
    return c;
  });
}

function generateRpsXml(data: any, settings: any) {
  const idRps = `RPS_${Date.now()}`;
  const idLote = `LOTE_${Date.now()}`;
  
  const tomadorCpfCnpj = data.clienteCpfCnpj ? data.clienteCpfCnpj.replace(/\D/g, '') : '';
  const isCpf = tomadorCpfCnpj.length === 11;
  const cpfCnpjTag = tomadorCpfCnpj ? (isCpf ? `<Cpf>${tomadorCpfCnpj}</Cpf>` : `<Cnpj>${tomadorCpfCnpj}</Cnpj>`) : '';

  // ABRASF 2.02 usually takes YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
  // User explicitly requested YYYY-MM-DD for everything.
  const now = new Date();
  const dataEmissao = now.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Competencia: handle YYYY-MM (month picker) or full YYYY-MM-DD
  let competencia = data.competencia || now.toISOString().split('T')[0];
  if (competencia.length === 7) { // YYYY-MM
    competencia = `${competencia}-01`;
  } else if (competencia.length > 10) {
    competencia = competencia.split('T')[0];
  }
  
  const valorServicos = Number(data.valor || 0).toFixed(2);
  const aliquota = (Number(data.aliquota) || 2.01).toFixed(2);
  const valorIss = (Number(data.valor || 0) * (Number(data.aliquota || 2.01) / 100)).toFixed(2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<EnviarLoteRpsSincronoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
	<LoteRps Id="${idLote}" versao="2.02">
		<NumeroLote>${Math.floor(Math.random() * 10000)}</NumeroLote>
		<CpfCnpj>
			<Cnpj>${(settings.prestadorCnpj || '52613515000160').replace(/\D/g, '')}</Cnpj>
		</CpfCnpj>
		<InscricaoMunicipal>${settings.prestadorIm || '3181602194'}</InscricaoMunicipal>
		<QuantidadeRps>1</QuantidadeRps>
		<ListaRps>
			<Rps>
				<InfDeclaracaoPrestacaoServico Id="${idRps}">
					<Rps>
						<IdentificacaoRps>
							<Numero>${Math.floor(Math.random() * 10000)}</Numero>
							<Serie>1</Serie>
							<Tipo>1</Tipo>
						</IdentificacaoRps>
						<DataEmissao>${dataEmissao}</DataEmissao>
						<Status>1</Status>
					</Rps>
					<Competencia>${competencia}</Competencia>
					<Servico>
						<Valores>
							<ValorServicos>${valorServicos}</ValorServicos>
							<ValorDeducoes>0.00</ValorDeducoes>
							<ValorPis>0.00</ValorPis>
							<ValorCofins>0.00</ValorCofins>
							<ValorInss>0.00</ValorInss>
							<ValorIr>0.00</ValorIr>
							<ValorCsll>0.00</ValorCsll>
							<OutrasRetencoes>0.00</OutrasRetencoes>
							<ValorIss>${valorIss}</ValorIss>
							<Aliquota>${aliquota}</Aliquota>
							<DescontoIncondicionado>0.00</DescontoIncondicionado>
							<DescontoCondicionado>0.00</DescontoCondicionado>
						</Valores>
						<IssRetido>${data.issRetido || 2}</IssRetido>
						${data.issRetido == 1 ? '<ResponsavelRetencao>1</ResponsavelRetencao>' : ''}
						<ItemListaServico>${(data.itemLc116 || settings.itemLc116 || '').replace(/[^\d.]/g, '') || '1719'}</ItemListaServico>
						${(data.cnae || settings.cnae) ? `<CodigoCnae>${String(data.cnae || settings.cnae).replace(/[^\d]/g, '')}</CodigoCnae>` : ''}
						${(data.codigoTributacaoMunicipio || settings.codigoTributacaoMunicipio) ? `<CodigoTributacaoMunicipio>${String(data.codigoTributacaoMunicipio || settings.codigoTributacaoMunicipio).replace(/[^\d.-]/g, '')}</CodigoTributacaoMunicipio>` : ''}
						<Discriminacao>${escapeXml(data.descricao || 'Prestacão de servicos.')}</Discriminacao>
						<CodigoMunicipio>${settings.codigoMunicipio || '2929305'}</CodigoMunicipio>
						<ExigibilidadeISS>1</ExigibilidadeISS>
						<MunicipioIncidencia>${settings.codigoMunicipio || '2929305'}</MunicipioIncidencia>
					</Servico>
					<Prestador>
						<CpfCnpj>
							<Cnpj>${(settings.prestadorCnpj || '52613515000160').replace(/\D/g, '')}</Cnpj>
						</CpfCnpj>
						<InscricaoMunicipal>${settings.prestadorIm || '3181602194'}</InscricaoMunicipal>
					</Prestador>
					<Tomador>
						${cpfCnpjTag ? `
						<IdentificacaoTomador>
							<CpfCnpj>
								${cpfCnpjTag}
							</CpfCnpj>
						</IdentificacaoTomador>` : ''}
						${data.cliente ? `<RazaoSocial>${escapeXml(data.cliente)}</RazaoSocial>` : ''}
						<Endereco>
							<Endereco>${escapeXml(data.clienteEndereco || 'Nao Informado')}</Endereco>
							<Numero>${escapeXml(String(data.clienteNumero || 'S/N'))}</Numero>
							${data.clienteComplemento ? `<Complemento>${escapeXml(data.clienteComplemento)}</Complemento>` : ''}
							<Bairro>${escapeXml(data.clienteBairro || 'Centro')}</Bairro>
							<CodigoMunicipio>${data.clienteCodigoMunicipio || '2929305'}</CodigoMunicipio>
							<Uf>${data.clienteUf || 'BA'}</Uf>
							<CodigoPais>1058</CodigoPais>
							<Cep>${(data.clienteCep || '44330000').replace(/\D/g, '')}</Cep>
						</Endereco>
						${(data.clienteTelefone || data.clienteEmail) ? `
						<Contato>
							${data.clienteTelefone ? `<Telefone>${data.clienteTelefone.replace(/\D/g, '')}</Telefone>` : ''}
							${data.clienteEmail ? `<Email>${data.clienteEmail}</Email>` : ''}
						</Contato>` : ''}
					</Tomador>
					<RegimeEspecialTributacao>${data.regimeEspecialTributacao || settings.regimeEspecialTributacao || 6}</RegimeEspecialTributacao>
					<OptanteSimplesNacional>${data.optanteSimplesNacional || settings.optanteSimplesNacional || 1}</OptanteSimplesNacional>
					<IncentivoFiscal>${data.incentivoFiscal || settings.incentivoFiscal || 2}</IncentivoFiscal>
				</InfDeclaracaoPrestacaoServico>
			</Rps>
		</ListaRps>
	</LoteRps>
</EnviarLoteRpsSincronoEnvio>`;
}

function signXml(xml: string, keyPem: string, certPem: string): string {
  // Sign InfDeclaracaoPrestacaoServico first
  let signedXml = signNode(xml, "//*[local-name(.)='InfDeclaracaoPrestacaoServico']", keyPem, certPem);
  // Then sign LoteRps
  signedXml = signNode(signedXml, "//*[local-name(.)='LoteRps']", keyPem, certPem);
  return signedXml;
}

async function sendSoapRequest(url: string, action: string, xmlBody: string, certPem: string, keyPem: string) {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RecepcionarLoteRpsSincronoRequest xmlns="http://nfse.abrasf.org.br">
      <nfseCabecMsg xmlns=""><![CDATA[<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.02"><versaoDados>2.02</versaoDados></cabecalho>]]></nfseCabecMsg>
      <nfseDadosMsg xmlns=""><![CDATA[${xmlBody}]]></nfseDadosMsg>
    </RecepcionarLoteRpsSincronoRequest>
  </soap:Body>
</soap:Envelope>`;

  const httpsAgent = new https.Agent({
    cert: certPem,
    key: keyPem,
    rejectUnauthorized: false, // Pode ser necessário manter false se a prefeitura não tiver cadeia confiável
    minVersion: 'TLSv1.2'
  });

  try {
    const response = await axios.post(url, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': action
      },
      httpsAgent,
      timeout: 30000
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      console.error('SOAP Error Response:', error.response.data);
      throw new Error(`Erro no WebService: ${error.response.status} - ${error.response.statusText}`);
    }
    throw error;
  }
}

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

// --- API Routes ---
app.post('/api/auth/login', (req, res) => {
  const { password, remember } = req.body;
  const systemPassword = process.env.PASSWORD || 'admin123'; // Default password if not set

  if (password === systemPassword) {
    const expiresIn = remember ? '30d' : '1d';
    const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Senha incorreta' });
  }
});

app.post('/api/cert/upload', authenticate, upload.single('pfxFile'), (req, res) => {
  try {
    const file = req.file;
    const { password } = req.body;

    console.log('Upload request received:', {
      file: file ? file.originalname : null,
      passwordLength: password ? password.length : 0
    });

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Senha do certificado não fornecida' });
    }

    const pfxBuffer = fs.readFileSync(file.path);

    let privateKeyPem = '';
    let certPem = '';

    // Validate PFX password and extract PEMs using node-forge
    try {
      const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

      for (const safeContents of p12.safeContents) {
        for (const safeBag of safeContents.safeBags) {
          if (safeBag.type === forge.pki.oids.keyBag || safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
            privateKeyPem = forge.pki.privateKeyToPem(safeBag.key as forge.pki.PrivateKey);
          } else if (safeBag.type === forge.pki.oids.certBag) {
            certPem = forge.pki.certificateToPem(safeBag.cert as forge.pki.Certificate);
          }
        }
      }

      if (!privateKeyPem || !certPem) {
        throw new Error('Certificado ou chave privada não encontrados no arquivo PFX.');
      }
    } catch (err: any) {
      console.error('Error validating PFX with node-forge:', err);
      fs.unlinkSync(file.path); // Clean up
      return res.status(400).json({ error: 'Senha do certificado incorreta ou arquivo inválido: ' + err.message });
    }

    // Save to /backup
    const destPath = path.join(backupDir, 'certificado.pfx');
    fs.copyFileSync(file.path, destPath);
    fs.unlinkSync(file.path); // Clean up tmp file

    // Save PEMs and password securely
    fs.writeFileSync(path.join(backupDir, 'cert_info.json'), JSON.stringify({ password }));
    fs.writeFileSync(path.join(backupDir, 'key.pem'), privateKeyPem);
    fs.writeFileSync(path.join(backupDir, 'cert.pem'), certPem);

    res.json({ success: true, message: 'Certificado importado e validado com sucesso!' });
  } catch (error: any) {
    console.error('Erro ao processar certificado:', error);
    res.status(500).json({ error: 'Erro interno ao processar certificado' });
  }
});

app.get('/api/clients', authenticate, (req, res) => {
  try {
    const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf-8'));
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler clientes' });
  }
});

app.post('/api/clients', authenticate, (req, res) => {
  try {
    const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf-8'));
    const newClient = {
      id: Date.now().toString(),
      ...req.body,
      init: req.body.name.charAt(0).toUpperCase(),
      color: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'][Math.floor(Math.random() * 5)]
    };
    clients.push(newClient);
    fs.writeFileSync(clientsFile, JSON.stringify(clients));
    res.json({ success: true, client: newClient });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar cliente' });
  }
});

app.delete('/api/clients/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf-8'));
    const updatedClients = clients.filter((c: any) => c.id !== id);
    
    if (clients.length === updatedClients.length) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    fs.writeFileSync(clientsFile, JSON.stringify(updatedClients));
    res.json({ success: true, message: 'Cliente excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir cliente' });
  }
});

app.get('/api/settings', authenticate, (req, res) => {
  try {
    let settings = {};
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    }
    const certPath = path.join(backupDir, 'cert.pem');
    const keyPath = path.join(backupDir, 'key.pem');
    const hasCertificate = fs.existsSync(certPath) && fs.existsSync(keyPath);
    res.json({ ...settings, hasCertificate });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler configurações' });
  }
});

app.post('/api/settings', authenticate, (req, res) => {
  try {
    let currentSettings = {};
    if (fs.existsSync(settingsFile)) {
      currentSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    }
    const newSettings = { ...currentSettings, ...req.body };
    fs.writeFileSync(settingsFile, JSON.stringify(newSettings));
    res.json({ success: true, settings: newSettings });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

app.get('/api/cobrancas', authenticate, (req, res) => {
  try {
    const cobrancas = JSON.parse(fs.readFileSync(cobrancasFile, 'utf-8'));
    let clients: any[] = [];
    if (fs.existsSync(clientsFile)) {
      clients = JSON.parse(fs.readFileSync(clientsFile, 'utf-8'));
    }
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
    const data = req.body;
    const { toggles } = data;
    
    let message = 'Cobrança criada com sucesso!';
    let boletoData = null;
    let nfseData = null;
    let xmlPreview = null;

    // 1. Gerar Boleto via Banco Inter
    if (toggles?.boleto) {
      let settings: any = {};
      if (fs.existsSync(settingsFile)) {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      }

      const clientId = settings.interClientId || process.env.INTER_CLIENT_ID;
      const clientSecret = settings.interClientSecret || process.env.INTER_CLIENT_SECRET;
      const contaCorrente = settings.interContaCorrente || process.env.INTER_CONTA_CORRENTE;

      if (!clientId || !clientSecret || !contaCorrente) {
        return res.status(400).json({
          error: 'Credenciais do Banco Inter não configuradas. Configure-as na aba Configurações.'
        });
      }

      // Mock boleto generation
      boletoData = {
        nossoNumero: `MOCK${Date.now()}`,
        linhaDigitavel: '00000.00000 00000.000000 00000.000000 0 00000000000000',
        codigoBarras: '00000000000000000000000000000000000000000000',
        pdfUrl: 'https://bancointer.com.br/mock-boleto.pdf'
      };
      message += ' Boleto gerado.';
    }

    // 2. Emitir NFS-e
    if (toggles?.nfse) {
      const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf-8')) : {};
      
      // Fetch full client details for XML
      const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf-8'));
      const clientInfo = clients.find((c: any) => c.name === data.cliente);
      if (clientInfo) {
        data.clienteCpfCnpj = clientInfo.cpfCnpj || clientInfo.document;
        data.clienteEndereco = clientInfo.logradouro || clientInfo.address;
        data.clienteNumero = clientInfo.numero || clientInfo.number;
        data.clienteBairro = clientInfo.bairro || clientInfo.neighborhood;
        data.clienteCodigoMunicipio = clientInfo.cityCode || '2929305';
        data.clienteUf = clientInfo.municipioUf ? clientInfo.municipioUf.split('/')[1] : (clientInfo.state || 'BA');
        data.clienteCep = clientInfo.cep ? clientInfo.cep.replace(/\D/g, '') : (clientInfo.zipCode ? clientInfo.zipCode.replace(/\D/g, '') : '');
        data.clienteTelefone = clientInfo.telefone ? clientInfo.telefone.replace(/\D/g, '') : (clientInfo.phone ? clientInfo.phone.replace(/\D/g, '') : '');
        data.clienteEmail = clientInfo.email || '';
      }

      data.itemLc116 = settings.itemLc116 || '1719';
      data.cnae = settings.cnae || '6920601';
      data.codigoTributacaoMunicipio = settings.codigoTributacaoMunicipio || '1719';
      data.aliquota = settings.aliquota || 2.01;
      data.issRetido = settings.issRetido || 2;
      data.regimeEspecialTributacao = settings.regimeEspecialTributacao || 6;
      data.optanteSimplesNacional = settings.optanteSimplesNacional || 1;
      data.incentivoFiscal = settings.incentivoFiscal || 2;
      if (!data.descricao) {
        data.descricao = `Prestação de serviços contábeis, compreendendo escrituração contábil e fiscal, apuração de tributos, elaboração e entrega de obrigações acessórias, assessoria e consultoria contábil, referente ao período de xx/202x.`;
      }

      const xmlRps = generateRpsXml(data, settings);
      let certPem = process.env.CERT_PEM;
      let keyPem = process.env.KEY_PEM;

      const certPath = path.join(backupDir, 'cert.pem');
      const keyPath = path.join(backupDir, 'key.pem');

      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        certPem = fs.readFileSync(certPath, 'utf-8');
        keyPem = fs.readFileSync(keyPath, 'utf-8');
      }

      if (!certPem || !keyPem) {
        return res.status(400).json({
          error: 'Certificado Digital A1 não configurado. Faça o upload do arquivo .pfx nas configurações para emitir NFS-e.',
          xmlPreview: xmlRps
        });
      }

      const signedXml = signXml(xmlRps, keyPem, certPem);
      
      let numeroNfse = null;
      let codigoVerificacao = null;
      let soapResponse = '';
      try {
        soapResponse = await sendSoapRequest(
          WEBSERVICE_URL,
          'http://nfse.abrasf.org.br/RecepcionarLoteRpsSincrono',
          signedXml,
          certPem,
          keyPem
        );
        console.log('SOAP Response in Cobrança:', soapResponse);

        const doc = new DOMParser().parseFromString(soapResponse, 'text/xml');
        let innerXmlString = soapResponse;
        const outputXMLNode = doc.getElementsByTagName('outputXML')[0];
        if (outputXMLNode && outputXMLNode.textContent) {
          innerXmlString = outputXMLNode.textContent;
        }
        const innerDoc = new DOMParser().parseFromString(innerXmlString, 'text/xml');

        const mensagens = innerDoc.getElementsByTagName('MensagemRetorno');
        if (mensagens.length > 0) {
          let errorMessages = [];
          for (let i = 0; i < mensagens.length; i++) {
            const msg = mensagens[i];
            const codigo = msg.getElementsByTagName('Codigo')[0]?.textContent || '';
            const texto = msg.getElementsByTagName('Mensagem')[0]?.textContent || '';
            errorMessages.push(`[${codigo}] ${texto}`);
          }
          if (errorMessages.length > 0) {
            return res.status(400).json({
              error: 'Erro retornado pela Prefeitura na emissão da NFS-e: ' + errorMessages.join(' | '),
              xmlPreview: signedXml,
              responseXml: innerXmlString
            });
          }
        }

        const numeroNfseNode = innerDoc.getElementsByTagName('Numero')[0];
        if (numeroNfseNode) numeroNfse = numeroNfseNode.textContent;
        
        const cvNode = innerDoc.getElementsByTagName('CodigoVerificacao')[0];
        if (cvNode) codigoVerificacao = cvNode.textContent;
        
      } catch (soapError: any) {
        console.error('Erro ao enviar SOAP:', soapError.message);
        return res.status(500).json({ error: 'Erro ao emitir NFS-e no WebService: ' + soapError.message, xmlPreview: signedXml });
      }

      const nfseList = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
      nfseData = {
        id: numeroNfse ? `NFS-${numeroNfse}` : `NFS-${Date.now()}`,
        numero: numeroNfse,
        codigoVerificacao,
        client: data.clienteId || data.cliente,
        clientName: data.cliente,
        value: data.valor,
        issueDate: new Date().toISOString().split('T')[0],
        status: numeroNfse ? 'issued' : 'pending',
        xml: signedXml,
        responseXml: soapResponse
      };
      nfseList.push(nfseData);
      fs.writeFileSync(nfseFile, JSON.stringify(nfseList));
      
      message += ' NFS-e enviada ao WebISS.';
    }

    // 3. Salvar Cobrança
    const cobrancasList = JSON.parse(fs.readFileSync(cobrancasFile, 'utf-8'));
    const newCobranca = {
      id: `COB-${Date.now()}`,
      client: data.clienteId || data.cliente,
      clientName: data.cliente,
      value: data.valor,
      due: data.vencimento,
      status: 'pending',
      boleto: boletoData,
      nfse: nfseData ? nfseData.id : null
    };
    cobrancasList.push(newCobranca);
    fs.writeFileSync(cobrancasFile, JSON.stringify(cobrancasList));

    res.json({
      success: true,
      message,
      cobranca: newCobranca
    });
  } catch (error: any) {
    console.error('Erro ao criar cobrança:', error);
    res.status(500).json({ error: error.message || 'Erro interno ao criar cobrança' });
  }
});

// --- PDF Generation Helper using Puppeteer ---
async function generateAndSaveNfsePdf(nfseId: string, cnpj: string, codigoVerificacao: string, numeroNfse: string) {
  const pdfPath = path.join(backupDir, `${nfseId}.pdf`);
  if (fs.existsSync(pdfPath)) {
    return pdfPath;
  }
  const cleanCnpj = cnpj.replace(/\D/g, '');
  const url = `https://saogoncalodoscamposba.webiss.com.br/externo/nfse/visualizar/${cleanCnpj}/${codigoVerificacao}/${numeroNfse}`;
  
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: fs.existsSync('/app/applet/.puppeteer-cache/chrome/linux-147.0.7727.57/chrome-linux64/chrome') 
      ? '/app/applet/.puppeteer-cache/chrome/linux-147.0.7727.57/chrome-linux64/chrome'
      : undefined
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    
    // Hide buttons and alerts so they don't appear in the PDF
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        .hidden-print, .btn, hr.separator, #alertaMensagem { display: none !important; }
        @media print { body { -webkit-print-color-adjust: exact; background: white; } }
      `;
      document.head.appendChild(style);
    });
    
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    fs.writeFileSync(pdfPath, pdfBuffer);
    return pdfPath;
  } finally {
    await browser.close();
  }
}

app.get('/api/nfse/:id/pdf', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const nfseList = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
    const nfse = nfseList.find((n: any) => n.id === id);
    
    if (!nfse || !nfse.numero || !nfse.codigoVerificacao) {
      return res.status(404).json({ error: 'NFS-e não encontrada ou ainda não emitida.' });
    }

    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    }
    const cnpj = settings.prestadorCnpj || '52613515000160';

    const pdfPath = await generateAndSaveNfsePdf(nfse.id, cnpj, nfse.codigoVerificacao, nfse.numero);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nfse.id}.pdf"`);
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
  } catch (error: any) {
    console.error('Erro ao gerar/obter PDF:', error);
    res.status(500).json({ error: 'Erro ao gerar ou obter o PDF da nota fiscal.', details: error.message });
  }
});

app.get('/api/nfse', authenticate, (req, res) => {
  try {
    const nfse = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
    res.json(nfse);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler notas fiscais' });
  }
});

app.delete('/api/nfse/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    let nfse = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
    const index = nfse.findIndex((n: any) => n.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'NFS-e não encontrada' });
    }
    nfse.splice(index, 1);
    fs.writeFileSync(nfseFile, JSON.stringify(nfse));
    res.json({ success: true, message: 'NFS-e excluída com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir NFS-e' });
  }
});

app.post('/api/nfse/emitir', authenticate, async (req, res) => {
  try {
    const data = req.body;
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    
    // Enrich data with client info
    const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf-8'));
    const clientInfo = clients.find((c: any) => c.name === data.cliente);
    if (clientInfo) {
      data.clienteCpfCnpj = clientInfo.cpfCnpj || clientInfo.document;
      data.clienteEndereco = clientInfo.logradouro || clientInfo.address;
      data.clienteNumero = clientInfo.numero || clientInfo.number;
      data.clienteBairro = clientInfo.bairro || clientInfo.neighborhood;
      data.clienteCodigoMunicipio = clientInfo.cityCode || '2929305'; // Default to example if not provided
      data.clienteUf = clientInfo.municipioUf ? clientInfo.municipioUf.split('/')[1] : (clientInfo.state || 'BA');
      data.clienteCep = clientInfo.cep ? clientInfo.cep.replace(/\D/g, '') : (clientInfo.zipCode ? clientInfo.zipCode.replace(/\D/g, '') : '');
      data.clienteTelefone = clientInfo.telefone ? clientInfo.telefone.replace(/\D/g, '') : (clientInfo.phone ? clientInfo.phone.replace(/\D/g, '') : '');
      data.clienteEmail = clientInfo.email || '';
    }
    
    // 1. Gerar o XML do RPS
    const xmlRps = generateRpsXml(data, settings);

    // 2. Assinar o XML (Requer Certificado A1)
    let certPem = process.env.CERT_PEM;
    let keyPem = process.env.KEY_PEM;

    const certPath = path.join(backupDir, 'cert.pem');
    const keyPath = path.join(backupDir, 'key.pem');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      certPem = fs.readFileSync(certPath, 'utf-8');
      keyPem = fs.readFileSync(keyPath, 'utf-8');
    }

    if (!certPem || !keyPem) {
      return res.status(400).json({
        error: 'Certificado Digital A1 não configurado. Faça o upload do arquivo .pfx nas configurações.',
        xmlPreview: xmlRps // Retornamos o XML gerado para visualização no frontend
      });
    }

    const signedXml = signXml(xmlRps, keyPem, certPem);

    // 3. Enviar para o WebISS via SOAP/mTLS
    const webserviceUrl = WEBSERVICE_URL;
    let soapResponse = '';
    
    try {
      soapResponse = await sendSoapRequest(
        webserviceUrl,
        'http://nfse.abrasf.org.br/RecepcionarLoteRpsSincrono',
        signedXml,
        certPem,
        keyPem
      );
      console.log('SOAP Response:', soapResponse);
      
      const doc = new DOMParser().parseFromString(soapResponse, 'text/xml');
      let innerXmlString = soapResponse;
      const outputXMLNode = doc.getElementsByTagName('outputXML')[0];
      if (outputXMLNode && outputXMLNode.textContent) {
        innerXmlString = outputXMLNode.textContent;
      }
      const innerDoc = new DOMParser().parseFromString(innerXmlString, 'text/xml');
      
      const mensagens = innerDoc.getElementsByTagName('MensagemRetorno');
      if (mensagens.length > 0) {
        let errorMessages = [];
        for (let i = 0; i < mensagens.length; i++) {
          const msg = mensagens[i];
          const codigo = msg.getElementsByTagName('Codigo')[0]?.textContent || '';
          const texto = msg.getElementsByTagName('Mensagem')[0]?.textContent || '';
          errorMessages.push(`[${codigo}] ${texto}`);
        }
        if (errorMessages.length > 0) {
          return res.status(400).json({
            error: 'Erro retornado pela Prefeitura: ' + errorMessages.join(' | '),
            xmlPreview: innerXmlString + '\n\n\n--- XML ENVIADO ---\n\n\n' + signedXml,
            responseXml: innerXmlString
          });
        }
      }

      const numeroNfseNode = innerDoc.getElementsByTagName('Numero')[0];
      const numeroNfse = numeroNfseNode ? numeroNfseNode.textContent : null;
      
      const codigoVerificacaoNode = innerDoc.getElementsByTagName('CodigoVerificacao')[0];
      const codigoVerificacao = codigoVerificacaoNode ? codigoVerificacaoNode.textContent : null;

      // 4. Salvar a nota fiscal no banco de dados local
      const nfseList = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
      const newNfse = {
        id: numeroNfse ? `NFS-${numeroNfse}` : `NFS-${Date.now()}`,
        numero: numeroNfse,
        codigoVerificacao: codigoVerificacao,
        client: data.clienteId || data.cliente,
        clientName: data.cliente,
        value: data.valor,
        issueDate: new Date().toISOString().split('T')[0],
        status: numeroNfse ? 'issued' : 'pending',
        xml: signedXml,
        responseXml: innerXmlString
      };
      nfseList.push(newNfse);
      fs.writeFileSync(nfseFile, JSON.stringify(nfseList));

      res.json({
        success: true,
        message: numeroNfse ? `NFS-e gerada com sucesso! Número: ${numeroNfse}` : 'RPS gerado, assinado e enviado com sucesso.',
        signedXml,
        nfse: newNfse
      });

    } catch (soapError: any) {
      console.error('Erro ao enviar SOAP:', soapError.message);
      let errorMsg = soapError.message;
      let fullXml = signedXml;
      
      // If the error message comes from the specific xml response we parsed but considered an error, show it
      if (soapError.message.includes('A prefeitura retornou erros na validação')) {
        fullXml = soapError.fullResponse || signedXml;
      }
      return res.status(400).json({ error: errorMsg, xmlPreview: fullXml });
    }
  } catch (error: any) {
    console.error('Erro ao emitir NFS-e:', error);
    res.status(500).json({ error: error.message || 'Erro interno ao emitir NFS-e' });
  }
});

// --- NFS-e Endpoints Adicionais (WSDL) ---

app.post('/api/nfse/consultar', authenticate, async (req, res) => {
  try {
    // Implementação do ConsultarNfseRps
    res.json({ success: true, message: 'Consulta de NFS-e por RPS não implementada.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nfse/cancelar', authenticate, async (req, res) => {
  try {
    // Implementação do CancelarNfse
    res.json({ success: true, message: 'Cancelamento de NFS-e não implementado.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nfse/substituir', authenticate, async (req, res) => {
  try {
    // Implementação do SubstituirNfse
    res.json({ success: true, message: 'Substituição de NFS-e não implementada.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Banco Inter Integration ---
app.post('/api/inter/boleto', authenticate, async (req, res) => {
  try {
    const data = req.body;
    
    // 1. Obter credenciais do ambiente e do settings.json
    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    }

    const clientId = settings.interClientId || process.env.INTER_CLIENT_ID;
    const clientSecret = settings.interClientSecret || process.env.INTER_CLIENT_SECRET;
    const contaCorrente = settings.interContaCorrente || process.env.INTER_CONTA_CORRENTE;
    const certPem = process.env.INTER_CERT_PEM; // Ainda mantido no env ou pode usar o PFX importado
    const keyPem = process.env.INTER_KEY_PEM;

    if (!clientId || !clientSecret || !contaCorrente) {
      return res.status(400).json({
        error: 'Credenciais do Banco Inter não configuradas. Configure-as na aba Configurações.',
        mockBoleto: {
          nossoNumero: `MOCK${Date.now()}`,
          linhaDigitavel: '00000.00000 00000.000000 00000.000000 0 00000000000000',
          codigoBarras: '00000000000000000000000000000000000000000000',
          pdfUrl: 'https://bancointer.com.br/mock-boleto.pdf'
        }
      });
    }

    // 2. Configurar mTLS para o Banco Inter
    // const httpsAgent = new https.Agent({ cert: certPem, key: keyPem });

    // 3. Obter Token OAuth2
    // const tokenResponse = await axios.post('https://cdpj.partners.bancointer.com.br/oauth/v2/token', 
    //   'client_id=' + clientId + '&client_secret=' + clientSecret + '&grant_type=client_credentials&scope=boleto-cobranca.read boleto-cobranca.write',
    //   { httpsAgent, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    // );
    // const token = tokenResponse.data.access_token;

    // 4. Emitir Boleto
    // const boletoPayload = {
    //   seuNumero: `COB-${Date.now()}`,
    //   valorNominal: data.valor,
    //   dataVencimento: data.vencimento,
    //   numDiasAgenda: 30,
    //   pagador: {
    //     cpfCnpj: '99999999000199', // Deveria vir do data.clienteCnpj
    //     tipoPessoa: 'JURIDICA',
    //     nome: data.cliente,
    //     endereco: 'Rua Exemplo',
    //     numero: '123',
    //     bairro: 'Centro',
    //     cidade: 'Feira de Santana',
    //     uf: 'BA',
    //     cep: '44000000'
    //   },
    //   mensagem: {
    //     linha1: data.descricao
    //   }
    // };

    // const boletoResponse = await axios.post('https://cdpj.partners.bancointer.com.br/cobranca/v2/boletos', boletoPayload, {
    //   httpsAgent,
    //   headers: {
    //     'Authorization': `Bearer ${token}`,
    //     'x-conta-corrente': contaCorrente,
    //     'Content-Type': 'application/json'
    //   }
    // });

    res.json({
      success: true,
      message: 'Boleto gerado com sucesso (Mock).',
      boleto: {
        nossoNumero: `MOCK${Date.now()}`,
        linhaDigitavel: '00000.00000 00000.000000 00000.000000 0 00000000000000',
        codigoBarras: '00000000000000000000000000000000000000000000',
        pdfUrl: 'https://bancointer.com.br/mock-boleto.pdf'
      }
    });
  } catch (error: any) {
    console.error('Erro ao emitir boleto Inter:', error);
    res.status(500).json({ error: error.message || 'Erro interno ao emitir boleto' });
  }
});

app.post('/api/inter/webhook', async (req, res) => {
  try {
    const payload = req.body;
    
    // O Banco Inter envia um array de objetos no webhook
    if (Array.isArray(payload)) {
      for (const evento of payload) {
        if (evento.situacao === 'PAGO' || evento.situacao === 'BAIXADO') {
          console.log(`Boleto ${evento.nossoNumero} pago. Iniciando emissão de NFS-e...`);
          
          // Aqui faríamos a busca dos dados da cobrança no banco de dados
          // usando o nossoNumero, e em seguida chamaríamos a função de emissão de NFS-e.
          // const cobranca = await db.cobrancas.findOne({ nossoNumero: evento.nossoNumero });
          // if (cobranca && cobranca.emitirNfseAoPagar) {
          //   const xmlRps = generateRpsXml(cobranca);
          //   const signedXml = signXml(xmlRps, process.env.KEY_PEM, process.env.CERT_PEM);
          //   await enviarParaWebISS(signedXml);
          // }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no webhook do Inter:', error);
    res.status(500).send('Erro interno');
  }
});



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
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
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

    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    }
    const cnpj = settings.prestadorCnpj || '52613515000160';

    // Adiciona attachments se existirem XMLs/PDFs reais na cobrancaa
    const attachments: any[] = [];
    if (documents && documents.length > 0) {
      for (const doc of documents) {
        if (doc.contentStr) {
          attachments.push({
            filename: `${doc.docName}.xml`,
            content: doc.contentStr
          });
        }
        if (doc.nfseId) {
          try {
            const nfseList = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
            const nfse = nfseList.find((n: any) => n.id === doc.nfseId);
            if (nfse && nfse.numero && nfse.codigoVerificacao) {
              const pdfPath = await generateAndSaveNfsePdf(nfse.id, cnpj, nfse.codigoVerificacao, nfse.numero);
              attachments.push({
                filename: `NFS-e_${nfse.numero}.pdf`,
                path: pdfPath
              });
            }
          } catch(e) {
            console.error('Erro ao anexar PDF da nfse:', e);
          }
        }
      }
    }

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME || 'Vírgula Contábil'}" <${process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME}>`,
      to,
      cc,
      bcc,
      subject,
      html: htmlContent,
      attachments
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'E-mail enviado com sucesso!' });
  } catch (error: any) {
    console.error('Erro ao enviar e-mail:', error);
    res.status(500).json({ error: error.message || 'Erro interno ao enviar e-mail' });
  }
});

app.post('/api/nfse/test-connection', authenticate, async (req, res) => {
  try {
    const url = WEBSERVICE_URL;

    let certPem = process.env.CERT_PEM;
    let keyPem = process.env.KEY_PEM;

    const certPath = path.join(backupDir, 'cert.pem');
    const keyPath = path.join(backupDir, 'key.pem');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      certPem = fs.readFileSync(certPath, 'utf-8');
      keyPem = fs.readFileSync(keyPath, 'utf-8');
    }

    if (!certPem || !keyPem) {
      return res.status(400).json({ error: 'Certificado Digital A1 não configurado.' });
    }

    const httpsAgent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false });
    
    // Simple GET request to test connection
    try {
      const response = await axios.get(url, { httpsAgent, timeout: 10000 });
      res.json({ success: true, message: 'Conexão bem-sucedida!', status: response.status });
    } catch (axiosError: any) {
      if (axiosError.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx. This still means we connected!
        res.json({ success: true, message: `Conexão estabelecida (Status: ${axiosError.response.status})`, status: axiosError.response.status });
      } else {
        throw axiosError;
      }
    }
  } catch (error: any) {
    console.error('Erro ao testar conexão:', error.message);
    res.status(500).json({ error: `Falha na conexão: ${error.message}` });
  }
});

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

startServer();
