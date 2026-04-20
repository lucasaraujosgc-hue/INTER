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
		<ListaRps></ListaRps>
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
