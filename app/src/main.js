const { app, BrowserWindow, ipcMain, dialog, screen } = require("electron");
const path   = require("path");
const Store  = require("electron-store");
const chokidar = require("chokidar");
const fs     = require("fs");
const http   = require("http");
const ServidorLocal = require("./local-server");
const ytBusca = require("./yt-busca");
const { montarConsulta, ordenarCandidatos } = require("./yt-busca");
const { autoUpdater } = require("electron-updater");

const store = new Store();
const SESSAO_ID = "sessao_default";

const ICONE_APP  = path.join(__dirname, "assets", "icons", "icon.png");

let hostWindow      = null;
let playerWindow    = null;
let audienceWindow  = null;
let musicWatcher    = null;
let catalogoLocal   = [];
let servidorCatalogo= null;
let servidorLocal   = null;

// ── Catálogo local ─────────────────────────────────────────

// Retorna lista de fullPaths de arquivos com extensão em `exts`, recursivamente
function listarArquivosRecursivo(dir, exts) {
  const resultado = [];
  try {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        resultado.push(...listarArquivosRecursivo(fullPath, exts));
      } else if (entrada.isFile() && exts.includes(path.extname(entrada.name).toLowerCase())) {
        resultado.push(fullPath);
      }
    }
  } catch(e) {
    console.warn(`[FS] Erro ao ler ${dir}:`, e.message);
  }
  return resultado;
}

function construirCatalogo(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  return listarArquivosRecursivo(folder, exts).map(fullPath => {
    const base   = path.basename(fullPath, path.extname(fullPath)).replace(RE_ID_SUFIXO, "").trim();
    const partes = base.split(" - ");
    return {
      artista:   partes.length >= 2 ? partes[0].trim() : "Desconhecido",
      musica:    partes.length >= 2 ? partes.slice(1).join(" - ").trim() : base,
      arquivo:   path.relative(folder, fullPath),
      disponivel: true
    };
  });
}

// ── Fotos de artistas ──────────────────────────────────────

function pastaArtistas(folder) {
  return path.join(folder, "artistas");
}

function fotoArtistaPath(folder, nome) {
  const nomeSafe = nome.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "_";
  return path.join(pastaArtistas(folder), nomeSafe, "photo.jpg");
}

let _fotoQueue        = [];
let _fotoQueueRunning = false;

async function processarFilaFotos(folder) {
  if (_fotoQueueRunning) return;
  _fotoQueueRunning = true;
  while (_fotoQueue.length) {
    const nome = _fotoQueue.shift();
    await baixarFotoArtista(nome, folder);
    await new Promise(r => setTimeout(r, 400));
  }
  _fotoQueueRunning = false;
  console.log("[ARTISTA] Download de fotos concluído.");
}

async function baixarFotoArtista(nome, folder) {
  const dest = fotoArtistaPath(folder, nome);
  if (fs.existsSync(dest)) return;
  try {
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(nome)}&entity=musicArtist&limit=3`;
    const searchResp = await net.fetch(searchUrl);
    if (!searchResp.ok) return;
    const data = await searchResp.json();
    const results = data.results || [];
    const match = results.find(r => r.artistName?.toLowerCase() === nome.toLowerCase()) || results[0];
    if (!match?.artworkUrl100) return;

    const imgUrl = match.artworkUrl100.replace("100x100bb", "600x600bb");
    const imgResp = await net.fetch(imgUrl);
    if (!imgResp.ok) return;

    const buf = Buffer.from(await imgResp.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    console.log(`[ARTISTA] ✓ ${nome}`);
  } catch(e) {
    console.warn(`[ARTISTA] Erro ${nome}:`, e.message);
  }
}

function agendarDownloadFotos(folder) {
  if (!folder || !fs.existsSync(folder)) return;
  const artistas = [...new Set(catalogoLocal.map(s => s.artista).filter(Boolean))];
  _fotoQueue = artistas.filter(nome => !fs.existsSync(fotoArtistaPath(folder, nome)));
  if (_fotoQueue.length) {
    console.log(`[ARTISTA] ${_fotoQueue.length} fotos para baixar`);
    processarFilaFotos(folder);
  }
}

// ── Servidor HTTP ──────────────────────────────────────────

// Consulta o YouTube e devolve so o que serve para uma fila de karaoke.
async function buscarKaraokeYt(termo) {
  const ytDlp = resolverBinario("yt-dlp");
  if (!ytDlp) throw new Error("yt-dlp nao encontrado no host.");

  // O cantor digita so a musica (e talvez o artista); a tag karaoke e
  // responsabilidade nossa.
  const consulta = ytBusca.montarConsulta({ musica: termo, artista: "" });

  const saida = await new Promise((resolve, reject) => {
    const proc = spawn(ytDlp, [
      `ytsearch12:${consulta}`,
      "--dump-json", "--skip-download", "--no-warnings",
      "--socket-timeout", "15",
      "--extractor-args", "youtubetab:skip=authcheck",
    ], { windowsHide: true });

    let out = "", err = "";
    proc.stdout.on("data", d => out += d.toString());
    proc.stderr.on("data", d => err += d.toString());
    proc.on("error", e => reject(new Error(`Falha ao executar o yt-dlp: ${e.message}`)));
    proc.on("close", () => out.trim() ? resolve(out) : reject(new Error(err.trim() || "busca sem resultado")));
  });

  const videos = saida.split("\n").map(l => l.trim()).filter(Boolean)
    .flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });

  const pasta = store.get("musicFolder");
  const jaTemos = idsBaixados(pasta);

  return ytBusca
    .ordenarCandidatos(videos, { musica: termo, artista: "" }, { limite: 8 })
    .map(c => ({ ...c, jaBaixado: jaTemos.has(c.id) }));
}

function iniciarServidorCatalogo() {
  if (servidorCatalogo) return;
  servidorCatalogo = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Preflight para Private Network Access (Chrome/Firefox)
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    // Busca de karaoke no YouTube. O app do cantor roda no navegador e nao
    // alcanca o yt-dlp; quem fala com ele e o host, e devolve os candidatos ja
    // filtrados e ordenados. Tambem informa o que ja existe na pasta, para a
    // interface poder dizer "toca na hora" em vez de "vai baixar".
    if (req.url.startsWith("/buscar")) {
      const q = new URL(req.url, "http://local").searchParams.get("q") || "";
      if (!q.trim()) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ candidatos: [] }));
        return;
      }
      buscarKaraokeYt(q)
        .then(candidatos => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ candidatos }));
        })
        .catch(e => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ erro: e.message }));
        });
      return;
    }

    if (req.url === "/catalogo") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(catalogoLocal));

    } else if (req.url === "/ping") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, total: catalogoLocal.length }));

    } else if (req.url.startsWith("/artista-foto/")) {
      const folder = store.get("musicFolder", null);
      if (!folder) { res.statusCode = 404; res.end(""); return; }
      const nome = decodeURIComponent(req.url.slice("/artista-foto/".length));
      const filePath = fotoArtistaPath(folder, nome);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "max-age=86400");
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.statusCode = 404; res.end("");
      }

    } else {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end("{}");
    }
  });
  servidorCatalogo.listen(7432, "0.0.0.0", () => {
    console.log(`[CATALOGO] Servidor HTTP: 0.0.0.0:7432 — ${catalogoLocal.length} músicas`);
  });
}

// ── Similaridade ───────────────────────────────────────────
function similaridade(a, b) {
  a = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  b = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  let comuns = 0;
  const setB = b.split("");
  for (const ch of a) {
    const idx = setB.indexOf(ch);
    if (idx !== -1) { comuns++; setB.splice(idx, 1); }
  }
  return (2 * comuns) / (a.length + b.length);
}

// ── Janelas ────────────────────────────────────────────────
function escolherDisplayOcupado() {
  // Displays escolhidos automaticamente, para a tela do publico evitar
  // o monitor primario (KJ) e o do palco quando houver mais monitores.
  const displays = screen.getAllDisplays();
  const primario = displays.find(d => d.bounds.x === 0 && d.bounds.y === 0) || displays[0];

  // Calcula qual display o palco usaria (mesma logica do player)
  const ext = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);
  const displayPalco = ext || primario;

  // Tela do publico: primeiro display que não seja KJ nem palco; senão, o primario.
  const livre = displays.find(d => (d.bounds.x !== 0 || d.bounds.y !== 0)
    && (d.id !== displayPalco.id));
  return livre || primario;
}

// Palco e Publico ocupam o display inteiro — o que so faz sentido quando ha
// monitor externo. Em tela unica eles cobririam por completo a Gerencia, que
// continua aberta mas invisivel atras. Nesse caso a janela e reduzida e
// encostada num canto, deixando a Gerencia alcancavel.
const PROPORCAO_TELA_UNICA = 0.6;

function geometriaSecundaria(display, canto) {
  const externo = display.bounds.x !== 0 || display.bounds.y !== 0;
  if (externo) {
    const { x, y, width, height } = display.bounds;
    return { x, y, width, height };
  }

  // workArea (e nao bounds) para a janela nao nascer sob a barra de menu / Dock.
  const area = display.workArea;
  const width  = Math.round(area.width  * PROPORCAO_TELA_UNICA);
  const height = Math.round(area.height * PROPORCAO_TELA_UNICA);
  return {
    x: canto === "esquerda" ? area.x : area.x + area.width - width,
    y: area.y + area.height - height,
    width,
    height,
  };
}

function createHostWindow() {
  hostWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 720,
    title: "Voxly - Gerência",
    icon: ICONE_APP,
    backgroundColor: "#101014",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  hostWindow.loadFile(path.join(__dirname, "screens", "host.html"));
  hostWindow.on("closed", () => { hostWindow = null; });
}

function createPlayerWindow() {
  const displays = screen.getAllDisplays();
  const extDisplay = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);
  const target = extDisplay || displays[0];
  const geo = geometriaSecundaria(target, "direita");

  playerWindow = new BrowserWindow({
    x: geo.x,
    y: geo.y,
    width:  geo.width,
    height: geo.height,
    title: "Voxly - Palco",
    icon: ICONE_APP,
    fullscreenable: true,
    frame: true,
    backgroundColor: "#07070b",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  playerWindow.loadFile(path.join(__dirname, "screens", "player.html"));
  playerWindow.webContents.once("did-finish-load", () => {
    console.log("[MAIN] Player carregado e pronto.");
  });
  playerWindow.on("closed", () => { playerWindow = null; });
}

// Tela 3: auditório/público — painel opcional ligado pelo host.
// Mostra cantor atual + música + QR codes (sem repetir o vídeo).
function createAudienceWindow() {
  const geo = geometriaSecundaria(escolherDisplayOcupado(), "esquerda");

  audienceWindow = new BrowserWindow({
    x: geo.x,
    y: geo.y,
    width:  geo.width,
    height: geo.height,
    title: "Voxly - Público",
    icon: ICONE_APP,
    fullscreenable: true,
    frame: true,
    backgroundColor: "#07070b",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  audienceWindow.loadFile(path.join(__dirname, "screens", "player.html"), {
    search: "tela=publico",
  });
  audienceWindow.once("ready-to-show", () => {
    if (hostWindow) hostWindow.webContents.send("audiencia-estado", true);
  });
  audienceWindow.on("closed", () => {
    audienceWindow = null;
    if (hostWindow) hostWindow.webContents.send("audiencia-estado", false);
  });
}

app.whenReady().then(() => {
  createHostWindow();
  createPlayerWindow();
  const folder = store.get("musicFolder");
  if (folder && fs.existsSync(folder)) {
    catalogoLocal = construirCatalogo(folder);
    startWatcher(folder);
    agendarDownloadFotos(folder);
  }
  iniciarServidorCatalogo();
  servidorLocal = new ServidorLocal({
    caminhoDados: path.join(app.getPath("userData"), "voxly-offline.json"),
  });
  servidorLocal.iniciar();
  configurarAutoUpdate();
});

function abrirHost() {
  if (hostWindow && !hostWindow.isDestroyed()) {
    if (hostWindow.isMinimized()) hostWindow.restore();
    hostWindow.show();
    hostWindow.focus();
  } else {
    createHostWindow();
  }
}

function abrirAudiencia() {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.close();
    audienceWindow = null;
  } else {
    createAudienceWindow();
  }
}

// ── Atualização automática (GitHub Releases) ────────────────
function confiarEstadoAtualizacao(estado) {
  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.webContents.send("status-atualizacao", estado);
  }
}

function configurarAutoUpdate() {
  if (!app.isPackaged) return; // sem auto-update em dev

  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[UPDATE] verificando atualizacoes...");
    confiarEstadoAtualizacao({ fase: "checando" });
  });
  autoUpdater.on("update-not-available", () => {
    console.log("[UPDATE] ja esta na versao mais recente");
    confiarEstadoAtualizacao({ fase: "atualizado" });
  });
  autoUpdater.on("update-available", () => {
    console.log("[UPDATE] nova versao disponivel");
    confiarEstadoAtualizacao({ fase: "baixando", percentual: 0 });
  });
  autoUpdater.on("error", (err) => {
    console.warn("[UPDATE] erro:", err.message);
    confiarEstadoAtualizacao({ fase: "erro", erro: err.message });
  });

  autoUpdater.on("download-progress", (p) => {
    const pct = Math.round(p.percent);
    confiarEstadoAtualizacao({ fase: "baixando", percentual: pct });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    console.log(`[UPDATE] pronto (${info.version})`);
    confiarEstadoAtualizacao({ fase: "pronto", versao: info.version });
    const janela = hostWindow || playerWindow || null;
    if (!janela) { autoUpdater.quitAndInstall(); return; }
    const { response } = await dialog.showMessageBox(janela, {
      type: "info",
      title: "Voxly — atualização disponível",
      message: `Nova versão ${info.version} instalada.`,
      detail: "Reinicie agora para aplicar a atualização?",
      buttons: ["Reiniciar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdatesAndNotify().catch((e) => console.warn("[UPDATE] falha ao checar:", e.message));
}

// ── IPC: Atualização automática ────────────────────────────
ipcMain.handle("check-for-updates", () => {
  if (!app.isPackaged) return { fase: "dev" };
  try {
    autoUpdater.checkForUpdates();
    return { fase: "checando" };
  } catch (e) {
    return { fase: "erro", erro: e.message };
  }
});

ipcMain.handle("restart-to-update", () => {
  try { autoUpdater.quitAndInstall(); return true; } catch { return false; }
});

ipcMain.handle("app-versao", () => app.getVersion());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC: Pasta de músicas ──────────────────────────────────
ipcMain.handle("select-music-folder", async () => {
  const result = await dialog.showOpenDialog(hostWindow, {
    properties: ["openDirectory"],
    title: "Selecionar pasta de músicas",
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const folder = result.filePaths[0];
    store.set("musicFolder", folder);
    catalogoLocal = construirCatalogo(folder);
    startWatcher(folder);
    agendarDownloadFotos(folder);
    console.log(`[CATALOGO] ${catalogoLocal.length} músicas carregadas de ${folder}`);
    return folder;
  }
  return null;
});

ipcMain.handle("get-music-folder", () => store.get("musicFolder", null));

ipcMain.handle("scan-music-folder", () => {
  const folder = store.get("musicFolder", null);
  if (folder) {
    catalogoLocal = construirCatalogo(folder);
    agendarDownloadFotos(folder);
    console.log(`[CATALOGO] Varredura: ${catalogoLocal.length} músicas`);
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
  }
  return catalogoLocal.length;
});

ipcMain.handle("list-music-files", () => {
  const folder = store.get("musicFolder", null);
  if (!folder || !fs.existsSync(folder)) return [];
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  return listarArquivosRecursivo(folder, exts).map(fullPath => ({
    name:     path.relative(folder, fullPath),
    fullPath
  }));
});

ipcMain.handle("select-music-files", async () => {
  const result = await dialog.showOpenDialog(hostWindow, {
    properties: ["openFile", "multiSelections"],
    title: "Selecionar arquivo(s) de música",
    filters: [
      { name: "Mídia", extensions: ["mp4", "mkv", "avi", "webm", "mp3"] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

// ── IPC: Resolver arquivo ──────────────────────────────────
ipcMain.handle("resolve-music-file", (_, songName, artist) => {
  const folder = store.get("musicFolder", null);
  if (!folder) return null;
  const exts  = [".mp4", ".mkv", ".avi", ".webm"];
  const files = listarArquivosRecursivo(folder, exts);

  // Links manuais primeiro
  const links = store.get("musicLinks", {});
  for (const filePath of Object.values(links)) {
    if (filePath && fs.existsSync(filePath)) {
      const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
      if (base.includes(songName.toLowerCase()) || base.includes(artist.toLowerCase())) {
        return filePath;
      }
    }
  }

  let melhor = null, melhorScore = 0;
  for (const fullPath of files) {
    const base   = path.basename(fullPath, path.extname(fullPath)).replace(RE_ID_SUFIXO, "").trim();
    const partes = base.split(" - ");
    let scoreArtista = 0, scoreMusica = 0;
    if (partes.length >= 2) {
      scoreArtista = similaridade(artist,   partes[0].trim());
      scoreMusica  = similaridade(songName, partes.slice(1).join(" - ").trim());
    } else {
      scoreArtista = similaridade(artist,   base);
      scoreMusica  = similaridade(songName, base);
    }
    const score = (scoreArtista * 0.4) + (scoreMusica * 0.6);
    if (score > melhorScore && score > 0.5) { melhorScore = score; melhor = fullPath; }
  }
  console.log(`[RESOLVE] "${artist} - ${songName}" score=${melhorScore.toFixed(2)} → ${melhor}`);
  return melhor;
});

// ── IPC: Vincular arquivo manualmente ─────────────────────
ipcMain.handle("link-music-file", async (_, songId) => {
  const result = await dialog.showOpenDialog(hostWindow, {
    properties: ["openFile"],
    title: "Selecionar arquivo da música",
    filters: [{ name: "Vídeos", extensions: ["mp4", "mkv", "avi", "webm"] }],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const links    = store.get("musicLinks", {});
    links[songId]  = filePath;
    store.set("musicLinks", links);
    return filePath;
  }
  return null;
});

ipcMain.handle("get-music-links", () => store.get("musicLinks", {}));

// ── IPC: Player ────────────────────────────────────────────
ipcMain.handle("play-song", (_, filePath) => {
  // O video precisa ir para o Palco E para o painel do publico: a plateia
  // acompanha a letra na tela, sem audio (o painel nasce mudo, o som e so do
  // Palco). Antes so o Palco recebia, entao a tela do publico ficava parada.
  const enviarVideo = (janela) => {
    if (!janela || janela.isDestroyed()) return;
    if (janela.webContents.isLoading()) {
      janela.webContents.once("did-finish-load", () => {
        janela.webContents.send("play-video", filePath);
      });
    } else {
      janela.webContents.send("play-video", filePath);
    }
  };

  enviarVideo(playerWindow);
  enviarVideo(audienceWindow);
  console.log(`[PLAY] → ${filePath}`);
});

ipcMain.handle("player-command", (_, cmd) => {
  if (playerWindow) {
    playerWindow.webContents.send("player-cmd", cmd);
    console.log(`[CMD] → ${String(cmd).slice(0, 80)}`);
  }
  // Tela do público recebe a mesma info (ignora vídeo se não quiser)
  if (audienceWindow) {
    audienceWindow.webContents.send("player-cmd", cmd);
  }
});

ipcMain.handle("song-ended", () => {
  if (hostWindow) hostWindow.webContents.send("song-ended");
  console.log("[MAIN] song-ended enviado ao host");
});

// ── IPC: Reabrir player ────────────────────────────────────
ipcMain.handle("open-player", () => {
  if (!playerWindow || playerWindow.isDestroyed()) {
    createPlayerWindow();
  } else {
    playerWindow.show();
    playerWindow.focus();
  }
});

// ── IPC: Tela do público (opcional) ───────────────────────
ipcMain.handle("toggle-audience", () => {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.close();
    audienceWindow = null;
  } else {
    createAudienceWindow();
  }
  return !!audienceWindow;
});

ipcMain.handle("get-audience-state", () => !!(audienceWindow && !audienceWindow.isDestroyed()));

// ── IPC: Resolve caminho completo p/ playlist de intervalo ──
ipcMain.handle("resolve-arquivo", (e, arquivo) => {
  try {
    const folder = store.get("musicFolder");
    if (!folder || !arquivo) return null;
    const fullPath = path.join(folder, arquivo);
    return fs.existsSync(fullPath) ? fullPath : null;
  } catch {
    return null;
  }
});

// ── IPC: Importa música para dentro do app (temas de intervalo) ──
function pastaTemasIntervalo() {
  return path.join(app.getPath("userData"), "intervalo-temas");
}

function copiarSemColisao(origem, pastaDestino) {
  fs.mkdirSync(pastaDestino, { recursive: true });
  const ext  = path.extname(origem);
  const base = path.basename(origem, ext);
  let destino = path.join(pastaDestino, path.basename(origem));
  let n = 2;
  while (fs.existsSync(destino)) {
    destino = path.join(pastaDestino, `${base} (${n})${ext}`);
    n++;
  }
  fs.copyFileSync(origem, destino);
  return destino;
}

ipcMain.handle("importar-musica-tema", (e, arquivo) => {
  try {
    const folder = store.get("musicFolder");
    if (!folder || !arquivo) return null;
    const origem = path.join(folder, arquivo);
    if (!fs.existsSync(origem)) return null;
    const destino = copiarSemColisao(origem, pastaTemasIntervalo());
    console.log("[TEMA] música importada para o app:", path.basename(destino));
    return destino;
  } catch (err) {
    console.warn("[TEMA] falha ao importar:", err.message);
    return null;
  }
});

ipcMain.handle("remover-musica-tema", (e, filePath) => {
  try {
    const pasta = pastaTemasIntervalo();
    const rel   = path.relative(pasta, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return false; // só apaga dentro do app
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
});

// ── IPC: Imagem externa (bypass CORS — net.fetch roda no processo principal) ──
const { net } = require('electron');
ipcMain.handle("fetch-image", async (_, url) => {
  if (!url) return null;
  try {
    const resp = await net.fetch(url);
    if (!resp.ok) return null;
    const buf  = Buffer.from(await resp.arrayBuffer());
    const mime = resp.headers.get('content-type') || 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch(e) {
    return null;
  }
});

// ── IPC: SoundTouch source para AudioWorklet ───────────────
ipcMain.handle("get-soundtouch-src", () => {
  try {
    const p = require.resolve("soundtouchjs/dist/soundtouch.js");
    // Remove export {} para funcionar em contexto não-módulo do AudioWorklet
    return fs.readFileSync(p, "utf8").replace(/^export\s*\{[^}]*\};\s*$/m, "");
  } catch(e) {
    console.error("[MAIN] soundtouchjs não encontrado:", e.message);
    return "";
  }
});

// ── IPC: IP local da máquina ───────────────────────────────
ipcMain.handle("get-local-ip", () => {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
});

// ── IPC: QR Code ───────────────────────────────────────────
ipcMain.handle("get-webapp-url", () => store.get("webAppUrl", "https://voxly-karaoke.web.app"));
ipcMain.handle("set-webapp-url", (_, url) => store.set("webAppUrl", url));
ipcMain.handle("get-local-webapp-url", () => servidorLocal ? servidorLocal.urlWeb() : null);

// ── IPC: YouTube Download ───────────────────────────────────
const { spawn } = require("child_process");
const os = require("os");

// Apps abertos pelo Finder/Launchpad nao herdam o PATH do shell: o launchd
// entrega so /usr/bin:/bin:/usr/sbin:/sbin, sem /usr/local/bin (Homebrew Intel)
// nem /opt/homebrew/bin (Apple Silicon). Chamar spawn("yt-dlp") direto so
// funcionava com o app iniciado de um terminal; no .app instalado dava
// "spawn yt-dlp ENOENT" e derrubava o processo.
const PASTAS_BIN = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  path.join(os.homedir(), ".local", "bin"),
  "/usr/bin",
  "/bin",
];

function resolverBinario(nome) {
  const salvo = store.get(`bin.${nome}`);
  if (salvo && fs.existsSync(salvo)) return salvo;
  for (const dir of PASTAS_BIN) {
    const alvo = path.join(dir, nome);
    try {
      fs.accessSync(alvo, fs.constants.X_OK);
      return alvo;
    } catch { /* segue procurando */ }
  }
  return null; // nao encontrado: quem chama decide o que dizer ao KJ
}

const YT_ARCHIVE_FILE = path.join(app.getPath("userData"), "yt-archive.txt");
const YT_DB_FILE = path.join(app.getPath("userData"), "yt-db.json");

function ytDbLoad() {
  try { return JSON.parse(fs.readFileSync(YT_DB_FILE, "utf8")); } catch { return { videos: {} }; }
}
function ytDbSave(db) { fs.writeFileSync(YT_DB_FILE, JSON.stringify(db, null, 2)); }
function ytArchiveLoad() {
  try { return new Set(fs.readFileSync(YT_ARCHIVE_FILE, "utf8").trim().split("\n").filter(Boolean)); } catch { return new Set(); }
}
function ytArchiveSave(ids) { fs.writeFileSync(YT_ARCHIVE_FILE, Array.from(ids).join("\n") + "\n"); }

// O id no nome do arquivo e a identidade da faixa. Era um MD5 de
// artista+musica, que nao aponta para lugar nenhum e ainda COLIDE: dois
// karaokes da mesma musica, de canais diferentes, geravam o mesmo id. Agora
// guardamos o id do video do YouTube, que volta ao link original
// (https://www.youtube.com/watch?v=<id>) e serve para saber se ja baixamos.
// O padrao aceita os dois formatos para nao quebrar o acervo ja existente.
const RE_ID_ARQUIVO = /\[(?:[0-9a-f]{6}|[A-Za-z0-9_-]{11})\]/;
const RE_ID_SUFIXO  = /\s*-?\s*\[(?:[0-9a-f]{6}|[A-Za-z0-9_-]{11})\]\s*$/i;
const RE_ID_VIDEO   = /\[([A-Za-z0-9_-]{11})\]/;

function gerarIdYt(nome) {
  const crypto = require("crypto");
  return crypto.createHash("md5").update(nome).digest("hex").slice(0, 6);
}

// Conjunto de ids de video ja presentes na pasta de musicas. E assim que o
// Voxly sabe que nao precisa baixar de novo.
function idsBaixados(folder) {
  const set = new Set();
  if (!folder || !fs.existsSync(folder)) return set;
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  for (const fp of listarArquivosRecursivo(folder, exts)) {
    const m = path.basename(fp).match(RE_ID_VIDEO);
    if (m) set.add(m[1]);
  }
  return set;
}

// Caminho local de um video ja baixado, ou null.
function caminhoLocalDoVideo(folder, idVideo) {
  if (!folder || !idVideo || !fs.existsSync(folder)) return null;
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  for (const fp of listarArquivosRecursivo(folder, exts)) {
    if (path.basename(fp).includes(`[${idVideo}]`)) return fp;
  }
  return null;
}

function limparNomeYt(s) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/['‘’‚‛`´]/g, "").replace(/[“”„‟]/g, "").trim().replace(/\.+$/, "");
}

function normalizarCaseYt(s) {
  if (!s) return s;
  const excecoes = new Set(['de','do','da','dos','das','e','a','o','os','as','em','no','na','nos','nas','por','para','com','sem','the','an','of','in','on','at','by','for','and','or']);
  return s.split(" ").map((p, i) => {
    if (/^[A-Z]{2,5}$/.test(p) || /^([A-Z]\.){2,}$/.test(p) || /^[A-Z]{1,3}[\/\\-][A-Z]{1,3}$/.test(p)) return p;
    if (i > 0 && excecoes.has(p.toLowerCase())) return p.toLowerCase();
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join(" ");
}

let ytCancelado = false;
let ytProcessoAtivo = null;

function enviarProgresso(info) {
  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.webContents.send("yt-progress", info);
  }
}

function extrairCanalDoTitulo(titulo, uploader, channel) {
  // Prioridade: uploader > channel > extrair do título (entre colchetes no final)
  if (uploader) return uploader;
  if (channel) return channel;
  const m = titulo.match(/\[([^\]{]{2,40})\]\s*$/);
  if (m) return m[1].trim();
  return "Desconhecido";
}

async function identificarComIA(nomeArquivo) {
  // Tenta usar Ollama local primeiro (gratuito)
  try {
    const prompt = `Extraia ARTISTA e MÚSICA do nome: "${nomeArquivo}".
Regras: 1) Ignore: karaoke, playback, HD, 4K, oficial, instrumental, backing track, legendado, "CC" ou nomes de canal. 2) Se começar com "CC" + artista (CCAESPA, CCBTS), ignore "CC". 3) Use grafia oficial. 4) Título em Title Case. 5) Se só artista, música = "Desconhecida". 6) Ordem pode ser "Artista Música" ou "Música Artista".
Responda APENAS JSON: {"artista": "...", "musica": "..."}`;

    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.2:3b", prompt, stream: false, options: { temperature: 0 } }),
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw new Error("Ollama indisponível");
    const data = await res.json();
    const txt = data.response || "";
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.artista && parsed.musica) {
        return { artista: normalizarCaseYt(parsed.artista.trim()), musica: normalizarCaseYt(parsed.musica.trim()) };
      }
    }
  } catch (e) {
    console.log("[YT] Ollama falhou:", e.message);
  }
  return null;
}

async function baixarUrl(opts) {
  const { urls, pasta, qualidade, renomear, organizar, cookies, navegador, playlist } = opts;

  const ytDlp = resolverBinario("yt-dlp");
  if (!ytDlp) {
    throw new Error(
      "yt-dlp nao encontrado. Instale com \"brew install yt-dlp ffmpeg\" " +
      "ou aponte o caminho em Configuracoes."
    );
  }

  ytCancelado = false;
  const archive = ytArchiveLoad();
  const db = ytDbLoad();
  let totalBaixados = 0;

  // --no-playlist isola o video quando a URL e "watch?v=X&list=Y", mas nao tem
  // o que isolar numa URL que ja E uma playlist ou um canal: ali ele baixa tudo
  // (medido: 183 videos numa playlist comum). Sem este aviso, colar um link
  // desses enche a pasta sem o KJ entender de onde veio.
  if (!playlist) {
    const coletiva = urls.find(u => /[?&]list=/.test(u) && /\/playlist\b/.test(u)
      || /youtube\.com\/(channel\/|user\/|@)/.test(u)
      || /[?&]list=/.test(u) && !/[?&]v=/.test(u));
    if (coletiva) {
      throw new Error(
        "Esse link e de uma playlist ou canal, nao de uma musica: baixaria varios " +
        "videos de uma vez. Cole o link de um video, ou marque \"Baixar playlist " +
        "inteira\" se e isso mesmo que voce quer."
      );
    }
  }

  for (let i = 0; i < urls.length && !ytCancelado; i++) {
    const url = urls[i];
    enviarProgresso({ status: `[${i+1}/${urls.length}] Processando: ${url}`, progress: Math.round(i/urls.length*100), log: `Iniciando: ${url}`, logTipo: 'canal' });

    const args = [
      "-f", qualidade,
      "-o", path.join(pasta, "%(title)s.%(ext)s"),
      "--download-archive", YT_ARCHIVE_FILE,
      "--no-overwrites",
      "--ignore-errors",
      "--sleep-interval", "2",
      "--max-sleep-interval", "5",
      "--extractor-args", "youtubetab:skip=authcheck",
      // Karaoke precisa tocar no QuickTime e no Finder, nao so no Chromium do
      // player. Sem fixar o contêiner, o merge de bestvideo+bestaudio pode sair
      // em mkv/webm mesmo quando as faixas escolhidas sao mp4.
      "--merge-output-format", "mp4",
    ];

    // Link copiado de dentro de uma Mix vem com "&list=" grudado, e o yt-dlp
    // trata isso como "baixe a lista inteira" — uma Mix do YouTube chega a
    // passar de mil videos. Baixa so o video pedido, a menos que o KJ marque
    // explicitamente que quer a playlist.
    args.push(playlist ? "--yes-playlist" : "--no-playlist");

    if (cookies && navegador) {
      args.push("--cookies-from-browser", navegador);
    }

    // As opcoes de video usam bestvideo+bestaudio, que o yt-dlp so consegue
    // juntar com ffmpeg — e ele tambem nao acha o binario pelo PATH aqui.
    const ffmpeg = resolverBinario("ffmpeg");
    if (ffmpeg) args.push("--ffmpeg-location", path.dirname(ffmpeg));

    // yt-dlp com progress hooks
    const child = spawn(ytDlp, [...args, url], { windowsHide: true });
    ytProcessoAtivo = child;
    let erroSpawn = null;
    child.on("error", (e) => { erroSpawn = e; });

    let arquivoBaixado = null;
    let infoVideo = {};

    child.stdout.on("data", (data) => {
      const txt = data.toString();
      // Detecta arquivo baixado
      const m = txt.match(/\[download\] Destination: (.+)/);
      if (m) arquivoBaixado = m[1].trim();
      // Progresso
      const p = txt.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (p) {
        enviarProgresso({ progress: Math.round(i/urls.length*100 + parseFloat(p[1])/urls.length), status: `Baixando ${p[1]}%` });
      }
      // Canal
      const c = txt.match(/\[info\]\s+(.+?)\s+-\s+(.+)/);
      if (c && !infoVideo.canal) {
        infoVideo.canal = c[1].trim();
      }
    });

    child.stderr.on("data", (data) => {
      const txt = data.toString();
      if (txt.includes("already been downloaded") || txt.includes("already been recorded")) {
        enviarProgresso({ log: `⏭ Já baixado (archive): ${url}`, logTipo: 'info' });
      }
    });

    await new Promise((resolve) => {
      child.on("close", (code) => {
        ytProcessoAtivo = null;
        resolve(code);
      });
      child.on("error", () => {
        ytProcessoAtivo = null;
        resolve(-1);
      });
    });

    if (erroSpawn) throw new Error(`Falha ao executar o yt-dlp: ${erroSpawn.message}`);

    if (ytCancelado) break;

    // Encontra o arquivo baixado (pode ter sido renomeado pelo yt-dlp)
    if (!arquivoBaixado || !fs.existsSync(arquivoBaixado)) {
      // Tenta achar arquivo novo na pasta
      const files = fs.readdirSync(pasta).filter(f => {
        const full = path.join(pasta, f);
        return fs.statSync(full).isFile() && [".mp4", ".mkv", ".webm", ".mp3", ".m4a"].includes(path.extname(f).toLowerCase());
      });
      // Pega o mais recente
      if (files.length) {
        files.sort((a, b) => fs.statSync(path.join(pasta, b)).mtimeMs - fs.statSync(path.join(pasta, a)).mtimeMs);
        arquivoBaixado = path.join(pasta, files[0]);
      }
    }

    if (!arquivoBaixado || !fs.existsSync(arquivoBaixado)) {
      enviarProgresso({ log: `⚠️ Arquivo não encontrado após download`, logTipo: 'erro' });
      continue;
    }

    enviarProgresso({ log: `⬇ Baixado: ${path.basename(arquivoBaixado)}`, logTipo: 'ok' });
    totalBaixados++;

    // Extrai metadados do yt-dlp (rodar novamente só para info)
    let meta = {};
    try {
      const metaChild = spawn(ytDlp, ["--skip-download", "--print-json", url], { windowsHide: true });
      let metaOut = "";
      metaChild.stdout.on("data", d => metaOut += d.toString());
      await new Promise(r => { metaChild.on("close", r); metaChild.on("error", r); });
      meta = JSON.parse(metaOut.trim().split("\n")[0]);
      infoVideo.titulo = meta.title || "";
      infoVideo.uploader = meta.uploader || "";
      infoVideo.channel = meta.channel || "";
      infoVideo.id = meta.id || "";
    } catch (e) {
      console.log("[YT] Falha ao extrair meta:", e.message);
    }

    const canal = extrairCanalDoTitulo(infoVideo.titulo || "", infoVideo.uploader, infoVideo.channel);
    const idVideo = infoVideo.id || gerarIdYt(path.basename(arquivoBaixado));

    // Salva no DB
    db.videos[idVideo] = {
      titulo: infoVideo.titulo || path.basename(arquivoBaixado),
      url,
      canal,
      artista: "",
      musica: "",
      arquivo: path.basename(arquivoBaixado),
      data: new Date().toISOString()
    };
    ytDbSave(db);

    // Renomear com IA se solicitado
    if (renomear && !ytCancelado) {
      enviarProgresso({ status: "Identificando com IA...", log: "🤖 Identificando artista/música...", logTipo: 'info' });

      const nomeLimpo = path.basename(arquivoBaixado, path.extname(arquivoBaixado))
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\([^)]{0,30}\)/g, " ")
        .replace(/\b(karaoke|playback|instrumental|backing\s*track|vers[aã]o|version|oficial|official|lyrics|legendado|hd|4k|hq|fhd|1080p|720p|full)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

      let identificado = await identificarComIA(nomeLimpo);

      if (!identificado || !identificado.artista || !identificado.musica) {
        // IA falhou - solicita edição manual
        enviarProgresso({
          status: "IA não identificou - edição manual necessária",
          log: "⚠️ IA não conseguiu identificar - abrindo edição manual",
          logTipo: 'erro'
        });

        if (hostWindow && !hostWindow.isDestroyed()) {
          hostWindow.webContents.send("yt-edit-request", {
            arquivoOriginal: arquivoBaixado,
            nomeArquivo: path.basename(arquivoBaixado),
            sugestaoArtista: identificado?.artista || "",
            sugestaoMusica: identificado?.musica || "",
            canal,
            idVideo
          });
        }

        // Aguarda confirmação manual
        await new Promise((resolve) => {
          const handler = (_e, resposta) => {
            if (resposta.idVideo === idVideo) {
              ipcMain.removeListener("yt-confirm-edit", handler);
              identificado = { artista: resposta.artista, musica: resposta.musica };
              resolve();
            }
          };
          ipcMain.on("yt-confirm-edit", handler);
        });

        if (ytCancelado) break;
      }

      if (identificado && identificado.artista && identificado.musica) {
        const artista = limparNomeYt(normalizarCaseYt(identificado.artista));
        const musica = limparNomeYt(normalizarCaseYt(identificado.musica));
        const ext = path.extname(arquivoBaixado);
        // idVideo vem do yt-dlp; o hash so entra se o video nao tiver id.
        const idHex = idVideo || gerarIdYt(artista + musica);
        // Novo formato: Artista - Música - Canal [id]
        const novoNome = `${artista} - ${musica} - ${limparNomeYt(canal)} [${idHex}]${ext}`;

        let pastaDest = pasta;
        if (organizar) {
          pastaDest = path.join(pasta, artista);
          fs.mkdirSync(pastaDest, { recursive: true });
        }

        const novoPath = path.join(pastaDest, novoNome);
        if (arquivoBaixado !== novoPath) {
          fs.renameSync(arquivoBaixado, novoPath);
          arquivoBaixado = novoPath;
        }

        db.videos[idVideo].artista = artista;
        db.videos[idVideo].musica = musica;
        db.videos[idVideo].arquivo = path.basename(arquivoBaixado);
        ytDbSave(db);

        enviarProgresso({ log: `✏️ Renomeado: ${path.basename(arquivoBaixado)}`, logTipo: 'ok' });
      }
    }

    // Adiciona ao archive
    archive.add(idVideo);
    ytArchiveSave(archive);
  }

  return { sucesso: !ytCancelado, totalBaixados, cancelado: ytCancelado };
}

ipcMain.handle("yt-download", async (_, opts) => {
  ytCancelado = false;
  try {
    const resultado = await baixarUrl(opts);
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.webContents.send("yt-done", resultado);
    }
    return resultado;
  } catch (e) {
    console.error("[YT] Erro:", e);
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.webContents.send("yt-done", { sucesso: false, erro: e.message });
    }
    return { sucesso: false, erro: e.message };
  }
});

// ── IPC: procura candidatos de karaoke no YouTube ──────────
// O app do cantor roda no navegador e nao alcanca o yt-dlp; quem busca e
// ranqueia e sempre o host. O renderer so recebe a lista pronta.
const YT_BUSCA_TIMEOUT_MS = 45000;

ipcMain.handle("yt-buscar", async (_, pedido) => {
  const ytDlp = resolverBinario("yt-dlp");
  if (!ytDlp) {
    return { sucesso: false, erro: 'yt-dlp nao encontrado. Instale com "brew install yt-dlp ffmpeg".' };
  }
  if (!pedido || !pedido.musica) {
    return { sucesso: false, erro: "Informe ao menos o nome da musica." };
  }

  const consulta = montarConsulta(pedido);
  const args = [
    `ytsearch12:${consulta}`,
    "--dump-json", "--skip-download", "--no-warnings",
    "--socket-timeout", "15",
    "--extractor-args", "youtubetab:skip=authcheck",
  ];

  return await new Promise((resolve) => {
    const child = spawn(ytDlp, args, { windowsHide: true });
    let saida = "", erroSaida = "", encerrado = false;

    // Sem isto uma busca travada deixaria a fila do KJ pendurada para sempre.
    const relogio = setTimeout(() => {
      encerrado = true;
      child.kill();
      resolve({ sucesso: false, erro: "A busca no YouTube demorou demais." });
    }, YT_BUSCA_TIMEOUT_MS);

    child.stdout.on("data", d => saida += d.toString());
    child.stderr.on("data", d => erroSaida += d.toString());

    child.on("error", (e) => {
      clearTimeout(relogio);
      if (!encerrado) resolve({ sucesso: false, erro: `Falha ao executar o yt-dlp: ${e.message}` });
    });

    child.on("close", () => {
      clearTimeout(relogio);
      if (encerrado) return;

      // Cada linha de --dump-json e um video. Uma linha corrompida nao pode
      // derrubar a busca inteira, entao o parse e por item.
      const videos = saida.split("\n").map(l => l.trim()).filter(Boolean).flatMap(l => {
        try { return [JSON.parse(l)]; } catch { return []; }
      });

      if (!videos.length) {
        const ultima = erroSaida.trim().split("\n").pop();
        resolve({ sucesso: false, erro: ultima || "Nenhum resultado encontrado." });
        return;
      }

      const candidatos = ordenarCandidatos(videos, pedido, {
        canaisPreferidos: store.get("canaisPreferidos", []),
      });
      console.log(`[YT] "${consulta}" → ${videos.length} brutos, ${candidatos.length} candidatos`);
      resolve({ sucesso: true, consulta, candidatos });
    });
  });
});

ipcMain.handle("yt-cancel", () => {
  ytCancelado = true;
  if (ytProcessoAtivo) {
    ytProcessoAtivo.kill();
    ytProcessoAtivo = null;
  }
  return true;
});

ipcMain.handle("yt-confirm-edit", (_, info) => {
  // Apenas dispara o evento para quem está aguardando
  return true;
});

// ── Watcher ────────────────────────────────────────────────
function startWatcher(folder) {
  if (musicWatcher) musicWatcher.close();
  musicWatcher = chokidar.watch(folder, { ignoreInitial: true });
  musicWatcher.on("add", () => {
    catalogoLocal = construirCatalogo(folder);
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
  });
  musicWatcher.on("unlink", () => {
    catalogoLocal = construirCatalogo(folder);
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
  });
}
