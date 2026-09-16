"use strict";

// O app do cantor mostra a versao do Voxly. Ela vem de web/public/versao.js,
// gerado do package.json. Subiu a versao e esqueceu de gerar: quebra aqui.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const versao = require("../package.json").version;
const WEB = path.join(__dirname, "..", "..", "web", "public");

test("o web app mostra a mesma versao do Voxly", () => {
  const { conteudo } = require("../scripts/versao-web.js");
  const atual = fs.readFileSync(path.join(WEB, "versao.js"), "utf8");
  assert.strictEqual(atual, conteudo(versao), "Versao do web app desatualizada. Rode: npm run sincronizar-regras");
});

test("nenhuma tela do web app tem versao escrita a mao", () => {
  for (const arquivo of fs.readdirSync(WEB).filter(f => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(WEB, arquivo), "utf8");
    assert.doesNotMatch(html, /Vers[aã]o\s+\d+\.\d+\.\d+|Voxly\s+\d+\.\d+\.\d+/, `${arquivo} tem versao fixa no texto`);
  }
});
