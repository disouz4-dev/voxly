"use strict";

// A ordem da fila.
//
// Dois defeitos do show de 10/09 tinham a mesma raiz:
//
// 1. "Quem entra depois sobe na frente." Todo pedido novo recebia
//    ordemFila = (quantos estao aguardando) + 1. Isso supoe numeros continuos,
//    mas quem canta sai da contagem e deixa buraco: com [3, 4, 5] na fila, o
//    proximo ganhava 4 e passava na frente de quem tinha o 5.
//
// 2. "Mudei a ordem e ele nao respeitou." A ordenacao punha TODA prioridade
//    ("cafe com leite") antes de tudo, em cada atualizacao. O KJ arrastava
//    alguem para cima de um prioridade e na atualizacao seguinte ele voltava.
//
// Agora a prioridade vale na ENTRADA — ela escolhe onde o pedido entra — e
// depois disso so conta o ordemFila, que o arrastar do KJ reescreve.

const test = require("node:test");
const assert = require("node:assert");
const { ordenarFila, ordemParaNovo } = require("../src/ordem");

const esp = (id, ordemFila, extra = {}) => ({ id, status: "aguardando", slot: "ativa", ordemFila, ...extra });

test("o caso do show: com buraco na numeracao, o novo vai para o fim", () => {
  // 1 e 2 ja cantaram e sairam da fila.
  const fila = [esp("c", 3), esp("d", 4), esp("e", 5)];
  const n = ordemParaNovo(fila, { prioridade: false });
  assert.ok(n > 5, `recebeu ${n}: entraria na frente de quem ja estava`);
});

test("fila vazia comeca em 1", () => {
  assert.strictEqual(ordemParaNovo([], { prioridade: false }), 1);
});

test("a ordem manual do KJ vence a prioridade", () => {
  // O KJ arrastou o "normal" para cima: ele ficou com ordem 1.
  const fila = [esp("cafe", 2, { tipo: "prioridade" }), esp("normal", 1, { tipo: "normal" })];
  assert.deepStrictEqual(ordenarFila(fila).map(i => i.id), ["normal", "cafe"]);
});

test("prioridade entra depois das outras prioridades e antes dos normais", () => {
  const fila = [
    esp("p1", 1, { tipo: "prioridade" }),
    esp("n1", 2), esp("n2", 3),
  ];
  const n = ordemParaNovo(fila, { prioridade: true });
  assert.ok(n > 1 && n < 2, `recebeu ${n}: devia ficar entre p1 e n1`);
});

test("sem prioridade nenhuma esperando, a nova vai para a frente dos normais", () => {
  const fila = [esp("n1", 4), esp("n2", 5)];
  const n = ordemParaNovo(fila, { prioridade: true });
  assert.ok(n < 4, `recebeu ${n}: devia passar na frente de n1`);
});

test("entre prioridades vale a ordem de chegada", () => {
  const fila = [esp("p1", 1, { tipo: "prioridade" }), esp("n1", 2)];
  const n = ordemParaNovo(fila, { prioridade: true });
  const depois = ordenarFila([...fila, esp("p2", n, { tipo: "prioridade" })]).map(i => i.id);
  assert.deepStrictEqual(depois, ["p1", "p2", "n1"]);
});

test("prioridade com a fila so de prioridades vai para o fim", () => {
  const fila = [esp("p1", 1, { tipo: "prioridade" }), esp("p2", 2, { tipo: "prioridade" })];
  assert.ok(ordemParaNovo(fila, { prioridade: true }) > 2);
});

test("quem esta no palco ou sendo chamado vem antes da fila", () => {
  const fila = [
    esp("fila1", 1),
    { id: "chamado", status: "confirmando", ordemFila: 9 },
    { id: "pronto",  status: "pronto",      ordemFila: 8 },
    { id: "palco",   status: "tocando",     ordemFila: 7 },
  ];
  assert.deepStrictEqual(ordenarFila(fila).map(i => i.id), ["palco", "pronto", "chamado", "fila1"]);
});

test("a ordenacao e consistente, nao depende da ordem de entrada", () => {
  // A comparacao antiga devolvia -1 nos dois sentidos para dois 'tocando'.
  const a = [esp("x", 2), { id: "t1", status: "tocando", ordemFila: 1 }, esp("y", 1)];
  const b = [...a].reverse();
  assert.deepStrictEqual(ordenarFila(a).map(i => i.id), ordenarFila(b).map(i => i.id));
});

test("ordenarFila nao altera o array recebido", () => {
  const fila = [esp("b", 2), esp("a", 1)];
  ordenarFila(fila);
  assert.deepStrictEqual(fila.map(i => i.id), ["b", "a"]);
});

test("pedido sem ordemFila vai para o fim, nao para o comeco", () => {
  // `|| 0` fazia registro antigo sem o campo pular para o topo.
  const fila = [esp("com", 1), { id: "sem", status: "aguardando", slot: "ativa" }];
  assert.deepStrictEqual(ordenarFila(fila).map(i => i.id), ["com", "sem"]);
});
