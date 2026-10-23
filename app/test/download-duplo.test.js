"use strict";

// Trava contra baixar a MESMA gravacao duas vezes.
//
// Show de 22/10: dois yt-dlp baixando o mesmo video, com o mesmo padrao de
// nome de saida. Na primeira amostra o .part do audio estava em 0 bytes — um
// truncou o arquivo do outro. Nao e so banda desperdicada: da para reiniciar
// em loop e nunca fechar, que foi a sensacao de "download travado".
//
// A guarda que existia era um Set na tela da Gerencia, por item da fila: nao
// via o download pedido pelo celular do KJ, nem o mesmo video pedido a partir
// de dois pedidos diferentes. A decisao tem que ser do processo principal, que
// e o unico que enxerga todos.
//
// O que NAO entra aqui: barrar outra VERSAO da mesma musica. O KJ escolhe
// versao de proposito (canais diferentes, tom e arranjo diferentes) — a funcao
// conta quantas ele ja tem para a tela avisar, e nunca recusa.

const test = require("node:test");
const assert = require("node:assert");
const { decidirDownload, TETO_EM_CURSO_MS } = require("../src/download-duplo");

const AGORA = 1792714000000;
const emCurso = (entradas) => new Map(entradas);

test("nada em curso e nada no disco: baixa", () => {
  const r = decidirDownload({ videoId: "zFiXXhxXtLs", emCurso: emCurso(), agora: AGORA });
  assert.strictEqual(r.acao, "baixar");
  assert.strictEqual(r.chave, "zFiXXhxXtLs");
});

test("ja tenho o arquivo dessa gravacao: nao baixa de novo", () => {
  const r = decidirDownload({
    videoId: "zFiXXhxXtLs",
    noDisco: "/Karaoke/Pitty - Na Sua Estante [zFiXXhxXtLs].mp4",
    emCurso: emCurso(), agora: AGORA,
  });
  assert.strictEqual(r.acao, "ja-tenho");
  assert.match(r.arquivo, /zFiXXhxXtLs/);
});

test("mesma gravacao ja baixando: nao sobe um segundo processo", () => {
  const r = decidirDownload({
    videoId: "BGumP922AOc",
    emCurso: emCurso([["BGumP922AOc", { itemId: "pedido-1", desde: AGORA - 30000 }]]),
    agora: AGORA,
  });
  assert.strictEqual(r.acao, "em-curso");
  assert.strictEqual(r.itemId, "pedido-1", "diz para quem ja esta baixando, para a tela explicar");
});

test("o mesmo pedido pedindo de novo tambem espera, nao duplica", () => {
  const r = decidirDownload({
    videoId: "BGumP922AOc", itemId: "pedido-1",
    emCurso: emCurso([["BGumP922AOc", { itemId: "pedido-1", desde: AGORA - 1000 }]]),
    agora: AGORA,
  });
  assert.strictEqual(r.acao, "em-curso");
});

test("outra gravacao do mesmo pedido pode baixar", () => {
  const r = decidirDownload({
    videoId: "outroVideo1", itemId: "pedido-1",
    emCurso: emCurso([["BGumP922AOc", { itemId: "pedido-1", desde: AGORA - 1000 }]]),
    agora: AGORA,
  });
  assert.strictEqual(r.acao, "baixar");
});

// Sem isto, um yt-dlp morto sem avisar (app fechado no meio, processo matado)
// deixaria a musica trancada para sempre: "ja esta baixando" e nunca baixa.
test("registro velho nao tranca a musica para sempre", () => {
  const r = decidirDownload({
    videoId: "BGumP922AOc",
    emCurso: emCurso([["BGumP922AOc", { itemId: "pedido-1", desde: AGORA - TETO_EM_CURSO_MS - 1 }]]),
    agora: AGORA,
  });
  assert.strictEqual(r.acao, "baixar", "passou do teto: o registro e lixo, nao um download vivo");
});

test("no limite do teto ainda conta como em curso", () => {
  const r = decidirDownload({
    videoId: "BGumP922AOc",
    emCurso: emCurso([["BGumP922AOc", { itemId: "p1", desde: AGORA - TETO_EM_CURSO_MS + 1 }]]),
    agora: AGORA,
  });
  assert.strictEqual(r.acao, "em-curso");
});

test("o disco vence o registro em curso: se o arquivo chegou, acabou", () => {
  const r = decidirDownload({
    videoId: "BGumP922AOc", noDisco: "/Karaoke/x [BGumP922AOc].mp4",
    emCurso: emCurso([["BGumP922AOc", { itemId: "p1", desde: AGORA - 1000 }]]),
    agora: AGORA,
  });
  assert.strictEqual(r.acao, "ja-tenho");
});

// Link colado sem id reconhecido: a url serve de chave, senao dois cliques no
// mesmo link subiriam dois processos.
test("sem videoId, a url e a chave", () => {
  const url = "https://www.youtube.com/watch?v=BGumP922AOc&list=RD";
  assert.strictEqual(decidirDownload({ url, emCurso: emCurso(), agora: AGORA }).chave, url);
  assert.strictEqual(
    decidirDownload({ url, emCurso: emCurso([[url, { itemId: "p1", desde: AGORA }]]), agora: AGORA }).acao,
    "em-curso");
});

test("sem id e sem url nao tem o que baixar", () => {
  assert.strictEqual(decidirDownload({ emCurso: emCurso(), agora: AGORA }).acao, "sem-alvo");
  assert.strictEqual(decidirDownload().acao, "sem-alvo");
});

// A tela avisa "voce ja tem 2 versoes desta musica" — informacao, nunca
// recusa: escolher entre versoes e o trabalho do KJ.
test("outras versoes da mesma musica sao contadas, nao barradas", () => {
  const r = decidirDownload({
    videoId: "novoVideo01", agora: AGORA, emCurso: emCurso(),
    versoesQueJaTenho: ["Pitty - Na Sua Estante - A [aaaaaaaaaaa].mp4",
                        "Pitty - Na Sua Estante - B [bbbbbbbbbbb].mp4"],
  });
  assert.strictEqual(r.acao, "baixar", "nunca barra outra versao");
  assert.strictEqual(r.jaTenhoVersoes, 2);
});

test("sem outras versoes, o aviso nao aparece", () => {
  const r = decidirDownload({ videoId: "novoVideo01", emCurso: emCurso(), agora: AGORA });
  assert.strictEqual(r.jaTenhoVersoes, 0);
});
