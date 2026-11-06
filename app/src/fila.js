"use strict";

// O que o botao Play do painel central deve fazer, dado o estado da fila.
// Fora da tela porque errar aqui custa caro no palco e porque a decisao tem
// mais casos do que parece.

// `temMusicaNoAr` vem do host: existe uma musica carregada no player (pausada
// ou tocando). Nao da para deduzir isso do status da fila — o write de
// 'cantada' da musica anterior pode ainda estar a caminho do Firestore, e
// nesse instante o item antigo continua 'tocando' na copia local.
(function (raiz) {

function escolherParaTocar(fila, estado) {
  const itens = Array.isArray(fila) ? fila : [];

  // Musica no ar vence tudo. O Play nao e o botao de cortar — Pular e. Com uma
  // musica carregada (pausada, por exemplo) e alguem "pronto" na fila, dar
  // precedencia ao chamado cortava a musica do cantor que estava cantando.
  if (estado && estado.temMusicaNoAr) return { acao: "retomar" };

  // Nada no ar e alguem sendo chamado: o Play e a decisao de nao esperar a
  // confirmacao. Note que o status 'tocando' da musica ANTERIOR pode ainda
  // estar na copia local (o write de 'cantada' demora), por isso quem responde
  // "tem musica no ar" e o host, nao a fila.
  const chamado = itens.find(i => i.status === "confirmando" || i.status === "pronto");
  if (chamado) return { acao: "tocar", id: chamado.id };

  const proximo = itens.find(i => i.status === "aguardando" && i.slot !== "espera");
  return proximo ? { acao: "tocar", id: proximo.id } : { acao: "nada" };
}

// ── Achar o pedido pelo id, em qualquer vaga ───────────────
// A Gerencia tem duas listas: a da ordem do palco (`filaData`), que deixa a
// vaga de espera de fora, e a completa (`_filaCompleta`), com todos os pedidos
// pendentes. Toda acao POR ID procurava na primeira, e por isso nao alcancava a
// segunda musica do cantor: no show de 05/11 foram 28 comandos de download
// mortos, os 28 em `slot: "espera"`, sem nenhum aviso de volta ao celular.
//
// A completa vem primeiro porque e a que tem o dado mais novo: ela sai direto
// do snapshot, enquanto a outra passa pela ordenacao.
function acharPedido(id, { fila, completa } = {}) {
  if (!id) return null;
  const busca = lista => (Array.isArray(lista) ? lista : [])
    .find(i => i && i.id === id) || null;
  return busca(completa) || busca(fila);
}

// A Gerencia carrega por <script> (e file://, nao tem require); os testes
// carregam por require.
const api = { escolherParaTocar, acharPedido };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyFila = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
