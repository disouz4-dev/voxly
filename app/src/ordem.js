"use strict";

// A ordem da fila, numa regra so.
//
// Dois defeitos do show de 10/09 tinham a mesma raiz:
//
// 1. "Quem entra depois sobe na frente." O pedido novo recebia
//    ordemFila = (quantos estao aguardando) + 1, supondo numeracao continua.
//    Mas quem canta sai da contagem e deixa buraco: com [3, 4, 5], o proximo
//    ganhava 4 e passava na frente de quem tinha o 5.
//
// 2. "Mudei a ordem e ele nao respeitou." A ordenacao punha toda prioridade
//    ("cafe com leite") antes de tudo, a cada atualizacao. O KJ arrastava
//    alguem para cima de um prioridade e ele voltava para tras.
//
// Agora a prioridade age na ENTRADA, escolhendo onde o pedido entra — sempre
// alternando com a fila principal. Depois disso so conta o ordemFila, e o
// arrastar do KJ reescreve o ordemFila.

(function (raiz) {

// Quem ja esta no palco ou sendo chamado vem antes de qualquer pedido.
const PESO = { tocando: 0, pronto: 1, confirmando: 2 };
const peso = i => (i && i.status in PESO) ? PESO[i.status] : 3;

// Sem ordemFila vai para o fim: "|| 0" jogava registro antigo para o topo.
const ordemDe = i => (i && typeof i.ordemFila === "number") ? i.ordemFila : Infinity;

function ordenarFila(itens) {
  return [...(Array.isArray(itens) ? itens : [])]
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) =>
      (peso(a.item) - peso(b.item)) ||
      (ordemDe(a.item) - ordemDe(b.item)) ||
      (a.idx - b.idx))                       // empate: mantem a ordem que chegou
    .map(x => x.item);
}

// Onde um pedido novo entra. Normal e cafe com leite formam duas filas que
// ANDAM JUNTAS, alternando: um da fila principal, um cafe com leite, outro da
// fila, outro cafe. Regra do dono do app — "a fila principal nunca pode parar
// de andar". A primeira versao punha toda prioridade antes de todos os normais,
// e com dez chegando a fila principal pararia ate as dez cantarem.
//
// Cada chegada entra logo depois do ultimo da PROPRIA fila, pulando um da
// outra. Assim ninguem e passado por alguem do mesmo tipo que chegou depois, e
// a alternancia se mantem.
function ordemParaNovo(fila, { prioridade } = {}) {
  const itens = Array.isArray(fila) ? fila : [];
  const numeros = itens.map(i => i && i.ordemFila).filter(n => typeof n === "number");
  // MAIOR + 1, nunca contagem + 1: e o que garante ir para o fim com buracos.
  const fim = (numeros.length ? Math.max(...numeros) : 0) + 1;

  const esperando = ordenarFila(itens)
    .filter(i => i.status === "aguardando" && i.slot !== "espera" && typeof i.ordemFila === "number");
  if (!esperando.length) return fim;

  const ehCafe = i => i.tipo === "prioridade";
  const doMeuTipo = i => ehCafe(i) === !!prioridade;

  // O ultimo da minha fila; depois dele, o primeiro da outra.
  let ultimoMeu = -1;
  esperando.forEach((i, k) => { if (doMeuTipo(i)) ultimoMeu = k; });
  const ancora = esperando.findIndex((i, k) => k > ultimoMeu && !doMeuTipo(i));

  if (ancora === -1) return fim;              // nao ha ninguem da outra fila para alternar
  const depois = esperando[ancora + 1];
  const a = esperando[ancora].ordemFila;
  // Fracao entre os vizinhos: nao obriga renumerar a fila inteira.
  return depois ? (a + depois.ordemFila) / 2 : fim;
}

const api = { ordenarFila, ordemParaNovo };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyOrdem = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
