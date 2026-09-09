"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { montarConsulta, ordenarCandidatos, normalizar, cobertura, idadeEmDias, descartar } =
  require("../src/yt-busca.js");

// Data fixa: sem isso os testes de recencia mudariam de resultado com o tempo.
const AGORA = Date.UTC(2026, 8, 9); // 2026-09-09
const PEDIDO = { musica: "Evidências", artista: "Chitãozinho & Xororó" };

function video(over) {
  return Object.assign({
    id: "abc123", title: "titulo", channel: "canal",
    duration: 240, upload_date: "20240101", view_count: 1000,
  }, over);
}

test("normalizar remove acentos e pontuacao", () => {
  assert.strictEqual(normalizar("Evidências (Ao Vivo) — Chitãozinho!"), "evidencias ao vivo chitaozinho");
});

test("consulta sempre carrega a tag karaoke", () => {
  assert.ok(montarConsulta(PEDIDO).toLowerCase().endsWith("karaoke"));
});

test("cobertura ignora palavras curtas e aceita ordem trocada", () => {
  assert.strictEqual(cobertura("xororo e chitaozinho evidencias", "Chitãozinho & Xororó"), 1);
  assert.strictEqual(cobertura("nada a ver", "Evidências"), 0);
});

test("idadeEmDias rejeita formato invalido e data futura", () => {
  assert.strictEqual(idadeEmDias("2024-01-01", AGORA), null);
  assert.strictEqual(idadeEmDias(undefined, AGORA), null);
  assert.strictEqual(idadeEmDias("20990101", AGORA), null);
  assert.strictEqual(Math.round(idadeEmDias("20260909", AGORA)), 0);
});

test("descarta o que nao serve para uma fila de karaoke", () => {
  assert.strictEqual(descartar(video({ duration: 30 })), "curto demais");
  assert.strictEqual(descartar(video({ duration: 3600 })), "longo demais");
  assert.strictEqual(descartar(video({ duration: null })), "sem duracao");
  assert.strictEqual(descartar(video({ is_live: true })), "transmissao ao vivo");
  assert.strictEqual(descartar(video()), null);
});

test("karaoke com titulo certo vence o clipe oficial", () => {
  const r = ordenarCandidatos([
    video({ id: "oficial", title: "Evidências - Chitãozinho & Xororó (Vídeo Oficial)", channel: "Som Livre", view_count: 90000000 }),
    video({ id: "kar", title: "Evidências - Chitãozinho & Xororó (Karaoke)", channel: "Karaoke Brasil" }),
  ], PEDIDO, { agora: AGORA });

  assert.strictEqual(r[0].id, "kar");
  assert.ok(r[0].motivos.includes("titulo de karaoke"));
  assert.ok(r[0].motivos.includes("canal de karaoke"));
  // Nem 90 milhoes de views salvam o clipe oficial.
  assert.ok(r[0].pontos > r[1].pontos);
});

test("entre dois karaokes iguais, o mais recente sobe", () => {
  const base = { title: "Evidências Karaoke", channel: "Karaoke Br", view_count: 5000 };
  const r = ordenarCandidatos([
    video(Object.assign({ id: "velho", upload_date: "20150101" }, base)),
    video(Object.assign({ id: "novo",  upload_date: "20260101" }, base)),
  ], PEDIDO, { agora: AGORA });

  assert.strictEqual(r[0].id, "novo");
});

test("canal preferido do KJ passa na frente", () => {
  const r = ordenarCandidatos([
    video({ id: "generico", title: "Evidências Karaoke", channel: "Canal Qualquer Karaoke" }),
    video({ id: "confiavel", title: "Evidências Playback", channel: "Estudio do Ze" }),
  ], PEDIDO, { agora: AGORA, canaisPreferidos: ["Estudio do Ze"] });

  assert.strictEqual(r[0].id, "confiavel");
  assert.ok(r[0].motivos.includes("canal preferido"));
});

test("respeita o limite e nunca quebra com entrada vazia ou suja", () => {
  const muitos = Array.from({ length: 30 }, (_, i) =>
    video({ id: "v" + i, title: "Evidências Karaoke", channel: "Karaoke" }));
  assert.strictEqual(ordenarCandidatos(muitos, PEDIDO, { agora: AGORA, limite: 5 }).length, 5);

  assert.deepStrictEqual(ordenarCandidatos(null, PEDIDO, { agora: AGORA }), []);
  assert.deepStrictEqual(ordenarCandidatos([null, {}, { id: null }], PEDIDO, { agora: AGORA }), []);
});

test("monta url quando o yt-dlp nao devolve webpage_url", () => {
  const r = ordenarCandidatos([video({ id: "xyz789", title: "Evidências Karaoke" })], PEDIDO, { agora: AGORA });
  assert.strictEqual(r[0].url, "https://www.youtube.com/watch?v=xyz789");
});
