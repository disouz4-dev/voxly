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

const api = { criarTrava, chaveDePedido };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyTrava = api;

})(globalThis);
