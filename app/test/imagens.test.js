"use strict";

// As imagens do acervo: foto do artista e capa da música.
//
// Decisão dele em 06/11: "a cópia das imagens tem que ficar no Firebase, não
// tem que nada ficar local". Então a imagem vai DENTRO do documento que já
// existe (`artistas/{slug}`, `capas/{chave}`), pequena, em base64 — e o celular
// só lê do banco: nenhuma chamada ao iTunes, nada no HD, nada no cache do
// aparelho.
//
// A escolha da arte no resultado do iTunes vivia copiada em dois lugares
// (main.js e profile.html) e era exatamente onde o defeito morava: o parâmetro
// era `entity=musicArtist`, que NUNCA devolve `artworkUrl100`. Medido em 06/11
// com Pitty, Seether e Legião Urbana: zero resultados com arte. Aqui a regra
// fica num lugar só, testada.

const test = require("node:test");
const assert = require("node:assert");
const {
  escolherArteDeArtista, escolherArteDeMusica, urlDaArteEm,
  precisaDeImagem, tamanhoDoDataUrl, imagemCabe, LIMITE_IMAGEM_BYTES,
} = require("../src/imagens");

const arte = n => `https://is1-ssl.mzstatic.com/image/thumb/Music/${n}/100x100bb.jpg`;

test("escolhe a arte do artista cujo nome casa exatamente", () => {
  const r = [
    { artistName: "Seether Tribute", artworkUrl100: arte(1) },
    { artistName: "Seether", artworkUrl100: arte(2) },
  ];
  assert.strictEqual(escolherArteDeArtista(r, "Seether"), arte(2));
});

test("sem nome exato, usa o primeiro COM arte", () => {
  const r = [
    { artistName: "Outro", artworkUrl100: null },
    { artistName: "Outro 2", artworkUrl100: arte(3) },
  ];
  assert.strictEqual(escolherArteDeArtista(r, "Seether"), arte(3));
});

test("o caso do defeito: nenhum resultado com arte devolve null", () => {
  // E o que `entity=musicArtist` devolve sempre. Antes isso passava calado por
  // "esse artista nao tem foto".
  const r = [{ artistName: "Pitty" }, { artistName: "Pitty", artworkUrl100: "" }];
  assert.strictEqual(escolherArteDeArtista(r, "Pitty"), null);
});

test("nome do artista ignora acento e caixa", () => {
  const r = [{ artistName: "Legião Urbana", artworkUrl100: arte(4) }];
  assert.strictEqual(escolherArteDeArtista(r, "legiao urbana"), arte(4));
});

test("capa da música prefere o título igual", () => {
  const r = [
    { trackName: "Broken (Live)", artworkUrl100: arte(5) },
    { trackName: "Broken", artworkUrl100: arte(6) },
  ];
  assert.strictEqual(escolherArteDeMusica(r, "Broken"), arte(6));
});

test("capa da música aceita o título que contém o pedido", () => {
  // "Broken (feat. Amy Lee)" e o que o iTunes devolve para "Seether Broken".
  const r = [{ trackName: "Broken (feat. Amy Lee)", artworkUrl100: arte(7) }];
  assert.strictEqual(escolherArteDeMusica(r, "Broken"), arte(7));
});

test("capa: sem nenhum título parecido, o primeiro com arte serve", () => {
  const r = [{ trackName: "Outra coisa", artworkUrl100: arte(8) }];
  assert.strictEqual(escolherArteDeMusica(r, "Broken"), arte(8));
});

test("lista vazia, nula ou torta não estoura", () => {
  for (const r of [[], null, undefined, "nao e lista", [null, undefined]]) {
    assert.strictEqual(escolherArteDeArtista(r, "X"), null);
    assert.strictEqual(escolherArteDeMusica(r, "X"), null);
  }
});

test("o tamanho da arte é trocado na URL", () => {
  assert.strictEqual(urlDaArteEm(arte(9), 120),
    "https://is1-ssl.mzstatic.com/image/thumb/Music/9/120x120bb.jpg");
});

test("URL que não tem o padrão de tamanho volta como está", () => {
  const u = "https://exemplo/arte.jpg";
  assert.strictEqual(urlDaArteEm(u, 120), u);
  assert.strictEqual(urlDaArteEm(null, 120), null);
});

test("documento sem imagem precisa de imagem", () => {
  assert.strictEqual(precisaDeImagem(null), true);
  assert.strictEqual(precisaDeImagem({}), true);
  assert.strictEqual(precisaDeImagem({ img: "" }), true);
});

test("documento com imagem não é pedido de novo", () => {
  assert.strictEqual(precisaDeImagem({ img: "data:image/jpeg;base64,/9j/4AAQ" }), false);
});

test("documento marcado como SEM arte não é pedido de novo", () => {
  // Artista que o iTunes nao tem: marca-se e nao se insiste a cada abertura do
  // acervo, senao sao centenas de consultas por noite para nada.
  assert.strictEqual(precisaDeImagem({ img: null, semArte: true }), false);
});

test("tamanho real do base64, não o da string", () => {
  // 4 caracteres de base64 = 3 bytes.
  assert.strictEqual(tamanhoDoDataUrl("data:image/jpeg;base64,AAAA"), 3);
  assert.strictEqual(tamanhoDoDataUrl("data:image/jpeg;base64,AAAAAAAA"), 6);
  assert.strictEqual(tamanhoDoDataUrl("AAAA"), 0, "sem o cabecalho data: nao conta");
  assert.strictEqual(tamanhoDoDataUrl(null), 0);
});

test("imagem grande não entra no documento", () => {
  // O documento do Firestore tem teto de 1 MB e precisa caber com o resto.
  const grande = "data:image/jpeg;base64," + "A".repeat(Math.ceil(LIMITE_IMAGEM_BYTES * 4 / 3) + 100);
  assert.strictEqual(imagemCabe(grande), false);
  const pequena = "data:image/jpeg;base64," + "A".repeat(4000);
  assert.strictEqual(imagemCabe(pequena), true);
});

test("o limite da imagem é bem menor que o do documento", () => {
  assert.ok(LIMITE_IMAGEM_BYTES < 1048576 / 4,
    `${LIMITE_IMAGEM_BYTES} bytes — tem de sobrar folga no documento de 1 MB`);
});
