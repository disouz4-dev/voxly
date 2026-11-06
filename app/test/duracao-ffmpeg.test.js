"use strict";

// A duração do arquivo, lida do MESMO ffmpeg que já mede a loudness.
//
// A regra que o dono deu em 06/11 — "a última música da fila pode furar até
// 5min do limite imposto; se tiver faltando 1 min para preencher o tempo, e
// alguém colocar uma música de 7 min ela não entra, mas se colocar uma de 4 min
// ela entra" — depende de saber quanto a música dura.
//
// O catálogo publicado não tinha isso (artista, musica, videoId, arquivo,
// disponivel), e o cache de loudness guardava só lufs e pico. Mas o ffmpeg que
// mede a loudness já imprime "Duration:" no cabeçalho do arquivo: é de graça.

const test = require("node:test");
const assert = require("node:assert");
const { lerDuracao } = require("../src/loudness");

const CABECALHO = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'Seether - Broken.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:04:23.45, start: 0.000000, bitrate: 1053 kb/s
  Stream #0:0[0x1](und): Video: h264 (avc1 / 0x31637661), yuv420p, 1280x720
  Stream #0:1[0x2](und): Audio: aac (mp4a / 0x6134706D), 44100 Hz, stereo
[Parsed_ebur128_0 @ 0x14be06d50] Summary:

  Integrated loudness:
    I:         -12.6 LUFS
    Threshold: -23.0 LUFS
  True peak:
    Peak:        0.4 dBFS
`;

test("le a duracao do cabecalho do ffmpeg", () => {
  // 4 min 23,45 s = 263,45 s
  assert.strictEqual(lerDuracao(CABECALHO), 263.45);
});

test("hora cheia tambem conta", () => {
  assert.strictEqual(lerDuracao("  Duration: 01:02:03.00, start: 0.0"), 3723);
});

test("musica de 7 min, o caso que ele deu como exemplo", () => {
  assert.strictEqual(lerDuracao("  Duration: 00:07:00.00, start: 0.0"), 420);
});

test("duracao desconhecida (stream ao vivo, arquivo torto) devolve null", () => {
  assert.strictEqual(lerDuracao("  Duration: N/A, start: 0.000000, bitrate: N/A"), null);
});

test("sem cabecalho nenhum devolve null", () => {
  // Acontece: o main.js corta o inicio do stderr quando ele passa de 100 KB.
  assert.strictEqual(lerDuracao("[Parsed_ebur128_0] Summary:\n  I: -12.6 LUFS"), null);
});

test("entrada vazia, nula ou que nao e texto devolve null", () => {
  for (const e of ["", null, undefined, 7, {}, []]) {
    assert.strictEqual(lerDuracao(e), null, `entrada ${JSON.stringify(e)}`);
  }
});

test("duracao zero nao vale como duracao", () => {
  assert.strictEqual(lerDuracao("  Duration: 00:00:00.00, start: 0.0"), null);
});

test("pega a PRIMEIRA duracao: o resumo do ebur128 nao traz outra, mas um mp4 com capa pode", () => {
  const dois = "  Duration: 00:04:23.45, start: 0.0\n  Duration: 00:00:01.00, start: 0.0";
  assert.strictEqual(lerDuracao(dois), 263.45);
});

// ── A duração tem de SOBREVIVER no cache ──────────────────
// O cache guardava só lufs e pico: `guardar` escrevia esses dois campos e
// `obter` devolvia esses dois. A duração que eu passei a medir era jogada fora
// na gravação, e as 424 medidas que já existiam nunca ganhariam duração —
// elas só são remedidas se o arquivo mudar de tamanho ou data.

const { criarCacheMedidas } = require("../src/loudness");

const st = { size: 1000, mtimeMs: 1700000000000 };

test("a duracao fica guardada junto da medida", () => {
  const c = criarCacheMedidas({});
  c.guardar("/a.mp4", st, { lufs: -12.6, pico: 0.4, duracao: 263 });
  assert.strictEqual(c.obter("/a.mp4", st).duracao, 263);
});

test("medida sem duracao continua valendo (as 424 que ja existiam)", () => {
  const c = criarCacheMedidas({ "/a.mp4": { size: 1000, mtime: 1700000000, lufs: -12.6, pico: 0.4 } });
  const m = c.obter("/a.mp4", st);
  assert.strictEqual(m.lufs, -12.6);
  assert.strictEqual(m.duracao, null, "sem duracao, e null — nao inventa numero");
});

test("guardar a duracao sozinha nao apaga a medida de volume", () => {
  // E assim que as medidas antigas ganham duracao: uma leitura barata do
  // cabecalho, sem refazer a medida de loudness do arquivo inteiro.
  const c = criarCacheMedidas({ "/a.mp4": { size: 1000, mtime: 1700000000, lufs: -12.6, pico: 0.4 } });
  c.guardarDuracao("/a.mp4", st, 263);
  const m = c.obter("/a.mp4", st);
  assert.strictEqual(m.duracao, 263);
  assert.strictEqual(m.lufs, -12.6, "a loudness nao pode ter sido perdida");
  assert.strictEqual(m.pico, 0.4);
});

test("guardar a medida de volume depois nao apaga a duracao", () => {
  const c = criarCacheMedidas({});
  c.guardarDuracao("/a.mp4", st, 263);
  c.guardar("/a.mp4", st, { lufs: -10, pico: 0.1 });
  assert.strictEqual(c.obter("/a.mp4", st).duracao, 263);
});

test("duracao sozinha, sem medida de volume, ainda nao vale como medida", () => {
  // `obter` exige lufs: quem pergunta e o ganho do Palco.
  const c = criarCacheMedidas({});
  c.guardarDuracao("/a.mp4", st, 263);
  assert.strictEqual(c.obter("/a.mp4", st), null);
  assert.strictEqual(c.duracaoDe("/a.mp4", st), 263, "mas a duracao se pergunta em separado");
});

test("duracao torta nao entra no cache", () => {
  const c = criarCacheMedidas({});
  for (const d of [0, -1, NaN, Infinity, "263", null, undefined]) c.guardarDuracao("/a.mp4", st, d);
  assert.strictEqual(c.duracaoDe("/a.mp4", st), null);
});

test("arquivo trocado (tamanho ou data) perde a duracao guardada", () => {
  const c = criarCacheMedidas({});
  c.guardarDuracao("/a.mp4", st, 263);
  assert.strictEqual(c.duracaoDe("/a.mp4", { size: 2000, mtimeMs: st.mtimeMs }), null);
  assert.strictEqual(c.duracaoDe("/a.mp4", { size: 1000, mtimeMs: st.mtimeMs + 9000 }), null);
});
