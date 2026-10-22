/* The confidence engine: per-market statistics, calibrated price ranges, the sampler the Monte Carlo draws from, the
   confidence score, and the out-of-sample claims the Trust page shows. */
import test from "node:test";
import assert from "node:assert/strict";
import { loadAB } from "./load.mjs";

const AB = loadAB();
const C = AB.conf, S = AB.stats;
await C.ready();
const I = C.insights;

const DAY = 864e5;
const asOf = Date.UTC(2026, 9, 20);
/* days: [[daysBeforeAsOf, price, count], ...] -> points oldest first, as the API returns them */
const series = (days) => days.map(([k, price, count]) => ({ t: asOf - k * DAY, price, count })).sort((a, b) => a.t - b.t);
const flat = (n, price = 100, count = 10) => series(Array.from({ length: n }, (_, k) => [k, price, count]));
const calibratedStats = (sigma, v14, pred = 100) => ({ pred, lpred: Math.log(pred), sigma, v14, calibrated: true });

test("seriesStats on a steady market: exact forecast, floor scale, full history", () => {
  const st = C.seriesStats(flat(14), asOf);
  assert.equal(st.n, 14);
  assert.equal(st.n7, 7);
  assert.ok(Math.abs(st.pred - 100) < 1e-9);
  assert.equal(st.sigma, 0.01, "a perfectly flat market still gets the 1% minimum scale");
  assert.equal(st.v14, 10);
  assert.equal(st.perDay, 10);
  assert.ok(Math.abs(st.avg - 100) < 1e-9);
  assert.equal(st.calibrated, true);
  assert.equal(st.ageDays, 0);
  assert.equal(st.lastDay, 0);
});

test("seriesStats: the forecast is the 7-day median, the scale is 1.4826 x MAD over 14 days", () => {
  /* last 7 days alternate 90/110 around 100 with one outlier; the 7 days before sit at 200 */
  const pts = series([
    [0, 90, 5], [1, 110, 5], [2, 90, 5], [3, 110, 5], [4, 100, 5], [5, 1000, 5], [6, 100, 5],
    [7, 200, 5], [8, 200, 5], [9, 200, 5], [10, 200, 5], [11, 200, 5], [12, 200, 5], [13, 200, 5],
  ]);
  const st = C.seriesStats(pts, asOf);
  assert.ok(Math.abs(st.pred - 100) < 1e-9, `the median ignores the 1000 outlier (got ${st.pred})`);
  const lp = pts.map((p) => Math.log(p.price)), m = S.median(lp);
  const expected = 1.4826 * S.median(lp.map((x) => Math.abs(x - m)));
  assert.ok(Math.abs(st.sigma - expected) < 1e-12);
});

test("seriesStats: thin or old history is flagged uncalibrated, and missing days count as zero sales", () => {
  const thin = C.seriesStats(series([[0, 100, 3], [2, 104, 3], [5, 96, 3], [8, 100, 3], [9, 100, 3], [11, 100, 3], [13, 100, 3]]), asOf);
  assert.equal(thin.n7, 3);
  assert.equal(thin.calibrated, false, "fewer than 4 of the last 7 days");
  assert.ok(Math.abs(thin.pred - 100) < 1e-9, "still forecasts, from the 14-day median");
  assert.equal(thin.v14, 1.5, "7 of 14 days sold 3: the median day sits between 0 and 3");
  const sparse = C.seriesStats(series([[0, 100, 3], [2, 100, 3], [5, 100, 3], [8, 100, 3], [11, 100, 3], [13, 100, 3]]), asOf);
  assert.equal(sparse.v14, 0, "8 of 14 days without sales: the median day sells nothing");
  assert.equal(sparse.sigma, null, "no scale from fewer than 7 days");

  const old = C.seriesStats(series([[20, 100, 3], [21, 100, 3], [22, 100, 3]]), asOf);
  assert.equal(old.n, 0);
  assert.equal(old.pred, null);
  assert.equal(old.ageDays, 20);
  assert.equal(C.priceAt(old, 1, 0.5), null);
  assert.equal(C.range(old, 1), null);

  assert.deepEqual(C.seriesStats([], asOf), { n: 0, calibrated: false });
});

test("volatility levels: edges are inclusive at the bottom, missing scale counts as normal", () => {
  const cases = [[0, 0], [0.039, 0], [0.04, 1], [0.079, 1], [0.08, 2], [0.15, 3], [0.299, 3], [0.3, 4], [5, 4], [null, 2], [NaN, 2], [undefined, 2]];
  for (const [s, want] of cases) assert.equal(C.volIndex(s), want, `sigma ${s}`);
  assert.equal(C.VOL_NAMES.length, C.VOL_EDGES.length + 1);
  assert.equal(C.VOL_SWING.length, C.VOL_EDGES.length + 1);
  const liq = [[null, 0], [0, 0], [4.9, 0], [5, 1], [19.9, 1], [20, 2], [100, 3], [1e6, 3]];
  for (const [v, want] of liq) assert.equal(C.liqIndex(v), want, `v14 ${v}`);
});

test("every horizon x liquidity x volatility cell resolves to an increasing error table", () => {
  const pm = I.priceModel;
  assert.equal(pm.quantiles.length, 21);
  for (const H of pm.horizons) for (const liq of pm.liq) {
    const pooled = pm.table[`${H}|${liq}`];
    assert.ok(pooled, `pooled table ${H}|${liq}`);
    for (const vol of pm.vol) {
      const t = pm.table[`${H}|${liq}|${vol}`] || pooled;
      assert.equal(t.length, pm.quantiles.length);
      for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1], `${H}|${liq}|${vol} increases at ${i}`);
      assert.ok(t[0] < 0 && t[t.length - 1] > 0, "errors on both sides");
      assert.ok(Math.abs(S.interp(pm.quantiles, t, 0.5)) < 1, "median error within one scale unit");
    }
  }
  assert.deepEqual(pm.liqEdges, C.LIQ_EDGES, "app and model agree on liquidity levels");
  assert.deepEqual(pm.volEdges, C.VOL_EDGES, "app and model agree on volatility levels");
});

test("price ranges are ordered in the quantile and widen with the horizon", () => {
  for (const sigma of [0.02, 0.06, 0.1, 0.2, 0.5]) for (const v14 of [1, 10, 50, 500]) {
    const st = calibratedStats(sigma, v14);
    let prevW = 0;
    for (const h of [1, 2, 3, 5, 7, 10, 14, 30]) {
      const qs = [0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975].map((q) => C.priceAt(st, h, q));
      for (let i = 1; i < qs.length; i++) assert.ok(qs[i] > qs[i - 1], `sigma ${sigma} v14 ${v14} h ${h}`);
      const w = Math.log(qs[5] / qs[1]);
      assert.ok(w >= prevW - 1e-9, `80% range widens: sigma ${sigma} v14 ${v14} h ${h} (${w} < ${prevW})`);
      prevW = w;
    }
  }
  /* uncalibrated: a wide band from the long-run spread, still ordered */
  const raw = { pred: 100, calibrated: false, sigmaAll: 0.1 };
  const r = C.range(raw, 3);
  assert.ok(r.lo < r.mid && r.mid < r.hi && Math.abs(r.mid - 100) < 1e-9);
});

test("the Monte Carlo sampler draws from exactly the range priceAt describes", () => {
  const r = S.rng(42);
  for (const [sigma, v14, h] of [[0.03, 50, 1], [0.1, 10, 2], [0.2, 3, 7], [0.4, 200, 14]]) {
    const st = calibratedStats(sigma, v14, 1000);
    const f = C.sampler(st, h);
    const n = 40000, xs = Array.from({ length: n }, () => f(r));
    for (const q of [0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975]) {
      /* the share of draws at or below priceAt(q) should be q, within four standard errors */
      const share = xs.filter((x) => x <= C.priceAt(st, h, q)).length / n;
      assert.ok(Math.abs(share - q) < 4 * Math.sqrt((q * (1 - q)) / n), `sigma ${sigma} v14 ${v14} h ${h} q ${q}: ${share}`);
    }
  }
});

test("the confidence score: bounds, weights, monotone in every check, missing checks ignored", () => {
  const keys = Object.keys(C.WEIGHTS);
  assert.ok(Math.abs(keys.reduce((a, k) => a + C.WEIGHTS[k], 0) - 1) < 1e-12, "weights sum to 1");
  const all = (v) => Object.fromEntries(keys.map((k) => [k, v]));
  assert.equal(C.score(all(1)), 100);
  assert.equal(C.score(all(0)), 2, "each check is floored at 0.02 so one zero can't erase the rest");
  assert.equal(C.score({}), 0);
  assert.equal(C.score({ ...all(null), odds: 0.64 }), 64, "with one check, the score is that check");
  const r = S.rng(5);
  for (let i = 0; i < 300; i++) {
    const f = Object.fromEntries(keys.map((k) => [k, r()]));
    const s = C.score(f);
    assert.ok(Number.isInteger(s) && s >= 2 && s <= 100);
    for (const k of keys) assert.ok(C.score({ ...f, [k]: Math.min(1, f[k] + 0.2) }) >= s, `raising ${k} never lowers the score`);
  }
  assert.equal(C.tier(70).key, "high");
  assert.equal(C.tier(69).key, "med");
  assert.equal(C.tier(50).key, "med");
  assert.equal(C.tier(49).key, "low");
  assert.equal(C.tier(30).key, "low");
  assert.equal(C.tier(29).key, "vlow");
  const list = C.factorList({ ...all(0.5), agree: null }, { odds: "note" });
  assert.equal(list.length, keys.length - 1);
  assert.equal(list.find((x) => x.key === "odds").note, "note");
});

test("the score's checks fall the right way", () => {
  const { F } = C;
  assert.equal(F.fresh(0), 1);
  assert.ok(Math.abs(F.fresh(18) - 0.5) < 1e-12, "an 18-hour-old price is half as trusted");
  assert.ok(F.fresh(48) < F.fresh(6));
  assert.ok(Math.abs(F.snapFresh(3) - 0.5) < 1e-12);
  assert.ok(F.liquidity(0) === 0 && F.liquidity(100) > 0.99 && F.liquidity(8) > F.liquidity(4));
  assert.equal(F.history({ n: 14, calibrated: true }), 1);
  assert.ok(F.history({ n: 7, calibrated: false }) < F.history({ n: 7, calibrated: true }));
  assert.equal(F.agree(100, 100), 1);
  assert.ok(F.agree(130, 100) < F.agree(110, 100));
  assert.ok(Math.abs(F.agree(110, 100) - F.agree(100, 110)) < 1e-12, "above and below count the same");
});

test("simulate: ordered quantiles, a fair coin wins half the time, same seed same answer", () => {
  const coin = C.simulate((r) => S.normal(r), 4000, 9);
  assert.ok(coin.p10 < coin.p25 && coin.p25 < coin.p50 && coin.p50 < coin.p75 && coin.p75 < coin.p90);
  assert.ok(Math.abs(coin.pWin - 0.5) < 0.03);
  assert.ok(Math.abs(coin.p90 - 1.2816) < 0.08);
  assert.deepEqual(C.simulate((r) => S.normal(r), 500, 3), C.simulate((r) => S.normal(r), 500, 3));
  assert.equal(C.simulate(() => null, 50), null, "no valid draws, no answer");
  const some = C.simulate((r) => (r() < 0.5 ? null : 1), 1000);
  assert.ok(some.n > 400 && some.n < 600 && some.pWin === 1, "invalid draws are dropped, not counted as losses");
});

test("the backtested odds tables are probabilities and look up the right band", () => {
  const sv = I.survival;
  for (const tab of [sv.s1, sv.s2]) for (const [k, p] of Object.entries(tab)) assert.ok(p >= 0 && p <= 1, `${k}: ${p}`);
  assert.equal(C.survival("bm", 50, 0.05), null, "a gap smaller than the first band has no odds");
  const s = C.survival("bm", 50, 0.25);
  assert.equal(s.band, "20-30%");
  assert.equal(s.key, "bm|20-100|20-30%");
  assert.equal(s.p, sv.s1[s.key]);
  assert.equal(C.survival("royal", 1, 5).band, "100%+");
  const rb = C.rebound(-0.5, 50);
  assert.equal(rb.label, "<-40%");
  assert.ok(rb.n > 0 && rb.beatFees >= 0 && rb.beatFees <= 1);
});

test("the calibration claims shown on the Trust page hold in the shipped model", () => {
  const rel = I.priceModel.reliability;
  rel.level.forEach((lv, i) => {
    assert.ok(Math.abs(rel.calibrated[i] - lv) < 0.01, `calibrated ${lv}: ${rel.calibrated[i]}`);
    assert.ok(Math.abs(rel.calibrated[i] - lv) <= Math.abs(rel.naive[i] - lv), `beats the naive normal band at ${lv}`);
  });
  const bv = I.priceModel.byVol;
  bv.calibrated.forEach((c, i) => assert.ok(Math.abs(c - 0.8) < 0.01, `80% range by volatility level ${bv.labels[i]}: ${c}`));
  assert.ok(Math.max(...bv.pooled.map((c) => Math.abs(c - 0.8))) > 0.1, "one table for every level would be off by over 10 points");
  const sr = I.survival.reliability;
  sr.pred.forEach((p, i) => assert.ok(Math.abs(sr.obs[i] - p) < 0.02, `haul odds bin ${i}: said ${p}, happened ${sr.obs[i]}`));
  assert.ok(I.priceModel.split > I.source.from && I.priceModel.split < I.source.to, "tested on months after the training split");
});
