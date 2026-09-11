"use strict";

// A sessao termina onde o KJ marcou. A tolerancia de 5 minutos existe para o
// atraso do proprio show — nao para esticar a noite: passado o prazo o cantor
// nao poe mais musica, e o KJ segue tocando o que ja esta na fila.

const test = require("node:test");
const assert = require("node:assert");
const { TOLERANCIA_MS, podePedirMusica } = require("../src/sessao-regras.js");

const MIN = 60 * 1000;
const FIM = Date.parse("2026-09-10T23:00:00Z");

test("a tolerancia e de 5 minutos", () => {
  assert.strictEqual(TOLERANCIA_MS, 5 * MIN);
});

test("antes do termino o cantor pede normalmente", () => {
  assert.strictEqual(podePedirMusica(FIM, FIM - 30 * MIN), true);
  assert.strictEqual(podePedirMusica(FIM, FIM - 1), true);
});

test("dentro da tolerancia ainda pede", () => {
  assert.strictEqual(podePedirMusica(FIM, FIM), true, "no minuto exato do termino");
  assert.strictEqual(podePedirMusica(FIM, FIM + 4 * MIN + 59000), true);
  assert.strictEqual(podePedirMusica(FIM, FIM + TOLERANCIA_MS), true, "no limite");
});

test("passada a tolerancia o cantor nao poe mais musica", () => {
  assert.strictEqual(podePedirMusica(FIM, FIM + TOLERANCIA_MS + 1), false);
  assert.strictEqual(podePedirMusica(FIM, FIM + 60 * MIN), false);
});

test("sessao antiga sem termino declarado nao trava o cantor", () => {
  assert.strictEqual(podePedirMusica(null, Date.now()), true);
  assert.strictEqual(podePedirMusica(undefined, Date.now()), true);
});

test("aceita Timestamp do Firestore, nao so milissegundos", () => {
  const comoFirestore = { toDate: () => new Date(FIM) };
  assert.strictEqual(podePedirMusica(comoFirestore, FIM + 1 * MIN), true);
  assert.strictEqual(podePedirMusica(comoFirestore, FIM + 6 * MIN), false);
});

// ── Faxina ──────────────────────────────────────────────────
// A faxina de sessoes vencidas roda em TODA Gerencia aberta. Uma segunda
// maquina com o Voxly aberto (o Linux, por exemplo) apagava a sessao que a
// primeira estava usando — fila primeiro — so porque o horario de termino
// tinha passado. Sessao com Gerencia viva nao se apaga.
const { podeApagarNaFaxina, BATIMENTO_MS } = require("../src/sessao-regras.js");

test("sessão vencida e sem Gerência viva: pode apagar", () => {
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, agora: FIM + TOLERANCIA_MS + 1 }), true);
});

test("sessão vencida, mas com a Gerência batendo o ponto: NÃO apaga", () => {
  const agora = FIM + 3 * 60 * MIN;
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, hostVivoEm: agora - 2 * MIN, agora }), false);
});

test("Gerência que parou de bater o ponto há muito tempo: a sessão volta a poder ser apagada", () => {
  const agora = FIM + 3 * 60 * MIN;
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, hostVivoEm: agora - BATIMENTO_MS - 1, agora }), true);
});

test("sessão ainda no prazo nunca é apagada", () => {
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, agora: FIM - MIN }), false);
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, agora: FIM + TOLERANCIA_MS }), false);
});

test("sessão antiga sem término: 24 h depois de criada", () => {
  const criada = FIM;
  assert.strictEqual(podeApagarNaFaxina({ criadaEm: criada, agora: criada + 23 * 60 * MIN }), false);
  assert.strictEqual(podeApagarNaFaxina({ criadaEm: criada, agora: criada + 25 * 60 * MIN }), true);
});

test("sem término nem data de criação: não apaga às cegas", () => {
  assert.strictEqual(podeApagarNaFaxina({ agora: FIM }), false);
});

test("aceita Timestamp do Firestore", () => {
  const ts = ms => ({ toDate: () => new Date(ms) });
  assert.strictEqual(podeApagarNaFaxina({ termino: ts(FIM), agora: FIM + 60 * MIN }), true);
});
