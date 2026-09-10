"use strict";

// Qual arquivo da pasta e o que ACABOU de ser baixado.
//
// O codigo antigo pegava "o mais recente da pasta", sem verificar se tinha
// alguma relacao com este download. Quando o yt-dlp falhava ou a linha de
// saida nao era reconhecida, ele agarrava um arquivo alheio, renomeava para o
// artista pedido e registrava no banco: pediram Silverchair, tocou Sleep
// Token — e o Sleep Token original sumiu, renomeado.
//
// Errar aqui destroi DOIS pedidos e falsifica o acervo. Na duvida, falhar.

const test = require("node:test");
const assert = require("node:assert");
const { escolherArquivoBaixado } = require("../src/baixado");

const INICIO = 1_000_000;

test("arquivo que ja estava na pasta nao e o download", () => {
  const antigos = [
    { nome: "Sleep Token - The Summoning [aaaaaaaaaaa].mp4", mtimeMs: INICIO - 5000 },
    { nome: "Outra Coisa [bbbbbbbbbbb].mp4",                 mtimeMs: INICIO - 90000 },
  ];
  assert.strictEqual(escolherArquivoBaixado(antigos, { inicioMs: INICIO }), null,
    "nenhum e novo: melhor falhar que sequestrar o arquivo de outro pedido");
});

test("pega o que apareceu depois do inicio", () => {
  const arquivos = [
    { nome: "Sleep Token - The Summoning [aaaaaaaaaaa].mp4", mtimeMs: INICIO - 5000 },
    { nome: "Silverchair - Miss You Love.mp4",               mtimeMs: INICIO + 4000 },
  ];
  assert.strictEqual(escolherArquivoBaixado(arquivos, { inicioMs: INICIO }),
    "Silverchair - Miss You Love.mp4");
});

test("com id do video, ele decide — mesmo nao sendo o mais recente", () => {
  const arquivos = [
    { nome: "Outro Download [zzzzzzzzzzz].mp4",     mtimeMs: INICIO + 9000 },
    { nome: "Miss You Love [vUeykEWXZXY].mp4",      mtimeMs: INICIO + 2000 },
  ];
  assert.strictEqual(
    escolherArquivoBaixado(arquivos, { inicioMs: INICIO, idVideo: "vUeykEWXZXY" }),
    "Miss You Love [vUeykEWXZXY].mp4");
});

test("o id vale mesmo para arquivo anterior ao inicio", () => {
  // yt-dlp pode reaproveitar um arquivo ja completo; se o id bate, e ele mesmo.
  const arquivos = [{ nome: "Miss You Love [vUeykEWXZXY].mp4", mtimeMs: INICIO - 60000 }];
  assert.strictEqual(
    escolherArquivoBaixado(arquivos, { inicioMs: INICIO, idVideo: "vUeykEWXZXY" }),
    "Miss You Love [vUeykEWXZXY].mp4");
});

test("id que nao existe na pasta nao autoriza pegar outro", () => {
  const arquivos = [{ nome: "Sleep Token [aaaaaaaaaaa].mp4", mtimeMs: INICIO - 5000 }];
  assert.strictEqual(
    escolherArquivoBaixado(arquivos, { inicioMs: INICIO, idVideo: "vUeykEWXZXY" }), null);
});

test("entre varios novos, o mais recente", () => {
  const arquivos = [
    { nome: "a.mp4", mtimeMs: INICIO + 1000 },
    { nome: "b.mp4", mtimeMs: INICIO + 8000 },
  ];
  assert.strictEqual(escolherArquivoBaixado(arquivos, { inicioMs: INICIO }), "b.mp4");
});

test("pasta vazia devolve null", () => {
  assert.strictEqual(escolherArquivoBaixado([], { inicioMs: INICIO }), null);
  assert.strictEqual(escolherArquivoBaixado(null, { inicioMs: INICIO }), null);
});

// ── id do video a partir da URL ──────────────────────────────────────────
// Sem o id no nome do arquivo, "qual foi o que eu acabei de baixar" so podia
// ser respondido por horario — e foi por isso que um arquivo alheio entrou no
// lugar. A URL sempre tem o id; o template de saida passa a carrega-lo.
const { idDaUrl } = require("../src/baixado");

test("tira o id das formas de URL do YouTube", () => {
  assert.strictEqual(idDaUrl("https://www.youtube.com/watch?v=vUeykEWXZXY"), "vUeykEWXZXY");
  assert.strictEqual(idDaUrl("https://youtu.be/vUeykEWXZXY"), "vUeykEWXZXY");
  assert.strictEqual(idDaUrl("https://www.youtube.com/watch?v=vUeykEWXZXY&list=PL123"), "vUeykEWXZXY");
  assert.strictEqual(idDaUrl("https://m.youtube.com/watch?app=desktop&v=vUeykEWXZXY"), "vUeykEWXZXY");
  assert.strictEqual(idDaUrl("https://www.youtube.com/shorts/vUeykEWXZXY"), "vUeykEWXZXY");
});

test("URL sem id nao inventa", () => {
  assert.strictEqual(idDaUrl("https://www.youtube.com/results?search_query=drown"), null);
  assert.strictEqual(idDaUrl(""), null);
  assert.strictEqual(idDaUrl(null), null);
});
