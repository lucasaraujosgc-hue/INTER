import https from 'https';
import axios from 'axios';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';

/**
 * Emissão legada via WebISS (ABRASF 2.02) da Prefeitura de São Gonçalo dos Campos.
 * Mantida apenas como alternativa (Configurações › Provedor de NFS-e = WebISS).
 */

export const WEBSERVICE_URL = 'https://saogoncalodoscamposba.webiss.com.br/ws/nfse.asmx';

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
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  });
  sig.addReference({
    xpath,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  (sig as any).keyInfoProvider = new CustomKeyInfo(certPem);
  sig.computeSignature(xml, { location: { reference: xpath, action: 'after' } });
  return sig.getSignedXml();
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}

export function generateRpsXml(data: any, settings: any) {
  const idRps = `RPS_${Date.now()}`;
  const idLote = `LOTE_${Date.now()}`;

  const tomadorCpfCnpj = data.clienteCpfCnpj ? data.clienteCpfCnpj.replace(/\D/g, '') : '';
  const isCpf = tomadorCpfCnpj.length === 11;
  const cpfCnpjTag = tomadorCpfCnpj ? (isCpf ? `<Cpf>${tomadorCpfCnpj}</Cpf>` : `<Cnpj>${tomadorCpfCnpj}</Cnpj>`) : '';

  const now = new Date();
  const dataEmissao = now.toISOString().split('T')[0];

  let competencia = data.competencia || now.toISOString().split('T')[0];
  if (competencia.length === 7) {
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

export function signXml(xml: string, keyPem: string, certPem: string): string {
  let signedXml = signNode(xml, "//*[local-name(.)='InfDeclaracaoPrestacaoServico']", keyPem, certPem);
  signedXml = signNode(signedXml, "//*[local-name(.)='LoteRps']", keyPem, certPem);
  return signedXml;
}

export async function sendSoapRequest(url: string, action: string, xmlBody: string, certPem: string, keyPem: string) {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RecepcionarLoteRpsSincronoRequest xmlns="http://nfse.abrasf.org.br">
      <nfseCabecMsg xmlns=""><![CDATA[<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.02"><versaoDados>2.02</versaoDados></cabecalho>]]></nfseCabecMsg>
      <nfseDadosMsg xmlns=""><![CDATA[${xmlBody}]]></nfseDadosMsg>
    </RecepcionarLoteRpsSincronoRequest>
  </soap:Body>
</soap:Envelope>`;

  const httpsAgent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false, minVersion: 'TLSv1.2' });
  try {
    const response = await axios.post(url, soapEnvelope, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action },
      httpsAgent,
      timeout: 30000,
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

/** Envia o RPS assinado e interpreta o retorno (número e código de verificação ou erros). */
export async function emitirWebIss(data: any, settings: any, certPem: string, keyPem: string) {
  const xmlRps = generateRpsXml(data, settings);
  const signedXml = signXml(xmlRps, keyPem, certPem);
  const soapResponse = await sendSoapRequest(WEBSERVICE_URL, 'http://nfse.abrasf.org.br/RecepcionarLoteRpsSincrono', signedXml, certPem, keyPem);

  const doc = new DOMParser().parseFromString(soapResponse, 'text/xml') as any;
  let innerXmlString = soapResponse;
  const outputXMLNode = doc.getElementsByTagName('outputXML')[0];
  if (outputXMLNode && outputXMLNode.textContent) innerXmlString = outputXMLNode.textContent;
  const innerDoc = new DOMParser().parseFromString(innerXmlString, 'text/xml') as any;

  const mensagens = innerDoc.getElementsByTagName('MensagemRetorno');
  const errors: string[] = [];
  for (let i = 0; i < mensagens.length; i++) {
    const msg = mensagens[i];
    errors.push(`[${msg.getElementsByTagName('Codigo')[0]?.textContent || ''}] ${msg.getElementsByTagName('Mensagem')[0]?.textContent || ''}`);
  }
  const numero = innerDoc.getElementsByTagName('Numero')[0]?.textContent || null;
  const codigoVerificacao = innerDoc.getElementsByTagName('CodigoVerificacao')[0]?.textContent || null;
  return { signedXml, responseXml: innerXmlString, errors, numero, codigoVerificacao };
}
