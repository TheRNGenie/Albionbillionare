// Gives the page a small, read-only bridge to the Albion Data Client link in the main process.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("albionDesktop", {
  status: () => ipcRenderer.invoke("dc:status"),
  prices: (ids, cities, qualities) => ipcRenderer.invoke("dc:prices", ids, cities, qualities),
  startClient: (pick) => ipcRenderer.invoke("dc:start", !!pick),
});
