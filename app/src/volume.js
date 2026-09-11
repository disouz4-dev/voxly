"use strict";

// Fader de volume do KJ, para nao depender do tecnico da mesa.
//
// A curva importa: com ganho LINEAR, metade do fader soa quase igual ao volume
// cheio e todo o ajuste util fica espremido no ultimo quarto do curso — o
// ouvido e logaritmico. Aqui o ganho e o quadrado da posicao, o que espalha o
// ajuste pelo fader inteiro. O teto e o volume original: acima disso a saida
// clipa, e para faixa baixa o caminho certo e a normalizacao, nao o fader.

(function (raiz) {

const PADRAO = 85;

function posicaoValida(v) {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) {
    return Number.isNaN(n) || v === null || v === undefined || v === "" ? PADRAO : (n > 0 ? 100 : 0);
  }
  return Math.round(Math.min(100, Math.max(0, n)));
}

function ganhoDoFader(v) {
  const n = Number(v);
  if (n === Infinity) return 1;
  const p = posicaoValida(v) / 100;
  return p * p;
}

const api = { ganhoDoFader, posicaoValida, PADRAO };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyVolume = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
