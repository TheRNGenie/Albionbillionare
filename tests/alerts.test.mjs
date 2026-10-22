/* Price alerts: which prices meet an alert, how old a price may be, how often one may fire, and what it says. */
import test from "node:test";
import assert from "node:assert/strict";
import { loadAB } from "./load.mjs";

const AB = loadAB();
const { alerts } = AB;
const H = 36e5;
const now = Date.parse("2026-10-21T12:00:00Z");
const iso = (t) => new Date(t).toISOString().slice(0, 19);
/* a market's prices as the app reads them: the cheapest listing and the best buy order, each with when it was seen */
const row = (sell, buy, ageH = 1) => ({ sell, sellDate: sell ? iso(now - ageH * H) : null, buy, buyDate: buy ? iso(now - ageH * H) : null });
const A = (kind, price, extra = {}) => ({ id: "T6_BAG", city: "Lymhurst", kind, price, t: 0, firedAt: 0, last: null, seen: null, checked: null, hit: false, ...extra });
const idx = (r) => ({ T6_BAG: { Lymhurst: r } });

test("a buy alert reads the cheapest listing and a sell alert the best buy order, the line itself included", () => {
  const { list, fired } = alerts.evaluate([A("below", 10000), A("below", 8999), A("above", 12000), A("above", 12001)], idx(row(9000, 12000)), now);
  assert.deepEqual(list.map((a) => [a.last, a.hit]), [[9000, true], [9000, false], [12000, true], [12000, false]]);
  assert.equal(fired.length, 2);
  assert.ok(list.every((a) => a.checked === now && a.seen === now - H));
});

test("a price older than 48 hours, or none at all, never meets an alert", () => {
  const { list, fired } = alerts.evaluate([A("below", 10000), A("above", 1)], idx(row(9000, 0, 49)), now);
  assert.deepEqual(list.map((a) => [a.last, a.hit]), [[9000, false], [null, false]]);
  assert.equal(fired.length, 0);
  const none = alerts.evaluate([A("below", 10000)], {}, now).list[0];
  assert.deepEqual([none.last, none.hit, none.checked], [null, false, now]);
});

test("a met alert fires once, then not again for 6 hours while it stays met", () => {
  let list = [A("below", 10000)];
  const run = (t) => { const r = alerts.evaluate(list, idx({ ...row(9000, 0), sellDate: iso(t - H) }), t); list = r.list; return r.fired.length; };
  assert.equal(run(now), 1);
  assert.equal(run(now + 10 * 6e4), 0);
  assert.equal(run(now + 5.9 * H), 0);
  assert.equal(run(now + 6 * H), 1);
  assert.equal(list[0].firedAt, now + 6 * H);
});

test("an alert added while prices were loading is left as it was, not read as having no price", () => {
  const added = A("below", 10000, { id: "T4_BAG" });
  const { list } = alerts.evaluate([A("below", 10000), added], idx(row(9000, 0)), now, (a) => a.id === "T6_BAG");
  assert.equal(list[1], added);
  assert.equal(list[0].hit, true);
});

test("the message says what met the alert and how fresh it was", () => {
  const a = A("below", 10000, { last: 9000, seen: now - 2 * H });
  assert.equal(alerts.title(a), `${AB.cat.label("T6_BAG")} in Lymhurst`);
  assert.equal(alerts.body(a, now), "Listed at 9,000 silver, at or under your 10,000 (seen 2 h ago).");
  assert.equal(alerts.body({ ...a, kind: "above", last: 12000 }, now), "Buy order at 12,000 silver, at or over your 10,000 (seen 2 h ago).");
});

test("checks need live prices and something to check", async (t) => {
  t.after(() => AB.store.set("alerts", []));
  assert.equal(await alerts.check({ force: true }), null, "no alerts: nothing to do");
  AB.store.set("alerts", [A("below", 10000)]);
  assert.notEqual(AB.api.mode, "live");
  assert.deepEqual(await alerts.check({ force: true }), { live: false });
  assert.equal(AB.store.get("alerts")[0].checked, null, "nothing was marked as checked");
});
