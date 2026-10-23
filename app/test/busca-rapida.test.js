"use strict";

// Busca de karaokê pela página de resultados do YouTube, sem yt-dlp.
//
// Medido no show de 22/10: o `ytsearch12` do yt-dlp levou 162 s e subiu 8
// processos para UMA busca; a página de resultados por HTTP responde em menos
// de 1 s. Durante o show o KJ ficou no sufoco esperando a busca do app, e a
// próxima cantora só teve música porque a busca foi feita por fora.
//
// A escolha do candidato é a parte perigosa: errar aqui põe a música errada no
// palco, na frente da casa. Na mesma noite eu peguei "o primeiro que diz
// karaoke" e baixei um canal genérico de anime em vez da música pedida. A
// regra agora é dura: SÓ vale candidato cujo título tenha TODAS as palavras
// significativas da música pedida. Sem isso, devolve nada e quem chamou
// decide — igual ao viés do casamento.js: na dúvida, NÃO achar.

const test = require("node:test");
const assert = require("node:assert");
const { extrairCandidatos, escolherCandidato, nomeDeArquivo } = require("../src/busca-rapida");

// ── Ler a página de resultados ────────────────────────────────────────────
// O título do vídeo e o nome do canal são campos diferentes e DISTANTES um do
// outro no JSON da página: entre o videoId e o título vem o bloco de
// miniaturas, com URLs que passam de 400 caracteres. Emparelhar "o videoId com
// o próximo texto" pegava o nome do CANAL — foi assim que eu concluí, no show
// de 22/10, que não existia karaokê de "O Cantor e o Taxista" do Fresno quando
// existia um instrumental: os candidatos chegavam aqui como "Karaoke Anime" e
// "KARAOKE UtaCchaO", nomes de canal, e a comparação com o nome da música
// nunca tinha chance.

// Monta uma página como a que o YouTube serve, com o JSON embutido.
function paginaDeResultados(itens) {
  const conteudo = itens.map(it => {
    if (it.canalRenderer) return { channelRenderer: { channelId: "UC123", title: { simpleText: it.canalRenderer } } };
    return {
      videoRenderer: {
        videoId: it.id,
        // Miniatura com URL longa: é ela que separa o id do título.
        thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/" + it.id + "/hq720.jpg?sqp=" + "x".repeat(420), width: 360, height: 202 }] },
        title: { runs: [{ text: it.titulo }], accessibility: { accessibilityData: { label: it.titulo + " 4 minutos" } } },
        ownerText: { runs: [{ text: it.canal }] },
        lengthText: { simpleText: "4:02" },
      },
    };
  });
  return `<html><script>var ytInitialData = ${JSON.stringify({
    contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: {
      contents: [{ itemSectionRenderer: { contents: conteudo } }] } } } },
  })};</script></html>`;
}

test("le o TITULO do video, nao o nome do canal", () => {
  const html = paginaDeResultados([
    { id: "hzHySxXnSXU", titulo: "Fresno - O Cantor e o Taxista (instrumental)", canal: "Adeeh" },
  ]);
  const c = extrairCandidatos(html);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].id, "hzHySxXnSXU");
  assert.strictEqual(c[0].titulo, "Fresno - O Cantor e o Taxista (instrumental)");
  assert.strictEqual(c[0].canal, "Adeeh", "o canal tambem vem, para a tela mostrar de quem e");
});

test("titulo partido em varios pedacos vem inteiro", () => {
  // O YouTube quebra o titulo em "runs" quando ha realce da busca.
  const html = `<script>var ytInitialData = ${JSON.stringify({
    contents: [{ videoRenderer: { videoId: "aaaaaaaaaaa",
      title: { runs: [{ text: "Haruka " }, { text: "Kanata" }, { text: " (Karaoke)" }] },
      ownerText: { runs: [{ text: "Canal X" }] } } }],
  })};</script>`;
  assert.strictEqual(extrairCandidatos(html)[0].titulo, "Haruka Kanata (Karaoke)");
});

test("id repetido entra uma vez so", () => {
  const html = paginaDeResultados([
    { id: "gzCuqSOY4aM", titulo: "Haruka Kanata (Karaoke)", canal: "Um" },
    { id: "gzCuqSOY4aM", titulo: "o mesmo video de novo", canal: "Dois" },
  ]);
  assert.strictEqual(extrairCandidatos(html).length, 1);
});

test("canal e playlist nos resultados nao entram como candidato", () => {
  const html = paginaDeResultados([
    { canalRenderer: "Karaoke Anime" },
    { id: "bbbbbbbbbbb", titulo: "Sobakasu (Karaoke)", canal: "Anime Karaoke HQ" },
  ]);
  const c = extrairCandidatos(html);
  assert.strictEqual(c.length, 1, "so videoRenderer e candidato");
  assert.strictEqual(c[0].titulo, "Sobakasu (Karaoke)");
});

// Falhar devolvendo vazio e melhor que adivinhar: quem chama avisa "nao achei"
// e o KJ decide, em vez de baixar o palpite errado.
test("pagina que nao tem o JSON esperado devolve vazio", () => {
  for (const ruim of ["", "<html>sem nada</html>", null, undefined, "var ytInitialData = {quebrado"]) {
    assert.deepStrictEqual(extrairCandidatos(ruim), [], `devia devolver vazio: ${String(ruim).slice(0, 30)}`);
  }
});

// ── Escolher o candidato ──────────────────────────────────────────────────
const PEDIDO = { musica: "Haruka Kanata", artista: "Asian Kung-Fu Generation" };
const CANDS = [
  { id: "aaaaaaaaaaa", titulo: "Karaoke Anime" },
  { id: "bbbbbbbbbbb", titulo: "Haruka Kanata – ASIAN KUNG-FU GENERATION (Romaji Karaoke)" },
  { id: "ccccccccccc", titulo: "Haruka Kanata (Instrumental)" },
];

test("escolhe quem tem a musica E o artista no titulo", () => {
  assert.strictEqual(escolherCandidato(CANDS, PEDIDO).id, "bbbbbbbbbbb");
});

// Este e o erro que eu cometi no show: "Karaoke Anime" diz karaoke, entao
// passava, e a musica pedida nem aparecia no titulo.
test("canal generico que nao tem a musica no titulo NUNCA e escolhido", () => {
  const so = [{ id: "aaaaaaaaaaa", titulo: "Karaoke Anime" },
              { id: "ddddddddddd", titulo: "KARAOKE UtaCchaO" }];
  assert.strictEqual(escolherCandidato(so, PEDIDO), null);
});

test("sem o artista no titulo ainda vale, se a musica inteira estiver la", () => {
  const so = [{ id: "ccccccccccc", titulo: "Haruka Kanata (Instrumental)" }];
  assert.strictEqual(escolherCandidato(so, PEDIDO).id, "ccccccccccc");
});

test("titulo sem marca de karaoke nao entra: e a gravacao original", () => {
  const so = [{ id: "eeeeeeeeeee", titulo: "Haruka Kanata - ASIAN KUNG-FU GENERATION (Official Video)" }];
  assert.strictEqual(escolherCandidato(so, PEDIDO), null);
});

test("playback e instrumental contam como karaoke", () => {
  for (const t of ["Haruka Kanata playback", "Haruka Kanata instrumental", "Haruka Kanata KARAOKÊ"]) {
    assert.ok(escolherCandidato([{ id: "fffffffffff", titulo: t }], PEDIDO), `recusou: ${t}`);
  }
});

// Pedido antigo traz o titulo inteiro do YouTube; exigir todas as palavras dele
// nao acharia nada. O ruido entre parenteses/colchetes sai antes de comparar.
test("ruido do titulo do pedido nao impede o encontro", () => {
  const pedido = { musica: 'Haruka Kanata (From "Naruto") [Opening Version]', artista: "mu-ray" };
  assert.strictEqual(escolherCandidato(CANDS, pedido).id, "bbbbbbbbbbb");
});

test("acento e caixa nao atrapalham", () => {
  const cands = [{ id: "ggggggggggg", titulo: "NAO DEIXE O SAMBA MORRER - Karaoke" }];
  assert.ok(escolherCandidato(cands, { musica: "Não Deixe o Samba Morrer", artista: "Alcione" }));
});

test("sem musica no pedido nao escolhe nada", () => {
  assert.strictEqual(escolherCandidato(CANDS, { musica: "", artista: "x" }), null);
  assert.strictEqual(escolherCandidato([], PEDIDO), null);
  assert.strictEqual(escolherCandidato(null, null), null);
});

// ── Nome do arquivo ───────────────────────────────────────────────────────
// Tem de sair no padrao que o acervo casa: "Artista - Musica - Canal [id].ext".
test("monta o nome no padrao do acervo", () => {
  assert.strictEqual(
    nomeDeArquivo({ artista: "The Fray", musica: "Never Say Never", canal: "King Of Karaoke", id: "J7vNeCwhvK4" }),
    "The Fray - Never Say Never - King Of Karaoke [J7vNeCwhvK4]");
});

test("barra e dois-pontos no nome nao viram pasta nem quebram o arquivo", () => {
  const n = nomeDeArquivo({ artista: "AC/DC", musica: "Highway: to Hell", canal: 'Karaokê "X"', id: "aaaaaaaaaaa" });
  assert.doesNotMatch(n, /[\/:"]/);
  assert.match(n, /\[aaaaaaaaaaa\]$/, "o id fica no fim: e por ele que o app acha o arquivo");
});

test("sem canal, o nome sai com dois pedacos e o id", () => {
  assert.strictEqual(
    nomeDeArquivo({ artista: "Pitty", musica: "Na Sua Estante", id: "zFiXXhxXtLs" }),
    "Pitty - Na Sua Estante [zFiXXhxXtLs]");
});
