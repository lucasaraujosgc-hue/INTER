# Cobrança | Vírgula Contábil

Sistema de cobrança integrado ao **Banco Inter Empresas** (API PJ oficial) e à **NFS-e padrão nacional** (Sefin Nacional).

## O que o sistema faz

**Banco Inter** (OAuth2 + mTLS, um único token com todos os escopos, respeitando o limite de 5 tokens/min):

| Grupo de permissões | Telas |
|---|---|
| Conferir saldo e movimentações | Visão geral, Extrato e saldo (PDF do extrato) |
| Emitir boletos com ou sem Pix | Boletos/Cobranças: listar, emitir, alterar, cancelar, PDF, **importar as cobranças já existentes no banco** |
| Receber e enviar pagamentos por Pix | Pix recebidos + devolução, cobranças imediatas (cob), com vencimento (cobv), lotes (lotecobv), payloads (loc) |
| Pagar contas, fornecedores e despesas | Pagamento por código de barras (boletos, convênios, tributos), DARF, Pix (chave, dados bancários, copia e cola), lotes, agendamentos |
| Cobranças recorrentes e Pix Automático | Recorrências, solicitações, cobranças recorrentes, retentativas, payloads de recorrência |
| Webhooks | Cadastro, consulta de disparos e reenvio para cobranças, Pix, pagamentos Pix/boleto, recorrências |

Obs.: a API pública do Inter não expõe TED; transferências para outras contas são feitas por Pix com **dados bancários**.

**NFS-e Nacional**: DPS no leiaute v1.01 assinada (XMLDSig) com o certificado A1, enviada à Sefin Nacional
(`POST /SefinNacional/nfse`, mTLS), consulta, cancelamento (evento e101101) e DANFSe em PDF com QR Code.

**Entradas → NFS-e**: lista os créditos recebidos na conta Inter, identifica o cliente pelo CPF/CNPJ do pagador e emite
a NFS-e de cada recebimento (individual ou em lote). Boletos emitidos pelo sistema podem emitir a NFS-e
automaticamente quando o webhook confirmar o pagamento.

## Implantação

1. Variáveis de ambiente: veja `.env.example` (defina `PASSWORD`, `JWT_SECRET` e `APP_URL`).
2. Persistência: monte um volume em `/app/backup` (clientes, cobranças, notas, certificados e credenciais ficam lá).
3. No sistema:
   - **Banco Inter › Configuração**: Client ID, Client Secret, upload do `Inter API_Certificado.crt` e `Inter API_Chave.key`, chave Pix, URL pública. Clique em *Testar conexão*.
   - **Configurações**: importe o certificado A1 (.pfx) e revise os dados fiscais (Simples Nacional, código de tributação nacional, série e próximo número da DPS).
   - Faça a primeira emissão com **Ambiente = Produção restrita** e depois troque para Produção.
   - **Banco Inter › Webhooks**: ative o webhook de Cobranças.
   - **Boletos / Cobranças › Importar para o sistema** traz o histórico do banco.
4. Operações de saída (pagamentos, Pix, devoluções) ficam bloqueadas até marcar *Permitir operações de saída* em Banco Inter › Configuração.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # checagem de tipos
npm run test:nfse  # monta e assina DPS/cancelamento de exemplo (offline, não envia nada)
```
