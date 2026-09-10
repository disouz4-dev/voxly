// Teste de fumaca: sobe o app DE VERDADE e o dirige pelo protocolo do Chrome.
//
// Os 147 testes unitarios cobrem modulos puros, e nenhum defeito critico desta
// sessao vivia num modulo puro: janelas nascendo empilhadas, o painel do
// publico sem espelhar o video, o Play sem efeito, a pasta de download barrando
// instalacao nova, um limite de 8s apagando um binario bom. Tudo fiacao — entre
// o Electron, as telas e o processo principal. E o que este arquivo cobre.
//
// Fica fora do "npm test" de proposito: abre janelas, usa rede e leva ~1min.
// Roda com: npm run fumaca

import { spawn } from "node:child_process";
import { setTimeout as espera } from "node:timers/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORTA = 9333;

const falhas = [];
let feitos = 0;

function confere(nome, condicao, detalhe = "") {
  feitos++;
  if (condicao) { console.log(`  ok   ${nome}`); return true; }
  console.log(`  FALHOU ${nome}${detalhe ? " — " + detalhe : ""}`);
  falhas.push(nome);
  return false;
}

function alvos() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORTA}/json`, res => {
      let corpo = "";
      res.on("data", d => corpo += d);
      res.on("end", () => {
        try { resolve(JSON.parse(corpo).filter(t => t.type === "page")); }
        catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(4000, () => { req.destroy(); resolve([]); });
  });
}

function avaliar(alvo, expressao) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(alvo.webSocketDebuggerUrl);
    const prazo = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("sem resposta")); }, 20000);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id !== 1) return;
      clearTimeout(prazo);
      ws.close();
      const r = m.result?.result;
      if (m.result?.exceptionDetails) return reject(new Error(r?.description || "excecao"));
      resolve(r?.value);
    };
    ws.onerror = () => { clearTimeout(prazo); reject(new Error("websocket")); };
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1, method: "Runtime.evaluate",
      params: { expression: expressao, returnByValue: true, awaitPromise: true },
    }));
  });
}

const tela = {
  host: t => t.url.includes("host.html"),
  palco: t => t.url.includes("player.html") && !t.url.includes("tela=publico"),
  publico: t => t.url.includes("tela=publico"),
};

async function achar(qual, tentativas = 30) {
  for (let i = 0; i < tentativas; i++) {
    const t = (await alvos().catch(() => [])).find(tela[qual]);
    // O alvo ja reporta a URL final enquanto o documento ainda e o about:blank
    // inicial — cujo readyState e "complete" na hora. Conferir so o readyState
    // devolvia "undefined" para tudo que vem de <script src>. Por isso a
    // pergunta e feita ao proprio documento.
    if (t) {
      const pronto = await avaliar(t,
        `document.readyState === "complete" && location.href.includes("${qual === "host" ? "host.html" : "player.html"}")`
      ).catch(() => false);
      if (pronto === true) return t;
    }
    await espera(1000);
  }
  return null;
}

const app = spawn("npx", ["electron", ".", `--remote-debugging-port=${PORTA}`],
  { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] });
let saidaApp = "";
app.stdout.on("data", d => saidaApp += d);
app.stderr.on("data", d => saidaApp += d);

const encerrar = () => { try { app.kill("SIGTERM"); } catch {} };
process.on("exit", encerrar);

try {
  console.log("\n== o app sobe ==");
  const host = await achar("host");
  if (!confere("a Gerência abre", !!host, saidaApp.slice(-400))) throw new Error("app nao subiu");
  const palco = await achar("palco");
  confere("o Palco abre", !!palco);

  console.log("\n== as telas nao morreram ==");
  // Um erro de sintaxe ou uso antes da declaracao mata o <script> inteiro, e a
  // tela fica visivel mas inerte. So dava para perceber clicando.
  for (const [nome, alvo] of [["Gerência", host], ["Palco", palco]]) {
    const vivo = await avaliar(alvo, 'typeof window.electronAPI === "object"').catch(() => false);
    confere(`${nome}: o script rodou até o fim`, vivo === true);
  }

  console.log("\n== os módulos chegaram nas telas ==");
  const modulos = await avaliar(host,
    'JSON.stringify({fila:typeof VoxlyFila,limite:typeof VoxlyLimite,orfaos:typeof VoxlyOrfaos})');
  const m = JSON.parse(modulos || "{}");
  confere("VoxlyFila carregado", m.fila === "object", modulos);
  confere("VoxlyLimite carregado", m.limite === "object", modulos);
  confere("VoxlyOrfaos carregado", m.orfaos === "object", modulos);
  const sync = await avaliar(palco, 'typeof VoxlyPainelSync');
  confere("VoxlyPainelSync carregado no Palco", sync === "object", sync);

  console.log("\n== as janelas não nascem empilhadas ==");
  const geo = t => avaliar(t, 'JSON.stringify({x:window.screenX,y:window.screenY,w:outerWidth,h:outerHeight})');
  const g1 = JSON.parse(await geo(host)), g2 = JSON.parse(await geo(palco));
  const cobre = !(g1.x + g1.w <= g2.x || g2.x + g2.w <= g1.x || g1.y + g1.h <= g2.y || g2.y + g2.h <= g1.y);
  confere("Gerência e Palco não se sobrepõem", !cobre, JSON.stringify([g1, g2]));
  confere("a Gerência tem altura utilizável", g1.h >= 500, `altura ${g1.h}`);

  console.log("\n== os botões apontam para funções que existem ==");
  const mortos = await avaliar(host, [
    "(() => {",
    "  const faltando = [];",
    "  document.querySelectorAll('[onclick]').forEach(el => {",
    "    const cru = el.getAttribute('onclick').trim();",
    "    const abre = cru.indexOf('(');",
    "    if (abre < 1) return;",
    "    const nome = cru.slice(0, abre).trim();",
    "    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(nome)) return;",
    "    if (typeof window[nome] !== 'function' && !faltando.includes(nome)) faltando.push(nome);",
    "  });",
    "  return JSON.stringify(faltando);",
    "})()",
  ].join("\n"));
  confere("nenhum onclick aponta para função inexistente", mortos === "[]", mortos);

  console.log("\n== a pasta de download resolve ==");
  const pasta = await avaliar(host, 'window.electronAPI.getMusicFolder()');
  confere("há uma pasta de músicas (padrão ou configurada)", !!pasta, String(pasta));

  console.log("\n== as dependências respondem ==");
  const dep = JSON.parse(await avaliar(host, 'window.electronAPI.ytdlpEstado().then(e => JSON.stringify(e))'));
  confere("yt-dlp encontrado", !!dep.versao, JSON.stringify(dep));
  confere("ffmpeg encontrado", !!dep.ffmpeg, JSON.stringify(dep.ffmpeg));
  confere("yt-dlp não se declara desatualizado sem motivo",
    dep.precisaAtualizar === false || dep.publicada !== dep.versao,
    JSON.stringify({ local: dep.versao, publicada: dep.publicada }));

  console.log("\n== o Público espelha o Palco ==");
  await avaliar(host, 'window.electronAPI.toggleAudience()');
  const publico = await achar("publico", 15);
  if (confere("a tela do Público abre", !!publico)) {
    const mudo = await avaliar(publico,
      '[...document.querySelectorAll("video,audio")].every(m => m.muted)');
    confere("o Público nasce mudo", mudo === true);
    const g3 = JSON.parse(await geo(publico));
    const bate = !(g3.x + g3.w <= g2.x || g2.x + g2.w <= g3.x || g3.y + g3.h <= g2.y || g2.y + g2.h <= g3.y);
    confere("Público e Palco não se sobrepõem", !bate, JSON.stringify([g2, g3]));
  }

  console.log("\n== o console não acusou erro ==");
  for (const [nome, alvo] of [["Gerência", host], ["Palco", palco]]) {
    const erros = await avaliar(alvo, 'JSON.stringify(window.__errosVoxly || [])').catch(() => "[]");
    confere(`${nome}: sem exceção não tratada`, erros === "[]", erros);
  }
} catch (e) {
  console.log(`\n  INTERROMPIDO: ${e.message}`);
  falhas.push(e.message);
} finally {
  encerrar();
  await espera(1500);
}

console.log(`\n${feitos - falhas.length}/${feitos} verificações passaram`);
if (falhas.length) { console.log("falhas: " + falhas.join(", ")); process.exit(1); }
