"use strict";

// Comparacao de nomes de musica e artista. Havia tres copias desta conta
// (versoes.js, identificacao.js e o autocomplete das duas telas), cada uma com
// um detalhe diferente — numa delas "don't" virava "don t" e quem digitava
// "dont" nao achava a musica.

(function (raiz) {

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019\u02bc]/g, "")   // "it's" e "its" sao a mesma palavra
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function palavras(texto) {
  const n = normalizar(texto);
  return n ? n.split(" ") : [];
}

const api = { normalizar, palavras };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyTexto = api;

})(globalThis);
