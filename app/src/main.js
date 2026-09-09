const { app, BrowserWindow, ipcMain, dialog, screen, Tray, Menu } = require("electron");
const path   = require("path");
const Store  = require("electron-store");
const chokidar = require("chokidar");
const fs     = require("fs");
const http   = require("http");
const ServidorLocal = require("./local-server");
const { autoUpdater } = require("electron-updater");

const store = new Store();
const SESSAO_ID = "sessao_default";

const ICONE_APP  = path.join(__dirname, "assets", "icons", "icon.png");
const ICONE_TRAY = path.join(__dirname, "assets", "icons", "tray.png");

let hostWindow      = null;
let playerWindow    = null;
let audienceWindow  = null;
let musicWatcher    = null;
let catalogoLocal   = [];
let servidorCatalogo= null;
let servidorLocal   = null;
let tray            = null;

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
    const base   = path.basename(fullPath, path.extname(fullPath)).replace(/\s*-\s*\[[0-9a-f]{6}\]\s*$/i, "").trim();
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
  return livre ? livre.bounds : primario.bounds;
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

  playerWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width:  target.bounds.width,
    height: target.bounds.height,
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
  const bounds = escolherDisplayOcupado();

  audienceWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width:  bounds.width,
    height: bounds.height,
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
  criarTray();
  configurarAutoUpdate();
});

// ── Bandeja (tray) ─────────────────────────────────────────
function criarTray() {
  try {
    tray = new Tray(ICONE_TRAY);
    tray.setToolTip("Voxly — Karaokê");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "🎛 Abrir Gerência",  click: () => abrirHost() },
      { label: "🎥 Tela do Público", click: () => abrirAudiencia() },
      { type: "separator" },
      { label: "⏹ Sair do Voxly",   click: () => app.quit() },
    ]));
    tray.on("click", () => abrirHost());
  } catch (e) {
    console.warn("[TRAY] não foi possível criar a bandeja:", e.message);
  }
}

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
  // Com a bandeja ativa, o app continua rodando em segundo plano até sair pela bandeja
  if (!tray) {
    if (process.platform !== "darwin") app.quit();
  }
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
    const base   = path.basename(fullPath, path.extname(fullPath)).replace(/\s*-\s*\[[0-9a-f]{6}\]\s*$/i, "").trim();
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
  if (playerWindow) {
    if (playerWindow.webContents.isLoading()) {
      playerWindow.webContents.once("did-finish-load", () => {
        playerWindow.webContents.send("play-video", filePath);
      });
    } else {
      playerWindow.webContents.send("play-video", filePath);
    }
    console.log(`[PLAY] → ${filePath}`);
  }
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
