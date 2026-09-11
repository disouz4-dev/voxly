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
// Agora a prioridade age na ENTRADA, escolhendo onde o pedido entra. Depois
// disso so conta o ordemFila — e o arrastar do KJ reescreve o ordemFila.

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

function ordemParaNovo(fila, { prioridade } = {}) {
  const itens = Array.isArray(fila) ? fila : [];
  const numeros = itens.map(i => i && i.ordemFila).filter(n => typeof n === "number");
  // MAIOR + 1, nunca contagem + 1: e o que garante ir para o fim com buracos.
  const fim = (numeros.length ? Math.max(...numeros) : 0) + 1;
  if (!prioridade) return fim;

  const esperando = ordenarFila(itens)
    .filter(i => i.status === "aguardando" && i.slot !== "espera" && typeof i.ordemFila === "number");

  // Entra depois da ultima prioridade que ja espera (ordem de chegada entre
  // elas) e antes do primeiro normal que vem depois dela.
  const prioridades = esperando.filter(i => i.tipo === "prioridade");
  const depoisDe = prioridades.length ? prioridades[prioridades.length - 1].ordemFila : null;
  const proximoNormal = esperando.find(i => i.tipo !== "prioridade" &&
    (depoisDe === null || i.ordemFila > depoisDe));

  if (!proximoNormal) return fim;             // nao ha normal para furar
  const antes = depoisDe !== null ? depoisDe : proximoNormal.ordemFila - 1;
  // Fracao entre os dois vizinhos: nao obriga renumerar a fila inteira.
  return (antes + proximoNormal.ordemFila) / 2;
}

const api = { ordenarFila, ordemParaNovo };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyOrdem = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
