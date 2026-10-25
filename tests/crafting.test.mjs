/* Crafting (engine/crafting.js): a day of crafting for profit in one line, v1's Crafting tab on v2's prices, over the
   saved snapshot. The day is checked against what it promises: no market takes more than its share, the budget, the
   focus and the eight-item limit hold, every craft clears the margin, and the totals add up. Then Show me the money
   (the single item whose day earns the most), the four weeks, the price sheet's limits and the daily loop. */
import test from "node:test";
import assert from "node:assert/strict";
import { scanned } from "./load.mjs";

const { AB } = await scanned();
const { spec: S, crafting: C, cat } = AB;
await S.ready();
const LINE = "CRAFT_SWORDS";
const B = await AB.market.extend(S.needs(LINE));
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const BASE = { line: LINE, top: 8, budget: 5e6, focusPerDay: 10000, levels: {}, premium: true, fee: 0, share: S.SHARE, royal: false, seed: 7, draws: 0 };
const plan = (o = {}, b = B) => C.plan(b, { ...BASE, ...o });
const DAYS = [{}, { budget: 1e6 }, { budget: 20e6 }, { budget: 1e12 }, { focusPerDay: 0 }, { focusPerDay: 30000, levels: { CRAFT_SWORDS: 100, CRAFT_SWORDS_CLAYMORE: 100 } }, { premium: false, focusPerDay: 0 }, { royal: true }, { share: 1 }, { top: 5 }, { fee: 400 }, { items: ["CRAFT_SWORDS_CLAYMORE"] }];

test("the lines: every crafting line with something to craft, its items, and the tier a mastery level opens", () => {
  const lines = C.lines();
  assert.ok(lines.length >= 30, `${lines.length} lines`);
  assert.ok(lines.every((l) => l.kind === "base" && C.itemsOf(l.id).length > 0), "a line is a mastery node with items");
  assert.ok(lines.some((l) => l.id === LINE));
  const items = C.itemsOf(LINE).map((n) => S.short(n));
  for (const name of ["Claymore", "Dual Swords", "Sword"]) assert.ok(items.includes(name), name);
  assert.equal(C.lineOf("CRAFT_SWORDS_CLAYMORE").id, LINE, "an item finds its line");
  assert.equal(C.lineOf(LINE).id, LINE);
  for (const id of ["CRAFT_NOT_A_NODE", "", null]) assert.equal(C.lineOf(id), null, String(id));
  assert.throws(() => C.plan(B, { ...BASE, line: "CRAFT_NOT_A_NODE" }), /Unknown crafting line/);
  assert.throws(() => C.rank(B, { ...BASE, line: "CRAFT_NOT_A_NODE" }), /Unknown crafting line/);
  /* the mastery opens T4 at 1, T5 at 10, T6 at 30, T7 at 60 and T8 at 100 */
  assert.deepEqual([0, 1, 9, 10, 29, 30, 59, 60, 99, 100].map(C.unlocked), [0, 4, 4, 5, 5, 6, 6, 7, 7, 8]);
});

test("a day keeps to its limits: each market's share, the budget, the focus, the margin and eight items", () => {
  for (const o of DAYS) {
    const at = JSON.stringify(o), p = plan(o);
    assert.ok(p.rows.length > 0, `${at}: something pays`);
    /* a market takes at most its share of a day, focus crafts and others together */
    const per = new Map();
    for (const r of p.rows) { const k = `${r.op.id}|${r.s.leg.city}`; per.set(k, (per.get(k) || 0) + r.units); }
    for (const r of p.rows) assert.ok(per.get(`${r.op.id}|${r.s.leg.city}`) <= Math.floor(r.s.rate + 1e-9), `${at}: ${r.op.id} in ${r.s.leg.city}`);
    for (const r of p.rows) assert.ok(Number.isInteger(r.units) && r.units >= 1, `${at}: whole crafts`);
    /* the budget and the focus */
    assert.ok(close(p.spent, sum(p.rows, (r) => r.units * r.cost), 1e-9), `${at}: spent`);
    assert.ok(p.spent <= p.budget + 1e-6, `${at}: ${p.spent} of ${p.budget}`);
    assert.ok(close(p.focusUsed, sum(p.rows.filter((r) => r.focus), (r) => r.units * r.fc), 1e-9), `${at}: focus used`);
    assert.ok(p.focusUsed <= p.focusTotal + 1e-6, `${at}: focus`);
    if (!p.focusTotal) assert.ok(p.rows.every((r) => !r.focus), `${at}: no focus, no focus crafts`);
    /* every craft clears the margin, and at most eight items a day */
    for (const r of p.rows) assert.ok(r.each > 0 && r.each / r.s.leg.price >= C.MIN_MARGIN - 1e-12, `${at}: ${r.op.id} margin`);
    assert.ok(new Set(p.rows.map((r) => r.op.id)).size <= C.MAX_ITEMS, `${at}: items`);
    /* the settings: the highest tier, Royal cities only, the item asked for */
    assert.ok(p.rows.every((r) => r.op.tier <= p.top), `${at}: tiers`);
    if (o.royal) for (const r of p.rows) {
      assert.ok(cat.ROYAL.includes(r.s.leg.city), `${at}: sells in ${r.s.leg.city}`);
      assert.ok(r.op.mats.every((m) => cat.ROYAL.includes(m.leg.city)), `${at}: buys in the royal cities`);
    }
    if (o.items) assert.ok(p.rows.every((r) => S.familyIds(S.node(o.items[0]).fam, C.TIERS).includes(r.op.id)), `${at}: only that item`);
  }
  /* no budget, nothing to plan; a bigger budget than the markets take leaves silver unspent */
  const none = plan({ budget: 0 });
  assert.deepEqual([none.rows.length, none.profit, none.range], [0, 0, null]);
  const huge = plan({ budget: 1e12 });
  assert.ok(huge.spent < 1e12 / 1000, "the markets fill up before a huge budget");
  /* a market taking a whole day sells more than one taking a quarter */
  assert.ok(plan({ share: 1, budget: 1e12 }).crafts > huge.crafts);
});

test("the totals add up: profit, crafts, focus crafts, fame and where it all sells", () => {
  for (const o of DAYS) {
    const at = JSON.stringify(o), p = plan(o);
    assert.ok(close(p.profit, sum(p.rows, (r) => r.units * r.each), 1e-9), `${at}: profit`);
    assert.equal(p.crafts, sum(p.rows, (r) => r.units), at);
    assert.equal(p.focusCrafts, sum(p.rows.filter((r) => r.focus), (r) => r.units), at);
    assert.ok(close(p.fame, sum(p.rows, (r) => r.units * r.op.fame), 1e-9), `${at}: fame`);
    /* the day by item: its crafts, focus crafts, where they sell and their silver */
    assert.equal(sum(p.dayItems, (it) => it.n), p.crafts, at);
    assert.equal(sum(p.dayItems, (it) => it.nF), p.focusCrafts, at);
    assert.ok(close(sum(p.dayItems, (it) => it.profit), p.profit, 1e-9), `${at}: item profits`);
    for (const it of p.dayItems) assert.equal(sum(it.sold, (x) => x.n), it.n, `${at}: ${it.id} sold`);
    assert.deepEqual(p.steps[0].items.map((it) => it.id), p.dayItems.map((it) => it.id), "one stage, for the loop and the score");
    /* profit each is the sale after fees less the materials (after returns) and the station fee */
    for (const r of p.rows) {
      const pr = (leg) => leg.price, back = r.focus ? r.op.rrF : r.op.rr0;
      const cost = S.matCost(r.op, pr, true) * (1 - back) + S.matCost(r.op, pr, false) + r.op.fee;
      assert.ok(close(r.each, S.saleNet(r.s, pr, p.tax, p.setup) - cost, 1e-9), `${at}: ${r.op.id}`);
      assert.ok(close(r.cost, cost, 1e-9), `${at}: ${r.op.id} cost`);
    }
  }
  /* premium halves the sales tax; a station fee costs silver */
  assert.deepEqual([plan().tax, plan({ premium: false }).tax], [0.04, 0.08]);
  assert.ok(plan({ fee: 400 }).profit < plan().profit);
});

test("focus never earns less than the same day without it, and cheaper focus at higher levels earns more", () => {
  const all = (lv) => Object.fromEntries([LINE, ...C.itemsOf(LINE).map((n) => n.id)].map((id) => [id, lv]));
  for (const budget of [1e6, 5e6, 20e6]) {
    const none = plan({ budget, focusPerDay: 0 });
    let prev = null;
    for (const lv of [0, 50, 100]) {
      const p = plan({ budget, focusPerDay: 10000, levels: all(lv) });
      assert.ok(p.profit >= none.profit - 1e-6, `${budget}, level ${lv}: focus ${p.profit} vs none ${none.profit}`);
      if (prev) assert.ok(p.profit >= prev.profit - 1e-6 && p.focusCrafts >= prev.focusCrafts, `${budget}, level ${lv}: cheaper focus`);
      prev = p;
    }
  }
  /* the focus goes to the crafts it adds the most silver a point to: no focus craft left out adds more per point */
  const p = plan({ budget: 20e6, levels: all(100) });
  const per = (r) => (r.each - Math.max(0, S.saleNet(r.s, (leg) => leg.price, p.tax, p.setup) - S.baseCost(r.op, (leg) => leg.price))) / r.fc;
  const used = p.rows.filter((r) => r.focus);
  assert.ok(used.length > 0 && p.focusTotal - p.focusUsed < Math.max(...used.map((r) => r.fc)), "the focus is spent");
  for (let i = 1; i < used.length; i++) assert.ok(per(used[i - 1]) >= per(used[i]) - 1e-9, "best silver a point first");
});

test("weekPrice: each week's sales, weighted by volume, and nothing for a week without sales", () => {
  const asOf = Date.UTC(2026, 9, 17), D = 864e5;
  const pts = [
    { t: asOf, price: 100, count: 1 }, { t: asOf - 6 * D, price: 200, count: 3 }, { t: asOf - 3 * D, price: 999, count: 0 },
    { t: asOf - 7 * D, price: 50, count: 2 }, { t: asOf - 13 * D, price: 80, count: 2 },
    { t: asOf - 27 * D, price: 10, count: 1 }, { t: asOf - 28 * D, price: 1e6, count: 9 },
  ];
  const fake = { asOf, series: () => pts };
  const leg = { id: "T4_BAG", city: "Lymhurst" };
  assert.equal(C.weekPrice(fake, leg, 0), (100 + 600) / 4, "the last 7 days; a day without sales doesn't count");
  assert.equal(C.weekPrice(fake, leg, 1), (100 + 160) / 4, "8 to 14 days ago");
  assert.equal(C.weekPrice(fake, leg, 2), null, "no sales that week");
  assert.equal(C.weekPrice(fake, leg, 3), 10, "the fourth week ends 28 days back");
  /* the plan prices its crafts at each of the four weeks */
  const p = plan();
  assert.deepEqual(p.weeks.map((w) => w.w), [0, 1, 2, 3]);
  for (const w of p.weeks) assert.ok(w.own >= 0 && w.own <= 1 && Number.isFinite(w.profit));
  /* with no sales history at all, every week is priced at today's prices */
  const bare = Object.create(B);
  bare.series = () => [];
  const q = plan({}, bare);
  assert.ok(q.weeks.every((w) => close(w.profit, q.profit, 1e-9) && w.own === 0));
  assert.ok(q.ranked.every((x) => x.weeksSeen === 0 && x.weeksUp === 0));
});

test("the range: ordered, around the typical day, the same for the same seed, and none without draws", () => {
  const p = plan({ draws: 400 }), again = plan({ draws: 400 });
  assert.equal(p.draws, 400);
  assert.ok(p.range.p10 <= p.range.p50 && p.range.p50 <= p.range.p90);
  assert.ok(p.range.p10 < p.profit && p.profit < p.range.p90, "the typical day sits inside its range");
  assert.deepEqual(again.range, p.range, "repeatable");
  assert.notDeepEqual(plan({ draws: 400, seed: 8 }).range, p.range, "another seed, other draws");
  assert.equal(plan({ draws: 0 }).range, null);
  const c = S.confidence(B, p);
  assert.ok(c.score >= 0 && c.score <= 100 && c.f.liquidity > 0, "the app's confidence score reads the day");
});

test("Show me the money picks the single item whose own day earns the most; the best mix is the top four that pay", () => {
  const ranked = C.rank(B, BASE);
  assert.deepEqual(ranked.map((r) => r.id).sort(), C.itemsOf(LINE).map((n) => n.id).sort(), "every item, once");
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].profit >= ranked[i].profit, "best day first");
  for (const r of ranked) {
    assert.ok(close(r.profit, plan({ items: [r.id] }).profit, 1e-12), `${r.name}: its own day`);
    assert.equal(r.name, S.short(r.node));
  }
  const best = C.money(ranked);
  assert.ok(best && best.profit > 0);
  assert.equal(best.id, ranked[0].id);
  assert.ok(ranked.every((r) => r.profit <= best.profit), "no single item earns more");
  assert.ok(ranked.some((r) => !r.options), "the snapshot can't price the artifact swords");
  assert.ok(ranked.filter((r) => !r.options).every((r) => r.profit === 0));
  /* the mix: the top four that pay, in order */
  const mix = C.mixOf(ranked);
  assert.deepEqual(mix, ranked.filter((r) => r.profit > 0).slice(0, C.MIX).map((r) => r.id));
  const m = plan({ items: mix });
  assert.ok(m.profit >= best.profit - 1e-6, "the mix earns at least its best item");
  assert.ok(m.rows.every((r) => mix.some((id) => S.familyIds(S.node(id).fam, C.TIERS).includes(r.op.id))), "the mix crafts only its items");
  /* nothing pays: no money to show, and no mix */
  const poor = [{ id: "A", profit: 0 }, { id: "B", profit: -5 }];
  assert.equal(C.money(poor), null);
  assert.deepEqual(C.mixOf(poor), []);
  assert.equal(C.money([]), null);
  const many = Array.from({ length: 7 }, (_, i) => ({ id: "I" + i, profit: 7 - i }));
  assert.deepEqual(C.mixOf(many), ["I0", "I1", "I2", "I3"]);
});

test("the ranked crafts and the price sheet: every limit is where the craft stops paying", () => {
  const p = plan({ budget: 20e6 });
  for (let i = 1; i < p.ranked.length; i++) assert.ok(p.ranked[i - 1].pot >= p.ranked[i].pot);
  assert.equal(new Set(p.ranked.map((x) => x.id)).size, p.ranked.length, "each craft once, in its best market");
  for (const x of p.ranked) assert.ok(x.weeksUp <= x.weeksSeen && x.weeksSeen <= C.WEEKS && x.cap >= 1);
  /* sells: at break-even the sale after fees pays exactly for the materials */
  for (const x of p.sheet.sells) {
    const r = p.rows.find((y) => y.op.id === x.id && y.s.leg.city === x.city);
    assert.ok(r, `${x.id} in ${x.city} is in the day`);
    const cost0 = S.baseCost(r.op, (leg) => leg.price);
    assert.ok(close(S.saleNet(r.s, () => x.even, p.tax, p.setup), cost0, 1e-9), `${x.id}: break-even`);
    if (x.evenF != null) assert.ok(x.evenF < x.even, "focus brings more back, so it breaks even lower");
    if (x.weeks) assert.ok(x.weeks.lo <= x.weeks.hi);
  }
  assert.equal(new Set(p.sheet.sells.map((x) => x.id + x.city)).size, p.sheet.sells.length, "each sale once");
  /* buys: at the max, the cheapest craft that uses the material stops paying without focus; the amount is the day's */
  for (const g of p.sheet.buys) {
    const uses = p.rows.filter((r) => r.op.mats.some((m) => m.leg.id === g.id && m.leg.city === g.city));
    assert.ok(uses.length, `${g.id} is used`);
    const at = (r) => S.saleNet(r.s, (leg) => leg.price, p.tax, p.setup) - S.baseCost(r.op, (leg) => (leg.id === g.id && leg.city === g.city ? g.max : leg.price));
    assert.ok(Math.min(...uses.map(at)) > -1e-6 && uses.some((r) => Math.abs(at(r)) < 1e-6), `${g.id}: max ${g.max}`);
    const qty = sum(uses, (r) => r.units * sum(r.op.mats.filter((m) => m.leg.id === g.id && m.leg.city === g.city), (m) => m.n * (m.ret ? 1 - (r.focus ? r.op.rrF : r.op.rr0) : 1)));
    assert.ok(close(g.qty, qty, 1e-9), `${g.id}: ${g.qty} a day`);
  }
});

test("the daily loop: the day as one ride, Expand adds to it, and an empty day has none", () => {
  const LP = AB.loop, p = plan();
  const R = C.loop(B, p, { mount: LP.MOUNTS[0].kg, other: LP.MOUNTS[1].kg });
  assert.ok(R && !R.expanded && R.days === 1);
  assert.ok(close(R.loop.crafts, p.crafts, 1e-9), "the ride makes the day's crafts");
  assert.equal(R.loop.cap, LP.MOUNTS[0].kg);
  assert.ok(R.other && R.other.cap === LP.MOUNTS[1].kg, "and compares the other mount");
  assert.ok(close(R.loop.tot.keep + R.loop.bankValue, p.profit, 0.02) || R.loop.refinables.length || R.loop.moved.length, "the loop keeps the day's silver, give or take refining and the bank");
  /* Expand: more crafts that pay, up to 90% of the mount; the Mammoth fills a bigger one */
  const small = C.loop(B, plan({ budget: 1e6 }), { mount: LP.MOUNTS[0].kg, expand: true });
  assert.ok(small.expanded && small.loop.crafts >= small.base.crafts);
  assert.ok(small.loop.max.kg <= LP.MOUNTS[0].kg * LP.FILL + 1e-6 || small.base.max.kg >= LP.MOUNTS[0].kg * LP.FILL);
  assert.ok(small.added.every((x) => x.units > 0));
  const mam = C.loop(B, plan({ budget: 1e6 }), { mammoth: true });
  assert.equal(mam.loop.cap, LP.MAMMOTH.kg);
  assert.ok(mam.loop.crafts >= small.loop.crafts, "the Mammoth carries at least as much");
  assert.equal(C.loop(B, plan({ budget: 0 }), { mount: LP.MOUNTS[0].kg }), null);
});
