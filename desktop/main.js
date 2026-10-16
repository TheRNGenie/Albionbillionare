// Albion Billionaire for Windows: an Electron window around the same web app the Android build uses.
// The app is served from inside the package on app://albion, so it never contacts GitHub;
// the only network calls are the Albion price and player APIs (plus Google Fonts for the lettering).
const { app, BrowserWindow, protocol, net, session, shell, Menu } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const WEB = path.join(__dirname, "..", "www");
const ORIGIN = "app://albion";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// One window only; a second launch focuses the first so both don't fight over saved data.
if (!app.requestSingleInstanceLock()) app.quit();

function serveApp() {
  protocol.handle("app", (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(WEB, rel));
    if (!file.startsWith(WEB)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// Albion's player API (gameinfo) doesn't send CORS headers; a desktop app may read it anyway.
function allowGameinfo() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["https://gameinfo.albiononline.com/*", "https://gameinfo-ams.albiononline.com/*", "https://gameinfo-sgp.albiononline.com/*"] },
    (details, done) => {
      const headers = { ...details.responseHeaders };
      for (const k of Object.keys(headers)) if (k.toLowerCase() === "access-control-allow-origin") delete headers[k];
      headers["Access-Control-Allow-Origin"] = [ORIGIN];
      done({ responseHeaders: headers });
    },
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 900, minHeight: 600,
    backgroundColor: "#15100b",
    title: "Albion Billionaire",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  // Links (wiki, forum, sources) open in the normal browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
  win.loadURL(ORIGIN + "/index.html");
  return win;
}

app.setAppUserModelId("com.therngenie.albionbillionaire");
app.on("second-instance", () => {
  const [w] = BrowserWindow.getAllWindows();
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "App", submenu: [{ role: "reload", label: "Reload" }, { role: "togglefullscreen" }, { type: "separator" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
  ]));
  serveApp();
  allowGameinfo();
  createWindow();
});
app.on("window-all-closed", () => app.quit());
