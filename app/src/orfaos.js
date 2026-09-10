"use strict";

// Pedidos que ficaram gravados como "baixando" sem ninguem baixando.
//
// garantirArquivoDaFila grava 'baixando' no Firestore e so depois espera o
// yt-dlp. Fechando o app no meio, o registro fica assim para sempre: a linha da
// fila diz "⏳ Baixando..." e a faixa de status nao aparece, porque de fato nao
// ha download. O pedido trava e o cantor nunca canta.
//
// Quem sabe o que esta realmente em andamento e a memoria do host (o Set
// _baixando), nao o Firestore. Por isso ele e injetado aqui.

// Karaoke de 5 minutos em 1080p leva minutos numa rede ruim; 20 e folgado o
// bastante para nao interromper um download real.
const MINUTOS_LIMITE = 20;

(function (raiz) {

function downloadsOrfaos(itens, { agora, emAndamento, recemAberto, minutos } = {}) {
  const lista = Array.isArray(itens) ? itens : [];
  const ativos = emAndamento || new Set();
  const t = agora == null ? Date.now() : agora;
  const limite = (minutos || MINUTOS_LIMITE) * 60000;

  return lista
    .filter(i => i && i.statusDownload === "baixando")
    .filter(i => !ativos.has(i.id))
    // Na abertura nada pode estar em andamento: o processo acabou de subir,
    // entao qualquer 'baixando' e resto da sessao anterior, por mais recente
    // que o carimbo pareca.
    .filter(i => recemAberto || !i.baixandoDesde || (t - i.baixandoDesde) > limite)
    .map(i => i.id);
}

const api = { downloadsOrfaos, MINUTOS_LIMITE };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyOrfaos = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
