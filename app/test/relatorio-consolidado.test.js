"use strict";

// Tela de relatorios: a soma de varias noites ja preservadas. Cada noite chega
// como o resumo que resumirSessao gravou em relatorios/{sessaoId}.

const test = require("node:test");
const assert = require("node:assert");
const { consolidarRelatorios, dataDaNoite } = require("../src/relatorio");

const T = (dia, h) => Date.parse(`2026-09-${dia}T${h}:00-03:00`);

const noite = (dia, casa, cantores, musicas, extra = {}) => ({
  sessaoId: `2026-09-${dia}-X`, nomeCasa: casa,
  inicioPlanejado: T(dia, "20:00"),
  participantes: cantores.length,
  cantaram: cantores.filter(c => c.cantou > 0).length,
  pedidos: cantores.reduce((s, c) => s + c.pediu, 0),
  cantadas: musicas.length,
  naoCantadas: 0,
  cantores,
  musicas,
  ...extra,
});
const m = (musica, artista, cantor) => ({ musica, artista, cantor, dupla: null, horario: null });

const N1 = noite("03", "Rock Bar", [
  { nome: "Leo", pediu: 2, cantou: 2 },
  { nome: "Mari", pediu: 1, cantou: 1 },
], [m("Tempo Perdido", "Legião Urbana", "Leo"), m("Zombie", "The Cranberries", "Mari"), m("Epitáfio", "Titãs", "Leo")]);

const N2 = noite("10", "Rock Bar", [
  { nome: "leo", pediu: 1, cantou: 1 },          // mesmo Leo, digitado diferente
  { nome: "Tuca", pediu: 1, cantou: 0 },
], [m("tempo perdido", "Legião Urbana ", "leo")]);

const N3 = noite("05", "Bar do Zé", [
  { nome: "Rafa", pediu: 1, cantou: 1 },
], [m("Zombie", "The Cranberries", "Rafa")]);

test("soma noites, pedidos e músicas cantadas", () => {
  const c = consolidarRelatorios([N1, N2, N3]);
  assert.strictEqual(c.noites, 3);
  assert.strictEqual(c.cantadas, 5);
  assert.strictEqual(c.pedidos, 3 + 2 + 1);
});

test("participante que volta em outra noite conta uma vez só, mesmo com caixa diferente", () => {
  const c = consolidarRelatorios([N1, N2, N3]);
  // Leo, Mari, Tuca, Rafa
  assert.strictEqual(c.participantesUnicos, 4);
});

test("músicas mais cantadas agrupam grafias diferentes da mesma música", () => {
  const c = consolidarRelatorios([N1, N2, N3]);
  assert.deepStrictEqual(c.maisCantadas.slice(0, 2).map(x => [x.musica, x.vezes]),
    [["Tempo Perdido", 2], ["Zombie", 2]]);
});

test("cantores frequentes: quantas noites vieram e quanto cantaram no total", () => {
  const c = consolidarRelatorios([N1, N2, N3]);
  const leo = c.cantoresFrequentes.find(x => x.nome.toLowerCase() === "leo");
  assert.deepStrictEqual({ noites: leo.noites, cantou: leo.cantou }, { noites: 2, cantou: 3 });
  assert.strictEqual(c.cantoresFrequentes[0], leo, "quem veio mais noites vem primeiro");
});

test("médias por noite, com uma casa decimal", () => {
  const c = consolidarRelatorios([N1, N2, N3]);
  assert.strictEqual(c.mediaCantadas, 1.7);        // 5 / 3
  assert.strictEqual(c.mediaParticipantes, 1.7);   // (2 + 2 + 1) / 3
});

test("noites em ordem da mais recente para a mais antiga", () => {
  const c = consolidarRelatorios([N1, N2, N3]);
  assert.deepStrictEqual(c.porNoite.map(n => n.sessaoId), [N2.sessaoId, N3.sessaoId, N1.sessaoId]);
});

test("lista das casas, para filtrar quando o KJ toca em mais de um bar", () => {
  assert.deepStrictEqual(consolidarRelatorios([N1, N2, N3]).casas, ["Bar do Zé", "Rock Bar"]);
});

test("sem relatório nenhum: tudo zerado, sem dividir por zero", () => {
  const c = consolidarRelatorios([]);
  assert.strictEqual(c.noites, 0);
  assert.strictEqual(c.mediaCantadas, 0);
  assert.deepStrictEqual(c.maisCantadas, []);
  assert.deepStrictEqual(consolidarRelatorios(null).porNoite, []);
});

test("documento estranho no banco não derruba a tela", () => {
  // O ultimo nao tem cantores: nao e um resumo, nao conta como noite.
  const c = consolidarRelatorios([N1, null, "lixo", { sessaoId: "vazio" }]);
  assert.strictEqual(c.noites, 1);
  assert.strictEqual(c.cantadas, 3);
});

test("data da noite: início planejado, senão a primeira música, senão quando foi gerado", () => {
  assert.strictEqual(dataDaNoite({ inicioPlanejado: 5, primeiraMusica: 7, geradoEm: 9 }), 5);
  assert.strictEqual(dataDaNoite({ primeiraMusica: 7, geradoEm: 9 }), 7);
  assert.strictEqual(dataDaNoite({ geradoEm: 9 }), 9);
  assert.strictEqual(dataDaNoite({}), null);
});
