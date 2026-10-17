// Gives the page a small bridge to the main process: the Albion Data Client link and the update button.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("albionDesktop", {
  status: () => ipcRenderer.invoke("dc:status"),
  prices: (ids, cities, qualities) => ipcRenderer.invoke("dc:prices", ids, cities, qualities),
  startClient: (pick) => ipcRenderer.invoke("dc:start", !!pick),
  checkUpdate: () => ipcRenderer.invoke("upd:check"),
  installUpdate: (url) => ipcRenderer.invoke("upd:install", url),
  openPage: (url) => ipcRenderer.invoke("upd:open", url),
  onUpdateProgress: (cb) => ipcRenderer.on("upd:progress", (e, p) => cb(p)),
});
