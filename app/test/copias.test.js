"use strict";

// Regras que valem nos DOIS lados: a Gerencia (file://, carrega de ../) e o app
// do cantor (Firebase Hosting, carrega de /). Nao ha como um so arquivo servir
// aos dois — o pacote do Electron nao alcanca web/public de forma confiavel —
// entao a copia e deliberada. Este teste existe para ela nao divergir em
// silencio, que foi como a regra de prioridade acabou com duas contas
// diferentes: uma promovia "cafe com leite" numa fila que a outra nao promovia.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const PARES = [
  ["src/prioridade.js", "../web/public/prioridade.js"],
  ["src/ordem.js", "../web/public/ordem.js"],
  ["src/trava.js", "../web/public/trava.js"],
  ["src/sessao-regras.js", "../web/public/sessao-regras.js"],
  ["src/texto.js", "../web/public/texto.js"],
  ["src/sugestoes.js", "../web/public/sugestoes.js"],
  ["src/historico.js", "../web/public/historico.js"],
  ["src/seguro.js", "../web/public/seguro.js"],
];

for (const [origem, copia] of PARES) {
  test(`${path.basename(origem)}: a cópia do web app está igual`, () => {
    const a = fs.readFileSync(path.join(__dirname, "..", origem), "utf8");
    const b = fs.readFileSync(path.join(__dirname, "..", copia), "utf8");
    assert.strictEqual(b, a,
      `Divergiu. Rode: npm run sincronizar-regras`);
  });
}
