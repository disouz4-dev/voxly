"use strict";

// O que o painel do Publico faz a cada aviso do Palco.
//
// Antes o Palco so mandava tempo enquanto TOCAVA. Dando Pausa, os avisos
// cessavam, o cao de guarda achava que o Palco tinha morrido e limpava o
// video — e ao despausar o painel ficava preto ate a proxima musica, porque
// o tratador saia cedo em "sem src". Pausa e um estado, nao um sumico.

const test = require("node:test");
const assert = require("node:assert");
const { decidirPainel, TOLERANCIA } = require("../src/painel-sync");

const TOCANDO = { temVideo: true, pausado: false, tempoAtual: 10, pronto: true };
const PAUSADO = { temVideo: true, pausado: true,  tempoAtual: 10, pronto: true };

test("Palco parou de vez: limpa o painel", () => {
  assert.strictEqual(decidirPainel({ parado: true }, TOCANDO).acao, "limpar");
  assert.strictEqual(decidirPainel({ parado: true }, PAUSADO).acao, "limpar");
});

test("Palco pausou: o painel pausa, nao apaga", () => {
  assert.strictEqual(decidirPainel({ tempo: 10, pausado: true }, TOCANDO).acao, "pausar");
});

test("Palco voltou: o painel volta junto", () => {
  assert.strictEqual(decidirPainel({ tempo: 10, pausado: false }, PAUSADO).acao, "tocar");
});

test("ambos pausados no mesmo ponto: nao faz nada", () => {
  assert.strictEqual(decidirPainel({ tempo: 10, pausado: true }, PAUSADO).acao, "nada");
});

test("deriva acima da tolerancia: acerta o relogio", () => {
  const d = decidirPainel({ tempo: 12.5, pausado: false }, TOCANDO);
  assert.strictEqual(d.acao, "ajustar");
  assert.strictEqual(d.tempo, 12.5);
});

test("deriva pequena nao vira pulo", () => {
  assert.strictEqual(decidirPainel({ tempo: 10 + TOLERANCIA / 2, pausado: false }, TOCANDO).acao, "nada");
});

test("painel sem video ainda: espera o play-video, nao inventa", () => {
  const vazio = { temVideo: false, pausado: true, tempoAtual: 0, pronto: false };
  assert.strictEqual(decidirPainel({ tempo: 10, pausado: false }, vazio).acao, "nada");
});

test("video ainda carregando: nao mexe no tempo", () => {
  const carregando = { temVideo: true, pausado: true, tempoAtual: 0, pronto: false };
  assert.strictEqual(decidirPainel({ tempo: 10, pausado: false }, carregando).acao, "nada");
});

test("acertar o relogio de um painel pausado tambem volta a tocar", () => {
  const d = decidirPainel({ tempo: 30, pausado: false }, PAUSADO);
  assert.ok(["ajustar", "tocar"].includes(d.acao));
  if (d.acao === "ajustar") assert.strictEqual(d.tocarDepois, true);
});
