"use strict";

// Caça a classe de bug que mais apareceu neste projeto: codigo desconectado.
// Como as telas sao HTML com <script> inline, nada avisa quando um onclick
// chama uma funcao que nao existe, ou quando uma funcao e escrita e nunca
// ligada. O navegador so reclama na hora do clique — ou seja, no show.
//
// Casos reais que este teste teria pego antes de irem para o app:
//   escaparHtml() chamada, escHtml() definida  -> modal nao abria
//   abrirModalSessao() no onclick, nunca definida -> "Iniciar Sessão" morto
//   sugerirNoItunes() definida e nunca chamada -> autocomplete vazio

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const TELAS = ["host.html", "player.html", "profile.html"];
const DIRS = [
  path.join(__dirname, "..", "src", "screens"),
  path.join(__dirname, "..", "..", "web", "public"),
];

// Nomes que vem do navegador, do Firebase ou do preload — nao sao nossos.
const GLOBAIS = new Set([
  "console","document","window","setTimeout","setInterval","clearTimeout","clearInterval",
  "fetch","alert","confirm","prompt","JSON","Math","Date","Object","Array","String","Number",
  "Boolean","Promise","Set","Map","RegExp","Error","parseInt","parseFloat","isNaN","encodeURIComponent",
  "decodeURIComponent","localStorage","sessionStorage","location","navigator","firebase","db","auth",
  "electronAPI","VoxlyLocal","require","URL","URLSearchParams","Intl","AbortSignal","structuredClone",
  "AudioContext","SpeechSynthesisUtterance","speechSynthesis","Event","KeyboardEvent","Image","FileReader",
  "Blob","atob","btoa","queueMicrotask","requestAnimationFrame","getComputedStyle","matchMedia","Number",
]);

function lerTela(nome) {
  for (const dir of DIRS) {
    const p = path.join(dir, nome);
    if (fs.existsSync(p)) return { caminho: p, texto: fs.readFileSync(p, "utf8") };
  }
  return null;
}

function scriptInline(html) {
  const blocos = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [];
  return blocos.map(b => b.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")).join("\n");
}

function definidas(js) {
  const nomes = new Set();
  for (const m of js.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) nomes.add(m[1]);
  for (const m of js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g)) nomes.add(m[1]);
  for (const m of js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) nomes.add(m[1]);
  return nomes;
}

// Funcoes referenciadas em atributos do HTML (onclick, onchange, oninput...).
function chamadasNoHtml(html) {
  const nomes = new Set();
  for (const m of html.matchAll(/\bon\w+\s*=\s*"([^"]*)"/g)) {
    for (const c of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) nomes.add(c[1]);
  }
  return nomes;
}

for (const tela of TELAS) {
  test(`${tela}: todo onclick aponta para funcao existente`, () => {
    const arq = lerTela(tela);
    assert.ok(arq, `${tela} nao encontrada`);

    const js = scriptInline(arq.texto);
    const temos = definidas(js);
    const faltando = [...chamadasNoHtml(arq.texto)]
      .filter(n => !temos.has(n) && !GLOBAIS.has(n));

    assert.deepStrictEqual(faltando, [],
      `Handlers apontam para funcoes que nao existem em ${tela}: ${faltando.join(", ")}`);
  });

  test(`${tela}: script inline tem sintaxe valida`, () => {
    const arq = lerTela(tela);
    assert.ok(arq);
    // new Function nao executa o corpo, so exige que ele compile.
    assert.doesNotThrow(() => new Function(scriptInline(arq.texto)),
      `Erro de sintaxe no <script> de ${tela} — a tela inteira ficaria morta`);
  });
}
