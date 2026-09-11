"use strict";

// Quando a sessao aceita pedido de musica. A regra precisa valer igual nos
// dois lados: a Gerencia (faxina de sessoes vencidas) e o app do
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

  // A Gerencia que usa a sessao grava hostVivoEm a cada minuto. Dez minutos
  // sem batimento = Gerencia fechada ou caida.
  const BATIMENTO_MS = 10 * 60 * 1000;
  const HORAS_SEM_TERMINO = 24;   // sessoes antigas, criadas antes do campo existir

  // A faxina roda em TODA Gerencia aberta: uma segunda maquina com o Voxly
  // aberto apagava a sessao que a primeira estava usando, com a fila, so
  // porque o termino tinha passado. Sessao com Gerencia viva nao se apaga —
  // o fim dela e decisao do KJ (Finalizar, Derrubar, abrir outra).
  function podeApagarNaFaxina({ termino, criadaEm, hostVivoEm, agora } = {}) {
    const t = agora == null ? Date.now() : agora;
    const vivo = emMs(hostVivoEm);
    if (vivo != null && t - vivo < BATIMENTO_MS) return false;
    const fim = emMs(termino);
    if (fim != null) return !podePedirMusica(fim, t);
    const criada = emMs(criadaEm);
    return criada != null && t - criada > HORAS_SEM_TERMINO * 3600e3;
  }

  const api = { TOLERANCIA_MS, BATIMENTO_MS, podePedirMusica, podeApagarNaFaxina };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.VoxlySessao = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
