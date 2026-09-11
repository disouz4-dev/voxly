"use strict";

// Complemento do carga.test.js. Aquele le o codigo e procura uso antes da
// declaracao; tem um limite conhecido e deixou passar o caso real do guiaTimer.
// Este RODA o script de cada tela, do jeito que o navegador roda: tudo que
// executa na carga executa aqui. Um `let` lido antes de existir estoura como no
// navegador ("Cannot access ... before initialization"), sem depender de
// analise nenhuma.
//
// O navegador e o Electron sao trocados por um "coringa": qualquer propriedade
// existe, qualquer chamada funciona e devolve outro coringa. Callbacks de
// evento, timers e respostas do Firebase nao disparam (rodam depois da carga,
// quando tudo ja foi declarado); DOMContentLoaded e load disparam, porque o
// script do Palco inteiro vive dentro de um deles.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// `then` existe porque as telas encadeiam `.then()` direto nas chamadas do
// Electron. Ele responde como promessa de verdade: DEPOIS, numa microtarefa —
// chamar na hora criaria falso alarme de uso antes da declaracao. O valor
// entregue e um coringa sem `then`, senao o await nunca terminaria de resolver.
function coringa(comThen = true) {
  return new Proxy(function () {}, {
    get(_alvo, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === Symbol.iterator) return function* () {};
      if (p === "then") {
        if (!comThen) return undefined;
        return (ok) => { Promise.resolve().then(() => ok && ok(coringa(false))); return coringa(); };
      }
      if (p === "length") return 0;
      if (p === "toString" || p === "valueOf") return () => "";
      return coringa();
    },
    set: () => true,
    has: () => true,
    deleteProperty: () => true,
    apply: () => coringa(),
    construct: () => coringa(),
  });
}

// Scripts da pagina na ordem do documento: inline e src intercalados.
function scriptsDaPagina(html, pastaDaTela, raizWeb) {
  const lista = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = (m[1].match(/\bsrc=["']([^"']+)["']/) || [])[1];
    if (!src) { lista.push({ nome: "inline", codigo: m[2] }); continue; }
    if (/^https?:/.test(src)) continue;             // CDN (Firebase, QR): o coringa faz as vezes
    const arquivo = src.startsWith("/") ? path.join(raizWeb, src) : path.join(pastaDaTela, src);
    lista.push({ nome: path.basename(arquivo), codigo: fs.readFileSync(arquivo, "utf8") });
  }
  return lista;
}

async function carregar(caminhoTela, { busca = "" } = {}) {
  const html = fs.readFileSync(caminhoTela, "utf8");
  const aoCarregar = [];
  const registrar = (tipo, fn) => {
    if (tipo === "DOMContentLoaded" || tipo === "load") aoCarregar.push({ tipo, fn });
  };
  const documento = new Proxy(coringa(), {
    get(alvo, p) { return p === "addEventListener" ? registrar : alvo[p]; },
  });
  const nada = () => 0;
  // Armazenamento de verdade, vazio como numa primeira abertura: o coringa
  // aqui fazia JSON.parse(getItem()) virar 0, erro que o navegador nao teria.
  const armazenamento = () => {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: k => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; },
    };
  };

  const janela = {
    document: documento,
    location: { search: busca, href: "file:///tela.html" + busca, hash: "", pathname: "/tela.html",
                hostname: "localhost", protocol: "file:", origin: "file://", reload: nada },
    navigator: coringa(), localStorage: armazenamento(), sessionStorage: armazenamento(),
    electronAPI: coringa(), firebase: coringa(), QRCode: coringa(),
    speechSynthesis: coringa(), SpeechSynthesisUtterance: coringa(),
    AudioContext: coringa(), AudioWorkletNode: coringa(), Audio: coringa(), Image: coringa(),
    Option: coringa(), MutationObserver: coringa(), ResizeObserver: coringa(), IntersectionObserver: coringa(),
    BroadcastChannel: coringa(), EventSource: coringa(), WebSocket: coringa(), Notification: coringa(),
    fetch: () => new Promise(() => {}),
    setTimeout: nada, setInterval: nada, clearTimeout: nada, clearInterval: nada,
    requestAnimationFrame: nada, cancelAnimationFrame: nada, queueMicrotask: nada,
    getComputedStyle: () => coringa(), matchMedia: () => coringa(),
    alert: nada, confirm: () => false, prompt: () => null,
    addEventListener: registrar, removeEventListener: nada, dispatchEvent: nada,
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, AbortSignal,
    console: { log: nada, info: nada, warn: nada, error: nada, debug: nada },
  };
  janela.window = janela;
  janela.self = janela;
  const contexto = vm.createContext(janela);

  const erros = [];
  const rodar = (codigo, nome) => {
    try { vm.runInContext(codigo, contexto, { filename: nome }); }
    catch (e) { erros.push(`${nome}: ${e.message}`); }
  };
  const scripts = scriptsDaPagina(html, path.dirname(caminhoTela), path.join(__dirname, "..", "..", "web", "public"));
  for (const s of scripts) {
    rodar(s.codigo, s.nome);
    // O navegador esvazia as microtarefas entre um <script> e o seguinte.
    await new Promise(r => setImmediate(r));
  }
  let eventosRodados = 0;
  for (const tipo of ["DOMContentLoaded", "load"]) {
    for (const h of aoCarregar.filter(x => x.tipo === tipo)) {
      eventosRodados++;
      try { await h.fn(coringa()); } catch (e) { erros.push(`${tipo}: ${e.message}`); }
    }
  }
  // Funcoes async disparadas na carga estouram depois do primeiro await.
  await new Promise(r => setImmediate(r));
  return { erros, scripts: scripts.length, eventosRodados, contexto };
}

// Captura rejeicoes de promessas criadas dentro do vm (async de carga).
async function carregarVigiando(tela, opcoes) {
  const rejeitadas = [];
  const ouvir = (e) => rejeitadas.push(`promessa: ${e && e.message}`);
  process.on("unhandledRejection", ouvir);
  try {
    const r = await carregar(tela, opcoes);
    await new Promise(res => setImmediate(res));
    return { ...r, erros: [...r.erros, ...rejeitadas] };
  } finally {
    process.off("unhandledRejection", ouvir);
  }
}

const SCREENS = path.join(__dirname, "..", "src", "screens");
const CASOS = [
  { tela: path.join(SCREENS, "host.html"), rotulo: "Gerência" },
  { tela: path.join(SCREENS, "player.html"), rotulo: "Palco" },
  { tela: path.join(SCREENS, "player.html"), rotulo: "Público", busca: "?tela=publico" },
  { tela: path.join(__dirname, "..", "..", "web", "public", "profile.html"), rotulo: "app do cantor" },
];

// Prova de que o script rodou ate o FIM, e nao morreu nas primeiras linhas
// sem ninguem notar: a ultima declaracao const/let de topo tem que estar
// inicializada. Funcao nao serve de prova — declaracao de funcao existe desde
// o inicio (hoisting), mesmo que o script morra na primeira linha.
function ultimaDeclaracaoDeTopo(caminhoTela, recuo) {
  const html = fs.readFileSync(caminhoTela, "utf8");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
  const re = new RegExp(`^ {${recuo}}(?:const|let)\\s+([A-Za-z_$][\\w$]*)`, "gm");
  const nomes = [...inline.matchAll(re)].map(m => m[1]);
  return nomes[nomes.length - 1];
}

const CASOS_COM_SENTINELA = CASOS.map(c => ({
  ...c,
  // O Palco vive dentro do DOMContentLoaded (escopo fechado, invisivel daqui):
  // ali a prova e o handler ter rodado sem erro.
  sentinela: c.rotulo === "Gerência" ? ultimaDeclaracaoDeTopo(c.tela, 2)
    : c.rotulo === "app do cantor" ? ultimaDeclaracaoDeTopo(c.tela, 4) : null,
}));

for (const { tela, rotulo, busca, sentinela } of CASOS_COM_SENTINELA) {
  test(`${rotulo}: a carga roda inteira, sem nada lido antes de existir`, async () => {
    const r = await carregarVigiando(tela, { busca });
    assert.deepStrictEqual(r.erros, [], `A tela morreria ao abrir:\n  ${r.erros.join("\n  ")}`);
    if (sentinela) {
      // typeof de um let ainda nao inicializado LANCA; de um que nao existe, "undefined".
      assert.doesNotThrow(() => vm.runInContext(`typeof ${sentinela}`, r.contexto),
        `${sentinela} nao foi inicializado: o script parou antes do fim`);
      assert.notStrictEqual(vm.runInContext(`typeof ${sentinela}`, r.contexto), "undefined",
        `${sentinela} nao existe no contexto`);
    } else {
      assert.ok(r.eventosRodados > 0, "o DOMContentLoaded do Palco nao rodou");
    }
  });
}

// A isca do caso real: let lido por uma funcao chamada na carga, dentro do
// DOMContentLoaded, declarado depois. E exatamente o que o detector estatico
// deixou passar.
test("a execução pega o caso do guiaTimer, que a análise estática deixou passar", async () => {
  const tmp = path.join(require("os").tmpdir(), `isca-${process.pid}.html`);
  fs.writeFileSync(tmp, `<script>
    document.addEventListener("DOMContentLoaded", () => {
      const isAudience = new URLSearchParams(location.search).get("tela") === "publico";
      const espelhar = () => { if (isAudience) iniciarGuia(); };
      function iniciarGuia() { clearInterval(guiaTimer); }
      espelhar();
      let guiaTimer = null;
    });
  </script>`);
  try {
    const { erros } = await carregarVigiando(tmp, { busca: "?tela=publico" });
    assert.strictEqual(erros.length, 1, JSON.stringify(erros));
    assert.match(erros[0], /guiaTimer.*before initialization/);
  } finally {
    fs.unlinkSync(tmp);
  }
});
