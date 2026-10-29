"use strict";

// Formato de download sem HLS e com H.264 na frente.
//
// Medido em 29/10: com o seletor antigo, para a MESMA consulta o yt-dlp
// escolhia ora o formato 137 (H.264, arquivo unico por https), ora o 399
// (AV1), ora o 614 (VP9 em m3u8 — HLS, baixado em fragmentos). Os tres
// reportam ext=mp4, entao "[ext=mp4]" nao separava nada. Em HLS cada video sao
// centenas de idas e vindas na rede do bar, e e a explicacao mais provavel da
// mediana de 188 s nos 50 downloads de 22/10 contra os 11 s de hoje. O AV1
// ainda por cima nao abre no QuickTime e o Electron decodifica por software.

const test = require("node:test");
const assert = require("node:assert");
const { formatoSeguro } = require("../src/qualidade");

const PRESET_1080 = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]";
const PRESET_720  = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]";
const PRESET_MAX  = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best";

test("preset de 1080p vira formato por https, com H.264 na frente", () => {
  const f = formatoSeguro(PRESET_1080);
  assert.match(f, /protocol\^=http/, "sem travar o protocolo o yt-dlp escolhe HLS");
  assert.match(f, /vcodec\^=avc1/, "H.264 tem de vir primeiro, por causa do QuickTime");
  assert.match(f, /height<=1080/, "a altura pedida tem de ser respeitada");
});

test("preset de 720p mantem 720p", () => {
  const f = formatoSeguro(PRESET_720);
  assert.match(f, /height<=720/);
  assert.doesNotMatch(f, /height<=1080/);
});

test("preset de melhor disponivel nao ganha limite de altura", () => {
  const f = formatoSeguro(PRESET_MAX);
  assert.doesNotMatch(f, /height<=/);
  assert.match(f, /protocol\^=http/);
});

// Degradar, nunca travar: se um video so existir em HLS, e melhor baixar
// devagar do que o cantor ficar sem musica.
test("tem reserva sem travar protocolo, para o caso de so existir HLS", () => {
  for (const p of [PRESET_1080, PRESET_720, PRESET_MAX]) {
    const ultimo = formatoSeguro(p).split("/").pop();
    assert.doesNotMatch(ultimo, /protocol\^=http/,
      "a ultima reserva nao pode exigir https, senao nao baixa nada");
  }
});

// O KJ pode ter digitado um formato proprio em Configuracoes. Nao e papel
// deste codigo reescrever a escolha dele.
test("formato que o KJ escreveu passa intacto", () => {
  const dele = "bestvideo[height<=480]+bestaudio";
  assert.strictEqual(formatoSeguro(dele), dele);
});

test("vazio ou invalido cai no padrao endurecido, nao em string vazia", () => {
  for (const ruim of ["", null, undefined, 0, {}]) {
    const f = formatoSeguro(ruim);
    assert.match(f, /protocol\^=http/, `"${ruim}" devolveu "${f}"`);
    assert.match(f, /height<=1080/);
  }
});
