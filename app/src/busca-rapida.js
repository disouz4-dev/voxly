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

// O título do vídeo e o nome do canal são campos diferentes e distantes um do
// outro no JSON da página — entre o videoId e o título vem o bloco de
// miniaturas, com URL de centenas de caracteres. A primeira versão disto
// emparelhava "o videoId com o próximo texto" e pegava o nome do CANAL: no
// show de 22/10 isso me fez dizer que não existia karaokê de uma música que
// tinha instrumental, porque eu comparava o nome dela contra "Karaoke Anime".
// Agora lê o JSON de verdade e anda nos videoRenderer.
const RE_DADOS = /var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/;

function textoDe(campo) {
  if (!campo) return "";
  if (Array.isArray(campo.runs)) return campo.runs.map(r => (r && r.text) || "").join("");
  return campo.simpleText || "";
}

// "3:53" e "1:02:33" — o formato que a pagina mostra. Ao vivo e estreia nao
// trazem duracao: devolve nulo, nunca zero, porque zero faria o ranqueador
// tratar o video como gravacao de duracao invalida e descartar.
function segundosDe(texto) {
  const partes = String(texto == null ? "" : texto).trim().split(":");
  if (partes.length < 2 || partes.length > 3) return null;
  if (!partes.every(p => /^\d{1,2}$/.test(p))) return null;
  return partes.reduce((total, p) => total * 60 + Number(p), 0);
}

// "1.383.788 visualizacoes" no pt-BR, "1,383,788 views" no ingles: o separador
// de milhar muda com o idioma da pagina, entao conta digito e ignora o resto.
// Nao serve para "1,3 mi" (shortViewCountText), que viraria 13 — por isso quem
// chama le viewCountText, que vem sempre inteiro.
function viewsDe(texto) {
  const digitos = String(texto == null ? "" : texto).replace(/\D/g, "");
  return digitos ? Number(digitos) : 0;
}

function extrairCandidatos(html) {
  const m = String(html == null ? "" : html).match(RE_DADOS);
  if (!m) return [];
  let dados;
  // Página com outro formato (YouTube mudou, resposta de erro) devolve vazio:
  // quem chama diz "não achei" e o KJ decide, em vez de baixar um palpite.
  try { dados = JSON.parse(m[1]); } catch (_) { return []; }

  const vistos = new Set();
  const saida = [];
  (function andar(no) {
    if (!no || typeof no !== "object") return;
    if (Array.isArray(no)) { for (const x of no) andar(x); return; }
    // Só videoRenderer: canal e playlist também aparecem nos resultados e não
    // são gravações para baixar.
    const v = no.videoRenderer;
    if (v && v.videoId && !vistos.has(v.videoId)) {
      vistos.add(v.videoId);
      saida.push({
        id: v.videoId,
        titulo: textoDe(v.title),
        canal: textoDe(v.ownerText) || textoDe(v.longBylineText),
        duracao: segundosDe(textoDe(v.lengthText)),
        views: viewsDe(textoDe(v.viewCountText)),
        // A pagina so diz "ha 2 anos", que nao e data. Quem preenche a data de
        // publicacao e o /datas depois, com os cards ja na tela — inventar uma
        // aqui faria o desempate por idade mentir.
        postadoEm: null,
      });
    }
    for (const x of Object.values(no)) andar(x);
  })(dados);
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

module.exports = { extrairCandidatos, escolherCandidato, nomeDeArquivo, segundosDe, viewsDe, RE_KARAOKE };
