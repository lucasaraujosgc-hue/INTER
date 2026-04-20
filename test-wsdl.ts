import axios from 'axios';
import fs from 'fs';
import path from 'path';
import https from 'https';

const url = 'https://saogoncalodoscamposba.webiss.com.br/ws/nfse.asmx';
const wsdl_action = 'http://nfse.abrasf.org.br/RecepcionarLoteRpsSincrono';
const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<EnviarLoteRpsSincronoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
	<LoteRps Id="LOTE_123" versao="2.02">
		<NumeroLote>8294</NumeroLote>
		<CpfCnpj>
			<Cnpj>52613515000160</Cnpj>
		</CpfCnpj>
		<InscricaoMunicipal>3181602194</InscricaoMunicipal>
		<QuantidadeRps>1</QuantidadeRps>
		<ListaRps>
			<Rps>
				<InfDeclaracaoPrestacaoServico Id="RPS_123">
					<Rps>
						<IdentificacaoRps>
							<Numero>8821</Numero>
							<Serie>1</Serie>
							<Tipo>1</Tipo>
						</IdentificacaoRps>
						<DataEmissao>2026-04-20T01:26:24</DataEmissao>
						<Status>1</Status>
					</Rps>
					<Competencia>2026-04-20</Competencia>
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
						<IssRetido>2</IssRetido>
						<ItemListaServico>1719</ItemListaServico>
						<CodigoCnae>6920601</CodigoCnae>
						<CodigoTributacaoMunicipio>292930</CodigoTributacaoMunicipio>
						<Discriminacao>Teste</Discriminacao>
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
								<Cpf>06094011570</Cpf>
							</CpfCnpj>
						</IdentificacaoTomador>
						<RazaoSocial>LUCAS ARAUJO DOS SANTOS</RazaoSocial>
						<Endereco>
							<Endereco>Praça 28 de julho</Endereco>
							<Numero>2</Numero>
							<Bairro>Centro</Bairro>
							<CodigoMunicipio>2929305</CodigoMunicipio>
							<Uf>BA</Uf>
							<CodigoPais>1058</CodigoPais>
							<Cep>44330000</Cep>
						</Endereco>
						<Contato>
							<Telefone>75981200125</Telefone>
							<Email>LUCASDOCARBONO@GMAIL.COM</Email>
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

const envelope = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RecepcionarLoteRpsSincronoRequest xmlns="http://nfse.abrasf.org.br">
      <nfseCabecMsg xmlns=""><![CDATA[<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.02"><versaoDados>2.02</versaoDados></cabecalho>]]></nfseCabecMsg>
      <nfseDadosMsg xmlns=""><![CDATA[${xmlBody}]]></nfseDadosMsg>
    </RecepcionarLoteRpsSincronoRequest>
  </soap:Body>
</soap:Envelope>`;

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
