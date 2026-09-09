"use strict";

// Busca de karaoke no YouTube: monta a consulta, descarta o que claramente nao
// serve e ordena o resto para o KJ so precisar escolher.
//
// Deliberadamente sem nada do Electron: o ranqueamento e uma funcao pura sobre
// os metadados que o yt-dlp devolve, entao da para testar sem rede e sem o
// binario instalado. Quem fala com o yt-dlp e o main.js.

const DURACAO_MIN = 90;        // < 1min30 costuma ser trecho ou anuncio
const DURACAO_MAX = 12 * 60;   // > 12min costuma ser coletanea ou live longa

// Sinais no titulo de que E uma faixa de karaoke.
const TERMOS_KARAOKE = [
  "karaoke", "playback", "instrumental",
  "backing track", "sing along", "singalong", "cantar junto",
];

// Sinais de que NAO e: gravacao original, clipe, apresentacao ao vivo.
const TERMOS_INDESEJADOS = [
  "official video", "video oficial", "videoclipe", "clipe oficial",
  "ao vivo", "live session", "acustico", "reaction", "react",
  "cover ", "making of", "bastidores", "entrevista", "podcast",
];

function normalizar(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

  if (contemAlgum(titulo, TERMOS_KARAOKE)) { pontos += 30; motivos.push("titulo de karaoke"); }
  if (contemAlgum(canal,  TERMOS_KARAOKE)) { pontos += 25; motivos.push("canal de karaoke"); }

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
    return "nao e karaoke";
  }
  return null;
}

// Recebe o que o yt-dlp devolveu e entrega o que vale mostrar ao KJ, do melhor
// para o pior. `agora` e injetado para o teste nao depender da data de hoje.
function ordenarCandidatos(videos, pedido, opcoes = {}) {
  const agora = opcoes.agora ?? Date.now();
  const canaisPreferidos = opcoes.canaisPreferidos || [];
  const limite = opcoes.limite || 8;

  return (videos || [])
    .filter(v => v && v.id && !descartar(v))
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
  // exportados para teste
  normalizar,
  cobertura,
  idadeEmDias,
  descartar,
};
