/* Albion Billionaire v2 — Cost to Max for refining: the cheapest route to level 100 in a refining line (Ore Smelter,
   Wood Planer, Fiber Weaver, Hide Tanner, Stone Cutter), all five tiers or one, from the player's Destiny Board levels
   and today's prices.

   The rules come from the game files (assets/data/v2/destiny.json "ref", built by tools/v2/build_destiny.py):
   - Nodes. Each resource has one node per tier, Adept (T4) to Elder (T8), each with 100 levels. A node's first level
     counts refines of any tier (3,713 fame for Adept up to 2,795,000 for Elder) and unlocks refining its tier; every
     later level counts refines of its own tier only.
   - Opening. A node takes fame once a neighbour on the board is unlocked: Adept once Journeyman Refiner is (240 fame
     of tier-2 refining, which this assumes), each later one once the tier below reaches level 1. Fame goes to every
     node that takes it, so a refine fills its own tier's node and the first level of the next locked one at once:
     maxing Adept also unlocks Expert, Master and Grandmaster, and most of Elder.
   - Fame. A refine's fame is its inputs' fame: two T4 ore (7.5 each) and a T3 bar (7.5) make a T4 bar worth 22.5,
     and 37.5 for T4.1 (whose bar is worth 45 to a crafter). Premium multiplies it by 1.5.
   - Focus. Each node's levels cut the focus cost of every refine of its resource (0.3 a level, T4 to T8) and of its
     own tier more (2.5 a level): all five at 100 make a refine cost a sixteenth of its base focus.
   - Returns: 36.7% of the inputs come back in the resource's refining bonus city, 53.9% with focus.
   - Learning points: Quick Learn, as for crafting, over the levels of every node being maxed.

   The route. Stages in tier order: a node's first level when it's still locked (the cheapest fame of any tier it may
   refine, less what earlier stages already put in it), then, for each node being maxed, the rest of its levels, from
   refines of its tier, the cheapest enchantments first. The pricing, focus, market shares and price ranges are the
   crafting route's (spec.solve): each refine sold in a market that buys it, up to its share of that market's sales,
   or kept. */
window.AB = window.AB || {};

AB.refine = (() => {
  const cat = AB.cat, S = AB.spec, store = AB.store;
  const TIERS = [2, 3, 4, 5, 6, 7, 8];
  const ENCH = [0, 1, 2, 3, 4];
  /* the refining part of the board, set up from spec's data when it's first asked for */
  let R = null, RX = [];
  const LINES = new Map(), NODES = new Map();
  function setup() {
    const D = S.data;
    if (!D || D.ref === R) return !!R;
    R = D.ref;
    RX = D.pat.map((ps) => ps.map(S.toRx));
    LINES.clear();
    NODES.clear();
    for (const l of R.lines) {
      const res = cat.RESOURCES.find((x) => x.raw === l.res);
      const line = { ...l, kind: "line", key: res.key, city: res.city, rawName: res.rawName, refinedName: res.refinedName, nodes: [] };
      for (const n of l.nodes) {
        const node = { ...n, kind: "refine", line: l.id, tpl: R.tpl[n.tier] };
        NODES.set(n.id, node);
        line.nodes.push(node);
      }
      LINES.set(l.id, line);
    }
    return true;
  }
  const ready = () => S.ready().then((d) => { setup(); return d; });
  /* a refining line by its id (CRAFT_REFINE_ORE) or by one of its nodes (CRAFT_REFINE_ORE_T6) */
  const line = (id) => (setup() ? LINES.get(id) || LINES.get(NODES.get(id)?.line) || null : null);
  const node = (id) => (setup() ? NODES.get(id) || null : null);
  const lines = () => (setup() ? [...LINES.values()] : []);
  const has = (id) => !!line(id);
  const journeyman = () => (setup() ? { name: R.jm[0], fame: R.jm[1] } : null);
  /* "Elder Ore Smelter" -> "Elder" */
  const rank = (n) => n.name.split(" ")[0];
  const first = (n) => n.tpl.fame[0] * n.fm;

  /* ---------- items ---------- */
  const idOf = (L, t, e) => `T${t}_${L.refined}` + (e ? `_LEVEL${e}@${e}` : "");
  /* every refine of a line that has a recipe: T2 and T3 (plain), T4 to T8 at every enchantment */
  const refineIds = (L) => TIERS.flatMap((t) => ENCH.map((e) => idOf(L, t, e))).filter((id) => cat.recipe(id));
  /* Everything a line's route may price: its refines and their inputs. */
  function needs(lineId) {
    const L = line(lineId);
    if (!L) return [];
    const out = new Set();
    for (const id of refineIds(L)) { out.add(id); for (const m of cat.recipe(id).mats) out.add(m.id); }
    return [...out];
  }
  /* focus cost efficiency for a refine from the line's levels ({nodeId: level}): each bonus counts for the tiers it
     names */
  function efficiency(id, levels) {
    const p = cat.parse(id);
    let e = 0;
    for (const [nid, lvl] of Object.entries(levels)) {
      const n = NODES.get(nid);
      if (!n || !(lvl > 0)) continue;
      for (const [bonus, pi, lo, hi] of n.fc) if (p.tier >= lo && p.tier <= hi && RX[pi].some((rx) => rx.test(p.base))) e += 100 * lvl * bonus;
    }
    return e;
  }

  /* ---------- a route ----------
     B: a market model with the line's items (AB.market.extend(needs(line))).
     o: { node (a line to max all five tiers, or one tier's node), levels: {nodeId: level}, premium, days, focusPerDay,
     fee, lp, share, royal, seed, draws } */
  function plan(B, o) {
    const L = line(o.node);
    if (!L) throw new Error("Unknown refining line.");
    const T = node(o.node);
    const targets = T ? [T] : L.nodes;
    const isTarget = (n) => targets.includes(n);
    const tax = o.premium ? 0.04 : 0.08, setup = store.setupFee, pf = o.premium ? 1.5 : 1;
    const days = Math.max(1, Math.min(S.MAX_DAYS, Math.round(o.days) || 30));
    const lv = (id) => Math.max(0, Math.min(100, Math.floor(o.levels?.[id] || 0)));
    const levels0 = Object.fromEntries(L.nodes.map((n) => [n.id, lv(n.id)]));
    const share = o.share > 0 ? Math.min(1, o.share) : S.SHARE;
    const royal = !!o.royal;
    const opts = { pf, fee: o.fee ?? 0, journals: false, share, cities: royal ? cat.ROYAL : cat.CITIES, markets: royal ? cat.ROYAL : cat.MARKETS, refine: { city: L.city, rr: cat.RETURN.refineBonus } };
    const legs = new Map();

    /* the ladders of the nodes being maxed, from level 1 up (a locked node's first level is a stage of its own), and
       the learning points spent where they save most fame */
    const ladders = new Map(targets.map((n) => [n.id, S.ladder(n, Math.max(1, levels0[n.id]))]));
    const ql = o.lp > 0 ? S.quickLearn([...ladders.values()], o.lp) : { used: 0, saved: 0, from: null };

    /* ---------- the stages, in tier order ---------- */
    const lvl = { ...levels0 }, fp = Object.fromEntries(L.nodes.map((n) => [n.id, 0]));
    const at = (t) => L.nodes[t - 4];
    const open = (n) => n.tier === 4 || lvl[at(n.tier - 1).id] >= 1 || (n.tier < 8 && lvl[at(n.tier + 1).id] >= 1);
    const canRefine = (t) => t <= 3 || lvl[at(t).id] >= 1;
    const events = []; // where each level of the nodes being maxed is reached: {x: route fame, n: levels}
    /* Fame from refines goes to the first level of every open locked node at once; a node that unlocks opens the next.
       `x0` is where the fame starts along the route. */
    const give = (fame, x0) => {
      let done = 0;
      for (;;) {
        const waiting = L.nodes.filter((n) => lvl[n.id] === 0 && open(n));
        if (!waiting.length || fame - done <= 1e-9) return;
        const step = Math.min(fame - done, ...waiting.map((n) => first(n) - fp[n.id]));
        done += step;
        for (const n of waiting) {
          fp[n.id] += step;
          if (fp[n.id] >= first(n) - 1e-6) { lvl[n.id] = 1; if (isTarget(n)) events.push({ x: x0 + done, n: 1 }); }
        }
      }
    };
    /* the locked nodes the route has to unlock: each locked node being maxed, and the ones below it that open it */
    const toUnlock = new Set();
    for (const n of targets) {
      if (lvl[n.id] !== 0) continue;
      toUnlock.add(n);
      for (let t = n.tier; t > 4 && !open(at(t)); t--) toUnlock.add(at(t - 1));
    }
    const stages = [];
    let x = 0;
    for (const n of L.nodes) {
      if (lvl[n.id] === 0 && toUnlock.has(n)) {
        /* its first level, from whatever the player can refine by then */
        const fame = first(n) - fp[n.id];
        stages.push({ kind: "unlock", node: n, tier: n.tier, tiers: TIERS.filter(canRefine), fresh: true, x0: x, x1: x + fame, fame, levels: { ...lvl } });
        give(fame, x);
        x += fame;
      }
      if (isTarget(n)) {
        const Ld = ladders.get(n.id), fame = S.total(Ld);
        if (fame > 1e-9) {
          const levels = { ...lvl, [n.id]: S.levelAt(Ld, fame / 2) };
          stages.push({ kind: "levels", node: n, tier: n.tier, tiers: [n.tier], fresh: true, x0: x, x1: x + fame, fame, from: Ld.from, levels });
          for (let l = Ld.from + 1; l <= 100; l++) events.push({ x: x + S.fameTo(Ld, l), n: 1 });
          give(fame, x);
          x += fame;
        }
        lvl[n.id] = 100;
      }
    }

    /* ---------- options: every refine of the line, priced ---------- */
    const all = refineIds(L).map((id) => S.option(B, legs, id, opts)).filter(Boolean);
    const options = all.filter((op) => !op.missing);
    const missing = [...new Set(all.filter((op) => op.missing).map((op) => op.missing))];

    /* the level axis: the levels of the nodes being maxed, summed (0 to 500 for all five), and where each is reached */
    events.sort((a, b) => a.x - b.x);
    const start = targets.reduce((a, n) => a + levels0[n.id], 0);
    const curve = [{ level: start, x: 0 }];
    let got = start;
    for (const e of events) { got += e.n; curve.push({ level: got, x: e.x }); }
    const levelOfX = (fx) => { let k = 0; while (k + 1 < curve.length && curve[k + 1].x <= fx + 1e-9) k++; return curve[k].level; };
    /* where each node's own levels start along that axis, after the first */
    const marks = stages.filter((st) => st.kind === "levels").slice(1).map((st) => ({ tier: st.tier, label: rank(st.node), at: levelOfX(st.x0) }));

    const Rt = S.solve(B, {
      stages, options, legs, opts, tax, setup, days, pre: null, seed: o.seed, draws: o.draws,
      focusTotal: Math.max(0, o.focusPerDay || 0) * days,
      eff: (op, k) => efficiency(op.id, stages[k].levels),
      span: (st) => (st.kind === "unlock" ? { from: { t: 0 }, to: { t: 1 } } : { from: { t: st.from }, to: { t: 100 } }),
      curve,
    });

    const table = S.perFame(options, tax, setup, share).map((r) => ({ ...r, unlockAt: r.tier <= 3 ? null : at(r.tier), locked: r.tier > 3 && levels0[at(r.tier).id] < 1 }));
    const target = stages.reduce((a, st) => a + st.fame, 0);
    return {
      kind: "refine", node: T, line: L, targets, premium: !!o.premium, days, short: Rt.short, share, royal, cities: opts.cities, tax, setup, fee: opts.fee, ops: options,
      levels0, start, top: 100 * targets.length,
      fame: { target, saved: ql.saved, full: target + ql.saved, earned: Rt.fameEarned },
      ql, steps: Rt.steps, table, missing, options: options.length, marks,
      totals: Rt.totals, range: Rt.range, curve: Rt.curve, legs: Rt.legs, draws: Rt.draws,
    };
  }

  return { TIERS, ready, line, node, lines, has, journeyman, rank, needs, refineIds, efficiency, plan };
})();
