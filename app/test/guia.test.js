"use strict";

// Guia animado da tela do Publico. Os cartoes de regra so aparecem quando o KJ
// ligou a regra na Gerencia: o do cafe com leite aparecia sempre, mesmo com a
// prioridade desligada, e prometia algo que a casa nao fazia.

const test = require("node:test");
const assert = require("node:assert");
const { cartoesDoGuia } = require("../src/guia");

const titulos = r => cartoesDoGuia(r).map(c => c.marca);

test("sem regras conhecidas: só os passos e as regras que sempre valem", () => {
  const m = titulos(null);
  assert.ok(m.includes("1") && m.includes("2") && m.includes("3"));
  assert.ok(!m.includes("☕"), "café com leite não pode aparecer sem o KJ ter ligado");
  assert.ok(!m.includes("🎤"), "dueto também não");
});

test("prioridade ligada: aparece o café com leite, com o limite do KJ", () => {
  const c = cartoesDoGuia({ prioridadeAtiva: true, prioridadeMinutos: 25 }).find(x => x.marca === "☕");
  assert.ok(c);
  assert.match(c.detalhe, /25 min/);
  assert.match(c.titulo + c.detalhe, /intercal/i, "é intercalado com a fila, não 'passa na frente'");
});

test("prioridade desligada: o cartão some", () => {
  assert.ok(!titulos({ prioridadeAtiva: false, prioridadeMinutos: 25 }).includes("☕"));
});

test("limite zero: o café com leite vale sempre", () => {
  const c = cartoesDoGuia({ prioridadeAtiva: true, prioridadeMinutos: 0 }).find(x => x.marca === "☕");
  assert.doesNotMatch(c.detalhe, /0 min/);
});

test("dueto ligado: aparece o cartão do dueto", () => {
  assert.ok(titulos({ permitirDuo: true }).includes("🎤"));
  assert.ok(!titulos({ permitirDuo: false }).includes("🎤"));
});
