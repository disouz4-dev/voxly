"use strict";

// As imagens do acervo: foto do artista e capa da musica.
//
// Decisao dele em 06/11: "a copia das imagens tem que ficar no Firebase, nao
// tem que nada ficar local". A imagem vai DENTRO do documento que ja existe
// (`artistas/{slug}`, `capas/{chave}`), pequena, em base64. O celular so le do
// banco: nenhuma chamada ao iTunes, nada no HD, nada no cache do aparelho.
//
// A escolha da arte no resultado do iTunes vivia copiada em dois lugares
// (main.js e profile.html) e era exatamente ali que o defeito morava: o
// parametro era `entity=musicArtist`, que NUNCA devolve `artworkUrl100` —
// medido em 06/11 com Pitty, Seether e Legiao Urbana, zero resultados com arte.
// A regra fica aqui, num lugar so.

(function (raiz) {

// Teto por imagem. O documento do Firestore cabe 1 MB e tem de sobrar folga
// para o resto do registro; 120px de JPEG da uns 10 KB, entao 64 KB e folga
// grande e ainda barra arte que veio em tamanho errado.
const LIMITE_IMAGEM_BYTES = 64 * 1024;
// Lado da imagem guardada. No acervo o circulo do artista tem 52px e o quadrado
// da capa 34px: 120 cobre tela retina sem pesar.
const LADO_PADRAO = 120;

function limpar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim();
}

const comArte = lista => (Array.isArray(lista) ? lista : [])
  .filter(r => r && typeof r.artworkUrl100 === "string" && r.artworkUrl100);

// A arte do artista: o resultado cujo nome casa, senao o primeiro que tem arte.
function escolherArteDeArtista(resultados, nome) {
  const lista = comArte(resultados);
  if (!lista.length) return null;
  const alvo = limpar(nome);
  const exato = lista.find(r => limpar(r.artistName) === alvo);
  return (exato || lista[0]).artworkUrl100;
}

// A capa da musica: titulo igual, depois titulo que contem o pedido ("Broken
// (feat. Amy Lee)" e o que o iTunes devolve para "Seether Broken"), depois o
// primeiro com arte.
function escolherArteDeMusica(resultados, musica) {
  const lista = comArte(resultados);
  if (!lista.length) return null;
  const alvo = limpar(musica);
  const exato = lista.find(r => limpar(r.trackName) === alvo);
  if (exato) return exato.artworkUrl100;
  const contem = alvo && lista.find(r => limpar(r.trackName).includes(alvo));
  return (contem || lista[0]).artworkUrl100;
}

// O iTunes codifica o tamanho na propria URL: .../100x100bb.jpg.
function urlDaArteEm(url, lado = LADO_PADRAO) {
  if (!url || typeof url !== "string") return url || null;
  const n = Number(lado) > 0 ? Math.round(Number(lado)) : LADO_PADRAO;
  return url.replace(/\/\d+x\d+bb\./, `/${n}x${n}bb.`);
}

// Vale pedir imagem para este documento? Documento ausente ou sem `img`, sim.
// Marcado como `semArte`, nao: artista que o iTunes nao tem seria consultado a
// cada abertura do acervo, centenas de vezes por noite, para nada.
function precisaDeImagem(doc) {
  if (!doc || typeof doc !== "object") return true;
  if (doc.img) return false;
  return !doc.semArte;
}

// Bytes de verdade do base64, nao o tamanho da string.
function tamanhoDoDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return 0;
  const i = dataUrl.indexOf("base64,");
  if (!dataUrl.startsWith("data:") || i < 0) return 0;
  const b64 = dataUrl.slice(i + 7);
  const enchimento = (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  return Math.max(0, Math.floor(b64.length * 3 / 4) - enchimento);
}

function imagemCabe(dataUrl, limite = LIMITE_IMAGEM_BYTES) {
  const n = tamanhoDoDataUrl(dataUrl);
  return n > 0 && n <= limite;
}

// ── As chaves dos documentos ──────────────────────────────
// Moram aqui porque sao usadas nos DOIS lados: a Gerencia grava e o app do
// cantor le. Enquanto estavam duplicadas, a do artista saia "seether__" de um
// lado e "seether" do outro — a Gerencia gravava num documento e o celular
// procurava em outro (pego no teste de 06/11).
function slugDoNome(texto) {
  return String(texto || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const chaveDoArtista = artista => slugDoNome(artista);
const chaveDaCapa = (artista, musica) => slugDoNome(artista) + "__" + slugDoNome(musica);

const api = {
  escolherArteDeArtista, escolherArteDeMusica, urlDaArteEm,
  precisaDeImagem, tamanhoDoDataUrl, imagemCabe,
  slugDoNome, chaveDoArtista, chaveDaCapa,
  LIMITE_IMAGEM_BYTES, LADO_PADRAO,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyImagens = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
