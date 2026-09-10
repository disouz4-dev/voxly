"use strict";

// Manter o yt-dlp atualizado sozinho.
//
// O YouTube muda com frequencia e quebra versoes antigas do yt-dlp — e o
// sintoma e sempre 403/404 no meio de um show. Depender do que a distro
// empacota e o pior dos mundos: o apt do Ubuntu costuma estar meses atras, e
// "yt-dlp -U" recusa atualizar quando a instalacao veio de um gerenciador de
// pacotes. Por isso o Voxly passa a manter a propria copia.

const test = require("node:test");
const assert = require("node:assert");
const { idadeEmDias, precisaAtualizar, urlDoBinario, nomeDoBinario } = require("../src/ytdlp");

const HOJE = Date.parse("2026-09-10T12:00:00Z");

test("le a data que a versao do yt-dlp carrega", () => {
  assert.strictEqual(idadeEmDias("2026.09.10", HOJE), 0);
  assert.strictEqual(idadeEmDias("2026.08.19", HOJE), 22);
  assert.strictEqual(idadeEmDias("2025.09.10", HOJE), 365);
});

// A regra "atualize se a versao tem mais de N dias" estava errada: a ULTIMA
// versao publicada do yt-dlp pode ter 3 semanas, e o app ficava rebaixando o
// mesmo arquivo para sempre, sempre se declarando desatualizado. O que importa
// e se existe versao mais nova que a minha, nao a idade dela.

test("compara com o que esta publicado, nao com o calendario", () => {
  assert.strictEqual(precisaAtualizar("2026.06.09", "2026.08.19"), true);
  assert.strictEqual(precisaAtualizar("2026.08.19", "2026.08.19"), false,
    "ja estou na ultima: nao ha o que baixar, por mais velha que ela seja");
  assert.strictEqual(precisaAtualizar("2026.09.01", "2026.08.19"), false,
    "versao mais nova que a publicada (build local) nao regride");
});

test("sem yt-dlp instalado, precisa sim", () => {
  assert.strictEqual(precisaAtualizar(null, "2026.08.19"), true);
  assert.strictEqual(precisaAtualizar("", "2026.08.19"), true);
});

test("sem saber o que esta publicado, nao mexe no que funciona", () => {
  // Sem rede a consulta falha; baixar as cegas so arrisca trocar o que ja roda.
  assert.strictEqual(precisaAtualizar("2026.06.09", null), false);
  assert.strictEqual(precisaAtualizar(null, null), true, "salvo se nao houver nenhum");
});

test("a idade continua servindo para o KJ ler", () => {
  assert.strictEqual(idadeEmDias("2026.06.09", HOJE), 93);
  assert.strictEqual(idadeEmDias("sei la", HOJE), null);
});

test("cada sistema tem o seu binario oficial", () => {
  assert.match(urlDoBinario("linux"),  /^https:\/\/github\.com\/yt-dlp\/yt-dlp\/releases\/latest\/download\/yt-dlp_linux$/);
  assert.match(urlDoBinario("darwin"), /yt-dlp_macos$/);
  assert.match(urlDoBinario("win32"),  /yt-dlp\.exe$/);
  assert.strictEqual(urlDoBinario("sunos"), null);
});

test("baixa sempre do repositorio oficial, por https", () => {
  for (const p of ["linux", "darwin", "win32"]) {
    assert.match(urlDoBinario(p), /^https:\/\/github\.com\/yt-dlp\/yt-dlp\//,
      "binario executavel so pode vir da origem oficial");
  }
});

test("o nome no disco muda no Windows", () => {
  assert.strictEqual(nomeDoBinario("linux"), "yt-dlp");
  assert.strictEqual(nomeDoBinario("darwin"), "yt-dlp");
  assert.strictEqual(nomeDoBinario("win32"), "yt-dlp.exe");
});
