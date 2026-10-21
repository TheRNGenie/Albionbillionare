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
