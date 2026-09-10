"use strict";

// Quem entra como "café com leite" (prioridade de primeira música).
//
// A regra existe para o cantor que chegou agora nao esperar uma fila enorme.
// Ela vinha escrita duas vezes, com contas diferentes, e nenhuma das duas
// filtrava o slot: musica parada em "espera" nao vai tocar naquele ciclo, mas
// contava como tempo de fila. Com o limite em 20 minutos bastavam 6 pedidos
// contados — 5 ativos e 1 em espera — para dar prioridade numa fila de 20 min.

const test = require("node:test");
const assert = require("node:assert");
const { ehPrioridade, minutosDeFila, MINUTOS_POR_MUSICA } = require("../src/prioridade");

const REGRAS = { prioridadeAtiva: true, prioridadeMinutos: 20 };
const ativos = n => Array.from({ length: n }, (_, i) => ({ id: "a" + i, status: "aguardando", slot: "ativa" }));

test("musica em espera nao conta como tempo de fila", () => {
  const fila = [...ativos(5), { id: "e", status: "aguardando", slot: "espera" }];
  assert.strictEqual(minutosDeFila(fila), 5 * MINUTOS_POR_MUSICA);
  assert.strictEqual(ehPrioridade({ regras: REGRAS, jaCantou: false, fila }), false,
    "5 ativos = 20 min, que NAO e maior que o limite de 20");
});

test("so o que ja esta tocando ou pronto tambem nao conta", () => {
  const fila = [...ativos(3), { id: "t", status: "tocando" }, { id: "p", status: "pronto" }];
  assert.strictEqual(minutosDeFila(fila), 3 * MINUTOS_POR_MUSICA);
});

test("fila realmente maior que o limite da prioridade", () => {
  assert.strictEqual(ehPrioridade({ regras: REGRAS, jaCantou: false, fila: ativos(6) }), true);
});

test("no limite exato nao ha prioridade", () => {
  // 5 x 4 = 20, e a regra e "maior que". Empate nao promove ninguem.
  assert.strictEqual(ehPrioridade({ regras: REGRAS, jaCantou: false, fila: ativos(5) }), false);
});

test("quem ja cantou nao tem prioridade, por maior que seja a fila", () => {
  assert.strictEqual(ehPrioridade({ regras: REGRAS, jaCantou: true, fila: ativos(30) }), false);
});

test("regra desligada nao promove ninguem", () => {
  const desligada = { prioridadeAtiva: false, prioridadeMinutos: 20 };
  assert.strictEqual(ehPrioridade({ regras: desligada, jaCantou: false, fila: ativos(30) }), false);
});

test("limite zero promove qualquer um com fila", () => {
  // "|| 40" transformava 0 em 40 e a configuracao do KJ era ignorada.
  const semLimite = { prioridadeAtiva: true, prioridadeMinutos: 0 };
  assert.strictEqual(ehPrioridade({ regras: semLimite, jaCantou: false, fila: ativos(1) }), true);
  assert.strictEqual(ehPrioridade({ regras: semLimite, jaCantou: false, fila: [] }), false,
    "fila vazia nao e espera nenhuma");
});

test("sem regras definidas, usa o padrao de 40 minutos", () => {
  assert.strictEqual(ehPrioridade({ jaCantou: false, fila: ativos(10) }), false, "40 min nao passa de 40");
  assert.strictEqual(ehPrioridade({ jaCantou: false, fila: ativos(11) }), true);
});
