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

// ── Cafe com leite: duas filas andando juntas ────────────────────────────
// Regra definida pelo dono do app: "se dez pessoas chegarem, a logica deve ser
// uma pessoa da fila, um cafe com leite, outra pessoa da fila, outro cafe com
// leite. A fila principal nunca pode parar de andar."
//
// A primeira versao desta regra (que eu escrevi) punha toda prioridade antes
// de todos os normais: com dez chegando, a fila principal pararia ate as dez
// cantarem. Era o oposto do pedido.

// Simula chegadas, uma de cada vez, como acontece no app.
function chegam(fila, tipos) {
  let atual = [...fila];
  tipos.forEach((tipo, k) => {
    const ordemFila = ordemParaNovo(atual, { prioridade: tipo === "P" });
    atual.push(esp(`${tipo}${k}`, ordemFila, { tipo: tipo === "P" ? "prioridade" : "normal" }));
  });
  return ordenarFila(atual).map(i => i.tipo === "prioridade" ? "P" : "N");
}

test("o exemplo do dono: dez cafe com leite chegam numa fila de cinco", () => {
  const fila = [1, 2, 3, 4, 5].map(n => esp(`n${n}`, n, { tipo: "normal" }));
  const ordem = chegam(fila, Array(10).fill("P"));
  assert.deepStrictEqual(ordem.slice(0, 10), ["N","P","N","P","N","P","N","P","N","P"],
    "um da fila, um cafe com leite, alternando");
});

test("a fila principal nunca para: normal que chega depois ainda alterna", () => {
  // Cinco normais, dez cafes: sobram cinco cafes no fim. Um normal novo nao
  // pode esperar os cinco — ele entra depois do primeiro que sobrou.
  const fila = [1, 2, 3, 4, 5].map(n => esp(`n${n}`, n, { tipo: "normal" }));
  const ordem = chegam(fila, [...Array(10).fill("P"), "N"]);
  const idx = ordem.lastIndexOf("N");
  const cafesAntes = ordem.slice(0, idx).filter(t => t === "P").length;
  const normaisAntes = ordem.slice(0, idx).filter(t => t === "N").length;
  // Alternancia estrita comecando pela fila principal: antes do proximo normal
  // ha tantos cafes quantos normais — N,P,N,P,...,N,P e entao ele.
  assert.strictEqual(cafesAntes, normaisAntes,
    `o normal novo esperou ${cafesAntes} cafes com ${normaisAntes} normais na frente: ${ordem.join("")}`);
});

test("o primeiro cafe com leite entra depois do primeiro da fila, nao antes", () => {
  const fila = [esp("n1", 4, { tipo: "normal" }), esp("n2", 5, { tipo: "normal" })];
  const n = ordemParaNovo(fila, { prioridade: true });
  assert.ok(n > 4 && n < 5, `recebeu ${n}: devia ficar entre n1 e n2`);
});

test("entre cafes com leite vale a ordem de chegada", () => {
  const fila = [1, 2, 3].map(n => esp(`n${n}`, n, { tipo: "normal" }));
  let atual = [...fila];
  for (const id of ["p1", "p2"]) {
    atual.push(esp(id, ordemParaNovo(atual, { prioridade: true }), { tipo: "prioridade" }));
  }
  const ids = ordenarFila(atual).map(i => i.id).filter(x => x.startsWith("p"));
  assert.deepStrictEqual(ids, ["p1", "p2"]);
});

test("quem ja esta na fila principal nunca e passado por um normal que chega depois", () => {
  // O defeito do show: "tem gente que ja esta na fila e pessoas que colocam
  // depois acabam subindo".
  const fila = [esp("n1", 1, { tipo: "normal" }), esp("p1", 1.5, { tipo: "prioridade" }), esp("n2", 2, { tipo: "normal" })];
  const n = ordemParaNovo(fila, { prioridade: false });
  const ordem = ordenarFila([...fila, esp("novo", n, { tipo: "normal" })]).map(i => i.id);
  assert.ok(ordem.indexOf("novo") > ordem.indexOf("n2"), ordem.join(","));
});

test("so cafes com leite esperando: o primeiro ainda vai antes do normal novo", () => {
  // Quem ja esperava nao pode ser furado por quem acabou de chegar.
  const fila = [esp("p1", 1, { tipo: "prioridade" }), esp("p2", 2, { tipo: "prioridade" })];
  const n = ordemParaNovo(fila, { prioridade: false });
  const ordem = ordenarFila([...fila, esp("n1", n, { tipo: "normal" })]).map(i => i.id);
  assert.deepStrictEqual(ordem, ["p1", "n1", "p2"]);
});

test("cafe com leite sem ninguem na fila principal vai para o fim", () => {
  const fila = [esp("p1", 1, { tipo: "prioridade" })];
  assert.ok(ordemParaNovo(fila, { prioridade: true }) > 1);
  assert.strictEqual(ordemParaNovo([], { prioridade: true }), 1);
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

// Pedido na vaga de espera nao toca neste ciclo: nao pode servir de ancora
// para a alternancia. Sem fixture com "espera", tirar o filtro de ordem.js
// deixava a suite verde.
test("pedido em espera não conta na alternância do café com leite", () => {
  const fila = [
    esp("a", 1),
    esp("x", 1.5, { tipo: "prioridade", slot: "espera" }),   // café na ESPERA: ignorado
    esp("b", 2),
  ];
  // Com o de espera ignorado, o primeiro café real entra logo depois de "a".
  assert.strictEqual(ordemParaNovo(fila, { prioridade: true }), 1.5);
  // E um normal vai para o fim, depois de tudo — inclusive do número do de espera.
  assert.strictEqual(ordemParaNovo(fila, { prioridade: false }), 3);
});

// "confirmado" e o instante entre o cantor confirmar e a Gerencia marcar
// "pronto". Sem peso proprio ele caia para o fim da fila, e o Play escolhia
// outro no lugar de quem acabou de confirmar.
test("quem acabou de confirmar fica junto de quem está sendo chamado", () => {
  const fila = [esp("a", 1), { id: "c", status: "confirmado", slot: "ativa", ordemFila: 9 }, esp("b", 2)];
  assert.deepStrictEqual(ordenarFila(fila).map(i => i.id), ["c", "a", "b"]);
});
