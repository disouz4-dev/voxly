"use strict";

// Prioridade ("cafe com leite") so quando a espera passa do tempo que o KJ
// marcou.
//
// O show de 05/11 ficou incompreensivel: o diario tem 30 promocoes automaticas
// numa noite, quase todas com a fila curta — Yarita 20:30, Carol 20:32, Hanna
// 20:37, NamiiKath 20:41, e assim a noite toda. Com `cederApos: 1`, bastava que
// todo veterano esperando ja tivesse cantado uma vez para TODO recem-chegado
// virar cafe. Quase a fila inteira virou prioridade, a intercalacao passou a
// embaralhar tudo a cada mudanca, e o dono disse: "hoje a fila foi caotica, eu
// nao entendi nada".
//
// A regra dele (05/11): "a prioridade so deve existir quando a fila ficar maior
// que o tempo estipulado pelo KJ... se eu colocar 30min a prioridade so vai ser
// habilitada se a pessoa tiver que esperar mais que 30 min a partir da
// colocacao da musica na fila".
//
// Conta: espera_prevista = horario previsto de tocar - horario em que o pedido
// entrou na fila. O marco zero e a ENTRADA do pedido, nao o instante atual.

const test = require("node:test");
const assert = require("node:assert");
const { promocoesDeCafe } = require("../src/ordem");

const esp = (id, ordemFila, extra = {}) => ({
  id, cantorUid: id, status: "aguardando", slot: "ativa", ordemFila, ...extra,
});
const N = (id, ordem) => esp(id, ordem, { tipo: "normal" });
const C = (id, ordem) => esp(id, ordem, { tipo: "prioridade" });

// "ja cantou" para todo mundo cujo id comeca com "v" (veterano).
const jaCantou = uid => String(uid).startsWith("v");
const cantadas = uid => (jaCantou(uid) ? 1 : 0);

// Espera prevista declarada item a item, em minutos.
const esperaDe = mapa => item => (item && item.id in mapa ? mapa[item.id] : null);

test("o caso de 05/11: fila curta, ninguem vira prioridade", () => {
  // Veterano esperando que ja cantou 1 vez: pelo gatilho antigo (cederApos: 1)
  // o novato seria promovido na hora. Com 10 min de espera prevista e o campo
  // em 30, nao deve ser.
  const fila = [esp("v1", 1, { tipo: "normal" }), N("novato", 2)];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ v1: 5, novato: 10 }),
  });
  assert.deepEqual(promover, [], "com 10 min de espera a prioridade nao se habilita");
});

test("passando do tempo marcado, quem nao cantou vira prioridade", () => {
  const fila = [esp("v1", 1, { tipo: "normal" }), N("novato", 2)];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ v1: 40, novato: 45 }),
  });
  assert.deepEqual(promover, ["novato"], "45 min de espera passa dos 30 marcados");
});

test("o limite e estrito: exatamente o tempo marcado nao habilita", () => {
  // "esperar MAIS que 30 min" — 30 em ponto nao e mais que 30.
  const fila = [esp("v1", 1, { tipo: "normal" }), N("novato", 2)];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ v1: 10, novato: 30 }),
  });
  assert.deepEqual(promover, []);
});

test("cada um pela SUA espera: o do fim entra, o do comeco nao", () => {
  const fila = [
    esp("v1", 1, { tipo: "normal" }),
    N("perto", 2),     // vai cantar logo
    N("longe", 3),     // vai esperar a noite
  ];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ v1: 5, perto: 12, longe: 70 }),
  });
  assert.deepEqual(promover, ["longe"]);
});

test("com a fila ja cheia de cafes, quem tem espera curta nao entra junto", () => {
  // O gatilho antigo `jaTemCafe` fazia qualquer um que nao cantou entrar junto
  // so porque existia um cafe na fila. Era assim que a fila toda virava
  // prioridade depois do primeiro.
  const fila = [C("c1", 1), C("c2", 2), N("novato", 3)];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ c1: 50, c2: 55, novato: 8 }),
  });
  assert.deepEqual(promover, [], "a fila ter cafe nao basta — a espera dele e curta");
});

test("espera desconhecida nao promove ninguem", () => {
  // Sem saber a espera, o seguro e nao mexer na ordem: promover por engano e o
  // que deixou a fila caotica.
  const fila = [esp("v1", 1, { tipo: "normal" }), N("novato", 2)];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: () => null,
  });
  assert.deepEqual(promover, []);
});

test("campo em zero (ou vazio) mantem a regra antiga, sem olhar tempo", () => {
  // Quem nunca mexer no campo novo tem o comportamento de antes.
  const fila = [esp("v1", 1, { tipo: "normal" }), N("novato", 2)];
  const comZero = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1, esperaMinimaMin: 0,
    esperaPrevistaMin: esperaDe({ v1: 1, novato: 1 }),
  });
  assert.deepEqual(comZero, ["novato"], "com o campo desligado vale o gatilho antigo");

  const semCampo = promocoesDeCafe(fila, { jaCantou, cantadas, cederApos: 1 });
  assert.deepEqual(semCampo, ["novato"]);
});

test("prioridade desligada vence o tempo", () => {
  const fila = [esp("v1", 1, { tipo: "normal" }), N("novato", 2)];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1, prioridadeAtiva: false,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ v1: 90, novato: 120 }),
  });
  assert.deepEqual(promover, []);
});

test("quem ja cantou nao vira prioridade, por mais que espere", () => {
  const fila = [esp("v1", 1, { tipo: "normal" }), esp("v2", 2, { tipo: "normal" })];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ v1: 80, v2: 95 }),
  });
  assert.deepEqual(promover, [], "cafe com leite e de quem ainda nao cantou");
});

test("musica em espera (segunda vaga) nunca vira prioridade", () => {
  const fila = [
    esp("v1", 1, { tipo: "normal" }),
    esp("novato", 2, { tipo: "normal", slot: "espera" }),
  ];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ v1: 10, novato: 90 }),
  });
  assert.deepEqual(promover, []);
});

test("um cafe por cantor, mesmo com duas musicas estourando o tempo", () => {
  const fila = [
    esp("v1", 1, { tipo: "normal" }),
    N("novato", 2),
    esp("novato", 3, { id: "novato-2", tipo: "normal" }),
  ];
  const promover = promocoesDeCafe(fila, {
    jaCantou, cantadas, cederApos: 1,
    esperaMinimaMin: 30,
    esperaPrevistaMin: esperaDe({ v1: 10, novato: 60, "novato-2": 90 }),
  });
  assert.deepEqual(promover, ["novato"], "promove o primeiro pedido dele, nao os dois");
});
