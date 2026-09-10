"use strict";

// Como o arquivo baixado deve se chamar. O app JA sabe o artista e a musica: o
// cantor escolheu pelo iTunes e o pedido carrega os dois nomes certos. Mesmo
// assim o download jogava o titulo cru do YouTube num LLM local para adivinhar
// de novo — e no Linux, sem Ollama, isso virava "erro de IA" e travava o
// download esperando edicao manual.

const test = require("node:test");
const assert = require("node:assert");
const { escolherIdentidade } = require("../src/identificacao");

const PEDIDO = { artista: "Bring Me The Horizon", musica: "Drown" };
const META   = { artista: "BMTH", musica: "Drown (Karaoke)" };
const CATALOGO = { artista: "Do Catalogo", musica: "Achada" };

test("o pedido manda: e o nome que o cantor escolheu", () => {
  assert.deepStrictEqual(escolherIdentidade({ pedido: PEDIDO, metadados: META, itunes: CATALOGO }),
    { artista: "Bring Me The Horizon", musica: "Drown", origem: "pedido" });
});

test("sem pedido, valem os metadados do proprio video", () => {
  assert.deepStrictEqual(escolherIdentidade({ metadados: META, itunes: CATALOGO }),
    { artista: "BMTH", musica: "Drown (Karaoke)", origem: "metadados" });
});

test("o iTunes e o ultimo recurso, nao o primeiro", () => {
  assert.deepStrictEqual(escolherIdentidade({ itunes: CATALOGO }),
    { artista: "Do Catalogo", musica: "Achada", origem: "itunes" });
});

test('"Desconhecido" nao e um artista', () => {
  const vago = { artista: "Desconhecido", musica: "Drown" };
  assert.strictEqual(escolherIdentidade({ pedido: vago, metadados: META }).origem, "metadados");
  assert.strictEqual(escolherIdentidade({ pedido: vago }), null,
    "sem mais nada de onde tirar, devolve null e o KJ digita");
});

test("faltando metade, o pedido nao serve", () => {
  assert.strictEqual(escolherIdentidade({ pedido: { artista: "BMTH", musica: "" }, metadados: META }).origem,
    "metadados");
  assert.strictEqual(escolherIdentidade({ pedido: { artista: "  ", musica: "Drown" }, itunes: CATALOGO }).origem, "itunes");
});

test("nada em lugar nenhum: null, para o KJ digitar", () => {
  assert.strictEqual(escolherIdentidade({}), null);
  assert.strictEqual(escolherIdentidade(), null);
});

// ── iTunes no lugar do LLM local ─────────────────────────────────────────
// Rodar um modelo local para extrair "artista" e "musica" de um titulo custa
// CPU e RAM da maquina que esta tocando o show, e o app ja usa o iTunes como
// fonte oficial dos nomes. A escolha entre os resultados e pura: o titulo do
// YouTube traz lixo (canal, "karaoke"), entao o criterio e o inverso do obvio
// — o resultado tem que caber no titulo, nao o titulo no resultado.

const { escolherDoItunes } = require("../src/identificacao");

const RESULTADOS = [
  { artistName: "Tyler Joseph",          trackName: "Drown" },
  { artistName: "Bring Me the Horizon",  trackName: "Drown" },
  { artistName: "Sing King",             trackName: "Sing" },
];

test("prefere o resultado que casa mais palavras do titulo", () => {
  const r = escolherDoItunes(RESULTADOS, "Bring Me the Horizon Drown Sing King");
  assert.deepStrictEqual(r, { artista: "Bring Me the Horizon", musica: "Drown" });
});

test("lixo do titulo do YouTube nao atrapalha", () => {
  const r = escolherDoItunes(
    [{ artistName: "Periphery", trackName: "Satellites" }],
    "Periphery Satellites JustusVidyo karaoke 1080p");
  assert.deepStrictEqual(r, { artista: "Periphery", musica: "Satellites" });
});

test("resultado que nao cabe no titulo e descartado", () => {
  assert.strictEqual(
    escolherDoItunes([{ artistName: "Adele", trackName: "Hello" }], "Periphery Satellites"),
    null);
  assert.strictEqual(escolherDoItunes([], "qualquer coisa"), null);
});

test("descarta versoes que nao servem para karaoke", () => {
  const r = escolherDoItunes([
    { artistName: "Bring Me the Horizon", trackName: "Drown (Live)" },
    { artistName: "Bring Me the Horizon", trackName: "Drown" },
  ], "Bring Me the Horizon Drown");
  assert.strictEqual(r.musica, "Drown");
});

test("titulo vazio nao inventa resultado", () => {
  assert.strictEqual(escolherDoItunes(RESULTADOS, "   "), null);
});

// O nome do canal viaja junto no titulo e polui a consulta: buscar "Periphery
// Satellites JustusVidyo" no iTunes nao devolve nada. O canal e conhecido no
// momento do download, entao da para tira-lo antes — sem gastar requisicao.
const { semCanal } = require("../src/identificacao");

test("tira o canal do titulo antes de consultar", () => {
  assert.strictEqual(semCanal("Periphery Satellites JustusVidyo", "JustusVidyo"),
    "Periphery Satellites");
  assert.strictEqual(semCanal("Blink 182 I Miss You Zoom Karaoke Official", "Zoom Karaoke Official"),
    "Blink 182 I Miss You");
});

test("nao remove palavra que tambem e do artista", () => {
  // O canal "Sing King" contem "King"; "King" tambem esta no nome da banda.
  assert.strictEqual(semCanal("King Gizzard Rattlesnake Sing King", "Sing King"),
    "King Gizzard Rattlesnake",
    "so o trecho contiguo do canal sai, nao toda ocorrencia solta");
});

test("sem canal, devolve o titulo intacto", () => {
  assert.strictEqual(semCanal("Periphery Satellites", ""), "Periphery Satellites");
  assert.strictEqual(semCanal("Periphery Satellites", null), "Periphery Satellites");
});

test("nao devolve string vazia quando o titulo e so o canal", () => {
  assert.strictEqual(semCanal("Sing King", "Sing King"), "Sing King",
    "sem nada sobrando, e melhor consultar o titulo inteiro que consultar nada");
});
