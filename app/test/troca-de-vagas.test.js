"use strict";

// O cantor trocando as duas músicas dele de lugar: a da espera vai para a fila
// principal e a da fila principal vai para a espera.
//
// Pedido do dono em 06/11: "quero um botão de switch, uma seta para cima e
// outra para baixo, o cantor pode alterar a ordem da música que ele quer
// cantar, ele pode colocar a música da espera na fila principal e vice versa".
//
// O detalhe que decide a regra: `ordemFila` é só a ordem de CHEGADA, e é ela
// que define a posição na fila. Se a troca mexesse apenas no `slot`, a música
// promovida entraria com o número dela (mais alto, porque foi pedida depois) e
// o cantor PERDERIA o lugar na fila só por reordenar as próprias músicas. Então
// as duas trocam `slot` e `ordemFila`: muda qual música toca naquele lugar, não
// o lugar.

const test = require("node:test");
const assert = require("node:assert");
const { trocaDeVagas } = require("../src/historico");

const ativa  = { id: "a", slot: "ativa",  status: "aguardando", ordemFila: 12, musica: "Creep" };
const espera = { id: "e", slot: "espera", status: "aguardando", ordemFila: 47, musica: "Zombie" };

test("as duas trocam de vaga", () => {
  const t = trocaDeVagas(ativa, espera);
  assert.ok(t, "a troca tinha de ser permitida");
  assert.strictEqual(t.length, 2);
  const porId = Object.fromEntries(t.map(x => [x.id, x]));
  assert.strictEqual(porId.a.slot, "espera");
  assert.strictEqual(porId.e.slot, "ativa");
});

test("o LUGAR na fila fica, a música é que muda", () => {
  const porId = Object.fromEntries(trocaDeVagas(ativa, espera).map(x => [x.id, x]));
  assert.strictEqual(porId.e.ordemFila, 12, "quem sobe herda a posição da fila principal");
  assert.strictEqual(porId.a.ordemFila, 47, "quem desce fica com a posição da espera");
});

test("a troca só devolve slot e ordemFila — nada mais é reescrito", () => {
  for (const x of trocaDeVagas(ativa, espera)) {
    assert.deepEqual(Object.keys(x).sort(), ["id", "ordemFila", "slot"]);
  }
});

test("música no palco ou sendo chamada não troca", () => {
  // Trocar debaixo da chamada mudaria a música de quem já está subindo.
  for (const status of ["tocando", "confirmando", "confirmado", "pronto"]) {
    assert.strictEqual(trocaDeVagas({ ...ativa, status }, espera), null, `ativa ${status}`);
    assert.strictEqual(trocaDeVagas(ativa, { ...espera, status }), null, `espera ${status}`);
  }
});

test("sem as duas músicas não há troca", () => {
  assert.strictEqual(trocaDeVagas(ativa, null), null);
  assert.strictEqual(trocaDeVagas(null, espera), null);
  assert.strictEqual(trocaDeVagas(null, null), null);
  assert.strictEqual(trocaDeVagas(), null);
});

test("pedido sem ordemFila não inventa número", () => {
  // Trocar com número ausente jogaria a música para o fim da fila sem aviso.
  assert.strictEqual(trocaDeVagas({ ...ativa, ordemFila: undefined }, espera), null);
  assert.strictEqual(trocaDeVagas(ativa, { ...espera, ordemFila: null }), null);
  assert.strictEqual(trocaDeVagas({ ...ativa, ordemFila: NaN }, espera), null);
});

test("as duas na mesma vaga não trocam", () => {
  assert.strictEqual(trocaDeVagas(ativa, { ...espera, slot: "ativa" }), null);
});

test("o mesmo pedido duas vezes não troca consigo mesmo", () => {
  assert.strictEqual(trocaDeVagas(ativa, { ...ativa, slot: "espera" }), null);
});

test("pedido sem slot conta como da fila principal", () => {
  // Pedido antigo, de antes do campo existir — é o que vagasDoCantor assume.
  const antigo = { id: "x", status: "aguardando", ordemFila: 3, musica: "A" };
  const porId = Object.fromEntries(trocaDeVagas(antigo, espera).map(x => [x.id, x]));
  assert.strictEqual(porId.x.slot, "espera");
  assert.strictEqual(porId.e.slot, "ativa");
  assert.strictEqual(porId.e.ordemFila, 3);
});
