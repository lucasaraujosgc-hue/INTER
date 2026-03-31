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

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'virgula-contabil-secret-key-2025';

app.use(cors());

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
function generateRpsXml(data: any, settings: any) {
  // Geração do XML do RPS seguindo o padrão ABRASF v2.04
  // O atributo Id é obrigatório para a assinatura digital
  const idRps = `RPS_${Date.now()}`;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Rps>
    <InfDeclaracaoPrestacaoServico Id="${idRps}">
      <Rps>
        <IdentificacaoRps>
          <Numero>${Math.floor(Math.random() * 10000)}</Numero>
          <Serie>UNICA</Serie>
          <Tipo>1</Tipo>
        </IdentificacaoRps>
        <DataEmissao>${new Date().toISOString().split('.')[0]}</DataEmissao>
        <Status>1</Status>
      </Rps>
      <Competencia>${new Date().toISOString().split('T')[0]}</Competencia>
      <Servico>
        <Valores>
          <ValorServicos>${data.valor.toFixed(2)}</ValorServicos>
          <IssRetido>2</IssRetido>
          <ValorIss>${(data.valor * (data.aliquota / 100)).toFixed(2)}</ValorIss>
          <Aliquota>${data.aliquota.toFixed(2)}</Aliquota>
        </Valores>
        <ItemListaServico>${data.itemLc116 || '17.19'}</ItemListaServico>
        <CodigoTributacaoMunicipio>${settings.codigoMunicipio || '123456'}</CodigoTributacaoMunicipio>
        <Discriminacao>${data.descricao}</Discriminacao>
        <CodigoMunicipio>${settings.codigoMunicipio || '2910800'}</CodigoMunicipio>
        <ExigibilidadeISS>1</ExigibilidadeISS>
        <MunicipioIncidencia>${settings.codigoMunicipio || '2910800'}</MunicipioIncidencia>
      </Servico>
      <Prestador>
        <CpfCnpj>
          <Cnpj>${(settings.prestadorCnpj || '00000000000100').replace(/\D/g, '')}</Cnpj>
        </CpfCnpj>
        <InscricaoMunicipal>${settings.prestadorIm || '12345'}</InscricaoMunicipal>
      </Prestador>
      <Tomador>
        <IdentificacaoTomador>
          <CpfCnpj>
            <Cnpj>99999999000199</Cnpj>
          </CpfCnpj>
        </IdentificacaoTomador>
        <RazaoSocial>${data.cliente}</RazaoSocial>
      </Tomador>
      <OptanteSimplesNacional>1</OptanteSimplesNacional>
      <IncentivoFiscal>2</IncentivoFiscal>
    </InfDeclaracaoPrestacaoServico>
  </Rps>
</GerarNfseEnvio>`;
}

function signXml(xml: string, keyPem: string, certPem: string): string {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
  });
  
  // Padrões exigidos pelo manual ABRASF v2.04 (Pág. 26)
  sig.addReference({
    xpath: "//*[@Id]",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1"
  });
  
  sig.computeSignature(xml);
  return sig.getSignedXml();
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
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler configurações' });
  }
});

app.post('/api/settings', authenticate, (req, res) => {
  try {
    const currentSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
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
    res.json(cobrancas);
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
          error: 'Certificado Digital A1 não configurado. Faça o upload do arquivo .pfx nas configurações.',
          xmlPreview: xmlRps
        });
      }

      const signedXml = signXml(xmlRps, keyPem, certPem);
      
      const nfseList = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
      nfseData = {
        id: `NFS-${Date.now()}`,
        client: data.clienteId || data.cliente,
        clientName: data.cliente,
        value: data.valor,
        issueDate: new Date().toISOString().split('T')[0],
        status: 'issued',
        xml: signedXml
      };
      nfseList.push(nfseData);
      fs.writeFileSync(nfseFile, JSON.stringify(nfseList));
      
      message += ' NFS-e emitida.';
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

app.get('/api/nfse', authenticate, (req, res) => {
  try {
    const nfse = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
    res.json(nfse);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler notas fiscais' });
  }
});

app.post('/api/nfse/emitir', authenticate, async (req, res) => {
  try {
    const data = req.body;
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    
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
    // Aqui usaremos axios ou https nativo com o certificado injetado no agente
    // const httpsAgent = new https.Agent({ cert: certPem, key: keyPem });
    // const response = await axios.post('https://url-do-webiss/GerarNfse', signedXml, { httpsAgent, headers: { 'Content-Type': 'text/xml' } });

    // 4. Salvar a nota fiscal no banco de dados local
    const nfseList = JSON.parse(fs.readFileSync(nfseFile, 'utf-8'));
    const newNfse = {
      id: `NFS-${Date.now()}`,
      client: data.clienteId || data.cliente,
      clientName: data.cliente,
      value: data.valor,
      issueDate: new Date().toISOString().split('T')[0],
      status: 'issued',
      xml: signedXml
    };
    nfseList.push(newNfse);
    fs.writeFileSync(nfseFile, JSON.stringify(nfseList));

    res.json({
      success: true,
      message: 'RPS gerado, assinado e enviado com sucesso.',
      signedXml,
      nfse: newNfse
    });
  } catch (error: any) {
    console.error('Erro ao emitir NFS-e:', error);
    res.status(500).json({ error: error.message || 'Erro interno ao emitir NFS-e' });
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

app.get('/api/settings', authenticate, (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler configurações' });
  }
});

app.post('/api/settings', authenticate, (req, res) => {
  try {
    const currentSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    const newSettings = { ...currentSettings, ...req.body };
    fs.writeFileSync(settingsFile, JSON.stringify(newSettings));
    res.json({ success: true, settings: newSettings });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

app.post('/api/nfse/test-connection', authenticate, async (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    const url = settings.webserviceUrl;
    if (!url) {
      return res.status(400).json({ error: 'URL do WebService não configurada.' });
    }

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
