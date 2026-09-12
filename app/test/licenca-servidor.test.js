"use strict";

// A ponte entre os dois lados: o servidor ASSINA e o app CONFERE. Se um dia
// alguem renomear um campo do bilhete de um lado so, ninguem percebe olhando —
// o Voxly simplesmente para de aceitar licenca paga. Este teste pega o
// servidor de verdade (servidor-licenca/src/index.js), assina com uma chave
// criada na hora e manda o app ler.

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const path = require("path");
const lic = require("../src/licenca");

const CAMINHO = path.join(__dirname, "..", "..", "servidor-licenca", "src", "index.js");
const servidor = () => import("file://" + CAMINHO);

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const env = { LICENCA_CHAVE_PRIVADA: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") };
const confere = (corpo, assinatura) => crypto.verify(null, corpo, publicKey, assinatura);

// Guarda-volumes de mentira, com a mesma cara do KV do Cloudflare.
function kvFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    get: async (k, tipo) => {
      const v = dados.get(k);
      if (v === undefined) return null;
      return tipo === "json" ? JSON.parse(v) : v;
    },
    put: async (k, v) => { dados.set(k, v); },
  };
}

test("o bilhete que o servidor assina e o que o app sabe ler", async () => {
  const { assinarBilhete } = await servidor();
  const valeAte = Date.now() + 30 * lic.DIA;
  const bilhete = await assinarBilhete(env, {
    instalacao: "0123456789abcdef", casa: "Casa do Rock", valeAte, emissao: 3,
  });

  const lido = lic.abrirLicenca(bilhete, confere);
  assert.equal(lido.ok, true, "o app recusou o bilhete do servidor");
  assert.equal(lido.instalacao, "0123456789abcdef");
  assert.equal(lido.casa, "Casa do Rock");
  assert.equal(lido.valeAte, valeAte);
  assert.equal(lido.emissao, 3);

  const estado = lic.estadoDaLicenca({
    cobrando: true, licenca: lido, instalacao: "0123456789abcdef", agora: Date.now(),
  });
  assert.equal(estado.podeAbrirSessao, true);
  assert.equal(estado.situacao, "ativa");
});

test("bilhete do servidor assinado com outra chave nao passa", async () => {
  const { assinarBilhete } = await servidor();
  const outra = crypto.generateKeyPairSync("ed25519");
  const bilhete = await assinarBilhete(
    { LICENCA_CHAVE_PRIVADA: outra.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") },
    { instalacao: "0123456789abcdef", casa: "Falsa", valeAte: Date.now() + lic.DIA, emissao: 1 },
  );
  assert.equal(lic.abrirLicenca(bilhete, confere).ok, false);
});

test("so aceita codigo de maquina no formato certo", async () => {
  const { ehInstalacao } = await servidor();
  assert.equal(ehInstalacao("0123456789abcdef"), true);
  for (const ruim of ["", null, "ABCDEF0123456789", "0123456789abcde", "../../lic:outro", "0123456789abcdefg"]) {
    assert.equal(ehInstalacao(ruim), false, `devia recusar: ${ruim}`);
  }
});

test("pagar um mes soma trinta dias; pagar de novo antes do fim empilha", async () => {
  const { creditar } = await servidor();
  const LICENCAS = kvFalso();
  const antes = Date.now();

  const primeira = await creditar({ LICENCAS }, "0123456789abcdef", 1, "Casa do Rock");
  const trintaDias = Math.round((primeira.valeAte - antes) / lic.DIA);
  assert.equal(trintaDias, 30);
  assert.equal(primeira.emissao, 1);

  // Renovou faltando tempo: o que sobrava nao se perde.
  const segunda = await creditar({ LICENCAS }, "0123456789abcdef", 1, "");
  assert.equal(Math.round((segunda.valeAte - primeira.valeAte) / lic.DIA), 30);
  assert.equal(segunda.emissao, 2);
  assert.equal(segunda.casa, "Casa do Rock", "o nome da casa nao pode sumir na renovacao");
});

test("licenca vencida ha muito tempo recomeca de hoje, nao do passado", async () => {
  const { creditar } = await servidor();
  const velha = { casa: "Bar", valeAte: Date.now() - 200 * lic.DIA, emissao: 4 };
  const LICENCAS = kvFalso({ "lic:0123456789abcdef": JSON.stringify(velha) });
  const nova = await creditar({ LICENCAS }, "0123456789abcdef", 1, "");
  assert.ok(nova.valeAte > Date.now() + 29 * lic.DIA);
});

test("o mesmo Pix nunca credita duas vezes", async () => {
  const { confirmarPagamento } = await servidor();
  const LICENCAS = kvFalso({
    "cob:777": JSON.stringify({ instalacao: "0123456789abcdef", meses: 1, casa: "Casa" }),
  });
  const pagamento = { id: 777, status: "approved", metadata: { instalacao: "0123456789abcdef", meses: 1 } };

  await confirmarPagamento({ LICENCAS }, pagamento);
  const depoisDaPrimeira = JSON.parse(LICENCAS.dados.get("lic:0123456789abcdef")).valeAte;
  await confirmarPagamento({ LICENCAS }, pagamento);   // notificacao repetida
  await confirmarPagamento({ LICENCAS }, pagamento);   // e a consulta de socorro
  assert.equal(JSON.parse(LICENCAS.dados.get("lic:0123456789abcdef")).valeAte, depoisDaPrimeira);
});

test("pagamento que nao foi aprovado nao vira licenca", async () => {
  const { confirmarPagamento } = await servidor();
  const LICENCAS = kvFalso({ "cob:778": JSON.stringify({ instalacao: "0123456789abcdef", meses: 1 }) });
  await confirmarPagamento({ LICENCAS }, { id: 778, status: "pending", metadata: {} });
  assert.equal(LICENCAS.dados.get("lic:0123456789abcdef"), undefined);
});

test("notificacao dizendo pagar maquina inventada nao grava nada", async () => {
  const { confirmarPagamento } = await servidor();
  const LICENCAS = kvFalso();
  await confirmarPagamento({ LICENCAS }, { id: 779, status: "approved", metadata: { instalacao: "lic:qualquer" } });
  assert.equal([...LICENCAS.dados.keys()].filter(k => k.startsWith("lic:")).length, 0);
});

test("comparar segredo nao vaza pelo tamanho nem aceita parecido", async () => {
  const { igualSemVazar } = await servidor();
  assert.equal(igualSemVazar("abc", "abc"), true);
  assert.equal(igualSemVazar("abc", "abd"), false);
  assert.equal(igualSemVazar("abc", "abcd"), false);
  assert.equal(igualSemVazar("", ""), true);
});
