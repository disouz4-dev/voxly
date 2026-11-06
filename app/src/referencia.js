"use strict";

// Escolher a GRAVACAO ORIGINAL contra a qual a versao de karaoke e comparada.
//
// Defeito achado por ele de ouvido em 06/11/2026: "alice in chains veio uma
// versao com violinos e a de comparacao com instrumental rock". O iTunes havia
// devolvido "Man in the Box" do Vitamin String Quartet — um quarteto de cordas
// — e a nota saiu 85 comparando karaoke de rock contra violinos. Nao valia
// nada, e parecia uma medida.
//
// A causa era minha: eu casava o nome da MUSICA e nunca o do ARTISTA.
//
// A regra agora: sem artista batendo, nao ha original; e sem original, nao ha
// nota. Dois itens de 26 estavam contaminados assim. Ficar sem selo e um
// aborrecimento; dar selo errado destroi a confianca no selo inteiro — e um
// selo em que o KJ nao confia nao serve para nada.

const RE_KARAOKE = /karaok|karafun|playback|instrumental|vocal hero|sing king|party tyme|stingray|backing track|multitrack|minus one|sem voz/i;

// Marcas de que a faixa NAO e a gravacao original da banda, ainda que o nome do
// artista bata ou que a busca a traga em primeiro lugar.
const RE_ALTERNATIVA = /\b(tribute|tributo|cover|string quartet|quarteto de cordas|made popular by|as made famous by|in the style of|originally performed|instrumental|karaoke|karaok[eê])\b/i;

function limpar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

// Palavras que, colocadas em volta do nome de uma banda, indicam OUTRO artista
// tocando o repertorio dela: "Journey Tribute Band", "Singles Plays Pearl Jam",
// "Vitamin String Quartet".
//
// `band` ficou FORA de proposito: ha banda de verdade chamada assim ("Dave
// Matthews Band"), e barrar isso criaria falso negativo em artista legitimo.
// "Journey Tribute Band" ja e pego pelo "tribute".
const RE_OUTRO_ARTISTA = /\b(tribute|tributo|cover|covers|plays|performs|quartet|quarteto|orchestra|orquestra|allstars|all stars|karaoke|karaok[eê])\b/i;

// O artista do acervo e o do iTunes sao o mesmo?
//
// Igualdade depois de tirar acento, caixa e pontuacao resolve "AC/DC" contra
// "ACDC" e "Legião Urbana" contra "Legiao Urbana". Conter tambem vale, para
// creditos extras ("Seether feat. Amy Lee") — mas NAO quando o texto a mais
// anuncia outro artista tocando o repertorio, senao "Journey Tribute Band"
// passaria por Journey.
function casaArtista(doAcervo, doItunes) {
  const a = limpar(doAcervo), b = limpar(doItunes);
  if (!a || !b) return false;
  if (a === b) return true;

  if (!a.includes(b) && !b.includes(a)) return false;

  // Um nome contem o outro. Decide quem ANUNCIA outro artista: se so um dos
  // dois tem a marca, nao sao o mesmo artista ("Adele" contra "Adele
  // Tribute"). Se nenhum tem, e credito extra legitimo ("Seether" contra
  // "Seether feat. Amy Lee").
  return RE_OUTRO_ARTISTA.test(String(doAcervo)) === RE_OUTRO_ARTISTA.test(String(doItunes));
}

// O titulo anuncia uma versao que nao serve de referencia?
function ehVersaoAlternativa(titulo) {
  return RE_ALTERNATIVA.test(String(titulo || ""));
}

function ehDeKaraoke(r) {
  if (!r || typeof r !== "object") return false;
  return [r.artistName, r.collectionName, r.trackName]
    .some(c => typeof c === "string" && RE_KARAOKE.test(c));
}

// Tira do titulo do acervo o canal de karaoke colado no fim, para comparar com
// o titulo do iTunes. A mesma limpeza vive em imagens.js (`tituloLimpo`); aqui
// basta a versao curta, porque o que se faz com ela e so casar texto.
function soOTitulo(musica) {
  const partes = String(musica || "").split(/\s+[-–—]\s+/);
  while (partes.length > 1 && RE_KARAOKE.test(partes[partes.length - 1])) partes.pop();
  return partes.join(" - ");
}

// Escolhe, entre os resultados do iTunes, a faixa que serve de original.
// Devolve null quando nenhuma serve — e e o caso importante: sem original, quem
// chama nao calcula nota nenhuma.
function escolherOriginal(resultados, { artista, musica } = {}) {
  if (!Array.isArray(resultados) || !artista) return null;
  const uteis = resultados.filter(r =>
    r && typeof r === "object"
    && typeof r.previewUrl === "string" && r.previewUrl
    && !ehDeKaraoke(r)
    && !ehVersaoAlternativa(r.trackName)
    && casaArtista(artista, r.artistName));
  if (!uteis.length) return null;

  const alvo = limpar(soOTitulo(musica));
  return uteis.find(r => limpar(r.trackName) === alvo)
      || uteis.find(r => limpar(r.trackName).includes(alvo) && alvo)
      || uteis[0];
}

module.exports = { casaArtista, ehVersaoAlternativa, escolherOriginal, soOTitulo, ehDeKaraoke };
