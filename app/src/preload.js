const { contextBridge, ipcRenderer } = require("electron");

const canaisPermitidos = new Set([
  "decode-qr",
  "join-session",
  "fetch-image",
  "open-player",
  "select-music-files"
]);

contextBridge.exposeInMainWorld("electronAPI", {
  selectMusicFolder:  () => ipcRenderer.invoke("select-music-folder"),
  getMusicFolder:     () => ipcRenderer.invoke("get-music-folder"),
  getPrefsDownload:   () => ipcRenderer.invoke("get-prefs-download"),
  setPrefsDownload:   (p) => ipcRenderer.invoke("set-prefs-download", p),
  localizarVideo:     (idVideo) => ipcRenderer.invoke("localizar-video", idVideo),
  versoesLocais:      (pedido) => ipcRenderer.invoke("versoes-locais", pedido),
  apagarArquivo:      (nome) => ipcRenderer.invoke("apagar-arquivo", nome),
  resolverArquivoItem:(item) => ipcRenderer.invoke("resolver-arquivo-item", item),
  piperVozes:         () => ipcRenderer.invoke("piper-vozes"),
  piperInstalado:     () => ipcRenderer.invoke("piper-instalado"),
  piperInstalar:      (voz) => ipcRenderer.invoke("piper-instalar", voz),
  onPiperProgresso:   (cb) => ipcRenderer.on("piper-progresso", (_e, etapa) => cb(etapa)),
  piperFalar:         (texto, voz) => ipcRenderer.invoke("piper-falar", { texto, voz }),
  scanMusicFolder:    () => ipcRenderer.invoke("scan-music-folder"),
  listMusicFiles:     () => ipcRenderer.invoke("list-music-files"),
  resolveMusicFile:   (song, artist) => ipcRenderer.invoke("resolve-music-file", song, artist),
  resolveArquivo:     (arquivo) => ipcRenderer.invoke("resolve-arquivo", arquivo),
  importarMusicaTema: (arquivo) => ipcRenderer.invoke("importar-musica-tema", arquivo),
  removerMusicaTema:  (filePath) => ipcRenderer.invoke("remover-musica-tema", filePath),
  checkForUpdates:    () => ipcRenderer.invoke("check-for-updates"),
  restartToUpdate:    () => ipcRenderer.invoke("restart-to-update"),
  appVersao:          () => ipcRenderer.invoke("app-versao"),
  linkMusicFile:      (songId) => ipcRenderer.invoke("link-music-file", songId),
  getMusicLinks:      () => ipcRenderer.invoke("get-music-links"),
  playSong:           (filePath) => ipcRenderer.invoke("play-song", filePath),
  sincronizarPublico: (filePath, tempo) => ipcRenderer.invoke("sincronizar-publico", { filePath, tempo }),
  playerCommand:      (cmd) => ipcRenderer.invoke("player-command", cmd),
  getWebAppUrl:       () => ipcRenderer.invoke("get-webapp-url"),
  setWebAppUrl:       (url) => ipcRenderer.invoke("set-webapp-url", url),
  getLocalWebAppUrl:  () => ipcRenderer.invoke("get-local-webapp-url"),
  toggleAudience:     () => ipcRenderer.invoke("toggle-audience"),
  getAudienceState:   () => ipcRenderer.invoke("get-audience-state"),
  onAudienceState:    (cb) => ipcRenderer.on("audiencia-estado", (_e, ativa) => cb(ativa)),

  // YouTube Download
  ytBuscar:           (pedido) => ipcRenderer.invoke("yt-buscar", pedido),
  ytDownload:         (opts) => ipcRenderer.invoke("yt-download", opts),
  ytCancel:           () => ipcRenderer.invoke("yt-cancel"),
  onYtProgress:       (cb) => ipcRenderer.on("yt-progress", (_e, info) => cb(info)),
  onYtDone:           (cb) => ipcRenderer.on("yt-done", (_e, info) => cb(info)),
  onYtEditRequest:    (cb) => ipcRenderer.on("yt-edit-request", (_e, info) => cb(info)),
  ytConfirmEdit:      (info) => ipcRenderer.invoke("yt-confirm-edit", info),

  // Invoke restrito a canais explicitamente permitidos
  invoke:            (channel, ...args) => {
    if (canaisPermitidos.has(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Canal IPC nao permitido: ${channel}`));
  },

  onMusicFolderChanged: (cb) => ipcRenderer.on("music-folder-changed", cb),
  onUpdateStatus:       (cb) => ipcRenderer.on("status-atualizacao", (_e, info) => cb(info)),
  songEnded:            () => ipcRenderer.invoke("song-ended"),
  onSongEnded:          (cb) => ipcRenderer.on("song-ended", cb),
  onPlayVideo:          (cb) => ipcRenderer.on("play-video", (_e, fp, t) => cb(fp, t)),
  onPlayerCmd:          (cb) => ipcRenderer.on("player-cmd", (_e, cmd) => cb(cmd)),
  pedirEstado:          () => ipcRenderer.send("pedir-estado"),
  onPedirEstado:        (cb) => ipcRenderer.on("pedir-estado", () => cb()),
});
