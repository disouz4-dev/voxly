// QA do download: sobe o app DE VERDADE e conta processos.
//
// Os unitarios cobrem os modulos (em-curso, fila-limitada, download-duplo), mas
// o defeito do show de 22/10 nao vivia num modulo: vivia na fiacao. Tres portas
// chamavam a mesma busca, cada uma com a sua guarda e a sua chave, e ninguem
// via o conjunto. O sintoma eram pares identicos de yt-dlp e, no pior momento,
// 20 processos parados sem nada escrevendo em disco.
//
// Entao a medida aqui e a mesma que eu usei ao vivo, no terminal: quantos
// yt-dlp existem, e se dois deles estao fazendo a MESMA consulta.
//
// Fora do "npm test" de proposito: sobe janelas, usa rede e leva ~1 min.
// Roda com: npm run qa-download   (o Voxly instalado tem de estar FECHADO)

import { spawn, execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import path from "path";
import { fileURLToPath } from "url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORTA_CDP = 9334;
const falhas = [];

function confere(nome, condicao, detalhe = "") {
  console.log(`${condicao ? "  ok  " : "  FALHOU  "}${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!condicao) falhas.push(nome);
  return condicao;
}

const espera = (ms) => new Promise(r => setTimeout(r, ms));

// INVOCACOES de yt-dlp vivas — nao linhas de ps.
//
// O yt-dlp do macOS e um pacote PyInstaller: uma unica chamada aparece como 2
// ou 3 linhas no ps (o lancador e os filhos dele, com a MESMA linha de
// comando). Foi exatamente isso que me fez diagnosticar "duplicacao" durante o
// show de 22/10 — eu contava linhas. Aqui so conta quem NAO tem outro yt-dlp
// como pai, que e uma invocacao de verdade.
function processosYtDlp() {
  let saida = "";
  try { saida = execSync("ps -eo pid,ppid,command", { encoding: "utf8" }); } catch { return []; }
  const linhas = saida.split("\n")
    .map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(m => m && m[3].includes("bin/yt-dlp") && !m[3].includes("grep"))
    .map(m => ({ pid: m[1], ppid: m[2], cmd: m[3] }));
  const pids = new Set(linhas.map(x => x.pid));
  return linhas
    .filter(x => !pids.has(x.ppid))   // filho de yt-dlp nao conta
    .map(x => {
      const busca = x.cmd.match(/ytsearch\d+:(.+?)(?: --|$)/);
      const video = x.cmd.match(/watch\?v=([A-Za-z0-9_-]{11})/);
      // A checagem de versao (--version) nao e trabalho de rede: dura menos de
      // um segundo e roda na abertura. O teto existe para o que pesa.
      const leve = /--version/.test(x.cmd);
      const assunto = busca ? `busca:${busca[1].trim()}` : (video ? `video:${video[1]}` : (leve ? "versao" : "outro"));
      return { assunto, pesado: !leve, linha: x.cmd };
    });
}

function duplicados(procs) {
  const conta = new Map();
  for (const p of procs) conta.set(p.assunto, (conta.get(p.assunto) || 0) + 1);
  return [...conta.entries()].filter(([, n]) => n > 1);
}

async function esperarServidor(tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch("http://127.0.0.1:7432/catalogo", { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* ainda subindo */ }
    await espera(1000);
  }
  return false;
}

// Dirige a Gerencia pelo protocolo do Chrome, para exercitar o IPC de verdade.
// Mesmo mecanismo do fumaca.mjs: WebSocket + Runtime.evaluate.
function alvos() {
  return fetch(`http://127.0.0.1:${PORTA_CDP}/json`)
    .then(r => r.json())
    .then(l => l.filter(t => t.type === "page"))
    .catch(() => []);
}

function avaliar(alvo, expressao, limiteMs = 60000) {
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

async function alvoHost(tentativas = 30) {
  for (let i = 0; i < tentativas; i++) {
    const t = (await alvos()).find(x => (x.url || "").includes("host.html"));
    if (t) {
      const pronto = await avaliar(t, 'document.readyState === "complete"', 8000).catch(() => false);
      if (pronto === true) return t;
    }
    await espera(1000);
  }
  return null;
}

const app = spawn("npx", ["electron", ".", `--remote-debugging-port=${PORTA_CDP}`],
  { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] });
let saidaApp = "";
app.stdout.on("data", d => saidaApp += d);
app.stderr.on("data", d => saidaApp += d);
const encerrar = () => { try { app.kill("SIGTERM"); } catch {} };
process.on("exit", encerrar);

try {
  console.log("\n== o app sobe e o servidor local responde ==");
  const vivo = await esperarServidor();
  if (!confere("servidor local na 7432 responde", vivo, saidaApp.slice(-300))) throw new Error("app nao subiu");

  const antes = processosYtDlp().length;
  confere("nenhum yt-dlp sobrando antes do teste", antes === 0, `havia ${antes}`);

  console.log("\n== tres pedidos da MESMA busca viram UMA consulta ==");
  // Era exatamente isto que duplicava: o KJ clicando, o app do cantor pedindo e
  // o download automatico, os tres para a mesma musica.
  const mesma = "http://127.0.0.1:7432/buscar?q=" + encodeURIComponent("Tempo Perdido") + "&artista=" + encodeURIComponent("Legiao Urbana");
  const tres = [fetch(mesma), fetch(mesma), fetch(mesma)];

  // Tambem dispara quatro buscas DIFERENTES, para medir o teto de simultaneos.
  const outras = ["Evidencias", "Garota de Ipanema", "Wonderwall", "Sweet Child O Mine"]
    .map(q => fetch("http://127.0.0.1:7432/buscar?q=" + encodeURIComponent(q)));

  let pico = 0;
  let duplicataVista = null;
  let noPico = [];
  const vistos = new Set();
  for (let i = 0; i < 40; i++) {       // ~20 s de amostragem
    const procs = processosYtDlp();
    for (const p of procs) vistos.add(p.assunto);
    const pesados = procs.filter(p => p.pesado);
    if (pesados.length > pico) { pico = pesados.length; noPico = pesados.map(p => p.assunto); }
    const dup = duplicados(procs);
    if (dup.length && !duplicataVista) duplicataVista = dup.map(([a, n]) => `${n}x ${a}`).join(", ");
    await espera(500);
  }
  console.log(`  (no pico rodavam: ${noPico.join(" | ") || "nada"})`);
  console.log(`  (assuntos vistos: ${[...vistos].join(" | ") || "nenhum"})`);

  confere("nenhuma consulta identica rodando em paralelo", !duplicataVista, duplicataVista || "");
  confere("teto de 2 trabalhos pesados respeitado", pico <= 2, `pico observado: ${pico}`);
  confere("alguma consulta de fato rodou (o teste nao passou no vazio)", pico >= 1, `pico ${pico}`);

  // As tres respostas da mesma busca tem de ser a MESMA resposta.
  const corpos = await Promise.all(tres.map(p => p.then(r => r.text()).catch(e => "erro:" + e.message)));
  const iguais = corpos[0] === corpos[1] && corpos[1] === corpos[2];
  confere("as tres respostas da mesma busca sao identicas", iguais,
    iguais ? "" : corpos.map(c => c.slice(0, 60)).join(" | "));
  const temCandidatos = (() => { try { return (JSON.parse(corpos[0]).candidatos || []).length > 0; } catch { return false; } })();
  confere("a busca devolveu candidatos de karaoke", temCandidatos, corpos[0].slice(0, 80));

  console.log("\n== repetir a mesma busca nao abre processo novo (validade de 90 s) ==");
  const t0 = Date.now();
  const repetida = await (await fetch(mesma)).text();
  const demorou = Date.now() - t0;
  confere("resposta repetida veio na hora", demorou < 3000, `${demorou} ms`);
  confere("resposta repetida e a mesma", repetida === corpos[0]);

  // Encerra as buscas diferentes que ainda estiverem em voo, para nao vazar.
  await Promise.allSettled(outras);

  console.log("\n== gravacao que ja esta no disco nem tenta baixar ==");
  // Sem o acervo montado nao ha o que estar no disco: pular e honesto, acusar
  // falha seria mentira. O HD do Diego e externo e monta em /Volumes.
  const pastaAcervo = (() => {
    try {
      const cfg = JSON.parse(readFileSync(path.join(homedir(), "Library/Application Support/voxly/config.json"), "utf8"));
      return cfg.musicFolder || null;
    } catch { return null; }
  })();
  const acervoMontado = pastaAcervo && existsSync(pastaAcervo);
  const host = acervoMontado ? await alvoHost() : null;
  if (!acervoMontado) {
    console.log(`  (pulado: o acervo nao esta montado — ${pastaAcervo || "sem pasta configurada"})`);
  } else if (host) {
    const texto = await avaliar(host, `window.electronAPI.ytDownload({
      itemId: 'qa-ja-tenho',
      urls: ['https://www.youtube.com/watch?v=zFiXXhxXtLs'],
      artista: 'Pitty', musica: 'Na Sua Estante',
      renomear: false, organizar: false, cookies: false, navegador: null, playlist: false
    }).then(x => JSON.stringify(x))`, 30000).catch(e => "erro: " + e.message);
    confere("o download respondeu 'ja tinha' em vez de baixar", /"jaTinha":true/.test(String(texto)),
      String(texto).slice(0, 160));
  } else {
    console.log("  (pulado: nao achei a Gerência no CDP)");
  }

  console.log("\n== nada ficou pendurado ==");
  await espera(2000);
  const sobrou = processosYtDlp();
  confere("nenhum yt-dlp preso ao fim", sobrou.length === 0, `sobraram ${sobrou.length}`);
} catch (e) {
  falhas.push(`erro no QA: ${e.message}`);
  console.error("\nERRO:", e.message);
} finally {
  encerrar();
  await espera(1500);
  // Limpa qualquer yt-dlp que o app tenha deixado, para nao atrapalhar o show.
  try { execSync('pkill -f "Application Support/voxly/bin/yt-dlp" || true'); } catch {}
}

console.log(falhas.length ? `\n${falhas.length} FALHA(S): ${falhas.join(", ")}\n` : "\nTudo verde.\n");
process.exit(falhas.length ? 1 : 0);
