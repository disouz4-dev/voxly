"use strict";

// Auto play: a noite anda sozinha (pedido dele em 02/10, "quero um botao de
// auto play tbm").
//
// A corrente ja e automatica de ponta a ponta — a musica acaba, a Gerencia
// marca cantada e chama o proximo, com os 30 s no Palco e o aviso no celular.
// Falta so o ultimo elo: alguem apertar Play. O auto play fecha esse elo, e
// nada mais. Aqui mora so a DECISAO; quem toca continua sendo a Gerencia.
//
// A revisao adversarial do desenho reprovou a versao ingenua ("confirmou,
// toca"), e com razao. As travas que sobraram, todas aqui:
//   - Palco morto (janela fechada) nao recebe play nenhum: a noite pararia em
//     silencio sem ninguem entender por que.
//   - Uma subida por vez. Dois 'confirmado' no mesmo instante, ou a fila
//     mudando no meio, nao podem virar duas musicas.
//   - Confirmacao velha nao sobe ninguem: reabrir a Gerencia encontrava um
//     'confirmado' de quem ja foi embora e cortava quem estava cantando.
//   - Musica no ar nunca e cortada.
//   - Sem arquivo no disco, nao toca.
//   - Tela recem-aberta espera a fila chegar antes de decidir qualquer coisa.
//
// O interruptor morre com a noite: ligado numa sessao, nao vale na seguinte
// (a casa abre no manual, sempre).

(function (raiz) {

const ESPERA_MINIMA_MS = 4000;    // respiro entre a confirmacao e o play
const CONFIRMACAO_VELHA_MS = 90 * 1000;
const ASSENTAR_MS = 15 * 1000;    // tempo de tela aberta antes de agir sozinho
const VALIDADE_H = 12;            // o interruptor nao atravessa o dia seguinte

function emMs(t) {
  if (t == null) return null;
  if (typeof t === "number") return t;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  return null;
}

// O que ficou guardado no computador do KJ. Sessao diferente, ou guardado ha
// muito tempo, nasce DESLIGADO.
function estadoGuardado(bruto, { sessaoId = null, agora = Date.now() } = {}) {
  let d = bruto;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch (_) { d = null; } }
  if (!d || typeof d !== "object") return false;
  if (!d.ligado) return false;
  if (!sessaoId || d.sessaoId !== sessaoId) return false;
  const em = emMs(d.em);
  if (em == null || agora - em > VALIDADE_H * 3600 * 1000) return false;
  return true;
}

function paraGuardar(ligado, sessaoId, agora = Date.now()) {
  return { ligado: !!ligado, sessaoId: sessaoId || null, em: agora };
}

// Decide o que fazer quando um pedido fica pronto para subir.
//
//   item:     o pedido que confirmou (ou que venceu o prazo)
//   estado:   { ligado, palcoVivo, ocupado, carregado, musicaNoAr, abertoHa, agora }
//
// Devolve { tocar, esperaMs, motivo }. `motivo` vai para o diario: noite que
// nao anda sozinha tem que deixar explicado por que.
function decidirAutoPlay(item, estado = {}) {
  const {
    ligado = false, palcoVivo = true, ocupado = false, carregado = true,
    musicaNoAr = false, abertoHa = Infinity, agora = Date.now(), offline = false,
  } = estado;

  const nao = motivo => ({ tocar: false, esperaMs: 0, motivo });

  if (!ligado)        return nao("auto play desligado");
  if (offline)        return nao("sem internet: o KJ comanda");
  if (!carregado)     return nao("a fila ainda nao chegou");
  if (abertoHa < ASSENTAR_MS) return nao("tela recem-aberta");
  if (!palcoVivo)     return nao("o Palco esta fechado");
  if (ocupado)        return nao("ja tem uma musica subindo");
  if (musicaNoAr)     return nao("tem musica tocando");
  if (!item || !item.id) return nao("sem pedido para subir");
  if (!["confirmado", "pronto"].includes(item.status)) return nao("pedido nao esta pronto");
  if (item.disponivel === false) return nao("musica sem arquivo");
  if (["baixando", "escolher", "erro"].includes(item.statusDownload)) return nao("download pendente");

  // A chamada comeca com confirmandoAte = agora + 30 s. Dai sai a idade: o que
  // confirmou ha muito tempo e lixo de uma noite que ja virou.
  const ate = emMs(item.confirmandoAte);
  if (ate != null && agora - (ate - 30000) > CONFIRMACAO_VELHA_MS) {
    return nao("confirmacao velha");
  }

  // Respiro: o Palco precisa tirar a chamada da tela antes de o video entrar,
  // e o cantor precisa de um instante para chegar ao microfone.
  return { tocar: true, esperaMs: ESPERA_MINIMA_MS, motivo: "confirmado, subindo" };
}

const api = {
  ESPERA_MINIMA_MS, CONFIRMACAO_VELHA_MS, ASSENTAR_MS, VALIDADE_H,
  estadoGuardado, paraGuardar, decidirAutoPlay,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyAutoPlay = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
