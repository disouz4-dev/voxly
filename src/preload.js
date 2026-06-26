const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectMusicFolder:  () => ipcRenderer.invoke("select-music-folder"),
  getMusicFolder:     () => ipcRenderer.invoke("get-music-folder"),
  scanMusicFolder:    () => ipcRenderer.invoke("scan-music-folder"),
  listMusicFiles:     () => ipcRenderer.invoke("list-music-files"),
  resolveMusicFile:   (song, artist) => ipcRenderer.invoke("resolve-music-file", song, artist),
  linkMusicFile:      (songId) => ipcRenderer.invoke("link-music-file", songId),
  getMusicLinks:      () => ipcRenderer.invoke("get-music-links"),
  playSong:           (filePath) => ipcRenderer.invoke("play-song", filePath),
  playerCommand:      (cmd) => ipcRenderer.invoke("player-command", cmd),
  getWebAppUrl:       () => ipcRenderer.invoke("get-webapp-url"),
  setWebAppUrl:       (url) => ipcRenderer.invoke("set-webapp-url", url),

  // Generic invoke for any channel not explicitly exposed
  invoke:            (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  onMusicFolderChanged: (cb) => ipcRenderer.on("music-folder-changed", cb),
  onPlayVideo:          (cb) => ipcRenderer.on("play-video", (_e, fp) => cb(fp)),
  onPlayerCmd:          (cb) => ipcRenderer.on("player-cmd", (_e, cmd) => cb(cmd)),
});
