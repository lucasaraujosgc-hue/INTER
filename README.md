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

- **Pagador diferente do cliente** (sócio pagando no CPF, parente, outra empresa): use **Vincular** na entrada para
  indicar a empresa da nota. Com "Lembrar este pagador", o CPF/CNPJ fica salvo em *Pagadores vinculados* no cadastro do
  cliente e os próximos pagamentos dele são identificados automaticamente. Também dá para vincular na hora de emitir a
  nota ou direto na tela Clientes.
- **Data de corte** (Configurações › NFS-e, padrão 31/10/2026): recebimentos até essa data aparecem com a tag **Antes**
  e não contam como pendência.

**Dashboard**: saldo da conta Inter e boletos recebidos / a receber / em atraso (Banco Inter › Boletos / Cobranças),
lista dos boletos com filtros, pendências com atalho (recebimentos sem nota, pagamentos sem cliente, atrasos, falhas de emissão,
cadastros incompletos, certificados vencendo), vencimentos e histórico de atividades.

**Boleto pago por fora** (cliente fez Pix direto na conta): em Boletos / Cobranças use **Marcar pago**. O pagamento fica
registrado no sistema e, se marcado, o boleto é baixado (cancelado) no Inter para não ser pago de novo nem ir a protesto.

**PDFs**: os downloads saem como `NFS_NOME_DO_CLIENTE_DD-MM-AAAA.pdf` e `BOLETO_NOME_DO_CLIENTE_DD-MM-AAAA.pdf`
(mesmo padrão nos anexos de e-mail).

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
