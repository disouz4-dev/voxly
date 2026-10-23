"use strict";

// Busca de karaokê pela página de resultados do YouTube, sem yt-dlp.
//
// Medido no show de 22/10: `ytsearch12` do yt-dlp levou 162 s e subiu 8
// processos para UMA busca; a página de resultados responde em menos de 1 s.
//
// A normalização e a lista de ligações vêm do versoes.js: o acervo já compara
// nome de música por lá, e duas contas diferentes para a mesma coisa foi o que
// trocou Silverchair por Blink 182 no palco.

const { normalizar, significativas } = require("./versoes");

// Marca de que o vídeo é para cantar, e não a gravação original.
const RE_KARAOKE = /karaoke|karaoke|playback|instrumental/;

// Ruído que o título do pedido carrega e que não faz parte do nome da música:
// pedido antigo vem com o título inteiro do YouTube.
const RE_RUIDO = /[([][^)\]]*[)\]]/g;

function extrairCandidatos(html) {
  const txt = String(html == null ? "" : html);
  const vistos = new Set();
  const saida = [];
  // O título vem no primeiro "text" depois do videoId no JSON embutido da página.
  for (const m of txt.matchAll(/"videoId":"([\w-]{11})"[\s\S]{0,400}?"text":"([^"]{3,160})"/g)) {
    const id = m[1];
    if (vistos.has(id)) continue;
    vistos.add(id);
    saida.push({ id, titulo: m[2] });
  }
  return saida;
}

// Vale SÓ quem tem todas as palavras significativas da música no título. Na
// dúvida devolve null: música errada no palco acontece na frente da casa, e
// não achar apenas devolve a escolha para quem chamou.
function escolherCandidato(candidatos, pedido) {
  const lista = Array.isArray(candidatos) ? candidatos : [];
  const musica = pedido && pedido.musica ? String(pedido.musica).replace(RE_RUIDO, " ") : "";
  if (!musica.trim()) return null;

  const palavras = significativas(musica);
  if (!palavras.length) return null;
  const doArtista = significativas(String((pedido && pedido.artista) || "").replace(RE_RUIDO, " "));

  let melhor = null;
  let melhorNota = -1;
  for (const c of lista) {
    const t = normalizar(c.titulo);
    if (!RE_KARAOKE.test(t)) continue;                 // é a gravação original
    if (!palavras.every(p => t.includes(p))) continue; // não é a música pedida
    // Entre os que servem, o que também traz o artista vence: "One" existe do
    // U2 e do Metallica.
    const nota = doArtista.length ? doArtista.filter(p => t.includes(p)).length : 0;
    if (nota > melhorNota) { melhor = c; melhorNota = nota; }
  }
  return melhor;
}

// "Artista - Musica - Canal [id]": o padrão que o acervo casa. O id fica no fim
// porque é por ele que o app acha o arquivo exato, sem adivinhar pelo nome.
const RE_PROIBIDO = /[\/\\:"*?<>|\x00-\x1f]/g;

function limpar(parte) {
  return String(parte == null ? "" : parte).replace(RE_PROIBIDO, "").replace(/\s+/g, " ").trim();
}

function nomeDeArquivo({ artista, musica, canal, id } = {}) {
  const pedacos = [limpar(artista), limpar(musica), limpar(canal)].filter(Boolean);
  return `${pedacos.join(" - ")} [${limpar(id)}]`;
}

module.exports = { extrairCandidatos, escolherCandidato, nomeDeArquivo, RE_KARAOKE };
