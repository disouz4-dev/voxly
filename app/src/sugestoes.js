"use strict";

// Sugestoes de musicas que ainda nao estao no acervo (iTunes, com o Deezer de
// reserva). As fontes devolvem tudo que lembra o termo: versoes ao vivo,
// remixes, covers, a mesma faixa em dez coletaneas. Aqui a lista e filtrada e
// reduzida a uma entrada por musica — igual na Gerencia e no app do cantor,
// para artista e titulo sairem escritos do mesmo jeito dos dois lados e o
// rename do download bater.

(function (raiz) {

const { normalizar, palavras } = (typeof module !== "undefined" && module.exports)
  ? require("./texto") : raiz.VoxlyTexto;

const RE_VERSAO_INDESEJADA =
  /\b(ao vivo|live|ac[ou]?ustic\w*|unplugged|remix\w*|remaster\w*|karaoke|instrumental|cover|tribute|made famous|originally performed|sped up|slowed|8d|nightcore|demo|edit)\b|\(.*(?:ao vivo|live|remix|acoustic|version|feat|part).*\)/i;

// `resultados` no formato do iTunes ({ artistName, trackName }); o Deezer e
// convertido para ele antes de chegar aqui.
function filtrarSugestoes(termo, resultados, { limite = 5 } = {}) {
  // Todas as palavras digitadas tem que aparecer entre artista e musica: sem
  // isso "scarlet periphery" casava com qualquer musica que tivesse "scarlet".
  // Palavras curtas nao filtram — "u2" e "of" derrubariam buscas boas.
  const exigidas = palavras(termo).filter(p => p.length > 2);
  const vistos = new Set();
  const itens = [];

  for (const t of Array.isArray(resultados) ? resultados : []) {
    if (!t || typeof t !== "object") continue;
    const musica  = String(t.trackName  || "").trim();
    const artista = String(t.artistName || "").trim();
    if (!musica || RE_VERSAO_INDESEJADA.test(musica)) continue;

    const alvo = normalizar(artista + " " + musica);
    if (exigidas.length && !exigidas.every(p => alvo.includes(p))) continue;

    const chave = normalizar(artista) + "|" + normalizar(musica);
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    itens.push({ artista, musica });
    if (itens.length >= limite) break;
  }
  return itens;
}

const api = { filtrarSugestoes, RE_VERSAO_INDESEJADA };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else raiz.VoxlySugestoes = api;

})(globalThis);
