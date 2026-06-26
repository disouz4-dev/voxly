const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const Store = require("electron-store");
const chokidar = require("chokidar");
const fs = require("fs");

// Firebase
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, query, where } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "FAKE_API_KEY",
  authDomain: "voxly-karaoke.firebaseapp.com",
  projectId: "voxly-karaoke",
  storageBucket: "voxly-karaoke.firebasestorage.app",
  messagingSenderId: "689541919299",
  appId: "1:689541919299:web:92e70bbd3a1a2709d5daf6"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const store = new Store();
// Session management
const { v4: uuidv4 } = require('uuid');
const SESSAO_ID = "sessao_default";
let currentSession = null; // { id, code, createdAt }

// Cria uma nova sessão de show
async function criarSessao() {
  const id = uuidv4();
  // gera código curto de 6 caracteres alfanuméricos (base36)
  const code = parseInt(id.replace(/-/g, ''), 16).toString(36).substring(0, 6).toUpperCase();
  const createdAt = new Date();
  currentSession = { id, code, createdAt };
  // persiste no Firestore
  await setDoc(doc(db, "sessoes", id), {
    code,
    createdAt,
    ativo: true,
  });
  // opcional: limpa sessões antigas (not implemented)
  return currentSession;
}

let hostWindow = null;
let playerWindow = null;
let musicWatcher = null;

// --- Criar janela HOST ----------------------------------------
function createHostWindow() {
  hostWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    title: "Voxly - Gerencia",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  hostWindow.loadFile(path.join(__dirname, "screens", "host.html"));
  hostWindow.on("closed", () => { hostWindow = null; app.quit(); });
}

// --- Criar janela PLAYER --------------------------------------
function createPlayerWindow() {
  playerWindow = new BrowserWindow({
    width: 1920, height: 1080,
    title: "Voxly - Palco",
    fullscreenable: true, frame: false, backgroundColor: "#000000",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  playerWindow.loadFile(path.join(__dirname, "screens", "player.html"));
  playerWindow.on("closed", () => { playerWindow = null; });
}

app.whenReady().then(async () => {
  // Cria nova sessão de show
  await criarSessao();

  createHostWindow();
  createPlayerWindow();
  const folder = store.get("musicFolder");
  if (folder && fs.existsSync(folder)) {
    startWatcher(folder);
    await sincronizarCatalogo(folder, false); // atualiza sem limpar ao iniciar
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- Sincronizar catálogo com Firestore -----------------------
async function limparCatalogo() {
  const snap = await getDocs(collection(db, "catalogo"));
  const promises = [];
  snap.forEach(d => promises.push(deleteDoc(d.ref)));
  await Promise.all(promises);
  console.log("Catálogo limpo.");
}

async function sincronizarCatalogo(folder, limpar = false) {
  if (!folder || !fs.existsSync(folder)) return;
  if (limpar) await limparCatalogo();
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  const files = fs.readdirSync(folder).filter(f => exts.includes(path.extname(f).toLowerCase()));

  for (const f of files) {
    const nome = path.basename(f, path.extname(f));
    const partes = nome.split(" - ");
    const artista = partes.length > 1 ? partes[0].trim() : "Desconhecido";
    const musica = partes.length > 1 ? partes.slice(1).join(" - ").trim() : nome.trim();
    const id = Buffer.from(f).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
    await setDoc(doc(db, "catalogo", id), {
      musica,
      artista,
      arquivo: f,
      fullPath: path.join(folder, f),
      disponivel: true,
      atualizadoEm: new Date()
    }, { merge: true });
  }

  // Notifica host
  if (hostWindow) hostWindow.webContents.send("music-folder-changed");
  console.log(`Catálogo sincronizado: ${files.length} arquivos`);
}

// --- IPC: Selecionar pasta de musicas -------------------------
ipcMain.handle("select-music-folder", async () => {
  const result = await dialog.showOpenDialog(hostWindow, {
    properties: ["openDirectory"],
    title: "Selecionar pasta de musicas",
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const folder = result.filePaths[0];
    store.set("musicFolder", folder);
    startWatcher(folder);
    await sincronizarCatalogo(folder, true); // limpa e reescreve
    return folder;
  }
  return null;
});

ipcMain.handle("get-music-folder", () => store.get("musicFolder", null));

// --- IPC: Varrer pasta e sincronizar --------------------------
ipcMain.handle("scan-music-folder", async () => {
  const folder = store.get("musicFolder", null);
  await sincronizarCatalogo(folder);
  return true;
});

// --- IPC: Listar musicas na pasta -----------------------------
ipcMain.handle("list-music-files", () => {
  const folder = store.get("musicFolder", null);
  if (!folder || !fs.existsSync(folder)) return [];
  const exts = [".mp4", ".mkv", ".avi", ".webm", ".mp3"];
  return fs.readdirSync(folder)
    .filter(f => exts.includes(path.extname(f).toLowerCase()))
    .map(f => ({ name: f, fullPath: path.join(folder, f) }));
});

// --- IPC: Resolver arquivo de uma musica ----------------------
ipcMain.handle("resolve-music-file", (_, songName, artist) => {
  const folder = store.get("musicFolder", null);
  if (!folder) return null;
  const exts = [".mp4", ".mkv", ".avi", ".webm"];
  const files = fs.readdirSync(folder);
  const query = `${songName} ${artist}`.toLowerCase().replace(/\s+/g, "");
  for (const f of files) {
    const base = path.basename(f, path.extname(f)).toLowerCase().replace(/\s+/g, "");
    if (base.includes(query) || query.includes(base)) {
      return path.join(folder, f);
    }
  }
  return null;
});

// --- IPC: Vincular arquivo manualmente ------------------------
ipcMain.handle("link-music-file", async (_, songId) => {
  const result = await dialog.showOpenDialog(hostWindow, {
    properties: ["openFile"],
    title: "Selecionar arquivo da musica",
    filters: [
      { name: "Videos", extensions: ["mp4", "mkv", "avi", "webm"] },
      { name: "Todos os arquivos", extensions: ["*"] },
    ],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const links = store.get("musicLinks", {});
    links[songId] = filePath;
    store.set("musicLinks", links);

    // Atualiza no Firestore também
    const nome = path.basename(filePath, path.extname(filePath));
    const partes = nome.split(" - ");
    const artista = partes.length > 1 ? partes[0].trim() : "Desconhecido";
    const musica = partes.length > 1 ? partes.slice(1).join(" - ").trim() : nome.trim();
    const id = Buffer.from(path.basename(filePath)).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
    await setDoc(doc(db, "catalogo", id), {
      musica,
      artista,
      arquivo: path.basename(filePath),
      fullPath: filePath,
      disponivel: true,
      atualizadoEm: new Date()
    }, { merge: true });

    return filePath;
  }
  return null;
});

ipcMain.handle("get-music-links", () => store.get("musicLinks", {}));

// --- IPC: Reproduzir musica -----------------------------------
ipcMain.handle("play-song", (_, filePath) => {
  if (playerWindow) playerWindow.webContents.send("play-video", filePath);
});

ipcMain.handle("player-command", (_, cmd) => {
  if (playerWindow) playerWindow.webContents.send("player-cmd", cmd);
});

// --- IPC: QR Code ---------------------------------------------
ipcMain.handle("get-webapp-url", () => store.get("webAppUrl", ""));
ipcMain.handle("set-webapp-url", (_, url) => store.set("webAppUrl", url));

// Start a new session (exposed to renderer)
ipcMain.handle('start-session', async () => {
  // encerra a sessão atual, se houver
  if (currentSession) {
    await setDoc(doc(db, 'sessoes', currentSession.id), { ativo: false, encerradaEm: new Date() }, { merge: true });
  }
  const sess = await criarSessao();
  return { id: sess.id, code: sess.code };
});

ipcMain.handle("get-current-session", () => {
  return currentSession ? { id: currentSession.id, code: currentSession.code } : null;
});

// List participants of current session
ipcMain.handle('list-participants', async () => {
  if (!currentSession) return [];
  const q = query(collection(db, 'participantes'), where('sessionId', '==', currentSession.id));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, nome: d.data().nome || null, joinedAt: d.data().joinedAt }));
});

ipcMain.handle("join-session", async (_, payload) => {
  const { uid, code, displayName } = payload;
  if (!currentSession || currentSession.code !== code) return { success: false, error: "Código inválido" };
  const docRef = doc(db, "participantes", uid);
  await setDoc(docRef, { sessionId: currentSession.id, joinedAt: new Date(), nome: displayName }, { merge: true });
  return { success: true };
});

// --- Watcher de pasta -----------------------------------------
function startWatcher(folder) {
  if (musicWatcher) musicWatcher.close();
  musicWatcher = chokidar.watch(folder, { ignoreInitial: true });
  musicWatcher.on("add", async (filePath) => {
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
    await sincronizarCatalogo(folder);
  });
  musicWatcher.on("unlink", async () => {
    if (hostWindow) hostWindow.webContents.send("music-folder-changed");
    await sincronizarCatalogo(folder);
  });
}
