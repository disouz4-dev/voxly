"use strict";

// Controle de qual chamada de cantor ainda vale.
//
// A chamada de 30s e montada em etapas — grava o status, resolve o arquivo no
// disco, le as preferencias — e so entao manda o comando para as telas. Entre
// a primeira etapa e a ultima ha awaits, e nesse intervalo o KJ pode dar Play.
// Quando isso acontecia, o "play-confirmed" saia primeiro e a chamada atrasada
// chegava por cima da musica ja tocando: a tela voltava a chamar um cantor que
// ja estava no palco.
//
// Cada chamada recebe um numero. Vale so a ultima; comecar outra, ou dar Play,
// aposenta a anterior.

(function (raiz) {

// O token e um objeto, nao um numero: com contador, dois controles diferentes
// gerariam "1" e um aceitaria o token do outro — e o proprio zero valia antes
// de existir chamada alguma.
function criarControleChamada() {
  let atual = null;
  return {
    nova() { atual = {}; return atual; },
    valida(token) { return !!token && token === atual; },
    cancelar() { atual = null; },
  };
}

const api = { criarControleChamada };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyChamada = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
