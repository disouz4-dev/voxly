"use strict";

// Tocar a musica ERRADA para o cantor e o pior defeito possivel deste app: ele
// so aparece no palco, na frente da casa. Nao achar o arquivo e barato — cai na
// busca do YouTube e o KJ escolhe. Entao aqui o vies e sempre o mesmo: na
// duvida, NAO e a mesma musica.
//
// Caso real: pediram "Miss You Love" do Silverchair e tocou "I Miss You" do
// Blink 182.

const test = require("node:test");
const assert = require("node:assert");
const { mesmaMusica, versoesLocais } = require("../src/versoes");

test("titulos que se contem nao sao a mesma musica", () => {
  assert.strictEqual(mesmaMusica("Miss You Love", "I Miss You"), false,
    'Silverchair "Miss You Love" x Blink 182 "I Miss You"');
  assert.strictEqual(mesmaMusica("I Miss You", "Miss You Love"), false,
    "a confusao vale nos dois sentidos");
  assert.strictEqual(mesmaMusica("Miss You", "I Miss You"), false,
    'Rolling Stones "Miss You" x Blink 182 "I Miss You"');
  assert.strictEqual(mesmaMusica("Numb", "Numb Encore"), false);
  assert.strictEqual(mesmaMusica("Doomed", "Doomed To Die"), false);
});

test("a mesma musica continua sendo reconhecida", () => {
  assert.strictEqual(mesmaMusica("I Miss You", "I Miss You"), true);
  assert.strictEqual(mesmaMusica("Drown", "Drown (Karaoke Version)"), true,
    "ruido de karaoke entre parenteses nao muda a musica");
  assert.strictEqual(mesmaMusica("Satellites - JustusVidyo", "Satellites"), true,
    "pedido antigo trouxe o titulo inteiro do YouTube na musica");
  assert.strictEqual(mesmaMusica("Bring Me The Horizon", "Bring Me Horizon"), true,
    '"the" e ligacao, nao muda a identidade');
});

test("apostrofo nao separa a palavra", () => {
  assert.strictEqual(mesmaMusica("It's My Life", "Its My Life"), true);
  assert.strictEqual(mesmaMusica("Don't Stop Me Now", "Dont Stop Me Now"), true);
});

test("versoesLocais nao devolve a musica de outro artista", () => {
  const arquivos = [
    "Blink 182 - I Miss You - Zoom Karaoke Official [8sAOYg6yo-A].mp4",
  ];
  const achadas = versoesLocais(arquivos, { musica: "Miss You Love", artista: "Silverchair" });
  assert.deepStrictEqual(achadas, [],
    "nenhum arquivo de Miss You Love na pasta: tem que voltar vazio e cair na busca");
});

test("versoesLocais acha a musica certa entre varias", () => {
  const arquivos = [
    "Blink 182 - I Miss You - Zoom Karaoke Official [8sAOYg6yo-A].mp4",
    "Silverchair - Miss You Love - Sing King [aaaaaaaaaaa].mp4",
  ];
  const achadas = versoesLocais(arquivos, { musica: "Miss You Love", artista: "Silverchair" });
  assert.strictEqual(achadas.length, 1);
  assert.match(achadas[0].arquivo, /Silverchair/);
});

// ── Escolha do arquivo pelo nome ─────────────────────────────────────────
const { escolherPorNome } = require("../src/casamento");

const ACERVO = [
  "Blink 182 - I Miss You - Zoom Karaoke Official [8sAOYg6yo-A].mp4",
  "Bring Me the Horizon - Drown - Sing King [bbbbbbbbbbb].mp4",
];

test("nao entrega a musica de outro artista com titulo parecido", () => {
  assert.strictEqual(
    escolherPorNome(ACERVO, { musica: "Miss You Love", artista: "Silverchair" }), null,
    'o acervo nao tem "Miss You Love": melhor nao achar do que tocar Blink 182');
});

test("nao entrega musica diferente que so contem o titulo pedido", () => {
  assert.strictEqual(
    escolherPorNome(ACERVO, { musica: "Miss You", artista: "Rolling Stones" }), null);
});

test("acha a musica certa", () => {
  assert.match(
    escolherPorNome(ACERVO, { musica: "I Miss You", artista: "Blink 182" }) || "",
    /Blink 182/);
  assert.match(
    escolherPorNome(ACERVO, { musica: "Drown", artista: "Bring Me The Horizon" }) || "",
    /Drown/);
});

test("acha mesmo sem o artista no nome do arquivo", () => {
  const legado = ["I Miss You - Zoom Karaoke [8sAOYg6yo-A].mp4"];
  assert.match(
    escolherPorNome(legado, { musica: "I Miss You", artista: "Blink 182" }) || "",
    /I Miss You/);
});

// ── Artista curto e candidato unico ──────────────────────────────────────
// "One" existe do U2 e do Metallica. palavrasChave descartava palavra de ate
// 2 letras, entao "U2" virava lista vazia e mesmoArtista respondia true para
// qualquer um. E escolherPorNome devolvia o unico candidato SEM olhar artista.
const { mesmoArtista } = require("../src/versoes");

test("nome de artista curto nao vira coringa", () => {
  assert.strictEqual(mesmoArtista("Metallica", "U2"), false);
  assert.strictEqual(mesmoArtista("U2", "U2"), true);
  assert.strictEqual(mesmoArtista("AC DC", "Metallica"), false);
});

test("sem informacao de artista no arquivo, segue permissivo", () => {
  assert.strictEqual(mesmoArtista("", "U2"), true, "acervo antigo nao tem o campo");
});

test("candidato unico do artista errado nao e entregue", () => {
  const acervo = ["Metallica - One - Sing King [aaaaaaaaaaa].mp4"];
  assert.strictEqual(escolherPorNome(acervo, { musica: "One", artista: "U2" }), null,
    "melhor nao achar e o KJ baixar do que tocar Metallica para quem pediu U2");
  assert.match(escolherPorNome(acervo, { musica: "One", artista: "Metallica" }) || "", /Metallica/);
});

test("sem artista no pedido, o unico candidato serve", () => {
  const acervo = ["Metallica - One - Sing King [aaaaaaaaaaa].mp4"];
  assert.match(escolherPorNome(acervo, { musica: "One", artista: "Desconhecido" }) || "", /Metallica/);
});

test("arquivo antigo sem artista continua sendo achado", () => {
  const legado = ["One - Sing King [aaaaaaaaaaa].mp4"];
  assert.match(escolherPorNome(legado, { musica: "One", artista: "U2" }) || "", /One/);
});
