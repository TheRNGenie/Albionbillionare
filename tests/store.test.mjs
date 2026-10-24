/* Settings and the ledger: what the store accepts from the pages, and from backup files, which anyone can edit. */
import test from "node:test";
import assert from "node:assert/strict";
import { loadAB } from "./load.mjs";

const { store } = loadAB();
const keep = JSON.parse(store.exportAll());
const restore = () => { store.importAll(JSON.stringify(keep)); };

test("a setting takes only values it can hold, and numbers are kept in range", (t) => {
  t.after(restore);
  assert.equal(store.set("theme", "neon"), false);
  assert.equal(store.get("theme"), keep.settings.theme);
  assert.equal(store.set("hours", "3"), false, "text isn't a number");
  assert.equal(store.set("hours", NaN), false);
  assert.equal(store.set("hours", 100), true);
  assert.equal(store.get("hours"), 24, "a day has 24 hours");
  assert.equal(store.set("capital", -5), true);
  assert.equal(store.get("capital"), 0);
  assert.equal(store.set("premium", "yes"), false);
  assert.equal(store.set("deadline", "2027-13-01"), false);
  assert.equal(store.set("deadline", "2027-03-01"), true);
  assert.equal(store.set("watch", ["T4_BAG", "T4_BAG", '"><img src=x>', 7]), true);
  assert.deepEqual(store.get("watch"), ["T4_BAG"]);
  assert.equal(store.set("refineSpec", { wood: 1e9, ore: "x" }), true);
  assert.deepEqual(store.get("refineSpec"), { wood: 60000, ore: 0, hide: 0, fiber: 0, rock: 0 });
  assert.equal(store.set("not a setting", 1), false);
});

test("a check-in needs a real amount and date", (t) => {
  t.after(restore);
  const n = store.ledger.worth.length;
  for (const v of [-1, NaN, Infinity, "lots"]) assert.equal(store.addWorth(v), false, String(v));
  assert.equal(store.addWorth(5e6, NaN), false);
  assert.equal(store.ledger.worth.length, n);
  assert.equal(store.addWorth("40000000"), true);
  assert.equal(store.get("netWorth"), 40e6);
  assert.equal(store.ledger.worth.length, n + 1);
});

test("a backup comes back as it was saved", (t) => {
  t.after(restore);
  store.set("capital", 33e6);
  store.set("server", "europe");
  store.addTrade({ key: "k", title: "A trade", kind: "bm", item: "T4_BAG", qty: 3, cost: 9e6, note: "n", pred: { p10: -1, p50: 2, p90: 5 }, score: 61, result: 1.5 });
  store.addWorth(41e6, Date.parse("2026-10-01T12:00:00Z"));
  const saved = store.exportAll();
  store.set("capital", 1);
  store.set("server", "east");
  store.removeTrade(0);
  assert.equal(store.importAll(saved), 0);
  assert.equal(store.get("capital"), 33e6);
  assert.equal(store.get("server"), "europe");
  assert.equal(store.ledger.trades[0].title, "A trade");
  assert.equal(store.ledger.trades[0].result, 1.5);
  assert.deepEqual({ ...store.ledger.trades[0].pred }, { p10: -1, p50: 2, p90: 5 });
});

test("a doctored backup keeps only what it may, and a broken ledger leaves yours alone", (t) => {
  t.after(restore);
  store.addTrade({ key: "mine", title: "Mine", kind: "bm", item: "T4_BAG", qty: 1, cost: 1, note: "", pred: null, score: 50, result: null });
  const mine = store.ledger.trades.length;
  const refused = store.importAll(JSON.stringify({ app: "albion-billionaire-v2", settings: { hours: "2", theme: 4, capital: 12e6, made_up: 1 }, ledger: "gone" }));
  assert.equal(refused, 3, "hours, theme and the ledger; unknown settings are ignored");
  assert.equal(store.get("capital"), 12e6);
  assert.equal(store.ledger.trades.length, mine);
  assert.throws(() => store.importAll("{}"), /isn't an Albion Billionaire v2 backup/);
  assert.throws(() => store.importAll("<html>"), /isn't an Albion Billionaire v2 backup/);
});

test("the ledger keeps known fields only: numbers finite, text cut to length, items checked", () => {
  const L = store.cleanLedger({
    worth: [{ t: "soon", v: 5 }, { t: 2, v: -1 }, null, { t: 3, v: 7 }, { t: 1, v: 9 }],
    trades: [null, "x", { t: 5, title: "x".repeat(500), item: "T4_BAG%", qty: -2, cost: "9", pred: { p10: 1, p50: "2", p90: 3 }, score: Infinity, result: "1", extra: "<b>" }],
  });
  assert.deepEqual(L.worth.map((w) => w.t), [1, 3]);
  assert.equal(L.trades.length, 1);
  const x = L.trades[0];
  assert.equal(x.title.length, 200);
  assert.equal(x.item, "");
  assert.equal(x.qty, 0);
  assert.equal(x.cost, 0);
  assert.equal(x.pred, null);
  assert.equal(x.score, null);
  assert.equal(x.result, null);
  assert.ok(!("extra" in x));
  assert.deepEqual(store.cleanLedger(null), { worth: [], trades: [] });
});

test("alerts and timers keep only what they can use, and Reset settings keeps both", (t) => {
  t.after(restore);
  const good = { id: "T6_BAG", city: "Lymhurst", kind: "below", price: 10000, t: 1, firedAt: 0, last: null, seen: null, checked: null, hit: false };
  const bad = [{ ...good, id: '"><img src=x>' }, { ...good, city: "<b>Lymhurst</b>" }, { ...good, kind: "sideways" }, { ...good, price: -1 }, { ...good, price: "5" }, null, 7, [good]];
  assert.equal(store.set("alerts", [good, ...bad, { ...good, price: 1e15, hit: "yes", firedAt: -5 }]), true);
  assert.deepEqual(store.get("alerts").map((a) => [a.id, a.price, a.hit, a.firedAt]), [["T6_BAG", 10000, false, 0], ["T6_BAG", 1e12, false, 0]]);
  assert.equal(store.set("alerts", Array.from({ length: 60 }, (_, i) => ({ ...good, price: i + 1 }))), true);
  assert.equal(store.get("alerts").length, 50, "at most 50");
  assert.equal(store.set("alerts", "lots"), false);
  assert.equal(store.set("timers", { planted: 5, laborers: "soon", focus: 99999, focusAt: 7, remind: { harvest: "yes", reset: true, extra: true } }), true);
  assert.deepEqual(store.get("timers"), { planted: 5, laborers: null, focus: 30000, focusAt: 7, remind: { harvest: false, laborers: false, focus: false, reset: true } });
  assert.equal(store.set("timers", [1, 2]), false);
  store.set("hours", 9);
  store.reset();
  assert.equal(store.get("hours"), 2, "settings went back");
  assert.equal(store.get("alerts").length, 50, "alerts stayed");
  assert.equal(store.get("timers").planted, 5, "timers stayed");
  const copy = JSON.parse(store.exportAll());
  assert.equal(copy.settings.alerts.length, 50, "backups carry them");
  assert.equal(copy.settings.timers.focus, 30000);
});

test("Cost to Max keeps a real board node, days and fee in range, and levels from 0 to 100; Reset keeps the levels", (t) => {
  t.after(restore);
  /* crafting opens unless refining was chosen; the refining target falls back to Ore Smelter */
  const loop = { mode: "craft", refine: "CRAFT_REFINE_ORE", noCap: false, mount: "ox8", mammoth: false, expand: false };
  assert.equal(store.set("costMax", { node: "CRAFT_BAG", days: 10000, focus: "no", journals: false, fee: 5000, lp: -4 }), true);
  assert.deepEqual(store.get("costMax"), { node: "CRAFT_BAG", days: 3650, focus: true, journals: false, fee: 1000, lp: 0, ...loop });
  assert.equal(store.set("costMax", { node: "CRAFT_BAG", days: "30", fee: "cheap", lp: 250.6 }), true);
  assert.deepEqual(store.get("costMax"), { node: "CRAFT_BAG", days: 90, focus: true, journals: true, fee: 0, lp: 251, ...loop });
  /* the sell limit and the daily loop's choices: a known pack mount, and switches that are on only when set to true */
  assert.equal(store.set("costMax", { node: "CRAFT_BAG", days: 30, noCap: true, mount: "bear8", mammoth: true, expand: true }), true);
  assert.deepEqual(store.get("costMax"), { node: "CRAFT_BAG", days: 30, focus: true, journals: true, fee: 0, lp: 0, ...loop, noCap: true, mount: "bear8", mammoth: true, expand: true });
  assert.equal(store.set("costMax", { node: "CRAFT_BAG", days: 30, noCap: "yes", mount: "<img src=x>", mammoth: 1, expand: "true" }), true);
  assert.deepEqual(store.get("costMax"), { node: "CRAFT_BAG", days: 30, focus: true, journals: true, fee: 0, lp: 0, ...loop });
  /* the store knows every pack mount the loop offers (store.js loads before engine/loop.js, so it keeps its own list) */
  const AB = loadAB();
  assert.equal(AB.loop.MOUNTS[0].id, "ox8", "an unknown mount falls back to the loop's first");
  for (const m of AB.loop.MOUNTS) {
    assert.equal(store.set("costMax", { node: "CRAFT_BAG", days: 30, mount: m.id }), true);
    assert.equal(store.get("costMax").mount, m.id, m.name);
  }
  /* crafting or refining, and the last refining target: a board id, else the default */
  assert.equal(store.set("costMax", { mode: "refine", node: "CRAFT_BAG", refine: "CRAFT_REFINE_HIDE_T6", days: 30 }), true);
  assert.deepEqual([store.get("costMax").mode, store.get("costMax").refine], ["refine", "CRAFT_REFINE_HIDE_T6"]);
  assert.equal(store.set("costMax", { mode: "smelt", node: "CRAFT_BAG", refine: "<img src=x>", days: 30 }), true);
  assert.deepEqual([store.get("costMax").mode, store.get("costMax").refine], ["craft", "CRAFT_REFINE_ORE"]);
  for (const node of ["craft_bag", "CRAFT_<b>", "BAG", 7, null]) assert.equal(store.set("costMax", { node, days: 30 }), false, String(node));
  assert.equal(store.set("costMax", "CRAFT_BAG"), false);
  assert.equal(store.set("specLevels", { CRAFT_BAG: 12.9, CRAFT_SWORDS: -1, CRAFT_X: "5", "bad key": 5, CRAFT_MAGE: 101 }), true);
  assert.deepEqual(store.get("specLevels"), { CRAFT_BAG: 12, CRAFT_SWORDS: 0, CRAFT_MAGE: 100 });
  assert.equal(store.set("specLevels", [["CRAFT_BAG", 5]]), false);
  const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`CRAFT_N${i}`, 50]));
  assert.equal(store.set("specLevels", many), true);
  assert.equal(Object.keys(store.get("specLevels")).length, 400, "at most 400 nodes");
  store.set("costMax", { node: "CRAFT_BAG", days: 30 });
  store.reset();
  assert.equal(store.get("costMax").node, "CRAFT_SWORDS_CLAYMORE", "the route's settings went back");
  assert.equal(Object.keys(store.get("specLevels")).length, 400, "the player's levels stayed");
  assert.equal(JSON.parse(store.exportAll()).settings.specLevels.CRAFT_N7, 50, "backups carry them");
});
