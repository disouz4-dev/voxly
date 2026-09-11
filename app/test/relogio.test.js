"use strict";

// Relogio do KJ (pedido do show de 10/09): a hora e, com sessao aberta, quanto
// falta. O que importa ao KJ e saber se ainda cabe musica — por isso a fase da
// tolerancia aparece como "pedidos fecham em", que e o que ela significa.

const test = require("node:test");
const assert = require("node:assert");
const { duracao, tempoDaSessao } = require("../src/relogio.js");

const MIN = 60 * 1000;
const inicio = Date.UTC(2026, 8, 10, 22, 0);
const termino = Date.UTC(2026, 8, 11, 1, 0);

test("duração curta em minutos, arredondada para cima", () => {
  assert.strictEqual(duracao(12 * MIN), "12 min");
  assert.strictEqual(duracao(11 * MIN + 1), "12 min");
  assert.strictEqual(duracao(59 * MIN), "59 min");
});

test("abaixo de um minuto não mostra zero", () => {
  assert.strictEqual(duracao(20 * 1000), "menos de 1 min");
});

test("uma hora ou mais vira 1h05", () => {
  assert.strictEqual(duracao(60 * MIN), "1h00");
  assert.strictEqual(duracao(65 * MIN), "1h05");
  assert.strictEqual(duracao(3 * 60 * MIN + 12 * MIN), "3h12");
});

test("antes do início: quanto falta para começar", () => {
  assert.deepStrictEqual(tempoDaSessao({ inicio, termino, agora: inicio - 25 * MIN }),
    { fase: "antes", texto: "começa em 25 min" });
});

test("durante: quanto falta para terminar", () => {
  assert.deepStrictEqual(tempoDaSessao({ inicio, termino, agora: termino - 72 * MIN }),
    { fase: "durante", texto: "termina em 1h12" });
});

test("na tolerância: os pedidos ainda entram, e o KJ vê até quando", () => {
  assert.deepStrictEqual(tempoDaSessao({ inicio, termino, agora: termino + 2 * MIN }),
    { fase: "tolerancia", texto: "pedidos fecham em 3 min" });
});

test("passada a tolerância: pedidos encerrados", () => {
  assert.deepStrictEqual(tempoDaSessao({ inicio, termino, agora: termino + 5 * MIN + 1 }),
    { fase: "encerrada", texto: "pedidos encerrados" });
});

test("o limite exato ainda aceita pedido, igual a sessao-regras.js", () => {
  assert.strictEqual(tempoDaSessao({ inicio, termino, agora: termino + 5 * MIN }).fase, "tolerancia");
});

test("aceita Timestamp do Firestore", () => {
  const ts = ms => ({ toDate: () => new Date(ms) });
  assert.strictEqual(tempoDaSessao({ inicio: ts(inicio), termino: ts(termino), agora: inicio + MIN }).fase,
    "durante");
});

test("sessão sem término declarado não inventa prazo", () => {
  assert.strictEqual(tempoDaSessao({ inicio, termino: null, agora: inicio + MIN }), null);
});

test("sem início declarado, antes do término conta como durante", () => {
  assert.strictEqual(tempoDaSessao({ termino, agora: termino - 10 * MIN }).texto, "termina em 10 min");
});
