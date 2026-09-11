"use strict";

// Texto e enderecos que vem de fora (nome do cantor, foto, titulo do YouTube)
// entram em HTML nas telas. A revisao de seguranca de 11/09 mostrou que uma
// foto com aspas fechava o atributo e executava codigo na Gerencia — que tem
// acesso a apagar arquivos e rodar o yt-dlp.

const test = require("node:test");
const assert = require("node:assert");
const { escaparHtml, urlDeImagem } = require("../src/seguro");

test("escapa os cinco caracteres que mudam o sentido do HTML", () => {
  assert.strictEqual(escaparHtml(`<b>"Tom" & 'Jerry'</b>`),
    "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
});

test("aspas escapadas: o nome não fecha o atributo nem o onclick", () => {
  const nome = `',x);alert(1);//`;
  assert.ok(!escaparHtml(nome).includes("'"));
  const foto = `x" onerror="alert(1)`;
  assert.ok(!escaparHtml(foto).includes('"'));
});

test("nulo e número viram texto sem quebrar", () => {
  assert.strictEqual(escaparHtml(null), "");
  assert.strictEqual(escaparHtml(undefined), "");
  assert.strictEqual(escaparHtml(42), "42");
});

test("foto do Google passa como está", () => {
  const u = "https://lh3.googleusercontent.com/a/ACg8ocK-abc_123=s96-c";
  assert.strictEqual(urlDeImagem(u), u);
});

test("foto servida pelo Voxly na rede local passa", () => {
  assert.strictEqual(urlDeImagem("http://127.0.0.1:7432/foto?nome=Leo%20Emo"), "http://127.0.0.1:7432/foto?nome=Leo%20Emo");
});

test("imagem embutida (data:) de tipo de imagem passa", () => {
  const u = "data:image/png;base64,iVBORw0KGgo=";
  assert.strictEqual(urlDeImagem(u), u);
});

test("endereço com aspas, parêntese ou espaço é recusado (fecharia o atributo ou o url() do CSS)", () => {
  assert.strictEqual(urlDeImagem(`https://x.com/a.png" onerror="alert(1)`), null);
  assert.strictEqual(urlDeImagem(`https://x.com/a.png') } body { background: red`), null);
  assert.strictEqual(urlDeImagem("https://x.com/a b.png"), null);
});

test("javascript:, file: e data: que não é imagem são recusados", () => {
  assert.strictEqual(urlDeImagem("javascript:alert(1)"), null);
  assert.strictEqual(urlDeImagem("file:///etc/passwd"), null);
  assert.strictEqual(urlDeImagem("data:text/html;base64,PHNjcmlwdD4="), null);
});

test("vazio e lixo viram nulo", () => {
  assert.strictEqual(urlDeImagem(""), null);
  assert.strictEqual(urlDeImagem(null), null);
  assert.strictEqual(urlDeImagem({ toString: () => "https://x.com/a.png" }), null);
});
