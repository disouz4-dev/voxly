"use strict";

// Busca de karaoke no YouTube: monta a consulta, descarta o que claramente nao
// serve e ordena o resto para o KJ so precisar escolher.
//
// Deliberadamente sem nada do Electron: o ranqueamento e uma funcao pura sobre
// os metadados que o yt-dlp devolve, entao da para testar sem rede e sem o
// binario instalado. Quem fala com o yt-dlp e o main.js.

const DURACAO_MIN = 90;        // < 1min30 costuma ser trecho ou anuncio
const DURACAO_MAX = 12 * 60;   // > 12min costuma ser coletanea ou live longa

// Sinais fortes: sozinhos ja indicam faixa de karaoke.
const TERMOS_KARAOKE = [
  "karaoke", "playback",
  "backing track", "sing along", "singalong", "cantar junto",
];

// "Instrumental" sozinho nao serve: costuma ser a faixa sem voz e sem letra na
// tela, que nao da para cantar acompanhando. So conta quando vem junto de um
// sinal forte ("Karaoke Instrumental").
const TERMOS_FRACOS = ["instrumental", "sem vocal", "no vocals", "minus one"];

// Sinais de que NAO e: gravacao original, clipe, apresentacao ao vivo.
const TERMOS_INDESEJADOS = [
  "official video", "video oficial", "videoclipe", "clipe oficial",
  "ao vivo", "live session", "acustico", "reaction", "react",
  "cover ", "making of", "bastidores", "entrevista", "podcast",
  // Reportagem sobre karaoke passa no filtro (tem a palavra no titulo) mas nao
  // e faixa para cantar. Penaliza em vez de excluir: o verbo sozinho nao e
  // prova suficiente para descartar um titulo legitimo.
  "veja ", "assista", "confira", "reportagem", "materia sobre",
];

const { normalizar } = require("./texto");

function contemAlgum(texto, termos) {
  return termos.some(t => texto.includes(normalizar(t)));
}

// Fracao das palavras de `alvo` presentes em `texto`. Evita exigir a frase
// exata, que quebra com "(Ao Vivo)", numeracao e ordem trocada.
function cobertura(texto, alvo) {
  const palavras = normalizar(alvo).split(" ").filter(p => p.length > 2);
  if (!palavras.length) return 0;
  const achadas = palavras.filter(p => texto.includes(p)).length;
  return achadas / palavras.length;
}

function montarConsulta({ musica, artista }) {
  return [artista, musica, "karaoke"].filter(Boolean).join(" ").trim();
}

// upload_date do yt-dlp vem como "YYYYMMDD".
function idadeEmDias(uploadDate, agora) {
  if (!uploadDate || !/^\d{8}$/.test(String(uploadDate))) return null;
  const s = String(uploadDate);
  const d = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  const dias = (agora - d) / 86400000;
  return dias >= 0 ? dias : null;
}

function pontuar(video, pedido, agora, canaisPreferidos) {
  const titulo = normalizar(video.title);
  const canal  = normalizar(video.channel || video.uploader);
  const motivos = [];
  let pontos = 0;

  const forteTitulo = contemAlgum(titulo, TERMOS_KARAOKE);
  const forteCanal  = contemAlgum(canal,  TERMOS_KARAOKE);
  if (forteTitulo) { pontos += 30; motivos.push("titulo de karaoke"); }
  if (forteCanal)  { pontos += 25; motivos.push("canal de karaoke"); }
  if ((forteTitulo || forteCanal) && contemAlgum(titulo, TERMOS_FRACOS)) {
    pontos += 6;
    motivos.push("instrumental de karaoke");
  }

  // Lista que o KJ mantem: canais em que ele ja confia valem mais que o resto.
  if (canaisPreferidos.some(c => canal.includes(normalizar(c)))) {
    pontos += 40;
    motivos.push("canal preferido");
  }

  if (contemAlgum(titulo, TERMOS_INDESEJADOS)) { pontos -= 35; motivos.push("parece nao ser karaoke"); }

  const covMusica  = cobertura(titulo, pedido.musica);
  const covArtista = cobertura(titulo, pedido.artista);
  pontos += Math.round(covMusica * 30);
  pontos += Math.round(covArtista * 18);
  if (covMusica >= 0.99) motivos.push("titulo bate com a musica");
  if (covArtista >= 0.99) motivos.push("titulo bate com o artista");

  // Postagem recente desempata: ate +10, sumindo ao longo de ~8 anos.
  const dias = idadeEmDias(video.upload_date, agora);
  if (dias !== null) {
    const recencia = Math.max(0, 1 - dias / (365 * 8));
    pontos += Math.round(recencia * 10);
    if (dias <= 365) motivos.push("postado no ultimo ano");
  }

  // Audiencia como sinal fraco de qualidade: ate +8, em escala log.
  const views = Number(video.view_count) || 0;
  if (views > 0) pontos += Math.min(8, Math.round(Math.log10(views) * 1.4));

  return { pontos, motivos };
}

function descartar(video) {
  if (video.is_live || video.live_status === "is_live") return "transmissao ao vivo";
  const d = Number(video.duration);
  if (!Number.isFinite(d) || d <= 0) return "sem duracao";
  if (d < DURACAO_MIN) return "curto demais";
  if (d > DURACAO_MAX) return "longo demais";

  // A fila e de karaoke: sem sinal de karaoke no titulo ou no canal, o video
  // nao entra. Antes isso era so uma penalidade, entao um clipe original ainda
  // podia sobrar na lista quando a busca rendia pouco.
  const titulo = normalizar(video.title);
  const canal  = normalizar(video.channel || video.uploader);
  if (!contemAlgum(titulo, TERMOS_KARAOKE) && !contemAlgum(canal, TERMOS_KARAOKE)) {
    // Instrumental puro cai aqui: sem sinal forte, nao entra.
    return contemAlgum(titulo, TERMOS_FRACOS) ? "instrumental sem karaoke" : "nao e karaoke";
  }
  return null;
}

// Recebe o que o yt-dlp devolveu e entrega o que vale mostrar ao KJ, do melhor
// para o pior. `agora` e injetado para o teste nao depender da data de hoje.
// O titulo precisa conter a musica pedida. Sem isto, qualquer karaoke passava
// no filtro: buscar "Scarlett" do Periphery devolvia Lana Del Rey, porque o
// video tem "karaoke" no titulo e o filtro so exigia esse sinal.
const COBERTURA_MINIMA = 0.5;

function relevante(video, pedido) {
  const alvo = normalizar(pedido && pedido.musica);
  const palavras = alvo.split(" ").filter(p => p.length > 2);
  if (!palavras.length) return true; // musica de nome curto demais para exigir
  return cobertura(normalizar(video.title), pedido.musica) >= COBERTURA_MINIMA;
}

function ordenarCandidatos(videos, pedido, opcoes = {}) {
  const agora = opcoes.agora ?? Date.now();
  const canaisPreferidos = opcoes.canaisPreferidos || [];
  const limite = opcoes.limite || 8;

  return (videos || [])
    .filter(v => v && v.id && !descartar(v) && relevante(v, pedido))
    .map(v => {
      const { pontos, motivos } = pontuar(v, pedido, agora, canaisPreferidos);
      return {
        id: v.id,
        titulo: v.title,
        canal: v.channel || v.uploader || "",
        duracao: Number(v.duration),
        views: Number(v.view_count) || 0,
        postadoEm: v.upload_date || null,
        url: v.webpage_url || `https://www.youtube.com/watch?v=${v.id}`,
        pontos,
        motivos,
      };
    })
    .sort((a, b) => b.pontos - a.pontos || b.views - a.views)
    .slice(0, limite);
}

module.exports = {
  montarConsulta,
  ordenarCandidatos,
  relevante,
  // exportados para teste
  normalizar,
  cobertura,
  idadeEmDias,
  descartar,
};
