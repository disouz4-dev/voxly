"use strict";

// Pedidos que ficaram gravados como "baixando" sem ninguem baixando.
//
// garantirArquivoDaFila grava 'baixando' no Firestore e so depois espera o
// yt-dlp. Fechando o app (ou perdendo o processo) no meio, o registro fica
// assim para sempre: a linha da fila diz "⏳ Baixando..." e a faixa de status
// nao aparece, porque de fato nao ha download. O pedido trava e o cantor nunca
// canta. Ja existia essa protecao para 'confirmando'; o download nao tinha.

const test = require("node:test");
const assert = require("node:assert");
const { downloadsOrfaos, MINUTOS_LIMITE } = require("../src/orfaos");

const AGORA = 1_000_000_000;
const min = m => m * 60000;

test("na abertura do app, todo 'baixando' e orfao", () => {
  // Nada pode estar em andamento: o processo acabou de subir.
  const itens = [
    { id: "a", statusDownload: "baixando", baixandoDesde: AGORA - 1000 },
    { id: "b", statusDownload: "baixando", baixandoDesde: AGORA - min(90) },
    { id: "c", statusDownload: "pronto" },
  ];
  assert.deepStrictEqual(
    downloadsOrfaos(itens, { agora: AGORA, emAndamento: new Set(), recemAberto: true }),
    ["a", "b"]);
});

test("com o app rodando, download em andamento nao e tocado", () => {
  const itens = [{ id: "a", statusDownload: "baixando", baixandoDesde: AGORA - min(90) }];
  assert.deepStrictEqual(
    downloadsOrfaos(itens, { agora: AGORA, emAndamento: new Set(["a"]) }), []);
});

test("com o app rodando, so o que passou do limite conta", () => {
  const itens = [
    { id: "novo",   statusDownload: "baixando", baixandoDesde: AGORA - min(2) },
    { id: "velho",  statusDownload: "baixando", baixandoDesde: AGORA - min(MINUTOS_LIMITE + 1) },
  ];
  assert.deepStrictEqual(
    downloadsOrfaos(itens, { agora: AGORA, emAndamento: new Set() }), ["velho"]);
});

test("registro antigo sem carimbo de tempo conta como orfao", () => {
  const itens = [{ id: "a", statusDownload: "baixando" }];
  assert.deepStrictEqual(downloadsOrfaos(itens, { agora: AGORA, emAndamento: new Set() }), ["a"]);
});

test("outros estados nao sao tocados", () => {
  const itens = [
    { id: "a", statusDownload: "escolher" },
    { id: "b", statusDownload: "erro" },
    { id: "c", status: "tocando" },
  ];
  assert.deepStrictEqual(downloadsOrfaos(itens, { agora: AGORA, emAndamento: new Set() }), []);
  assert.deepStrictEqual(downloadsOrfaos(null, { agora: AGORA }), []);
});
