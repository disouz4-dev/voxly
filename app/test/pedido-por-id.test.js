"use strict";

// Achar o pedido pelo id em QUALQUER vaga, inclusive a de espera.
//
// A Gerencia tem duas listas: `filaData`, que e a ordem do palco e deixa a vaga
// de espera de fora (host.html monta com `.filter(d => d.slot !== 'espera')`), e
// `_filaCompleta`, com todos os pedidos pendentes.
//
// Toda acao POR ID procurava na primeira. Resultado no show de 05/11: 28
// comandos `controle.baixar-sem-item`, e conferindo o diario os 28 eram
// `slot: "espera"` — nenhum da fila principal. O dono apertou baixar em
// "Unchained Melody" onze vezes sem nenhuma resposta, e disse: "eu quero poder
// baixar as musicas que estao na segunda fila tambem, nao consigo adiantar o
// download".
//
// Mesmo defeito dos 31 comandos mortos de 29/10.

const test = require("node:test");
const assert = require("node:assert");
const { acharPedido } = require("../src/fila");

const principal = [
  { id: "a", slot: "ativa", musica: "Creep" },
  { id: "b", slot: "ativa", musica: "Zombie" },
];
const completa = [
  ...principal,
  { id: "c", slot: "espera", musica: "Unchained Melody" },
];

test("o caso de 05/11: acha o pedido que esta na vaga de espera", () => {
  const achado = acharPedido("c", { fila: principal, completa });
  assert.ok(achado, "nao achou — e o pedido que o celular mandou baixar");
  assert.strictEqual(achado.musica, "Unchained Melody");
});

test("pedido da fila principal continua sendo achado", () => {
  assert.strictEqual(acharPedido("a", { fila: principal, completa }).musica, "Creep");
});

test("id que nao existe em lista nenhuma devolve null", () => {
  assert.strictEqual(acharPedido("zzz", { fila: principal, completa }), null);
});

test("sem a lista completa, procura so na principal", () => {
  // Modo offline e a carga pelo backup local enchem apenas `filaData`.
  assert.strictEqual(acharPedido("a", { fila: principal }).musica, "Creep");
  assert.strictEqual(acharPedido("c", { fila: principal }), null);
});

test("a lista completa manda: ela e a que tem o dado mais novo", () => {
  // `_filaCompleta` vem direto do snapshot; `filaData` passa por ordenacao e
  // pode ter copia de um instante anterior.
  const velha = [{ id: "a", slot: "ativa", statusDownload: null }];
  const nova  = [{ id: "a", slot: "ativa", statusDownload: "baixando" }];
  assert.strictEqual(acharPedido("a", { fila: velha, completa: nova }).statusDownload, "baixando");
});

test("id vazio, nulo ou listas tortas nao estouram", () => {
  assert.strictEqual(acharPedido(null, { fila: principal, completa }), null);
  assert.strictEqual(acharPedido("", { fila: principal, completa }), null);
  assert.strictEqual(acharPedido("a", {}), null);
  assert.strictEqual(acharPedido("a"), null);
  assert.strictEqual(acharPedido("a", { fila: "nao e lista", completa: 7 }), null);
});

test("item nulo dentro da lista nao atrapalha a busca", () => {
  const comBuraco = [null, { id: "c", slot: "espera", musica: "Unchained Melody" }, undefined];
  assert.strictEqual(acharPedido("c", { fila: [], completa: comBuraco }).musica, "Unchained Melody");
});
