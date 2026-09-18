"use strict";

// A ordem da fila.
//
// Tres defeitos do show de 10/09 e do teste de 11/09 tinham a mesma raiz:
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
// 3. Dois cafes com leite seguidos. A intercalacao era decidida na ENTRADA e
//    congelava: quando alguem saia do meio da fila (o KJ tocou fora de ordem,
//    o cantor desistiu), os vizinhos colavam e a fila principal parava por
//    duas musicas. Agora o ordemFila e so a ordem de chegada e a intercalacao
//    e feita na hora de montar a fila — quem o KJ arrastou fica cravado.

const test = require("node:test");
const assert = require("node:assert");
const { ordenarFila, ordemParaNovo, promocoesDeCafe, ordemParaCantarNaProxima } = require("../src/ordem");

const esp = (id, ordemFila, extra = {}) => ({ id, status: "aguardando", slot: "ativa", ordemFila, ...extra });
const N = (id, ordem) => esp(id, ordem, { tipo: "normal" });
const C = (id, ordem) => esp(id, ordem, { tipo: "prioridade" });
const tipos = fila => ordenarFila(fila).map(i => i.tipo === "prioridade" ? "C" : "N");
const ids = fila => ordenarFila(fila).map(i => i.id);

test("o caso do show: com buraco na numeracao, o novo vai para o fim", () => {
  // 1 e 2 ja cantaram e sairam da fila.
  const fila = [esp("c", 3), esp("d", 4), esp("e", 5)];
  const n = ordemParaNovo(fila, { prioridade: false });
  assert.ok(n > 5, `recebeu ${n}: entraria na frente de quem ja estava`);
});

test("fila vazia comeca em 1", () => {
  assert.strictEqual(ordemParaNovo([], { prioridade: false }), 1);
});

test("chegada e chegada: o cafe com leite tambem entra no fim da ordem de chegada", () => {
  // Quem decide onde ele CANTA e a intercalacao, na hora de montar a fila.
  const fila = [N("a", 1), N("b", 2)];
  assert.strictEqual(ordemParaNovo(fila, { prioridade: true }), 3);
});

// ── Cafe com leite: duas filas andando juntas ────────────────────────────
// Regra do dono do app: "se dez pessoas chegarem, a logica deve ser uma pessoa
// da fila, um cafe com leite, outra pessoa da fila, outro cafe com leite. A
// fila principal nunca pode parar de andar."

test("o exemplo do dono: cinco na fila e cinco cafes com leite alternam", () => {
  const fila = [N("n1", 1), N("n2", 2), N("n3", 3), N("n4", 4), N("n5", 5),
                C("c1", 6), C("c2", 7), C("c3", 8), C("c4", 9), C("c5", 10)];
  assert.deepStrictEqual(tipos(fila), ["N", "C", "N", "C", "N", "C", "N", "C", "N", "C"]);
});

test("a fila comeca pela fila principal, nao pelo cafe com leite", () => {
  assert.deepStrictEqual(tipos([C("c1", 1), N("n1", 2)]), ["N", "C"]);
});

test("dentro de cada fila vale a ordem de chegada", () => {
  const fila = [C("c1", 5), N("n1", 1), C("c2", 6), N("n2", 2)];
  assert.deepStrictEqual(ids(fila), ["n1", "c1", "n2", "c2"]);
});

test("mais cafes que gente na fila: os que sobram vao no fim, na ordem de chegada", () => {
  const fila = [N("n1", 1), C("c1", 2), C("c2", 3), C("c3", 4)];
  assert.deepStrictEqual(ids(fila), ["n1", "c1", "c2", "c3"]);
});

test("so a fila principal: ninguem e reordenado", () => {
  assert.deepStrictEqual(ids([N("n1", 1), N("n2", 2), N("n3", 3)]), ["n1", "n2", "n3"]);
});

// ── O caso do teste de 11/09 ─────────────────────────────────────────────
test("alguem sai do meio e a fila se reacomoda: nunca dois cafes seguidos", () => {
  const fila = [N("rafa", 1), C("mari", 2), N("bia", 3), C("tuca", 4), N("duda", 5)];
  assert.deepStrictEqual(ids(fila), ["rafa", "mari", "bia", "tuca", "duda"]);
  // O KJ tocou a Bia fora de ordem (era a unica com arquivo baixado).
  const semBia = fila.filter(i => i.id !== "bia");
  assert.deepStrictEqual(tipos(semBia), ["N", "C", "N", "C"], "a Duda sobe e separa os dois cafes");
  assert.deepStrictEqual(ids(semBia), ["rafa", "mari", "duda", "tuca"]);
});

// ── O arrastar do KJ ─────────────────────────────────────────────────────
test("quem o KJ arrastou fica cravado onde ele pos", () => {
  // KJ arrastou o cafe "c2" para o topo: ele fica em primeiro, e o resto
  // se acomoda em volta.
  const fila = [C("c2", 1, ), N("n1", 2), N("n2", 3), C("c1", 4)];
  fila[0].fixado = true;
  assert.deepStrictEqual(ids(fila), ["c2", "n1", "c1", "n2"]);
});

test("dois arrastados seguidos continuam seguidos: a vontade do KJ vence a alternancia", () => {
  const fila = [C("c1", 1), C("c2", 2), N("n1", 3), N("n2", 4)];
  fila[0].fixado = true; fila[1].fixado = true;
  assert.deepStrictEqual(ids(fila), ["c1", "c2", "n1", "n2"]);
});

test("o arrastado no meio nao sai do lugar quando alguem sai da fila", () => {
  const fila = [N("n1", 1), N("n2", 2), C("c1", 3, ), N("n3", 4)];
  fila[2].fixado = true;   // KJ arrastou o cafe para a 3a posicao
  assert.deepStrictEqual(ids(fila), ["n1", "n2", "c1", "n3"]);
});

// ── O resto da ordem ─────────────────────────────────────────────────────
test("quem esta no palco ou sendo chamado vem antes da fila", () => {
  const fila = [
    esp("espera", 1, { tipo: "normal" }),
    { id: "tocando", status: "tocando", slot: "ativa", ordemFila: 9 },
    { id: "chamando", status: "confirmando", slot: "ativa", ordemFila: 8 },
    { id: "pronto", status: "pronto", slot: "ativa", ordemFila: 7 },
  ];
  assert.deepStrictEqual(ids(fila), ["tocando", "pronto", "chamando", "espera"]);
});

test("quem acabou de confirmar fica junto de quem está sendo chamado", () => {
  const fila = [esp("a", 1), { id: "c", status: "confirmado", slot: "ativa", ordemFila: 9 }, esp("b", 2)];
  assert.deepStrictEqual(ids(fila), ["c", "a", "b"]);
});

test("pedido em espera fica fora da intercalação e no fim", () => {
  const fila = [N("n1", 1), C("c1", 2), esp("x", 3, { tipo: "prioridade", slot: "espera" })];
  assert.deepStrictEqual(ids(fila), ["n1", "c1", "x"]);
});

test("a ordenacao e consistente, nao depende da ordem de entrada", () => {
  const fila = [N("n1", 1), C("c1", 2), N("n2", 3), C("c2", 4)];
  const embaralhada = [fila[3], fila[1], fila[2], fila[0]];
  assert.deepStrictEqual(ids(fila), ids(embaralhada));
});

test("ordenarFila nao altera o array recebido", () => {
  const fila = [N("n1", 2), C("c1", 1)];
  const copia = JSON.parse(JSON.stringify(fila));
  ordenarFila(fila);
  assert.deepStrictEqual(fila, copia);
});

test("pedido sem ordemFila vai para o fim, nao para o comeco", () => {
  const fila = [N("a", 1), { id: "sem", status: "aguardando", slot: "ativa", tipo: "normal" }, N("b", 2)];
  assert.deepStrictEqual(ids(fila), ["a", "b", "sem"]);
});

test("lista vazia ou torta nao quebra", () => {
  assert.deepStrictEqual(ordenarFila([]), []);
  assert.deepStrictEqual(ordenarFila(null), []);
  assert.strictEqual(ordenarFila([null, undefined]).length, 2);
});

// ── Quem entra junto quando a fila vira prioridade ─────────
// O caso do show de 17/09: o Adão pediu com a fila curta (entrou normal); a
// Bia e o Caio chegaram depois, com a fila grande (entraram como cafe) — e
// passaram na frente dele, sendo que nenhum dos tres tinha cantado.

const pedido = (id, ordemFila, tipo = "normal", extra = {}) =>
  ({ id, cantorUid: id, ordemFila, tipo, status: "aguardando", slot: "ativa", ...extra });
const cantaram = new Set(["n1", "n2", "n3", "n4"]);
const jaCantou = uid => cantaram.has(uid);
const ordemIds = fila => ordenarFila(fila).map(i => i.id);

test("o caso do show: quem pediu antes e nao cantou entra junto e fica na frente dos cafes que chegaram depois", () => {
  const fila = [
    pedido("n1", 1), pedido("n2", 2), pedido("adao", 3), pedido("n3", 4), pedido("n4", 5),
    pedido("bia", 6, "prioridade"), pedido("caio", 7, "prioridade"),
  ];
  assert.deepEqual(ordemIds(fila), ["n1", "bia", "n2", "caio", "adao", "n3", "n4"], "o defeito: Adao atras da Bia e do Caio");

  const promover = promocoesDeCafe(fila, { jaCantou });
  assert.deepEqual(promover, ["adao"]);

  const depois = fila.map(i => (promover.includes(i.id) ? { ...i, tipo: "prioridade" } : i));
  assert.deepEqual(ordemIds(depois), ["n1", "adao", "n2", "bia", "n3", "caio", "n4"]);
});

test("ninguem e promovido se isso o jogar para tras", () => {
  const fila = [
    pedido("adao", 1), pedido("n1", 2), pedido("n2", 3),
    pedido("bia", 4, "prioridade"), pedido("caio", 5, "prioridade"),
  ];
  // Adao ja e o primeiro da fila principal: como cafe ele iria depois do n1.
  assert.deepEqual(promocoesDeCafe(fila, { jaCantou }), []);
});

test("quem ja cantou nao vira cafe com leite", () => {
  const fila = [pedido("n1", 1), pedido("n2", 2), pedido("n3", 3), pedido("bia", 4, "prioridade")];
  assert.deepEqual(promocoesDeCafe(fila, { jaCantou }), []);
});

test("sem ninguem como cafe, a fila nao virou prioridade: nada muda", () => {
  const fila = [pedido("n1", 1), pedido("adao", 2), pedido("n2", 3)];
  assert.deepEqual(promocoesDeCafe(fila, { jaCantou }), []);
});

test("prioridade desligada nas regras: nada muda", () => {
  const fila = [pedido("n1", 1), pedido("n2", 2), pedido("adao", 3), pedido("bia", 4, "prioridade")];
  assert.deepEqual(promocoesDeCafe(fila, { jaCantou, prioridadeAtiva: false }), []);
});

test("musica em espera e quem ja tem cafe pendente nao entram", () => {
  const fila = [
    pedido("n1", 1), pedido("n2", 2),
    pedido("adao", 3, "normal", { slot: "espera" }),
    pedido("bia", 4, "prioridade"), pedido("bia", 5, "normal", { id: "bia-2" }),
  ];
  assert.deepEqual(promocoesDeCafe(fila, { jaCantou }), []);
});

test("um cafe por cantor: so o pedido mais antigo dele", () => {
  const fila = [
    pedido("n1", 1), pedido("n2", 2), pedido("n3", 3),
    pedido("adao", 4), pedido("adao", 5, "normal", { id: "adao-2" }),
    pedido("bia", 6, "prioridade"),
  ];
  const promover = promocoesDeCafe(fila, { jaCantou });
  assert.ok(!promover.includes("adao-2"));
});

test("pedido cravado pelo arrasto do KJ continua onde ele pos", () => {
  const fila = [
    pedido("n1", 1), pedido("n2", 2), pedido("adao", 3, "normal", { fixado: true }),
    pedido("n3", 4), pedido("bia", 5, "prioridade"),
  ];
  const antes = ordemIds(fila).indexOf("adao");
  const promover = promocoesDeCafe(fila, { jaCantou });
  const depois = fila.map(i => (promover.includes(i.id) ? { ...i, tipo: "prioridade" } : i));
  assert.equal(ordemIds(depois).indexOf("adao"), antes);
});

// ── "Cantar na proxima" ────────────────────────────────────
// Quem foi chamado e nao esta (banheiro) volta a esperar logo depois do
// proximo da mesma fila; ninguem mais muda de lugar.

const naPrioxima = (fila, id) => {
  const nova = ordemParaCantarNaProxima(fila, id);
  return ordemIds(fila.map(i => (i.id === id ? { ...i, status: "aguardando", ordemFila: nova } : i)));
};

test("cantar na proxima: quem estava sendo chamado canta depois do proximo", () => {
  const fila = [
    pedido("rafa", 1, "normal", { status: "confirmando" }),
    pedido("bia", 2), pedido("tuca", 3), pedido("duda", 4),
  ];
  assert.deepEqual(naPrioxima(fila, "rafa"), ["bia", "rafa", "tuca", "duda"]);
});

test("cantar na proxima vale tambem com a musica ja tocando", () => {
  const fila = [pedido("rafa", 1, "normal", { status: "tocando" }), pedido("bia", 2), pedido("tuca", 3)];
  assert.deepEqual(naPrioxima(fila, "rafa"), ["bia", "rafa", "tuca"]);
});

test("cafe com leite volta depois do proximo cafe, e a alternancia continua", () => {
  const fila = [
    pedido("mari", 1, "prioridade", { status: "confirmando" }),
    pedido("n1", 2), pedido("n2", 3), pedido("nina", 4, "prioridade"), pedido("n3", 5), pedido("juca", 6, "prioridade"),
  ];
  assert.deepEqual(naPrioxima(fila, "mari"), ["n1", "nina", "n2", "mari", "n3", "juca"]);
});

test("sem ninguem mais esperando, a pessoa continua sendo a proxima", () => {
  const fila = [pedido("rafa", 3, "normal", { status: "confirmando" })];
  assert.deepEqual(naPrioxima(fila, "rafa"), ["rafa"]);
});

test("o ultimo da fila so troca com o penultimo", () => {
  const fila = [pedido("rafa", 1, "normal", { status: "confirmando" }), pedido("bia", 2)];
  assert.deepEqual(naPrioxima(fila, "rafa"), ["bia", "rafa"]);
});

test("pedido inexistente nao faz nada", () => {
  assert.equal(ordemParaCantarNaProxima([pedido("bia", 1)], "ninguem"), null);
});

// ── Regra de 18/09: sem tempo de fila, so "todo mundo ja cantou" ──
// Com a prioridade ligada, quem ainda nao cantou entra intercalado assim que
// todo mundo que ja cantou e esta na fila cantou pelo menos 1 (a escolha do
// dono). No comeco da noite, com ninguem tendo cantado, e ordem de chegada.

const contagem = { v1: 1, v2: 3, v3: 1 };
const cantadas = uid => contagem[uid] || 0;
const jaCantouV = uid => cantadas(uid) > 0;

test("todo mundo da fila ja cantou: quem chega entra intercalado", () => {
  const fila = [pedido("v1", 1), pedido("v2", 2), pedido("v3", 3), pedido("novo", 4)];
  const promover = promocoesDeCafe(fila, { jaCantou: jaCantouV, cantadas, cederApos: 1 });
  assert.deepEqual(promover, ["novo"]);
  const depois = fila.map(i => (promover.includes(i.id) ? { ...i, tipo: "prioridade" } : i));
  assert.deepEqual(ordemIds(depois), ["v1", "novo", "v2", "v3"]);
});

test("comeco da noite, ninguem cantou: ordem de chegada, sem prioridade", () => {
  const fila = [pedido("a", 1), pedido("b", 2), pedido("c", 3)];
  assert.deepEqual(promocoesDeCafe(fila, { jaCantou: () => false, cantadas: () => 0, cederApos: 1 }), []);
});

test("dois que chegaram entram os dois, e o que chegou antes canta antes", () => {
  const fila = [pedido("v1", 1), pedido("v2", 2), pedido("v3", 3), pedido("novo1", 4), pedido("novo2", 5)];
  const promover = promocoesDeCafe(fila, { jaCantou: jaCantouV, cantadas, cederApos: 1 });
  assert.deepEqual(promover, ["novo1", "novo2"]);
  const depois = fila.map(i => (promover.includes(i.id) ? { ...i, tipo: "prioridade" } : i));
  assert.deepEqual(ordemIds(depois), ["v1", "novo1", "v2", "novo2", "v3"]);
});

test("com o numero em 2, quem so cantou 1 ainda segura a prioridade", () => {
  const fila = [pedido("v1", 1), pedido("v2", 2), pedido("novo", 3)];
  assert.deepEqual(promocoesDeCafe(fila, { jaCantou: jaCantouV, cantadas, cederApos: 2 }), []);
});

test("prioridade desligada: nem a regra nova promove", () => {
  const fila = [pedido("v1", 1), pedido("v2", 2), pedido("novo", 3)];
  assert.deepEqual(promocoesDeCafe(fila, { jaCantou: jaCantouV, cantadas, cederApos: 1, prioridadeAtiva: false }), []);
});

// ── A fila andando de verdade: a alternancia tem que lembrar quem cantou ──
// Defeito de 12/09 a 18/09: a intercalacao recomecava "pela fila principal" a
// cada vez que alguem subia ao palco. Com M1 C1 M2 C2 M3, cantavam M1, M2,
// M3, C1, C2 — o cafe com leite so entrava quando a fila principal acabava.

function simularNoite(filaInicial, voltas) {
  let fila = filaInicial.map(i => ({ ...i }));
  let ultimoFoiCafe = null;
  const cantaram = [];
  for (let v = 0; v < voltas; v++) {
    // quem estava no palco terminou
    fila = fila.filter(i => i.status !== "tocando");
    const proxima = ordenarFila(fila, { ultimoFoiCafe }).find(i => i.status === "aguardando");
    if (!proxima) break;
    cantaram.push(proxima.id);
    ultimoFoiCafe = proxima.tipo === "prioridade";
    fila = fila.map(i => (i.id === proxima.id ? { ...i, status: "tocando" } : i));
  }
  return cantaram;
}

test("a noite andando: uma da fila, uma prioridade, ate acabar", () => {
  const fila = [pedido("M1", 1), pedido("C1", 2, "prioridade"), pedido("M2", 3), pedido("C2", 4, "prioridade"), pedido("M3", 5)];
  assert.deepEqual(simularNoite(fila, 5), ["M1", "C1", "M2", "C2", "M3"]);
});

test("com alguem no palco, a proxima e da outra fila", () => {
  const fila = [pedido("M1", 1, "normal", { status: "tocando" }), pedido("M2", 2), pedido("C1", 3, "prioridade")];
  assert.deepEqual(ordemIds(fila), ["M1", "C1", "M2"]);
});

test("cafe no palco: a proxima e da fila principal", () => {
  const fila = [pedido("C1", 1, "prioridade", { status: "tocando" }), pedido("C2", 2, "prioridade"), pedido("M1", 3)];
  assert.deepEqual(ordemIds(fila), ["C1", "M1", "C2"]);
});

test("entre uma musica e outra (ninguem no palco), vale quem cantou por ultimo", () => {
  const fila = [pedido("M2", 2), pedido("C1", 3, "prioridade")];
  assert.deepEqual(ordenarFila(fila, { ultimoFoiCafe: false }).map(i => i.id), ["C1", "M2"]);
  assert.deepEqual(ordenarFila(fila, { ultimoFoiCafe: true }).map(i => i.id), ["M2", "C1"]);
});
