/**
 * Teste offline da NFS-e nacional: monta DPS e pedido de cancelamento, assina com um certificado
 * autoassinado e confere a assinatura. Não envia nada à Sefin.
 *
 *   npx tsx scripts/test-nfse-nacional.ts [pasta-de-saida]
 *
 * Os XMLs gerados podem ser validados contra os XSDs oficiais (DPS_v1.01.xsd / pedRegEvento_v1.01.xsd).
 */
import fs from 'fs';
import path from 'path';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import { montarDps, assinarXml, montarPedidoCancelamento, normalizarCTribNac, lerNfse } from '../server/nfse/nacional';

const outDir = process.argv[2] || path.join(process.cwd(), 'tmp', 'nfse-teste');
fs.mkdirSync(outDir, { recursive: true });

function selfSigned() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: 'commonName', value: 'EMPRESA TESTE LTDA:11222333000181' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

function verify(xml: string, certPem: string, elemento: string) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml') as any;
  const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  const sig = new SignedXml({ publicCert: certPem });
  sig.loadSignature(sigNode);
  const ok = sig.checkSignature(xml);
  const parent = sigNode.parentNode.localName;
  const prev = sigNode.previousSibling?.localName;
  return { ok, parent, prev, ref: sigNode.getElementsByTagNameNS('*', 'Reference')[0]?.getAttribute('URI'), elemento };
}

const assert = (cond: unknown, msg: string) => { if (!cond) { console.error('FALHOU:', msg); process.exitCode = 1; } else console.log('ok  -', msg); };

const { certPem, keyPem } = selfSigned();

assert(normalizarCTribNac('17.19') === '171901', 'cTribNac 17.19 -> 171901');
assert(normalizarCTribNac('1719') === '171901', 'cTribNac 1719 -> 171901');
assert(normalizarCTribNac('7.02') === '070201', 'cTribNac 7.02 -> 070201');
assert(normalizarCTribNac('171901') === '171901', 'cTribNac 171901 mantido');

const cenarios = [
  {
    nome: 'dps-tomador-cnpj',
    tomador: { documento: '11.444.777/0001-61', nome: 'Cliente “Teste” – Comércio Ltda', codMunicipio: '2910800', cep: '44001-000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', email: 'fin@cliente.com.br; outro@x.com', fone: '(75) 99999-0000' },
    servico: { pAliq: 2.01, pTotTribSN: 6, tpRetISSQN: '1' as const },
  },
  {
    nome: 'dps-tomador-cpf-sem-endereco',
    tomador: { documento: '529.982.247-25', nome: 'Pessoa Física' },
    servico: { pAliq: null, pTotTribSN: null, tpRetISSQN: '2' as const },
  },
];

for (const c of cenarios) {
  const { id, xml } = montarDps({
    ambiente: '2', leiaute: 'atual', serie: '1', numero: 42, competencia: '2026-11-01',
    prestador: { cnpj: '52.613.515/0001-60', codMunicipio: '2929305', opSimpNac: '3', regApTribSN: '1', regEspTrib: '0', email: 'contato@virgulacontabil.com.br' },
    tomador: c.tomador,
    servico: {
      cTribNac: '17.19', descricao: 'Honorários contábeis\nCompetência 11/2026', tribISSQN: '1', valor: 300, ...c.servico,
    },
  });
  assert(id.length === 45 && /^DPS\d{42}$/.test(id), `${c.nome}: Id da DPS com 45 posições (${id})`);
  for (const alg of ['sha1', 'sha256'] as const) {
    const signed = assinarXml(xml, 'infDPS', keyPem, certPem, alg);
    const v = verify(signed, certPem, 'infDPS');
    assert(v.ok, `${c.nome} (${alg}): assinatura válida`);
    assert(v.parent === 'DPS' && v.prev === 'infDPS', `${c.nome} (${alg}): Signature após infDPS dentro de DPS`);
    assert(v.ref === `#${id}`, `${c.nome} (${alg}): Reference URI aponta para o Id`);
    assert(signed.includes('<X509Certificate>'), `${c.nome} (${alg}): KeyInfo com X509Certificate`);
    fs.writeFileSync(path.join(outDir, `${c.nome}-${alg}.xml`), signed);
  }
}

const ped = montarPedidoCancelamento({ ambiente: '2', cnpjAutor: '52613515000160', chaveAcesso: '2'.repeat(50), codigoMotivo: '1', motivo: 'Erro na emissão: valor incorreto informado' });
assert(ped.id.length === 59, 'Id do pedido de cancelamento com 59 posições');
const pedSigned = assinarXml(ped.xml, 'infPedReg', keyPem, certPem, 'sha1');
assert(verify(pedSigned, certPem, 'infPedReg').ok, 'pedido de cancelamento assinado');
fs.writeFileSync(path.join(outDir, 'cancelamento.xml'), pedSigned);

// Leitura de um XML de NFS-e (estrutura mínima de exemplo)
const nfseExemplo = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS29293052252613515000160000000000004226110000000001"><xLocEmi>São Gonçalo dos Campos</xLocEmi><xLocPrestacao>São Gonçalo dos Campos</xLocPrestacao><nNFSe>42</nNFSe><xTribNac>Contabilidade</xTribNac><cStat>100</cStat><dhProc>2026-11-11T10:00:00-03:00</dhProc><emit><CNPJ>52613515000160</CNPJ><xNome>Vírgula</xNome></emit><valores><vLiq>300.00</vLiq></valores><DPS><infDPS><dhEmi>2026-11-11T09:59:00-03:00</dhEmi><toma><CNPJ>11444777000161</CNPJ><xNome>Cliente</xNome></toma></infDPS></DPS></infNFSe></NFSe>`;
const lida = lerNfse(nfseExemplo);
assert(lida.nNFSe === '42' && lida.chaveAcesso.length === 50, 'leitura do XML da NFS-e (número e chave)');
assert(lida.dps.toma.doc === '11444777000161' && lida.emit.doc === '52613515000160', 'leitura de emitente e tomador');

console.log(`\nXMLs gravados em ${outDir}`);
