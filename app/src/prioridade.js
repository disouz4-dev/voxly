"use strict";

// Quem entra como "café com leite" — a prioridade de primeira musica.
//
// A regra existe para quem chegou agora nao esperar uma fila enorme. Vinha
// escrita duas vezes, na Gerencia e no app do cantor, com contas diferentes, e
// nenhuma das duas filtrava o slot: musica parada em "espera" nao vai tocar
// naquele ciclo, mas contava como tempo de fila. Com o limite em 20 minutos
// bastavam 6 pedidos contados — 5 ativos e 1 em espera — para promover alguem
// numa fila que tinha exatamente 20.

// Media de uma faixa de karaoke com entrada e saida do cantor. E uma
// estimativa: a fila nao sabe a duracao dos arquivos antes de baixa-los.
const MINUTOS_POR_MUSICA = 4;
const MINUTOS_PADRAO = 40;

(function (raiz) {

// Só o que vai realmente tocar neste ciclo: em espera nao entra, e o que ja
// esta no ar tambem nao — quem chega agora nao espera por eles.
function minutosDeFila(fila) {
  const itens = Array.isArray(fila) ? fila : [];
  const contam = itens.filter(i => i && i.status === "aguardando" && i.slot !== "espera");
  return contam.length * MINUTOS_POR_MUSICA;
}

// Estados em que o pedido ainda vai tocar nesta noite.
const PENDENTE = new Set(["aguardando", "confirmando", "confirmado", "pronto", "tocando"]);

// `slot` e `cantorUid` existem porque o cafe com leite e para UMA musica: a da
// espera nunca e, e quem ja tem um pendente nao ganha outro — o KJ pondo duas
// musicas a mao, ou a espera promovida, davam cafe em dobro.
function ehPrioridade({ regras, jaCantou, fila, slot, cantorUid } = {}) {
  const r = regras || {};
  if (r.prioridadeAtiva === false) return false;
  if (jaCantou) return false;
  if (slot === "espera") return false;
  if (cantorUid && (Array.isArray(fila) ? fila : []).some(i =>
    i && i.cantorUid === cantorUid && i.tipo === "prioridade" && PENDENTE.has(i.status))) return false;

  // "??" e nao "||": limite zero e uma escolha do KJ (promover sempre), e o
  // "||" a transformava nos 40 do padrao.
  const limite = r.prioridadeMinutos ?? MINUTOS_PADRAO;
  return minutosDeFila(fila) > limite;
}

const api = { ehPrioridade, minutosDeFila, MINUTOS_POR_MUSICA, MINUTOS_PADRAO };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyPrioridade = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
