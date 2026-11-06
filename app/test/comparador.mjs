// Monta o comparador cego para calibrar o selo de qualidade pelo OUVIDO dele.
//
// Pedido dele em 06/11: "para eu te dizer, eu tenho que ouvir a original e eu
// tenho que ouvir as amostras, eu tenho que ter o audio dado play aqui". Sem
// isso eu estaria escolhendo o corte do selo por um numero bonito.
//
// Para cada musica: baixa os 30 s do master no iTunes, acha onde aquele trecho
// cai dentro da versao de karaoke (src/espectro.js) e recorta EXATAMENTE o
// mesmo trecho da versao. Os dois audios saem com a mesma duracao e do mesmo
// ponto da musica — comparar introducao com refrao nao diria nada.
//
// A nota fica ESCONDIDA ate ele votar: mostrar 91 antes faz ouvir o que o
// numero mandou ouvir, e a calibracao perde o valor.
//
// Uso:
//   node test/comparador.mjs "Arquivo 1.mp4" "Arquivo 2.mp4" ...
//   node test/comparador.mjs --lista arquivos.txt

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const req = (await import("node:module")).createRequire(import.meta.url);
const esp = req("../src/espectro.js");
const img = req("../src/imagens.js");
const ref = req("../src/referencia.js");

const PASTA = process.env.VOXLY_ACERVO || "/Volumes/M2 portable/Karaoke";
const SAIDA = process.env.VOXLY_SAIDA || path.join(process.cwd(), "comparador");
const TAXA = 22050;

let alvos = process.argv.slice(2);
if (alvos[0] === "--lista") {
  alvos = fs.readFileSync(alvos[1], "utf8").split("\n").map(s => s.trim()).filter(Boolean);
}
if (!alvos.length) { console.error("uso: node test/comparador.mjs <arquivo.mp4> ..."); process.exit(2); }

fs.mkdirSync(path.join(SAIDA, "audio"), { recursive: true });

function partesDoNome(arquivo) {
  const base = arquivo.replace(/\.[a-z0-9]+$/i, "").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  const p = base.split(" - ").map(s => s.trim()).filter(Boolean);
  if (p.length < 2) return null;
  const ultimo = p[p.length - 1];
  const canal = p.length > 2 && /karaok|karafun|playback|vocal hero|sing king|party tyme|stingray|zoom|cc |obskure|lily|balka|master|elite|core|atomic|musisi|clubinho|genno|rewind/i.test(ultimo)
    ? ultimo : null;
  const musica = (canal ? p.slice(1, -1) : p.slice(1)).join(" - ");
  return musica ? { artista: p[0], musica, canal } : null;
}

async function faixaNoItunes(artista, musica) {
  const termo = img.termoDaCapa(artista, musica);
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&entity=musicTrack&limit=12`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("iTunes HTTP " + r.status);
  const res = (await r.json()).results || [];
  // A escolha vive em src/referencia.js, e ela EXIGE que o artista bata. Sem
  // isso, em 06/11 o "Man in the Box" do Vitamin String Quartet entrou como
  // original e a nota comparou violinos contra instrumental de rock — ele
  // pegou de ouvido. Sem original nao ha nota: devolver null e a resposta
  // certa, nao um palpite.
  return ref.escolherOriginal(res, { artista, musica });
}


function pcm(arquivo, { de = 0, duracao = 0 } = {}) {
  const args = ["-v", "error", "-nostdin"];
  if (de) args.push("-ss", String(de));
  args.push("-i", arquivo);
  if (duracao) args.push("-t", String(duracao));
  args.push("-vn", "-ac", "1", "-ar", String(TAXA), "-f", "f32le", "-");
  const b = execFileSync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 400 });
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}

function medidas(x) {
  const e = esp.espectrograma(x);
  if (!e.length) return null;
  return {
    croma: esp.croma(e, TAXA), mfcc: esp.mfcc(e, TAXA),
    graves: esp.gravesDe(e, TAXA), fluxo: esp.fluxoEspectral(e), taxa: TAXA,
  };
}

// Recorte audivel (nao o PCM cru): m4a a 96k mono, uns 350 KB por trecho.
function recortar(entrada, de, duracao, destino) {
  execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-ss", String(de), "-i", entrada,
    "-t", String(duracao), "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "96k", destino],
    { maxBuffer: 1024 * 1024 * 50 });
  return destino;
}

const INICIO_VERSAO = 8;   // pula contagem e logo do canal
const JANELA_VERSAO = 240;

const itens = [];
for (const arquivo of alvos) {
  const cheio = path.join(PASTA, arquivo);
  if (!fs.existsSync(cheio)) { console.log(`  x  nao existe: ${arquivo}`); continue; }
  const p = partesDoNome(arquivo);
  if (!p) { console.log(`  x  nome fora do padrao: ${arquivo}`); continue; }
  try {
    const faixa = await faixaNoItunes(p.artista, p.musica);
    if (!faixa) { console.log(`  —  sem original no iTunes: ${arquivo}`); continue; }

    const slug = img.slugDoNome(`${p.artista} ${img.tituloLimpo(p.musica)} ${p.canal || ""}`).slice(0, 70);
    const orig = path.join(SAIDA, "audio", slug + "-original.m4a");
    const r = await fetch(faixa.previewUrl);
    fs.writeFileSync(orig, Buffer.from(await r.arrayBuffer()));

    const mO = medidas(pcm(orig));
    const mV = medidas(pcm(cheio, { de: INICIO_VERSAO, duracao: JANELA_VERSAO }));
    const nota = esp.notaDeQualidade(mO, mV);
    if (nota.nota === null) { console.log(`  !  nao deu para comparar: ${arquivo}`); continue; }

    // Onde o trecho do original cai dentro da versao, em segundos do ARQUIVO
    // (somando os 8 s que a analise pulou).
    const fps = TAXA / esp.SALTO;
    const segundos = INICIO_VERSAO + nota.trecho.inicio / fps;
    const duracao = Math.max(8, Math.min(30, nota.trecho.quadros / fps));
    const versao = recortar(cheio, segundos, duracao, path.join(SAIDA, "audio", slug + "-versao.m4a"));

    itens.push({
      slug,
      artista: p.artista,
      musica: img.tituloLimpo(p.musica),
      canal: p.canal || "(sem canal)",
      itunes: `${faixa.artistName} — ${faixa.trackName}`,
      nota: nota.nota,
      partes: nota.partes,
      trecho: { segundos: +segundos.toFixed(1), duracao: +duracao.toFixed(1), correlacao: nota.trecho.correlacao },
      audioOriginal: "audio/" + path.basename(orig),
      audioVersao: "audio/" + path.basename(versao),
    });
    console.log(`  ok ${String(nota.nota).padStart(3)}  ${p.artista} — ${img.tituloLimpo(p.musica)} [${p.canal || "—"}]  trecho em ${segundos.toFixed(1)}s`);
  } catch (e) {
    console.log(`  x  ${arquivo}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1300));   // o iTunes limita por IP
}

// Ordem embaralhada com semente fixa: ouvir do melhor para o pior entregaria a
// resposta pela sequencia.
let semente = 20261106;
const aleatorio = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = itens.length - 1; i > 0; i--) {
  const j = Math.floor(aleatorio() * (i + 1));
  [itens[i], itens[j]] = [itens[j], itens[i]];
}

fs.writeFileSync(path.join(SAIDA, "dados.json"), JSON.stringify(itens, null, 1));
console.log(`\n${itens.length} comparacoes em ${SAIDA}`);
