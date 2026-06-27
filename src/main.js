const { app, BrowserWindow, ipcMain, dialog, screen } = require("electron");
const path   = require("path");
const Store  = require("electron-store");
const chokidar = require("chokidar");
const fs     = require("fs");
const http   = require("http");

const store = new Store();
const SESSAO_ID = "sessao_default";

let hostWindow      = null;
let playerWindow    = null;
let musicWatcher    = null;
let catalogoLocal   = [];
let servidorCatalogo= null;

// ── Catálogo local ─────────────────────────────────────────
function construirCatalogo(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  return fs.readdirSync(folder)
    .filter(f => exts.includes(path.extname(f).toLowerCase()))
    .map(f => {
      const base   = path.basename(f, path.extname(f)).replace(/\s*-\s*\[[0-9a-f]{6}\]\s*$/i, "").trim();
      const partes = base.split(" - ");
      return {
        artista:   partes.length >= 2 ? partes[0].trim() : "Desconhecido",
        musica:    partes.length >= 2 ? partes.slice(1).join(" - ").trim() : base,
        arquivo:   f,
        disponivel: true
      };
    });
}

function iniciarServidorCatalogo() {
  if (servidorCatalogo) return;
  servidorCatalogo = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/catalogo") {
      res.end(JSON.stringify(catalogoLocal));
    } else if (req.url === "/ping") {
      res.end(JSON.stringify({ ok: true, total: catalogoLocal.length }));
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  servidorCatalogo.listen(7432, "127.0.0.1", () => {
    console.log(`[CATALOGO] Servidor HTTP local: http://127.0.0.1:7432 — ${catalogoLocal.length} músicas`);
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
function createHostWindow() {
  hostWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    title: "Voxly - Gerência",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  hostWindow.loadFile(path.join(__dirname, "screens", "host.html"));
  hostWindow.on("closed", () => { hostWindow = null; app.quit(); });
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
    fullscreenable: true,
    frame: true,
    backgroundColor: "#000000",
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

app.whenReady().then(() => {
  createHostWindow();
  createPlayerWindow();
  const folder = store.get("musicFolder");
  if (folder && fs.existsSync(folder)) {
    catalogoLocal = construirCatalogo(folder);
    startWatcher(folder);
  }
  iniciarServidorCatalogo();
});

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
    console.log(`[CATALOGO] Varredura: ${catalogoLocal.length} músicas`);
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
  }
  return catalogoLocal.length;
});

ipcMain.handle("list-music-files", () => {
  const folder = store.get("musicFolder", null);
  if (!folder || !fs.existsSync(folder)) return [];
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  return fs.readdirSync(folder)
    .filter(f => exts.includes(path.extname(f).toLowerCase()))
    .map(f => ({ name: f, fullPath: path.join(folder, f) }));
});

// ── IPC: Resolver arquivo ──────────────────────────────────
ipcMain.handle("resolve-music-file", (_, songName, artist) => {
  const folder = store.get("musicFolder", null);
  if (!folder) return null;
  const exts  = [".mp4", ".mkv", ".avi", ".webm"];
  const files = fs.readdirSync(folder).filter(f => exts.includes(path.extname(f).toLowerCase()));

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
  for (const f of files) {
    const base   = path.basename(f, path.extname(f)).replace(/\s*-\s*\[[0-9a-f]{6}\]\s*$/i, "").trim();
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
    if (score > melhorScore && score > 0.5) { melhorScore = score; melhor = path.join(folder, f); }
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

// ── IPC: QR Code ───────────────────────────────────────────
ipcMain.handle("get-webapp-url", () => store.get("webAppUrl", "https://voxly-karaoke.web.app"));
ipcMain.handle("set-webapp-url", (_, url) => store.set("webAppUrl", url));

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
