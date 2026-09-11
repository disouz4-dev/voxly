// Acesso as janelas do Voxly aberto com --remote-debugging-port (padrao 9222),
// pelo protocolo do DevTools. Base do roteiro de show automatizado e das
// inspecoes ao vivo.
//
// Como biblioteca:  import { avaliar, foto } from "./cdp.mjs"
// Pela linha de comando:
//   node test/cdp.mjs avaliar <gerencia|palco|publico> "<expressao JS>"
//   node test/cdp.mjs foto    <gerencia|palco|publico> <arquivo.png> ["<expressao antes>"]

import http from "node:http";
import fs from "node:fs";

const PORTA = Number(process.env.VOXLY_CDP_PORTA || 9222);

function json(url) {
  return new Promise((ok, falha) => {
    http.get(url, r => { let d = ""; r.on("data", c => (d += c)); r.on("end", () => ok(JSON.parse(d))); })
      .on("error", falha);
  });
}

// player.html serve Palco e Publico: so a query string separa os dois.
async function alvo(janela) {
  const alvos = await json(`http://127.0.0.1:${PORTA}/json`);
  const pagina = alvos.find(t => t.type === "page" && (
    janela === "gerencia" ? t.url.includes("host.html") :
    janela === "publico"  ? t.url.includes("player.html") && t.url.includes("tela=publico") :
                            t.url.includes("player.html") && !t.url.includes("tela=publico")));
  if (!pagina) throw new Error(`janela "${janela}" nao encontrada`);
  return pagina;
}

async function sessao(janela) {
  const ws = new WebSocket((await alvo(janela)).webSocketDebuggerUrl);
  await new Promise((ok, falha) => { ws.onopen = ok; ws.onerror = falha; });
  let id = 0;
  const chamar = (method, params = {}) => new Promise(ok => {
    const meu = ++id;
    const ouvir = ev => {
      const m = JSON.parse(ev.data);
      if (m.id === meu) { ws.removeEventListener("message", ouvir); ok(m.result); }
    };
    ws.addEventListener("message", ouvir);
    ws.send(JSON.stringify({ id: meu, method, params }));
  });
  return { chamar, fechar: () => ws.close() };
}

export async function avaliar(janela, expressao) {
  const s = await sessao(janela);
  try {
    const r = await s.chamar("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  } finally {
    s.fechar();
  }
}

export async function foto(janela, arquivo, antes) {
  if (antes) { await avaliar(janela, antes); await new Promise(r => setTimeout(r, 800)); }
  const s = await sessao(janela);
  try {
    const r = await s.chamar("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(arquivo, Buffer.from(r.data, "base64"));
    return arquivo;
  } finally {
    s.fechar();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , acao, janela = "gerencia", a, b] = process.argv;
  try {
    if (acao === "avaliar") {
      const v = await avaliar(janela, a);
      console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1));
    } else if (acao === "foto") {
      console.log("ok", await foto(janela, a, b));
    } else {
      console.error("uso: node test/cdp.mjs <avaliar|foto> <gerencia|palco|publico> ...");
      process.exit(2);
    }
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exit(1);
  }
}
