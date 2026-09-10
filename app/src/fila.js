"use strict";

// O que o botao Play do painel central deve fazer, dado o estado da fila.
// Fora da tela porque errar aqui custa caro no palco e porque a decisao tem
// mais casos do que parece.

// `temMusicaNoAr` vem do host: existe uma musica carregada no player (pausada
// ou tocando). Nao da para deduzir isso do status da fila — o write de
// 'cantada' da musica anterior pode ainda estar a caminho do Firestore, e
// nesse instante o item antigo continua 'tocando' na copia local.
(function (raiz) {

function escolherParaTocar(fila, estado) {
  const itens = Array.isArray(fila) ? fila : [];

  // Alguem sendo chamado agora: o Play do KJ e justamente a decisao de nao
  // esperar a confirmacao. Tem precedencia sobre retomar.
  const chamado = itens.find(i => i.status === "confirmando" || i.status === "pronto");
  if (chamado) return { acao: "tocar", id: chamado.id };

  if (estado && estado.temMusicaNoAr) return { acao: "retomar" };

  const proximo = itens.find(i => i.status === "aguardando" && i.slot !== "espera");
  return proximo ? { acao: "tocar", id: proximo.id } : { acao: "nada" };
}

// A Gerencia carrega por <script> (e file://, nao tem require); os testes
// carregam por require.
const api = { escolherParaTocar };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyFila = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
