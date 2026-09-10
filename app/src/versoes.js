"use strict";

// Versoes da mesma musica ja presentes na pasta. O KJ decide qual tocar: a
// mesma faixa costuma existir em canais diferentes, com tom e arranjo
// diferentes, e pegar "a primeira que aparecer" tira essa escolha dele.

function normalizar(txt) {
  return String(txt || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Nome no padrao "Artista - Musica - Canal [id].ext".
function decompor(nomeArquivo) {
  const semExt = String(nomeArquivo).replace(/\.[^.]+$/, "");
  const mId = semExt.match(/\[([A-Za-z0-9_-]{11})\]\s*$/);
  const videoId = mId ? mId[1] : null;
  const base = semExt.replace(/\s*\[[A-Za-z0-9_-]{11}\]\s*$/, "").trim();
  const partes = base.split(" - ");
  return {
    artista: partes.length >= 3 ? partes[0].trim() : (partes[0] || "").trim(),
    musica:  partes.length >= 3 ? partes.slice(1, -1).join(" - ").trim() : (partes[1] || "").trim(),
    canal:   partes.length >= 3 ? partes[partes.length - 1].trim() : "",
    videoId,
    arquivo: nomeArquivo,
  };
}

// "Chitaozinho & Xororo" e "Chitaozinho e Xororo" sao o mesmo artista, mas o
// "&" some na normalizacao e o "e" fica: comparar texto exato falharia. Compara
// por sobreposicao das palavras que importam.
const LIGACOES = new Set(["e", "and", "feat", "ft", "com", "the", "de", "da", "do"]);

function palavrasChave(txt) {
  return normalizar(txt).split(" ").filter(p => p.length > 2 && !LIGACOES.has(p));
}

function mesmoArtista(a, b) {
  const pa = palavrasChave(a), pb = palavrasChave(b);
  if (!pa.length || !pb.length) return true;
  const menor = pa.length <= pb.length ? pa : pb;
  const maior = new Set(pa.length <= pb.length ? pb : pa);
  const comuns = menor.filter(p => maior.has(p)).length;
  return comuns / menor.length >= 0.7;
}

// Ruido que o titulo do YouTube carrega e que nao faz parte do nome da musica.
const RE_RUIDO_MUSICA = /\s*[\[(](?:[^\])]*(?:karaoke|karaoke|playback|instrumental|official|video|lyrics?|hd|4k|remaster)[^\])]*)[\])]/gi;

// Pedidos antigos foram gravados com o titulo inteiro do YouTube na musica e o
// canal no artista ("Satellites - JustusVidyo" / "Periphery"). Escolher "o
// pedaco maior" nao resolve: em "Satellites - JustusVidyo" o canal e mais
// longo que a musica. Comparamos TODOS os pedacos dos dois lados — se algum
// casar, e a mesma musica.
function pedacos(txt) {
  const limpo = String(txt || "").replace(RE_RUIDO_MUSICA, " ");
  const partes = limpo.split(/\s+-\s+/).map(x => normalizar(x)).filter(Boolean);
  const inteiro = normalizar(limpo);
  return [...new Set([inteiro, ...partes])].filter(x => x.length > 2);
}

function casaPedaco(a, b) {
  if (a === b) return true;
  const pa = a.split(" ").filter(x => x.length > 2);
  const pb = new Set(b.split(" ").filter(x => x.length > 2));
  if (!pa.length || !pb.size) return false;
  const comuns = pa.filter(x => pb.has(x)).length;
  return comuns === Math.min(pa.length, pb.size);
}

function mesmaMusica(a, b) {
  const pa = pedacos(a), pb = pedacos(b);
  return pa.some(x => pb.some(y => casaPedaco(x, y)));
}

function versoesLocais(arquivos, pedido) {
  if (!Array.isArray(arquivos) || !pedido) return [];
  const musica  = normalizar(pedido.musica);
  const artista = normalizar(pedido.artista);
  if (!musica) return [];

  const porMusica = arquivos.map(decompor).filter(v => mesmaMusica(v.musica, pedido.musica));
  if (porMusica.length <= 1) return porMusica;

  // O artista serve para DESEMPATAR, nao para barrar. Nos pedidos antigos ele
  // pode ser o canal ("_luizgnz"), e usar isso como filtro descartava a musica
  // certa. Com varias versoes, o artista escolhe entre elas; se nenhuma casar,
  // devolve todas e o KJ decide.
  if (!artista || artista === "desconhecido") return porMusica;
  const doArtista = porMusica.filter(v =>
    mesmoArtista(v.artista, pedido.artista) || mesmoArtista(v.canal, pedido.artista));
  return doArtista.length ? doArtista : porMusica;
}

module.exports = { versoesLocais, decompor, normalizar, mesmoArtista, mesmaMusica, pedacos };
