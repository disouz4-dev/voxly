"use strict";

// Escreve web/public/versao.js com a versao do app/package.json.
//
// O app do cantor mostrava "Versao 1.1.1" escrito a mao no HTML, enquanto o
// Voxly ja estava na 1.1.26. A versao agora tem uma fonte so: mudou o
// package.json, roda isto (vem junto em `npm run sincronizar-regras`). Se
// esquecer, versao-web.test.js quebra o `npm test` e a esteira.

const fs = require("fs");
const path = require("path");

const versao = require("../package.json").version;
const destino = path.join(__dirname, "..", "..", "web", "public", "versao.js");

// So grava quando rodado pela linha de comando: o teste carrega este arquivo
// para comparar, e se gravar ao carregar o teste passa sempre.
if (require.main === module) fs.writeFileSync(destino, conteudo(versao));

function conteudo(v) {
  return `// Gerado por app/scripts/versao-web.js a partir de app/package.json. Nao edite.
(function (raiz) { raiz.VOXLY_VERSAO = ${JSON.stringify(v)}; })(typeof globalThis !== "undefined" ? globalThis : this);
`;
}

module.exports = { conteudo };
