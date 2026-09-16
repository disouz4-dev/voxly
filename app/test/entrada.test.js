const test = require("node:test");
const assert = require("node:assert");
const e = require("../src/entrada");

const cobrando = { cobranca: { ativa: true, valor: 15 } };

test("sem cobranca ligada, todo mundo pede", () => {
  assert.equal(e.entradaLiberada({}, null), true);
  assert.equal(e.entradaLiberada({ cobranca: { ativa: false, valor: 15 } }, null), true);
  assert.equal(e.entradaLiberada(null, null), true);
  assert.equal(e.situacaoDoCantor({}, null), "livre");
});

test("cobranca ligada com valor zero nao cobra", () => {
  assert.equal(e.cobrancaAtiva({ cobranca: { ativa: true, valor: 0 } }), false);
});

test("cobranca ligada: so pede quem esta pago", () => {
  assert.equal(e.entradaLiberada(cobrando, null), false);
  assert.equal(e.entradaLiberada(cobrando, { status: "aguardando" }), false);
  assert.equal(e.entradaLiberada(cobrando, { status: "nao-caiu" }), false);
  assert.equal(e.entradaLiberada(cobrando, { status: "pago" }), true);
});

test("o celular sabe em que pe esta", () => {
  assert.equal(e.situacaoDoCantor(cobrando, null), "pagar");
  assert.equal(e.situacaoDoCantor(cobrando, { status: "aguardando" }), "aguardando");
  assert.equal(e.situacaoDoCantor(cobrando, { status: "nao-caiu" }), "nao-caiu");
  assert.equal(e.situacaoDoCantor(cobrando, { status: "pago" }), "pago");
  assert.equal(e.situacaoDoCantor(cobrando, { status: "qualquer" }), "pagar");
});

test("nome de quem pagou: espacos arrumados e tamanho limitado", () => {
  assert.equal(e.limparNomePagador("  Maria   da  Silva "), "Maria da Silva");
  assert.equal(e.limparNomePagador("x".repeat(200)).length, e.LIMITE_NOME_PAGADOR);
  assert.equal(e.limparNomePagador(null), "");
});

test("reais do jeito brasileiro", () => {
  assert.equal(e.emReais(15), "R$ 15,00");
  assert.equal(e.emReais(7.5), "R$ 7,50");
  assert.equal(e.emReais(1250), "R$ 1.250,00");
});

test("conferencia: so os que avisaram, do mais antigo para o mais novo", () => {
  const lista = e.paraConferir([
    { id: "c", status: "aguardando", avisadoEm: 300 },
    { id: "a", status: "pago", avisadoEm: 100 },
    { id: "b", status: "aguardando", avisadoEm: { toMillis: () => 200 } },
    { id: "d", status: "nao-caiu", avisadoEm: 50 },
  ]);
  assert.deepEqual(lista.map(p => p.id), ["b", "c"]);
});

test("pagou e nao cantou: aparece para o KJ decidir; cortesia e quem cantou nao", () => {
  const pagamentos = [
    { id: "rafa", status: "pago", valor: 15, nomeArtistico: "Rafa", nomePagador: "Rafael Lima" },
    { id: "bia",  status: "pago", valor: 15, nomeArtistico: "Bia" },
    { id: "tuca", status: "pago", valor: 15, nomeArtistico: "Tuca" },
    { id: "vip",  status: "pago", cortesia: true, nomeArtistico: "Dono do bar" },
    { id: "duda", status: "aguardando", valor: 15, nomeArtistico: "Duda" },
  ];
  const historico = [
    { cantorUid: "bia", status: "cantada" },
    { cantorUid: "mari", status: "cantada", duoCom: { uid: "tuca" } },
    { cantorUid: "rafa", status: "pulada" },
  ];
  assert.deepEqual(e.pagaramENaoCantaram(pagamentos, historico), [
    { uid: "rafa", nome: "Rafa", nomePagador: "Rafael Lima", valor: 15 },
  ]);
});

test("resumo da noite para o relatorio", () => {
  const r = e.resumoDaEntrada(cobrando, [
    { status: "pago", valor: 15 }, { status: "pago", valor: 15 },
    { status: "pago", cortesia: true }, { status: "aguardando", valor: 15 }, { status: "nao-caiu", valor: 15 },
  ]);
  assert.deepEqual(r, { valor: 15, pagantes: 2, cortesias: 1, total: 30, semConferir: 1 });
  assert.equal(e.resumoDaEntrada({}, []), null);
});

test("marca em Cantores Online: pagou, cortesia, conferir, nao pagou", () => {
  assert.equal(e.marcaDoIngresso({}, null, "u1"), null, "sem cobranca, sem marca");
  assert.equal(e.marcaDoIngresso(cobrando, null, "manual_123"), null, "cantor posto pelo KJ nao paga");
  assert.equal(e.marcaDoIngresso(cobrando, { status: "pago" }, "u1").texto, "pagou");
  assert.equal(e.marcaDoIngresso(cobrando, { status: "pago", cortesia: true }, "u1").texto, "cortesia");
  assert.equal(e.marcaDoIngresso(cobrando, { status: "aguardando" }, "u1").texto, "conferir Pix");
  assert.equal(e.marcaDoIngresso(cobrando, { status: "nao-caiu" }, "u1").texto, "Pix não caiu");
  assert.equal(e.marcaDoIngresso(cobrando, null, "u1").texto, "sem ingresso");
});
