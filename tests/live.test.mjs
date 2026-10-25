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

/* Order books planted for the sale check (chosen below, once the app's price model is loaded): `{ buy, sell }` in
   silver, seen an hour ago; a missing side keeps the usual fake order. */
const PLANT = new Map();
const plant = (id, city, o) => PLANT.set(id + "|" + city, { ageH: 1, ...o });

const urls = [], sentAt = [];
const historyIds = new Set();
let rateLimitOnce = true, limited = null, down = false;
function respond(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }; }
const headers = (h) => ({ get: (k) => h[Object.keys(h).find((x) => x.toLowerCase() === k.toLowerCase())] ?? null });
/* The server's rate-limit answer: HTTP 429, its RateLimit headers and its message, with the window ending `inS`
   seconds from now. */
function throttled(inS) {
  /* It arrives a moment after the requests sent alongside it. Those are told apart from what the app sent after it by
     their order (`n`, the requests made before the answer existed), not by the clock: one can go out in the same
     millisecond, just before the answer. */
  return sleep(30).then(() => {
    const reset = Math.ceil(Date.now() / 1000) + inS;
    limited = { at: Date.now(), n: urls.length, reset: reset * 1000 };
    return { ok: false, status: 429, headers: headers({ "RateLimit-Limit": "100", "RateLimit-Remaining": "0", "RateLimit-Reset": String(reset) }),
      text: async () => `Throttled, slow down! You exceeded the throttle apiv2/1m that limits requests to 100 per 60 seconds! Throttle resets at ${new Date(reset * 1000).toISOString()}!\n` };
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeADP(url) {
  urls.push(url);
  sentAt.push(Date.now());
  if (down) throw new TypeError("connection reset");
  const u = new URL(url);
  const m = /^\/api\/v2\/stats\/(gold|prices|history)(?:\/(.+))?\.json$/.exec(u.pathname);
  if (!m) return respond(404, {});
  if (m[1] === "gold") return respond(200, [{ price: 4100, timestamp: iso(now - HOUR) }, { price: 4120, timestamp: iso(now) }]);
  const ids = m[2].split(",").map(decodeURIComponent);
  const cities = u.searchParams.get("locations").split(",");
  if (m[1] === "prices") {
    /* the first price request is rate-limited as the real server does it (a reset a few seconds away), to exercise the
       wait and the one retry */
    if (rateLimitOnce) { rateLimitOnce = false; return throttled(3); }
    const rows = [];
    for (const id of ids) for (const city of cities) {
      const s = series(id, city);
      if (!s.length) continue;
      const pl = PLANT.get(id + "|" + city) || {};
      const p = s[s.length - 1].price, at = iso(now - (pl.ageH ?? ageOf(id, city)) * HOUR), bm = city === "Black Market";
      const spread = 0.75 + (hash(city + id) % 21) / 100; // best buy order 75-95% of the last sale
      rows.push({ item_id: id, city, quality: 1,
        sell_price_min: pl.sell ?? (bm ? 0 : Math.round(p * 1.03)), sell_price_min_date: bm ? "0001-01-01T00:00:00" : at,
        buy_price_max: pl.buy ?? Math.round(p * (bm ? 1 : spread)), buy_price_max_date: at });
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

/* ---------- the planted order books ----------
   Each market's range comes from the same sales the app will load (`sold` in market.js: the calibrated 80% range for
   today, a day past the last full one), so a planted order sits a known way inside or outside it. */
await Promise.all([AB.cat.ready(), AB.conf.ready()]);
const asOf = today0 - DAY;
const saleOf = (id, city) => { const st = AB.conf.seriesStats(series(id, city), asOf); return st.pred && st.n >= 3 ? { st, ...AB.conf.range(st, 1), S: st.pred } : null; };
const KEEP = 1 - 0.04 - 0.025, PAY = 1.025; // a sell order keeps this after premium tax and the listing fee; a buy order costs this
const pairs = [];
for (const id of Object.keys(snap.s)) {
  if (!/^T[4-8]_(PLANKS|METALBAR|LEATHER|CLOTH|STONEBLOCK)/.test(id)) continue;
  for (const city of ["Lymhurst", "Martlock", "Bridgewatch", "Thetford", "Fort Sterling"]) {
    const s = saleOf(id, city);
    if (s && s.st.v14 >= 10 && s.st.n >= 12) pairs.push({ id, city, s, w: s.hi / s.lo });
  }
}
pairs.sort((a, b) => a.w - b.w);
/* a steady market, too narrow to flip inside what sells: a buy order at 1% of the price and a sell order at three times
   it, which the book alone would score as a flip worth hundreds of times its cost */
const STEADY = pairs.find((x) => x.s.hi * KEEP < x.s.lo * PAY);
/* the widest markets: one with both orders just inside what sells (a real flip), one with both far outside it */
const [WIDE, BAITED] = pairs.slice(-2).reverse();
plant(STEADY.id, STEADY.city, { buy: Math.round(STEADY.s.S * 0.01), sell: Math.round(STEADY.s.S * 3) });
plant(WIDE.id, WIDE.city, { buy: Math.round(WIDE.s.lo * 1.01), sell: Math.round(WIDE.s.hi * 0.99) });
plant(BAITED.id, BAITED.city, { buy: Math.round(BAITED.s.S * 0.01), sell: Math.round(BAITED.s.S * 3) });
/* gear the Black Market pays the most over Caerleon for: a Caerleon sell order at a fifth of what it sells for (bought
   already, or a mistake) and a Black Market buy order at three times what it has paid (filled already) */
let GEAR = null;
for (const id of AB.market.universe().gear) {
  const c = saleOf(id, "Caerleon"), b = saleOf(id, "Black Market");
  if (!c || !b || c.st.n < 7 || b.st.n < 7) continue;
  const edge = Math.floor(b.hi) * 0.96 - Math.ceil(c.lo); // what the play earns on the range's edges
  if (edge > 0.1 * c.lo && (!GEAR || b.S / c.S > GEAR.r)) GEAR = { id, c, b, r: b.S / c.S };
}
plant(GEAR.id, "Caerleon", { sell: Math.round(GEAR.c.S * 0.2) });
plant(GEAR.id, "Black Market", { buy: Math.round(GEAR.b.S * 3) });
/* a busy market with no spike in its sales, and a sell order at twice the price */
const CALM = pairs.find((x) => x !== STEADY && x !== WIDE && x !== BAITED && x.s.st.m14 >= 500 && Math.abs(Math.log(x.s.st.lastPrice / x.s.st.m14)) < 0.1 && x.s.st.ageDays <= 1);
plant(CALM.id, CALM.city, { sell: Math.round(CALM.s.st.lastPrice * 2) });

const M = await AB.market.load({});
const R = AB.scan.run(M);

test("with the price server reachable the app goes live", () => {
  assert.equal(AB.api.mode, "live");
  assert.equal(M.live, true);
  assert.equal(M.why, "");
  assert.ok(M.medianAgeH > 0 && M.medianAgeH < 30);
  assert.equal(M.asOf, today0 - DAY, "the last completed day is yesterday");
});

test("requests stay under the URL limit, and after a rate limit nothing goes out until the server's window resets", () => {
  const api = urls.filter((u) => /\/stats\/(prices|history)\//.test(u));
  assert.ok(api.length > 3);
  for (const u of api) assert.ok(u.length < 3000, `${u.length} characters`);
  assert.ok(limited, "the server did rate-limit once");
  const after = sentAt.slice(limited.n);
  assert.ok(after.length > 0, "the load went on afterwards");
  for (const t of after) assert.ok(t >= limited.reset + 1000 - 15, `a request went out ${limited.reset + 1000 - t} ms before the window reset`);
  assert.ok(M.rows.length > 1000, "and the prices still arrived");
});

test("history is only fetched for items that could be part of a play", () => {
  const U = M.U;
  assert.ok(historyIds.size < U.all.length, `${historyIds.size} of ${U.all.length}`);
  for (const id of U.res) assert.ok(historyIds.has(id), `${id} history`);
  for (const id of U.ench) assert.ok(historyIds.has(id), `${id} history`);
});

test("live order books unlock order flips, each order one silver inside the book or at the edge of what sells", () => {
  const flips = R.byKind.flip;
  assert.ok(flips.length > 0, "some fake order books are wide enough to flip");
  for (const o of flips) {
    const r = M.P[o.item][o.from], s = M.sold(o.item, o.from);
    const bid = Math.max(r.buy + 1, Math.ceil(s.lo)), ask = Math.min(r.sell - 1, Math.floor(s.hi));
    assert.equal(o.legs[0].fixed, bid, `${o.key}: the buy order`);
    assert.equal(o.legs[1].cap, ask, `${o.key}: the sell order`);
    assert.ok(bid < s.S, `${o.key}: a buy order under what it sells for`);
    assert.ok(Math.abs(o.unitCost - bid * (1 + AB.store.setupFee)) < 1e-9);
    assert.equal(o.checks.length, (bid > r.buy + 1) + (ask < r.sell - 1), `${o.key}: a note for each order priced from sales`);
    for (const side of ["buy", "sell"]) assert.ok(M.listing(o.item, o.from, side).ageH <= 6, "both sides of the book are fresh");
    /* the simulation never sells above your order's price */
    assert.ok(AB.scan.samples(o, 300).every((x) => x <= o.qty * (ask * (1 - AB.store.tax() - AB.store.setupFee) - bid * (1 + AB.store.setupFee)) + 1e-6), o.key);
  }
  /* both orders inside what sells: the book as it is, and full marks for matching sales */
  const wide = flips.find((o) => o.key === `flip|${WIDE.id}|${WIDE.city}`);
  assert.ok(wide, `${WIDE.id} in ${WIDE.city} flips`);
  assert.deepEqual([wide.legs[0].fixed, wide.legs[1].cap, wide.checks.length, wide.factors.agree], [M.P[WIDE.id][WIDE.city].buy + 1, M.P[WIDE.id][WIDE.city].sell - 1, 0, 1]);
});

test("orders set far off the price to catch a careless player never make a flip", () => {
  /* a steady market: at 1% and three times the price the book alone is a flip of hundreds of times its cost; inside
     what sells there's nothing to earn after fees */
  const r = M.P[STEADY.id][STEADY.city];
  assert.ok(r.sell * KEEP > 100 * r.buy * PAY, "the book alone would flip");
  assert.ok(!R.opps.some((o) => o.key === `flip|${STEADY.id}|${STEADY.city}`), `${STEADY.id} in ${STEADY.city}`);
  /* a market wide enough to flip inside what sells: planned at the edges, never at the planted orders */
  const o = R.byKind.flip.find((x) => x.key === `flip|${BAITED.id}|${BAITED.city}`), s = M.sold(BAITED.id, BAITED.city);
  assert.ok(o, `${BAITED.id} in ${BAITED.city} still flips inside what sells`);
  assert.deepEqual([o.legs[0].fixed, o.legs[1].cap], [Math.ceil(s.lo), Math.floor(s.hi)]);
  assert.equal(o.checks.length, 2);
  assert.match(o.checks[0], /best buy order .* is below the range it sells in .* waits for someone selling in a hurry.*Your order is planned at/);
  assert.match(o.checks[1], /cheapest sell order .* is above the range it sells in .* waits for someone buying in a hurry/);
  assert.ok(o.factors.agree < 0.01, "and the orders don't match sales");
  assert.match(o.steps[0], /not just over the best one/);
});

test("an order out of line with sales is priced at the edge of what sells, on the side that flatters the play only", () => {
  const { id } = GEAR, l = M.listing(id, "Caerleon", "sell"), s = M.sold(id, "Caerleon");
  assert.deepEqual(s, { S: GEAR.c.S, lo: GEAR.c.lo, hi: GEAR.c.hi }, "the range comes from the loaded sales");
  const pay = M.checked(l, "pay"), get = M.checked(l, "get");
  assert.deepEqual([pay.price, pay.raw, pay.off], [Math.ceil(s.lo), l.price, -1], "too cheap to pay");
  assert.deepEqual([get.price, get.off], [l.price, 0], "but a low price you'd get stands as it is");
  const inside = M.checked({ ...l, price: Math.round(s.S) }, "pay", 1);
  assert.deepEqual([inside.price, inside.raw, inside.off], [Math.round(s.S) + 1, Math.round(s.S), 0], "inside the range, the order as it is (one silver over)");
  const none = M.U.gear.map((x) => M.listing(x, "Brecilien", "sell")).find((x) => x && !M.sold(x.id, x.city));
  assert.deepEqual([M.checked(none, "pay").price, M.checked(none, "pay").sale], [none.price, null], "too few sales to check: as it is");
  /* the plays: a Black Market flip of the planted item buys at the bottom of Caerleon's range and sells at the top of
     the Black Market's, both priced from sales in the simulation, with a note for each */
  const o = R.opps.find((x) => x.key === `bm|${id}`), b = M.sold(id, "Black Market");
  assert.ok(o, "the Black Market flip");
  assert.deepEqual(o.legs.map((lg) => [lg.l.price, lg.l.raw, lg.mode, lg.point]), [[Math.ceil(s.lo), l.price, "model", Math.ceil(s.lo)], [Math.floor(b.hi), M.P[id]["Black Market"].buy, "model", Math.floor(b.hi)]]);
  assert.match(o.checks[0], /most likely been bought already/);
  assert.match(o.checks[1], /Black Market's buy order .* most likely been filled already/);
  assert.ok(o.factors.agree < 0.05);
  assert.match(o.factorList.find((f) => f.key === "agree").note, /so the plan prices it from sales instead/);
  /* every play that sells it to the Black Market sells at the top of what the Black Market has paid */
  for (const p of R.opps) for (const lg of p.legs) if (lg.id === id && lg.city === "Black Market") assert.equal(lg.l.price, Math.floor(b.hi), p.key);
});

test("every play's prices are checked, and none counts on an order outside what sells", () => {
  let moved = 0;
  for (const o of R.opps) {
    if (o.kind === "dip") continue; // a panic buy is a listing under the price on purpose (see scanDips)
    const off = o.legs.filter((lg) => lg.l?.off);
    moved += off.length;
    assert.equal(o.checks.length, off.length, o.key);
    for (const lg of o.legs) {
      if (!lg.l) continue;
      assert.ok("sale" in lg.l, `${o.key}: ${lg.label} was checked`);
      const s = lg.l.sale;
      if (!s) continue;
      const pays = lg.role !== "sell";
      if (pays) assert.ok(lg.l.price >= s.lo - 1e-9, `${o.key}: ${lg.label} pays ${lg.l.price} under ${s.lo}`);
      else assert.ok(lg.l.price <= s.hi + 1e-9, `${o.key}: ${lg.label} gets ${lg.l.price} over ${s.hi}`);
      if (lg.l.off && !lg.own) assert.deepEqual([lg.mode, lg.point], ["model", lg.l.price], `${o.key}: priced from sales`);
    }
  }
  assert.ok(moved > 10, `${moved} orders priced from sales`);
});

test("a spike counts only as far as sales confirm it, and the Trust page's counts match the book", () => {
  const r = M.P[CALM.id][CALM.city];
  assert.ok(Math.log(r.sell) - CALM.s.st.lm14 > 0.5, "the book alone shows a spike");
  assert.ok(!R.alerts.some((a) => a.id === CALM.id && a.city === CALM.city), "but its sales don't");
  for (const a of R.alerts) {
    const st = M.stat(a.id, a.city);
    assert.equal(a.price, Math.min(a.listing, st.lastPrice), `${a.id} ${a.city}`);
    assert.ok(Math.abs(a.dev - (Math.log(a.price) - st.lm14)) < 1e-12);
  }
  const by = Object.fromEntries(AB.market.saleCheckByCity(M).map((c) => [c.city, c]));
  for (const [c, n] of Object.entries(by)) assert.ok(n.low <= n.buy && n.high <= n.sell, c);
  const count = (city, side, out) => Object.keys(M.P).filter((id) => { const r = M.P[id][city], s = r && M.sold(id, city); return s && r[side] && out(r[side], s); }).length;
  assert.equal(by[BAITED.city].low, count(BAITED.city, "buy", (p, s) => p < s.lo));
  assert.equal(by[BAITED.city].high, count(BAITED.city, "sell", (p, s) => p > s.hi));
  assert.equal(by["Black Market"].sell, 0, "the Black Market has buy orders only");
  assert.ok(by["Black Market"].buy > 100 && by[BAITED.city].low >= 1 && by[BAITED.city].high >= 1);
});

test("freshness comes from listing ages, and stale listings are left out of hauls", () => {
  for (const o of R.opps) {
    /* the orders a play takes its prices from: your own orders in a flip, and any other order counted as it is */
    const listed = o.legs.filter((lg) => lg.l && (lg.book ?? (lg.mode !== "model" && lg.fixed == null && !lg.custom)));
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

/* ---------- the automatic reload ---------- */
test("the automatic reload asks only for current prices, keeps the histories, and gives the same model", async () => {
  const before = urls.length;
  const M2 = await AB.market.update();
  const asked = urls.slice(before);
  const pricesFirst = urls.slice(0, before).filter((u) => u.includes("/stats/prices/"));
  assert.ok(asked.length > 0 && asked.every((u) => u.includes("/stats/prices/")), `asked: ${asked.map((u) => new URL(u).pathname.split("/")[4]).join(", ")}`);
  assert.equal(asked.length, new Set(pricesFirst).size, "one request per price chunk, as many as a full load");
  assert.equal(M2.live, true);
  assert.equal(M2.counts.hist, M.counts.hist, "the same items have histories");
  assert.equal(M2.counts.rows, M.counts.rows);
  assert.ok(M2.now >= M.now);
  assert.deepEqual(AB.scan.run(M2).opps.map((o) => o.key).sort(), R.opps.map((o) => o.key).sort(), "same prices, same plays");
});

test("an automatic reload that fails keeps the model on screen and stays on live prices", async () => {
  const before = AB.market.data;
  down = true;
  try { await assert.rejects(AB.market.update(), /can't be reached/); }
  finally { down = false; }
  assert.equal(AB.api.mode, "live", "no switch to the snapshot");
  assert.equal(AB.market.data, before, "the model is untouched");
});

test("scoring one strategy at a time finds exactly what scoring in one go finds", async () => {
  const a = AB.scan.run(M), b = await AB.scan.runSoon(M);
  assert.deepEqual(b.opps.map((o) => [o.key, o.n, o.rank]), a.opps.map((o) => [o.key, o.n, o.rank]));
  assert.deepEqual(b.alerts.map((x) => x.id + x.city), a.alerts.map((x) => x.id + x.city));
  assert.ok(b.ms > 0);
});

test("an alert check after a load reads that load's prices for scanned items and asks the server only about the rest", async (t) => {
  t.after(() => AB.store.set("alerts", []));
  const scanned = M.U.res.find((id) => M.listing(id, "Lymhurst", "sell")?.ageH < 30), outside = "T6_POTION_HEAL";
  assert.ok(scanned && !M.U.all.includes(outside));
  const listed = M.P[scanned].Lymhurst.sell;
  const A = (id, price) => ({ id, city: "Lymhurst", kind: "below", price, t: 0, firedAt: 0, last: null, seen: null, checked: null, hit: false });
  AB.store.set("alerts", [A(scanned, listed), A(outside, 1000)]);
  let before = urls.length;
  const res = await AB.alerts.check({ force: true, M });
  assert.deepEqual(urls.slice(before).map((u) => new URL(u).pathname.split("/").pop()), [`${outside}.json`], "one request, for the item outside the scan");
  const [a, b] = AB.store.get("alerts");
  assert.deepEqual([a.last, a.hit, b.last, b.hit], [listed, true, null, false]);
  assert.ok(b.checked > 0, "the other alert was checked too");
  assert.equal(res.fired, 1);
  AB.store.set("alerts", [A(scanned, listed - 1)]);
  before = urls.length;
  await AB.alerts.check({ force: true, M });
  assert.equal(urls.length, before, "nothing to ask when the load covered every alert");
  assert.equal(AB.store.get("alerts")[0].hit, false);
});

/* ---------- prices the Windows app's Data Client captures, pushed as they arrive ---------- */
test("a captured price replaces an older one only, and merging the same capture again changes nothing", () => {
  const t = Date.parse("2026-10-22T05:00:00.123Z");
  const rows = [{ id: "X", city: "Lymhurst", quality: 1, sell: 100, sellDate: "2026-10-22T04:00:00", buy: 90, buyDate: "2026-10-22T05:30:00", src: "live" }];
  const mine = [{ id: "X", city: "Lymhurst", sell: 95, sellAt: t, buy: 80, buyAt: t }, { id: "Y", city: "Martlock", sell: 7, sellAt: t, buy: 0, buyAt: 0 }];
  assert.equal(AB.api.mergeClient(rows, mine), 2, "X's listing, and Y's, which the server didn't have; X's buy order is newer on the server");
  assert.deepEqual(rows.map((r) => [r.id, r.sell, r.sellDate, r.buy, r.buyDate, r.src]), [
    ["X", 95, "2026-10-22T05:00:00.123", 90, "2026-10-22T05:30:00", "client"],
    ["Y", 7, "2026-10-22T05:00:00.123", 0, null, "client"],
  ]);
  assert.equal(AB.api.mergeClient(rows, mine), 0);
});

test("a captured price goes into the model at once with no request, and a reload keeps it while it's the newer one", async () => {
  const M0 = AB.market.data;
  const id = M0.U.res.find((x) => M0.P[x]?.Lymhurst?.sell && M0.P[x]?.Martlock?.sell);
  const was = M0.P[id].Lymhurst.sell, t = Date.now(), before = urls.length;
  const row = (o) => ({ id, city: "Lymhurst", quality: 1, sell: 0, sellAt: 0, buy: 0, buyAt: 0, ...o });
  assert.equal(AB.market.capture([row({ sell: was - 1, sellAt: t })]), true);
  const M1 = AB.market.withCaptures();
  assert.ok(M1 && M1.seq > M0.seq);
  assert.equal(AB.market.data, M1);
  assert.deepEqual([M1.P[id].Lymhurst.sell, M1.P[id].Lymhurst.src], [was - 1, "client"]);
  assert.ok(M1.listing(id, "Lymhurst", "sell").ageH < 0.01, "seen just now");
  assert.equal(M0.P[id].Lymhurst.sell, was, "the model before keeps its own prices");
  assert.equal(M1.hist, M0.hist, "the histories are kept");
  assert.equal(M1.checkedAt, M0.checkedAt, "and so is when prices were checked with the server");
  assert.equal(urls.length, before, "no request");
  assert.equal(AB.market.withCaptures(), null, "nothing new since");
  /* the same push again, other qualities and markets: nothing kept */
  assert.equal(AB.market.capture([row({ sell: was - 1, sellAt: t })]), false);
  assert.equal(AB.market.capture([row({ quality: 2, sell: 5, sellAt: t + 1 }), row({ city: "Brecilien Portal", sell: 5, sellAt: t + 1 }), null, { city: "Lymhurst" }]), false);
  /* a price older than the server's, and an item the scan doesn't cover: kept, but nothing to rebuild */
  assert.equal(AB.market.capture([row({ city: "Martlock", sell: 1, sellAt: t - 100 * HOUR }), row({ id: "T6_POTION_HEAL", sell: 1, sellAt: t })]), true);
  assert.equal(AB.market.withCaptures(), null);
  assert.equal(AB.market.data, M1);
  /* a reload's prices from the server are older than the capture, so it stays */
  const M2 = await AB.market.update();
  assert.deepEqual([M2.P[id].Lymhurst.sell, M2.P[id].Lymhurst.src], [was - 1, "client"]);
  assert.equal(M2.P[id].Martlock.sell, M0.P[id].Martlock.sell);
  assert.ok(M2.checkedAt > M1.checkedAt && M2.seq > M1.seq);
  assert.equal(AB.market.withCaptures(), null);
});

test("an alert check on captured prices reads only the model and asks the server nothing", async (t) => {
  t.after(() => AB.store.set("alerts", []));
  const M = AB.market.data;
  const id = M.U.res.find((x) => M.P[x]?.Thetford?.sell);
  const A = (item, price) => ({ id: item, city: "Thetford", kind: "below", price, t: 0, firedAt: 0, last: null, seen: null, checked: null, hit: false });
  AB.store.set("alerts", [A("T6_POTION_HEAL", 1000)]);
  assert.equal(await AB.alerts.check({ force: true, M, local: true }), null, "no alert the model covers: nothing to do");
  AB.store.set("alerts", [A(id, M.P[id].Thetford.sell), A("T6_POTION_HEAL", 1000)]);
  const before = urls.length;
  const res = await AB.alerts.check({ force: true, M, local: true });
  assert.equal(urls.length, before);
  assert.equal(res.fired, 1);
  const [a, b] = AB.store.get("alerts");
  assert.deepEqual([a.hit, a.last, b.checked], [true, M.P[id].Thetford.sell, null], "the other alert is left for a check that asks the server");
});
