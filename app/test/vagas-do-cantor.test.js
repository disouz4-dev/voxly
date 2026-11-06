"use strict";

// As vagas do cantor no app do celular, a partir de TODOS os pedidos dele.
//
// O defeito (relatado em 01/10 com "Game of Love" da Khoury e de novo em
// 06/11): "o cantor canta a musica e a musica cantada aparece na fila novamente
// na sequencia".
//
// Varri os diarios de 05 e 06/11: nenhum pedido saiu de `cantada`, e nenhum
// entrou em `cantada` duas vezes. Nao e o status voltando atras — sao DOIS
// pedidos de verdade da mesma musica. O Daemon pediu "Broken" as 22:08 e de
// novo as 22:47; cantou o segundo as 00:23 e o primeiro ficou na fila.
//
// A trava existe e esta certa (trava.js `pedidoRepetido`), mas o app do cantor
// passava para ela apenas duas variaveis, preenchidas assim:
//
//   if (d.slot === 'ativa')  filhaAtiva  = d;
//   if (d.slot === 'espera') filhaEspera = d;
//
// Atribuicao simples dentro do laco: com mais de um pedido no mesmo slot — e o
// diario mostra que acontece (a NamiiKath teve cinco pendentes) — fica so o
// ULTIMO do snapshot, e os outros ficam invisiveis para a trava.

const test = require("node:test");
const assert = require("node:assert");
const { vagasDoCantor } = require("../src/historico");
const { pedidoRepetido } = require("../src/trava");

const p = (id, slot, musica, status = "aguardando", artista = "Seether") =>
  ({ id, slot, musica, artista, status });

test("o caso do Daemon: dois pedidos na mesma vaga, nenhum se perde", () => {
  const pedidos = [
    p("22h08", "espera", "Broken - PARTY TYME KARAOKE CHANNEL"),
    p("22h47", "ativa",  "Broken - PARTY TYME KARAOKE CHANNEL"),
  ];
  const vagas = vagasDoCantor(pedidos);
  assert.strictEqual(vagas.pendentes.length, 2, "os dois tem de estar na lista");
  // E a trava, recebendo a lista inteira, barra o segundo pedido.
  const repetido = pedidoRepetido(vagas.pendentes,
    { musica: "Broken - PARTY TYME KARAOKE CHANNEL", artista: "Seether" });
  assert.ok(repetido, "a trava tinha de barrar — ele ja tem Broken na fila");
});

test("com dois na vaga ativa, a lista guarda os dois (antes sobrava um)", () => {
  // Caso da Carol em 05/11: dois pedidos de "Que Nem o Meu Cachorro", os dois
  // com slot 'ativa', titulos diferentes (um com o canal de karaoke no nome).
  const pedidos = [
    p("primeiro", "ativa", "Que Nem o Meu Cachorro", "aguardando", "Black Alien"),
    p("segundo",  "ativa", "Que Nem o Meu Cachorro - Rewind Karaoke", "aguardando", "Black Alien"),
  ];
  const vagas = vagasDoCantor(pedidos);
  assert.strictEqual(vagas.pendentes.length, 2);
  // A chave da trava ignora o sufixo do canal? Nao — mas ignora acento, caixa e
  // pontuacao. Aqui os titulos diferem de verdade, e e por isso que a trava
  // nao pega este caso: fica registrado como limite conhecido.
  assert.strictEqual(vagas.ativa.id, "primeiro", "a vaga mostra o mais antigo");
});

test("a vaga ativa e a espera continuam sendo o pedido mais antigo de cada uma", () => {
  // Quem chegou antes e quem tem o menor ordemFila (que e so a ordem de
  // chegada). O snapshot do Firestore nao vem em ordem nenhuma.
  const pedidos = [
    { ...p("nova",   "ativa",  "B"), ordemFila: 9 },
    { ...p("velha",  "ativa",  "A"), ordemFila: 2 },
    { ...p("espera", "espera", "C"), ordemFila: 5 },
  ];
  const vagas = vagasDoCantor(pedidos);
  assert.strictEqual(vagas.ativa.id, "velha", "quem chegou antes e a vaga");
  assert.strictEqual(vagas.espera.id, "espera");
});

test("cantada, pulada e cancelada ficam fora das vagas e dos pendentes", () => {
  const pedidos = [
    p("cantada",   "ativa",  "A", "cantada"),
    p("pulada",    "ativa",  "B", "pulada"),
    p("cancelada", "espera", "C", "cancelada"),
    p("viva",      "ativa",  "D"),
  ];
  const vagas = vagasDoCantor(pedidos);
  assert.strictEqual(vagas.ativa.id, "viva");
  assert.strictEqual(vagas.espera, null);
  assert.deepEqual(vagas.pendentes.map(i => i.id), ["viva"]);
});

test("pedido tocando ou sendo chamado ainda ocupa a vaga", () => {
  for (const status of ["tocando", "confirmando", "confirmado", "pronto"]) {
    const vagas = vagasDoCantor([p("x", "ativa", "A", status)]);
    assert.strictEqual(vagas.ativa.id, "x", `status ${status} tinha de ocupar a vaga`);
  }
});

test("pedido sem slot conta como da vaga ativa", () => {
  // Pedido antigo, de antes do campo existir.
  const vagas = vagasDoCantor([{ id: "antigo", musica: "A", status: "aguardando" }]);
  assert.strictEqual(vagas.ativa.id, "antigo");
});

test("lista vazia, nula ou com buraco nao estoura", () => {
  for (const entrada of [[], null, undefined, [null, undefined], "nao e lista"]) {
    const vagas = vagasDoCantor(entrada);
    assert.strictEqual(vagas.ativa, null);
    assert.strictEqual(vagas.espera, null);
    assert.deepEqual(vagas.pendentes, []);
  }
});

test("a ordem dos pendentes e a de chegada, nao a do snapshot", () => {
  const pedidos = [
    { id: "c", slot: "ativa", musica: "C", status: "aguardando", ordemFila: 30 },
    { id: "a", slot: "ativa", musica: "A", status: "aguardando", ordemFila: 10 },
    { id: "b", slot: "espera", musica: "B", status: "aguardando", ordemFila: 20 },
  ];
  assert.deepEqual(vagasDoCantor(pedidos).pendentes.map(i => i.id), ["a", "b", "c"]);
});
