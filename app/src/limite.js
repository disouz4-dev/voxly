"use strict";

// Cache por termo mais teto de consultas por minuto, num lugar so.
//
// O iTunes limita por IP e um 403 vale para tudo que vier depois — inclusive o
// autocomplete do app do cantor, que e a parte que o publico ve. O teto existia
// so no caminho da renomeacao, que quase nunca roda; quem gasta cota de verdade
// e o autocomplete do KJ, disparado a cada 300ms de digitacao.
//
// Atingido o teto, desiste. Falhar uma sugestao custa menos que derrubar o
// autocomplete de todo mundo por uma hora.

const LIMITE_PADRAO_POR_MINUTO = 15;

(function (raiz) {

function criarConsultaLimitada({ consultar, agora, limitePorMinuto } = {}) {
  const clock = agora || (() => Date.now());
  const teto  = limitePorMinuto || LIMITE_PADRAO_POR_MINUTO;
  const cache = new Map();
  let janela = [];

  return async function consultaLimitada(termo) {
    const chave = String(termo || "").trim().toLowerCase();
    if (!chave) return null;
    if (cache.has(chave)) return cache.get(chave);   // acerto nao gasta cota

    const t = clock();
    janela = janela.filter(m => t - m < 60000);
    if (janela.length >= teto) return null;
    janela.push(t);

    try {
      const r = await consultar(termo);
      cache.set(chave, r);
      return r;
    } catch (e) {
      console.warn("[LIMITE]", e && e.message);
      return null;
    }
  };
}

const api = { criarConsultaLimitada, LIMITE_PADRAO_POR_MINUTO };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyLimite = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
