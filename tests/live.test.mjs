/* Live mode against a stand-in for the Albion Online Data Project. The fake server answers the three endpoints the app
   uses (gold, current prices, daily history) from the saved snapshot moved forward so its last day is yesterday, with
   order books and listing ages chosen per item, so live-only plays, the freshness checks and request sizes can be
   tested without the network. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadAB } from "./load.mjs";

const DAY = 864e5, HOUR = 36e5;
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/v2/snapshot.json"), "utf8"));
const now = Date.now();
const today0 = Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00Z");
const dayT = (k) => today0 - (snap.days - k) * DAY; // snapshot day k -> a real day ending yesterday
const iso = (t) => new Date(t).toISOString().slice(0, 19);
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/* Listing age per item and city: mostly 0-29 hours, one in 17 stale at 60 hours. */
const ageOf = (id, city) => { const h = hash(id + city); return h % 17 === 0 ? 60 : h % 30; };
const series = (id, city) => {
  const a = snap.s[id]?.[snap.markets.indexOf(city)];
  if (!a) return [];
  const out = [];
  for (let k = 0; k < snap.days; k++) if (a[snap.days + k] > 0) out.push({ t: dayT(k), price: a[k], count: a[snap.days + k] });
  return out;
};

/* A client-captured price newer and lower than the server's, as the Windows app's own data client would report it. */
const CLIENT = { id: "T6_LEATHER", city: "Martlock" };

const urls = [];
const historyIds = new Set();
let rateLimitOnce = true;
function respond(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }; }
function fakeADP(url) {
  urls.push(url);
  const u = new URL(url);
  const m = /^\/api\/v2\/stats\/(gold|prices|history)(?:\/(.+))?\.json$/.exec(u.pathname);
  if (!m) return respond(404, {});
  if (m[1] === "gold") return respond(200, [{ price: 4100, timestamp: iso(now - HOUR) }, { price: 4120, timestamp: iso(now) }]);
  const ids = m[2].split(",").map(decodeURIComponent);
  const cities = u.searchParams.get("locations").split(",");
  if (m[1] === "prices") {
    /* the first price request is rate-limited, to exercise the one retry */
    if (rateLimitOnce) { rateLimitOnce = false; return respond(429, {}); }
    const rows = [];
    for (const id of ids) for (const city of cities) {
      const s = series(id, city);
      if (!s.length) continue;
      const p = s[s.length - 1].price, at = iso(now - ageOf(id, city) * HOUR), bm = city === "Black Market";
      const spread = 0.75 + (hash(city + id) % 21) / 100; // best buy order 75-95% of the last sale
      rows.push({ item_id: id, city, quality: 1,
        sell_price_min: bm ? 0 : Math.round(p * 1.03), sell_price_min_date: bm ? "0001-01-01T00:00:00" : at,
        buy_price_max: Math.round(p * (bm ? 1 : spread)), buy_price_max_date: at });
    }
    return respond(200, rows);
  }
  const from = Date.parse(u.searchParams.get("date") + "T00:00:00Z");
  const out = [];
  for (const id of ids) {
    historyIds.add(id);
    for (const city of cities) {
      const data = series(id, city).filter((p) => p.t >= from).map((p) => ({ item_count: p.count, avg_price: p.price, timestamp: iso(p.t) }));
      if (data.length) out.push({ location: city, item_id: id, quality: 1, data });
    }
  }
  return respond(200, out);
}

globalThis.albionDesktop = {
  prices: async (ids) => (ids.includes(CLIENT.id) ? [{ id: CLIENT.id, city: CLIENT.city, sell: 1234, sellAt: now - 60e3, buy: 0, buyAt: 0 }] : []),
};
const AB = loadAB({ net: fakeADP });
const M = await AB.market.load({});
const R = AB.scan.run(M);

test("with the price server reachable the app goes live", () => {
  assert.equal(AB.api.mode, "live");
  assert.equal(M.live, true);
  assert.equal(M.why, "");
  assert.ok(M.medianAgeH > 0 && M.medianAgeH < 30);
  assert.equal(M.asOf, today0 - DAY, "the last completed day is yesterday");
});

test("requests stay under the URL limit and a rate-limited one is retried", () => {
  const api = urls.filter((u) => /\/stats\/(prices|history)\//.test(u));
  assert.ok(api.length > 3);
  for (const u of api) assert.ok(u.length < 3000, `${u.length} characters`);
  assert.ok(!rateLimitOnce, "the server did rate-limit once");
  assert.ok(M.rows.length > 1000, "and the prices still arrived");
});

test("history is only fetched for items that could be part of a play", () => {
  const U = M.U;
  assert.ok(historyIds.size < U.all.length, `${historyIds.size} of ${U.all.length}`);
  for (const id of U.res) assert.ok(historyIds.has(id), `${id} history`);
  for (const id of U.ench) assert.ok(historyIds.has(id), `${id} history`);
});

test("live order books unlock order flips, priced one silver inside the spread", () => {
  const flips = R.byKind.flip;
  assert.ok(flips.length > 0, "some fake order books are wide enough to flip");
  for (const o of flips) {
    const r = M.P[o.item][o.from];
    assert.equal(o.legs[0].fixed, r.buy + 1);
    assert.ok(Math.abs(o.unitCost - (r.buy + 1) * (1 + AB.store.setupFee)) < 1e-9);
    for (const side of ["buy", "sell"]) assert.ok(M.listing(o.item, o.from, side).ageH <= 6, "both sides of the book are fresh");
  }
});

test("freshness comes from listing ages, and stale listings are left out of hauls", () => {
  for (const o of R.opps) {
    const listed = o.legs.filter((lg) => lg.l && lg.mode !== "model" && lg.fixed == null && !lg.custom);
    if (!listed.length) continue;
    const oldest = Math.max(...listed.map((lg) => lg.l.ageH));
    assert.ok(Math.abs(o.factors.fresh - AB.conf.F.fresh(oldest)) < 0.01, `${o.key}: fresh ${o.factors.fresh} vs ${oldest} h`);
  }
  for (const o of [...R.byKind.haul, ...R.byKind.redhaul]) assert.ok(o.legs[0].l.ageH <= 48, `${o.key} buys from a ${o.legs[0].l.ageH} h old listing`);
});

test("prices the Windows app captured itself win when they're newer", () => {
  const r = M.P[CLIENT.id][CLIENT.city];
  assert.equal(r.sell, 1234);
  assert.equal(r.src, "client");
  assert.ok(M.listing(CLIENT.id, CLIENT.city, "sell").ageH < 0.1);
});
