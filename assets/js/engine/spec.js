/* Albion Billionaire v2 — Cost to Max: the cheapest route to level 100 in a crafting specialization (or a crafter
   mastery), from the player's levels, today's prices and Albion's own Destiny Board rules.

   The rules come from the game files (assets/data/v2/destiny.json, built by tools/v2/build_destiny.py):
   - Fame. A craft's fame is the fame of the resources in its recipe (artifacts give none) times the item's artifact
     factor (1.1 to 1.4). Every board node whose items include it gets that fame: the crafter mastery (Sword Crafter) and
     the item's specialization (Claymore Crafting Specialist). Premium multiplies it by 1.5.
   - Levels. A node's level table is a template times the node's fame multiplier: a sword specialization takes
     25,758,944 fame from 0 to 100, Sword Crafter half that. A mastery unlocks tiers as it levels (T4 at 1, T5 at 10, T6
     at 30, T7 at 60, T8 at 100). Its first level counts tier-3 crafts; every later level, and every specialization
     level, counts tier 4 and up.
   - Focus. A craft with focus gets more materials back (47.9% instead of 24.8% at the item's bonus city). Its focus
     cost is the recipe's times 0.5 ^ (efficiency / 10,000); efficiency is 100 × level × bonus, summed over the nodes
     whose patterns match the item, so it falls as the route levels up.
   - Journals. A craft puts its fame (artifact factor in, premium bonus left out) into a journal of its own tier; a full
     journal sells, an empty one costs 2,000 to 32,000 silver (or less on the market).
   - Learning points. With Quick Learn a level needs a fifth of its fame, for the level's learning-point cost.

   The route. Fame toward the target splits into stages by the tiers the mastery has unlocked. Each stage takes the
   cheapest silver per fame among the crafts it may make: each item sold in a market that buys it, up to a quarter of
   what that market sells a day over the chosen time, or kept unsold (worth nothing to the route). Filling the most
   restricted stage first, cheapest first, is the least total cost: every later stage may make everything an earlier
   one may (nested choices), so no swap can lower it. Focus goes where it saves most silver per point, at the levels
   the route has reached by then, the day's focus spread evenly over the route. Focus changes which crafts are
   cheapest, so the crafts are chosen at a few prices for a point of focus (and without it), and the route that costs
   least in full wins. A Monte Carlo over the calibrated price ranges gives the cost an 80% range. */
window.AB = window.AB || {};

AB.spec = (() => {
  const cat = AB.cat, conf = AB.conf, S = AB.stats, store = AB.store;
  const BM = cat.BM;
  /* Share of a market's daily sales the route may sell into, every day: a quarter, so it adds to the market rather
     than swamping it (the Black Market flip uses the same share for one batch). */
  const SHARE = 0.25;
  const QUICK = 0.2;          // Quick Learn: a level takes this share of its fame (learningpointfamefactor 5)
  const NUTRITION = 0.1125;   // nutrition a craft uses per point of item value (gamedata: ItemValueToNutrition)
  const MAX_FEE = 1000;       // the highest fee a station can charge per 100 nutrition (gamedata: maxuseagefee)
  const MAX_DAYS = 3650;
  const PACES = [14, 30, 60, 90, 180, 365];
  /* The price ranges are calibrated up to a week ahead; a route's average price is drawn from the week-out range
     (shorter routes from a third of their length, where a random walk's average varies like its value). */
  const HORIZON = 7;
  /* Prices for a point of focus the route tries while choosing crafts, as quantiles of what the crafts' own savings per
     point run to (besides free, and choosing without focus): enough to find where the day's focus runs out. */
  const FOCUS_Q = [0.1, 0.25, 0.5, 0.75, 0.9];
  /* Times the route re-chooses its crafts with journals scaled to what their markets take (it keeps the cheapest). */
  const JOURNAL_PASSES = 3;

  let D = null, pReady = null, RX = [];
  const NODES = new Map(), FAMJ = new Map();
  const ready = () => pReady || (pReady = AB.util.loadJSON("assets/data/v2/destiny.json").then((d) => { setup(d); return d; }).catch((e) => { pReady = null; throw e; }));

  /* "T?_2H_CLAYMORE*" -> /^T\d_2H_CLAYMORE.*$/ (patterns hold capitals, digits and underscores besides ? and *) */
  const toRx = (p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/^T\?/, "T\\d").replace(/\*/g, ".*") + "$");
  function setup(d) {
    D = d;
    RX = d.pat.map((ps) => ps.map(toRx));
    NODES.clear();
    FAMJ.clear();
    for (const line of d.lines) {
      NODES.set(line.id, { ...line, kind: "base", line: line.id, tpl: d.tpl.base });
      for (const s of line.specs) {
        NODES.set(s.id, { ...s, kind: "spec", line: line.id, tpl: d.tpl.spec });
        if (s.j) for (const f of s.fam) FAMJ.set(f, s.j);
      }
    }
  }
  const node = (id) => NODES.get(id) || null;
  const lineOf = (id) => { const n = node(id); return n ? node(n.line) : null; };
  const lines = () => (D ? D.lines.map((l) => node(l.id)) : []);
  const specsOf = (lineId) => (node(lineId)?.specs || []).map((s) => node(s.id));
  /* "Claymore Crafting Specialist" -> "Claymore", "Lumberjack Garb Crafter" -> "Lumberjack Garb"; masteries keep theirs */
  const short = (n) => (n.kind === "spec" ? n.name.replace(/ (Crafting|Tailoring) Specialist$| Crafter$/, "") : n.name);

  /* ---------- levels and fame ---------- */
  function cum(n) {
    if (!n.cum) { const c = [0]; for (let i = 0; i < 100; i++) c.push(c[i] + n.tpl.fame[i] * n.fm); n.cum = c; }
    return n.cum;
  }
  const fameBetween = (n, a, b) => cum(n)[b] - cum(n)[a];
  const lpOf = (n, i) => n.tpl.lp[i] * n.lpm; // learning points for level i -> i + 1
  /* The fame each remaining level needs, from a whole level `from` to 100; Quick Learn marks shrink some. */
  function ladder(n, from) {
    from = Math.max(0, Math.min(100, Math.floor(from)));
    const need = [];
    for (let i = from; i < 100; i++) need.push(n.tpl.fame[i] * n.fm);
    return { n, from, need, full: need.slice(), ql: new Map() };
  }
  const total = (L) => L.need.reduce((a, b) => a + b, 0);
  /* fame along the ladder to reach a whole level */
  function fameTo(L, level) { let f = 0; for (let i = L.from; i < Math.min(level, 100); i++) f += L.need[i - L.from]; return f; }
  /* the level (with its fraction) reached after `fame` along the ladder */
  function levelAt(L, fame) {
    let lvl = L.from;
    for (const f of L.need) { if (fame < f) return lvl + (f > 0 ? fame / f : 0); fame -= f; lvl++; }
    return 100;
  }
  /* Spend learning points with Quick Learn where they save the most fame per point. That's mostly the top levels (a
     level's fame grows faster than its point cost), but the point cost steps up unevenly, so the levels are sorted. A
     last partial level takes what's left, saving that share of its 80%. */
  function quickLearn(L, lp) {
    let left = Math.max(0, lp), used = 0, saved = 0;
    const order = [];
    for (let i = L.from; i < 100; i++) order.push(i);
    const perPoint = (i) => L.full[i - L.from] / lpOf(L.n, i);
    order.sort((a, b) => perPoint(b) - perPoint(a) || b - a);
    for (const i of order) {
      if (left <= 1e-9) break;
      const k = i - L.from, cost = lpOf(L.n, i), part = Math.min(1, left / cost);
      const s = L.full[k] * (1 - QUICK) * part;
      L.need[k] = L.full[k] - s;
      L.ql.set(i, part);
      left -= cost * part; used += cost * part; saved += s;
    }
    return { used, saved, from: L.ql.size ? Math.min(...L.ql.keys()) : null };
  }

  /* ---------- items ---------- */
  const familyIds = (fams, tiers, enchants = [0, 1, 2, 3, 4]) => {
    const out = [];
    for (const f of fams) for (const t of tiers) for (const e of enchants) { const id = `T${t}_${f}` + (e ? `@${e}` : ""); if (cat.recipe(id)) out.push(id); }
    return out;
  };
  /* fame per craft before premium, artifact factor included */
  function fame(id) {
    const r = cat.recipe(id);
    if (!r || !D) return null;
    let f = 0;
    for (const m of r.mats) f += m.n * (D.res[m.id]?.[0] || 0);
    return f * (D.ff[cat.parse(id).fam] || 1);
  }
  function matValue(mid) {
    const r = D.res[mid];
    if (r) return r[1];
    const a = /^T(\d)_(ARTEFACT_.+)$/.exec(mid);
    return a ? D.av[a[2]]?.[a[1] - 4] || 0 : 0;
  }
  /* item value, which the station's fee is charged on: the sum of its materials' values */
  const value = (id) => (cat.recipe(id)?.mats || []).reduce((a, m) => a + m.n * matValue(m.id), 0);
  const stationFee = (id, per100) => value(id) * NUTRITION * Math.max(0, Math.min(MAX_FEE, per100)) / 100;
  /* focus cost efficiency for an item from the player's levels ({nodeId: level}) */
  function efficiency(id, levels) {
    const b = id.split("@")[0];
    let e = 0;
    for (const [nid, lvl] of Object.entries(levels)) {
      const n = node(nid);
      if (!n || !(lvl > 0)) continue;
      for (const [bonus, pi] of n.fc) if (RX[pi].some((rx) => rx.test(b))) e += 100 * lvl * bonus;
    }
    return e;
  }
  /* A specialization whose items take an artifact or another special material besides refined resources (Kingmaker,
     Satchel of Insight): the saved snapshot doesn't price those, so the page lists them apart. */
  const REFINED = /^T\d_(PLANKS|METALBAR|LEATHER|CLOTH|STONEBLOCK)(_LEVEL\d@\d)?$/;
  const special = (n) => n.kind === "spec" && n.fam.some((f) => (cat.recipe(`T4_${f}`) || cat.recipe(`T5_${f}`))?.mats.some((m) => !REFINED.test(m.id)));
  /* A node with something to craft for it, T4 to T8, in the app's item data (which has no recipes for tracking toolkits
     or siege banners). */
  const craftable = (n) => (n.craftable ??= familyIds(n.fam, [4, 5, 6, 7, 8]).length > 0);
  const journalIds = (j, t) => ({ full: `T${t}_JOURNAL_${j}_FULL`, empty: `T${t}_JOURNAL_${j}_EMPTY` });
  /* Everything a line's routes may price: its items at every tier and enchantment (tier 3 for a mastery's first
     level), their materials, and its journals. */
  function needs(lineId) {
    const L = node(lineId);
    if (!L) return [];
    const ids = [...familyIds(L.fam, [3], [0]), ...familyIds(L.fam, [4, 5, 6, 7, 8])];
    const out = new Set(ids);
    for (const id of ids) for (const m of cat.recipe(id).mats) out.add(m.id);
    for (const j of new Set(L.fam.map((f) => FAMJ.get(f)).filter(Boolean))) for (let t = 4; t <= 8; t++) { const x = journalIds(j, t); out.add(x.full); out.add(x.empty); }
    return [...out];
  }

  /* ---------- prices from a market model (AB.market.extend) ----------
     A route runs for weeks, so every price is a typical one: the market's 7-day median sale (its calibrated range for
     the Monte Carlo), falling back to the listing when a market has fewer than 4 days of sales. */
  const typical = (st) => !!(st?.pred && st.n >= 4);
  function priceLeg(legs, id, city, st, l) {
    const k = id + "|" + city;
    if (!legs.has(k)) legs.set(k, { i: legs.size, id, city, st, l, price: typical(st) ? st.pred : l?.price ?? null, model: typical(st) });
    return legs.get(k);
  }
  /* the cheapest market to buy an item in, from the royal cities, Caerleon and Brecilien */
  function buyLeg(B, legs, id) {
    let best = null;
    for (const c of cat.CITIES) {
      const st = B.stat(id, c), l = B.listing(id, c, "sell");
      const p = typical(st) ? st.pred : l?.price;
      if (p && (!best || p < best.p)) best = { c, st, l, p };
    }
    return best ? priceLeg(legs, id, best.c, best.st, best.l) : null;
  }
  /* every market that has bought the item on at least 4 of the last 14 days: the Black Market (into its buy orders,
     tax only) and the cities (a sell order: tax and the listing fee) */
  function sellLegs(B, legs, id) {
    const out = [];
    for (const c of cat.MARKETS) {
      const st = B.stat(id, c);
      if (!typical(st) || !(st.perDay > 0)) continue;
      out.push({ leg: priceLeg(legs, id, c, st, B.listing(id, c, c === BM ? "buy" : "sell")), bm: c === BM, rate: SHARE * st.perDay });
    }
    return out;
  }

  /* One craftable item, priced: what a craft costs before selling it, the fame it gives, where it can sell. */
  function option(B, legs, id, o) {
    const r = cat.recipe(id), f = fame(id);
    if (!r || !f) return null;
    const p = cat.parse(id), mats = [];
    for (const m of r.mats) {
      const leg = buyLeg(B, legs, m.id);
      if (!leg) return { id, tier: p.tier, ench: p.ench, missing: m.id };
      mats.push({ leg, n: m.n, ret: !m.noReturn });
    }
    const RR = cat.craftCity(id) ? cat.RETURN.craftBonus : cat.RETURN.city;
    let journal = null;
    const j = FAMJ.get(p.fam);
    if (o.journals && j && p.tier >= 4) {
      const x = journalIds(j, p.tier), npc = D.jr.silver[p.tier - 4];
      const full = sellLegs(B, legs, x.full).filter((s) => !s.bm).sort((a, b) => b.leg.price - a.leg.price)[0];
      const empty = buyLeg(B, legs, x.empty);
      if (full) journal = { key: `${j}|${p.tier}`, j, full, empty: empty && empty.price < npc ? empty : null, npc, per: f / D.jr.fame[p.tier - 4], tier: p.tier };
    }
    return {
      id, tier: p.tier, ench: p.ench, fame: f * o.pf, mats, rr0: RR.none, rrF: RR.focus, city: cat.craftCity(id),
      fee: stationFee(id, o.fee), focus: r.focus, sells: sellLegs(B, legs, id), journal,
    };
  }
  /* silver per craft at a set of prices (pr(leg)): returnable materials or the rest, a sale's net, a journal's share */
  const matCost = (op, pr, ret) => op.mats.reduce((a, m) => a + (m.ret === ret ? m.n * pr(m.leg) : 0), 0);
  const baseCost = (op, pr) => matCost(op, pr, true) * (1 - op.rr0) + matCost(op, pr, false) + op.fee;
  const saleNet = (s, pr, tax, setup) => (s ? pr(s.leg) * (1 - tax - (s.bm ? 0 : setup)) : 0);
  function journalNet(op, pr, tax, setup) {
    const j = op.journal;
    if (!j) return 0;
    const empty = j.empty ? Math.min(pr(j.empty), j.npc) : j.npc;
    return Math.max(0, saleNet(j.full, pr, tax, setup) - empty) * j.per;
  }

  /* ---------- the allocation ----------
     stages: [{tier, fame}] in route order; offers: [{tier, fame (per craft), cost (per craft), cap (crafts)}].
     costOf(offer, stage index) may stand in for an offer's cost (the route prices focus that way, by stage).
     Each stage takes the cheapest silver per fame among the offers it may use (tier at most its own), whole crafts,
     until its fame is covered; a last craft's extra fame counts toward the next stage. Returns per-stage picks and the
     fame left uncovered (0 unless a stage has nothing it may craft). */
  function allocate(stages, offers, costOf = (x) => x.cost) {
    const left = offers.map((x) => x.cap);
    let carry = 0, short = 0;
    const picks = stages.map((st, k) => {
      const per = offers.map((x) => costOf(x, k) / x.fame);
      const order = offers.map((x, i) => i).filter((i) => offers[i].tier <= st.tier).sort((a, b) => per[a] - per[b] || a - b);
      let need = st.fame - carry;
      const got = [];
      for (const i of order) {
        if (need <= 1e-9) break;
        const x = offers[i];
        if (left[i] < 1) continue;
        const n = Math.min(left[i], Math.ceil(need / x.fame - 1e-9));
        left[i] -= n;
        need -= n * x.fame;
        got.push({ i, n });
      }
      carry = need < 0 ? -need : 0;
      if (need > 1e-9) short += need;
      return got;
    });
    return { picks, short };
  }

  /* ---------- a route ----------
     B: a market model with the line's items (AB.market.extend(needs(line))).
     o: { node, levels: {nodeId: level}, premium, days, focusPerDay, journals, fee, lp, seed, draws } */
  function plan(B, o) {
    const T = node(o.node);
    if (!T || !D) throw new Error("Unknown crafting node.");
    const Lm = node(T.line), isSpec = T.kind === "spec";
    const tax = o.premium ? 0.04 : 0.08, setup = store.setupFee, pf = o.premium ? 1.5 : 1;
    const days = Math.max(1, Math.min(MAX_DAYS, Math.round(o.days) || 30));
    const lv = (id) => Math.max(0, Math.min(100, Math.floor(o.levels?.[id] || 0)));
    const m0 = lv(Lm.id), s0 = isSpec ? lv(T.id) : null;
    const levels0 = {};
    for (const n of [Lm, ...specsOf(Lm.id)]) levels0[n.id] = lv(n.id);
    const legs = new Map();
    const opts = { pf, fee: o.fee ?? 0, journals: o.journals !== false };
    const pr0 = (leg) => leg.price;
    const sale0 = (s) => saleNet(s, pr0, tax, setup);

    /* the ladders: the target's, and the mastery's for the tier unlocks (its first level comes from tier-3 crafts) */
    const mStart = Math.max(m0, 1);
    const tL = ladder(T, isSpec ? s0 : mStart), mL = isSpec ? ladder(Lm, mStart) : tL;
    const ql = o.lp > 0 ? quickLearn(tL, o.lp) : { used: 0, saved: 0, from: null };
    const X = total(tL);
    const unlock = D.tpl.base.unlock;
    const gate = (t) => (mStart >= unlock[t] ? 0 : fameTo(mL, unlock[t]));
    const bounds = [0, gate(5), gate(6), gate(7), gate(8), Infinity].map((g) => Math.min(Math.max(g, 0), X));
    const stages = [];
    for (let k = 0; k < 5; k++) if (bounds[k + 1] > bounds[k]) stages.push({ tier: k + 4, x0: bounds[k], x1: bounds[k + 1], fame: bounds[k + 1] - bounds[k] });
    const unlocks = [];
    for (let t = 5; t <= 8; t++) { const g = gate(t); if (g > 0 && g < X) unlocks.push({ tier: t, at: levelAt(tL, g) }); }

    /* priced options for the target's items, T4 to T8 */
    const all = familyIds(isSpec ? T.fam : Lm.fam, [4, 5, 6, 7, 8]).map((id) => option(B, legs, id, opts)).filter(Boolean);
    const options = all.filter((x) => !x.missing);
    const missing = [...new Set(all.filter((x) => x.missing).map((x) => x.missing))];

    /* offers: each option sold at each market that buys it (up to its share of that market's sales over the days) or
       kept, its journal's value times jf(the journal's kind) included. Journals beyond what their markets take earn
       nothing, so later passes scale each kind's value down by the share of them that sells. */
    const build = (jf) => {
      const offers = [];
      for (const op of options) {
        const jv = op.journal ? journalNet(op, pr0, tax, setup) * jf(op.journal.key) : 0, base = baseCost(op, pr0);
        for (const s of op.sells) offers.push({ op, s, tier: op.tier, fame: op.fame, cost: base - sale0(s) - jv, cap: Math.floor(s.rate * days) });
        offers.push({ op, s: null, tier: op.tier, fame: op.fame, cost: base - jv, cap: Infinity });
      }
      return offers;
    };
    const jcap = new Map();
    for (const op of options) if (op.journal) jcap.set(op.journal.key, op.journal.full.rate * days);
    /* the share of each kind of journal (type and tier) a route's crafts fill that its market takes over the days */
    const jshare = (offers, picks) => {
      const made = new Map();
      picks.forEach((ps) => ps.forEach(({ i, n }) => { const j = offers[i].op.journal; if (j) made.set(j.key, (made.get(j.key) || 0) + n * j.per); }));
      return new Map([...made].map(([k, m]) => [k, Math.min(1, (jcap.get(k) || 0) / m)]));
    };
    /* the prelude: a mastery at 0 takes its first level from tier-3 crafts, the cheapest one sold where it pays most
       (or kept) */
    let pre = null;
    if (m0 === 0) {
      const fame1 = fameBetween(Lm, 0, 1);
      for (const id of familyIds(Lm.fam, [3], [0])) {
        const op = option(B, legs, id, { ...opts, journals: false });
        if (!op || op.missing) continue;
        const top = op.sells.slice().sort((a, b) => sale0(b) - sale0(a))[0] || null;
        const n = Math.ceil(fame1 / op.fame - 1e-9), sold = top ? Math.min(n, Math.floor(top.rate * days)) : 0;
        const cost = n * baseCost(op, pr0) - sold * sale0(top);
        if (!pre || cost < pre.cost) pre = { op, n, sold, top, cost, fame: fame1 };
      }
      if (!pre) pre = { op: null, n: 0, sold: 0, top: null, cost: null, fame: fame1, missing: true };
    }

    /* focus: the day's focus spread evenly over the route's fame. Each stage spends its share where it saves most silver
       per point, at the stage's middle levels (the line's other nodes at the player's levels). */
    const focusTotal = Math.max(0, o.focusPerDay || 0) * days;
    const mid = stages.map((st) => {
      const xm = (st.x0 + st.x1) / 2, levels = { ...levels0, [T.id]: levelAt(tL, xm) };
      if (isSpec) levels[Lm.id] = levelAt(mL, xm);
      return levels;
    });
    const fcMemo = new Map();
    const fcOf = (op, k) => {
      const key = op.id + "|" + k;
      if (!fcMemo.has(key)) fcMemo.set(key, cat.focusCost(op.focus, efficiency(op.id, mid[k])));
      return fcMemo.get(key);
    };
    const savingOf = (op) => matCost(op, pr0, true) * (op.rrF - op.rr0);

    /* A route from chosen crafts: each stage's focus, and the share of each kind of journal that sells (its totals
       count exactly those). */
    function finish(offers, res) {
      const jsold = jshare(offers, res.picks);
      const segs = stages.map((st, k) => {
        const budget = X > 0 ? (focusTotal * st.fame) / X : 0;
        const picks = res.picks[k].map(({ i, n }) => { const x = offers[i]; return { x, op: x.op, n, nF: 0, fc: fcOf(x.op, k), saving: savingOf(x.op) }; });
        let left = budget;
        for (const p of picks.slice().sort((a, b) => b.saving / b.fc - a.saving / a.fc)) {
          if (p.saving <= 0 || !(p.fc > 0) || left < p.fc) continue;
          p.nF = Math.min(p.n, Math.floor(left / p.fc));
          left -= p.nF * p.fc;
        }
        return {
          tier: st.tier, x0: st.x0, x1: st.x1, fame: st.fame, picks, focusBudget: budget, focusUsed: budget - left,
          from: { t: levelAt(tL, st.x0), m: levelAt(mL, st.x0) }, to: { t: levelAt(tL, st.x1), m: levelAt(mL, st.x1) },
        };
      });
      return { short: res.short, segs, js: (op) => (op.journal ? jsold.get(op.journal.key) ?? 1 : 0) };
    }
    /* The routes to try at one price for a point of focus, in silver (null: crafts chosen as if there were no focus; a
       craft is otherwise worth its focus saving less what its focus costs at that price). With journals: crafts chosen
       as if journals were worth nothing, at their full worth, then up to JOURNAL_PASSES times with each kind's worth
       scaled down by the share of it the last choice could sell. */
    function routesAt(price) {
      const costOf = price == null ? undefined : (x, k) => x.cost - Math.max(0, savingOf(x.op) - price * fcOf(x.op, k));
      const out = [];
      const tryWith = (jf) => { const offers = build(jf), res = allocate(stages, offers, costOf); out.push(finish(offers, res)); return { offers, res }; };
      let last = tryWith(() => 1);
      if (opts.journals && options.some((op) => op.journal)) {
        tryWith(() => 0);
        const scale = new Map();
        for (let pass = 0; pass < JOURNAL_PASSES; pass++) {
          const share = jshare(last.offers, last.res.picks);
          if (![...share.values()].some((v) => v < 1 - 1e-9)) break;
          for (const [k, v] of share) scale.set(k, (scale.get(k) ?? 1) * v);
          last = tryWith((k) => scale.get(k) ?? 1);
        }
      }
      return out;
    }

    /* money: one function for the point estimate and every Monte Carlo draw; per stage, so the cost builds by level */
    function costs(pr, A) {
      const stageCost = A.segs.map((g) => {
        let buy = 0, back = 0, fee = 0, sale = 0, jr = 0;
        for (const p of g.picks) {
          const mr = matCost(p.op, pr, true), mn = matCost(p.op, pr, false);
          buy += p.n * (mr + mn);
          back += mr * (p.n * p.op.rr0 + p.nF * (p.op.rrF - p.op.rr0));
          fee += p.n * p.op.fee;
          sale += p.n * saleNet(p.x.s, pr, tax, setup);
          jr += p.n * journalNet(p.op, pr, tax, setup) * A.js(p.op);
        }
        return { buy, back, fee, sale, jr, net: buy - back + fee - sale - jr };
      });
      const preCost = pre?.op ? pre.n * baseCost(pre.op, pr) - pre.sold * saleNet(pre.top, pr, tax, setup) : 0;
      return { stageCost, preCost, net: preCost + stageCost.reduce((a, s) => a + s.net, 0) };
    }

    /* The route that costs least in full at today's typical prices, among crafts chosen without focus and at a spread
       of prices for a point of focus (free, enough for every craft, up to what the crafts' own savings per point run
       to), each with journals valued and without. Every one is priced as a whole route, and the plain choices are
       among them, so weighing focus or journals never makes the route dearer than leaving them out. */
    const prices = [null];
    if (focusTotal > 0) {
      const perPoint = [];
      stages.forEach((st, k) => { for (const op of options) { const f = fcOf(op, k), v = savingOf(op); if (op.tier <= st.tier && f > 0 && v > 0) perPoint.push(v / f); } });
      if (perPoint.length) prices.push(...new Set([0, ...FOCUS_Q.map((q) => S.quantile(perPoint, q))]));
    }
    let A = null, point = null;
    for (const price of prices) for (const a of routesAt(price)) {
      const c = costs(pr0, a);
      if (!point || c.net < point.net - 1e-6) { A = a; point = c; }
    }
    const segs = A.segs;

    /* the Monte Carlo: every price drawn once per outcome from its calibrated range (a listing-only price from the
       app's wide uncalibrated one), at the horizon a route's average price varies like */
    const L = [...legs.values()];
    const h = Math.min(HORIZON, Math.max(1, days / 3));
    const samplers = L.map((lg) => conf.sampler(lg.model ? lg.st : { pred: lg.price, calibrated: false }, h));
    const r = S.rng(o.seed ?? 7);
    const draws = Math.max(0, o.draws ?? 400);
    const levelsOut = [];
    for (let lvl = tL.from; lvl <= 100; lvl++) levelsOut.push(lvl);
    const curveAt = (c) => levelsOut.map((lvl) => {
      const x = fameTo(tL, lvl);
      let v = c.preCost;
      segs.forEach((g, k) => { if (g.fame > 0) v += c.stageCost[k].net * Math.max(0, Math.min(1, (x - g.x0) / g.fame)); });
      return v;
    });
    const nets = [], curves = [];
    for (let d = 0; d < draws; d++) {
      const prices = L.map((lg, i) => (samplers[i] ? samplers[i](r) : lg.price));
      const c = costs((leg) => prices[leg.i], A);
      nets.push(c.net);
      curves.push(curveAt(c));
    }
    const qs = (xs) => { const s = xs.slice().sort((a, b) => a - b); return { p10: S.quantile(s, 0.1), p50: S.quantile(s, 0.5), p90: S.quantile(s, 0.9) }; };
    const range = draws ? qs(nets) : null;
    const pointCurve = curveAt(point);
    const curve = levelsOut.map((lvl, i) => ({ level: lvl, point: pointCurve[i], ...(draws ? qs(curves.map((c) => c[i])) : {}) }));

    /* the steps the page lists: per stage, each item's crafts, where they sell, and their net */
    let crafts = pre?.n || 0, kept = pre ? pre.n - pre.sold : 0, fameEarned = 0;
    const steps = segs.map((g, k) => {
      const byItem = new Map();
      for (const p of g.picks) {
        const it = byItem.get(p.op.id) || { id: p.op.id, op: p.op, n: 0, nF: 0, sold: [], net: 0, journals: 0 };
        it.n += p.n; it.nF += p.nF;
        it.sold.push({ city: p.x.s ? p.x.s.leg.city : null, n: p.n, price: p.x.s ? p.x.s.leg.price : 0 });
        it.net += p.n * (baseCost(p.op, pr0) - sale0(p.x.s) - journalNet(p.op, pr0, tax, setup) * A.js(p.op)) - p.nF * matCost(p.op, pr0, true) * (p.op.rrF - p.op.rr0);
        it.journals += p.op.journal ? p.n * p.op.journal.per * A.js(p.op) : 0;
        byItem.set(p.op.id, it);
        crafts += p.n; fameEarned += p.n * p.op.fame;
        if (!p.x.s) kept += p.n;
      }
      for (const it of byItem.values()) it.sold.sort((a, b) => b.n - a.n);
      return { ...g, items: [...byItem.values()].sort((a, b) => b.n - a.n), cost: point.stageCost[k] };
    });

    /* every option's silver per fame at its best outlet (the page's tier-by-enchantment map) */
    const table = options.map((op) => {
      const keep = baseCost(op, pr0) - journalNet(op, pr0, tax, setup);
      const best = op.sells.slice().sort((a, b) => sale0(b) - sale0(a))[0] || null;
      const perCraft = keep - (best ? Math.max(0, sale0(best)) : 0);
      const unlockAt = op.tier === 4 ? 1 : unlock[op.tier];
      return {
        id: op.id, tier: op.tier, ench: op.ench, fame: op.fame, perCraft, perFame: perCraft / op.fame, best: best?.leg.city || null,
        sells: op.sells.reduce((a, s) => a + s.rate / SHARE, 0), unlockAt, locked: mStart < unlockAt,
      };
    });

    const sum = (key) => point.stageCost.reduce((a, s) => a + s[key], 0);
    return {
      node: T, line: Lm, isSpec, s0, m0, premium: !!o.premium, days, short: A.short,
      fame: { target: X, saved: ql.saved, full: X + ql.saved, earned: fameEarned, mastery: isSpec ? total(mL) : X },
      ql, prelude: pre, steps, table, missing, options: options.length, unlocks, journals: { on: opts.journals, priced: options.some((op) => op.journal) },
      end: { t: levelAt(tL, fameEarned), m: levelAt(mL, fameEarned) },
      totals: { crafts, kept, buy: sum("buy"), back: sum("back"), fee: sum("fee"), sale: sum("sale"), journals: sum("jr"), pre: point.preCost, net: point.net, focus: segs.reduce((a, g) => a + g.focusUsed, 0), focusTotal },
      range, curve, legs: L, draws,
    };
  }

  /* How far to trust a route: the app's checks on the prices it rests on, each weighted by the silver that passes
     through it. The fame rules are exact (game files); whether markets absorb a route at a quarter of their sales is
     an assumption no backtest covers, so the evidence check stays at the app's neutral 0.4. */
  function confidence(B, p) {
    const flow = new Map(), sold = new Map();
    const add = (m, leg, silver) => { if (leg && silver > 0) m.set(leg, (m.get(leg) || 0) + silver); };
    for (const s of p.steps) for (const it of s.items) {
      for (const m of it.op.mats) add(flow, m.leg, it.n * m.n * m.leg.price);
      for (const x of it.sold) if (x.city) { const leg = it.op.sells.find((q) => q.leg.city === x.city).leg; add(flow, leg, x.n * x.price); add(sold, leg, x.n * x.price); }
      if (it.journals && it.op.journal) { const leg = it.op.journal.full.leg; add(flow, leg, it.journals * leg.price); add(sold, leg, it.journals * leg.price); }
    }
    if (p.prelude?.op) {
      for (const m of p.prelude.op.mats) add(flow, m.leg, p.prelude.n * m.n * m.leg.price);
      if (p.prelude.top && p.prelude.sold) { const leg = p.prelude.top.leg; add(flow, leg, p.prelude.sold * leg.price); add(sold, leg, p.prelude.sold * leg.price); }
    }
    /* a silver-weighted geometric mean, the way the score combines its checks */
    const mean = (m, fn) => { let a = 0, w = 0; for (const [leg, v] of m) { const x = fn(leg); if (x == null) continue; a += Math.log(Math.max(0.02, x)) * v; w += v; } return w ? Math.exp(a / w) : null; };
    const F = conf.F;
    const f = {
      fresh: B.fresh(B.medianAgeH), liquidity: mean(sold, (leg) => F.liquidity(leg.st?.perDay)), history: mean(flow, (leg) => F.history(leg.st)),
      agree: mean(flow, (leg) => (leg.l && leg.st?.pred ? F.agree(leg.l.price, leg.st.pred) : null)),
      odds: null, evidence: AB.scan.NO_TEST,
    };
    const score = conf.score(f);
    return { f, score, tier: conf.tier(score) };
  }

  return {
    ready, get data() { return D; }, SHARE, QUICK, MAX_FEE, MAX_DAYS, PACES, HORIZON,
    node, lineOf, lines, specsOf, short, special, cum, fameBetween, ladder, levelAt, fameTo, quickLearn, total, lpOf,
    fame, value, stationFee, efficiency, familyIds, craftable, needs, journalIds, allocate, plan, confidence,
  };
})();
