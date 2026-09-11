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
//
// "Viva" nao pode depender de comparar relogios de maquinas diferentes: uma
// com o relogio adiantado veria o batimento dos outros como velho. A faxina
// guarda o batimento que viu e so o considera parado se ele nao mudou por
// 10 min — medidos no relogio dela mesma.
const { podeApagarNaFaxina, batimentoParado, BATIMENTO_MS } = require("../src/sessao-regras.js");

test("sessão vencida e Gerência parada: pode apagar", () => {
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, batimentoParado: true, agora: FIM + TOLERANCIA_MS + 1 }), true);
});

test("sessão vencida, mas com a Gerência viva: NÃO apaga", () => {
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, batimentoParado: false, agora: FIM + 3 * 60 * MIN }), false);
});

test("sessão ainda no prazo nunca é apagada", () => {
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, batimentoParado: true, agora: FIM - MIN }), false);
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, batimentoParado: true, agora: FIM + TOLERANCIA_MS }), false);
});

test("sessão antiga sem término: 24 h depois de criada", () => {
  const criada = FIM;
  assert.strictEqual(podeApagarNaFaxina({ criadaEm: criada, batimentoParado: true, agora: criada + 23 * 60 * MIN }), false);
  assert.strictEqual(podeApagarNaFaxina({ criadaEm: criada, batimentoParado: true, agora: criada + 25 * 60 * MIN }), true);
});

test("sem término nem data de criação: não apaga às cegas", () => {
  assert.strictEqual(podeApagarNaFaxina({ batimentoParado: true, agora: FIM }), false);
});

test("aceita Timestamp do Firestore", () => {
  const ts = ms => ({ toDate: () => new Date(ms) });
  assert.strictEqual(podeApagarNaFaxina({ termino: ts(FIM), batimentoParado: true, agora: FIM + 60 * MIN }), true);
});

test("primeira vez que a faxina vê um batimento: não dá como parado", () => {
  const mem = new Map();
  assert.strictEqual(batimentoParado(mem, "s1", 1000, 0), false);
});

test("batimento que muda entre passadas: Gerência viva", () => {
  const mem = new Map();
  batimentoParado(mem, "s1", 1000, 0);
  assert.strictEqual(batimentoParado(mem, "s1", 61000, 60 * MIN), false);
});

test("batimento parado por 10 min no relógio desta máquina: parado", () => {
  const mem = new Map();
  batimentoParado(mem, "s1", 1000, 0);
  assert.strictEqual(batimentoParado(mem, "s1", 1000, BATIMENTO_MS - 1), false);
  assert.strictEqual(batimentoParado(mem, "s1", 1000, BATIMENTO_MS), true);
});

test("relógio de outra máquina adiantado não mata sessão viva", () => {
  // O batimento vem do servidor; esta maquina esta 2 h adiantada. Comparar
  // horarios diria "parada ha 2 h"; comparar mudancas diz "viva".
  const mem = new Map();
  const adiantado = 2 * 60 * MIN;
  batimentoParado(mem, "s1", 1000, adiantado);
  assert.strictEqual(batimentoParado(mem, "s1", 61000, adiantado + 60 * MIN), false);
});

test("sessão sem batimento (Gerência antiga): decide pelo prazo, como antes", () => {
  assert.strictEqual(batimentoParado(new Map(), "s1", null, 0), true);
});

test("aceita o Timestamp do servidor como batimento", () => {
  const mem = new Map();
  const ts = ms => ({ toDate: () => new Date(ms) });
  batimentoParado(mem, "s1", ts(1000), 0);
  assert.strictEqual(batimentoParado(mem, "s1", ts(1000), BATIMENTO_MS), true);
});

test("sem saber do batimento, a faxina decide pelo prazo (como antes do batimento existir)", () => {
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, agora: FIM + 60 * MIN }), true);
  assert.strictEqual(podeApagarNaFaxina({ termino: FIM, agora: FIM - MIN }), false);
});
