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
  const casa = aparelhoDe(principalId, lista);
  if (casa && casa === monitor) {
    return { ok: false, motivo: "A monitoria está no mesmo aparelho do som da casa — o público ouviria a prévia." };
  }
  return { ok: true };
}

const api = { saidasDeAudio, monitoriaSegura };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlySaidas = api;

})(globalThis);
