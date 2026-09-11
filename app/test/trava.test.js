"use strict";

// No show de 10/09 o app do cantor demorava a confirmar e quem clicava de novo
// punha a mesma musica duas vezes na fila. Estes testes fixam as duas defesas:
// a trava (o segundo clique nao dispara nada) e a chave do pedido (se ainda
// assim a gravacao se repetir, ela cai no mesmo documento).

const test = require("node:test");
const assert = require("node:assert");
const { criarTrava, chaveDePedido } = require("../src/trava.js");

test("clique repetido enquanto o primeiro espera a rede não dispara de novo", async () => {
  const trava = criarTrava();
  let chamadas = 0;
  let liberar;
  const lenta = () => { chamadas++; return new Promise(r => { liberar = r; }); };

  const primeiro = trava.executar(lenta);
  trava.executar(lenta);
  trava.executar(lenta);
  assert.strictEqual(chamadas, 1);
  assert.strictEqual(trava.ocupada, true);

  liberar("ok");
  assert.strictEqual(await primeiro, "ok");
  assert.strictEqual(trava.ocupada, false);
});

test("depois de terminar, a trava aceita o próximo pedido", async () => {
  const trava = criarTrava();
  let chamadas = 0;
  await trava.executar(async () => { chamadas++; });
  await trava.executar(async () => { chamadas++; });
  assert.strictEqual(chamadas, 2);
});

test("erro na gravação solta a trava — senão o botão morreria até recarregar", async () => {
  const trava = criarTrava();
  await assert.rejects(trava.executar(async () => { throw new Error("sem rede"); }), /sem rede/);
  assert.strictEqual(trava.ocupada, false);
  let rodou = false;
  await trava.executar(async () => { rodou = true; });
  assert.ok(rodou);
});

test("clique ignorado devolve undefined, sem lançar erro", async () => {
  const trava = criarTrava();
  let liberar;
  const primeiro = trava.executar(() => new Promise(r => { liberar = r; }));
  assert.strictEqual(await trava.executar(async () => "nao devia rodar"), undefined);
  liberar();
  await primeiro;
});

test("função síncrona também é aceita", async () => {
  const trava = criarTrava();
  assert.strictEqual(await trava.executar(() => 42), 42);
  assert.strictEqual(trava.ocupada, false);
});

test("chave do pedido começa pelo uid e serve como id de documento", () => {
  const chave = chaveDePedido("abc123", 1_700_000_000_000, () => 0.5);
  assert.ok(chave.startsWith("abc123_"));
  assert.ok(!chave.includes("/"), "barra quebraria o caminho do Firestore");
  assert.ok(chave !== "." && chave !== "..");
});

test("duas aberturas do modal geram chaves diferentes, mesmo no mesmo milissegundo", () => {
  const agora = 1_700_000_000_000;
  const a = chaveDePedido("u", agora, () => 0.1);
  const b = chaveDePedido("u", agora, () => 0.9);
  assert.notStrictEqual(a, b);
});

test("uid ausente ou com barra não produz caminho inválido", () => {
  assert.ok(!chaveDePedido("", 1, () => 0.3).startsWith("_"));
  assert.ok(!chaveDePedido(null, 1, () => 0.3).includes("null"));
  assert.ok(!chaveDePedido("a/b", 1, () => 0.3).includes("/"));
});
