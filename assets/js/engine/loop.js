/* Albion Billionaire v2 — the daily loop: one day of a Cost to Max stage as a ride from city to city, in order, sized
   to the player's pack mount. Ported from v1's crafting plans ("Daily loop, city by city").

   A day. The route spreads its days over its fame, as it spreads focus, so a stage takes the route's days times its
   share of the fame, and each of its days makes that share of the stage's crafts. A stage shorter than a day is done in
   one go. Each market takes at most its share of a day's sales (a quarter, or a whole day with the limit off); the
   day's other crafts go to the bank, to sell on later days within the same share, which is how the route's totals
   count them. Crafts the route keeps unsold stay in the bank too.

   The ride. The loop starts at the bench (the items' crafting bonus city, so the day's crafting comes first) and goes
   around the royal ring (Thetford, Fort Sterling, Lymhurst, Bridgewatch, Martlock: blue and yellow zones only) in
   whichever direction keeps the heaviest leg lightest. It visits Caerleon (red zones) or Brecilien (the mists) only
   when the route buys or sells there, at the place in the ride that keeps the load lightest. Everything on board is
   counted leg by leg: crafts from the bench to their market, materials from where they're bought to the bench (bought
   after crafting, they're tomorrow's), raw materials to the refining city and the refined ones on to the bench.

   Refining your own. A refined material the day needs is refined without focus in its refining bonus city instead of
   bought, when that saves more than 5%: the raw material from the cheapest market, the tier-below material from the
   refining city when it's within 5% of the cheapest there is.

   Too heavy. While the heaviest leg is over the mount, the loop gives up the cheapest weight first: it buys a material
   at the bench instead of carrying it there, or refines less of what saves the least silver per kilo and buys that
   ready-made.

   Expand this loop. With the mount under 90% full, the loop takes more of the crafts its stage can make, each sold
   within what its market still takes that day, best silver per kilo first, keeping only those that leave the whole
   loop with more silver. With a Transport Mammoth every loop fills that way, as far as profit and the markets allow. */
window.AB = window.AB || {};

AB.loop = (() => {
  const cat = AB.cat, S = AB.spec;
  /* Pack mounts at Excellent quality (albiononlinegrind's table; the ratios match maxload in Albion's spells.json). */
  const MOUNTS = [
    { id: "ox8", name: "Elder's Transport Ox", short: "T8 ox", tier: 8, kg: 3657 },
    { id: "bear8", name: "Saddled Direbear", short: "Direbear", tier: 8, kg: 3090 },
    { id: "ox7", name: "Grandmaster's Transport Ox", short: "T7 ox", tier: 7, kg: 3058 },
    { id: "ox6", name: "Master's Transport Ox", short: "T6 ox", tier: 6, kg: 2577 },
    { id: "ox5", name: "Expert's Transport Ox", short: "T5 ox", tier: 5, kg: 2204 },
  ];
  /* The Elder's Transport Mammoth: spells.json gives it a maxload of 113.86 against the Elder's ox's 16.18, so at the
     same Excellent-quality scale it carries 113.86 / 16.18 × 3,657 ≈ 25,735 kg. */
  const MAMMOTH = { id: "mammoth8", name: "Elder's Transport Mammoth", short: "Mammoth", tier: 8, kg: Math.round((113.86 / 16.18) * 3657) };
  const REFINE_MIN = 0.05; // refine your own only when it saves more than this share of the ready-made price
  const NEAR = 0.05;       // the tier-below material comes from the refining city when within this of the cheapest
  const FILL = 0.9;        // Expand packs the mount to about this share
  const MIN_MARGIN = 0.03; // an added craft must clear this share of its price (inside it is noise)
  const CUT = 100;         // refined units given up per try when a leg is too heavy
  const STEPS = 80;        // tries at lightening a loop before it says it doesn't fit
  const POOL = 60, POOL_MAMMOTH = 250; // crafts Expand weighs, best silver per kilo first
  /* Where a market is: the Black Market trades in Caerleon. */
  const placeOf = (market) => (market === cat.BM ? "Caerleon" : market);
  /* The places off the royal ring and what reaching them means. */
  const OFF_RING = { Caerleon: "red zones, full loot", Brecilien: "the mists" };
  const kgOf = (id) => cat.weight(id) ?? 0;
  const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

  /* ---------- the day ---------- */
  /* The days stage k takes (the route's days times the stage's share of its fame), and one day's crafts: what each
     pick makes a day, with focus or without, and the market it sells in (none: kept unsold). */
  function dayOf(p, k) {
    const s = p.steps[k];
    const days = p.fame.target > 0 ? (p.days * s.fame) / p.fame.target : 0;
    const per = 1 / Math.max(1, days);
    const rows = s.picks.filter((q) => q.n > 0).map((q) => ({ op: q.op, s: q.x.s, units: q.n * per, uF: q.nF * per }));
    return { days, per, rows };
  }

  /* ---------- one loop ----------
     B: the line's market model (prices for refining inputs and for buying at the bench); p: the route (spec.plan, or
     refine.plan: then the "crafts" are refines and the bench is the resource's refining bonus city);
     rows: the day's crafts; cap: the mount's kg. `order` fixes the ride (Expand's tries keep the order they start
     from); without it the loop picks the lightest. */
  function build(B, p, rows, cap, order = null) {
    if (!rows.length) return null;
    /* the bench: each item's crafting bonus city; items without one go where most crafts are made, else where most
       material weight is bought, so it isn't carried */
    const benches = new Map();
    for (const r of rows) if (r.op.city) benches.set(r.op.city, (benches.get(r.op.city) || 0) + r.units);
    let main = [...benches].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    if (!main) {
      const w = new Map();
      for (const r of rows) for (const m of r.op.mats) { const c = placeOf(m.leg.city); w.set(c, (w.get(c) || 0) + r.units * m.n * kgOf(m.leg.id)); }
      main = [...w].filter(([c]) => cat.ROYAL.includes(c)).sort((a, b) => b[1] - a[1])[0]?.[0] || cat.RING[0];
    }
    for (const r of rows) r.bench = r.op.city || main;

    /* sales: each market's share of a day, the route's crafts first; the rest goes to the bank */
    const room = new Map();
    const sales = [], bank = [];
    for (const r of rows) {
      if (!r.s) { bank.push({ id: r.op.id, units: r.units, at: r.bench, kept: true }); continue; }
      const left = room.has(r.s) ? room.get(r.s) : r.s.rate;
      const sell = Math.min(r.units, Math.max(0, left));
      room.set(r.s, left - sell);
      const net = S.saleNet(r.s, (leg) => leg.price, p.tax, p.setup);
      if (sell > 0) sales.push({ id: r.op.id, units: sell, from: r.bench, city: placeOf(r.s.leg.city), market: r.s.leg.city, price: r.s.leg.price, net, kg: kgOf(r.op.id) });
      if (r.units - sell > 1e-9) bank.push({ id: r.op.id, units: r.units - sell, at: r.bench, market: r.s.leg.city, net });
    }

    /* materials: what the day's crafts take, by material and bench, after the returns (more with focus) */
    const needs = new Map();
    for (const r of rows) for (const m of r.op.mats) {
      const q = m.ret ? (r.units - r.uF) * m.n * (1 - r.op.rr0) + r.uF * m.n * (1 - r.op.rrF) : r.units * m.n;
      const k = m.leg.id + "|" + r.bench;
      const x = needs.get(k) || { m: m.leg.id, bench: r.bench, qty: 0, city: placeOf(m.leg.city), price: m.leg.price, w: kgOf(m.leg.id) };
      x.qty += q;
      needs.set(k, x);
    }
    /* refining your own: worth it when it saves more than REFINE_MIN; the rest is bought as the route buys it */
    const refinables = [], plain = [];
    for (const x of needs.values()) {
      const f = refining(B, x, p.fee, p.cities);
      if (f && f.saving > REFINE_MIN * x.price) refinables.push({ ...x, ...f });
      else plain.push(x);
    }

    /* journals: each kind the day's crafts fill, when a full one sells for more than an empty one costs */
    const jr = new Map();
    for (const r of rows) {
      const j = r.op.journal;
      if (!j) continue;
      const empty = j.empty ? Math.min(j.empty.price, j.npc) : j.npc;
      const net = S.saleNet(j.full, (leg) => leg.price, p.tax, p.setup);
      if (!(net > empty)) continue;
      const g = jr.get(j.key) || { key: j.key, j, tier: j.tier, n: 0, bench: r.bench, empty, emptyAt: j.empty && j.empty.price < j.npc ? placeOf(j.empty.city) : r.bench, npc: !(j.empty && j.empty.price < j.npc), full: j.full, net, kg: S.data.jr.kg[j.tier - 4] || 0 };
      g.n += r.units * j.per;
      jr.set(j.key, g);
    }
    const journals = [...jr.values()].map((g) => {
      const sell = Math.min(g.n, g.full.rate);
      return { ...g, sell, banked: g.n - sell, city: placeOf(g.full.leg.city), id: S.journalIds(g.j.j, g.tier) };
    });

    /* the cities the day needs */
    const need = (st) => {
      const c = new Set([main, ...rows.map((r) => r.bench)]);
      for (const x of plain) c.add(st.atBench.has(x) ? x.bench : x.city);
      for (const f of refinables) {
        const q = st.refine.get(f);
        if (q > 0) { c.add(f.at); for (const i of f.ins) c.add(i.city); }
        if (q < f.qty) c.add(f.city);
      }
      for (const s of sales) c.add(s.city);
      for (const g of journals) { c.add(g.emptyAt); if (g.sell > 0) c.add(g.city); }
      return c;
    };

    /* One ride in a given order: every stop's errands and silver, and each leg's load. */
    function ride(st, ord) {
      const k = ord.length, pos = new Map(ord.map((c, i) => [c, i]));
      const legs = ord.map((c, i) => ({ from: c, to: ord[(i + 1) % k], kg: 0 }));
      const carry = (from, to, kg) => { if (k < 2 || from === to || !(kg > 0)) return; for (let i = pos.get(from); i !== pos.get(to); i = (i + 1) % k) legs[i].kg += kg; };
      const stops = new Map(ord.map((c) => [c, { city: c, craft: [], sell: [], bank: [], buy: [], raw: [], input: [], refine: [], ready: [], jbuy: [], jsell: [], spend: 0, earn: 0, fee: 0 }]));
      const at = (c) => stops.get(c);
      for (const x of plain) {
        const here = st.atBench.has(x), city = here ? x.bench : x.city, price = here ? S.buyAt(B, x.m, x.bench).p : x.price;
        at(city).buy.push({ m: x.m, qty: x.qty, price, bench: x.bench, moved: here });
        carry(city, x.bench, x.qty * x.w);
      }
      for (const f of refinables) {
        const q = st.refine.get(f);
        if (q > 0) {
          at(f.at).refine.push({ m: f.m, qty: q, own: f.own, buy: f.price, fee: f.fee, bench: f.bench });
          for (const i of f.ins) {
            const qty = q * i.q;
            /* the tier-below material bought in the refining city is "for refining"; raw materials carry a top price,
               above which buying the refined one is cheaper */
            (i.raw ? at(i.city).raw : at(i.city).input).push({ m: i.id, qty, price: i.price, max: i.raw ? i.price + f.saving / i.q : null, for: f.m, at: f.at });
            carry(i.city, f.at, qty * kgOf(i.id));
          }
          carry(f.at, f.bench, q * f.w);
        }
        if (q < f.qty) {
          at(f.city).ready.push({ m: f.m, qty: f.qty - q, price: f.price, bench: f.bench });
          carry(f.city, f.bench, (f.qty - q) * f.w);
        }
      }
      for (const r of rows) at(r.bench).craft.push({ id: r.op.id, units: r.units, uF: r.uF, fee: r.op.fee, added: !!r.added });
      for (const s of sales) { at(s.city).sell.push(s); carry(s.from, s.city, s.units * s.kg); }
      for (const b of bank) at(b.at).bank.push(b);
      for (const g of journals) {
        at(g.emptyAt).jbuy.push({ id: g.id.empty, qty: g.n, price: g.empty, npc: g.npc, bench: g.bench });
        carry(g.emptyAt, g.bench, g.n * g.kg);
        if (g.sell > 0) { at(g.city).jsell.push({ id: g.id.full, qty: g.sell, price: g.full.leg.price, net: g.net, from: g.bench }); carry(g.bench, g.city, g.sell * g.kg); }
        if (g.banked > 1e-9) at(g.bench).bank.push({ id: g.id.full, units: g.banked, at: g.bench, market: g.full.leg.city, net: g.net, journal: true });
      }
      for (const s of stops.values()) {
        s.spend = sum(s.buy, (b) => b.qty * b.price) + sum(s.raw, (b) => b.qty * b.price) + sum(s.input, (b) => b.qty * b.price) + sum(s.ready, (b) => b.qty * b.price) + sum(s.jbuy, (b) => b.qty * b.price);
        s.earn = sum(s.sell, (x) => x.units * x.net) + sum(s.jsell, (x) => x.qty * x.net);
        s.fee = sum(s.craft, (c) => c.units * c.fee) + sum(s.refine, (x) => x.qty * x.fee);
      }
      const max = legs.reduce((a, l) => (l.kg > a.kg ? l : a), { kg: 0, from: ord[0], to: ord[0] });
      return { order: ord, legs, stops, max };
    }
    /* the lightest order: the ring from the bench, both ways (or, from a bench off the ring, every way in), with each
       off-ring place tried at every point of the ride */
    function orders(st) {
      const c = need(st);
      const ring = cat.RING.filter((x) => c.has(x));
      const off = [...c].filter((x) => !cat.RING.includes(x) && x !== main);
      const starts = [];
      if (cat.RING.includes(main)) {
        const i = ring.indexOf(main), r = ring.slice(i).concat(ring.slice(0, i));
        starts.push(r, [r[0], ...r.slice(1).reverse()]);
      } else {
        for (let i = 0; i < Math.max(1, ring.length); i++) { const r = ring.slice(i).concat(ring.slice(0, i)); starts.push([main, ...r], [main, ...r.slice().reverse()]); }
      }
      let all = starts;
      for (const x of off) all = all.flatMap((o) => o.map((_, j) => [...o.slice(0, j + 1), x, ...o.slice(j + 1)]));
      const seen = new Set();
      return all.filter((o) => { const key = o.join(">"); if (seen.has(key)) return false; seen.add(key); return true; });
    }
    const best = (st) => {
      if (order && [...need(st)].every((c) => order.includes(c))) return ride(st, order.filter((c) => need(st).has(c)));
      let b = null;
      for (const o of orders(st)) { const r = ride(st, o); if (!b || r.max.kg < b.max.kg - 1e-6) b = r; }
      return b;
    };

    /* lighten a ride that's over the mount: the cheapest silver per kilo first */
    const st = { refine: new Map(refinables.map((f) => [f, f.qty])), atBench: new Set() };
    let L = best(st);
    const moved = [], cut = new Set();
    for (let it = 0; it < STEPS && L.max.kg > cap + 1e-6; it++) {
      const li = L.legs.indexOf(L.max), over = L.max.kg - cap;
      /* how much a change lightens the heaviest leg: that leg in the same ride, or the heaviest of a new ride when the
         change brings in a stop the ride doesn't have */
      const lighter = (t) => ([...need(t)].every((c) => L.order.includes(c)) ? L.max.kg - ride(t, L.order).legs[li].kg : L.max.kg - best(t).max.kg);
      let pick = null;
      for (const x of plain) {
        if (st.atBench.has(x) || x.city === x.bench) continue;
        const pc = S.buyAt(B, x.m, x.bench).p;
        if (!pc) continue;
        const drop = lighter({ refine: st.refine, atBench: new Set([...st.atBench, x]) });
        if (drop <= 1e-9) continue;
        const c = Math.max(0, (pc - x.price) * x.qty) / drop;
        if (!pick || c < pick.c) pick = { c, apply: () => { st.atBench.add(x); moved.push({ m: x.m, from: x.city, to: x.bench, extra: (pc - x.price) * x.qty }); } };
      }
      for (const f of refinables) {
        const q = st.refine.get(f);
        if (q <= 0) continue;
        const step = Math.min(q, CUT);
        const drop = lighter({ refine: new Map(st.refine).set(f, q - step), atBench: st.atBench }) / step;
        if (drop <= 1e-9) continue;
        const c = Math.max(0, f.saving) / drop;
        if (!pick || c < pick.c) pick = { c, apply: () => { st.refine.set(f, Math.max(0, q - Math.min(q, Math.ceil(over / drop)))); cut.add(f.m); } };
      }
      if (!pick) break;
      pick.apply();
      L = best(st);
    }

    const tot = [...L.stops.values()].reduce((t, s) => ({ spend: t.spend + s.spend, earn: t.earn + s.earn, fee: t.fee + s.fee }), { spend: 0, earn: 0, fee: 0 });
    tot.keep = tot.earn - tot.spend - tot.fee;
    const refined = refinables.filter((f) => st.refine.get(f) > 0);
    const saved = sum(refined, (f) => st.refine.get(f) * f.saving);
    /* The first day starts at stop 2 with nothing on board and ends at the bench, so a material refined before all its
       inputs are aboard (one is bought later in the ride, or at the bench, which comes last that day) is bought
       ready-made that once. */
    const posOf = new Map(L.order.map((c, i) => [c, i]));
    const early = (f) => { const j = posOf.get(f.at); return j > 0 && f.ins.some((i) => { const q = posOf.get(i.city); return q === 0 || q > j; }); };
    return {
      main, order: L.order, legs: L.legs, stops: L.stops, max: L.max, cap, fits: L.max.kg <= cap + 1e-6, tot,
      crafts: sum(rows, (r) => r.units), focusCrafts: sum(rows, (r) => r.uF), fame: sum(rows, (r) => r.units * r.op.fame),
      sold: sum(sales, (s) => s.units), banked: sum(bank.filter((b) => !b.kept), (b) => b.units), kept: sum(bank.filter((b) => b.kept), (b) => b.units),
      bankValue: sum(bank.filter((b) => !b.kept), (b) => b.units * b.net) + sum(journals, (g) => g.banked * g.net),
      journals, saved, fullSave: sum(refinables, (f) => f.qty * f.saving), moved, cut: [...cut],
      refinables: refinables.map((f) => ({ m: f.m, qty: f.qty, refined: st.refine.get(f), city: f.at, saving: f.saving, own: f.own, price: f.price })),
      dayOne: refined.filter(early).map((f) => ({ m: f.m, qty: st.refine.get(f), city: f.city, price: f.price })),
      off: L.order.filter((c) => OFF_RING[c]).map((c) => ({ city: c, why: OFF_RING[c] })),
    };
  }

  /* Refining a material yourself, per unit: its inputs (raw from the cheapest of the route's markets; the tier-below
     material from the refining city when within NEAR of the cheapest), the station fee, and the saving against buying
     it. Null when it isn't a refined resource or an input has no price. */
  function refining(B, x, fee, cities) {
    const P = cat.parse(x.m), r = cat.recipe(x.m);
    if (P.kind !== "refined" || !P.res || !r) return null;
    const at = P.res.city, RR = cat.RETURN.refineBonus.none;
    const ins = [];
    for (const m of r.mats) {
      const raw = cat.parse(m.id).kind === "raw";
      const low = S.cheapest(B, m.id, cities), here = S.buyAt(B, m.id, at);
      if (!low) return null;
      const pick = !raw && here.p && here.p <= low.p * (1 + NEAR) ? here : low;
      ins.push({ id: m.id, raw, q: (m.n * (m.noReturn ? 1 : 1 - RR)) / r.amount, city: placeOf(pick.c), price: pick.p });
    }
    const f = S.stationFee(x.m, fee);
    const own = sum(ins, (i) => i.q * i.price) + f;
    return { at, ins, fee: f, own, saving: x.price - own };
  }

  /* ---------- Expand this loop ----------
     More of the stage's crafts, no focus, each sold within what its market still takes that day, best silver per kilo
     first; an addition stays only when the whole loop keeps more silver and its heaviest leg stays within FILL of the
     mount (the spare the page asks the player to keep for gear and bags). */
  function expand(B, p, k, rows, cap, { pool = POOL } = {}) {
    let L = build(B, p, rows.map((r) => ({ ...r })), cap);
    if (!L) return null;
    const base = L;
    const step = p.steps[k];
    const used = new Map();
    for (const r of rows) if (r.s) used.set(r.s, (used.get(r.s) || 0) + r.units);
    const pr = (leg) => leg.price;
    const cand = [];
    for (const op of p.ops) {
      if (!S.allows(step, op.tier)) continue;
      const cost = S.baseCost(op, pr);
      const kgEach = kgOf(op.id) + sum(op.mats, (m) => m.n * (m.ret ? 1 - op.rr0 : 1) * kgOf(m.leg.id));
      for (const s of op.sells) {
        const profit = S.saleNet(s, pr, p.tax, p.setup) - cost;
        if (profit > 0 && profit >= MIN_MARGIN * s.leg.price) cand.push({ op, s, profit, perKg: profit / Math.max(0.1, kgEach) });
      }
    }
    cand.sort((a, b) => b.perKg - a.perKg || b.profit - a.profit);
    let cur = rows.map((r) => ({ ...r }));
    const added = [];
    /* each craft takes as much of its market's room as fits: all of it, else half, a quarter or an eighth, again
       until none of those fits */
    for (const { op, s, profit } of cand.slice(0, pool)) {
      if (L.max.kg >= cap * FILL) break;
      for (let more = true; more;) {
        more = false;
        const left = Math.floor(s.rate - (used.get(s) || 0) + 1e-9);
        if (left < 1) break;
        for (const n of [...new Set([left, Math.ceil(left / 2), Math.ceil(left / 4), Math.ceil(left / 8)])]) {
          const tryRows = [...cur.map((r) => ({ ...r })), { op, s, units: n, uF: 0, added: true }];
          const T = build(B, p, tryRows, cap, L.order);
          if (T.max.kg <= cap * FILL + 1e-6 && T.tot.keep > L.tot.keep + 1e-6) {
            cur = tryRows;
            used.set(s, (used.get(s) || 0) + n);
            const a = added.find((x) => x.id === op.id && x.market === s.leg.city);
            if (a) { a.units += n; a.profit += n * profit; } else added.push({ id: op.id, market: s.leg.city, units: n, profit: n * profit });
            L = T;
            more = true;
            break;
          }
        }
      }
    }
    /* the final ride may find a lighter order for what was added; "full" when it packed to within NEAR of FILL */
    const end = added.length ? build(B, p, cur.map((r) => ({ ...r })), cap) : L;
    const out = end.max.kg <= L.max.kg + 1e-6 ? end : L;
    return { loop: out, rows: cur, base, added, full: out.max.kg >= cap * (FILL - NEAR) };
  }

  /* ---------- a stage's loop for the page ----------
     o: { mount (kg), mammoth (bool: fills every loop), expand (bool), other (kg: the mount to compare with) } */
  function stage(B, p, k, o = {}) {
    const d = dayOf(p, k);
    if (!d.rows.length) return null;
    const cap = o.mammoth ? MAMMOTH.kg : o.mount || MOUNTS[0].kg;
    const grow = o.mammoth || o.expand;
    const E = grow ? expand(B, p, k, d.rows, cap, { pool: o.mammoth ? POOL_MAMMOTH : POOL }) : null;
    const L = E ? E.loop : build(B, p, d.rows.map((r) => ({ ...r })), cap);
    /* the same day on another mount, for comparison */
    const other = o.other ? build(B, p, (E ? E.rows : d.rows).map((r) => ({ ...r })), o.other) : null;
    /* the days this stage takes at the loop's pace (Expand's extra crafts finish it sooner) */
    const stageFame = p.steps[k].fame;
    const daysAt = (fameDay) => (fameDay > 0 ? stageFame / fameDay : 0);
    return { k, tier: p.steps[k].tier, days: d.days, per: d.per, loop: L, base: E?.base || L, added: E?.added || [], full: E?.full ?? false, expanded: !!E, other, daysNow: daysAt(L.fame), daysBase: daysAt((E?.base || L).fame) };
  }

  return { MOUNTS, MAMMOTH, FILL, REFINE_MIN, RING: cat.RING, OFF_RING, placeOf, dayOf, build, expand, stage, refining };
})();
