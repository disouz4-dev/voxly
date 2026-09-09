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
    id: "abc123", title: "Evidências Karaoke", channel: "Karaoke Br",
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

test("so entra karaoke: sem sinal no titulo nem no canal, cai fora", () => {
  assert.strictEqual(
    descartar(video({ title: "Evidências - Chitãozinho & Xororó", channel: "Som Livre" })),
    "nao e karaoke");
  // O sinal pode vir so do canal...
  assert.strictEqual(descartar(video({ title: "Evidências", channel: "Karaoke Brasil" })), null);
  // ...ou so do titulo.
  assert.strictEqual(descartar(video({ title: "Evidências Playback", channel: "Canal do Ze" })), null);
});

test("karaoke com titulo certo vence o clipe oficial", () => {
  const r = ordenarCandidatos([
    video({ id: "oficial", title: "Evidências - Chitãozinho & Xororó (Vídeo Oficial)", channel: "Som Livre", view_count: 90000000 }),
    video({ id: "kar", title: "Evidências - Chitãozinho & Xororó (Karaoke)", channel: "Karaoke Brasil" }),
  ], PEDIDO, { agora: AGORA });

  // O clipe oficial nao e mais penalizado: ele simplesmente nao entra na lista.
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].id, "kar");
  assert.ok(r[0].motivos.includes("titulo de karaoke"));
  assert.ok(r[0].motivos.includes("canal de karaoke"));
});

test("o cantor nao digita karaoke: a tag entra sozinha na consulta", () => {
  // O termo vem do cantor, so com musica e artista.
  const consulta = montarConsulta({ musica: "Evidências", artista: "Chitãozinho & Xororó" });
  assert.ok(/karaoke$/i.test(consulta));
  assert.ok(consulta.includes("Evidências"));

  // E a cobertura de titulo nao exige a palavra karaoke vinda do cantor.
  const r = ordenarCandidatos([
    video({ id: "ok", title: "Evidências - Chitãozinho & Xororó (Karaoke)", channel: "Karaoke Br" }),
  ], { musica: "Evidências", artista: "Chitãozinho & Xororó" }, { agora: AGORA });
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].motivos.includes("titulo bate com a musica"));
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
