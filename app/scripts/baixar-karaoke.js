#!/usr/bin/env node
"use strict";

// Baixa karaokê direto para a pasta do acervo, sem passar pelo app.
//
// Nasceu no show de 22/10, quando a busca do Voxly levava 162 s por música e o
// KJ ficava no sufoco esperando. Aqui a busca é a página de resultados do
// YouTube (menos de 1 s) e o download é um yt-dlp só, em 720p.
//
// Uso:
//   node app/scripts/baixar-karaoke.js "Artista - Música" ["Outro - Música"...]
//
// A escolha do candidato é a do busca-rapida.js: só vale título que tenha
// TODAS as palavras da música pedida. Não achando, ele avisa e NÃO baixa —
// música errada no palco é pior que música faltando.

const { execFile, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { extrairCandidatos, escolherCandidato, nomeDeArquivo } = require("../src/busca-rapida");

const QUALIDADE = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]";

function pastaDoAcervo() {
  // Mesma pasta que o app usa: ela está no config.json do electron-store.
  const cfg = path.join(os.homedir(), "Library", "Application Support", "voxly", "config.json");
  try {
    const pasta = JSON.parse(fs.readFileSync(cfg, "utf8")).musicFolder;
    if (pasta && fs.existsSync(pasta)) return pasta;
  } catch (_) { /* cai no erro abaixo */ }
  return null;
}

function binarioYtDlp() {
  const proprio = path.join(os.homedir(), "Library", "Application Support", "voxly", "bin", "yt-dlp");
  if (fs.existsSync(proprio)) return proprio;
  for (const d of ["/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local/bin")]) {
    const alvo = path.join(d, "yt-dlp");
    if (fs.existsSync(alvo)) return alvo;
  }
  return null;
}

function ffmpegDir() {
  for (const d of ["/opt/homebrew/bin", "/usr/local/bin"]) {
    if (fs.existsSync(path.join(d, "ffmpeg"))) return d;
  }
  return null;
}

// "Artista - Música" → { artista, musica }. Sem o " - ", tudo é música.
function separar(entrada) {
  const partes = String(entrada).split(/\s+[-–—]\s+/);
  return partes.length >= 2
    ? { artista: partes[0].trim(), musica: partes.slice(1).join(" - ").trim() }
    : { artista: "", musica: String(entrada).trim() };
}

async function buscar(termo) {
  const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(termo);
  const resp = await fetch(url, { headers: { "Accept-Language": "pt-BR,pt;q=0.9" } });
  if (!resp.ok) throw new Error(`YouTube respondeu ${resp.status}`);
  return extrairCandidatos(await resp.text());
}

function baixar(ytDlp, id, destino) {
  const args = [
    "-f", QUALIDADE, "-o", destino, "--no-overwrites", "-N", "4",
    "--merge-output-format", "mp4", "--no-playlist",
  ];
  const dir = ffmpegDir();
  if (dir) args.push("--ffmpeg-location", dir);
  args.push("--", `https://www.youtube.com/watch?v=${id}`);
  execFileSync(ytDlp, args, { stdio: "ignore" });
}

function conferir(arquivo) {
  const dir = ffmpegDir();
  if (!dir) return "(sem ffprobe para conferir)";
  const saida = execFileSync(path.join(dir, "ffprobe"),
    ["-v", "error", "-show_entries", "stream=codec_type", "-show_entries", "format=duration",
     "-of", "default=nw=1:nk=1", arquivo], { encoding: "utf8" });
  const linhas = saida.trim().split("\n");
  const dur = Number(linhas[linhas.length - 1]);
  const temVideo = linhas.includes("video");
  const temAudio = linhas.includes("audio");
  return `${temVideo ? "vídeo" : "SEM VÍDEO"} + ${temAudio ? "áudio" : "SEM ÁUDIO"}` +
         (Number.isFinite(dur) ? `, ${(dur / 60).toFixed(1)} min` : "");
}

(async () => {
  const pedidos = process.argv.slice(2);
  if (!pedidos.length) {
    console.error('Uso: node app/scripts/baixar-karaoke.js "Artista - Música" ["Artista - Música"...]');
    process.exit(2);
  }
  const pasta = pastaDoAcervo();
  const ytDlp = binarioYtDlp();
  if (!pasta) { console.error("Não achei a pasta de músicas no config.json do Voxly."); process.exit(1); }
  if (!ytDlp) { console.error("Não achei o yt-dlp."); process.exit(1); }

  let faltaram = 0;
  for (const entrada of pedidos) {
    const { artista, musica } = separar(entrada);
    console.log(`\n── ${artista ? artista + " - " : ""}${musica}`);
    try {
      const candidatos = await buscar(`${artista} ${musica} karaoke`.trim());
      const escolhido = escolherCandidato(candidatos, { artista, musica });
      if (!escolhido) {
        faltaram++;
        console.log("   NÃO ACHEI karaokê com esse nome. Candidatos vistos:");
        for (const c of candidatos.slice(0, 5)) console.log(`     ${c.id} | ${c.titulo.slice(0, 64)}`);
        console.log("   (nenhum tinha todas as palavras da música — não baixei para não tocar a errada)");
        continue;
      }
      console.log(`   escolhido: ${escolhido.id} | ${escolhido.titulo.slice(0, 64)}`);
      const base = nomeDeArquivo({ artista, musica, canal: "", id: escolhido.id });
      baixar(ytDlp, escolhido.id, path.join(pasta, `${base}.%(ext)s`));
      const arquivo = fs.readdirSync(pasta).find(n => n.includes(`[${escolhido.id}]`) && n.endsWith(".mp4") && !n.startsWith("._"));
      if (!arquivo) { faltaram++; console.log("   o download não gerou arquivo."); continue; }
      const cheio = path.join(pasta, arquivo);
      const mb = (fs.statSync(cheio).size / 1048576).toFixed(1);
      console.log(`   PRONTO ${mb} MB — ${conferir(cheio)}`);
      console.log(`   ${arquivo}`);
    } catch (e) {
      faltaram++;
      console.log(`   FALHOU: ${e.message}`);
    }
  }
  console.log(faltaram ? `\n${faltaram} pedido(s) sem arquivo.` : "\nTodas prontas.");
})();
