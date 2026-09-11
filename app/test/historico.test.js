"use strict";

// Historico pessoal do cantor: o que ele cantou, em que noite e em que casa,
// e de onde ele pede de novo com um toque.

const test = require("node:test");
const assert = require("node:assert");
const { entradaDoHistorico, agruparPorNoite, slotParaPedido } = require("../src/historico");

const T = (dia, h) => Date.parse(`2026-09-${dia}T${h}:00-03:00`);
const ts = ms => ({ toDate: () => new Date(ms) });

const ITEM = {
  id: "abc", cantorUid: "u1", nomeArtistico: "Leo", musica: "Creep", artista: "Radiohead",
  videoId: "XFkzRNyygfk", videoUrl: "https://youtu.be/XFkzRNyygfk", catalogoId: null, semitons: -2,
  duoUid: "u2", duoNome: "Mari", duoPendente: false,
};
const SESSAO = { id: "2026-09-10-GGATRN", nomeCasa: "Rock Bar do Diego", codigo: "GGATRN" };

test("entrada leva a descrição da noite e o vídeo exato que tocou", () => {
  const e = entradaDoHistorico(ITEM, SESSAO, { quem: "cantor" });
  assert.strictEqual(e.sessaoId, SESSAO.id);
  assert.strictEqual(e.nomeCasa, "Rock Bar do Diego");
  assert.strictEqual(e.musica, "Creep");
  assert.strictEqual(e.videoId, "XFkzRNyygfk");
  assert.strictEqual(e.semitons, -2);
  assert.deepStrictEqual(e.duoCom, { nomeArtistico: "Mari" });
  assert.strictEqual(e.status, "cantada");
});

test("a entrada do parceiro de duo aponta para quem pediu", () => {
  const e = entradaDoHistorico(ITEM, SESSAO, { quem: "duo" });
  assert.deepStrictEqual(e.duoCom, { nomeArtistico: "Leo" });
});

test("sem duo, duoCom é nulo; campos ausentes viram nulo, não undefined (o Firestore recusa undefined)", () => {
  const e = entradaDoHistorico({ musica: "Zombie", artista: "The Cranberries" }, {}, { quem: "cantor" });
  assert.strictEqual(e.duoCom, null);
  for (const [k, v] of Object.entries(e)) assert.notStrictEqual(v, undefined, k);
});

test("agrupa por noite, da mais recente para a mais antiga", () => {
  const grupos = agruparPorNoite([
    { id: "1", sessaoId: "s03", nomeCasa: "Rock Bar", data: ts(T("03", "21:00")), musica: "A" },
    { id: "2", sessaoId: "s10", nomeCasa: "Rock Bar", data: ts(T("10", "22:30")), musica: "B" },
    { id: "3", sessaoId: "s10", nomeCasa: "Rock Bar", data: ts(T("10", "21:10")), musica: "C" },
  ]);
  assert.deepStrictEqual(grupos.map(g => g.sessaoId), ["s10", "s03"]);
  assert.deepStrictEqual(grupos[0].musicas.map(m => m.musica), ["C", "B"], "na noite, na ordem em que cantou");
  assert.strictEqual(grupos[0].nomeCasa, "Rock Bar");
  assert.strictEqual(grupos[0].data, T("10", "21:10"));
});

test("registro antigo sem sessão ainda aparece, agrupado pelo dia", () => {
  const grupos = agruparPorNoite([
    { id: "1", data: ts(T("05", "21:00")), musica: "A" },
    { id: "2", data: ts(T("05", "22:00")), musica: "B" },
  ]);
  assert.strictEqual(grupos.length, 1);
  assert.strictEqual(grupos[0].musicas.length, 2);
});

test("lista vazia ou torta vira lista vazia", () => {
  assert.deepStrictEqual(agruparPorNoite([]), []);
  assert.deepStrictEqual(agruparPorNoite(null), []);
  assert.deepStrictEqual(agruparPorNoite([null, "lixo"]), []);
});

test("pedir de novo vai para a fila principal se ela estiver livre", () => {
  assert.strictEqual(slotParaPedido({ ativa: null, espera: null }), "ativa");
});

test("com música na fila principal, vai para a espera", () => {
  assert.strictEqual(slotParaPedido({ ativa: { id: "x" }, espera: null }), "espera");
});

test("com as duas ocupadas, não há onde pedir", () => {
  assert.strictEqual(slotParaPedido({ ativa: { id: "x" }, espera: { id: "y" } }), null);
});
