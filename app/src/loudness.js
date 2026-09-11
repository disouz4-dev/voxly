"use strict";

// Normalizacao de volume: cada musica vem de um canal diferente do YouTube,
// com volumes muito diferentes, e o compressor do Palco doma picos mas nao
// iguala o volume percebido.
//
// O ffmpeg mede a loudness integrada do arquivo (EBU R128, filtro ebur128) uma
// vez so, e a medida fica guardada. Na hora de tocar, o Palco aplica o ganho
// que leva a musica ao alvo — nada e regravado, e o acervo antigo entra junto.
// ebur128 e nao loudnorm: a mesma loudness integrada em 0,4 s por musica, onde
// o loudnorm levava 9 s (ele sobe a amostragem para medir o pico verdadeiro).

(function (raiz) {

// Referencia de loudness do YouTube e dos streamings. Karaoke baixado costuma
// ficar entre -8 e -18 LUFS.
const ALVO_LUFS = -14;
// Teto do reforco: gravacao muito baixa vira chiado amplificado. O compressor
// que vem depois segura os picos que o reforco criar.
const REFORCO_MAX_DB = 6;
const CORTE_MAX_DB = 12;
// O ffmpeg entrega -70 LUFS para silencio: nao e musica baixa, e medida sem
// sentido. Abaixo disto, a musica toca como esta.
const LUFS_MINIMO = -50;

function numeroApos(texto, rotulo) {
  const m = texto.match(new RegExp(rotulo + "\\s*(-?\\d+(?:\\.\\d+)?)"));
  return m ? Number(m[1]) : null;
}

// Le o resumo do filtro ebur128 (stderr do ffmpeg). So o que vem depois de
// "Summary:" — antes disso ficam os valores quadro a quadro, se houver.
function lerMedida(saida) {
  if (!saida || typeof saida !== "string") return null;
  const i = saida.lastIndexOf("Summary:");
  if (i < 0) return null;
  const resumo = saida.slice(i);
  // "I:" e nao "Integrated": a linha seguinte ("Threshold: ... LUFS") tambem
  // termina em LUFS e nao pode ser confundida com a loudness.
  const lufs = numeroApos(resumo, "\\bI:");
  if (lufs == null || !Number.isFinite(lufs)) return null;
  const pico = numeroApos(resumo, "\\bPeak:");
  return { lufs, pico: Number.isFinite(pico) ? pico : null };
}

function ganhoDaMedida(medida, { alvo = ALVO_LUFS } = {}) {
  const lufs = medida && Number(medida.lufs);
  if (!Number.isFinite(lufs) || lufs < LUFS_MINIMO) return 1;
  const db = Math.min(REFORCO_MAX_DB, Math.max(-CORTE_MAX_DB, alvo - lufs));
  return Math.pow(10, db / 20);
}

// Medida vale enquanto o arquivo e o mesmo: mesmo caminho, tamanho e data.
// A data vai em segundos porque o exFAT (o HD externo do KJ) guarda com menos
// precisao e o mesmo arquivo voltava com milissegundos diferentes.
function criarCacheMedidas(dadosIniciais) {
  const dados = (dadosIniciais && typeof dadosIniciais === "object") ? { ...dadosIniciais } : {};
  const segundos = ms => Math.floor(Number(ms) / 1000);
  return {
    obter(caminho, st) {
      const e = dados[caminho];
      if (!e || typeof e !== "object" || !st) return null;
      if (e.size !== st.size || e.mtime !== segundos(st.mtimeMs)) return null;
      if (!Number.isFinite(e.lufs)) return null;
      return { lufs: e.lufs, pico: Number.isFinite(e.pico) ? e.pico : null };
    },
    guardar(caminho, st, medida) {
      dados[caminho] = { size: st.size, mtime: segundos(st.mtimeMs), lufs: medida.lufs, pico: medida.pico };
    },
    dados() { return dados; },
  };
}

const api = { ALVO_LUFS, lerMedida, ganhoDaMedida, criarCacheMedidas };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyLoudness = api;

})(globalThis);
