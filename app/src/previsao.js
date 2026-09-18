"use strict";

// Quando cada musica da fila deve tocar, e quanto falta da que esta no palco.
//
// Pedido do dono no show de 17/09: a fila mostrar a hora aproximada de cada
// musica, e uma barra de progresso da que esta tocando. A conta e simples de
// proposito: o que falta da atual + a duracao de cada uma na frente + um
// respiro entre elas (a chamada e a confirmacao). A duracao de uma musica o
// Voxly aprende quando ela toca; a que nunca tocou vale a media.

(function (raiz) {

const PADRAO_S = 240;   // media de uma faixa de karaoke
const FOLGA_S  = 40;    // chamar, confirmar, a pessoa chegar ao palco

// Horario previsto (ms) de cada pedido que ainda vai tocar, na ordem dada.
//   fila:         pedidos na ordem da Gerencia (quem esta no palco primeiro)
//   agora:        Date.now()
//   restanteS:    quanto falta da musica no palco (0 se nada toca)
//   duracaoDe:    item -> segundos, ou null quando nao se sabe
function horariosPrevistos({ fila, agora, restanteS = 0, duracaoDe, folgaS = FOLGA_S, padraoS = PADRAO_S } = {}) {
  const previsto = new Map();
  let cursor = (Number(agora) || 0) + Math.max(0, Number(restanteS) || 0) * 1000;
  for (const item of Array.isArray(fila) ? fila : []) {
    if (!item || item.status === "tocando") continue;
    const inicio = cursor + folgaS * 1000;
    previsto.set(item.id, inicio);
    const d = typeof duracaoDe === "function" ? Number(duracaoDe(item)) : NaN;
    cursor = inicio + (Number.isFinite(d) && d > 0 ? d : padraoS) * 1000;
  }
  return previsto;
}

// 125 -> "2:05"
function minutosESegundos(s) {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

// Hora do relogio, sem segundos: "23:42".
function horaCurta(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const api = { horariosPrevistos, minutosESegundos, horaCurta, PADRAO_S, FOLGA_S };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyPrevisao = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
