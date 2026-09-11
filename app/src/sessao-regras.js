"use strict";

// Quando a sessao aceita pedido de musica. A regra precisa valer igual nos
// dois lados: a Gerencia (relogio, faxina de sessoes vencidas) e o app do
// cantor, que recebe a copia em web/public (vigiada por copias.test.js).
//
// A sessao termina onde o KJ marcou. A tolerancia existe para o atraso do
// proprio show — a ultima musica que entrou no ar perto do fim — e nao para
// esticar a noite. Passado o prazo o cantor nao poe mais nada; o KJ continua
// podendo dar play no que ja esta na fila.

(function (raiz) {
  const TOLERANCIA_MS = 5 * 60 * 1000;

  // Aceita numero, Date ou Timestamp do Firestore.
  function emMs(t) {
    if (t == null) return null;
    if (typeof t === "number") return t;
    if (typeof t.toDate === "function") return t.toDate().getTime();
    if (t instanceof Date) return t.getTime();
    return null;
  }

  function podePedirMusica(termino, agora) {
    const fim = emMs(termino);
    if (fim == null) return true;   // sessao antiga, sem termino declarado
    return (agora == null ? Date.now() : agora) <= fim + TOLERANCIA_MS;
  }

  const api = { TOLERANCIA_MS, podePedirMusica };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.VoxlySessao = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
