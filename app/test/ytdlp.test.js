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
const { idadeEmDias, precisaAtualizar, urlDoBinario, nomeDoBinario, maisNova } = require("../src/ytdlp");

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

// ── Qual arquivo baixar ──────────────────────────────────────────────────
// O build "independente" (yt-dlp_macos / yt-dlp_linux) e um bundle PyInstaller
// que se extrai A CADA invocacao. Medido nesta maquina: 24 a 46 SEGUNDOS por
// chamada, contra 516ms do script do sistema e 950ms do zipapp oficial. Como o
// Voxly invoca o yt-dlp em toda busca e todo download, isso deixou o app
// inteiro 40x mais lento. O zipapp so precisa de Python, que macOS e Linux tem.

test("com Python instalado, baixa o zipapp", () => {
  for (const p of ["linux", "darwin", "win32"]) {
    assert.match(urlDoBinario(p, { temPython: true }), /\/yt-dlp$/,
      `${p}: o zipapp e o mesmo arquivo em todo sistema`);
  }
});

test("sem Python, cai no bundle do sistema", () => {
  assert.match(urlDoBinario("linux",  { temPython: false }), /yt-dlp_linux$/);
  assert.match(urlDoBinario("darwin", { temPython: false }), /yt-dlp_macos$/);
  assert.match(urlDoBinario("win32",  { temPython: false }), /yt-dlp\.exe$/);
});

test("continua vindo so do repositorio oficial", () => {
  for (const py of [true, false]) {
    for (const p of ["linux", "darwin", "win32"]) {
      assert.match(urlDoBinario(p, { temPython: py }), /^https:\/\/github\.com\/yt-dlp\/yt-dlp\//);
    }
  }
});

test("sistema desconhecido sem Python nao inventa arquivo", () => {
  assert.strictEqual(urlDoBinario("sunos", { temPython: false }), null);
  // Com Python o zipapp serve em qualquer lugar.
  assert.match(urlDoBinario("sunos", { temPython: true }), /\/yt-dlp$/);
});

// ── Entre a copia propria e a do sistema, vale a mais nova ───────────────
test("usa a mais nova das duas", () => {
  assert.strictEqual(maisNova("2026.06.09", "2026.08.19"), "2026.08.19");
  assert.strictEqual(maisNova("2026.08.19", "2026.06.09"), "2026.08.19");
  assert.strictEqual(maisNova(null, "2026.06.09"), "2026.06.09");
  assert.strictEqual(maisNova("2026.06.09", null), "2026.06.09");
  assert.strictEqual(maisNova(null, null), null);
});

// ── Integridade ─────────────────────────────────────────────
// Antes so se conferia o tamanho e se "--version" rodava. O yt-dlp publica o
// SHA-256 de cada arquivo; um binario que nao bate nao substitui o que funciona.

const { somaEsperada, urlDasSomas, nomeNoRelease } = require("../src/ytdlp");

// Trecho real de https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS
const SOMAS = [
  "1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6  yt-dlp",
  "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a  yt-dlp.exe",
  "072aad4f2a7604e92155f61a275a4752dc64046c8f6d90df3710525d94cd37c1  yt-dlp.tar.gz",
  "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a  yt-dlp_linux",
  "b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc  yt-dlp_linux_aarch64",
].join("\n");

test("acha a soma do arquivo pelo nome exato", () => {
  assert.strictEqual(somaEsperada(SOMAS, "yt-dlp"),
    "1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6");
  assert.strictEqual(somaEsperada(SOMAS, "yt-dlp_linux"),
    "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a");
});

test("nome parecido não serve: yt-dlp não casa com yt-dlp.tar.gz", () => {
  const soYtDlpTar = "072aad4f2a7604e92155f61a275a4752dc64046c8f6d90df3710525d94cd37c1  yt-dlp.tar.gz";
  assert.strictEqual(somaEsperada(soYtDlpTar, "yt-dlp"), null);
});

test("arquivo fora da lista, lista vazia ou torta: sem soma", () => {
  assert.strictEqual(somaEsperada(SOMAS, "yt-dlp_macos"), null);
  assert.strictEqual(somaEsperada("", "yt-dlp"), null);
  assert.strictEqual(somaEsperada("<html>rate limit</html>", "yt-dlp"), null);
  assert.strictEqual(somaEsperada(null, "yt-dlp"), null);
});

test("aceita o formato binário do sha256sum (asterisco) e fim de linha do Windows", () => {
  const h = "a".repeat(64);
  assert.strictEqual(somaEsperada(`${h} *yt-dlp\r\n`, "yt-dlp"), h);
});

test("a lista de somas vem do mesmo release que o binário", () => {
  assert.strictEqual(urlDasSomas(), "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS");
});

test("nome do arquivo no release sai da URL baixada", () => {
  assert.strictEqual(nomeNoRelease(urlDoBinario("darwin", { temPython: true })), "yt-dlp");
  assert.strictEqual(nomeNoRelease(urlDoBinario("linux", { temPython: false })), "yt-dlp_linux");
  assert.strictEqual(nomeNoRelease(urlDoBinario("win32", { temPython: false })), "yt-dlp.exe");
});
