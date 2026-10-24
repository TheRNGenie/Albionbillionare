/* Loads the app's browser scripts into Node for testing. The app is plain classic scripts that hang everything on
   window.AB, so the tests give them the few browser globals they touch (localStorage, fetch for local files,
   matchMedia, a document stub) and run them in this process, in the same order index.html does. By default the price
   server is unreachable, so the market loads the saved snapshot: tests are fast, offline and repeatable. A test can
   pass `net` (url -> response) to stand in for the price server instead. Node runs each test file in its own process,
   so every file gets a fresh app. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENGINE = ["core/util.js", "core/stats.js", "core/store.js", "core/clock.js", "core/catalog.js", "core/api.js", "core/confidence.js", "core/notify.js", "engine/market.js", "engine/scanners.js", "engine/spec.js", "engine/sim.js", "engine/alerts.js"];

let loaded = null;
export function loadAB({ net = null } = {}) {
  if (loaded) return loaded;
  const ls = new Map();
  Object.assign(globalThis, {
    window: globalThis,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: { querySelector: () => null, documentElement: { dataset: {} } },
    fetch: async (url) => {
      if (/^https?:/.test(String(url))) {
        if (!net) throw new Error("offline in tests");
        return net(String(url));
      }
      const body = fs.readFileSync(path.join(ROOT, String(url)), "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
    },
  });
  for (const f of ENGINE) vm.runInThisContext(fs.readFileSync(path.join(ROOT, "assets/js", f), "utf8"), { filename: f });
  loaded = globalThis.AB;
  return loaded;
}

/* The market and a full scan, built once per test file. */
let market = null;
export async function scanned() {
  const AB = loadAB();
  if (!market) {
    const M = await AB.market.load({});
    market = { M, R: AB.scan.run(M) };
  }
  return { AB, ...market };
}
