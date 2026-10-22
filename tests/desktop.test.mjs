/* The Windows app's link to the Albion Data Client (desktop/main.js), run in plain Node with a stand-in for Electron.
   The official Data Client posts what it captures to the app's address on this PC; these tests post the same uploads
   and check what the page is sent at once and what it can ask for. */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import Module, { createRequire } from "node:module";
import { ROOT } from "./load.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ab2-desktop-"));
after(() => fs.rmSync(userData, { recursive: true, force: true }));

/* ---------- Electron, as much of it as the main process touches ---------- */
const handlers = new Map(); // ipcMain.handle(channel, fn)
const pushed = []; // what the main process sent the window: { channel, data }
class BrowserWindow {
  static all = [];
  static getAllWindows() { return BrowserWindow.all; }
  static fromWebContents() { return BrowserWindow.all[0]; }
  constructor() {
    this.webContents = { send: (channel, data) => pushed.push({ channel, data: structuredClone(data) }), setWindowOpenHandler() {}, on() {} };
    BrowserWindow.all.push(this);
  }
  loadURL() {}
  isDestroyed() { return false; }
}
const electron = {
  app: { requestSingleInstanceLock: () => true, quit() {}, getPath: () => userData, getVersion: () => "2.0.0", setAppUserModelId() {}, on() {}, whenReady: () => Promise.resolve() },
  BrowserWindow,
  protocol: { registerSchemesAsPrivileged() {}, handle() {} },
  net: { fetch: async () => { throw new Error("no network in tests"); } },
  shell: { openExternal() {} },
  Menu: { setApplicationMenu() {}, buildFromTemplate: (t) => t },
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
};
const realLoad = Module._load;
Module._load = function (request, ...rest) { return request === "electron" ? electron : realLoad.call(this, request, ...rest); };
try { createRequire(import.meta.url)(path.join(ROOT, "desktop/main.js")); } finally { Module._load = realLoad; }
const ipc = (channel, ...args) => handlers.get(channel)({ sender: null }, ...args);
/* the app sets itself up once Electron is ready (a moment after loading) and then starts listening */
for (let i = 0; !handlers.has("dc:status") || !(await ipc("dc:status")).listening; i++) {
  assert.ok(i < 200, `the Data Client link never started listening: ${handlers.has("dc:status") ? (await ipc("dc:status")).error : "not set up"}`);
  await sleep(10);
}

/* ---------- the Data Client's side ---------- */
const { ingest } = await ipc("dc:status");
function post(route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(ingest + route, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end(data);
  });
}
/* One market order as the Data Client uploads it. Prices count in ten-thousandths of a silver. */
const order = (o) => ({ Id: Math.floor(Math.random() * 1e9), ItemGroupTypeId: o.ItemTypeId, QualityLevel: 1, EnchantmentLevel: 0, Amount: 3, Expires: "2026-12-01T00:00:00", ...o });
const silver = (n) => n * 10000;
const ordersOf = (rows) => rows.find((r) => r.channel === "dc:orders")?.data || [];
const byKey = (rows) => Object.fromEntries(rows.map((r) => [`${r.id}|${r.city}|${r.quality}`, r]));

test("what the Data Client captures reaches the window within a second, one push for a burst of uploads", async () => {
  const t0 = Date.now();
  /* opening a bag's market in Lymhurst: two pages of offers and the buy orders, plus a sword in Caerleon's second
     market house and an order in a market the app doesn't read */
  assert.equal(await post("/marketorders.ingest", { Orders: [
    order({ ItemTypeId: "T6_BAG", LocationId: 1002, UnitPriceSilver: silver(9000), AuctionType: "offer" }),
    order({ ItemTypeId: "T6_BAG", LocationId: 1002, UnitPriceSilver: silver(8600), AuctionType: "offer" }),
    order({ ItemTypeId: "T6_BAG", LocationId: 1002, UnitPriceSilver: silver(7000), AuctionType: "request" }),
    order({ ItemTypeId: "T6_BAG", LocationId: 1002, UnitPriceSilver: silver(7200), AuctionType: "request" }),
    order({ ItemTypeId: "T6_BAG", LocationId: 1002, QualityLevel: 3, UnitPriceSilver: silver(12000), AuctionType: "offer" }),
  ] }), 200);
  await sleep(100);
  assert.equal(await post("/marketorders.ingest", { Orders: [
    order({ ItemTypeId: "T6_BAG", LocationId: 1002, UnitPriceSilver: silver(8500), AuctionType: "offer" }),
    order({ ItemTypeId: "T4_MAIN_SWORD", EnchantmentLevel: 2, LocationId: "3013-Auction2", UnitPriceSilver: silver(15000), AuctionType: "offer" }),
    order({ ItemTypeId: "T4_MAIN_SWORD", LocationId: "0301", UnitPriceSilver: silver(100), AuctionType: "offer" }),
  ] }), 200);
  assert.equal(pushed.length, 0, "gathered for a moment first");
  for (let i = 0; !pushed.length; i++) { assert.ok(i < 300, "nothing was pushed"); await sleep(10); }
  const wait = Date.now() - t0;
  assert.ok(wait < 1500, `pushed after ${wait} ms`);
  await sleep(1000);
  assert.equal(pushed.length, 1, "both uploads in one push");
  const got = byKey(ordersOf(pushed));
  assert.deepEqual(Object.keys(got).sort(), ["T4_MAIN_SWORD@2|Caerleon|1", "T6_BAG|Lymhurst|1", "T6_BAG|Lymhurst|3"]);
  const bag = got["T6_BAG|Lymhurst|1"];
  assert.equal(bag.sell, 8500, "the cheapest offer of the latest upload");
  assert.equal(bag.buy, 7200, "the best buy order");
  assert.ok(bag.sellAt >= t0 && bag.buyAt >= t0 && bag.sellAt <= Date.now());
  assert.equal(got["T6_BAG|Lymhurst|3"].sell, 12000);
  assert.equal(got["T4_MAIN_SWORD@2|Caerleon|1"].sell, 15000);
});

test("the page can ask for the same prices, by item, market and quality", async () => {
  const rows = await ipc("dc:prices", ["T6_BAG", "T4_MAIN_SWORD@2", "T8_BAG"], ["Lymhurst", "Caerleon", "Martlock"], [1]);
  assert.deepEqual(rows.map((r) => `${r.id}|${r.city}|${r.quality}`).sort(), ["T4_MAIN_SWORD@2|Caerleon|1", "T6_BAG|Lymhurst|1"]);
  assert.equal(rows.find((r) => r.id === "T6_BAG").sell, 8500);
  const st = await ipc("dc:status");
  assert.equal(st.count, 3);
  assert.ok(Date.now() - st.lastAt < 5000);
});

test("only the Data Client can post: a web page (which always sends an Origin) is turned away", async () => {
  pushed.length = 0;
  const before = await ipc("dc:prices", ["T6_BAG"], ["Lymhurst"], [1]);
  assert.equal(await post("/marketorders.ingest", { Orders: [order({ ItemTypeId: "T6_BAG", LocationId: 1002, UnitPriceSilver: silver(1), AuctionType: "offer" })] }, { Origin: "https://example.com" }), 403);
  await sleep(1000);
  assert.equal(pushed.length, 0);
  assert.deepEqual(await ipc("dc:prices", ["T6_BAG"], ["Lymhurst"], [1]), before);
});

test("an upload with nothing the app reads pushes nothing", async () => {
  pushed.length = 0;
  assert.equal(await post("/marketorders.ingest", { Orders: [order({ ItemTypeId: "T5_PLANKS", LocationId: "0301", UnitPriceSilver: silver(50), AuctionType: "offer" })] }), 200);
  assert.equal(await post("/marketorders.ingest", "not orders"), 200);
  await sleep(1000);
  assert.equal(pushed.length, 0);
});
