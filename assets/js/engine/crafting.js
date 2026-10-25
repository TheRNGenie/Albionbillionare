/* Albion Billionaire v2 — Crafting: a day of crafting for profit in one kind of item, ported from v1's Crafting tab
   ("What to craft, category by category") onto v2's prices, ranges and daily loop.

   The player picks a crafting line (Sword Crafter: swords) and, optionally, one item in it (Claymore). Every item it
   can craft, T4 up to the highest tier the player can craft at every enchantment, is priced the way Cost to Max prices
   it (spec.option): materials at the cheapest market's typical price, crafted in the item's bonus city, sold into any
   market that buys it, never more a day than that market's share of its sales (a quarter, or a whole day with the
   limit off).

   A day. As in v1: the day's focus goes first, to the crafts it adds most silver per point to (focus costs fall with
   the player's Destiny Board levels); then the materials budget goes to the crafts without focus that return the most
   per silver spent. At most MAX_ITEMS different items, the ones that earn the most in the day planned without the
   limit; and focus is used only when it beats the same day without it. A craft must clear MIN_MARGIN of its price, so
   the plan doesn't lean on margins inside the noise.

   How sure. The day's profit at today's typical prices, an 80% range from a Monte Carlo over the calibrated price
   ranges (materials at the data's age, sales a day later), the same crafts priced at each of the last four weeks'
   average prices (v1's "worst week"), and the app's confidence score.

   Show me the money. Each item in the line is planned on its own; the one whose day earns the most is the pick. The
   best mix plans the top MIX items together. */
window.AB = window.AB || {};

AB.crafting = (() => {
  const cat = AB.cat, S = AB.spec, ST = AB.stats, conf = AB.conf, store = AB.store;
  const MIN_MARGIN = 0.03; // a craft must clear this share of its price (v1)
  const MAX_ITEMS = 8;     // different items in one day, so the loop stays doable (v1)
  const MIX = 4;           // the best mix plans this many of the line's top items (v1)
  const WEEKS = 4;         // the last four weeks of sales, each priced on its own
  const TIERS = [4, 5, 6, 7, 8];
  const DAY = 864e5;
  const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

  /* ---------- the lines and their items ---------- */
  /* the lines with something to craft, and the items (specializations) in one */
  const lines = () => S.lines().filter(S.craftable);
  const itemsOf = (lineId) => S.specsOf(lineId).filter(S.craftable);
  /* a crafting line by its id or one of its items' */
  const lineOf = (id) => { const n = S.node(id); return n && S.craftable(n) ? S.lineOf(id) : null; };
  /* the tier a mastery level unlocks (T4 at 1, T5 at 10, T6 at 30, T7 at 60, T8 at 100), or 0 */
  const unlocked = (level) => [[100, 8], [60, 7], [30, 6], [10, 5], [1, 4]].find(([l]) => level >= l)?.[1] || 0;

  /* ---------- prices by week ---------- */
  /* A price's volume-weighted average over week w of the data (0: the last 7 days), or null without sales then. */
  function weekPrice(B, leg, w) {
    const pts = B.series(leg.id, leg.city);
    let v = 0, n = 0;
    for (const p of pts) {
      const d = Math.round((p.t - B.asOf) / DAY);
      if (d <= -7 * w && d > -7 * (w + 1) && p.count > 0) { v += p.price * p.count; n += p.count; }
    }
    return n ? v / n : null;
  }

  /* ---------- one day ---------- */
  /* Every way to sell every priced craft: its profit each without focus and with, the focus it takes at the player's
     levels, and how many a day its market takes. */
  function slotsOf(options, o) {
    const pr0 = (leg) => leg.price;
    const out = [];
    for (const op of options) {
      const cost0 = S.baseCost(op, pr0);
      const costF = cost0 - S.matCost(op, pr0, true) * (op.rrF - op.rr0);
      const fc = o.focus > 0 && op.focus > 0 ? cat.focusCost(op.focus, S.efficiency(op.id, o.levels)) : 0;
      for (const s of op.sells) {
        const cap = Math.floor(s.rate + 1e-9);
        if (cap < 1) continue;
        const price = s.leg.price, net = S.saleNet(s, pr0, o.tax, o.setup);
        const profitNo = net - cost0, profitF = fc > 0 ? net - costF : profitNo;
        out.push({
          op, s, cap, price, net, cost0, costF, fc, profitNo, profitF,
          okNo: profitNo > 0 && profitNo / price >= MIN_MARGIN, okF: fc > 0 && profitF > 0 && profitF / price >= MIN_MARGIN,
        });
      }
    }
    return out;
  }
  /* v1's day: focus first, to the crafts it adds the most silver per point to, then the budget to the crafts without
     focus that return the most per silver; never more of a craft than its market takes. allow(id) limits the items. */
  function fill(slots, budget, focus, allow) {
    const left = new Map(slots.map((x) => [x, x.cap]));
    let fLeft = focus, bLeft = budget;
    const rows = [];
    const withF = focus > 0 ? slots.filter((x) => x.okF && allow(x.op.id)).map((x) => ({ x, per: (x.profitF - Math.max(0, x.profitNo)) / x.fc })).sort((a, b) => b.per - a.per) : [];
    for (const { x } of withF) {
      const u = Math.floor(Math.min(left.get(x), fLeft / x.fc, bLeft / x.costF) + 1e-9);
      if (u < 1) continue;
      rows.push({ x, units: u, focus: true });
      left.set(x, left.get(x) - u); fLeft -= u * x.fc; bLeft -= u * x.costF;
    }
    const noF = slots.filter((x) => x.okNo && allow(x.op.id)).sort((a, b) => b.profitNo / b.cost0 - a.profitNo / a.cost0);
    for (const x of noF) {
      const u = Math.floor(Math.min(left.get(x), bLeft / x.cost0) + 1e-9);
      if (u < 1) continue;
      rows.push({ x, units: u, focus: false });
      left.set(x, left.get(x) - u); bLeft -= u * x.cost0;
    }
    return { rows, spent: budget - bLeft, focusUsed: focus - fLeft };
  }
  const worth = (rows) => sum(rows, (r) => r.units * (r.focus ? r.x.profitF : r.x.profitNo));
  /* The day: planned without the item limit, its MAX_ITEMS biggest earners kept and the day planned again on them (v1
     ranked items by what each could add alone, which counts the same focus for every item and can crowd out the ones
     that pay without it). A day with focus is kept only if it beats the same budget without focus. */
  function day(slots, budget, focus) {
    const plan1 = (f) => {
      const all = fill(slots, budget, f, () => true);
      const by = new Map();
      for (const r of all.rows) by.set(r.x.op.id, (by.get(r.x.op.id) || 0) + r.units * (r.focus ? r.x.profitF : r.x.profitNo));
      if (by.size <= MAX_ITEMS) return all;
      const keep = new Set([...by].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, MAX_ITEMS).map((e) => e[0]));
      return fill(slots, budget, f, (id) => keep.has(id));
    };
    const withF = plan1(focus);
    if (!(focus > 0)) return withF;
    const noF = plan1(0);
    return worth(noF.rows) > worth(withF.rows) ? noF : withF;
  }
  /* a day's silver at a set of prices (pr(leg)): sales less materials (after returns) and station fees */
  const profitAt = (rows, pr, tax, setup) => sum(rows, (r) => {
    const { op, s } = r.x;
    const cost = S.baseCost(op, pr) - (r.focus ? S.matCost(op, pr, true) * (op.rrF - op.rr0) : 0);
    return r.units * (S.saleNet(s, pr, tax, setup) - cost);
  });

  /* ---------- a plan ----------
     B: a market model with the line's items (AB.market.extend(spec.needs(line))).
     o: { line, items (item ids to plan; none: every item in the line), top (highest tier), budget (silver of materials
     a day), focusPerDay, levels ({nodeId: level}), premium, fee, share, royal, seed, draws } */
  function plan(B, o) {
    const L = lineOf(o.line);
    if (!L) throw new Error("Unknown crafting line.");
    const all = itemsOf(L.id);
    const items = o.items?.length ? all.filter((n) => o.items.includes(n.id)) : all;
    const top = TIERS.includes(o.top) ? o.top : 8;
    const tax = o.premium ? 0.04 : 0.08, setup = store.setupFee, pf = o.premium ? 1.5 : 1;
    const share = o.share > 0 ? Math.min(1, o.share) : S.SHARE;
    const royal = !!o.royal;
    const budget = Math.max(0, o.budget || 0), focus = Math.max(0, o.focusPerDay || 0);
    const opts = { pf, fee: o.fee ?? 0, journals: false, share, cities: royal ? cat.ROYAL : cat.CITIES, markets: royal ? cat.ROYAL : cat.MARKETS };
    const legs = new Map();
    const ids = [...new Set(items.flatMap((n) => S.familyIds(n.fam, TIERS.filter((t) => t <= top))))];
    const priced = ids.map((id) => S.option(B, legs, id, opts)).filter(Boolean);
    const options = priced.filter((op) => !op.missing);
    const missing = [...new Set(priced.filter((op) => op.missing).map((op) => op.missing))];
    const ctx = { tax, setup, focus, levels: o.levels || {} };
    const slots = slotsOf(options, ctx);
    const D = day(slots, budget, focus);
    const pr0 = (leg) => leg.price;
    const profit = profitAt(D.rows, pr0, tax, setup);

    /* the day's crafts by item: how many, with focus, where they sell, and their silver */
    const byItem = new Map();
    for (const r of D.rows) {
      const { op, s } = r.x;
      const it = byItem.get(op.id) || { id: op.id, op, n: 0, nF: 0, sold: [], profit: 0, journals: 0 };
      it.n += r.units;
      if (r.focus) it.nF += r.units;
      const at = it.sold.find((x) => x.city === s.leg.city);
      if (at) at.n += r.units; else it.sold.push({ city: s.leg.city, n: r.units, price: s.leg.price });
      it.profit += r.units * (r.focus ? r.x.profitF : r.x.profitNo);
      byItem.set(op.id, it);
    }
    const dayItems = [...byItem.values()].sort((a, b) => b.profit - a.profit);
    for (const it of dayItems) it.sold.sort((a, b) => b.n - a.n);

    /* the Monte Carlo: each price the day uses drawn from its calibrated range (a listing-only price from the app's
       wide uncalibrated one): materials at the data's age, sales a day after */
    const LG = [...legs.values()];
    const sells = new Set(D.rows.map((r) => r.x.s.leg));
    const h0 = Math.max(1, B.h0 || 1);
    const samplers = LG.map((lg) => conf.sampler(lg.model ? lg.st : { pred: lg.price, calibrated: false }, sells.has(lg) ? h0 + 1 : h0));
    const r = ST.rng(o.seed ?? 7);
    const draws = Math.max(0, o.draws ?? 400);
    const outcomes = [];
    for (let d = 0; d < draws && D.rows.length; d++) {
      const drawn = LG.map((lg, i) => (samplers[i] ? samplers[i](r) : lg.price));
      outcomes.push(profitAt(D.rows, (leg) => drawn[leg.i], tax, setup));
    }
    outcomes.sort((a, b) => a - b);
    const range = outcomes.length ? { p10: ST.quantile(outcomes, 0.1), p50: ST.quantile(outcomes, 0.5), p90: ST.quantile(outcomes, 0.9) } : null;

    /* the same crafts at each of the last four weeks' average prices (a price without sales that week stays at today's
       typical one; `own` is the share of the day's silver that week priced from its own sales) */
    const wk = new Map();
    const at = (leg, w) => { const k = leg.i + "|" + w; if (!wk.has(k)) wk.set(k, weekPrice(B, leg, w)); return wk.get(k); };
    const weeks = Array.from({ length: WEEKS }, (_, w) => {
      let seen = 0, total = 0;
      for (const rw of D.rows) for (const leg of [rw.x.s.leg, ...rw.x.op.mats.map((m) => m.leg)]) { total++; if (at(leg, w) != null) seen++; }
      return { w, profit: profitAt(D.rows, (leg) => at(leg, w) ?? leg.price, tax, setup), own: total ? seen / total : 0 };
    });

    /* every craft ranked by what it could add to a day in its best market (v1's table), with the weeks it paid */
    const best = new Map();
    for (const x of slots) {
      const pot = Math.max(Math.max(0, x.profitNo) * x.cap, x.fc > 0 ? Math.max(0, x.profitF) * Math.min(x.cap, focus / x.fc) : 0);
      if (!best.has(x.op.id) || pot > best.get(x.op.id).pot) best.set(x.op.id, { ...x, pot });
    }
    const ranked = [...best.values()].sort((a, b) => b.pot - a.pot || b.profitNo - a.profitNo).map((x) => {
      const ws = Array.from({ length: WEEKS }, (_, w) => at(x.s.leg, w) != null ? S.saleNet(x.s, (leg) => at(leg, w) ?? leg.price, tax, setup) - S.baseCost(x.op, (leg) => at(leg, w) ?? leg.price) : null);
      return { id: x.op.id, op: x.op, city: x.s.leg.city, price: x.price, cap: x.cap, profitNo: x.profitNo, profitF: x.profitF, fc: x.fc, perFocus: x.fc > 0 ? (x.profitF - Math.max(0, x.profitNo)) / x.fc : null, pot: x.pot, weeksUp: ws.filter((v) => v != null && v > 0).length, weeksSeen: ws.filter((v) => v != null).length };
    });
    /* tiers where nothing pays without focus, though something does with it */
    const tiers = [...new Set(slots.map((x) => x.op.tier))].sort((a, b) => a - b);
    const focusOnly = tiers.filter((t) => { const xs = slots.filter((x) => x.op.tier === t); return !xs.some((x) => x.profitNo > 0) && xs.some((x) => x.okF); });

    /* the price sheet: a target and a hard limit for everything the day sells and buys (v1) */
    const fees = (s) => 1 - tax - (s.bm ? 0 : setup);
    const weekly = (leg) => { const ps = Array.from({ length: WEEKS }, (_, w) => at(leg, w)).filter((v) => v != null); return ps.length ? { lo: Math.min(...ps), hi: Math.max(...ps) } : null; };
    const sheetSells = [];
    for (const rw of D.rows) {
      const { op, s } = rw.x;
      if (sheetSells.some((x) => x.id === op.id && x.city === s.leg.city)) continue;
      sheetSells.push({ id: op.id, city: s.leg.city, bm: !!s.bm, price: s.leg.price, weeks: weekly(s.leg), even: rw.x.cost0 / fees(s), evenF: rw.x.fc > 0 ? rw.x.costF / fees(s) : null });
    }
    const mats = new Map();
    for (const rw of D.rows) for (const m of rw.x.op.mats) {
      const per = m.n * (m.ret ? 1 - rw.x.op.rr0 : 1);
      const max = m.leg.price + rw.x.profitNo / per;
      const g = mats.get(m.leg) || { id: m.leg.id, city: m.leg.city, price: m.leg.price, weeks: weekly(m.leg), max, qty: 0, noReturn: !m.ret };
      g.max = Math.min(g.max, max);
      g.qty += rw.units * m.n * (m.ret ? 1 - (rw.focus ? rw.x.op.rrF : rw.x.op.rr0) : 1);
      mats.set(m.leg, g);
    }
    const sheetBuys = [...mats.values()].sort((a, b) => b.qty * b.price - a.qty * a.price);

    return {
      line: L, items: items.map((n) => n.id), top, premium: !!o.premium, tax, setup, fee: opts.fee, share, royal, cities: opts.cities,
      budget, focusTotal: focus, missing, options: options.length, ops: options, slots: slots.length,
      /* one "stage" for the daily loop (engine/loop.js) and the confidence score (spec.confidence) */
      steps: [{ tier: top, items: dayItems.map((it) => ({ ...it, journals: 0 })) }],
      rows: D.rows.map((rw) => ({ op: rw.x.op, s: rw.x.s, units: rw.units, focus: rw.focus, each: rw.focus ? rw.x.profitF : rw.x.profitNo, cost: rw.focus ? rw.x.costF : rw.x.cost0, fc: rw.x.fc })),
      dayItems, profit, spent: D.spent, focusUsed: D.focusUsed,
      crafts: sum(D.rows, (rw) => rw.units), focusCrafts: sum(D.rows.filter((rw) => rw.focus), (rw) => rw.units), fame: sum(D.rows, (rw) => rw.units * rw.x.op.fame),
      range, draws: outcomes.length, weeks, ranked, focusOnly, sheet: { sells: sheetSells, buys: sheetBuys },
    };
  }

  /* Every item in a line planned on its own (at typical prices, unless o.draws), best day first. */
  function rank(B, o) {
    const L = lineOf(o.line);
    if (!L) throw new Error("Unknown crafting line.");
    return itemsOf(L.id).map((n) => {
      const p = plan(B, { ...o, line: L.id, items: [n.id], draws: o.draws ?? 0 });
      const tierOf = new Map();
      for (const it of p.dayItems) tierOf.set(it.id, it.profit);
      const bestId = [...tierOf].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      return { id: n.id, node: n, name: S.short(n), profit: p.profit, range: p.range, crafts: p.crafts, options: p.options, best: bestId, special: S.special(n), plan: p };
    }).sort((a, b) => b.profit - a.profit || b.options - a.options || a.name.localeCompare(b.name));
  }
  /* the best mix: the top MIX items that make money */
  const mixOf = (ranked) => ranked.filter((x) => x.profit > 0).slice(0, MIX).map((x) => x.id);
  /* Show me the money: the item whose day earns the most, or null when nothing in the line pays */
  const money = (ranked) => (ranked[0] && ranked[0].profit > 0 ? ranked[0] : null);

  /* ---------- the day as a loop ----------
     o: { mount (kg), mammoth (bool: fills the loop), expand (bool), other (kg: the mount to compare with) } */
  function loop(B, p, o = {}) {
    const LP = AB.loop;
    const rows = p.rows.map((r) => ({ op: r.op, s: r.s, units: r.units, uF: r.focus ? r.units : 0 }));
    if (!rows.length) return null;
    const cap = o.mammoth ? LP.MAMMOTH.kg : o.mount || LP.MOUNTS[0].kg;
    const grow = o.mammoth || o.expand;
    const E = grow ? LP.expand(B, p, 0, rows, cap, { pool: o.mammoth ? LP.POOL_MAMMOTH : LP.POOL }) : null;
    const Lp = E ? E.loop : LP.build(B, p, rows.map((r) => ({ ...r })), cap);
    const other = o.other ? LP.build(B, p, (E ? E.rows : rows).map((r) => ({ ...r })), o.other) : null;
    return { days: 1, per: 1, loop: Lp, base: E?.base || Lp, added: E?.added || [], full: E?.full ?? false, expanded: !!E, other, daysNow: 1, daysBase: 1 };
  }

  return { MIN_MARGIN, MAX_ITEMS, MIX, WEEKS, TIERS, lines, itemsOf, lineOf, unlocked, weekPrice, plan, rank, mixOf, money, loop };
})();
