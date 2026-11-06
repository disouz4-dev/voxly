"use strict";

// A copia do acervo no banco.
//
// O app do cantor busca musica nessa copia — "a copia da pasta tem que ficar no
// Firebase", decisao dele em 06/11. A Gerencia a republica a cada varredura da
// pasta, e e so isso que o celular tem quando o Mac esta fechado ou quando o
// celular esta em HTTPS (que nao alcanca o servidor local).
//
// Por isso publicar de forma burra e perigoso: com o HD externo desconectado a
// varredura devolve ZERO musica, e a publicacao apagaria o acervo inteiro do
// banco. Em 06/11 isso quase aconteceu — as 03:38 o servidor do catalogo
// respondeu "0 musicas" porque o HD tinha sido desmontado no meio do trabalho.
//
// Queda brusca tem a mesma cara: pasta errada escolhida na Config, HD montando
// pela metade, varredura interrompida. Em todos esses casos o certo e manter o
// que esta no banco e avisar, nunca apagar sozinho.

(function (raiz) {

// Abaixo desta fracao do que esta publicado, a varredura e tratada como
// suspeita. Metade: apagar algumas musicas da pasta e normal, perder mais da
// metade de uma vez nao e.
const FRACAO_SUSPEITA = 0.5;
// Acervo pequeno nao entra na regra da queda: numa casa com 8 musicas, cair
// para 3 nao e sinal de HD sumido.
const PISO_PARA_SUSPEITAR = 20;

// `novos`: quantas musicas a varredura achou agora.
// `publicados`: quantas estao no banco (0 ou null quando nunca se publicou).
// `forcar`: o KJ trocou de acervo de proposito e quer publicar o menor.
function devePublicarCatalogo({ novos, publicados, forcar = false } = {}) {
  const n = Number.isInteger(novos) && novos >= 0 ? novos : null;
  const p = Number.isInteger(publicados) && publicados >= 0 ? publicados : 0;
  if (forcar && n != null) return { publicar: true, motivo: "forcado" };
  // Numero torto (varredura que falhou, campo ausente): nao se apaga nada com
  // base em dado que nao se entende.
  if (n == null) return { publicar: false, motivo: "desconhecido" };
  if (n === 0) return { publicar: false, motivo: "vazio" };
  if (p === 0) return { publicar: true, motivo: "primeira" };
  if (p >= PISO_PARA_SUSPEITAR && n < p * FRACAO_SUSPEITA) {
    return { publicar: false, motivo: "queda" };
  }
  return { publicar: true, motivo: "ok" };
}

const api = { devePublicarCatalogo, FRACAO_SUSPEITA, PISO_PARA_SUSPEITAR };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyCatalogo = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
