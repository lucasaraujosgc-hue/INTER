import axios from 'axios';
import fs from 'fs';
import path from 'path';
import https from 'https';

const url = 'https://saogoncalodoscamposba.webiss.com.br/ws/nfse.asmx';
const wsdl_action = 'http://nfse.abrasf.org.br/RecepcionarLoteRpsSincrono';

const idRps = `RPS_123`;
const idLote = `LOTE_123`;
const cpfCnpjTag = `<Cpf>06094011570</Cpf>`;
const dataEmissao = '2026-04-20';
const competencia = '2026-04-01';

const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<EnviarLoteRpsSincronoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
	<LoteRps Id="${idLote}" versao="2.02">
		<NumeroLote>1234</NumeroLote>
		<CpfCnpj>
			<Cnpj>52613515000160</Cnpj>
		</CpfCnpj>
		<InscricaoMunicipal>3181602194</InscricaoMunicipal>
		<QuantidadeRps>1</QuantidadeRps>
		<ListaRps>
			<Rps>
				<InfDeclaracaoPrestacaoServico Id="${idRps}">
					<Rps>
						<IdentificacaoRps>
							<Numero>12345</Numero>
							<Serie>1</Serie>
							<Tipo>1</Tipo>
						</IdentificacaoRps>
						<DataEmissao>${dataEmissao}</DataEmissao>
						<Status>1</Status>
					</Rps>
					<Competencia>${competencia}</Competencia>
					<Servico>
						<Valores>
							<ValorServicos>300.00</ValorServicos>
							<ValorDeducoes>0.00</ValorDeducoes>
							<ValorPis>0.00</ValorPis>
							<ValorCofins>0.00</ValorCofins>
							<ValorInss>0.00</ValorInss>
							<ValorIr>0.00</ValorIr>
							<ValorCsll>0.00</ValorCsll>
							<OutrasRetencoes>0.00</OutrasRetencoes>
							<ValorIss>6.03</ValorIss>
							<Aliquota>2.01</Aliquota>
							<DescontoIncondicionado>0.00</DescontoIncondicionado>
							<DescontoCondicionado>0.00</DescontoCondicionado>
						</Valores>
						<IssRetido>1</IssRetido>
						<ResponsavelRetencao>1</ResponsavelRetencao>
						<ItemListaServico>1719</ItemListaServico>
						<CodigoCnae>6920601</CodigoCnae>
						<CodigoTributacaoMunicipio>292930</CodigoTributacaoMunicipio>
						<Discriminacao>Prestacao de servicos contabeis</Discriminacao>
						<CodigoMunicipio>2929305</CodigoMunicipio>
						<ExigibilidadeISS>1</ExigibilidadeISS>
						<MunicipioIncidencia>2929305</MunicipioIncidencia>
					</Servico>
					<Prestador>
						<CpfCnpj>
							<Cnpj>52613515000160</Cnpj>
						</CpfCnpj>
						<InscricaoMunicipal>3181602194</InscricaoMunicipal>
					</Prestador>
					<Tomador>
						<IdentificacaoTomador>
							<CpfCnpj>
								${cpfCnpjTag}
							</CpfCnpj>
						</IdentificacaoTomador>
						<RazaoSocial>LUCAS ARAUJO DOS SANTOS</RazaoSocial>
						<Endereco>
							<Endereco>Nao Informado</Endereco>
							<Numero>S/N</Numero>
							<Bairro>Centro</Bairro>
							<CodigoMunicipio>2929305</CodigoMunicipio>
							<Uf>BA</Uf>
							<CodigoPais>1058</CodigoPais>
							<Cep>44330000</Cep>
						</Endereco>
						<Contato>
							
							
						</Contato>
					</Tomador>
					<RegimeEspecialTributacao>6</RegimeEspecialTributacao>
					<OptanteSimplesNacional>1</OptanteSimplesNacional>
					<IncentivoFiscal>2</IncentivoFiscal>
				</InfDeclaracaoPrestacaoServico>
			</Rps>
		</ListaRps>
	</LoteRps>
</EnviarLoteRpsSincronoEnvio>`;

import { SignedXml } from 'xml-crypto';

class CustomKeyInfo {
  private certPem: string;
  constructor(certPem: string) {
    this.certPem = certPem;
  }
  getKeyInfo(key: any, prefix: string) {
    const certBase64 = this.certPem
      .replace(/-----BEGIN CERTIFICATE-----/, "")
      .replace(/-----END CERTIFICATE-----/, "")
      .replace(/\s+/g, "");
      
    return `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;
  }
  getKey(keyInfo: any) {
    return this.certPem;
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

function signXml(xml: string, keyPem: string, certPem: string): string {
  let signedXml = signNode(xml, "//*[local-name(.)='InfDeclaracaoPrestacaoServico']", keyPem, certPem);
  signedXml = signNode(signedXml, "//*[local-name(.)='LoteRps']", keyPem, certPem);
  return signedXml;
}

const rawEnvelope = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RecepcionarLoteRpsSincronoRequest xmlns="http://nfse.abrasf.org.br">
      <nfseCabecMsg xmlns=""><![CDATA[<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.02"><versaoDados>2.02</versaoDados></cabecalho>]]></nfseCabecMsg>
      <nfseDadosMsg xmlns=""><![CDATA[\${xmlBody}]]></nfseDadosMsg>
    </RecepcionarLoteRpsSincronoRequest>
  </soap:Body>
</soap:Envelope>`;

const keyPem = fs.readFileSync('backup/key.pem', 'utf-8');
const certPem = fs.readFileSync('backup/cert.pem', 'utf-8');

const signedXml = signXml(xmlBody, keyPem, certPem);
const envelope = rawEnvelope.replace('\\${xmlBody}', signedXml);

axios.post(url, envelope, {
  headers: {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': wsdl_action
  },
  httpsAgent: new https.Agent({ rejectUnauthorized: false, minVersion: 'TLSv1.2' })
}).then(res => console.log(res.data)).catch(err => {
    if (err.response) console.log(err.response.data);
    else console.error(err.message);
});
