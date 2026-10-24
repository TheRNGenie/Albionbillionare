/* Cost to Max (engine/spec.js): Albion's Destiny Board rules, and the cheapest route to level 100 over the saved
   snapshot. The rules are checked against numbers the game shows; the route against what it promises: tiers open as
   the mastery unlocks them, no market takes more than its share, the totals add up, and more time never costs more. */
import test from "node:test";
import assert from "node:assert/strict";
import { scanned } from "./load.mjs";

const { AB } = await scanned();
const { spec: S, cat } = AB;
await S.ready();
const B = await AB.market.extend(S.needs("CRAFT_SWORDS"));
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const SWORDS = S.node("CRAFT_SWORDS"), CLAYMORE = S.node("CRAFT_SWORDS_CLAYMORE");
const BASE = { node: CLAYMORE.id, levels: {}, premium: true, days: 90, focusPerDay: 10000, journals: true, fee: 0, lp: 0, seed: 7, draws: 0 };
const route = (o = {}, b = B) => S.plan(b, { ...BASE, ...o });
const items = (p) => p.steps.flatMap((s) => s.items);

test("fame per craft is what the game gives: the resources' fame, times the artifact factor", () => {
  assert.equal(S.fame("T8_2H_CLAYMORE"), 44640, "a T8 two-hander");
  assert.equal(S.fame("T6_MAIN_SWORD@2"), 25920, "a T6.2 one-hander");
  assert.equal(S.fame("T4_HEAD_PLATE_SET1"), 180, "a T4 helmet");
  /* Kingmaker: a claymore's resources and an artifact, which gives no fame of its own; the family counts 1.4 times */
  assert.equal(S.data.ff["2H_CLAYMORE_AVALON"], 1.4);
  assert.ok(close(S.fame("T4_2H_CLAYMORE_AVALON"), 1.4 * S.fame("T4_2H_CLAYMORE")));
  assert.equal(S.fame("T4_NOT_AN_ITEM"), null);
});

test("levels: the fame and learning points to 100 match the game's tables, and the ladder reads both ways", () => {
  assert.equal(S.cum(CLAYMORE)[100], 25758944, "a sword specialization, 0 to 100");
  assert.equal(S.cum(SWORDS)[100], 12879472, "Sword Crafter, 0 to 100");
  let lp = 0;
  for (let i = 0; i < 100; i++) lp += S.lpOf(CLAYMORE, i);
  assert.equal(Math.round(lp), 3050, "learning points for all of Claymore");
  const L = S.ladder(CLAYMORE, 37);
  assert.equal(S.total(L), S.fameBetween(CLAYMORE, 37, 100));
  assert.equal(S.levelAt(L, 0), 37);
  assert.equal(S.levelAt(L, S.total(L)), 100);
  for (const f of [1, 12345, 2e6, 9.5e6, S.total(L) - 1]) {
    const lvl = S.levelAt(L, f), whole = Math.floor(lvl);
    assert.ok(S.fameTo(L, whole) <= f && f < S.fameTo(L, whole + 1), `${f} fame reads as level ${lvl}`);
  }
});

test("Quick Learn spends points where they save the most fame, leaving a fifth of each level to earn", () => {
  const top = S.ladder(CLAYMORE, 0), cost99 = S.lpOf(CLAYMORE, 99);
  const q = S.quickLearn(top, cost99);
  assert.ok(close(q.used, cost99));
  assert.equal(q.from, 99, "the top level saves the most fame per point");
  assert.ok(close(top.need[99], 0.2 * top.full[99]));
  assert.ok(close(q.saved, 0.8 * top.full[99]));
  const half = S.ladder(CLAYMORE, 0);
  S.quickLearn(half, cost99 / 2);
  assert.ok(close(half.need[99], 0.6 * half.full[99]), "half a level's points save half its 80%");
  /* The order is by fame saved per point, not by level: level 89's point cost steps up, so level 88 saves more per
     point. With points for levels 90 to 99 and half of one more, that half goes to 88. */
  const lpFrom = (a) => { let x = 0; for (let i = a; i < 100; i++) x += S.lpOf(CLAYMORE, i); return x; };
  const some = S.ladder(CLAYMORE, 0), pts = lpFrom(90) + S.lpOf(CLAYMORE, 89) / 2, r = S.quickLearn(some, pts);
  const per = (i) => some.full[i] / S.lpOf(CLAYMORE, i);
  const done = [...some.ql.keys()], rest = [...Array(100).keys()].filter((i) => !some.ql.has(i));
  assert.ok(Math.min(...done.map(per)) >= Math.max(...rest.map(per)), "no level left out saves more per point than one taken");
  assert.ok(close(r.used, pts));
  const all = S.ladder(CLAYMORE, 0), full = S.total(all), q2 = S.quickLearn(all, 1e6);
  assert.ok(close(q2.used, lpFrom(0)) && q2.from === 0, "points beyond the whole ladder go unspent");
  assert.ok(close(q2.saved, 0.8 * full) && close(S.total(all), 0.2 * full));
});

test("focus efficiency adds the board's bonuses for the item, and halves the focus cost every 10,000", () => {
  assert.equal(S.efficiency("T4_2H_CLAYMORE", { CRAFT_SWORDS: 100, CRAFT_SWORDS_CLAYMORE: 100 }), 31000, "3,000 from Sword Crafter, 28,000 from Claymore");
  assert.equal(S.efficiency("T7_2H_CLAYMORE@3", { CRAFT_SWORDS: 100, CRAFT_SWORDS_CLAYMORE: 100 }), 31000, "any tier and enchantment");
  assert.equal(S.efficiency("T5_MAIN_SWORD", { CRAFT_SWORDS_CLAYMORE: 100 }), 3000, "Claymore helps the line's other swords a little");
  assert.equal(S.efficiency("T4_2H_CLAYMORE", { CRAFT_SWORDS: 50 }), 1500);
  assert.equal(S.efficiency("T4_BAG", { CRAFT_SWORDS: 100, CRAFT_SWORDS_CLAYMORE: 100 }), 0, "another line's item");
  assert.equal(cat.focusCost(1000, 10000), 500);
  assert.equal(cat.focusCost(1000, 20000), 250);
});

test("the station fee is the item's nutrition times the fee, capped at the game's highest", () => {
  assert.equal(S.value("T4_2H_CLAYMORE"), 512, "32 resources of item value 16");
  assert.equal(S.value("T4_2H_CLAYMORE_AVALON"), 512 + S.data.av.ARTEFACT_2H_CLAYMORE_AVALON[0], "an artifact adds its value");
  assert.ok(close(S.stationFee("T4_2H_CLAYMORE", 300), 512 * 0.1125 * 3));
  assert.equal(S.stationFee("T4_2H_CLAYMORE", 5000), S.stationFee("T4_2H_CLAYMORE", S.MAX_FEE));
  assert.equal(S.stationFee("T4_2H_CLAYMORE", -5), 0);
});

test("each stage gets the cheapest crafts it may make: the same total as trying every split", () => {
  /* With one fame per craft, whole crafts lose nothing, so the stage-by-stage choice must match an exhaustive search. */
  const r = AB.stats.rng(11);
  const best = (stages, offers) => {
    let min = Infinity;
    const go = (k, left, cost) => {
      if (k === stages.length) { min = Math.min(min, cost); return; }
      const ok = offers.map((x, i) => i).filter((i) => offers[i].tier <= stages[k].tier);
      const fill = (j, need, left2, c) => {
        if (need === 0) return go(k + 1, left2, c);
        if (j === ok.length) return;
        const i = ok[j];
        for (let n = 0; n <= Math.min(need, left2[i]); n++) { const l = left2.slice(); l[i] -= n; fill(j + 1, need - n, l, c + n * offers[i].cost); }
      };
      fill(0, stages[k].fame, left, cost);
    };
    go(0, offers.map((x) => x.cap), 0);
    return min;
  };
  for (let trial = 0; trial < 300; trial++) {
    const stages = [{ tier: 4, fame: 1 + Math.floor(r() * 4) }, { tier: 5, fame: 1 + Math.floor(r() * 4) }];
    const offers = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({ tier: r() < 0.5 ? 4 : 5, fame: 1, cost: Math.round(r() * 20) - 5, cap: Math.floor(r() * 4) }));
    offers.push({ tier: 4, fame: 1, cost: 30, cap: Infinity }); // a craft that's always there: made and kept unsold
    const { picks, short } = S.allocate(stages, offers);
    assert.equal(short, 0);
    const used = offers.map(() => 0);
    picks.forEach((ps, k) => {
      for (const { i, n } of ps) { assert.ok(offers[i].tier <= stages[k].tier, "a stage only makes what it has unlocked"); used[i] += n; }
      assert.equal(ps.reduce((a, { n }) => a + n, 0), stages[k].fame, "each stage gets exactly its fame");
    });
    used.forEach((n, i) => assert.ok(n <= offers[i].cap, "no offer beyond its cap"));
    const cost = picks.flat().reduce((a, { i, n }) => a + n * offers[i].cost, 0);
    assert.equal(cost, best(stages, offers), `trial ${trial}`);
  }
  /* bigger crafts: a last craft's extra fame counts toward the next stage, and a stage with nothing to make is short */
  const carry = S.allocate([{ tier: 4, fame: 10 }, { tier: 5, fame: 10 }], [{ tier: 4, fame: 6, cost: 6, cap: Infinity }]);
  assert.deepEqual(carry.picks.map((ps) => ps.map(({ n }) => n)), [[2], [2]]);
  assert.equal(S.allocate([{ tier: 4, fame: 5 }], [{ tier: 5, fame: 1, cost: 1, cap: Infinity }]).short, 5);
});

test("a route over the snapshot: tiers open with the mastery, markets take their share, and the totals add up", () => {
  const p = route({ draws: 100 });
  assert.equal(p.fame.target, 25758944);
  assert.deepEqual(p.steps.map((s) => s.tier), [4, 5, 6, 7, 8]);
  [10, 30, 60, 100].forEach((lvl, k) => assert.ok(close(p.steps[k].x1, S.fameBetween(SWORDS, 1, lvl)), `T${k + 5} opens at Sword Crafter ${lvl}`));
  assert.equal(p.steps.at(-1).x1, p.fame.target);
  for (const s of p.steps) for (const it of s.items) assert.ok(cat.parse(it.id).tier <= s.tier, `${it.id} in the T${s.tier} stage`);
  /* enough fame, and never more than one craft past it */
  const biggest = Math.max(...items(p).map((it) => it.op.fame));
  assert.ok(p.fame.earned >= p.fame.target && p.fame.earned - p.fame.target < biggest);
  assert.equal(p.end.t, 100);
  assert.equal(p.end.m, 100, "Sword Crafter is maxed on the way");
  /* each market takes at most a quarter of what it sells a day, over the days */
  const sold = new Map();
  for (const it of items(p)) for (const x of it.sold) if (x.city) sold.set(it.id + "|" + x.city, (sold.get(it.id + "|" + x.city) || 0) + x.n);
  assert.ok(sold.size > 0);
  for (const [k, n] of sold) {
    const [id, city] = k.split("|");
    assert.ok(n <= Math.floor(S.SHARE * B.stat(id, city).perDay * p.days), `${n} ${id} into ${city}`);
  }
  /* the totals: every silver counted once */
  const t = p.totals;
  assert.ok(close(t.net, t.buy - t.back + t.fee - t.sale - t.journals + t.pre, 1e-9));
  assert.ok(close(t.net, t.pre + p.steps.reduce((a, s) => a + s.cost.net, 0)));
  for (const s of p.steps) assert.ok(close(s.cost.net, s.items.reduce((a, it) => a + it.net, 0), 1e-9), `T${s.tier} stage`);
  assert.equal(t.crafts, (p.prelude?.n || 0) + items(p).reduce((a, it) => a + it.n, 0));
  assert.equal(t.kept, (p.prelude ? p.prelude.n - p.prelude.sold : 0) + items(p).reduce((a, it) => a + it.sold.filter((x) => !x.city).reduce((b, x) => b + x.n, 0), 0));
  /* focus: within each stage's share of the day's focus, on crafts the route makes */
  assert.ok(t.focus > 0 && t.focus <= t.focusTotal + 1e-6);
  for (const s of p.steps) assert.ok(s.focusUsed <= s.focusBudget + 1e-6);
  for (const it of items(p)) assert.ok(it.nF <= it.n);
  /* the running cost starts at the first level and ends at the total; the range is ordered */
  assert.equal(p.curve[0].level, 0);
  assert.equal(p.curve.at(-1).level, 100);
  assert.ok(close(p.curve.at(-1).point, t.net, 1e-9));
  assert.ok(p.range.p10 <= p.range.p50 && p.range.p50 <= p.range.p90);
  for (const c of p.curve) assert.ok(c.p10 <= c.p90, `level ${c.level}`);
});

test("a mastery route takes its first level from tier 3 and never crafts tier 8, which opens only at 100", () => {
  const p = route({ node: SWORDS.id });
  assert.equal(p.fame.target, S.fameBetween(SWORDS, 1, 100));
  assert.equal(p.prelude.fame, S.fameBetween(SWORDS, 0, 1));
  assert.ok(p.steps.every((s) => s.tier < 8));
  assert.deepEqual(p.unlocks.map((u) => u.tier), [5, 6, 7]);
  p.unlocks.forEach((u, k) => assert.ok(close(u.at, [10, 30, 60][k], 1e-9)));
  /* a mastery already past 0 has no tier-3 step */
  assert.equal(route({ node: SWORDS.id, levels: { CRAFT_SWORDS: 12 } }).prelude, null);
});

test("more time never costs more: a longer time can always repeat a shorter route", () => {
  for (const node of [CLAYMORE.id, SWORDS.id]) for (const focusPerDay of [0, 10000]) {
    let last = Infinity;
    for (const days of S.PACES) {
      const net = route({ node, focusPerDay, days }).totals.net;
      assert.ok(net <= last + 1e-6, `${node}, focus ${focusPerDay}: ${days} days cost ${net}, more than ${last} in less time`);
      last = net;
    }
  }
});

test("the settings do what they say: no focus, no journals, a station fee, learning points and premium", () => {
  const full = route();
  const nf = route({ focusPerDay: 0 });
  assert.equal(nf.totals.focus, 0);
  assert.ok(items(nf).every((it) => it.nF === 0));
  assert.ok(nf.totals.net >= full.totals.net, "focus never costs silver");
  const nj = route({ journals: false });
  assert.equal(nj.totals.journals, 0);
  assert.equal(nj.journals.on, false);
  const fee = route({ fee: 400 });
  assert.ok(close(fee.totals.fee, items(fee).reduce((a, it) => a + it.n * S.stationFee(it.id, 400), 0)));
  assert.equal(full.totals.fee, 0);
  const ql = route({ lp: 1000 });
  assert.ok(close(ql.ql.used, 1000));
  assert.ok(ql.fame.saved > 0 && close(ql.fame.target + ql.fame.saved, 25758944));
  assert.ok(ql.fame.earned < full.fame.earned, "less fame to earn");
  const np = route({ premium: false });
  for (const r of full.table) assert.ok(close(r.fame, 1.5 * S.fame(r.id)), `premium: ${r.id}`);
  for (const r of np.table) assert.ok(close(r.fame, S.fame(r.id)), `no premium: ${r.id}`);
  assert.equal(np.fame.target, full.fame.target, "premium earns fame faster; the target stays");
});

test("Royal cities only: the route buys and sells in the five royal cities, and never costs less for it", () => {
  for (const node of [CLAYMORE.id, SWORDS.id]) for (const days of [14, 90]) {
    const at = `${S.short(S.node(node))}, ${days} days`;
    const all = route({ node, days }), p = route({ node, days, royal: true });
    assert.equal(p.royal, true);
    assert.deepEqual(p.cities, cat.ROYAL);
    for (const it of items(p)) {
      for (const x of it.sold) if (x.city) assert.ok(cat.ROYAL.includes(x.city), `${at}: ${it.id} sold in ${x.city}`);
      for (const m of it.op.mats) assert.ok(cat.ROYAL.includes(m.leg.city), `${at}: ${m.leg.id} bought in ${m.leg.city}`);
      if (it.op.journal) assert.ok(cat.ROYAL.includes(it.op.journal.full.leg.city));
    }
    assert.ok(p.totals.net >= all.totals.net - 1e-6, `${at}: fewer markets never make it cheaper`);
    /* the switch changes the route only where it traded outside the ring */
    if (items(all).every((it) => it.sold.every((x) => !x.city || cat.ROYAL.includes(x.city)) && it.op.mats.every((m) => cat.ROYAL.includes(m.leg.city)))) assert.ok(close(p.totals.net, all.totals.net), at);
  }
  assert.ok(items(route()).some((it) => it.sold.some((x) => x.city && !cat.ROYAL.includes(x.city)) || it.op.mats.some((m) => !cat.ROYAL.includes(m.leg.city))), "the usual route does trade outside the ring");
});

test("the safe daily sell limit switched off: a market takes up to a whole day of its sales, and the route never costs more", () => {
  for (const node of [CLAYMORE.id, SWORDS.id]) for (const days of [14, 90]) {
    const at = `${S.short(S.node(node))}, ${days} days`;
    const safe = route({ node, days }), p = route({ node, days, share: 1 });
    assert.equal(p.share, 1);
    assert.equal(safe.share, S.SHARE);
    const sold = new Map();
    for (const it of items(p)) for (const x of it.sold) if (x.city) sold.set(it.id + "|" + x.city, (sold.get(it.id + "|" + x.city) || 0) + x.n);
    let past = 0;
    for (const [k, n] of sold) {
      const [id, city] = k.split("|"), perDay = B.stat(id, city).perDay;
      assert.ok(n <= Math.floor(perDay * p.days), `${at}: ${n} ${id} into ${city}`);
      if (n > Math.floor(S.SHARE * perDay * p.days)) past++;
    }
    assert.ok(past > 0, `${at}: some market takes more than the safe quarter`);
    assert.ok(p.totals.net <= safe.totals.net + 1e-6, `${at}: more room never costs more`);
    assert.ok(p.totals.kept <= safe.totals.kept, `${at}: and leaves no more unsold`);
  }
  /* a share is a share of a day: above 1 is a whole day, and nothing usable falls back to the safe quarter */
  assert.equal(route({ share: 7 }).share, 1);
  for (const share of [0, -1, NaN, "all", undefined]) assert.equal(route({ share }).share, S.SHARE, String(share));
});

test("the same seed draws the same range, and a different one lands close", () => {
  const a = route({ draws: 200, seed: 3 }), b = route({ draws: 200, seed: 3 }), c = route({ draws: 200, seed: 4 });
  assert.deepEqual(a.range, b.range);
  assert.deepEqual(a.curve, b.curve);
  const width = a.range.p90 - a.range.p10;
  assert.ok(width > 0);
  assert.ok(Math.abs(c.range.p50 - a.range.p50) < 0.25 * width, "the middle barely moves with the seed");
});

test("a target at 100 costs nothing; a maxed mastery opens every tier at once; an unknown node is refused", () => {
  const done = route({ levels: { CRAFT_SWORDS: 100, CRAFT_SWORDS_CLAYMORE: 100 }, draws: 20 });
  assert.equal(done.fame.target, 0);
  assert.deepEqual([done.steps.length, done.totals.crafts, done.totals.net], [0, 0, 0]);
  assert.deepEqual([done.range.p10, done.range.p90], [0, 0]);
  const open = route({ levels: { CRAFT_SWORDS: 100 } });
  assert.deepEqual(open.steps.map((s) => s.tier), [8]);
  assert.equal(open.prelude, null);
  assert.deepEqual(open.unlocks, []);
  assert.ok(open.table.length > 0 && open.table.every((r) => !r.locked));
  assert.throws(() => S.plan(B, { ...BASE, node: "CRAFT_NOPE" }), /Unknown crafting node/);
});

test("a line's prices cover everything its routes may craft; artifact specializations are set apart", () => {
  const need = S.needs("CRAFT_SWORDS");
  assert.equal(new Set(need).size, need.length, "no duplicates");
  for (const id of ["T3_MAIN_SWORD", "T8_2H_CLAYMORE@4", "T4_METALBAR", "T8_LEATHER_LEVEL4@4", "T4_ARTEFACT_2H_CLAYMORE_AVALON", "T4_JOURNAL_WARRIOR_EMPTY", "T8_JOURNAL_WARRIOR_FULL"]) assert.ok(need.includes(id), id);
  assert.ok(!need.some((id) => /JOURNAL_(HUNTER|MAGE|TOOLMAKER)/.test(id)), "only the line's own journals");
  for (const s of S.specsOf(SWORDS.id)) for (const id of S.familyIds(s.fam, [4, 5, 6, 7, 8])) {
    assert.ok(need.includes(id), id);
    for (const m of cat.recipe(id).mats) assert.ok(need.includes(m.id), `${id}: ${m.id}`);
  }
  assert.deepEqual(S.needs("CRAFT_NOPE"), []);
  assert.equal(S.special(S.node("CRAFT_SWORDS_AVALON")), true, "Kingmaker takes an artifact");
  assert.equal(S.special(S.node("CRAFT_BAG_INSIGHT")), true, "Satchel of Insight takes a tome");
  assert.equal(S.special(CLAYMORE), false);
  assert.equal(S.special(SWORDS), false, "a mastery is never set apart");
  /* the app's item data has no recipes for tracking toolkits or siege banners, so those nodes can't be planned */
  const none = S.lines().flatMap((L) => [L, ...S.specsOf(L.id)]).filter((n) => !S.craftable(n)).map((n) => n.id);
  assert.deepEqual(none.sort(), ["CRAFT_TOOL_SIEGEHAMMER_SIEGEBANNER", "CRAFT_TOOL_TRACKING", "CRAFT_TOOL_TRACKING_TRACKING"]);
  assert.equal(S.short(CLAYMORE), "Claymore");
  assert.equal(S.short(SWORDS), "Sword Crafter");
  assert.equal(S.lineOf(CLAYMORE.id), SWORDS);
});

test("journals: each craft fills its tier's journal, and the totals count only those their market takes", () => {
  /* The snapshot has no journal sales, so these market models add some: full journals sell in Martlock, 2 a day, for
     6,000 or 60,000 silver at T4 (doubling each tier), and empty ones cost less there than from the NPC. */
  const J = /^T(\d)_JOURNAL_WARRIOR_(FULL|EMPTY)$/;
  const withJournals = (full) => ({
    ...B,
    stat: (id, city) => {
      const m = J.exec(id);
      if (!m) return B.stat(id, city);
      return m[2] === "FULL" && city === "Martlock" ? { pred: full * 2 ** (m[1] - 4), n: 14, perDay: 2 } : { pred: null, n: 0, perDay: 0 };
    },
    listing: (id, city, side) => {
      const m = J.exec(id);
      if (!m) return B.listing(id, city, side);
      return m[2] === "EMPTY" && city === "Martlock" && side === "sell" ? { price: 1500 * 2 ** (m[1] - 4), city, id, side } : null;
    },
  });
  let binds = 0;
  for (const full of [6000, 60000]) {
    const BJ = withJournals(full);
    for (const node of [CLAYMORE.id, SWORDS.id]) for (const days of [14, 30, 90]) {
      const at = `${S.short(S.node(node))}, ${days} days, ${full} silver`;
      const p = route({ node, days }, BJ);
      assert.equal(p.journals.priced, true);
      const byKind = new Map();
      for (const it of items(p)) if (it.journals > 0) {
        const t = cat.parse(it.id).tier;
        byKind.set(t, (byKind.get(t) || 0) + it.journals);
        assert.ok(it.journals <= (it.n * S.fame(it.id)) / S.data.jr.fame[t - 4] + 1e-9, `${at}: ${it.id} fills no more journals than its fame`);
      }
      const cap = S.SHARE * 2 * p.days;
      for (const [t, n] of byKind) {
        assert.ok(n <= cap + 1e-9, `${at}: ${n} T${t} journals counted as sold, more than Martlock's ${cap}`);
        if (close(n, cap, 1e-9)) binds++;
      }
      /* the totals add up, and each journal sold is worth the full one's sale after tax and the listing fee, less the
         empty one */
      const tot = p.totals;
      assert.ok(close(tot.net, tot.buy - tot.back + tot.fee - tot.sale - tot.journals + tot.pre, 1e-9), at);
      let worth = 0;
      for (const [t, n] of byKind) worth += n * (full * 2 ** (t - 4) * (1 - 0.04 - AB.store.setupFee) - 1500 * 2 ** (t - 4));
      assert.ok(close(tot.journals, worth, 1e-9), at);
      /* journals that sell never make a route dearer: the crafts chosen without them are among the routes tried */
      const off = route({ node, days, journals: false }, BJ);
      assert.ok(tot.net <= off.totals.net + 1e-6, `${at}: ${tot.net} with journals, ${off.totals.net} without`);
    }
  }
  assert.ok(binds > 0, "at 2 a day, Martlock's share limits the journals somewhere");
});

test("how sure: the price checks the route rests on, weighted by its silver, with backtests at the neutral 40", () => {
  const p = route({ draws: 50 });
  const c = S.confidence(B, p);
  assert.ok(c.score >= 0 && c.score <= 100);
  assert.equal(c.f.evidence, AB.scan.NO_TEST);
  assert.equal(c.f.odds, null);
  for (const k of ["fresh", "liquidity", "history", "agree"]) assert.ok(c.f[k] == null || (c.f[k] > 0 && c.f[k] <= 1), k);
  assert.equal(c.tier.key, AB.conf.tier(c.score).key);
});
