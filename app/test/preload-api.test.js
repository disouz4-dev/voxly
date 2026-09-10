"use strict";

// As telas so alcancam o processo principal pelo preload. Chamar um nome que
// nao existe la nao quebra nada visivel: `window.electronAPI.setYtQualidade`
// era chamado dentro de um `if (... && window.electronAPI.setYtQualidade)`, o
// if segurava, e a qualidade do download simplesmente nunca era salva. Erro
// silencioso, encontrado meses depois.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const PRELOAD = path.join(__dirname, "..", "src", "preload.js");
const TELAS = [
  path.join(__dirname, "..", "src", "screens", "host.html"),
  path.join(__dirname, "..", "src", "screens", "player.html"),
];

function nomesDoPreload() {
  const txt = fs.readFileSync(PRELOAD, "utf8");
  const corpo = txt.slice(txt.indexOf("exposeInMainWorld"));
  const nomes = new Set();
  for (const m of corpo.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) nomes.add(m[1]);
  return nomes;
}

// invoke/send/on sao repassados crus pelo preload em algumas telas.
const TOLERADOS = new Set(["invoke", "send", "on", "removeListener"]);

for (const tela of TELAS) {
  test(`${path.basename(tela)}: so chama o que o preload expoe`, () => {
    const html = fs.readFileSync(tela, "utf8");
    const expostos = nomesDoPreload();
    const usados = new Set();
    for (const m of html.matchAll(/electronAPI\s*\.\s*([A-Za-z_$][\w$]*)/g)) usados.add(m[1]);

    const fantasmas = [...usados].filter(n => !expostos.has(n) && !TOLERADOS.has(n));
    assert.deepStrictEqual(fantasmas, [],
      `Chamadas que o preload nao expoe (falham em silencio): ${fantasmas.join(", ")}`);
  });
}

test("preload nao expoe nome que nenhuma tela usa", () => {
  const expostos = nomesDoPreload();
  const usoTotal = TELAS.map(t => fs.readFileSync(t, "utf8")).join("\n");
  const orfaos = [...expostos].filter(n => !new RegExp(`electronAPI\\s*\\.\\s*${n}\\b`).test(usoTotal));
  assert.deepStrictEqual(orfaos, [],
    `Expostos e nunca usados — ou a tela esqueceu de chamar, ou e codigo morto: ${orfaos.join(", ")}`);
});
