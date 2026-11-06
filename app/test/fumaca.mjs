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
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Porta que se PEDE ao Electron. Nao e necessariamente a que ele abre: se
// estiver ocupada, o Chromium escolhe outra e nao avisa ninguem.
const PORTA_PEDIDA = 9333;

// Onde o Electron guarda os dados do app — e onde o Chromium escreve o
// DevToolsActivePort.
function pastaDeDados() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "voxly");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "voxly");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "voxly");
}
const ARQUIVO_PORTA = path.join(pastaDeDados(), "DevToolsActivePort");

const falhas = [];
let feitos = 0;

function confere(nome, condicao, detalhe = "") {
  feitos++;
  if (condicao) { console.log(`  ok   ${nome}`); return true; }
  console.log(`  FALHOU ${nome}${detalhe ? " — " + detalhe : ""}`);
  falhas.push(nome);
  return false;
}

// O endereco do depurador nao se adivinha. Em 06/11 a esteira ficou 25s
// pedindo 127.0.0.1:9333 enquanto as duas janelas do app JA estavam
// carregadas (o diario do runner prova: `janela.carregou` em Gerencia e
// Palco) — e o teste concluiu "app nao subiu", culpando o app por um defeito
// do proprio teste. A porta verdadeira esta no DevToolsActivePort, que o
// Chromium escreve na pasta de dados; e tenta-se IPv4 e IPv6, porque o
// handler pode escutar so num dos dois.
let base = null;        // ex.: "http://127.0.0.1:9333"
let comoAchou = "";     // para a mensagem de falha

function pedir(url, limiteMs = 4000) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      let corpo = "";
      res.on("data", d => corpo += d);
      res.on("end", () => resolve(corpo));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(limiteMs, () => { req.destroy(); resolve(null); });
  });
}

// Primeira linha do arquivo e a porta; a segunda e o caminho do websocket.
function portaDoArquivo() {
  try {
    return Number(String(fs.readFileSync(ARQUIVO_PORTA, "utf8")).split("\n")[0].trim()) || 0;
  } catch { return 0; }
}

async function garantirBase() {
  if (base) return base;
  const portas = [...new Set([portaDoArquivo(), PORTA_PEDIDA])].filter(p => p > 0);
  for (const p of portas) {
    for (const h of ["127.0.0.1", "[::1]"]) {
      const v = await pedir(`http://${h}:${p}/json/version`);
      if (v && v.includes("webSocketDebuggerUrl")) {
        base = `http://${h}:${p}`;
        comoAchou = `${base} (porta ${p === PORTA_PEDIDA ? "pedida" : "do DevToolsActivePort"})`;
        return base;
      }
    }
  }
  return null;
}

async function alvos() {
  if (!(await garantirBase())) return [];
  const corpo = await pedir(`${base}/json`);
  try { return JSON.parse(corpo).filter(t => t.type === "page"); }
  catch { return []; }
}

// O que mostrar quando nenhuma janela e achada: sem isto a esteira so dizia
// "app nao subiu" e os 400 ultimos caracteres da saida, que nao diziam nada.
function diagnostico() {
  const p = portaDoArquivo();
  return [
    `depurador: ${comoAchou || "nao respondeu em nenhuma porta/endereco"}`,
    `DevToolsActivePort: ${p ? `${p} (${ARQUIVO_PORTA})` : `AUSENTE em ${ARQUIVO_PORTA}`}`,
    `saida do app:\n${saidaApp.slice(-2000) || "(vazia)"}`,
  ].join("\n  ");
}

function avaliar(alvo, expressao, limiteMs = 20000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(alvo.webSocketDebuggerUrl);
    const prazo = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("sem resposta")); }, limiteMs);
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

// Argumentos extras para o Electron, so para ambiente de esteira. No runner do
// GitHub ele nao sobe sem --no-sandbox (processo sem privilegio para criar o
// sandbox) e reclama de GPU que nao existe. A maquina do KJ nao usa nada disto.
const extras = (process.env.VOXLY_FUMACA_ARGS || "").split(" ").filter(Boolean);

// Arquivo de uma execucao anterior aponta para uma porta morta. O Electron o
// apaga ao sair limpo, mas nao quando e morto a SIGTERM, como aqui.
try { fs.rmSync(ARQUIVO_PORTA, { force: true }); } catch {}

const app = spawn("npx", ["electron", ".", `--remote-debugging-port=${PORTA_PEDIDA}`, ...extras],
  { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] });
let saidaApp = "";
app.stdout.on("data", d => saidaApp += d);
app.stderr.on("data", d => saidaApp += d);

const encerrar = () => { try { app.kill("SIGTERM"); } catch {} };
process.on("exit", encerrar);

try {
  console.log("\n== o app sobe ==");
  const host = await achar("host");
  if (!confere("a Gerência abre", !!host, diagnostico())) throw new Error("app nao subiu");
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
  const dep = JSON.parse(await avaliar(host,
    'window.electronAPI.ytdlpEstado().then(e => JSON.stringify(e))', 120000));
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
