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
const HTML = `lixo{"videoId":"gzCuqSOY4aM","x":1,"text":"Haruka Kanata – ASIAN KUNG-FU GENERATION (Romaji Karaoke)"}
  mais lixo {"videoId":"Vn4CCoTW0QM","text":"Karaoke Anime"}
  {"videoId":"gzCuqSOY4aM","text":"repetido, nao conta"}`;

test("tira id e titulo da pagina de resultados", () => {
  const c = extrairCandidatos(HTML);
  assert.strictEqual(c.length, 2, "o id repetido entra uma vez so");
  assert.deepStrictEqual(c[0], { id: "gzCuqSOY4aM", titulo: "Haruka Kanata – ASIAN KUNG-FU GENERATION (Romaji Karaoke)" });
  assert.strictEqual(c[1].id, "Vn4CCoTW0QM");
});

test("pagina sem resultado nao quebra", () => {
  for (const vazio of ["", "<html></html>", null, undefined]) {
    assert.deepStrictEqual(extrairCandidatos(vazio), []);
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
