"use strict";

// Saidas de audio: a principal (o som da casa, pelo Palco) e a monitoria (o
// fone do KJ, onde ele ouve a previa de uma versao do YouTube antes de baixar).
//
// A previa NUNCA pode sair no som da casa. Por isso a monitoria exige um
// aparelho escolhido de proposito, conectado agora e fisicamente diferente da
// saida principal. "Fisicamente" importa: o Chromium lista "default" como um
// apelido do aparelho padrao (mesmo groupId), entao comparar so o id deixaria
// passar a casa no "padrao" e a monitoria no mesmo alto-falante.

(function (raiz) {

const PADRAO = ["", "default"];

function saidasDeAudio(dispositivos) {
  const saidas = (Array.isArray(dispositivos) ? dispositivos : [])
    .filter(d => d && d.kind === "audiooutput" && !PADRAO.includes(d.deviceId) && d.deviceId !== "communications");
  return saidas.map((d, i) => ({ id: d.deviceId, nome: d.label || `Saída de áudio ${i + 1}`, grupo: d.groupId || d.deviceId }));
}

// Aparelho fisico de uma saida. "" e "default" = o aparelho padrao de agora.
function aparelhoDe(id, dispositivos) {
  const alvo = PADRAO.includes(id || "") ? "default" : id;
  const d = dispositivos.find(x => x && x.kind === "audiooutput" && x.deviceId === alvo);
  return d ? (d.groupId || d.deviceId) : null;
}

function monitoriaSegura({ monitorId, principalId, dispositivos } = {}) {
  const lista = Array.isArray(dispositivos) ? dispositivos : [];
  if (!monitorId || PADRAO.includes(monitorId)) {
    return { ok: false, motivo: "Escolha um fone ou interface como saída de monitoria em ⚙ Config → Som." };
  }
  const monitor = aparelhoDe(monitorId, lista);
  if (!monitor) {
    return { ok: false, motivo: "A saída de monitoria não está conectada. Conecte o fone ou escolha outra em ⚙ Config → Som." };
  }
  // Saida da casa escolhida mas desconectada: o Chromium toca no padrao do
  // sistema, entao para esta conta a casa E o padrao.
  const casa = aparelhoDe(principalId, lista) || aparelhoDe("default", lista);
  if (casa && casa === monitor) {
    return { ok: false, motivo: "A monitoria está no mesmo aparelho do som da casa — o público ouviria a prévia." };
  }
  return { ok: true };
}

// ── Som da casa que nao foge ──────────────────────────────
// Com a saida da casa em "padrao do sistema", o Palco seguia o padrao do
// macOS — e ao espelhar a tela para a TV (AirPlay) o macOS muda o padrao para
// a TV, levando o som junto no meio do show (17/09). Agora "padrao" quer dizer
// o aparelho que ERA o padrao quando o Palco fixou a saida, e ele so muda se
// esse aparelho sumir.

// O aparelho concreto por tras do "default" do Chromium (mesmo groupId).
function aparelhoDoPadrao(dispositivos) {
  const lista = (Array.isArray(dispositivos) ? dispositivos : []).filter(d => d && d.kind === "audiooutput");
  const padrao = lista.find(d => d.deviceId === "default");
  if (!padrao) return "";
  const real = lista.find(d => !PADRAO.includes(d.deviceId) && d.deviceId !== "communications" && d.groupId === padrao.groupId);
  return real ? real.deviceId : "";
}

// Qual aparelho o Palco deve usar agora.
//   escolhida: o que o KJ escolheu em ⚙ Config → Som ("" = padrao)
//   fixada:    o aparelho que o "padrao" fixou antes
// Devolve { id, motivo } — motivo: "escolhida", "fixada", "fixou-agora",
// "escolhida-sumiu" ou "fixada-sumiu" (os dois ultimos o KJ precisa saber).
function saidaEfetiva({ escolhida = "", fixada = "", dispositivos } = {}) {
  const lista = (Array.isArray(dispositivos) ? dispositivos : []).filter(d => d && d.kind === "audiooutput");
  const existe = id => !!id && lista.some(d => d.deviceId === id);
  if (escolhida && !PADRAO.includes(escolhida)) {
    if (existe(escolhida)) return { id: escolhida, motivo: "escolhida" };
    return { id: aparelhoDoPadrao(lista), motivo: "escolhida-sumiu" };
  }
  if (fixada && existe(fixada)) return { id: fixada, motivo: "fixada" };
  return { id: aparelhoDoPadrao(lista), motivo: fixada ? "fixada-sumiu" : "fixou-agora" };
}

const api = { saidasDeAudio, monitoriaSegura, aparelhoDoPadrao, saidaEfetiva };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlySaidas = api;

})(globalThis);
