"use strict";

// A sessao termina onde o KJ marcou. A tolerancia de 5 minutos existe para o
// atraso do proprio show — nao para esticar a noite: passado o prazo o cantor
// nao poe mais musica, e o KJ segue tocando o que ja esta na fila.

const test = require("node:test");
const assert = require("node:assert");
const { TOLERANCIA_MS, podePedirMusica } = require("../src/sessao-regras.js");

const MIN = 60 * 1000;
const FIM = Date.parse("2026-09-10T23:00:00Z");

test("a tolerancia e de 5 minutos", () => {
  assert.strictEqual(TOLERANCIA_MS, 5 * MIN);
});

test("antes do termino o cantor pede normalmente", () => {
  assert.strictEqual(podePedirMusica(FIM, FIM - 30 * MIN), true);
  assert.strictEqual(podePedirMusica(FIM, FIM - 1), true);
});

test("dentro da tolerancia ainda pede", () => {
  assert.strictEqual(podePedirMusica(FIM, FIM), true, "no minuto exato do termino");
  assert.strictEqual(podePedirMusica(FIM, FIM + 4 * MIN + 59000), true);
  assert.strictEqual(podePedirMusica(FIM, FIM + TOLERANCIA_MS), true, "no limite");
});

test("passada a tolerancia o cantor nao poe mais musica", () => {
  assert.strictEqual(podePedirMusica(FIM, FIM + TOLERANCIA_MS + 1), false);
  assert.strictEqual(podePedirMusica(FIM, FIM + 60 * MIN), false);
});

test("sessao antiga sem termino declarado nao trava o cantor", () => {
  assert.strictEqual(podePedirMusica(null, Date.now()), true);
  assert.strictEqual(podePedirMusica(undefined, Date.now()), true);
});

test("aceita Timestamp do Firestore, nao so milissegundos", () => {
  const comoFirestore = { toDate: () => new Date(FIM) };
  assert.strictEqual(podePedirMusica(comoFirestore, FIM + 1 * MIN), true);
  assert.strictEqual(podePedirMusica(comoFirestore, FIM + 6 * MIN), false);
});
