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

const urls = [], sentAt = [];
const historyIds = new Set();
let rateLimitOnce = true, limited = null, down = false;
function respond(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }; }
const headers = (h) => ({ get: (k) => h[Object.keys(h).find((x) => x.toLowerCase() === k.toLowerCase())] ?? null });
/* The server's rate-limit answer: HTTP 429, its RateLimit headers and its message, with the window ending `inS`
   seconds from now. */
function throttled(inS) {
  /* it arrives a moment after the requests sent alongside it, so those are told apart from what the app sent after */
  return sleep(30).then(() => {
    const reset = Math.ceil(Date.now() / 1000) + inS;
    limited = { at: Date.now(), reset: reset * 1000 };
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

test("requests stay under the URL limit, and after a rate limit nothing goes out until the server's window resets", () => {
  const api = urls.filter((u) => /\/stats\/(prices|history)\//.test(u));
  assert.ok(api.length > 3);
  for (const u of api) assert.ok(u.length < 3000, `${u.length} characters`);
  assert.ok(limited, "the server did rate-limit once");
  const after = sentAt.filter((t) => t >= limited.at);
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
