"use strict";

// Por que o download falhou. O codigo de saida do yt-dlp era resolvido na
// promessa e nunca lido, e o stderr so era inspecionado atras de uma string
// ("already been downloaded") — todo o resto ia para o lixo. O KJ via "nada foi
// baixado" sem motivo, no meio do show, sem ter o que fazer a respeito.

const test = require("node:test");
const assert = require("node:assert");
const { motivoFalha } = require("../src/yt-falha");

test("sucesso nao vira falha", () => {
  assert.strictEqual(motivoFalha(0, ""), null);
  assert.strictEqual(motivoFalha(0, "WARNING: qualquer aviso"), null);
});

test("bloqueio de bot do YouTube vira instrucao, nao codigo de erro", () => {
  const err = 'ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you’re not a bot. Use --cookies-from-browser';
  const m = motivoFalha(1, err);
  assert.match(m, /YouTube/i);
  assert.match(m, /cookies/i, "tem que dizer o que fazer, nao so o que houve");
});

test("video indisponivel e dito em portugues", () => {
  assert.match(motivoFalha(1, "ERROR: [youtube] abc: Video unavailable"), /indispon[ií]vel/i);
  assert.match(motivoFalha(1, "ERROR: [youtube] abc: This video is private"), /privado/i);
});

test("restricao de idade aparece como tal", () => {
  const err = "ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.";
  assert.match(motivoFalha(1, err), /idade/i);
});

test("erro desconhecido devolve a mensagem crua do yt-dlp, nao um generico", () => {
  const err = "ERROR: unable to download video data: HTTP Error 403: Forbidden";
  const m = motivoFalha(1, err);
  assert.match(m, /403/, "o KJ precisa do texto real para pesquisar ou reportar");
});

test("falha sem stderr ainda diz o codigo de saida", () => {
  assert.match(motivoFalha(2, ""), /2/);
});

test("pega a ultima linha ERROR, nao a primeira", () => {
  const err = [
    "ERROR: [youtube] abc: falha no formato 137, tentando outro",
    "ERROR: unable to download video data: HTTP Error 403: Forbidden",
  ].join("\n");
  assert.match(motivoFalha(1, err), /403/);
});

test("aviso nao e confundido com erro", () => {
  const err = "WARNING: Falling back to generic extractor\nERROR: Video unavailable";
  assert.doesNotMatch(motivoFalha(1, err), /generic extractor/);
});

// 403/404 vindos do YouTube quase sempre significam yt-dlp velho: o site muda
// e a versao empacotada pela distro fica meses atras. O .deb declara yt-dlp
// como dependencia, entao no Linux o KJ recebe justamente a versao da distro.
// Dizer "404" nao ajuda; dizer "atualize o yt-dlp" resolve.
test("404 e 403 do YouTube apontam para o yt-dlp desatualizado", () => {
  for (const err of [
    "ERROR: unable to download video data: HTTP Error 404: Not Found",
    "ERROR: unable to download video data: HTTP Error 403: Forbidden",
    "ERROR: [youtube] abc: nsig extraction failed: Some formats may be missing",
  ]) {
    const m = motivoFalha(1, err);
    assert.match(m, /yt-dlp/i, err);
    assert.match(m, /atualiz/i, "tem que dizer o que fazer");
  }
});

test("o texto original continua visivel junto da orientacao", () => {
  const m = motivoFalha(1, "ERROR: unable to download video data: HTTP Error 404: Not Found");
  assert.match(m, /404/, "o KJ precisa do erro real para reportar ou pesquisar");
});
