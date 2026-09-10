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
// O script inteiro do player vive dentro de
// document.addEventListener("DOMContentLoaded", () => { ... }) — e semFuncoes
// apagava exatamente esse corpo, deixando NADA para analisar. Os testes
// passavam no vazio. Um embrulho desses e codigo de carga, nao corpo de funcao
// adiada: aqui ele e aberto antes da analise.
function desembrulhar(js) {
  const padroes = [
    /^\s*document\.addEventListener\(\s*["'`]DOMContentLoaded["'`]\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/,
    /^\s*\(\s*(?:async\s*)?function\s*\([^)]*\)\s*\{/,
    /^\s*\(\s*(?:async\s*)?\(\s*[^)]*\)\s*=>\s*\{/,
  ];
  let texto = js;
  for (let volta = 0; volta < 3; volta++) {
    const corte = texto.replace(/^\s*["'][^"']*["'];?\s*/, "");  // "use strict"
    const p = padroes.find(re => re.test(corte));
    if (!p) break;
    const abre = corte.indexOf("{", corte.search(p));
    let prof = 0, fecha = -1;
    for (let i = abre; i < corte.length; i++) {
      if (corte[i] === "{") prof++;
      else if (corte[i] === "}") { prof--; if (!prof) { fecha = i; break; } }
    }
    if (fecha < 0) break;
    // Preserva as posicoes: o que fica fora do embrulho vira espaco.
    texto = " ".repeat(js.length - corte.length) +
            " ".repeat(abre + 1) + corte.slice(abre + 1, fecha) +
            " ".repeat(corte.length - fecha - 1);
  }
  return texto;
}

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
  const js = semFuncoes(branquear(desembrulhar(bruto)));
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

// ── Segunda armadilha: funcao CHAMADA na carga ───────────────────────────
//
// LIMITE CONHECIDO: este detector nao pegou o caso real do guiaTimer, em que
// espelhar() (arrow dentro de um if de topo) chamava iniciarGuiaPublico(), que
// lia um `let` declarado adiante. As duas iscas abaixo passam e o caso real
// nao, entao ha um buraco na analise que ainda nao isolei. Enquanto isso, a
// regra pratica continua valendo: TODA declaracao usada por codigo que roda na
// CARGA fica no topo do script, junto de isAudience e video.
// O detector acima ignora corpo de funcao, e isso deixou passar o caso do
// guiaTimer: espelhar() roda na carga da tela do publico e chama
// iniciarGuiaPublico(), que le um `let` declarado 150 linhas abaixo. A tela
// inteira morria. Aqui a busca segue as funcoes que sao chamadas ANTES de a
// declaracao existir.

// Mapeia toda funcao nomeada do script: "function nome()" e tambem
// "const nome = () => {}" / "const nome = function () {}". A segunda forma era
// justamente a que faltava — espelhar() e uma arrow.
function mapearFuncoes(js) {
  const mapa = new Map();
  const guardar = (nome, params, abre) => {
    if (mapa.has(nome) || abre < 0) return;
    let prof = 0;
    for (let f = abre; f < js.length; f++) {
      if (js[f] === "{") prof++;
      else if (js[f] === "}") { prof--; if (!prof) { mapa.set(nome, { texto: js.slice(abre, f), params }); return; } }
    }
  };
  for (const m of js.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
    guardar(m[1], m[2], js.indexOf("{", m.index + m[0].length - 1));
  }
  for (const m of js.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*)?\(([^)]*)\)\s*(?:=>\s*)?\{/g)) {
    guardar(m[1], m[2], m.index + m[0].length - 1);
  }
  return mapa;
}

function usosViaChamadaNaCarga(html) {
  const bruto = scriptInline(html);
  const limpo = branquear(desembrulhar(bruto));
  const soCarga = semFuncoes(limpo);
  const linha = pos => bruto.slice(0, pos).split("\n").length;

  // Só declaracoes de TOPO: as posicoes de soCarga batem com as de limpo (o
  // corpo das funcoes vira espaco, nao some), entao dá para comparar.
  const declaracao = new Map();
  for (const m of soCarga.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g)) {
    if (!declaracao.has(m[1])) declaracao.set(m[1], m.index);
  }
  const corpos = mapearFuncoes(limpo);
  const achados = new Set();

  const locaisDe = c => {
    const l = new Set(c.params.split(",").map(x => x.trim().split(/[\s=]/)[0]).filter(Boolean));
    for (const d of c.texto.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) l.add(d[1]);
    return l;
  };

  for (const chamada of soCarga.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    const raiz = chamada[1];
    if (!corpos.has(raiz) || RESERVADAS.has(raiz)) continue;
    if (/\bfunction\s*$/.test(soCarga.slice(Math.max(0, chamada.index - 12), chamada.index))) continue;

    // Segue a cadeia: espelhar() chama iniciarGuiaPublico(), que le guiaTimer.
    const vistos = new Set();
    const fila = [raiz];
    while (fila.length) {
      const nome = fila.shift();
      if (vistos.has(nome) || !corpos.has(nome)) continue;
      vistos.add(nome);
      const corpo = corpos.get(nome);
      const locais = locaisDe(corpo);

      for (const u of corpo.texto.matchAll(/[A-Za-z_$][\w$]*/g)) {
        const alvo = u[0];
        if (locais.has(alvo) || RESERVADAS.has(alvo)) continue;
        if (corpos.has(alvo)) { fila.push(alvo); continue; }
        if (declaracao.has(alvo) && declaracao.get(alvo) > chamada.index) {
          achados.add(`${alvo} lido por ${nome}(), alcancada de ${raiz}() na linha ${linha(chamada.index)}, mas declarado so na ${linha(declaracao.get(alvo))}`);
        }
      }
    }
  }
  return [...achados];
}

test("o detector de chamada na carga realmente detecta", () => {
  const isca = `<script>
    const isAudience = true;
    if (isAudience) { comecar(); }
    function comecar() { return guiaTimer; }
    let guiaTimer = null;
  </script>`;
  const achados = usosViaChamadaNaCarga(isca);
  assert.strictEqual(achados.length, 1, JSON.stringify(achados));
  assert.match(achados[0], /^guiaTimer /);
});

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

for (const tela of TELAS) {
  test(`${path.basename(tela)}: função chamada na carga não lê declaração posterior`, () => {
    const achados = usosViaChamadaNaCarga(fs.readFileSync(tela, "utf8"));
    assert.deepStrictEqual(achados, [],
      `Quebra a tela inteira ao carregar:\n  ${achados.join("\n  ")}`);
  });
}
