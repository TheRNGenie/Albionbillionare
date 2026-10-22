/* Boots the whole app, pages included, in jsdom (a simulated browser) for tests of what the pages do: clicks, forms,
   navigation, restored backups. Every call makes a fresh window with its own storage. The app's own scripts load in
   the order index.html lists them, from the files on disk. The price server is offline unless `net` (url -> response,
   or a throw for a failed request) stands in for it, so by default the app runs on the saved snapshot. */
import fs from "node:fs";
import path from "node:path";
import { after } from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { ROOT } from "./load.mjs";

/* The app keeps a clock running (every 30 seconds), so a window left open keeps the test process alive. A test that
   fails before its close() would hang the whole run; closing every window still open once the tests end prevents it. */
const open = new Set();
after(() => { for (const w of open) w.close(); open.clear(); });

const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SCRIPTS = [...HTML.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const PAGE = HTML.replace(/<script[\s\S]*?<\/script>/g, "");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, ms = 30000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for the app");
    await sleep(15);
  }
}
export const respond = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

export async function boot({ net = null, hash = "", storage = {} } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("error", (...a) => errors.push(a.map(String).join(" ")));
  vc.on("jsdomError", (e) => errors.push(String(e && (e.detail || e.message || e))));
  const dom = new JSDOM(PAGE, { url: "https://app.test/index.html" + hash, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  open.add(w);
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem("ab2." + k, JSON.stringify(v));
  w.fetch = async (url) => {
    const u = String(url);
    if (/^https?:/.test(u)) {
      if (!net) throw new TypeError("offline in tests");
      return net(u);
    }
    const body = fs.readFileSync(path.join(ROOT, u), "utf8");
    return respond(JSON.parse(body));
  };
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  for (const s of SCRIPTS) w.eval(fs.readFileSync(path.join(ROOT, s), "utf8"));
  const AB = w.AB;
  await until(() => AB.state.R && !AB.state.loading);
  const $ = (s) => w.document.querySelector(s);
  return {
    w, AB, errors, $,
    $$: (s) => [...w.document.querySelectorAll(s)],
    /* go to a page and let it draw */
    go: async (h) => { w.location.hash = h; await sleep(25); },
    click: (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })),
    /* type into a field and commit it, as leaving the field does */
    change: (el, value) => { el.value = String(value); el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); },
    submit: (form) => form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })),
    /* count how many times a page draws while fn runs */
    async renders(page, fn) {
      const p = AB.pages[page], orig = p.render;
      let n = 0;
      p.render = function (...a) { n++; return orig.apply(this, a); };
      try { await fn(); await sleep(25); } finally { p.render = orig; }
      return n;
    },
    /* stop background work (the Planner's grid) so the test process can end */
    close: () => { w.location.hash = "#/settings"; setTimeout(() => { w.close(); open.delete(w); }, 50); },
  };
}
