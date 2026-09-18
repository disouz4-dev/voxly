"use strict";

// A ordem da fila, numa regra so — a mesma na Gerencia, na chamada do proximo
// e no app do cantor.
//
// Tres defeitos tinham a mesma raiz:
//
// 1. "Quem entra depois sobe na frente." O pedido novo recebia
//    ordemFila = (quantos estao aguardando) + 1, supondo numeracao continua.
//    Mas quem canta sai da contagem e deixa buraco: com [3, 4, 5], o proximo
//    ganhava 4 e passava na frente de quem tinha o 5.
//
// 2. "Mudei a ordem e ele nao respeitou." A ordenacao punha toda prioridade
//    ("cafe com leite") antes de tudo, a cada atualizacao, e desfazia o
//    arrastar do KJ.
//
// 3. Dois cafes com leite seguidos. A intercalacao era decidida na ENTRADA e
//    congelava ali: quando alguem saia do meio (o KJ tocou fora de ordem, o
//    cantor desistiu), os vizinhos colavam e a fila principal parava por duas
//    musicas — o oposto da regra da casa.
//
// Por isso o ordemFila hoje e so a ORDEM DE CHEGADA, e a intercalacao e feita
// na hora de montar a fila: um da fila principal, um cafe com leite, e assim
// por diante. Se alguem sai do meio, o resto se reacomoda sozinho.
//
// O que o KJ arrasta vira `fixado` e fica cravado naquela posicao: a vontade
// dele vence a alternancia, e o resto se acomoda em volta.

(function (raiz) {

// Quem ja esta no palco ou sendo chamado vem antes de qualquer pedido.
const PESO = { tocando: 0, pronto: 1, confirmado: 2, confirmando: 2 };
const peso = i => (i && i.status in PESO) ? PESO[i.status] : 3;

// Sem ordemFila vai para o fim: "|| 0" jogava registro antigo para o topo.
const ordemDe = i => (i && typeof i.ordemFila === "number") ? i.ordemFila : Infinity;

const ehCafe = i => !!i && i.tipo === "prioridade";
// So quem ainda vai ser chamado entra na alternancia. Quem esta no palco, sendo
// chamado, ou guardado na vaga de espera, fica onde esta.
const entraNaAlternancia = i => !!i && i.status === "aguardando" && i.slot !== "espera";

function ordenarFila(itens) {
  const ordenada = [...(Array.isArray(itens) ? itens : [])]
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) =>
      (peso(a.item) - peso(b.item)) ||
      (ordemDe(a.item) - ordemDe(b.item)) ||
      (a.idx - b.idx))                       // empate: mantem a ordem que chegou
    .map(x => x.item);

  // As posicoes de quem espera sao as mesmas; muda so quem ocupa cada uma.
  const posicoes = [];
  ordenada.forEach((item, i) => { if (entraNaAlternancia(item)) posicoes.push(i); });
  const esperando = posicoes.map(i => ordenada[i]);
  intercalar(esperando).forEach((item, k) => { ordenada[posicoes[k]] = item; });
  return ordenada;
}

// Um da fila principal, um cafe com leite, um da fila... Comeca pela fila
// principal: ela nunca pode parar de andar. Quem o KJ arrastou (`fixado`) fica
// na posicao em que ele pos, e os outros se acomodam em volta.
function intercalar(esperando) {
  const cravados = new Map();
  esperando.forEach((item, i) => { if (item && item.fixado) cravados.set(i, item); });

  const livres = esperando.filter(item => !(item && item.fixado));
  const daFila = livres.filter(i => !ehCafe(i));
  const cafes = livres.filter(i => ehCafe(i));

  const saida = [];
  let ultimoFoiCafe = null;   // null = ninguem ainda; a fila principal comeca
  for (let i = 0; i < esperando.length; i++) {
    const escolhido = cravados.has(i) ? cravados.get(i)
      : (ultimoFoiCafe === false ? (cafes.shift() || daFila.shift())
                                 : (daFila.shift() || cafes.shift()));
    saida.push(escolhido);
    ultimoFoiCafe = ehCafe(escolhido);
  }
  return saida;
}

// Onde um pedido novo entra: no fim da chegada. Quem decide quando ele CANTA e
// a intercalacao, acima.
function ordemParaNovo(fila) {
  const numeros = (Array.isArray(fila) ? fila : [])
    .map(i => i && i.ordemFila).filter(n => typeof n === "number");
  // MAIOR + 1, nunca contagem + 1: e o que garante ir para o fim com buracos.
  return (numeros.length ? Math.max(...numeros) : 0) + 1;
}

// ── Quem entra junto quando a fila vira prioridade ─────────
// O "cafe com leite" e carimbado no PEDIDO, pela espera daquele momento. Ai
// congelava: quem pediu com a fila curta entrava como normal, e quem chegou
// depois, ja com a fila grande, entrava como cafe e passava na frente dele —
// sendo que os dois ainda nao tinham cantado. Visto no show de 17/09.
//
// A regra do dono: se a fila virou prioridade, quem ainda nao cantou e ja
// estava esperando entra junto, e entre os cafes vale a ordem de chegada.
//
// Devolve os ids a promover. So promove quem NAO piora de lugar com isso: quem
// ja esta perto de cantar pela fila principal fica onde esta. Um cafe por
// cantor, nunca musica em espera, e nada quando a prioridade esta desligada.
//
// `jaCantou(uid)` diz se a pessoa ja cantou nesta noite.
function promocoesDeCafe(itens, { jaCantou, prioridadeAtiva = true } = {}) {
  if (prioridadeAtiva === false) return [];
  const lista = (Array.isArray(itens) ? itens : []).filter(Boolean);
  const esperando = i => i.status === "aguardando" && i.slot !== "espera";
  if (!lista.some(i => esperando(i) && ehCafe(i))) return [];   // a fila nao virou prioridade

  const cantou = typeof jaCantou === "function" ? jaCantou : () => false;
  const pendente = new Set(["aguardando", "confirmando", "confirmado", "pronto", "tocando"]);
  const comCafe = new Set(lista.filter(i => ehCafe(i) && pendente.has(i.status)).map(i => i.cantorUid));

  // Candidatos em ordem de chegada, um por cantor.
  const vistos = new Set();
  const candidatos = lista
    .filter(i => esperando(i) && !ehCafe(i) && i.cantorUid && !cantou(i.cantorUid) && !comCafe.has(i.cantorUid))
    .sort((a, b) => ordemDe(a) - ordemDe(b))
    .filter(i => (vistos.has(i.cantorUid) ? false : (vistos.add(i.cantorUid), true)));

  let atual = lista.map(i => ({ ...i }));
  const posicao = (fila, id) => ordenarFila(fila).filter(esperando).findIndex(i => i.id === id);
  const promovidos = [];
  for (const c of candidatos) {
    const antes = posicao(atual, c.id);
    const tentativa = atual.map(i => (i.id === c.id ? { ...i, tipo: "prioridade" } : i));
    if (posicao(tentativa, c.id) <= antes) {
      atual = tentativa;
      promovidos.push(c.id);
    }
  }
  return promovidos;
}

const api = { ordenarFila, ordemParaNovo, promocoesDeCafe };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyOrdem = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
