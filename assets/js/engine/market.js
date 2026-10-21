/* Albion Billionaire v2 — the market model the scanners read. One load gathers current prices for the scanning
   universe, 28 days of daily sales for every item that could matter, and the per-market statistics the confidence
   engine needs. Everything keeps track of where it came from and how old it is. */
window.AB = window.AB || {};

AB.market = (() => {
  const { D, H, parseUTC } = AB.util;
  const cat = AB.cat, api = AB.api, conf = AB.conf;
  const ev = AB.util.emitter();
  let M = null, pending = null;

  /* The scanning universe: the 160 gear families with the most silver changing hands at the Black Market and the
     royal cities over the last four weeks (measured, not hand-picked), each at .0 to .3; every refined and raw
     resource; and the enchanting materials. */
  function universe() {
    const bases = conf.insights?.universe?.bases || [];
    const gear = [];
    for (const b of bases) for (let e = 0; e <= 3; e++) gear.push(e ? `${b}@${e}` : b);
    const res = [];
    for (const r of cat.RESOURCES) {
      res.push(`T2_${r.refined}`);
      for (let t = 3; t <= 8; t++) for (let e = 0; e <= (t >= 4 ? 3 : 0); e++) {
        const suf = e ? `_LEVEL${e}@${e}` : "";
        res.push(`T${t}_${r.raw}${suf}`, `T${t}_${r.refined}${suf}`);
      }
    }
    const ench = [];
    for (let t = 4; t <= 8; t++) for (const m of ["RUNE", "SOUL", "RELIC"]) ench.push(`T${t}_${m}`);
    const mats = new Set();
    for (const id of gear) { const r = cat.recipe(id); if (r) for (const m of r.mats) mats.add(m.id); }
    const extra = [...mats].filter((m) => !res.includes(m));
    return { gear, res, ench, extra, all: [...new Set([...gear, ...res, ...ench, ...extra])] };
  }

  /* Live mode loads 28-day histories only for items that could be part of a play; the snapshot already has them. */
  function candidates(P, U) {
    const score = new Map();
    const best = (id, side) => {
      let v = side === "sell" ? Infinity : 0;
      for (const c of cat.CITIES) { const r = P[id]?.[c]; if (!r) continue; if (side === "sell" && r.sell) v = Math.min(v, r.sell); if (side === "buy" && r.buy) v = Math.max(v, r.buy); }
      return isFinite(v) ? v : 0;
    };
    for (const id of U.gear) {
      const bm = P[id]?.[cat.BM]?.buy || 0;
      const buy = best(id, "sell");
      if (bm && buy) score.set(id, Math.max(score.get(id) || 0, bm - buy));
      const up = cat.upgrade(id);
      if (up && bm) {
        const prev = best(up.from, "sell"), mat = best(up.mat, "sell");
        if (prev && mat) { const g = bm - prev - mat * up.count; score.set(id, Math.max(score.get(id) || 0, g)); if (g > 0) score.set(up.from, Math.max(score.get(up.from) || 0, g)); }
      }
      const hi = Math.max(...cat.CITIES.map((c) => P[id]?.[c]?.sell || 0)), lo = buy;
      if (hi && lo) score.set(id, Math.max(score.get(id) || 0, (hi - lo) * 0.5));
    }
    const gear = [...score.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 320).map(([id]) => id);
    return [...new Set([...gear, ...U.res, ...U.ench, ...U.extra.slice(0, 120)])];
  }

  /* Every load asks the price server first, so a reload after the connection comes back switches to live prices. If
     the server answers that check but fails partway through the load, the load finishes on the snapshot instead of
     failing, and says why. */
  async function load({ onStep = () => {} } = {}) {
    if (pending) return pending;
    pending = (async () => {
      try {
        await Promise.all([cat.ready(), conf.ready()]);
        onStep("Checking the price server", 0.08);
        await api.probe();
        const U = universe();
        const gather = async () => {
          onStep(api.mode === "live" ? "Loading current prices" : "Opening the saved snapshot", 0.2);
          const rows = await api.prices(U.all, cat.MARKETS);
          const P = api.index(rows);
          onStep(api.mode === "live" ? "Loading four weeks of sales" : "Reading four weeks of sales", 0.5);
          const histIds = api.mode === "live" ? candidates(P, U) : U.all;
          const hist = await api.daily(histIds, cat.MARKETS, 28);
          return { rows, P, hist };
        };
        let got;
        try { got = await gather(); }
        catch (e) {
          if (api.mode !== "live") throw e;
          await api.fallback(`${e.message || "Live prices stopped loading."} The app is using the saved snapshot until the next reload.`);
          got = await gather();
        }
        onStep("Scoring every play", 0.8);
        M = build(got.P, got.hist, U, got.rows);
        ev.emit("ready", M);
        return M;
      } finally { pending = null; }
    })();
    return pending;
  }

  function build(P, hist, U, rows) {
    const live = api.mode === "live";
    const now = Date.now();
    const today0 = Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00Z");
    const info = api.snapshotInfo();
    const asOf = live ? today0 - D : Date.parse(info.end + "T00:00:00Z");
    const h0 = Math.max(1, Math.floor((now - asOf) / D));
    const memo = new Map();
    const stat = (id, city) => {
      const k = id + "|" + city;
      if (!memo.has(k)) memo.set(k, conf.seriesStats(hist[id]?.[city] || [], asOf));
      return memo.get(k);
    };
    const ageH = (iso) => (iso ? Math.max(0, (now - parseUTC(iso)) / H) : null);
    const fresh = (h) => (h == null ? 0.3 : live ? conf.F.fresh(h) : conf.F.snapFresh(h / 24));
    /* What you pay to buy now (the cheapest sell order) or get selling now (the best buy order). */
    function listing(id, city, side = "sell") {
      const r = P[id]?.[city];
      if (!r) return null;
      const price = side === "sell" ? r.sell : r.buy;
      if (!price) return null;
      const a = ageH(side === "sell" ? r.sellDate : r.buyDate);
      return { price, ageH: a, fresh: fresh(a), src: r.src, city, id, side };
    }
    /* Cheapest place to buy among cities (fresher listings preferred when prices are close). */
    function cheapest(id, cities = cat.CITIES, maxAgeH = live ? 72 : 1e9) {
      let best = null;
      for (const c of cities) {
        const l = listing(id, c, "sell");
        if (!l || (l.ageH != null && l.ageH > maxAgeH)) continue;
        const eff = l.price * (1 + 0.15 * (1 - l.fresh));
        if (!best || eff < best.eff) best = { ...l, eff };
      }
      return best;
    }
    /* A typical recent price for an item in a city: the 7-day median of daily averages, else the listing. */
    function typical(id, city) {
      const st = stat(id, city);
      if (st.pred) return st.pred;
      const l = listing(id, city, city === cat.BM ? "buy" : "sell");
      return l ? l.price : null;
    }
    function series(id, city) { return hist[id]?.[city] || []; }
    const counts = { items: Object.keys(P).length, rows: rows.length, hist: Object.keys(hist).length };
    const ages = rows.map((r) => ageH(r.sellDate || r.buyDate)).filter((x) => x != null).sort((a, b) => a - b);
    const medianAgeH = ages.length ? ages[Math.floor(ages.length / 2)] : null;
    return {
      mode: api.mode, why: api.why, live, now, asOf, h0, U, P, hist, counts, medianAgeH,
      snapshot: info, stat, listing, cheapest, typical, series, fresh, ageH, rows,
    };
  }

  /* Freshness of order data by market (for the Trust page): median age of listings per city. */
  function freshnessByCity() {
    if (!M) return [];
    return cat.MARKETS.map((c) => {
      const ages = [];
      for (const id of Object.keys(M.P)) { const r = M.P[id][c]; if (!r) continue; const a = M.ageH(c === cat.BM ? r.buyDate : r.sellDate); if (a != null) ages.push(a); }
      ages.sort((a, b) => a - b);
      const q = (p) => (ages.length ? ages[Math.min(ages.length - 1, Math.floor(p * ages.length))] : null);
      return { city: c, n: ages.length, p25: q(0.25), p50: q(0.5), p75: q(0.75), share6h: ages.length ? ages.filter((a) => a <= 6).length / ages.length : 0 };
    });
  }

  return {
    load, universe, freshnessByCity,
    get data() { return M; },
    on: (e, fn) => ev.on(e, fn),
    reset() { M = null; },
  };
})();
