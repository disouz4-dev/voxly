"use strict";

// Formato de download endurecido: sem HLS e com H.264 na frente.
//
// Medido em 29/10: com o seletor antigo, para a MESMA consulta o yt-dlp
// escolhia ora o formato 137 (H.264, arquivo único por https), ora o 399
// (AV1), ora o 614 (VP9 em m3u8 — HLS, baixado em fragmentos). Os três
// reportam ext=mp4, então "[ext=mp4]" não separava nada.
//
// Isso importa por dois motivos. Em HLS, um vídeo são centenas de idas e vindas
// na rede do bar, e é a explicação mais provável da mediana de 188 s nos 50
// downloads de 22/10 contra os 11 s medidos hoje na mesma máquina. E o AV1 não
// abre no QuickTime nem no Finder, e o Electron o decodifica por software — num
// show isso é a imagem travando no telão.
//
// Os três presets da tela são reconhecidos e trocados pelo equivalente duro.
// Formato que o KJ escreveu à mão passa intacto: a escolha é dele.

// Ordem: H.264 por https > qualquer vídeo por https > progressivo por https >
// qualquer coisa. A última reserva NÃO trava o protocolo de propósito — vídeo
// que só existe em HLS tem de baixar devagar, não deixar o cantor sem música.
function montar(alturaMax) {
  const h = alturaMax ? `[height<=${alturaMax}]` : "";
  return [
    `bv*${h}[protocol^=http][vcodec^=avc1]+ba[ext=m4a]`,
    `bv*${h}[protocol^=http]+ba`,
    `b${h}[protocol^=http]`,
    `b${h}`,
  ].join("/");
}

// Os presets exatos que a tela oferece e que ficam gravados no config do KJ.
const PRESETS = new Map([
  ["bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]", montar(1080)],
  ["bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]",   montar(720)],
  ["bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",                             montar(null)],
]);

const PADRAO = montar(1080);

function formatoSeguro(qualidade) {
  if (typeof qualidade !== "string" || !qualidade.trim()) return PADRAO;
  const pedido = qualidade.trim();
  return PRESETS.get(pedido) || pedido;
}

module.exports = { formatoSeguro, PADRAO };
