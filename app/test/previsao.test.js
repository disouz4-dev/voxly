const test = require("node:test");
const assert = require("node:assert");
const { horariosPrevistos, minutosESegundos, horaCurta, PADRAO_S, FOLGA_S } = require("../src/previsao");

const agora = new Date(2026, 8, 18, 22, 0, 0).getTime();
const item = (id, status = "aguardando") => ({ id, status });

test("a proxima comeca quando a atual acabar, mais o respiro da chamada", () => {
  const p = horariosPrevistos({ fila: [item("palco", "tocando"), item("a")], agora, restanteS: 60, duracaoDe: () => null });
  assert.equal(p.get("a"), agora + (60 + FOLGA_S) * 1000);
  assert.ok(!p.has("palco"), "quem esta no palco nao tem previsao");
});

test("cada musica na frente soma a duracao dela", () => {
  const dur = { a: 180, b: 300 };
  const p = horariosPrevistos({ fila: [item("a"), item("b"), item("c")], agora, restanteS: 0, duracaoDe: i => dur[i.id] });
  assert.equal(p.get("a"), agora + FOLGA_S * 1000);
  assert.equal(p.get("b"), p.get("a") + (180 + FOLGA_S) * 1000);
  assert.equal(p.get("c"), p.get("b") + (300 + FOLGA_S) * 1000);
});

test("musica que nunca tocou vale a media", () => {
  const p = horariosPrevistos({ fila: [item("a"), item("b")], agora, duracaoDe: () => null });
  assert.equal(p.get("b") - p.get("a"), (PADRAO_S + FOLGA_S) * 1000);
});

test("formatos da tela", () => {
  assert.equal(minutosESegundos(125), "2:05");
  assert.equal(minutosESegundos(-3), "0:00");
  assert.equal(horaCurta(agora + 42 * 60e3), "22:42");
});
