// Confere o selo de qualidade DENTRO do Electron, de ponta a ponta.
//
// A fumaca prova que o app sobe; os testes provam os modulos puros. Nenhum dos
// dois exercita o caminho que importa aqui: a tela chamando `yt-notas`, o
// processo principal pegando o endereco do audio no YouTube, o ffmpeg lendo so
// um trecho e o espectro devolvendo nota. Isso usa rede, yt-dlp e ffmpeg, e
// leva ~10 s — nao cabe na suite nem na esteira. E QA manual, como o
// qa-download.mjs.
//
// Uso: npm run qa-selo

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTA_PEDIDA = 9334;   // 9333 e da fumaca: as duas podem rodar juntas

function pastaDeDados() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "voxly");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "voxly");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "voxly");
}
const ARQUIVO_PORTA = path.join(pastaDeDados(), "DevToolsActivePort");

if (typeof WebSocket !== "function") {
  console.error(`\n  ERRO: este Node (${process.version}) nao tem WebSocket global (precisa de 22+).\n`);
  process.exit(2);
}

let feitos = 0, falhos = 0;
function confere(nome, ok, detalhe = "") {
  feitos++;
  if (!ok) falhos++;
  console.log(`  ${ok ? "ok  " : "FALHA"} ${nome}${detalhe ? "  — " + detalhe : ""}`);
  return ok;   // quem precisa abortar le o retorno, como na fumaca
}
const espera = ms => new Promise(r => setTimeout(r, ms));

function pedir(url, limiteMs = 4000) {
  return fetch(url, { signal: AbortSignal.timeout(limiteMs) }).then(r => r.json());
}
function portaDoArquivo() {
  try { return Number(fs.readFileSync(ARQUIVO_PORTA, "utf8").split("\n")[0]) || 0; }
  catch { return 0; }
}
let base = null;
async function garantirBase() {
  for (const p of [PORTA_PEDIDA, portaDoArquivo()].filter(Boolean)) {
    for (const h of ["127.0.0.1", "[::1]"]) {
      try { await pedir(`http://${h}:${p}/json/version`, 1500); base = `http://${h}:${p}`; return base; }
      catch { /* proxima */ }
    }
  }
  return null;
}

function avaliar(alvo, expressao, limiteMs = 90000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(alvo.webSocketDebuggerUrl);
    const prazo = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("sem resposta")); }, limiteMs);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id !== 1) return;
      clearTimeout(prazo); ws.close();
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

async function acharHost(tentativas = 30) {
  for (let i = 0; i < tentativas; i++) {
    if (!base) await garantirBase();
    if (base) {
      const lista = await pedir(`${base}/json/list`).catch(() => []);
      const t = (Array.isArray(lista) ? lista : []).find(x => String(x.url || "").includes("host.html"));
      if (t) {
        const pronto = await avaliar(t, 'document.readyState === "complete"', 5000).catch(() => false);
        if (pronto === true) return t;
      }
    }
    await espera(1000);
  }
  return null;
}

try { fs.rmSync(ARQUIVO_PORTA, { force: true }); } catch {}
const extras = (process.env.VOXLY_FUMACA_ARGS || "").split(" ").filter(Boolean);
const app = spawn("npx", ["electron", ".", `--remote-debugging-port=${PORTA_PEDIDA}`, ...extras],
  { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] });
let saida = "";
app.stdout.on("data", d => saida += d);
app.stderr.on("data", d => saida += d);
const encerrar = () => { try { app.kill("SIGTERM"); } catch {} };
process.on("exit", encerrar);

// Candidatas reais de "Alice in Chains — Man in the Box". Escolhidas porque e a
// musica em que a nota ESPALHA (60..90 medido em 06/11): num caso comprimido
// como o Skyfall, um defeito que achatasse todas as notas passaria batido.
const IDS = ["5ReHtiE9L0A", "Iitjkavix2c", "Vox5N195B68", "gVffOAGqobg"];

try {
  console.log("\n== a Gerência abre ==");
  const host = await acharHost();
  if (!confere("a tela do KJ respondeu", !!host, saida.slice(-200))) throw new Error("app nao subiu");

  console.log("\n== o módulo do selo chegou na tela ==");
  const temSelo = await avaliar(host, 'typeof window.VoxlySelo === "object" && typeof VoxlySelo.ordenarCandidatas === "function"').catch(() => false);
  confere("VoxlySelo carregado", temSelo === true);
  const porta = await avaliar(host, 'typeof window.electronAPI?.ytNotas === "function"').catch(() => false);
  confere("electronAPI.ytNotas existe", porta === true);

  console.log("\n== a ordem e a coroa, dentro da tela ==");
  const ordem = await avaliar(host, `(() => {
    const r = VoxlySelo.ordenarCandidatas([
      { id: 'ruim', nota: 20 }, { id: 'boa', nota: 90 }, { id: 'sem' },
    ]);
    return JSON.stringify({ ids: r.map(x => x.id), indices: r.map(x => x.indice), coroas: r.filter(x => x.melhor).length });
  })()`).catch(e => "erro: " + e.message);
  const o = typeof ordem === "string" && ordem[0] === "{" ? JSON.parse(ordem) : null;
  confere("ordena da melhor para a pior", o && o.ids.join() === "boa,ruim,sem", String(ordem));
  confere("o índice original viaja junto", o && o.indices.join() === "1,0,2");
  confere("uma coroa só", o && o.coroas === 1);

  console.log("\n== o selinho desenha ==");
  const selinho = await avaliar(host, `(() => {
    const a = selinhoDaNota(90, true), b = selinhoDaNota(40, false), c = selinhoDaNota(null, true);
    return JSON.stringify({ coroado: a.includes('🏆') && a.includes('90'), simples: !b.includes('🏆') && b.includes('40'), vazio: c === '' });
  })()`).catch(e => "erro: " + e.message);
  const s = typeof selinho === "string" && selinho[0] === "{" ? JSON.parse(selinho) : null;
  confere("nota líder sai com coroa", s && s.coroado === true, String(selinho));
  confere("nota comum sai sem coroa", s && s.simples === true);
  confere("sem nota não desenha nada", s && s.vazio === true);

  console.log(`\n== medir de verdade, sem baixar (${IDS.length} candidatas, ~10 s) ==`);
  const t0 = Date.now();
  const bruto = await avaliar(host, `window.electronAPI.ytNotas({
    artista: 'Alice in Chains', musica: 'Man in the Box',
    ids: ${JSON.stringify(IDS)},
  }).then(r => JSON.stringify(r))`).catch(e => "erro: " + e.message);
  const ms = Date.now() - t0;
  const r = typeof bruto === "string" && bruto[0] === "{" ? JSON.parse(bruto) : null;
  confere("o IPC respondeu", !!r, String(bruto).slice(0, 200));
  if (r) {
    const notas = Object.values(r.notas || {});
    confere("achou a gravação original no iTunes", !r.semOriginal, r.original || "");
    confere("pontuou ao menos 3 das 4", notas.length >= 3, `notas: ${JSON.stringify(r.notas)}`);
    confere("todas as notas são inteiras de 0 a 100",
      notas.every(n => Number.isInteger(n) && n >= 0 && n <= 100));
    confere("as notas não saíram todas iguais", new Set(notas).size > 1, `${JSON.stringify(notas)}`);
    console.log(`       original: ${r.original}`);
    console.log(`       notas: ${JSON.stringify(r.notas)}   em ${(ms / 1000).toFixed(1)}s`);
  }
} catch (e) {
  console.error(`\n  erro: ${e.message}`);
  falhos++;
} finally {
  encerrar();
  console.log(`\n${feitos - falhos}/${feitos} verificações passaram`);
  process.exit(falhos ? 1 : 0);
}
