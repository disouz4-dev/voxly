"use strict";

// A chamada de 30s ("confirme no seu celular") e montada em etapas: grava o
// status, resolve o arquivo no disco, le as preferencias e SO ENTAO manda o
// comando para as telas. Entre a primeira etapa e a ultima ha awaits.
//
// Se o KJ da Play nessa janela, o "play-confirmed" sai primeiro e a chamada
// atrasada chega DEPOIS, por cima da musica ja tocando — a tela volta a chamar
// um cantor que ja esta no palco. Foi o que o dono relatou.

const test = require("node:test");
const assert = require("node:assert");
const { criarControleChamada } = require("../src/chamada");

test("a chamada mais recente e a valida", () => {
  const c = criarControleChamada();
  const t1 = c.nova();
  assert.strictEqual(c.valida(t1), true);
});

test("uma chamada nova invalida a anterior", () => {
  const c = criarControleChamada();
  const t1 = c.nova();
  const t2 = c.nova();
  assert.strictEqual(c.valida(t1), false, "a antiga nao pode mais falar");
  assert.strictEqual(c.valida(t2), true);
});

test("dar Play cancela a chamada em andamento", () => {
  const c = criarControleChamada();
  const t = c.nova();
  c.cancelar();                       // tocarMusica()
  assert.strictEqual(c.valida(t), false,
    "a chamada que estava sendo montada nao pode aparecer sobre a musica");
});

test("token de outro controle nao vale", () => {
  const a = criarControleChamada(), b = criarControleChamada();
  const ta = a.nova(); b.nova();
  assert.strictEqual(b.valida(ta), false);
});

test("sem chamada nenhuma, nada e valido", () => {
  const c = criarControleChamada();
  assert.strictEqual(c.valida(0), false);
  assert.strictEqual(c.valida(undefined), false);
});
