const test = require("node:test");
const assert = require("node:assert");
const { decidirAutoPlay, estadoGuardado, paraGuardar, ESPERA_MINIMA_MS, ASSENTAR_MS } = require("../src/autoplay");

const agora = new Date(2026, 9, 2, 23, 40, 0).getTime();
const pronto = (extra = {}) => ({ id: "m1", status: "confirmado", confirmandoAte: agora + 10000, ...extra });
const casa = (extra = {}) => ({ ligado: true, palcoVivo: true, ocupado: false, carregado: true,
  musicaNoAr: false, abertoHa: 60000, agora, ...extra });

test("confirmou e o palco esta livre: sobe, com respiro", () => {
  const d = decidirAutoPlay(pronto(), casa());
  assert.strictEqual(d.tocar, true);
  assert.ok(d.esperaMs >= ESPERA_MINIMA_MS);
});

test("desligado nao faz nada", () => {
  assert.strictEqual(decidirAutoPlay(pronto(), casa({ ligado: false })).tocar, false);
});

test("nunca corta quem esta cantando", () => {
  const d = decidirAutoPlay(pronto(), casa({ musicaNoAr: true }));
  assert.strictEqual(d.tocar, false);
  assert.match(d.motivo, /tocando/);
});

test("Palco fechado: nao toca e diz por que", () => {
  const d = decidirAutoPlay(pronto(), casa({ palcoVivo: false }));
  assert.strictEqual(d.tocar, false);
  assert.match(d.motivo, /Palco/);
});

test("uma subida por vez", () => {
  assert.strictEqual(decidirAutoPlay(pronto(), casa({ ocupado: true })).tocar, false);
});

test("tela recem-aberta espera assentar, e a fila precisa ter chegado", () => {
  assert.strictEqual(decidirAutoPlay(pronto(), casa({ abertoHa: ASSENTAR_MS - 1 })).tocar, false);
  assert.strictEqual(decidirAutoPlay(pronto(), casa({ carregado: false })).tocar, false);
});

test("confirmacao velha (Gerencia reaberta) nao sobe ninguem", () => {
  const velho = pronto({ confirmandoAte: agora - 5 * 60 * 1000 });
  const d = decidirAutoPlay(velho, casa());
  assert.strictEqual(d.tocar, false);
  assert.match(d.motivo, /velha/);
});

test("sem arquivo ou com download pendente, nao toca", () => {
  assert.strictEqual(decidirAutoPlay(pronto({ disponivel: false }), casa()).tocar, false);
  for (const s of ["baixando", "escolher", "erro"]) {
    assert.strictEqual(decidirAutoPlay(pronto({ statusDownload: s }), casa()).tocar, false, s);
  }
});

test("so pedido pronto sobe", () => {
  for (const status of ["aguardando", "confirmando", "tocando", "cantada", "pulada"]) {
    assert.strictEqual(decidirAutoPlay(pronto({ status }), casa()).tocar, false, status);
  }
  assert.strictEqual(decidirAutoPlay(pronto({ status: "pronto" }), casa()).tocar, true);
});

test("sem internet o KJ comanda", () => {
  assert.strictEqual(decidirAutoPlay(pronto(), casa({ offline: true })).tocar, false);
});

test("o interruptor morre com a noite", () => {
  const guardado = paraGuardar(true, "sessao-A", agora);
  assert.strictEqual(estadoGuardado(guardado, { sessaoId: "sessao-A", agora: agora + 60000 }), true);
  // Outra sessao: desligado.
  assert.strictEqual(estadoGuardado(guardado, { sessaoId: "sessao-B", agora }), false);
  // Guardado ontem: desligado.
  assert.strictEqual(estadoGuardado(guardado, { sessaoId: "sessao-A", agora: agora + 13 * 3600e3 }), false);
  // Lixo no disco nao derruba nada.
  for (const ruim of [null, "", "{quebrado", "{}", JSON.stringify({ ligado: true })]) {
    assert.strictEqual(estadoGuardado(ruim, { sessaoId: "sessao-A", agora }), false, String(ruim));
  }
  // Tambem aceita o texto cru do localStorage.
  assert.strictEqual(estadoGuardado(JSON.stringify(guardado), { sessaoId: "sessao-A", agora }), true);
});
