"use strict";

// Normalizacao de volume (show de 10/09: musicas com volumes muito diferentes).
// O ffmpeg mede a loudness integrada (EBU R128) de cada arquivo UMA vez; o
// Palco aplica o ganho que leva a musica ao alvo. As saidas abaixo sao do
// ffmpeg de verdade (filtro ebur128), nao inventadas.

const test = require("node:test");
const assert = require("node:assert");
const { lerMedida, ganhoDaMedida, criarCacheMedidas, ALVO_LUFS } = require("../src/loudness.js");

const SAIDA_REAL = `[Parsed_ebur128_0 @ 0x7f7d43714b00] Summary:

  Integrated loudness:
    I:         -21.8 LUFS
    Threshold: -31.8 LUFS

  Loudness range:
    LRA:         0.0 LU
    Threshold: -41.8 LUFS
    LRA low:   -21.8 LUFS
    LRA high:  -21.8 LUFS

  Sample peak:
    Peak:      -20.7 dBFS
[out#0/null @ 0x7f7d44507e80] video:0KiB audio:41344KiB subtitle:0KiB
size=N/A time=00:04:00.00 bitrate=N/A speed= 679x elapsed=0:00:00.35`;

const db = n => Math.pow(10, n / 20);
const perto = (a, b) => Math.abs(a - b) < 1e-9;

test("lê loudness integrada e pico da saída real do ffmpeg", () => {
  assert.deepStrictEqual(lerMedida(SAIDA_REAL), { lufs: -21.8, pico: -20.7 });
});

test("o limiar (Threshold) não é confundido com a loudness", () => {
  // "Threshold: -31.8 LUFS" vem logo abaixo e tambem termina em LUFS.
  assert.strictEqual(lerMedida(SAIDA_REAL).lufs, -21.8);
});

test("saída sem resumo (arquivo sem áudio, ffmpeg abortado) não vira medida", () => {
  assert.strictEqual(lerMedida("Output file #0 does not contain any stream"), null);
  assert.strictEqual(lerMedida(""), null);
  assert.strictEqual(lerMedida(null), null);
});

test("sem a linha de pico, a medida sai com pico nulo", () => {
  assert.deepStrictEqual(lerMedida("Summary:\n  Integrated loudness:\n    I:  -9.5 LUFS\n"),
    { lufs: -9.5, pico: null });
});

test("música no alvo não muda", () => {
  assert.ok(perto(ganhoDaMedida({ lufs: ALVO_LUFS }), 1));
});

test("música alta é abaixada até o alvo", () => {
  assert.ok(perto(ganhoDaMedida({ lufs: ALVO_LUFS + 6 }), db(-6)));
});

test("música baixa é levantada até o alvo", () => {
  assert.ok(perto(ganhoDaMedida({ lufs: ALVO_LUFS - 4 }), db(4)));
});

test("reforço tem teto: gravação muito baixa não vira chiado amplificado", () => {
  assert.ok(perto(ganhoDaMedida({ lufs: ALVO_LUFS - 20 }), db(6)));
});

test("corte tem teto também", () => {
  assert.ok(perto(ganhoDaMedida({ lufs: ALVO_LUFS + 30 }), db(-12)));
});

test("silêncio (o ffmpeg dá -70) e medida ausente ficam como estão", () => {
  assert.strictEqual(ganhoDaMedida({ lufs: -70 }), 1);
  assert.strictEqual(ganhoDaMedida(null), 1);
  assert.strictEqual(ganhoDaMedida({ lufs: NaN }), 1);
  assert.strictEqual(ganhoDaMedida({}), 1);
});

test("cache devolve a medida enquanto o arquivo é o mesmo", () => {
  const cache = criarCacheMedidas();
  const st = { size: 1000, mtimeMs: 1_700_000_000_123 };
  cache.guardar("/m/a.mp4", st, { lufs: -10, pico: -1 });
  assert.deepStrictEqual(cache.obter("/m/a.mp4", st), { lufs: -10, pico: -1 });
});

test("arquivo trocado (outro tamanho ou data) é medido de novo", () => {
  const cache = criarCacheMedidas();
  cache.guardar("/m/a.mp4", { size: 1000, mtimeMs: 5000 }, { lufs: -10, pico: -1 });
  assert.strictEqual(cache.obter("/m/a.mp4", { size: 2000, mtimeMs: 5000 }), null);
  assert.strictEqual(cache.obter("/m/a.mp4", { size: 1000, mtimeMs: 99000 }), null);
  assert.strictEqual(cache.obter("/m/b.mp4", { size: 1000, mtimeMs: 5000 }), null);
});

test("diferença de milissegundos na data não invalida (exFAT arredonda)", () => {
  const cache = criarCacheMedidas();
  cache.guardar("/m/a.mp4", { size: 1000, mtimeMs: 5000.4 }, { lufs: -10, pico: null });
  assert.ok(cache.obter("/m/a.mp4", { size: 1000, mtimeMs: 5900 }));
});

test("cache sobrevive a ser salvo e recarregado", () => {
  const a = criarCacheMedidas();
  a.guardar("/m/a.mp4", { size: 1, mtimeMs: 2000 }, { lufs: -12, pico: -3 });
  const b = criarCacheMedidas(JSON.parse(JSON.stringify(a.dados())));
  assert.deepStrictEqual(b.obter("/m/a.mp4", { size: 1, mtimeMs: 2000 }), { lufs: -12, pico: -3 });
});

test("cache corrompido no disco não derruba nada", () => {
  const cache = criarCacheMedidas("lixo");
  assert.strictEqual(cache.obter("/m/a.mp4", { size: 1, mtimeMs: 1 }), null);
  const c2 = criarCacheMedidas({ "/m/a.mp4": "lixo" });
  assert.strictEqual(c2.obter("/m/a.mp4", { size: 1, mtimeMs: 1 }), null);
});

// Com framelog ligado (ou um ffmpeg que imprima por quadro), as linhas antes do
// "Summary:" tambem trazem "I:". So o resumo vale: a loudness integrada da
// musica inteira, nao a do primeiro quadro.
test("ignora as linhas por quadro que vêm antes do resumo", () => {
  const comQuadros = [
    "[Parsed_ebur128_0 @ 0x1] t: 0.4    TARGET:-23 LUFS    M: -30.2 S:-120.7     I: -35.0 LUFS       LRA:   0.0 LU",
    "[Parsed_ebur128_0 @ 0x1] t: 0.5    TARGET:-23 LUFS    M: -28.1 S:-120.7     I: -33.1 LUFS       LRA:   0.0 LU",
    SAIDA_REAL,
  ].join("\n");
  assert.deepStrictEqual(lerMedida(comQuadros), { lufs: -21.8, pico: -20.7 });
});
