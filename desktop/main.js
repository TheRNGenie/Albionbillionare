// Albion Billionaire v2 for Windows: an Electron window around the same web app the Android build uses.
// The app is served from inside the package on app://albion. The network calls are the Albion Online Data Project's
// price API (plus Google Fonts for the lettering) and GitHub only when the player presses "Check for updates".
// v2 installs next to the original app: its own app id, data folder, Data Client port and update channel.
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");
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
    if (!file.startsWith(WEB + path.sep)) return new Response("Not found", { status: 404 }); // stay inside www/
    return net.fetch(pathToFileURL(file).toString());
  });
}

/* ---------- Albion Data Client link ----------
   The official client can send what it captures to extra "private" addresses with -p, on top of its normal
   upload to the public project (-i, untouched). We listen on this PC only and keep the newest order prices. */
const PORT = 47812; // the original app listens on 47811, so both can run at once
const INGEST = `http://127.0.0.1:${PORT}`;
const CITY = { "0007": "Thetford", "1002": "Lymhurst", "2004": "Bridgewatch", "3003": "Black Market", "3005": "Caerleon", "3008": "Martlock", "4002": "Fort Sterling", "5003": "Brecilien" };
const local = { prices: new Map(), received: 0, lastAt: 0, listening: false, error: null, child: null, gold: null };
const storeFile = () => path.join(app.getPath("userData"), "data-client-prices.json");
function loadLocal() {
  try {
    const rows = JSON.parse(fs.readFileSync(storeFile(), "utf8"));
    const cutoff = Date.now() - 48 * 3600e3;
    for (const [k, v] of rows) if (Math.max(v.sellAt || 0, v.buyAt || 0) > cutoff) local.prices.set(k, v);
  } catch (e) { /* first run */ }
}
let saveTimer = null;
function saveLocal() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.writeFileSync(storeFile(), JSON.stringify([...local.prices])); } catch (e) { /* disk full or locked */ } }, 5000);
  saveTimer.unref?.(); /* before-quit saves too, so a pending save never needs to hold the app open */
}
/* New prices reach the window within a second instead of waiting for its next price reload: opening one market in game
   makes several uploads, so the markets they change are gathered for a moment and sent together. The page merges them
   into what it shows without asking the price server anything (see AB.market.capture). */
const PUSH_MS = 800;
const changed = new Set();
let pushTimer = null;
function pushSoon(keys) {
  for (const k of keys) changed.add(k);
  if (pushTimer) return;
  pushTimer = setTimeout(pushNow, PUSH_MS);
  pushTimer.unref?.();
}
function pushNow() {
  pushTimer = null;
  const rows = [];
  for (const key of changed) {
    const v = local.prices.get(key);
    const [id, city, q] = key.split("|");
    if (v) rows.push({ id, city, quality: +q, ...v });
  }
  changed.clear();
  if (rows.length) for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("dc:orders", rows);
}
function cityOf(loc) {
  const id = String(loc ?? "").split("-")[0].padStart(4, "0");
  if (CITY[id]) return CITY[id];
  if (id === "3013") return "Caerleon"; /* Caerleon's second market */
  return null; /* portals, rests and smugglers' dens are separate markets */
}
function takeOrders(body) {
  const orders = (body && body.Orders) || [];
  const batch = new Map();
  for (const o of orders) {
    const city = cityOf(o.LocationId);
    if (!city || !o.ItemTypeId || !o.UnitPriceSilver) continue;
    const lvl = +o.EnchantmentLevel || 0;
    const id = lvl && !o.ItemTypeId.includes("@") ? `${o.ItemTypeId}@${lvl}` : o.ItemTypeId;
    const key = `${id}|${city}|${o.QualityLevel || 1}`;
    const price = o.UnitPriceSilver / 10000; /* the game counts in ten-thousandths of a silver */
    const b = batch.get(key) || { sell: null, buy: null };
    if (o.AuctionType === "offer") b.sell = b.sell == null ? price : Math.min(b.sell, price);
    else if (o.AuctionType === "request") b.buy = b.buy == null ? price : Math.max(b.buy, price);
    batch.set(key, b);
  }
  const now = Date.now();
  for (const [key, b] of batch) {
    const cur = local.prices.get(key) || {};
    if (b.sell != null) { cur.sell = b.sell; cur.sellAt = now; }
    if (b.buy != null) { cur.buy = b.buy; cur.buyAt = now; }
    local.prices.set(key, cur);
  }
  if (batch.size) { local.received += batch.size; local.lastAt = now; saveLocal(); pushSoon(batch.keys()); }
}
function startIngest() {
  const server = http.createServer((req, res) => {
    /* the Data Client never sends an Origin header; a web page posting here from a browser always does */
    if (req.headers.origin) { res.writeHead(403); res.end(); return; }
    if (req.method !== "POST") { res.writeHead(200); res.end("Albion Billionaire is listening"); return; }
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 20e6) req.destroy(); else chunks.push(c); });
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (req.url.startsWith("/marketorders.ingest")) takeOrders(body);
        else if (req.url.startsWith("/goldprices.ingest") && body.Prices?.length) local.gold = { price: body.Prices[body.Prices.length - 1] / 10000, at: Date.now() };
      } catch (e) { /* ignore bad uploads */ }
      res.writeHead(200); res.end("ok");
    });
  });
  server.on("error", (e) => { local.error = e.code === "EADDRINUSE" ? `Port ${PORT} is already in use. Close other copies of the app.` : e.message; local.listening = false; });
  server.listen(PORT, "127.0.0.1", () => { local.listening = true; local.error = null; });
  server.unref(); /* the window keeps the app running, not the listener */
}
const CLIENT_PATHS = () => [
  path.join(process.env.ProgramFiles || "C:\\Program Files", "Albion Data Client", "albiondata-client.exe"),
  path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Albion Data Client", "albiondata-client.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Albion Data Client", "albiondata-client.exe"),
];
let clientPath = null;
function findClient() {
  try { const saved = fs.readFileSync(path.join(app.getPath("userData"), "data-client-path.txt"), "utf8").trim(); if (saved && fs.existsSync(saved)) return saved; } catch (e) { /* none saved */ }
  return CLIENT_PATHS().find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
}
function launchClient(exe) {
  if (local.child && local.child.exitCode == null) return { ok: true, already: true };
  try {
    /* -p adds our private address; the public upload (-i default) carries on as normal. */
    local.child = spawn(exe, ["-p", INGEST, "-minimize"], { cwd: path.dirname(exe), detached: false, windowsHide: false });
    local.child.on("exit", () => { local.child = null; });
    local.child.on("error", (e) => { local.error = "Couldn't start the Data Client: " + e.message; local.child = null; });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
/* ---------- Updates, only when the player asks ----------
   Each v2 Windows build is a GitHub release tagged v2-windows-build-N, and the app's version is 2.0.N (the original
   app looks only at windows-build-N, so the two channels never mix). The installed app downloads the newer Setup.exe
   and runs it (it upgrades in place, keeping your data); the portable one opens the release page. */
const SETUP = "Albion-Billionaire-v2-Setup.exe", PORTABLE = "Albion-Billionaire-v2-portable.exe";
const REPO = "TheRNGenie/Albionbillionare";
const DOWNLOADS = `https://github.com/${REPO}/releases/download/`;
const portable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;
const buildNo = () => +(app.getVersion().split(".")[2] || 0);
async function checkUpdate() {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases?per_page=40`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Albion-Billionaire" } });
  if (!res.ok) throw new Error(res.status === 403 ? "GitHub is limiting update checks right now. Try again in an hour." : "GitHub answered " + res.status + ".");
  const builds = (await res.json()).map((r) => ({ r, n: +((r.tag_name || "").match(/^v2-windows-build-(\d+)$/) || [])[1] || 0 })).filter((x) => x.n && !x.r.draft).sort((a, b) => b.n - a.n);
  const top = builds[0];
  if (!top) return { current: buildNo(), latest: null, portable: portable() };
  const asset = top.r.assets.find((a) => a.name === (portable() ? PORTABLE : SETUP));
  return { current: buildNo(), latest: top.n, newer: top.n > buildNo(), date: top.r.published_at, url: asset ? asset.browser_download_url : null, size: asset ? asset.size : null, page: top.r.html_url, portable: portable() };
}
async function installUpdate(win, url) {
  if (typeof url !== "string" || !url.startsWith(DOWNLOADS) || !url.endsWith("/" + SETUP)) throw new Error("That isn't this app's installer.");
  const res = await net.fetch(url);
  if (!res.ok || !res.body) throw new Error("The download failed (" + res.status + ").");
  const total = +res.headers.get("content-length") || 0;
  const file = path.join(app.getPath("temp"), SETUP);
  const out = fs.createWriteStream(file);
  const reader = res.body.getReader();
  let got = 0, shown = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once("drain", r));
    const pct = total ? Math.floor((got / total) * 100) : -1;
    if (pct !== shown) { shown = pct; win.webContents.send("upd:progress", { got, total }); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  if (total && got !== total) throw new Error("The download was cut short. Try again.");
  spawn(file, [], { detached: true, stdio: "ignore" }).unref();
  setTimeout(() => app.quit(), 500);
  return { ok: true };
}

function setupIpc() {
  ipcMain.handle("upd:check", () => checkUpdate());
  ipcMain.handle("upd:install", (e, url) => installUpdate(BrowserWindow.fromWebContents(e.sender), url));
  ipcMain.handle("upd:open", (e, url) => { if (typeof url === "string" && url.startsWith(`https://github.com/${REPO}/releases/`)) shell.openExternal(url); });
  ipcMain.handle("dc:status", () => ({ listening: local.listening, error: local.error, ingest: INGEST, received: local.received, lastAt: local.lastAt, count: local.prices.size, running: !!(local.child && local.child.exitCode == null), clientPath: clientPath || (clientPath = findClient()), gold: local.gold }));
  ipcMain.handle("dc:prices", (e, ids, cities, qualities) => {
    const out = [];
    for (const id of ids || []) for (const c of cities || []) for (const q of qualities || [1]) {
      const v = local.prices.get(`${id}|${c}|${q}`);
      if (v) out.push({ id, city: c, quality: q, ...v });
    }
    return out;
  });
  ipcMain.handle("dc:start", async (e, pick) => {
    let exe = pick ? null : clientPath || (clientPath = findClient());
    if (!exe) {
      const r = await dialog.showOpenDialog({ title: "Find albiondata-client.exe", filters: [{ name: "Albion Data Client", extensions: ["exe"] }], properties: ["openFile"] });
      if (r.canceled || !r.filePaths[0]) return { ok: false, error: "No file chosen." };
      exe = clientPath = r.filePaths[0];
      try { fs.writeFileSync(path.join(app.getPath("userData"), "data-client-path.txt"), exe); } catch (err) { /* keep in memory */ }
    }
    return launchClient(exe);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 900, minHeight: 600,
    backgroundColor: "#0b0d10",
    title: "Albion Billionaire v2",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, preload: path.join(__dirname, "preload.js") },
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

app.setAppUserModelId("com.therngenie.albionbillionaire.v2");
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
  loadLocal();
  startIngest();
  setupIpc();
  createWindow();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  try { fs.writeFileSync(storeFile(), JSON.stringify([...local.prices])); } catch (e) { /* ignore */ }
  /* the Data Client keeps running if the user started it themselves; only stop the copy we launched */
  if (local.child && local.child.exitCode == null) try { local.child.kill(); } catch (e) { /* already gone */ }
});
