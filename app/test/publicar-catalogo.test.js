"use strict";

// Quando a cópia do acervo no banco pode ser sobrescrita.
//
// A cópia no Firebase é o acervo para o app do cantor: "a cópia da pasta tem
// que ficar no Firebase" (06/11). Ela é republicada pela Gerência a cada
// varredura, e não havia nenhuma guarda — com o HD externo desconectado, a
// varredura dá zero música e a publicação **apagaria** a cópia boa.
//
// Isso quase aconteceu em 06/11: às 03:38 o servidor do catálogo respondeu
// "0 músicas" porque o HD tinha sido desmontado no meio do trabalho. O que
// salvou foi sorte de a publicação não ter corrido naquele instante.
//
// A queda brusca também é suspeita: pasta errada escolhida na Config, HD
// montando pela metade, varredura interrompida. Nesses casos o certo é manter o
// que está no banco e avisar — nunca apagar sozinho.

const test = require("node:test");
const assert = require("node:assert");
const { devePublicarCatalogo } = require("../src/catalogo");

test("o caso de 06/11: zero música não apaga o acervo publicado", () => {
  const r = devePublicarCatalogo({ novos: 0, publicados: 386 });
  assert.strictEqual(r.publicar, false);
  assert.strictEqual(r.motivo, "vazio");
});

test("acervo normal publica", () => {
  assert.strictEqual(devePublicarCatalogo({ novos: 386, publicados: 386 }).publicar, true);
  assert.strictEqual(devePublicarCatalogo({ novos: 390, publicados: 386 }).publicar, true);
});

test("primeira publicação da vida passa, mesmo pequena", () => {
  // Sem nada no banco não há o que proteger.
  assert.strictEqual(devePublicarCatalogo({ novos: 3, publicados: 0 }).publicar, true);
  assert.strictEqual(devePublicarCatalogo({ novos: 3, publicados: null }).publicar, true);
});

test("zero com zero no banco não publica, mas não é perda", () => {
  const r = devePublicarCatalogo({ novos: 0, publicados: 0 });
  assert.strictEqual(r.publicar, false);
  assert.strictEqual(r.motivo, "vazio");
});

test("queda brusca segura a publicação e avisa", () => {
  // Metade ou menos do que está publicado: pasta errada, HD pela metade.
  const r = devePublicarCatalogo({ novos: 100, publicados: 386 });
  assert.strictEqual(r.publicar, false);
  assert.strictEqual(r.motivo, "queda");
});

test("queda pequena publica — música apagada de propósito é normal", () => {
  assert.strictEqual(devePublicarCatalogo({ novos: 380, publicados: 386 }).publicar, true);
  assert.strictEqual(devePublicarCatalogo({ novos: 300, publicados: 386 }).publicar, true);
});

test("o limite da queda é metade", () => {
  assert.strictEqual(devePublicarCatalogo({ novos: 193, publicados: 386 }).publicar, true,
    "exatamente a metade ainda passa");
  assert.strictEqual(devePublicarCatalogo({ novos: 192, publicados: 386 }).publicar, false);
});

test("acervo pequeno não fica preso pela regra da queda", () => {
  // Numa casa com 8 músicas, cair para 3 não é sinal de HD sumido.
  assert.strictEqual(devePublicarCatalogo({ novos: 3, publicados: 8 }).publicar, true);
});

test("forçar passa por cima da guarda", () => {
  // O KJ trocou de acervo de propósito e quer publicar o novo, menor.
  const r = devePublicarCatalogo({ novos: 2, publicados: 386, forcar: true });
  assert.strictEqual(r.publicar, true);
  assert.strictEqual(r.motivo, "forcado");
});

test("número torto conta como desconhecido e não apaga nada", () => {
  for (const n of [null, undefined, NaN, -5, "386"]) {
    assert.strictEqual(devePublicarCatalogo({ novos: n, publicados: 386 }).publicar, false,
      `novos=${JSON.stringify(n)}`);
  }
});

test("sem argumento nenhum não publica", () => {
  assert.strictEqual(devePublicarCatalogo().publicar, false);
});
