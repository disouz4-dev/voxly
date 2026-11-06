"use strict";

// As telas estão inteiras?
//
// Em 06/11 uma edição automática destruiu o `web/public/profile.html`: uma
// substituição com texto de origem vazio inseriu o trecho novo entre CADA
// caractere do arquivo, que foi de 180 KB para 482 MB e ficou sem nenhuma tag
// `<script>`. O arquivo foi commitado antes de alguém rodar os testes.
//
// O que pegou o estrago foi o `carga-execucao.test.js`, mas pelo caminho mais
// longo: ele reclamou de uma sentinela que não existia mais. Estes testes
// reclamam da causa, em milissegundos: tamanho fora de escala, tag de script
// que desapareceu, trecho repetido mil vezes.
//
// Não é paranoia de teste: a tela é um arquivo só, enorme, editado por busca e
// substituição, e um erro desses passa pelo lint (que só olha os módulos) e
// pelo `node --check` (que não roda em HTML).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.dirname(__dirname);            // app/
const PROJETO = path.dirname(RAIZ);              // raiz do repositório

const TELAS = [
  { arquivo: path.join(RAIZ, "src/screens/host.html"),    rotulo: "Gerência" },
  { arquivo: path.join(RAIZ, "src/screens/player.html"),  rotulo: "Palco" },
  { arquivo: path.join(PROJETO, "web/public/profile.html"), rotulo: "app do cantor" },
  { arquivo: path.join(PROJETO, "web/public/index.html"),   rotulo: "login do cantor" },
  { arquivo: path.join(PROJETO, "web/public/signup.html"),  rotulo: "cadastro do cantor" },
];

// Teto generoso: a maior tela hoje tem ~380 KB. O que se quer barrar é a ordem
// de grandeza errada (MB), não o crescimento normal.
const TETO_BYTES = 2 * 1024 * 1024;
const PISO_BYTES = 2 * 1024;

for (const { arquivo, rotulo } of TELAS) {
  test(`${rotulo}: o arquivo tem tamanho de tela, não de acidente`, () => {
    const st = fs.statSync(arquivo);
    assert.ok(st.size > PISO_BYTES, `${path.basename(arquivo)} tem ${st.size} bytes — ficou truncado`);
    assert.ok(st.size < TETO_BYTES,
      `${path.basename(arquivo)} tem ${(st.size / 1048576).toFixed(1)} MB — passou do teto de 2 MB. ` +
      `Foi assim que o profile.html chegou a 482 MB em 06/11.`);
  });

  test(`${rotulo}: as tags de script estão lá e fecham`, () => {
    const html = fs.readFileSync(arquivo, "utf8");
    const abre = (html.match(/<script[\s>]/g) || []).length;
    const fecha = (html.match(/<\/script>/g) || []).length;
    assert.ok(abre > 0, `${path.basename(arquivo)} não tem nenhuma tag <script>`);
    assert.strictEqual(abre, fecha,
      `${path.basename(arquivo)}: ${abre} <script> e ${fecha} </script> — tag perdida numa edição`);
  });

  test(`${rotulo}: fecha o html`, () => {
    const html = fs.readFileSync(arquivo, "utf8");
    assert.match(html.trimStart().slice(0, 200), /<!doctype html>/i,
      `${path.basename(arquivo)} não começa com <!doctype html>`);
    assert.match(html.trimEnd().slice(-40), /<\/html>/i,
      `${path.basename(arquivo)} não termina em </html> — ficou cortado`);
  });

  test(`${rotulo}: nenhum bloco de 200 caracteres repetido centenas de vezes`, () => {
    // A assinatura do acidente: o mesmo trecho inserido entre cada caractere.
    // Um HTML normal repete pedaços curtos (estilos, atributos), não blocos
    // longos centenas de vezes.
    const html = fs.readFileSync(arquivo, "utf8");
    const pedaco = 200;
    const contagem = new Map();
    for (let i = 0; i + pedaco <= html.length; i += pedaco) {
      const k = html.slice(i, i + pedaco);
      contagem.set(k, (contagem.get(k) || 0) + 1);
    }
    let pior = 0, trecho = "";
    for (const [k, n] of contagem) if (n > pior) { pior = n; trecho = k; }
    assert.ok(pior < 50,
      `${path.basename(arquivo)}: um bloco de 200 caracteres aparece ${pior} vezes — ` +
      `sinal de substituição em laço. Começa com: ${JSON.stringify(trecho.slice(0, 60))}`);
  });
}

test("as telas não ficaram com marcador de conflito de merge", () => {
  for (const { arquivo, rotulo } of TELAS) {
    const html = fs.readFileSync(arquivo, "utf8");
    for (const marca of ["<<<<<<<", ">>>>>>>"]) {
      assert.ok(!html.includes(marca + " "), `${rotulo} tem marcador de conflito (${marca})`);
    }
  }
});
