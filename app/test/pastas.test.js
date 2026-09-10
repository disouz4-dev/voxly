"use strict";

// Instalacao nova nao tem pasta de musicas configurada, e ate agora nada
// preenchia essa lacuna: o download saia com `pasta: undefined` e estourava
// longe dali. No Linux o sintoma foi "ENOENT scandir", vindo do readdirSync
// que roda DEPOIS do yt-dlp para achar o arquivo baixado — ou seja, a
// mensagem que o KJ via nao tinha relacao com a causa.

const test = require("node:test");
const assert = require("node:assert");
const { pastaDeDownload } = require("../src/pastas");

const PADRAO = "/home/kj/Music/Voxly";

test("usa a pasta que o pedido trouxe", () => {
  assert.strictEqual(
    pastaDeDownload({ pedida: "/mnt/hd/Karaoke", configurada: "/outra", padrao: PADRAO }),
    "/mnt/hd/Karaoke");
});

test("sem pedido, usa a que o KJ configurou", () => {
  assert.strictEqual(
    pastaDeDownload({ pedida: undefined, configurada: "/mnt/hd/Karaoke", padrao: PADRAO }),
    "/mnt/hd/Karaoke");
});

test("instalacao nova cai no padrao, nunca em undefined", () => {
  assert.strictEqual(pastaDeDownload({ padrao: PADRAO }), PADRAO);
  assert.strictEqual(
    pastaDeDownload({ pedida: null, configurada: null, padrao: PADRAO }), PADRAO);
});

test("string vazia ou so espaco nao conta como pasta", () => {
  assert.strictEqual(pastaDeDownload({ pedida: "", configurada: "   ", padrao: PADRAO }), PADRAO);
});

test("sem nem padrao, avisa em vez de devolver undefined", () => {
  assert.throws(() => pastaDeDownload({}), /pasta de m[uú]sicas/i,
    "o erro tem que falar da pasta, nao estourar num scandir la na frente");
});

// O mesmo HD externo monta em caminhos diferentes: no macOS "/Volumes/M2
// portable", no Linux "/media/<user>/M2 portable". Levando a configuracao de
// um para o outro, a pasta gravada aponta para um caminho que nao existe.
// Cair calado na pasta padrao seria pior que falhar: baixaria para o disco
// interno e o KJ so descobriria com o show rolando.

const MAC   = "/Volumes/M2 portable/Karaoke";
const LINUX = "/media/diego/M2 portable/Karaoke";
const existe = p => p === LINUX || p === PADRAO;

test("pasta configurada que sumiu: avisa, nao troca de disco calado", () => {
  assert.throws(
    () => pastaDeDownload({ configurada: MAC, padrao: PADRAO, existe }),
    /M2 portable/,
    "o erro tem que nomear o caminho que sumiu");
  assert.throws(
    () => pastaDeDownload({ configurada: MAC, padrao: PADRAO, existe }),
    /Biblioteca/i,
    "e dizer onde reapontar");
});

test("pasta configurada que existe segue sendo usada", () => {
  assert.strictEqual(pastaDeDownload({ configurada: LINUX, padrao: PADRAO, existe }), LINUX);
});

test("nada configurado: usa o padrao mesmo que ainda nao exista", () => {
  const nadaExiste = () => false;
  assert.strictEqual(pastaDeDownload({ padrao: PADRAO, existe: nadaExiste }), PADRAO);
});
