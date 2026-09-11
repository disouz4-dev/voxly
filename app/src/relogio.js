"use strict";

// Relogio da Gerencia: quanto falta na sessao, dito do jeito que o KJ usa.
// A tolerancia (5 min, a mesma de web/public/sessao-regras.js) aparece como
// "pedidos fecham em", porque e isso que ela e: o prazo para o cantor ainda
// por musica. O KJ continua podendo dar play depois dela.

(function (raiz) {

const TOLERANCIA_MS = 5 * 60 * 1000;

function emMs(t) {
  if (t == null) return null;
  if (typeof t === "number") return t;
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  return null;
}

// Arredonda para cima: "termina em 1 min" ate o ultimo segundo, nunca "0 min".
function duracao(ms) {
  if (ms < 60 * 1000) return "menos de 1 min";
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

function tempoDaSessao({ inicio, termino, agora = Date.now(), toleranciaMs = TOLERANCIA_MS } = {}) {
  const fim = emMs(termino);
  if (fim == null) return null;
  const ini = emMs(inicio);
  if (ini != null && agora < ini) return { fase: "antes", texto: `começa em ${duracao(ini - agora)}` };
  if (agora < fim) return { fase: "durante", texto: `termina em ${duracao(fim - agora)}` };
  if (agora <= fim + toleranciaMs) {
    return { fase: "tolerancia", texto: `pedidos fecham em ${duracao(fim + toleranciaMs - agora)}` };
  }
  return { fase: "encerrada", texto: "pedidos encerrados" };
}

const api = { duracao, tempoDaSessao, TOLERANCIA_MS };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyRelogio = api;

})(globalThis);
