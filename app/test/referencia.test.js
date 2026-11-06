"use strict";

// Escolher a GRAVACAO ORIGINAL contra a qual a versao de karaoke e comparada.
//
// Defeito achado por ele de ouvido em 06/11/2026: "alice in chains veio uma
// versao com violinos e a de comparacao com instrumental rock". O iTunes havia
// devolvido "Man in the Box" do **Vitamin String Quartet** — um quarteto de
// cordas — e eu comparei o karaoke de rock contra violinos. A nota saiu 85 e
// nao valia nada.
//
// A causa: eu casava o nome da MUSICA e nunca o do ARTISTA. Com referencia
// errada a nota e lixo com cara de medida, e o selo mentiria com confianca.
// Entao a regra passa a ser: sem artista batendo, nao ha original — e sem
// original, nao ha nota. Melhor ficar sem selo que dar selo errado.

const test = require("node:test");
const assert = require("node:assert");
const {
  casaArtista, escolherOriginal, ehVersaoAlternativa,
} = require("../src/referencia");

const faixa = (artista, musica, extra = {}) => ({
  artistName: artista, trackName: musica,
  previewUrl: "https://audio-ssl.itunes.apple.com/x.m4a", ...extra,
});

// ── o artista tem de bater ────────────────────────────────
test("o caso do defeito: quarteto de cordas nao e Alice in Chains", () => {
  assert.strictEqual(casaArtista("Alice in Chains", "Vitamin String Quartet"), false);
});

test("mesmo artista com grafia diferente bate", () => {
  for (const [a, b] of [
    ["Alice in Chains", "Alice In Chains"],
    ["ACDC", "AC/DC"],
    ["Legião Urbana", "Legiao Urbana"],
    ["Barão Vermelho", "Barao Vermelho"],
    ["Seether", " seether "],
  ]) assert.strictEqual(casaArtista(a, b), true, `${a} / ${b}`);
});

test("artista que CONTEM o outro bate: participacoes e creditos extras", () => {
  // O acervo diz "Seether"; o iTunes devolve "Seether feat. Amy Lee".
  assert.strictEqual(casaArtista("Seether", "Seether feat. Amy Lee"), true);
  assert.strictEqual(casaArtista("Silk Sonic", "Bruno Mars, Anderson .Paak & Silk Sonic"), true);
});

test("artista diferente nao bate so por compartilhar palavra", () => {
  assert.strictEqual(casaArtista("Journey", "Journey Tribute Band"), false);
  assert.strictEqual(casaArtista("Pearl Jam", "Singles Plays Pearl Jam"), false);
  assert.strictEqual(casaArtista("Adele", "Adele Tribute"), false);
});

test("artista vazio ou nulo nunca bate", () => {
  for (const [a, b] of [["", "Adele"], ["Adele", ""], [null, null], ["Adele", undefined]]) {
    assert.strictEqual(casaArtista(a, b), false, `${a} / ${b}`);
  }
});

// ── versoes que nao servem de referencia ──────────────────
test("tributo, cover e versao instrumental nao servem de original", () => {
  for (const t of [
    "Man in the Box (String Quartet Tribute)",
    "Would (Made Popular By Alice in Chains) [Karaoke Version]",
    "Skyfall (Cover Version)",
    "Metalingus (Tribute to Alter Bridge)",
    "Rolling in the Deep (Instrumental)",
  ]) assert.strictEqual(ehVersaoAlternativa(t), true, t);
});

test("versao legitima da propria banda serve", () => {
  for (const t of [
    "Broken (feat. Amy Lee)",
    "Valerie ('68 Version)",
    "Highway to Hell",
    "Love Me Do (Remastered 2009)",
    "Would (Live)",
  ]) assert.strictEqual(ehVersaoAlternativa(t), false, t);
});

// ── a escolha ─────────────────────────────────────────────
test("escolhe a faixa do artista certo, nao a primeira da lista", () => {
  const r = [
    faixa("Vitamin String Quartet", "Man in the Box"),
    faixa("Alice In Chains", "Man in the Box"),
  ];
  const e = escolherOriginal(r, { artista: "Alice in Chains", musica: "Man in the Box - CC Karaoke X" });
  assert.strictEqual(e.artistName, "Alice In Chains");
});

test("sem nenhuma faixa do artista, devolve nulo — e sem original nao ha nota", () => {
  const r = [faixa("Vitamin String Quartet", "Man in the Box"),
             faixa("Karaoke Allstars", "Man in the Box")];
  assert.strictEqual(escolherOriginal(r, { artista: "Alice in Chains", musica: "Man in the Box" }), null);
});

test("o caso da Pequena Sereia: o artista do acervo e o nome do filme", () => {
  // O acervo tem "A Pequena Sereia - Parte do Seu Mundo"; o iTunes devolve
  // Chiara Sasso, que e a interprete. Nao da para afirmar que e a mesma
  // gravacao, entao nao se compara. Era o segundo item com referencia errada.
  const r = [faixa("Chiara Sasso", "Parte de Seu Mundo")];
  assert.strictEqual(escolherOriginal(r, { artista: "A Pequena Sereia", musica: "Parte do Seu Mundo" }), null);
});

test("entre faixas do artista certo, o titulo exato vence", () => {
  const r = [
    faixa("Adele", "Skyfall (Live)"),
    faixa("Adele", "Skyfall"),
  ];
  const e = escolherOriginal(r, { artista: "Adele", musica: "Skyfall - Sing King" });
  assert.strictEqual(e.trackName, "Skyfall");
});

test("faixa sem previewUrl nao serve: nao ha o que ouvir nem o que medir", () => {
  const r = [faixa("Adele", "Skyfall", { previewUrl: null }),
             faixa("Adele", "Skyfall (Live)")];
  const e = escolherOriginal(r, { artista: "Adele", musica: "Skyfall" });
  assert.strictEqual(e.trackName, "Skyfall (Live)");
});

test("compilacao de karaoke nunca serve de original", () => {
  const r = [faixa("Adele", "Skyfall", { collectionName: "Karaoke Hits Vol. 2" })];
  assert.strictEqual(escolherOriginal(r, { artista: "Adele", musica: "Skyfall" }), null);
});

test("lista vazia, nula ou torta devolve nulo", () => {
  for (const r of [[], null, undefined, "nao e lista", [null, 3]]) {
    assert.strictEqual(escolherOriginal(r, { artista: "Adele", musica: "Skyfall" }), null);
  }
});

test("pedido sem artista devolve nulo em vez de aceitar qualquer um", () => {
  const r = [faixa("Qualquer Um", "Skyfall")];
  assert.strictEqual(escolherOriginal(r, { artista: "", musica: "Skyfall" }), null);
});

test("banda cujo nome legitimo acaba em Band nao e barrada", () => {
  // "band" ficou fora da lista de marcas por isso: ha banda de verdade
  // chamada assim, e barrar criaria falso negativo em artista legitimo.
  assert.strictEqual(casaArtista("Dave Matthews", "Dave Matthews Band"), true);
  assert.strictEqual(casaArtista("Electric Light Orchestra", "Electric Light Orchestra"), true);
});
