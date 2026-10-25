/* Cost to Max for refining (engine/refine.js): Albion's refining nodes and the cheapest route to level 100 in a
   refining line, over the saved snapshot. The rules are checked against numbers the game and its wiki show; the route
   against what it promises: each stage refines only the tiers it may, a node's first level unlocks its tier and
   fills from lower tiers as the game fills it, markets take their share, the totals add up, and more time never costs
   more. */
import test from "node:test";
import assert from "node:assert/strict";
import { scanned } from "./load.mjs";

const { AB } = await scanned();
const { spec: S, refine: RF, cat } = AB;
await RF.ready();
/* Hide Tanner is the line the snapshot prices best (T7 aside) */
const HIDE = RF.line("CRAFT_REFINE_HIDE");
const B = await AB.market.extend(RF.needs(HIDE.id));
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const BASE = { node: HIDE.id, levels: {}, premium: true, days: 90, focusPerDay: 10000, fee: 0, lp: 0, seed: 7, draws: 0 };
const route = (o = {}, b = B) => RF.plan(b, { ...BASE, ...o });
const items = (p) => p.steps.flatMap((s) => s.items);
const at = (L, t) => L.nodes[t - 4];
const first = (n) => n.tpl.fame[0] * n.fm;
const rest = (n, from = 1) => S.fameBetween(n, from, 100);

test("the refining board: five lines of five tier nodes, named and laid out as the game has them", () => {
  assert.deepEqual(RF.lines().map((l) => l.name).sort(), ["Fiber Weaver", "Hide Tanner", "Ore Smelter", "Stone Cutter", "Wood Planer"]);
  const ORE = RF.line("CRAFT_REFINE_ORE");
  assert.deepEqual(ORE.nodes.map((n) => n.name), ["Adept Ore Smelter", "Expert Ore Smelter", "Master Ore Smelter", "Grandmaster Ore Smelter", "Elder Ore Smelter"]);
  assert.deepEqual([ORE.city, ORE.refined, ORE.key], ["Thetford", "METALBAR", "ore"], "metal bars, refined best in Thetford");
  assert.equal(RF.line("CRAFT_REFINE_ORE_T6"), ORE, "a node finds its line");
  assert.equal(RF.node("CRAFT_REFINE_ORE_T6").tier, 6);
  assert.equal(RF.node(ORE.id), null, "a line isn't a node");
  assert.equal(RF.line("CRAFT_SWORDS"), null, "crafting nodes aren't refining ones");
  assert.deepEqual(RF.journeyman(), { name: "Journeyman Refiner", fame: 240 });
  /* the wiki's Adept Ore Smelter: 2,900,810 fame from 0 to 100 */
  assert.equal(S.cum(at(ORE, 4))[100], 2900810);
  /* a first level counts any tier and unlocks the node's own; later levels count the node's tier only */
  assert.deepEqual(ORE.nodes.map(first), [3713, 45000, 210000, 860000, 2795000]);
  for (const n of ORE.nodes) {
    assert.deepEqual([n.tpl.min[0], n.tpl.max[0]], [2, 8], n.name);
    assert.ok(n.tpl.min.slice(1).every((t) => t === n.tier) && n.tpl.max.slice(1).every((t) => t === n.tier), n.name);
  }
});

test("fame per refine is its inputs' fame: the wiki's table (with premium) for every tier", () => {
  /* the wiki's premium fame per refine: 33 (T4), 56 (T4.1), 135, 405, 967 and 2,100 (T8) */
  const want = { T4_METALBAR: 22.5, "T4_METALBAR_LEVEL1@1": 37.5, T5_METALBAR: 90, T6_METALBAR: 270, T7_METALBAR: 645, T8_METALBAR: 1395 };
  for (const [id, f] of Object.entries(want)) assert.equal(S.fame(id), f, id);
  assert.equal(Math.round(1.5 * S.fame("T4_METALBAR_LEVEL1@1")), 56);
  assert.equal(Math.round(1.5 * S.fame("T8_METALBAR")), 2093, "the wiki rounds it to 2,100");
  /* a refine's fame isn't the refined resource's own value, which crafting with it uses (45 for a T4.1 bar) */
  assert.equal(S.data.res["T4_METALBAR_LEVEL1@1"][0], 45);
  /* every resource refines the same way */
  for (const L of RF.lines()) assert.equal(S.fame(`T4_${L.refined}`), 22.5, L.name);
});

test("focus efficiency: 0.3 a level from every node, 2.5 more from the refine's own tier", () => {
  const ORE = RF.line("CRAFT_REFINE_ORE");
  const all = Object.fromEntries(ORE.nodes.map((n) => [n.id, 100]));
  assert.equal(RF.efficiency("T6_METALBAR", all), 40000, "five nodes at 100 and its own at 100");
  assert.equal(cat.focusCost(1600, RF.efficiency("T6_METALBAR@2".replace("@2", "_LEVEL2@2"), all)), 100, "a sixteenth of the base focus");
  assert.equal(RF.efficiency("T6_METALBAR", { [at(ORE, 6).id]: 40 }), 100 * 40 * (0.3 + 2.5));
  assert.equal(RF.efficiency("T5_METALBAR", { [at(ORE, 6).id]: 40 }), 100 * 40 * 0.3, "another tier only gets the line's share");
  assert.equal(RF.efficiency("T3_METALBAR", all), 0, "tiers 2 and 3 have no bonus");
  assert.equal(RF.efficiency("T6_PLANKS", all), 0, "another resource has none");
});

test("all five tiers from scratch: Adept's first level from tiers 2 and 3, then each tier's levels; the first levels above come free", () => {
  const p = route();
  assert.deepEqual(p.steps.map((s) => `${s.kind} ${s.tier}`), ["unlock 4", "levels 4", "levels 5", "levels 6", "levels 7", "levels 8"]);
  assert.deepEqual(p.steps[0].tiers, [2, 3]);
  for (const s of p.steps.slice(1)) assert.deepEqual(s.tiers, [s.tier]);
  /* Adept's levels (2.9M fame of T4) fill Expert, Master and Grandmaster's first levels and most of Elder's; Expert's
     finish Elder's, so no other first level needs refines of its own */
  const H = HIDE.nodes;
  assert.ok(rest(H[0]) > first(H[1]) + first(H[2]) + first(H[3]));
  assert.ok(rest(H[0]) + rest(H[1]) > first(H[1]) + first(H[2]) + first(H[3]) + first(H[4]));
  assert.ok(close(p.fame.target, first(H[0]) + sum(H, (n) => rest(n))));
  /* the level axis runs 0 to 500, one step per level */
  assert.equal(p.curve[0].level, 0);
  assert.equal(p.curve.at(-1).level, 500);
  assert.equal(p.curve.length, 501);
  assert.deepEqual(p.marks.map((m) => m.label), ["Expert", "Master", "Grandmaster", "Elder"]);
  assert.ok(p.marks.every((m, i) => i === 0 || m.at > p.marks[i - 1].at));
});

test("one tier: the first levels on the way are unlocked from whatever the player can refine by then", () => {
  const H = HIDE.nodes;
  const p = route({ node: H[4].id });
  assert.deepEqual(p.steps.map((s) => `${s.kind} ${s.tier}`), ["unlock 4", "unlock 5", "unlock 6", "unlock 7", "unlock 8", "levels 8"]);
  assert.deepEqual(p.steps.map((s) => s.tiers.join(",")), ["2,3", "2,3,4", "2,3,4,5", "2,3,4,5,6", "2,3,4,5,6,7", "8"]);
  assert.ok(close(p.fame.target, sum(H, first) + rest(H[4])));
  assert.equal(p.curve.at(-1).level, 100);
  /* an unlocked node needs nothing below it; a locked one opened from above needs nothing below it either */
  assert.deepEqual(route({ node: H[2].id, levels: { [H[2].id]: 30 } }).steps.map((s) => s.kind), ["levels"]);
  const q = route({ node: H[2].id, levels: { [H[3].id]: 5 } });
  assert.deepEqual(q.steps.map((s) => `${s.kind} ${s.tier}`), ["unlock 6", "levels 6"], "Grandmaster at 5 opens Master");
  assert.deepEqual(q.steps[0].tiers, [2, 3, 7], "T4 and T5 are still locked; T7 isn't");
  /* nodes open at once fill at once: with Grandmaster at 5, Elder takes every refine from the start, alongside the
     first levels below it, so Adept's 2.9M fame unlocks it (one at a time, it would be 2.64M of 2.795M) */
  const g = route({ levels: { [H[3].id]: 5 } });
  assert.deepEqual(g.steps.map((x) => `${x.kind} ${x.tier}`), ["unlock 4", "levels 4", "levels 5", "levels 6", "levels 7", "levels 8"]);
  assert.deepEqual(H.map((n) => g.steps[2].levels[n.id] >= 1), [true, true, true, true, true], "Expert's levels start with every node unlocked");
  /* Adept at 100 and Expert locked: maxing all five takes Expert's first level from refines up to T4 */
  const r = route({ levels: { [H[0].id]: 100 } });
  assert.deepEqual(r.steps.slice(0, 2).map((s) => `${s.kind} ${s.tier}`), ["unlock 5", "levels 5"]);
  assert.equal(r.steps[0].fame, 45000);
  assert.deepEqual(r.steps[0].tiers, [2, 3, 4]);
  assert.equal(r.curve[0].level, 100);
  /* Adept at 99: its last level (79,550 fame) unlocks Expert on the way and puts the rest into Master's first, and
     Expert's levels finish Master's, so no stage is spent on a first level */
  assert.ok(S.fameBetween(H[0], 99, 100) > 45000);
  const s = route({ levels: { [H[0].id]: 99 } });
  assert.deepEqual(s.steps.map((x) => `${x.kind} ${x.tier}`), ["levels 4", "levels 5", "levels 6", "levels 7", "levels 8"]);
  assert.ok(close(s.fame.target, rest(H[0], 99) + sum(H.slice(1), (n) => rest(n))));
});

test("a route over the snapshot: stages refine their own tiers, markets take their share, and the totals add up", () => {
  const p = route({ draws: 100 });
  for (const s of p.steps) for (const it of s.items) assert.ok(s.tiers.includes(cat.parse(it.id).tier), `${it.id} in the ${s.kind} ${s.tier} stage`);
  for (const it of items(p)) assert.equal(it.op.city, "Martlock", "hide is refined in Martlock");
  assert.equal(items(p)[0].op.rr0, cat.RETURN.refineBonus.none);
  /* the snapshot has no T7 hide, so Grandmaster's levels go unpriced, and say so */
  const gm = p.steps.find((s) => s.kind === "levels" && s.tier === 7);
  assert.equal(gm.items.length, 0);
  assert.ok(close(gm.short, gm.fame));
  assert.ok(close(p.short, sum(p.steps, (s) => s.short)));
  for (const s of p.steps.filter((x) => x !== gm)) assert.equal(s.short, 0, `${s.kind} ${s.tier}`);
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
  assert.ok(close(t.net, t.buy - t.back + t.fee - t.sale, 1e-9));
  assert.equal(t.journals, 0);
  assert.equal(t.pre, 0);
  for (const s of p.steps) assert.ok(close(s.cost.net, sum(s.items, (it) => it.net), 1e-9), `${s.kind} ${s.tier}`);
  assert.equal(t.crafts, sum(items(p), (it) => it.n));
  /* focus: within each stage's share, on refines the route makes */
  assert.ok(t.focus > 0 && t.focus <= t.focusTotal + 1e-6);
  for (const s of p.steps) assert.ok(s.focusUsed <= s.focusBudget + 1e-6);
  for (const it of items(p)) assert.ok(it.nF <= it.n);
  /* the running cost ends at the total; the range is ordered */
  assert.ok(close(p.curve.at(-1).point, t.net, 1e-9));
  assert.ok(p.range.p10 <= p.range.p50 && p.range.p50 <= p.range.p90);
  for (const c of p.curve) assert.ok(c.p10 <= c.p90 + 1e-6, `level ${c.level}`);
  /* the stages it does price earn their fame, and no more than a refine past it */
  for (const s of p.steps.filter((x) => x.items.length)) {
    const got = sum(s.items, (it) => it.n * it.op.fame), most = Math.max(...s.items.map((it) => it.op.fame));
    assert.ok(got >= s.fame - 1e-6 && got - s.fame < most, `${s.kind} ${s.tier}`);
  }
});

test("more time never costs more, and the settings do what they say", () => {
  const nets = [14, 30, 90, 365].map((d) => route({ days: d }).totals.net);
  for (let i = 1; i < nets.length; i++) assert.ok(nets[i] <= nets[i - 1] + 1e-6, `${nets[i]} after ${nets[i - 1]}`);
  const p = route();
  assert.equal(route({ focusPerDay: 0 }).totals.focus, 0);
  assert.ok(route({ focusPerDay: 0 }).totals.net >= p.totals.net - 1e-6, "focus never makes it dearer");
  assert.ok(route({ fee: 500 }).totals.fee > 0 && route({ fee: 500 }).totals.net > p.totals.net);
  const free = route({ premium: false });
  assert.ok(free.totals.crafts > p.totals.crafts, "without premium's fame, more refines");
  assert.equal(free.tax, 0.08);
  /* Quick Learn: points go to the levels that save most fame per point, over every node being maxed: Grandmaster's
     and Elder's, whose levels after the first are worth the most */
  const q = route({ lp: 3000 });
  assert.ok(q.ql.used > 2999 && q.ql.saved > 0);
  assert.ok(close(q.fame.target + q.ql.saved, p.fame.target));
  const Ls = HIDE.nodes.map((n) => S.ladder(n, 1));
  assert.ok(close(S.quickLearn(Ls, 3000).saved, q.ql.saved));
  assert.deepEqual(Ls.map((L) => L.ql.size > 0), [false, false, false, true, true]);
});

test("Royal cities only and the sell limit switched off do what they say", () => {
  const p = route(), r = route({ royal: true });
  for (const it of items(r)) {
    for (const x of it.sold) if (x.city) assert.ok(cat.ROYAL.includes(x.city), x.city);
    for (const m of it.op.mats) assert.ok(cat.ROYAL.includes(m.leg.city), m.leg.city);
  }
  assert.ok(r.totals.net >= p.totals.net - 1e-6, "never cheaper");
  const open = route({ share: 1 });
  assert.ok(open.totals.net <= p.totals.net + 1e-6, "never dearer");
});

test("a target at 100 costs nothing, a line the model can't price says so, and an unknown one is refused", () => {
  const H = HIDE.nodes;
  const done = route({ node: H[2].id, levels: { [H[2].id]: 100 } });
  assert.equal(done.fame.target, 0);
  assert.equal(done.steps.length, 0);
  assert.equal(done.totals.net, 0);
  const maxed = route({ levels: Object.fromEntries(H.map((n) => [n.id, 100])) });
  assert.equal(maxed.fame.target, 0);
  assert.throws(() => route({ node: "CRAFT_SWORDS" }), /Unknown refining line/);
  /* a market model loaded for another line prices only what it happens to have, and says how much fame that leaves */
  const ore = route({ node: "CRAFT_REFINE_ORE" });
  assert.ok(ore.missing.includes("T2_ORE") && ore.short > 0);
  for (const st of ore.steps.filter((x) => !x.items.length)) assert.ok(close(st.short, st.fame), `${st.kind} ${st.tier}`);
  assert.ok(close(ore.short, sum(ore.steps, (x) => x.short)));
});

test("a line's prices cover every refine and its inputs, and nothing of another resource", async () => {
  const ids = RF.needs(HIDE.id);
  for (const t of [2, 3, 4, 5, 6, 7, 8]) assert.ok(ids.includes(`T${t}_LEATHER`) && ids.includes(`T${t}_HIDE`), `T${t}`);
  assert.ok(ids.includes("T8_LEATHER_LEVEL4@4") && ids.includes("T8_HIDE_LEVEL4@4"));
  assert.ok(ids.every((id) => /_(LEATHER|HIDE)(_LEVEL\d@\d)?$/.test(id)), "hide and leather only");
  assert.deepEqual(RF.needs("CRAFT_SWORDS"), []);
  const ORE = RF.line("CRAFT_REFINE_ORE");
  const Bo = await AB.market.extend(RF.needs(ORE.id));
  const o = RF.plan(Bo, { ...BASE, node: ORE.id });
  assert.ok(o.missing.includes("T3_METALBAR"), "the snapshot has no T3 bars");
  assert.ok(o.steps[0].kind === "unlock" && o.steps[0].items.length === 0 && close(o.steps[0].short, 3713), "so Adept's first level isn't priced");
});

test("the daily loop lays a refining stage out from the resource's bonus city", () => {
  const p = route();
  const k = p.steps.findIndex((s) => s.kind === "levels" && s.tier === 5);
  const R = AB.loop.stage(B, p, k, { mount: AB.loop.MOUNTS[0].kg });
  assert.equal(R.loop.main, "Martlock");
  assert.ok(R.loop.stops.get("Martlock").craft.every((c) => cat.parse(c.id).tier === 5), "it refines the stage's tier");
  assert.ok(close(R.loop.crafts * R.days, sum(p.steps[k].items, (it) => it.n), 1e-9));
  /* Expand adds only refines of the stage's own tier */
  const E = AB.loop.stage(B, p, k, { mount: AB.loop.MOUNTS[0].kg, expand: true });
  for (const a of E.added) assert.equal(cat.parse(a.id).tier, 5, a.id);
});
