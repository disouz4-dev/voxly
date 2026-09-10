"use strict";

// Escolha do arquivo pelo nome, quando o pedido nao tem videoId nem versao
// marcada pelo KJ. Vivia dentro do main.js e nao dava para testar.
//
// O vies aqui e deliberado: na duvida, NAO achar. Nao achar cai na busca do
// YouTube e o KJ escolhe; tocar a musica errada acontece no palco, na frente
// da casa. A regra antiga comparava sacos de letras — "missyoulove" contra
// "imissyou" dava 0,74 — e trocou Silverchair por Blink 182.

const { mesmaMusica, mesmoArtista, decompor, normalizar } = require("./versoes");

const RE_ID = /\s*\[[A-Za-z0-9_-]{11}\]\s*$/;

function nomeBase(caminho) {
  return String(caminho).split(/[\/\\]/).pop().replace(/\.[^.]+$/, "").replace(RE_ID, "").trim();
}

// `arquivos` sao nomes (ou caminhos); devolve o escolhido ou null.
function escolherPorNome(arquivos, pedido) {
  const musica  = (pedido && pedido.musica)  || "";
  const artista = (pedido && pedido.artista) || "";
  if (!musica) return null;

  // mesmaMusica compara TODOS os pedacos separados por " - ", entao pega tanto
  // "Artista - Musica - Canal" quanto o legado "Musica - Canal", sem precisar
  // adivinhar qual pedaco e qual.
  const candidatos = (arquivos || []).filter(c => mesmaMusica(nomeBase(c), musica));
  if (candidatos.length <= 1) return candidatos[0] || null;

  // Varias versoes da mesma musica: o artista desempata. Se nenhuma casar,
  // devolve a primeira — ja passaram todas pelo crivo do titulo.
  if (!artista || normalizar(artista) === "desconhecido") return candidatos[0];
  const doArtista = candidatos.filter(c => {
    const v = decompor(nomeBase(c));
    return mesmoArtista(v.artista, artista) || mesmoArtista(v.canal, artista);
  });
  return doArtista.length ? doArtista[0] : candidatos[0];
}

module.exports = { escolherPorNome, nomeBase };
