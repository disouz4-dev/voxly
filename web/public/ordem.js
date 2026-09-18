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

// `ultimoFoiCafe`: se a ultima musica que SAIU da fila (a que esta no palco
// ou a que acabou de ser cantada) era cafe com leite. Sem isto a alternancia
// recomecava "pela fila principal" toda vez que alguem subia ao palco, e o
// cafe so entrava quando a fila principal acabava: com M1 C1 M2 C2 M3,
// cantavam M1 M2 M3 C1 C2 (de 12/09 a 18/09). Quem esta no palco ou sendo
// chamado ja diz isso sozinho; o parametro cobre o intervalo entre uma
// musica e outra, quando ninguem esta no palco. A Gerencia guarda esse dado
// na sessao (alternancia.ultimoFoiCafe).
function ordenarFila(itens, { ultimoFoiCafe = null } = {}) {
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

  // O ultimo a sair da fila: quem vai ao palco por ultimo entre os que ja
  // estao tocando, prontos ou sendo chamados; sem ninguem, o que foi cantado.
  const saindo = ordenada.filter(i => i && i.status in PESO);
  const inicio = saindo.length ? ehCafe(saindo[saindo.length - 1]) : ultimoFoiCafe;

  intercalar(esperando, inicio).forEach((item, k) => { ordenada[posicoes[k]] = item; });
  return ordenada;
}

// Um da fila principal, um cafe com leite, um da fila... Sem saber quem saiu
// por ultimo, comeca pela fila principal: ela nunca pode parar de andar. Quem
// o KJ arrastou (`fixado`) fica na posicao em que ele pos, e os outros se
// acomodam em volta.
function intercalar(esperando, inicio = null) {
  const cravados = new Map();
  esperando.forEach((item, i) => { if (item && item.fixado) cravados.set(i, item); });

  const livres = esperando.filter(item => !(item && item.fixado));
  const daFila = livres.filter(i => !ehCafe(i));
  const cafes = livres.filter(i => ehCafe(i));

  const saida = [];
  let ultimoFoiCafe = inicio;   // null = ninguem ainda; a fila principal comeca
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
// A regra do dono (18/09), que substituiu o gatilho por tempo de fila: com a
// prioridade ligada, quem ainda nao cantou vira cafe com leite quando todo
// mundo que ja cantou e esta esperando na fila ja cantou pelo menos
// `cederApos` musicas (ele escolheu 1). E, se a fila ja tem cafe, quem nao
// cantou e estava esperando entra junto. Entre os cafes vale a ordem de
// chegada, e a intercalacao e uma da fila, uma prioridade.
//
// Devolve os ids a promover. So promove quem NAO piora de lugar com isso: quem
// ja esta perto de cantar pela fila principal fica onde esta. Um cafe por
// cantor, nunca musica em espera, e nada quando a prioridade esta desligada.
//
// `jaCantou(uid)` diz se a pessoa ja cantou nesta noite; `cantadas(uid)`,
// quantas.
function promocoesDeCafe(itens, { jaCantou, cantadas, cederApos = 0, prioridadeAtiva = true, ultimoFoiCafe = null } = {}) {
  if (prioridadeAtiva === false) return [];
  const lista = (Array.isArray(itens) ? itens : []).filter(Boolean);
  const esperando = i => i.status === "aguardando" && i.slot !== "espera";
  const cantou = typeof jaCantou === "function" ? jaCantou : () => false;
  const quantas = typeof cantadas === "function" ? cantadas : (uid => (cantou(uid) ? 1 : 0));

  const jaTemCafe = lista.some(i => esperando(i) && ehCafe(i));
  const veteranos = lista.filter(i => esperando(i) && i.cantorUid && cantou(i.cantorUid));
  const todosJaCantaram = cederApos > 0 && veteranos.length > 0
    && veteranos.every(i => quantas(i.cantorUid) >= cederApos);
  if (!jaTemCafe && !todosJaCantaram) return [];   // a fila nao virou prioridade

  const pendente = new Set(["aguardando", "confirmando", "confirmado", "pronto", "tocando"]);
  const comCafe = new Set(lista.filter(i => ehCafe(i) && pendente.has(i.status)).map(i => i.cantorUid));

  // Candidatos em ordem de chegada, um por cantor.
  const vistos = new Set();
  const candidatos = lista
    .filter(i => esperando(i) && !ehCafe(i) && i.cantorUid && !cantou(i.cantorUid) && !comCafe.has(i.cantorUid))
    .sort((a, b) => ordemDe(a) - ordemDe(b))
    .filter(i => (vistos.has(i.cantorUid) ? false : (vistos.add(i.cantorUid), true)));

  let atual = lista.map(i => ({ ...i }));
  const posicao = (fila, id) => ordenarFila(fila, { ultimoFoiCafe }).filter(esperando).findIndex(i => i.id === id);
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

// ── "Cantar na proxima" ────────────────────────────────────
// A pessoa foi chamada (ou a musica comecou) e ela nao esta — no banheiro, no
// bar. Pular tira a musica; isto so adia: ela volta a esperar logo depois do
// proximo da mesma fila (a principal, ou a do cafe com leite, se ela for cafe),
// e a noite segue. Pedido do dono no show de 17/09.
//
// Devolve o novo ordemFila. O ordemFila e so a ordem de chegada, entao um
// numero entre o do proximo e o do seguinte basta; a intercalacao faz o resto.
function ordemParaCantarNaProxima(itens, id) {
  const lista = (Array.isArray(itens) ? itens : []).filter(Boolean);
  const alvo = lista.find(i => i.id === id);
  if (!alvo) return null;
  const mesmaFila = lista
    .filter(i => i.id !== id && i.status === "aguardando" && i.slot !== "espera"
      && !i.fixado && ehCafe(i) === ehCafe(alvo))
    .sort((a, b) => ordemDe(a) - ordemDe(b));
  const numeros = lista.map(ordemDe).filter(Number.isFinite);
  if (!mesmaFila.length) return (numeros.length ? Math.max(...numeros) : 0) + 1;
  const proximo = ordemDe(mesmaFila[0]);
  const seguinte = mesmaFila[1] ? ordemDe(mesmaFila[1]) : proximo + 1;
  return (proximo + seguinte) / 2;
}

const api = { ordenarFila, ordemParaNovo, promocoesDeCafe, ordemParaCantarNaProxima };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyOrdem = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
