"use strict";

// O que o Play do painel central faz depende do estado da fila, e errar isso
// custa caro no palco. Ja errei duas vezes: primeiro mandando "play" cru, que
// so retoma video ja carregado; depois dando precedencia a "retomar" sobre
// "tocar quem esta sendo chamado" — durante a chamada de 30s o status
// 'cantada' da musica anterior ainda nao tinha chegado no Firestore, o item
// seguia 'tocando' na copia local, e o clique nao fazia nada.

const test = require("node:test");
const assert = require("node:assert");
const { escolherParaTocar } = require("../src/fila");

test("chamada rolando: o Play toca quem esta sendo chamado", () => {
  const fila = [
    { id: "velha", status: "tocando" },        // write de 'cantada' ainda a caminho
    { id: "chamado", status: "confirmando" },
    { id: "depois", status: "aguardando", slot: "ativa" },
  ];
  assert.deepStrictEqual(escolherParaTocar(fila, { temMusicaNoAr: false }),
    { acao: "tocar", id: "chamado" });
});

test("cantor ja confirmou e espera o KJ: toca ele", () => {
  const fila = [{ id: "p", status: "pronto" }, { id: "q", status: "aguardando", slot: "ativa" }];
  assert.deepStrictEqual(escolherParaTocar(fila, { temMusicaNoAr: false }),
    { acao: "tocar", id: "p" });
});

test("musica no ar e pausada: retoma, nao reinicia", () => {
  const fila = [{ id: "atual", status: "tocando" }, { id: "x", status: "aguardando", slot: "ativa" }];
  assert.deepStrictEqual(escolherParaTocar(fila, { temMusicaNoAr: true }),
    { acao: "retomar" });
});

test("ninguem chamado e nada no ar: toca o proximo da fila", () => {
  const fila = [
    { id: "espera", status: "aguardando", slot: "espera" },
    { id: "proximo", status: "aguardando", slot: "ativa" },
  ];
  assert.deepStrictEqual(escolherParaTocar(fila, { temMusicaNoAr: false }),
    { acao: "tocar", id: "proximo" });
});

test("fila vazia: nao faz nada", () => {
  assert.deepStrictEqual(escolherParaTocar([], { temMusicaNoAr: false }), { acao: "nada" });
  assert.deepStrictEqual(escolherParaTocar([{ id: "e", status: "aguardando", slot: "espera" }],
    { temMusicaNoAr: false }), { acao: "nada" });
});

// Esta regra estava invertida. A ideia era "o KJ chamou o proximo e decidiu
// cortar", mas Play nao e o botao de cortar — Pular e. Com uma musica no ar
// (pausada, por exemplo) e alguem "pronto" na fila, o Play cortava a musica do
// cantor que estava cantando. Musica no ar sempre vence: o KJ pausou e quer
// voltar. Para trocar de cantor existe o Pular.
test("musica no ar vence: o Play retoma, nao corta o cantor", () => {
  const fila = [{ id: "atual", status: "tocando" }, { id: "chamado", status: "confirmando" }];
  assert.deepStrictEqual(escolherParaTocar(fila, { temMusicaNoAr: true }), { acao: "retomar" });

  const comPronto = [{ id: "atual", status: "tocando" }, { id: "p", status: "pronto" }];
  assert.deepStrictEqual(escolherParaTocar(comPronto, { temMusicaNoAr: true }), { acao: "retomar" });
});

test("sem musica no ar, o chamado continua tendo a vez", () => {
  const fila = [
    { id: "velha", status: "tocando" },   // write de 'cantada' ainda a caminho
    { id: "chamado", status: "confirmando" },
  ];
  assert.deepStrictEqual(escolherParaTocar(fila, { temMusicaNoAr: false }),
    { acao: "tocar", id: "chamado" });
});
