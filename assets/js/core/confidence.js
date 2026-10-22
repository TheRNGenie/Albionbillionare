/* Albion Billionaire v2 — the confidence engine.
   Two kinds of numbers come out of here, and the app keeps them apart:
   1. Calibrated ranges and odds. Price ranges use the error quantiles measured on 200 days of history and tested on
      months the model never saw (its 80% ranges held 80% of outcomes there). Haul odds use the measured chance that a
      gap between markets still beats fees a day later (also tested on held-out months). These are probabilities.
   2. A confidence score from 0 to 100 that blends six checks (fresh data, a busy market, enough history, the listing
      agreeing with recent sales, the odds, and backtest evidence). It ranks and colours things; it is a guide. */
window.AB = window.AB || {};

AB.conf = (() => {
  const S = AB.stats;
  let I = null, P = null;
  const ready = () => P || (P = AB.util.loadJSON("assets/data/v2/insights.json").then((j) => (I = j)));

  const LIQ_EDGES = [5, 20, 100];
  const liqIndex = (v) => (v == null || !isFinite(v) ? 0 : v < LIQ_EDGES[0] ? 0 : v < LIQ_EDGES[1] ? 1 : v < LIQ_EDGES[2] ? 2 : 3);
  const LIQ_LABEL = ["<5", "5-20", "20-100", "100+"];
  /* Volatility levels of the 14-day scale (log units). Steady series have fat tails in scale units, wild series thin
     ones, so the error quantiles are measured per level (see tools/v2/build_insights.py, price_model). */
  const VOL_EDGES = [0.04, 0.08, 0.15, 0.3];
  const VOL_LABEL = ["<0.04", "0.04-0.08", "0.08-0.15", "0.15-0.3", "0.3+"];
  const VOL_NAMES = ["Very steady", "Steady", "Normal", "Jumpy", "Wild"];
  const VOL_SWING = ["under 4%", "4–8%", "8–15%", "15–30%", "30% or more"]; // typical daily swing, for people
  const volIndex = (s) => { if (s == null || !isFinite(s)) return 2; const i = VOL_EDGES.findIndex((e) => s < e); return i < 0 ? VOL_EDGES.length : i; };
  const DAY = 864e5;

  /* ---------- per-series statistics, exactly as the model was calibrated ----------
     points: [{t, price, count}] completed days, oldest first. asOf: the last completed day (ms, 00:00 UTC). */
  function seriesStats(points, asOf) {
    if (!points || !points.length) return { n: 0, calibrated: false };
    const day = (t) => Math.round((t - asOf) / DAY); // 0 = asOf, -1 = the day before
    const in7 = points.filter((p) => day(p.t) > -7 && day(p.t) <= 0);
    const in14 = points.filter((p) => day(p.t) > -14 && day(p.t) <= 0);
    const lp7 = in7.map((p) => Math.log(p.price)), lp14 = in14.map((p) => Math.log(p.price));
    const m14 = in14.length ? S.median(lp14) : null;
    const counts = Array.from({ length: 14 }, (_, k) => { const p = in14.find((x) => day(x.t) === -k); return p ? p.count : 0; });
    const v14 = S.median(counts);
    const perDay = counts.reduce((a, b) => a + b, 0) / 14;
    const pred = lp7.length >= 4 ? S.median(lp7) : in14.length ? S.median(lp14) : null;
    const sigma = lp14.length >= 7 ? Math.max(0.01, 1.4826 * S.median(lp14.map((x) => Math.abs(x - m14)))) : null;
    const last = points[points.length - 1];
    const all = points.map((p) => Math.log(p.price));
    return {
      n: in14.length, n7: in7.length, pred: pred == null ? null : Math.exp(pred), lpred: pred, sigma, v14, perDay,
      m14: m14 == null ? null : Math.exp(m14), lm14: m14, lastPrice: last.price, lastDay: day(last.t),
      calibrated: lp7.length >= 4 && lp14.length >= 7, lastT: last.t, ageDays: Math.round((asOf - last.t) / DAY),
      avg: in14.length ? in14.reduce((a, p) => a + p.price * p.count, 0) / Math.max(1, in14.reduce((a, p) => a + p.count, 0)) : null,
      sigmaAll: all.length >= 5 ? S.mad(all) : null,
    };
  }

  /* ---------- calibrated price ranges ----------
     The error quantiles were measured at 1, 3 and 7 days ahead, per liquidity and volatility level (a cell with too
     few training cases uses its liquidity level's table). Between those horizons the z-values are interpolated;
     beyond 7 days they widen with the square root of time. */
  const HZ = [1, 3, 7];
  const zTable = (H, liq, vol) => I.priceModel.table[`${H}|${LIQ_LABEL[liq]}|${VOL_LABEL[vol]}`] || I.priceModel.table[`${H}|${LIQ_LABEL[liq]}`];
  const zTables = (st) => { const liq = liqIndex(st.v14), vol = volIndex(st.sigma); return HZ.map((H) => zTable(H, liq, vol)); };
  function zAt(st, h, q) {
    const qs = I.priceModel.quantiles;
    const z = zTables(st).map((t) => S.interp(qs, t, q));
    const hh = Math.max(1, h);
    return hh >= 7 ? z[2] * Math.sqrt(hh / 7) : S.interp(HZ, z, hh);
  }
  /* Price at quantile q, h days after the stats' asOf day. Falls back to a wide, uncalibrated band. */
  function priceAt(st, h, q) {
    if (!st || st.pred == null) return null;
    if (!st.calibrated || !I) {
      const s = (st.sigmaAll || 0.25) * 1.6;
      return st.pred * Math.exp(s * S.interp([0.1, 0.5, 0.9], [-1.28, 0, 1.28], q) * Math.sqrt(Math.max(1, h)));
    }
    return Math.exp(st.lpred + zAt(st, h, q) * st.sigma);
  }
  const range = (st, h, lo = 0.1, hi = 0.9) => (st?.pred == null ? null : { lo: priceAt(st, h, lo), mid: priceAt(st, h, 0.5), hi: priceAt(st, h, hi) });
  /* A fast sampler for one market at one horizon: the z-quantiles are interpolated once, then each draw is a lookup. */
  function sampler(st, h) {
    if (!st || st.pred == null) return null;
    const hh = Math.max(1, h);
    if (!st.calibrated || !I) { const s = (st.sigmaAll || 0.25) * 1.6 * Math.sqrt(hh); return (r) => st.pred * Math.exp(s * S.normal(r)); }
    const qs = I.priceModel.quantiles, tabs = zTables(st);
    const zs = qs.map((_, i) => (hh >= 7 ? tabs[2][i] * Math.sqrt(hh / 7) : S.interp(HZ, tabs.map((t) => t[i]), hh)));
    const a = st.lpred, sg = st.sigma;
    return (r) => Math.exp(a + S.fromQuantiles(qs, zs, r()) * sg);
  }
  function draw(st, h, r) { const f = sampler(st, h); return f ? f(r) : null; }

  /* ---------- backtested odds ---------- */
  function survival(dest, v14, spreadLog) {
    if (!I) return null;
    const e = I.survival.edges;
    if (spreadLog == null || spreadLog < e[0]) return null;
    const b = spreadLog < e[1] ? 0 : spreadLog < e[2] ? 1 : spreadLog < e[3] ? 2 : spreadLog < e[4] ? 3 : 4;
    const k = `${dest}|${LIQ_LABEL[liqIndex(v14)]}|${I.survival.bands[b]}`;
    const p = I.survival.s1[k], p2 = I.survival.s2[k], n = I.survival.n[k];
    return p == null ? null : { p, p2, n, band: I.survival.bands[b], key: k };
  }
  function rebound(devLog, v14) {
    if (!I) return null;
    const ed = I.rebound.edges;
    let b = 0;
    while (b < ed.length && devLog >= ed[b]) b++;
    const row = I.rebound.table[b];
    return row ? { label: row.bucket, ...(row.byLiq[liqIndex(v14)] || {}) } : null;
  }
  const enchantEvidence = (mat, sell) => I?.enchant?.byMat?.[`${mat}|${sell}`] || null;

  /* ---------- the score ---------- */
  const F = {
    /* order prices lose half their trust every 18 hours; snapshot days every 3 days */
    fresh: (ageH) => (ageH == null ? 0.3 : Math.pow(0.5, Math.max(0, ageH) / 18)),
    snapFresh: (ageDays) => Math.pow(0.5, Math.max(0, ageDays) / 3),
    liquidity: (v) => (v == null ? 0.25 : 1 - Math.exp(-Math.max(0, v) / 8)),
    history: (st) => (!st || !st.n ? 0.15 : Math.min(1, 0.25 + 0.75 * (st.n / 14)) * (st.calibrated ? 1 : 0.6)),
    agree: (listing, pred) => (!listing || !pred ? 0.75 : Math.exp(-Math.abs(Math.log(listing / pred)) / 0.15)),
  };
  const WEIGHTS = { fresh: 0.2, liquidity: 0.2, history: 0.1, agree: 0.15, odds: 0.2, evidence: 0.15 };
  const FACTOR_NAMES = { fresh: "Fresh prices", liquidity: "Busy market", history: "Enough history", agree: "Listing matches sales", odds: "Chance it pays", evidence: "Backtest evidence" };
  function score(f) {
    let lw = 0, w = 0;
    for (const [k, wt] of Object.entries(WEIGHTS)) {
      const v = f[k];
      if (v == null) continue;
      lw += wt * Math.log(Math.max(0.02, Math.min(1, v)));
      w += wt;
    }
    return w ? Math.round(100 * Math.exp(lw / w)) : 0;
  }
  function tier(s) {
    if (s >= 70) return { key: "high", label: "High", icon: "check" };
    if (s >= 50) return { key: "med", label: "Medium", icon: "half" };
    if (s >= 30) return { key: "low", label: "Low", icon: "alert" };
    return { key: "vlow", label: "Very low", icon: "stop" };
  }
  const factorList = (f, notes = {}) => Object.keys(WEIGHTS).filter((k) => f[k] != null).map((k) => ({ key: k, name: FACTOR_NAMES[k], value: f[k], weight: WEIGHTS[k], note: notes[k] || "" }));

  /* ---------- Monte Carlo of a trade's profit per unit ----------
     buy: [{fixed}] or [{st, h, cap}] legs that cost silver; sell: legs that earn (after fees). Returns quantiles and P(profit > 0). */
  function simulate(fn, n = 600, seed = 7) {
    const r = S.rng(seed);
    const xs = [];
    for (let i = 0; i < n; i++) { const v = fn(r); if (v != null && isFinite(v)) xs.push(v); }
    if (!xs.length) return null;
    xs.sort((a, b) => a - b);
    const q = (p) => xs[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))];
    return { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), mean: xs.reduce((a, b) => a + b, 0) / xs.length, pWin: xs.filter((x) => x > 0).length / xs.length, n: xs.length };
  }

  return {
    ready, get insights() { return I; }, LIQ_EDGES, LIQ_LABEL, liqIndex, VOL_EDGES, VOL_LABEL, VOL_NAMES, VOL_SWING, volIndex, seriesStats, priceAt, range, draw, sampler, survival, rebound, enchantEvidence,
    F, WEIGHTS, FACTOR_NAMES, score, tier, factorList, simulate,
  };
})();
