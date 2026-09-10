"use strict";

// Se o app deve procurar atualizacao sozinho.
//
// No macOS nao deve: sem assinatura e notarizacao da Apple o electron-updater
// nao consegue instalar nada, e o latest-mac.yml e deixado fora do release de
// proposito (o CI so compila arm64; publicá-lo faria um Mac Intel baixar o
// pacote errado). O resultado era o app buscar o arquivo, tomar 404 e mostrar
// "erro 404" ao KJ — pior que nao checar, porque parece defeito.

const test = require("node:test");
const assert = require("node:assert");
const { podeAtualizarSozinho, MOTIVO_MAC } = require("../src/atualizacao");

test("Linux e Windows checam normalmente", () => {
  assert.deepStrictEqual(podeAtualizarSozinho({ plataforma: "linux", empacotado: true }),
    { pode: true });
  assert.deepStrictEqual(podeAtualizarSozinho({ plataforma: "win32", empacotado: true }),
    { pode: true });
});

test("macOS nao checa, e o motivo e dito", () => {
  const r = podeAtualizarSozinho({ plataforma: "darwin", empacotado: true });
  assert.strictEqual(r.pode, false);
  assert.strictEqual(r.motivo, MOTIVO_MAC);
  assert.match(r.motivo, /dmg/i, "tem que dizer o que fazer no lugar");
});

test("rodando do codigo-fonte nao checa em plataforma nenhuma", () => {
  for (const p of ["linux", "win32", "darwin"]) {
    assert.strictEqual(podeAtualizarSozinho({ plataforma: p, empacotado: false }).pode, false);
  }
});

// ── Como instalar o que foi baixado ──────────────────────────────────────
// No Linux o electron-updater so instala sozinho o AppImage. Num pacote .deb o
// quitAndInstall precisa de sudo grafico e, sem ele, nao faz NADA — o botao
// "Reiniciar para atualizar" parecia morto. Melhor dizer o comando que fingir.
const { comoInstalar } = require("../src/atualizacao");

test("AppImage se instala sozinho", () => {
  assert.strictEqual(
    comoInstalar({ plataforma: "linux", appimage: true, arquivo: "/tmp/Voxly.AppImage" }).modo,
    "automatico");
});

test("Windows se instala sozinho", () => {
  assert.strictEqual(comoInstalar({ plataforma: "win32" }).modo, "automatico");
});

test("pacote .deb devolve o comando, nao um botao morto", () => {
  const r = comoInstalar({ plataforma: "linux", appimage: false, arquivo: "/home/kj/.cache/voxly_1.1.14_amd64.deb" });
  assert.strictEqual(r.modo, "manual");
  assert.match(r.comando, /sudo dpkg -i/);
  assert.match(r.comando, /voxly_1\.1\.14_amd64\.deb/, "com o caminho do arquivo que ja foi baixado");
});

test("sem saber o arquivo, manda o caminho de sempre", () => {
  const r = comoInstalar({ plataforma: "linux", appimage: false });
  assert.strictEqual(r.modo, "manual");
  assert.match(r.comando, /releases/, "aponta para o release, ja que nao ha arquivo local");
});
