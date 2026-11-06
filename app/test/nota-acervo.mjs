// Mede o selo de qualidade do acervo contra o master original.
//
// Para cada arquivo: acha a faixa no iTunes, baixa os 30 s de preview do
// MASTER, decodifica os dois com ffmpeg e compara pelo espectro
// (src/espectro.js). Imprime a nota, as partes e a reputacao por canal.
//
// Isto NAO mexe em banco, tela nem arquivo: e a medicao que decide se o selo
// vale a pena antes de ele existir em qualquer lugar.
//
// Uso:
//   node test/nota-acervo.mjs [quantas] [filtro no nome]
//   node test/nota-acervo.mjs 12
//   node test/nota-acervo.mjs 30 "Zoom Karaoke"

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);
const req = (await import("node:module")).createRequire(import.meta.url);
const esp = req("../src/espectro.js");
const img = req("../src/imagens.js");

const PASTA = process.env.VOXLY_ACERVO || "/Volumes/M2 portable/Karaoke";
const TAXA = 22050;
const QUANTAS = Number(process.argv[2] || 12);
const FILTRO = process.argv[3] || "";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "voxly-nota-"));

// ── acervo ────────────────────────────────────────────────
// "Artista - Musica - Canal [id].mp4" e o padrao que o acervo grava.
function partesDoNome(arquivo) {
  const base = arquivo.replace(/\.[a-z0-9]+$/i, "").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  const p = base.split(" - ").map(s => s.trim()).filter(Boolean);
  if (p.length < 2) return null;
  const artista = p[0];
  // O canal e o ultimo pedaco QUANDO fala de karaoke; senao tudo depois do
  // artista e o nome da musica.
  const ultimo = p[p.length - 1];
  const canal = p.length > 2 && /karaok|karafun|playback|vocal hero|sing king|party tyme|stingray|zoom|cc |obskure|lily|balka|master/i.test(ultimo)
    ? ultimo : null;
  const musica = (canal ? p.slice(1, -1) : p.slice(1)).join(" - ");
  return musica ? { artista, musica, canal } : null;
}

// ── iTunes ────────────────────────────────────────────────
async function faixaNoItunes(artista, musica) {
  const termo = img.termoDaCapa(artista, musica);
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&entity=musicTrack&limit=8`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("iTunes HTTP " + r.status);
  const res = (await r.json()).results || [];
  const limpo = img.tituloLimpo(musica).toLowerCase();
  const util = res.filter(x => x && x.previewUrl && !img.ehDeKaraoke(x));
  if (!util.length) return null;
  const exato = util.find(x => String(x.trackName || "").toLowerCase() === limpo);
  const contem = util.find(x => String(x.trackName || "").toLowerCase().includes(limpo));
  return exato || contem || util[0];
}

async function baixar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("preview HTTP " + r.status);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  return destino;
}

// ── audio ─────────────────────────────────────────────────
// Mono 22050, float32 cru na saida padrao. `-nostdin` porque sem isso o ffmpeg
// disputa o terminal e o script trava sem dizer por que.
function pcm(arquivo, { de = 0, duracao = 0 } = {}) {
  const args = ["-v", "error", "-nostdin"];
  if (de) args.push("-ss", String(de));
  args.push("-i", arquivo);
  if (duracao) args.push("-t", String(duracao));
  args.push("-vn", "-ac", "1", "-ar", String(TAXA), "-f", "f32le", "-");
  const buf = execFileSync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 400 });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
}

function medidas(x) {
  const e = esp.espectrograma(x);
  if (!e.length) return null;
  return {
    croma: esp.croma(e, TAXA),
    mfcc: esp.mfcc(e, TAXA),
    graves: esp.gravesDe(e, TAXA),
    fluxo: esp.fluxoEspectral(e),
    taxa: TAXA,
  };
}

// ── roda ──────────────────────────────────────────────────
const arquivos = fs.readdirSync(PASTA)
  // O disco e exFAT: o macOS cria um sidecar AppleDouble "._Nome.mp4" ao lado
  // de cada arquivo, com a mesma extensao e sem audio nenhum. Sao 386 deles
  // nesta pasta. O app ja filtra isto em main.js; aqui tambem tem de filtrar.
  .filter(f => !f.startsWith(".") && f !== ".DS_Store")
  .filter(f => /\.(mp4|mkv|webm|m4v|avi|mp3|m4a)$/i.test(f))
  .filter(f => !FILTRO || f.toLowerCase().includes(FILTRO.toLowerCase()));

console.log(`\nacervo: ${PASTA}`);
console.log(`arquivos: ${arquivos.length}${FILTRO ? ` (filtro "${FILTRO}")` : ""} — medindo ${Math.min(QUANTAS, arquivos.length)}\n`);

const linhas = [];
const porCanal = new Map();
let semOriginal = 0, falhas = 0;

for (const arquivo of arquivos.slice(0, QUANTAS)) {
  const p = partesDoNome(arquivo);
  if (!p) { console.log(`  ?  nome fora do padrao: ${arquivo}`); falhas++; continue; }
  const rotulo = `${p.artista} — ${esp ? img.tituloLimpo(p.musica) : p.musica}`;
  try {
    const faixa = await faixaNoItunes(p.artista, p.musica);
    if (!faixa) { console.log(`  —  sem original no iTunes: ${rotulo}`); semOriginal++; continue; }

    const prev = await baixar(faixa.previewUrl, path.join(TMP, "prev.m4a"));
    const mOriginal = medidas(pcm(prev));
    // A versao inteira, menos os 8 s iniciais (contagem, logo do canal).
    const mVersao = medidas(pcm(path.join(PASTA, arquivo), { de: 8, duracao: 240 }));
    const r = esp.notaDeQualidade(mOriginal, mVersao);
    if (r.nota === null) { console.log(`  !  nao deu para comparar: ${rotulo}`); falhas++; continue; }

    const pt = r.partes;
    console.log(
      `  ${String(r.nota).padStart(3)}  ${rotulo}`
      + `\n       harmonia ${String(pt.harmonia).padStart(3)}  grave ${String(pt.grave).padStart(3)}`
      + `  timbre ${String(pt.timbre).padStart(3)}  tempo ${pt.tempo === undefined ? " --" : String(pt.tempo).padStart(3)}`
      + `  | bpm ${r.bpm.original ? r.bpm.original.toFixed(0) : "?"}/${r.bpm.versao ? r.bpm.versao.toFixed(0) : "?"}`
      + `  trecho em ${r.trecho.segundos}s (cor ${r.trecho.correlacao})`
      + `\n       canal: ${p.canal || "(sem canal no nome)"} | iTunes: ${faixa.artistName} — ${faixa.trackName}`);

    linhas.push({ nota: r.nota, rotulo, canal: p.canal, partes: pt });
    const c = p.canal || "(sem canal)";
    if (!porCanal.has(c)) porCanal.set(c, []);
    porCanal.get(c).push(r.nota);
  } catch (e) {
    console.log(`  x  ${rotulo}: ${e.message}`);
    falhas++;
  }
  // O iTunes limita por IP, e estourar devolve 403 para TUDO que vier depois —
  // inclusive o autocomplete do app do cantor, que e a parte que o publico ve.
  await new Promise(r => setTimeout(r, 1300));
}

// ── resumo ────────────────────────────────────────────────
linhas.sort((a, b) => b.nota - a.nota);
console.log(`\n${"=".repeat(72)}\nordenado pela nota\n`);
for (const l of linhas) console.log(`  ${String(l.nota).padStart(3)}  ${l.rotulo}  ${l.canal ? "[" + l.canal + "]" : ""}`);

if (linhas.length) {
  const notas = linhas.map(l => l.nota).sort((a, b) => a - b);
  const q = f => notas[Math.min(notas.length - 1, Math.floor(f * (notas.length - 1)))];
  console.log(`\ndistribuicao: min ${notas[0]}  p25 ${q(0.25)}  mediana ${q(0.5)}  p75 ${q(0.75)}  max ${notas[notas.length - 1]}`);
  console.log(`media por parte: ` + ["harmonia", "grave", "timbre", "tempo"].map(k => {
    const v = linhas.map(l => l.partes[k]).filter(x => x !== undefined);
    return `${k} ${v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : "--"}`;
  }).join("  "));
}

console.log(`\nreputacao por canal (media, quantidade):`);
[...porCanal.entries()]
  .map(([c, v]) => [c, Math.round(v.reduce((s, x) => s + x, 0) / v.length), v.length])
  .sort((a, b) => b[1] - a[1])
  .forEach(([c, m, n]) => console.log(`  ${String(m).padStart(3)}  (${n})  ${c}`));

console.log(`\nmedidas: ${linhas.length}   sem original no iTunes: ${semOriginal}   falhas: ${falhas}`);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
