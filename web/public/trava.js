"use strict";

// Defesa contra o clique repetido. No show de 10/09 confirmar um pedido levava
// alguns segundos (idas ao Firestore em sequencia) e quem clicava de novo punha
// a mesma musica duas vezes na fila.
//
// Sao duas defesas porque uma so nao basta:
//  - a trava impede que o segundo clique dispare a acao enquanto a primeira
//    ainda roda;
//  - a chave do pedido e o id do documento, fixada quando o modal abre. Se a
//    gravacao se repetir por qualquer outro caminho (rede que reenvia, trava
//    solta cedo), ela reescreve o mesmo documento em vez de criar outro.
//
// Usado pela Gerencia e pelo app do cantor; a copia em web/public e vigiada
// pelo teste copias.test.js.

(function (raiz) {

function criarTrava() {
  let ocupada = false;
  return {
    get ocupada() { return ocupada; },
    // Chamada ignorada devolve undefined: para quem clicou, e como se o
    // segundo clique nao tivesse acontecido, que e exatamente o que se quer.
    async executar(fn) {
      if (ocupada) return undefined;
      ocupada = true;
      try {
        return await fn();
      } finally {
        ocupada = false;
      }
    },
  };
}

// Firestore recusa "/" em id de documento (viraria caminho) e os ids "." e "..".
function chaveDePedido(uid, agora = Date.now(), sorte = Math.random) {
  const dono = String(uid || "anonimo").replace(/\//g, "-");
  const acaso = Math.floor(sorte() * 36 ** 6).toString(36);
  return `${dono}_${agora.toString(36)}${acaso}`;
}

// ── A mesma musica duas vezes ─────────────────────────────
// No show de 17/09 a Lady Lu mandou "Plush" duas vezes em 13 segundos (Wi-Fi
// lento, achou que o primeiro nao tinha ido): uma foi para a fila e a outra
// para a espera. Ela cantou a primeira, a da espera subiu e ela foi chamada de
// novo para a mesma musica. A chave do pedido nao pega isso — sao dois
// pedidos de verdade, com o modal aberto duas vezes.

// Compara pelo que a pessoa le: sem acento, maiuscula, pontuacao, e sem o
// sufixo de versao "- [a1b2c3]" que o catalogo poe no nome.
function chaveDeMusica(musica, artista) {
  const limpar = s => String(s || "")
    .replace(/\s*-\s*\[[0-9a-f]{6}\]\s*$/i, "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return limpar(musica) + "|" + limpar(artista);
}

// O pedido pendente da mesma musica, ou null. `ignorarId`: o pedido que esta
// sendo trocado (trocar a musica por ela mesma nao e repetir).
function pedidoRepetido(pendentes, pedido, ignorarId) {
  const alvo = chaveDeMusica(pedido && pedido.musica, pedido && pedido.artista);
  const ativos = new Set(["aguardando", "confirmando", "confirmado", "pronto", "tocando"]);
  return (Array.isArray(pendentes) ? pendentes : []).find(i =>
    i && i.id !== ignorarId && (!i.status || ativos.has(i.status))
    && chaveDeMusica(i.musica, i.artista) === alvo) || null;
}

const api = { criarTrava, chaveDePedido, chaveDeMusica, pedidoRepetido };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyTrava = api;

})(globalThis);
