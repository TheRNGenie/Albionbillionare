/* Albion Billionaire v2 — the road to a billion. A Monte Carlo of your silver, day by day, with today's plays as the
   menu: each day takes the best plays that fit your hours, your capital and what the market can absorb, draws each
   play's result from its calibrated range, keeps only part of the edge (other traders find the same gaps), and
   reinvests the rest. Hundreds of paths give a fan of outcomes instead of one optimistic line. */
window.AB = window.AB || {};

AB.sim = (() => {
  const S = AB.stats;
  const QS = [0.1, 0.25, 0.5, 0.75, 0.9];
  const EDGE = { cautious: 0.35, balanced: 0.5, bold: 0.7 };

  const hoursFor = (o, q) => (typeof o.hoursFn === "function" ? o.hoursFn(q) : o.hoursFn ?? o.hours);

  /* The menu: each play as a batch you could repeat daily, sized by the market (not by today's capital). */
  function menu(opps, { safeOnly = false, minScore = 35, max = 40 } = {}) {
    return opps
      .filter((o) => o.score >= minScore && (!safeOnly || o.zone !== "red"))
      .map((o) => {
        const lim = Object.entries(o.caps).filter(([k, v]) => k !== "capital" && v != null && isFinite(v)).map(([, v]) => v);
        const units = Math.max(1, lim.length ? Math.min(...lim) : 50);
        const hours = hoursFor(o, units);
        const q = [o.mc.p10, o.mc.p25, o.mc.p50, o.mc.p75, o.mc.p90];
        /* the average gain and loss per unit under the same quantile curve the simulation draws from, so a play can
           be ranked by what you keep once competition has taken its share of the gains (losses stay yours) */
        let pos = 0, neg = 0;
        for (let i = 0; i < 64; i++) { const v = S.fromQuantiles(QS, q, (i + 0.5) / 64); if (v > 0) pos += v; else neg += v; }
        return { o, units, unitCost: o.unitCost, hours, lock: Math.max(1, o.lockDays || 1), q, mean: o.mc.mean, pos: pos / 64, neg: neg / 64, perHour: (o.mc.mean * units) / hours };
      })
      .filter((x) => x.mean > 0)
      .sort((a, b) => b.perHour - a.perHour)
      .slice(0, max);
  }

  /* After today the gaps are shared: rank the menu by what you keep an hour (your share of the average gain, all of
     the average loss) and drop the plays that stop paying. Today's plan keeps the plain order: today's gaps are yours. */
  const kept = (m, edge) => edge * m.pos + m.neg;
  const laterMenu = (mu, edge) => mu.filter((m) => kept(m, edge) > 0).sort((a, b) => (kept(b, edge) * b.units) / b.hours - (kept(a, edge) * a.units) / a.hours);

  /* One day: fill the hours with the best plays the capital allows; report what stopped the day growing. A batch's
     time is its play's own clock for that many units (a haul's trip takes as long for 10 units as for 40), so a
     squeezed batch is charged what it really takes, and a play that can't fit even one unit is left for tomorrow. */
  function choose(menu, capital, hours) {
    let capLeft = capital, hLeft = hours, cut = false, late = false;
    const picks = [];
    for (const m of menu) {
      if (hLeft < 0.1) break;
      const afford = Math.floor(capLeft / (m.unitCost * m.lock));
      /* a batch squeezed to under a quarter of its size by capital isn't worth the trip */
      if (afford < Math.max(1, m.units * 0.25)) { cut = true; continue; }
      let units = Math.min(m.units, afford);
      if (units < m.units) cut = true;
      const fits = (u) => hoursFor(m.o, u) <= hLeft + 1e-9;
      if (!fits(units)) {
        late = true;
        /* the most units that fit in the hours left (a play's time never falls as units rise) */
        let lo = 0, hi = units - 1;
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid - 1; }
        if (lo < 1 || !fits(lo)) continue;
        units = lo;
      }
      const h = hoursFor(m.o, units);
      picks.push({ m, units, hours: h });
      capLeft -= units * m.unitCost * m.lock;
      hLeft -= h;
    }
    const stop = cut ? "capital" : hLeft < 0.1 || late ? "hours" : "market";
    const mean = picks.reduce((a, p) => a + p.units * p.m.mean, 0);
    return { picks, stop, mean, capitalUsed: capital - capLeft, hoursUsed: hours - hLeft };
  }

  /* Profit range for one day of picks (sum of independent draws per play). */
  function dayRange(picks, edge = 1, n = 800, seed = 3) {
    /* losses are kept in full; only gains are shared with competition */
    const r = S.rng(seed), xs = [];
    for (let i = 0; i < n; i++) { let t = 0; for (const p of picks) t += p.units * S.fromQuantiles(QS, p.m.q, r()); xs.push(t > 0 ? t * edge : t); }
    xs.sort((a, b) => a - b);
    const q = (p) => xs[Math.floor(p * (n - 1))];
    return { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), pLoss: xs.filter((x) => x < 0).length / n };
  }

  /* A 32-bit integer hash (Chris Wellons' lowbias32): the same input always gives the same well-mixed output. */
  const mix = (x) => {
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16; return x >>> 0;
  };

  /* The fan: paths × days. Besides day-to-day luck, every path draws how much of the edge it keeps (execution and
     competition differ between players: a lognormal around the chosen share, about ±50%), and every week draws a
     market mood (about ±25%). Without those two the fan would be far too narrow to be honest.
     The luck is common to every run with the same seed: path p's result for menu play i on day d is a fixed hash of
     (seed, p, d, i), and its edge share and weekly moods come from its own stream. Two runs that differ only in capital
     or hours then live through the same luck, so the Planner's grid compares settings, not draws. */
  function run({ menu: mu, capital, other = 0, goal, days, hours, edge = 0.5, paths = 300, seed = 11 }) {
    const idx = new Map(mu.map((m, i) => [m, i]));
    const luck = (p, d, i) => (mix(seed ^ mix(p ^ mix(d ^ mix(i + 1)))) + 0.5) / 4294967296;
    const W = Array.from({ length: days + 1 }, () => new Float64Array(paths));
    const hit = new Int32Array(paths).fill(-1);
    const stopDays = Array.from({ length: days + 1 }, () => ({ hours: 0, capital: 0, market: 0 }));
    const cache = new Map();
    const later = laterMenu(mu, edge);
    const plan = (cap) => {
      const k = Math.round(Math.log(Math.max(1, cap)) * 40);
      if (!cache.has(k)) cache.set(k, choose(later, Math.exp(k / 40) * 0.85, hours));
      return cache.get(k);
    };
    for (let p = 0; p < paths; p++) {
      const rp = S.rng(mix(seed ^ mix(p + 0x9e3779b9)));
      let cap = capital, mood = 1;
      const keep = edge * Math.exp(0.45 * S.normal(rp) - 0.1);
      W[0][p] = cap + other;
      if (cap + other >= goal) hit[p] = 0;
      for (let d = 1; d <= days; d++) {
        if (d % 7 === 1) mood = Math.exp(0.25 * S.normal(rp) - 0.03);
        const pl = plan(cap);
        let gain = 0;
        for (const x of pl.picks) gain += x.units * S.fromQuantiles(QS, x.m.q, luck(p, d, idx.get(x.m)));
        cap = Math.max(0, cap + gain * (gain > 0 ? keep * mood : 1));
        W[d][p] = cap + other;
        stopDays[d][pl.stop]++;
        if (hit[p] < 0 && cap + other >= goal) hit[p] = d;
      }
    }
    const fan = W.map((arr) => { const s = Array.from(arr).sort((a, b) => a - b); return QS.map((q) => s[Math.floor(q * (paths - 1))]); });
    const hits = Array.from(hit).filter((x) => x >= 0).sort((a, b) => a - b);
    const won = hits.length;
    /* the first day by which a given share of ALL paths has reached the goal (null if that share never gets there) */
    const dayFor = (share) => { const k = Math.max(0, Math.ceil(share * paths) - 1); return k < won ? hits[k] : null; };
    return {
      fan, days, paths, pGoal: won / paths, pGoalCI: S.wilson(won, paths),
      daysTo: dayFor(0.1) != null ? { p10: dayFor(0.1), p50: dayFor(0.5), p90: dayFor(0.9) } : null,
      stops: stopDays.map((s) => ({ hours: s.hours / paths, capital: s.capital / paths, market: s.market / paths })),
      first: choose(mu, capital * 0.85, hours),
    };
  }

  /* Whole days from now to the end of the deadline day (UTC): day d of the road falls on now + d days, so the last
     one lands on the deadline itself. Kept between a week and two years; a missing or past deadline means a year from
     now. The pages print the date they used (now + days), so a clamped deadline is never hidden. */
  function daysLeft(deadline = AB.store.get("deadline"), now = Date.now()) {
    const raw = (Date.parse((deadline || "") + "T23:59:59Z") - now) / 864e5;
    return !(raw > 0) ? 365 : Math.min(Math.max(Math.floor(raw), 7), 730);
  }

  /* The road from the saved settings. Command and Planner both ask for it, so both pages show the same odds (and the
     second page reuses the first one's run). Net worth is at least the trading capital; the rest of it (gear, stock)
     counts toward the goal but isn't traded. */
  let memo = null;
  function forecast(opps, { minScore = 35, paths = 400, seed = 21 } = {}) {
    const st = AB.store;
    const capital = Math.max(0, st.get("capital")), worth = Math.max(st.get("netWorth"), capital);
    const s = { capital, worth, other: worth - capital, goal: st.get("goal"), hours: st.get("hours"), edge: EDGE[st.get("risk")] ?? EDGE.balanced, safeOnly: !!st.get("safeOnly"), days: daysLeft(), minScore, paths, seed };
    const key = JSON.stringify(s);
    if (memo && memo.opps === opps && memo.key === key) return memo.v;
    const mu = menu(opps, { safeOnly: s.safeOnly, minScore });
    const v = { ...s, menu: mu, res: run({ menu: mu, capital, other: s.other, goal: s.goal, days: s.days, hours: s.hours, edge: s.edge, paths, seed }) };
    memo = { opps, key, v };
    return v;
  }

  return { EDGE, QS, menu, laterMenu, choose, dayRange, run, forecast, daysLeft, hoursFor };
})();
