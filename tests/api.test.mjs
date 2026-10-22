/* The price server's limits, from the app's side: the request budget, waiting out a rate limit, and the caches that
   keep an automatic reload down to the requests it needs. The tests run in order in one process: the last two move
   the clock and leave a long rate-limit pause behind them. */
import test from "node:test";
import assert from "node:assert/strict";
import { loadAB } from "./load.mjs";

const iso = (t) => new Date(t).toISOString().slice(0, 19);
const log = []; // [{kind, ids, t}] every request that reached the server
let limit = null; // the next price request gets this rate-limit answer: {header: seconds} or {period: seconds}
function respond(status, body) { return { ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }; }
const headers = (h) => ({ get: (k) => h[Object.keys(h).find((x) => x.toLowerCase() === k.toLowerCase())] ?? null });
function throttled({ header, period = 60 }) {
  const reset = Math.ceil(Date.now() / 1000) + (header || 0);
  return { ok: false, status: 429, headers: headers(header ? { "RateLimit-Reset": String(reset) } : {}),
    text: async () => `Throttled, slow down! You exceeded the throttle apiv2/1m that limits requests to 100 per ${period} seconds!\n` };
}
function net(url) {
  const u = new URL(url);
  const m = /^\/api\/v2\/stats\/(gold|prices|history)(?:\/(.+))?\.json$/.exec(u.pathname);
  const ids = m[2] ? m[2].split(",").map(decodeURIComponent) : [];
  log.push({ kind: m[1], ids, t: Date.now() });
  if (m[1] === "gold") return respond(200, [{ price: 4000, timestamp: iso(Date.now()) }]);
  const cities = u.searchParams.get("locations").split(",");
  if (m[1] === "prices") {
    if (limit) { const l = limit; limit = null; return throttled(l); }
    return respond(200, ids.flatMap((id) => cities.map((city) => ({ item_id: id, city, quality: 1, sell_price_min: 1000, sell_price_min_date: iso(Date.now() - 36e5), buy_price_max: 900, buy_price_max_date: iso(Date.now() - 36e5) }))));
  }
  const day = Date.parse(iso(Date.now()).slice(0, 10) + "T00:00:00Z");
  return respond(200, ids.flatMap((id) => cities.map((city) => ({ item_id: id, location: city, quality: 1, data: [1, 2, 3].map((k) => ({ timestamp: iso(day - k * 864e5), avg_price: 1000 + k, item_count: 5 })) }))));
}
const AB = loadAB({ net });
await AB.api.probe();
const api = AB.api;
const since = () => { const n = log.length; return () => log.slice(n); };

test("the app is on live prices from the fake server", () => assert.equal(api.mode, "live"));

test("a copy of current prices is reused for 5 minutes, unless the caller asks for fresh ones", async () => {
  const seen = since();
  await api.prices(["T4_BAG"], ["Lymhurst"]);
  await api.prices(["T4_BAG"], ["Lymhurst"]);
  assert.equal(seen().length, 1);
  await api.prices(["T4_BAG"], ["Lymhurst"], 1, { maxAge: 0 });
  assert.equal(seen().length, 2);
});

test("daily histories are kept per item: asking again with one more item fetches only that item", async () => {
  const seen = since();
  const a = await api.daily(["T5_HIDE", "T4_HIDE", "T6_HIDE"], ["Martlock", "Lymhurst"]);
  assert.deepEqual(seen().map((r) => r.ids), [["T4_HIDE", "T5_HIDE", "T6_HIDE"]], "one request, items in a fixed order");
  const b = await api.daily(["T6_HIDE", "T7_HIDE", "T4_HIDE", "T5_HIDE"], ["Martlock", "Lymhurst"]);
  assert.deepEqual(seen().map((r) => r.ids), [["T4_HIDE", "T5_HIDE", "T6_HIDE"], ["T7_HIDE"]]);
  assert.deepEqual(Object.keys(b).sort(), ["T4_HIDE", "T5_HIDE", "T6_HIDE", "T7_HIDE"]);
  assert.deepEqual(b.T5_HIDE, a.T5_HIDE);
  assert.equal(b.T7_HIDE.Martlock.length, 3);
  /* a market not asked for before is a new question for those items */
  await api.daily(["T4_HIDE"], ["Bridgewatch"]);
  assert.deepEqual(seen().at(-1).ids, ["T4_HIDE"]);
});

test("the app never sends more than its budget allows in any window: the rest wait their turn", async () => {
  const saved = api.BUDGET.map((b) => b.slice());
  api.BUDGET.splice(0, api.BUDGET.length, [3, 400], [5, 1500]); // a small budget, so the test is quick
  try {
    const seen = since();
    const ids = ["T4_BAG", "T5_BAG", "T6_BAG", "T7_BAG", "T8_BAG", "T4_CAPE", "T5_CAPE", "T6_CAPE"];
    const got = await Promise.all(ids.map((id) => api.prices([id], ["Lymhurst"], 1, { maxAge: 0 })));
    assert.ok(got.every((rows) => rows.length === 1), "every request was answered");
    const ts = seen().map((r) => r.t);
    assert.equal(ts.length, 8);
    for (const [n, ms] of api.BUDGET) for (const t of ts) {
      const inWindow = ts.filter((x) => x >= t && x < t + ms - 1).length;
      assert.ok(inWindow <= n, `${inWindow} requests within ${ms} ms of ${t - ts[0]} ms (budget ${n})`);
    }
    assert.ok(ts.at(-1) - ts[0] >= 1500 - 5, "the last ones waited for the window to move");
  } finally { api.BUDGET.splice(0, api.BUDGET.length, ...saved); }
});

test("without a readable reset header, a rate limit lasts to the end of the period the server names, counted from 1970", async () => {
  /* move the clock to two seconds before a whole minute, so the wait is short (the next test keeps this clock) */
  const real = Date.now;
  const off = 60000 - (real() % 60000) - 2000;
  Date.now = () => real() + off;
  const seen = since();
  limit = { period: 60 };
  const t0 = Date.now();
  const rows = await api.prices(["T4_SHOES_LEATHER_SET1"], ["Lymhurst"], 1, { maxAge: 0 });
  const end = (Math.floor(t0 / 60000) + 1) * 60000;
  assert.equal(rows.length, 1, "the request went through once the window reset");
  const sent = seen();
  assert.equal(sent.length, 2, "the throttled request and its one retry");
  assert.ok(sent[1].t >= end + 1000 - 5, `retried ${end + 1000 - sent[1].t} ms before the window reset`);
  assert.ok(api.pausedUntil <= Date.now());
});

test("a rate limit that lasts more than about a minute stops the request with a time to retry, and nothing goes out until then", async () => {
  const seen = since();
  limit = { header: 200 };
  await assert.rejects(api.prices(["T4_HEAD_LEATHER_SET1"], ["Lymhurst"], 1, { maxAge: 0 }), (e) => e.code === "rate" && /slow down/.test(e.message) && e.until > Date.now() + 190e3);
  assert.equal(seen().length, 1, "no retry");
  await api.clear(); // clearing saved prices doesn't lift the limit
  await assert.rejects(api.prices(["T5_HEAD_LEATHER_SET1"], ["Lymhurst"], 1, { maxAge: 0 }), (e) => e.code === "rate");
  assert.equal(seen().length, 1, "nothing was sent while the server's limit lasts");
  assert.ok(api.pausedUntil > Date.now() + 190e3);
});
