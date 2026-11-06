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

// ── O canal de karaoke ───────────────────────────────────
// O acervo guarda o nome do canal colado no nome da musica. Do diario de
// 06/11: {"musica": "Highway To Hell - Karaoke Master", "artista": "ACDC"}. Era
// esse texto que ia inteiro para o iTunes, e perguntar
// "ACDC Highway To Hell - Karaoke Master" devolve a compilacao do canal — cuja
// capa e a arte do canal. Foi o que ele viu em duas do Blink 182.
//
// `semCanal` (identificacao.js) nao serve aqui: precisa saber o nome do canal,
// que so se conhece na hora do download. Aqui a regra e pelo conteudo.
const RE_KARAOKE = /karaok|karafun|playback|instrumental|vocal hero|sing king|party tyme|stingray|backing track|multitrack|minus one|sem voz/i;

// Tira do FIM do titulo os trechos que falam de karaoke, e os parenteses do
// tipo "(Karaoke Version)". So do fim, e so o que casa: "Love Me Do -
// Remastered 2009" fica inteiro.
function tituloLimpo(musica) {
  let t = String(musica === 0 || musica ? musica : "").trim();
  if (!t) return "";
  const original = t;
  // Marcador de desempate de arquivo com nome igual: "[a1b2c3]" no fim. O app
  // do cantor ja o tirava antes de montar a chave (limparNome) e a Gerencia
  // nao — a chave divergia nas musicas duplicadas. Agora sai aqui, para os dois
  // lados concordarem.
  t = t.replace(/\s*-?\s*\[[0-9a-f]{6}\]\s*$/i, "").trim();
  t = t.replace(/[([][^)\]]*[)\]]/g, m => (RE_KARAOKE.test(m) ? " " : m));
  const partes = t.split(/\s+[-–—]\s+/);
  while (partes.length > 1 && RE_KARAOKE.test(partes[partes.length - 1])) partes.pop();
  const limpo = partes.join(" - ").replace(/\s{2,}/g, " ").trim();
  // Titulo que era SO o nome do canal: perguntar algo torto e melhor que
  // perguntar nada.
  return limpo || original;
}

// Resultado do iTunes que e karaoke, e nao o album. O pedido dele, textual:
// "eu quero a foto do album da musica. Nunca" a do canal — entao isto nao
// desempata, elimina.
function ehDeKaraoke(r) {
  if (!r || typeof r !== "object") return false;
  return [r.artistName, r.collectionName, r.trackName]
    .some(c => typeof c === "string" && RE_KARAOKE.test(c));
}

// O termo da consulta num lugar so, para a Gerencia e o celular perguntarem a
// mesma coisa.
function termoDaCapa(artista, musica) {
  return [String(artista || "").trim(), tituloLimpo(musica)].filter(Boolean).join(" ");
}

const comArte = lista => (Array.isArray(lista) ? lista : [])
  .filter(r => r && typeof r.artworkUrl100 === "string" && r.artworkUrl100)
  .filter(r => !ehDeKaraoke(r));

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
  // Limpo, senao nunca ha casamento exato: o iTunes devolve "Broken" e o
  // acervo pede "Broken - PARTY TYME KARAOKE CHANNEL".
  const alvo = limpar(tituloLimpo(musica));
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

// Versao da regra que produziu a imagem. Sobe quando a BUSCA muda, para que o
// que foi gravado pela regra velha seja buscado de novo uma vez. A 2 marca o
// conserto de 06/11: titulo sem o canal de karaoke e recusa de compilacao de
// karaoke.
const REGRA_IMAGEM = 2;

// Vale pedir imagem para este documento? Documento ausente ou sem `img`, sim.
// Marcado como `semArte`, nao: artista que o iTunes nao tem seria consultado a
// cada abertura do acervo, centenas de vezes por noite, para nada.
// E qualquer documento de regra anterior, sim: a arte dele saiu de uma consulta
// que hoje se sabe errada.
function precisaDeImagem(doc) {
  if (!doc || typeof doc !== "object") return true;
  if (Number(doc.regra || 0) < REGRA_IMAGEM) return true;
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
// O titulo vai limpo: as cinco versoes de karaoke de "Broken" dividem uma capa
// so, e a Gerencia, o celular e a chamada do Palco se encontram sem cada um ter
// de lembrar de limpar o texto.
const chaveDaCapa = (artista, musica) => slugDoNome(artista) + "__" + slugDoNome(tituloLimpo(musica));

const api = {
  escolherArteDeArtista, escolherArteDeMusica, urlDaArteEm,
  precisaDeImagem, tamanhoDoDataUrl, imagemCabe,
  slugDoNome, chaveDoArtista, chaveDaCapa,
  tituloLimpo, ehDeKaraoke, termoDaCapa, REGRA_IMAGEM,
  LIMITE_IMAGEM_BYTES, LADO_PADRAO,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlyImagens = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
