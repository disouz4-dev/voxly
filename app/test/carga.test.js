"use strict";

// Usar uma variavel antes de declarar nao e erro de sintaxe: o navegador so
// reclama quando a linha roda, e ai a tela inteira ja morreu. Aconteceu quatro
// vezes neste projeto — falaAudio, idleFallbackTimer, idleAtivo e
// QUALIDADE_PADRAO — e sempre do mesmo jeito: um const declarado la embaixo,
// usado num bloco que roda na carga.
//
// O detector ignora corpo de funcao de proposito: la o codigo roda depois, e
// referenciar um const declarado adiante e legitimo.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");


function scriptInline(html) {
  const blocos = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [];
  return blocos.map(b => b.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")).join("\n");
}

// Troca comentarios, strings e regexes por espacos do mesmo tamanho, para as
// posicoes continuarem batendo com o texto original.
function branquear(js) {
  const out = js.split("");
  let i = 0;
  const apaga = (a, b) => { for (let k = a; k < b && k < out.length; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < js.length) {
    const c = js[i], d = js[i + 1];
    if (c === "/" && d === "/") { const f = js.indexOf("\n", i); apaga(i, f < 0 ? js.length : f); i = f < 0 ? js.length : f; continue; }
    if (c === "/" && d === "*") { const f = js.indexOf("*/", i); apaga(i, f < 0 ? js.length : f + 2); i = f < 0 ? js.length : f + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let k = i + 1;
      while (k < js.length && js[k] !== c) { if (js[k] === "\\") k++; k++; }
      apaga(i, k + 1); i = k + 1; continue;
    }
    i++;
  }
  return out.join("");
}

// Remove o corpo de cada funcao: la dentro o codigo roda depois, entao usar um
// const declarado mais abaixo e legitimo.
function semFuncoes(js) {
  const out = js.split("");
  const re = /\bfunction\b|=>/g;
  let m;
  while ((m = re.exec(js))) {
    let k = js.indexOf("{", m.index);
    if (k < 0) continue;
    const antes = js.slice(m.index, k);
    if (antes.split("}").length > 1) continue; // ja saiu do escopo, nao e o corpo
    let prof = 0, f = k;
    for (; f < js.length; f++) {
      if (js[f] === "{") prof++;
      else if (js[f] === "}") { prof--; if (!prof) break; }
    }
    for (let p = k + 1; p < f; p++) if (out[p] !== "\n") out[p] = " ";
    re.lastIndex = f;
  }
  return out.join("");
}

const RESERVADAS = new Set(["if","for","while","try","catch","else","return","new","typeof","await","const","let","var","function","of","in","do","switch","case","break","continue","delete","void","instanceof","this","null","true","false","undefined","class","throw","finally","yield"]);


function usosAntesDaDeclaracao(html) {
  const bruto = scriptInline(html);
  const js = semFuncoes(branquear(bruto));
  const linha = pos => bruto.slice(0, pos).split("\n").length;

  const declaracao = new Map();
  for (const m of js.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g)) {
    if (!declaracao.has(m[1])) declaracao.set(m[1], m.index);
  }
  const achados = new Set();
  for (const m of js.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const nome = m[0];
    if (RESERVADAS.has(nome) || !declaracao.has(nome)) continue;
    if (m.index >= declaracao.get(nome)) continue;
    if (js.slice(Math.max(0, m.index - 1), m.index) === ".") continue;
    achados.add(`${nome} usado na linha ${linha(m.index)}, declarado so na ${linha(declaracao.get(nome))}`);
  }
  return [...achados];
}

// Sem isto o detector poderia parar de detectar e os outros testes passariam
// para sempre, em silencio. A isca reproduz o bug real do falaAudio.
test("o detector realmente detecta", () => {
  const isca = `<script>
    const isAudience = true;
    if (isAudience) { falaAudio.muted = true; }
    function depois() { return falaAudio.volume; }
    const falaAudio = document.getElementById("fala");
  </script>`;
  const achados = usosAntesDaDeclaracao(isca);
  assert.strictEqual(achados.length, 1, "era para achar exatamente o falaAudio");
  assert.match(achados[0], /^falaAudio /);
});

const TELAS = [
  path.join(__dirname, "..", "src", "screens", "host.html"),
  path.join(__dirname, "..", "src", "screens", "player.html"),
  path.join(__dirname, "..", "..", "web", "public", "profile.html"),
];

for (const tela of TELAS) {
  test(`${path.basename(tela)}: nada usado antes de declarar`, () => {
    const achados = usosAntesDaDeclaracao(fs.readFileSync(tela, "utf8"));
    assert.deepStrictEqual(achados, [],
      `Roda na carga e quebra a tela inteira:\n  ${achados.join("\n  ")}`);
  });
}
