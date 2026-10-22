// Gives the page a small bridge to the main process: the Albion Data Client link and the update button.
const { contextBridge, ipcRenderer } = require("electron");
/* Listen on a channel; the returned function stops listening. */
const listen = (channel, cb) => {
  const fn = (e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => { ipcRenderer.removeListener(channel, fn); };
};
contextBridge.exposeInMainWorld("albionDesktop", {
  status: () => ipcRenderer.invoke("dc:status"),
  prices: (ids, cities, qualities) => ipcRenderer.invoke("dc:prices", ids, cities, qualities),
  /* prices the Data Client captures, pushed within a second: [{ id, city, quality, sell, sellAt, buy, buyAt }] */
  onPrices: (cb) => listen("dc:orders", cb),
  startClient: (pick) => ipcRenderer.invoke("dc:start", !!pick),
  checkUpdate: () => ipcRenderer.invoke("upd:check"),
  installUpdate: (url) => ipcRenderer.invoke("upd:install", url),
  openPage: (url) => ipcRenderer.invoke("upd:open", url),
  onUpdateProgress: (cb) => listen("upd:progress", cb),
});
