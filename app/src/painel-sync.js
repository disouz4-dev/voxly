"use strict";

// O que o painel do Publico faz a cada aviso do Palco.
//
// O painel toca da sua propria copia do arquivo, entao precisa ser conduzido.
// Antes o Palco so mandava tempo enquanto TOCAVA: dando Pausa os avisos
// cessavam, o cao de guarda concluia que o Palco tinha morrido e limpava o
// video, e ao despausar o painel ficava preto ate a proxima musica. Pausa e
// um estado, nao um sumico — por isso o aviso carrega `pausado`.

// Meio quadro a 30fps. Abaixo disso o pulo do currentTime incomoda mais que o
// desencontro.
const TOLERANCIA = 0.15;

(function (raiz) {

function decidirPainel(aviso, estado) {
  const a = aviso || {};
  const e = estado || {};

  if (a.parado) return { acao: "limpar" };
  if (!e.temVideo || !e.pronto) return { acao: "nada" };

  const fora = Math.abs((a.tempo || 0) - (e.tempoAtual || 0)) > TOLERANCIA;

  if (a.pausado) {
    if (!e.pausado) return { acao: "pausar" };
    return fora ? { acao: "ajustar", tempo: a.tempo, tocarDepois: false } : { acao: "nada" };
  }

  if (fora) return { acao: "ajustar", tempo: a.tempo, tocarDepois: true };
  return e.pausado ? { acao: "tocar" } : { acao: "nada" };
}

const api = { decidirPainel, TOLERANCIA };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyPainelSync = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
