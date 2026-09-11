"use strict";

// Fader de volume do KJ, para nao depender do tecnico da mesa.
//
// A curva importa: com ganho LINEAR, metade do fader soa quase igual ao volume
// cheio e todo o ajuste util fica espremido no ultimo quarto do curso. O
// ouvido e logaritmico. Aqui o ganho e o quadrado da posicao, que distribui o
// ajuste pelo fader inteiro.

const test = require("node:test");
const assert = require("node:assert");
const { ganhoDoFader, posicaoValida, PADRAO } = require("../src/volume");

test("extremos: zero cala, cem e o volume original", () => {
  assert.strictEqual(ganhoDoFader(0), 0);
  assert.strictEqual(ganhoDoFader(100), 1);
});

test("metade do fader e bem mais baixo que metade do volume percebido cheio", () => {
  // Quadratico: 50% vira 0,25 de ganho (-12 dB).
  assert.strictEqual(ganhoDoFader(50), 0.25);
});

test("nunca passa do volume original: nada de clipar na saida", () => {
  assert.strictEqual(ganhoDoFader(150), 1);
  assert.strictEqual(ganhoDoFader(Infinity), 1);
});

test("valor invalido cai no padrao, nao cala o show", () => {
  assert.strictEqual(posicaoValida("abc"), PADRAO);
  assert.strictEqual(posicaoValida(undefined), PADRAO);
  assert.strictEqual(posicaoValida(null), PADRAO);
  assert.strictEqual(posicaoValida(NaN), PADRAO);
});

test("posicao e presa entre 0 e 100 e vira inteiro", () => {
  assert.strictEqual(posicaoValida(-10), 0);
  assert.strictEqual(posicaoValida(250), 100);
  assert.strictEqual(posicaoValida("73.6"), 74);
});

test("o padrao nao e mudo nem estourado", () => {
  assert.ok(PADRAO > 50 && PADRAO <= 100);
});
