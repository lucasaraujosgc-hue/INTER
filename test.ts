import https from 'https';
import fs from 'fs';

const req = https.request('https://saogoncalodoscamposba.webiss.com.br/ws/nfse.asmx', {
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': 'http://nfse.abrasf.org.br/RecepcionarLoteRpsSincrono'
  },
  rejectUnauthorized: false
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('HTTP', res.statusCode, data));
});

req.write(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RecepcionarLoteRpsSincronoRequest xmlns="http://nfse.abrasf.org.br">
      <nfseCabecMsg xmlns=""><![CDATA[<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.02"><versaoDados>2.02</versaoDados></cabecalho>]]></nfseCabecMsg>
      <nfseDadosMsg xmlns=""><![CDATA[<EnviarLoteRpsSincronoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd"><LoteRps Id="1" versao="2.02"></LoteRps></EnviarLoteRpsSincronoEnvio>]]></nfseDadosMsg>
    </RecepcionarLoteRpsSincronoRequest>
  </soap:Body>
</soap:Envelope>`);
req.end();