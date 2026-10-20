// Gives the page a small bridge to the main process: the Albion Data Client link, the update button and Murder Ledger.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("albionDesktop", {
  status: () => ipcRenderer.invoke("dc:status"),
  prices: (ids, cities, qualities) => ipcRenderer.invoke("dc:prices", ids, cities, qualities),
  startClient: (pick) => ipcRenderer.invoke("dc:start", !!pick),
  checkUpdate: () => ipcRenderer.invoke("upd:check"),
  installUpdate: (url) => ipcRenderer.invoke("upd:install", url),
  openPage: (url) => ipcRenderer.invoke("upd:open", url),
  murderLedger: async (url) => {
    const r = await ipcRenderer.invoke("ml:get", url);
    if (!r || !r.ok) throw Object.assign(new Error((r && r.error) || "Murder Ledger didn't answer."), { status: r && r.status });
    return r.json;
  },
  onUpdateProgress: (cb) => ipcRenderer.on("upd:progress", (e, p) => cb(p)),
});
