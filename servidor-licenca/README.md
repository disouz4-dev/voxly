# Servidor de licença do Voxly

Cobrança mensal por casa, com Pix. Este servidor faz três coisas: cria o Pix,
confirma o pagamento com o Mercado Pago e entrega o bilhete assinado que
destrava o Voxly daquele computador.

Roda no plano **gratuito** do Cloudflare Workers. Custo fixo: **zero**. O único
custo é a taxa do Pix, cobrada por venda pelo Mercado Pago.

## Como a coisa funciona, em uma página

1. Cada instalação do Voxly tem um **código de computador** (16 letras). Ele
   nasce da placa de rede, do nome da máquina e do sistema. Copiar a pasta do
   Voxly para outro computador gera um código diferente.
2. No painel 🔑 Licença, o KJ pede um Pix. O Voxly manda o código, o nome da
   casa e um e-mail para este servidor; **nenhum dado de cartão passa pelo app**.
3. Pago o Pix, o Mercado Pago avisa este servidor. Ele **não acredita no aviso**:
   consulta o pagamento de volta na API antes de creditar qualquer coisa.
4. O servidor soma 30 dias por mês pago e guarda a validade daquele código.
5. O Voxly pede o bilhete, o servidor **assina na hora** com a chave privada e
   manda uma linha só: `VOXLY1.<dados>.<assinatura>`.
6. O Voxly guarda essa linha no disco e confere a assinatura sozinho, com a
   chave pública que veio no pacote. **A partir daí não precisa mais de
   internet**: a validade está escrita dentro do bilhete.

## Por que não dá para forjar

- Quem assina é a chave privada, que só existe no cofre do Cloudflare. Ler o
  código-fonte inteiro do Voxly não ajuda: lá só tem a chave pública, que
  confere e não assina.
- Mudar a data dentro do bilhete quebra a assinatura. Tem teste para isso
  (`app/test/licenca.test.js`).
- Atrasar o relógio do computador não estica a licença: o app guarda a maior
  data que já viu e não anda para trás.
- Aviso de pagamento falso não passa: a notificação vem assinada (HMAC) e, mesmo
  assim, o pagamento é reconsultado na API do Mercado Pago antes de valer.
- O mesmo Pix nunca credita duas vezes, aconteça o que acontecer com as
  notificações repetidas.

E o que **não** está protegido, dito na cara: quem entende de computador
consegue empacotar um Voxly próprio sem a checagem, ou bloquear este servidor
para ganhar a semana de tolerância. Licença é tranca de porta, não cofre. O que
ela impede é a cópia despreocupada, que é o caso real.

## Ligar a cobrança (uma vez só)

Enquanto `app/src/chave-licenca.js` estiver com `chavePublica: ""`, **o Voxly
não cobra nada**. É assim que ele sai daqui. Os passos abaixo é que ligam.

### 1. Mercado Pago
- Crie a aplicação em <https://www.mercadopago.com.br/developers/panel/app>.
- Copie o **Access Token de produção**.
- Em *Webhooks*, aponte para `https://<seu-worker>.workers.dev/webhook`, marque
  o evento **Pagamentos** e copie a **assinatura secreta**.

### 2. Chaves do bilhete
```bash
node servidor-licenca/gerar-chaves.mjs
```
A **pública** vai para `app/src/chave-licenca.js`. A **privada** não é salva em
arquivo nenhum: ela vai para o cofre no passo seguinte.

### 3. Cloudflare
```bash
cd servidor-licenca
npx wrangler login
npx wrangler kv namespace create LICENCAS     # cole o id em wrangler.toml
npx wrangler secret put MP_TOKEN
npx wrangler secret put MP_WEBHOOK_SEGREDO
npx wrangler secret put LICENCA_CHAVE_PRIVADA
npx wrangler deploy
```

### 4. App
Em `app/src/chave-licenca.js`, preencha `chavePublica`, `servidor`
(`https://voxly-licenca.<sua-conta>.workers.dev`) e o preço. Publique uma versão
nova. Quem já tiver o Voxly instalado continua sem licença até atualizar.

## Tarefas do dia a dia

**Dar licença de cortesia ou resolver um pagamento por fora** (o código do
computador está no painel 🔑 Licença, e a data é em milissegundos):
```bash
npx wrangler kv key put --binding=LICENCAS "lic:0123456789abcdef" \
  '{"casa":"Casa do Rock","valeAte":1790000000000,"emissao":1}'
```

**Ver a licença de uma casa:**
```bash
npx wrangler kv key get --binding=LICENCAS "lic:0123456789abcdef"
```

**Trocou de computador:** o código muda. Apague a chave antiga
(`wrangler kv key delete`) e grave a nova com a mesma data de validade.

**Casa sem internet no dia da renovação:** pegue o bilhete pronto em
`https://<seu-worker>/licenca/<codigo>` e mande por WhatsApp. O KJ cola em
*Recebi um código de licença por fora*. A assinatura é conferida do mesmo
jeito — colar não burla nada.

## Endereços

| Rota | Para quê |
|---|---|
| `POST /cobranca` | cria o Pix (`instalacao`, `casa`, `email`, `meses`) |
| `GET /cobranca/:id` | o Pix já caiu? |
| `POST /webhook` | o Mercado Pago avisando (assinado) |
| `GET /licenca/:codigo` | o bilhete assinado daquele computador |

Testes da ponte entre servidor e app: `app/test/licenca-servidor.test.js`.
