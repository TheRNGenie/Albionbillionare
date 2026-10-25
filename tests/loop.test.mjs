/* The daily loop (engine/loop.js): a day of a Cost to Max stage as one ride, city by city, sized to a pack mount.
   Checked against what it promises: a day is the stage's share of the route; no market takes more than its share of
   a day and every craft is sold, banked or kept exactly once; each leg carries what the stops send along it and the
   silver adds up stop by stop; the ride follows the royal ring and is the lightest such ride; a mount too small gives
   up weight; Expand adds only crafts that pay, within the markets and 90% of the mount; refining your own happens
   only when it saves more than 5%, and the first day buys ready-made only what the ride refines before its inputs
   are aboard. */
import test from "node:test";
import assert from "node:assert/strict";
import { scanned } from "./load.mjs";

const { AB } = await scanned();
const { spec: S, loop: LP, cat } = AB;
await S.ready();
const B = await AB.market.extend(S.needs("CRAFT_SWORDS"));
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const BASE = { node: "CRAFT_SWORDS_CLAYMORE", levels: {}, premium: true, days: 90, focusPerDay: 10000, journals: true, fee: 0, lp: 0, seed: 7, draws: 0 };
const route = (o = {}, b = B) => S.plan(b, { ...BASE, ...o });
const P = route();
/* a stage's day, as rows the loop may mark up (build notes each row's bench) */
const day = (p, k) => LP.dayOf(p, k).rows.map((r) => ({ ...r }));
const OX = LP.MOUNTS[0].kg, BIG = 1e9;
const W = (id) => cat.weight(id) ?? 0;
const JKG = (id) => S.data.jr.kg[cat.parse(id).tier - 4];
const LISTS = ["craft", "sell", "bank", "buy", "raw", "input", "refine", "ready", "jbuy", "jsell"];
const errands = (s) => sum(LISTS, (k) => s[k].length);
const loops = (p = P, cap = OX) => p.steps.map((s, k) => ({ k, s, rows: day(p, k) })).map((x) => ({ ...x, L: LP.build(B, p, x.rows, cap) }));

/* Each leg's load, rebuilt from what the stops list: everything bought travels to its bench (raw materials and the
   tier below to their refining city first), crafts travel from their bench to their market, journals the same way. */
function rebuild(L) {
  const ord = L.order, n = ord.length, pos = new Map(ord.map((c, i) => [c, i]));
  const kg = ord.map(() => 0);
  const move = (from, to, w) => {
    assert.ok(pos.has(from) && pos.has(to), `${from} and ${to} are stops`);
    if (from === to) return;
    for (let i = pos.get(from); i !== pos.get(to); i = (i + 1) % n) kg[i] += w;
  };
  for (const [city, s] of L.stops) {
    for (const b of s.buy) move(city, b.bench, b.qty * W(b.m));
    for (const b of [...s.raw, ...s.input]) move(city, b.at, b.qty * W(b.m));
    for (const x of s.refine) move(city, x.bench, x.qty * W(x.m));
    for (const b of s.ready) move(city, b.bench, b.qty * W(b.m));
    for (const x of s.sell) move(x.from, city, x.units * W(x.id));
    for (const j of s.jbuy) move(city, j.bench, j.qty * JKG(j.id));
    for (const j of s.jsell) move(j.from, city, j.qty * JKG(j.id));
  }
  return kg;
}

test("a stage's day is the route's days times its share of the fame, each pick's crafts spread evenly over it", () => {
  let total = 0, short = 0, long = 0;
  P.steps.forEach((s, k) => {
    const d = LP.dayOf(P, k);
    assert.ok(close(d.days, (P.days * s.fame) / P.fame.target), `T${s.tier}`);
    total += d.days;
    if (d.days < 1) short++; else long++;
    assert.equal(d.per, d.days < 1 ? 1 : 1 / d.days, "a stage shorter than a day is a single loop of all its crafts");
    const picks = s.picks.filter((q) => q.n > 0);
    assert.equal(d.rows.length, picks.length);
    d.rows.forEach((r, i) => {
      assert.ok(close(r.units, picks[i].n * d.per) && close(r.uF, picks[i].nF * d.per), `T${s.tier}: ${r.op.id}`);
      assert.equal(r.s, picks[i].x.s, "it sells where the route sells it");
    });
  });
  assert.ok(close(total, P.days), "the stages' days add up to the route's");
  assert.ok(short > 0 && long > 0, "this route has stages of both kinds");
});

test("a market takes at most its share of a day; the rest is banked, unsold crafts are kept, and each craft counts once", () => {
  let banked = 0;
  for (const { s, rows, L } of loops()) {
    const at = `T${s.tier}`;
    assert.ok(close(L.crafts, sum(rows, (r) => r.units)), at);
    assert.ok(close(L.sold + L.banked + L.kept, L.crafts, 1e-9), `${at}: sold, banked or kept, once`);
    assert.ok(close(L.kept, sum(rows.filter((r) => !r.s), (r) => r.units)), `${at}: kept are the route's unsold crafts`);
    const into = new Map();
    for (const st of L.stops.values()) for (const x of st.sell) into.set(`${x.id}|${x.market}`, (into.get(`${x.id}|${x.market}`) || 0) + x.units);
    for (const [key, n] of into) {
      const [id, market] = key.split("|");
      assert.ok(n <= P.share * B.stat(id, market).perDay + 1e-9, `${at}: ${n} ${id} into ${market}`);
    }
    /* what the bank holds is what the markets couldn't take that day */
    for (const r of rows.filter((x) => x.s)) {
      const sold = into.get(`${r.op.id}|${r.s.leg.city}`) || 0;
      assert.ok(sold <= r.units + 1e-9 && (close(sold, r.units, 1e-9) || close(sold, r.s.rate, 1e-9)), `${at}: ${r.op.id} sells all it can`);
    }
    banked += L.banked;
    assert.ok(close(L.bankValue, sum([...L.stops.values()].flatMap((st) => st.bank.filter((b) => !b.kept)), (b) => b.units * b.net)), `${at}: the bank's worth`);
  }
  assert.ok(banked > 0, "somewhere a market's share binds and crafts wait in the bank");
});

test("each leg carries what the stops send along it, the stops cover the crafts' materials, and the silver adds up", () => {
  for (const { s, rows, L } of loops()) {
    const at = `T${s.tier}`;
    const n = L.order.length;
    L.legs.forEach((l, i) => assert.deepEqual([l.from, l.to], [L.order[i], L.order[(i + 1) % n]], `${at}: leg ${i + 1}`));
    rebuild(L).forEach((kg, i) => assert.ok(close(kg, L.legs[i].kg, 1e-9), `${at}: ${L.legs[i].from} to ${L.legs[i].to} carries ${L.legs[i].kg}, the stops send ${kg}`));
    assert.equal(L.max.kg, Math.max(0, ...L.legs.map((l) => l.kg)), `${at}: the heaviest leg`);
    /* every material the day's crafts take after returns (more with focus) is bought, refined or bought ready-made */
    const want = new Map(), got = new Map();
    const add = (m, k, q) => m.set(k, (m.get(k) || 0) + q);
    for (const r of rows) for (const m of r.op.mats) add(want, `${m.leg.id}|${r.bench}`, m.ret ? (r.units - r.uF) * m.n * (1 - r.op.rr0) + r.uF * m.n * (1 - r.op.rrF) : r.units * m.n);
    for (const st of L.stops.values()) for (const b of [...st.buy, ...st.refine, ...st.ready]) add(got, `${b.m}|${b.bench}`, b.qty);
    assert.deepEqual([...got.keys()].sort(), [...want.keys()].sort(), at);
    for (const [k, q] of want) assert.ok(close(got.get(k), q, 1e-9), `${at}: ${k}`);
    /* refining takes its recipe's inputs, less what refining returns */
    const RR = cat.RETURN.refineBonus.none;
    for (const [city, st] of L.stops) for (const x of st.refine) {
      const r = cat.recipe(x.m);
      for (const m of r.mats) {
        const q = sum([...L.stops.values()].flatMap((y) => [...y.raw, ...y.input]).filter((b) => b.for === x.m && b.m === m.id && b.at === city), (b) => b.qty);
        assert.ok(close(q, (sum(st.refine.filter((y) => y.m === x.m), (y) => y.qty) * m.n * (m.noReturn ? 1 : 1 - RR)) / r.amount, 1e-9), `${at}: ${m.id} for ${x.m}`);
      }
    }
    /* silver, stop by stop and in total */
    for (const st of L.stops.values()) {
      assert.ok(close(st.spend, sum([...st.buy, ...st.raw, ...st.input, ...st.ready, ...st.jbuy], (b) => b.qty * b.price), 1e-9));
      assert.ok(close(st.earn, sum(st.sell, (x) => x.units * x.net) + sum(st.jsell, (x) => x.qty * x.net), 1e-9));
      assert.ok(close(st.fee, sum(st.craft, (c) => c.units * c.fee) + sum(st.refine, (x) => x.qty * x.fee), 1e-9));
      for (const x of st.sell) assert.ok(close(x.net, x.price * (1 - P.tax - (x.market === cat.BM ? 0 : P.setup)), 1e-9), `${at}: ${x.id} in ${x.market}, after tax${x.market === cat.BM ? "" : " and the listing fee"}`);
    }
    const t = L.tot, all = [...L.stops.values()];
    assert.ok(close(t.spend, sum(all, (x) => x.spend)) && close(t.earn, sum(all, (x) => x.earn)) && close(t.fee, sum(all, (x) => x.fee)), at);
    assert.ok(close(t.keep, t.earn - t.spend - t.fee, 1e-9), at);
  }
});

test("the ride starts at the bench, follows the royal ring one way, and is the lightest ride of its kind", () => {
  /* the royal cities in ring order, one way or the other, from wherever the ride meets the ring */
  const isRing = (cs) => {
    const idx = cs.map((c) => cat.RING.indexOf(c));
    const rot = (a) => { const i = a.indexOf(Math.min(...a)); return a.slice(i).concat(a.slice(0, i)); };
    const up = (a) => a.every((x, i) => i === 0 || x > a[i - 1]);
    return idx.length < 3 || up(rot(idx)) || up(rot(idx.slice().reverse()));
  };
  assert.ok(isRing(["Lymhurst", "Bridgewatch", "Martlock", "Thetford"]) && isRing(["Lymhurst", "Fort Sterling", "Thetford", "Martlock"]));
  assert.ok(!isRing(["Lymhurst", "Martlock", "Bridgewatch", "Thetford"]), "a ride that doubles back isn't one");
  const perms = (xs) => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  let checked = 0;
  for (const { s, rows, L } of loops(P, BIG)) {
    const at = `T${s.tier}`;
    assert.equal(L.order[0], L.main, `${at}: the bench comes first`);
    assert.equal(new Set(L.order).size, L.order.length, `${at}: each city once`);
    assert.ok(isRing(L.order.filter((c) => cat.RING.includes(c))), `${at}: ${L.order.join(" > ")} follows the ring`);
    for (const c of L.order.slice(1)) assert.ok(errands(L.stops.get(c)) > 0, `${at}: ${c} has something to do`);
    assert.deepEqual(L.off.map((x) => x.city), L.order.filter((c) => !cat.ROYAL.includes(c)), `${at}: places off the ring are named`);
    /* every ride from the bench that keeps the ring's order, with the places off it anywhere, is no lighter */
    if (L.order.length > 6) continue;
    for (const rest of perms(L.order.slice(1))) {
      const o = [L.main, ...rest];
      if (!isRing(o.filter((c) => cat.RING.includes(c)))) continue;
      const X = LP.build(B, P, rows.map((r) => ({ ...r })), BIG, o);
      assert.deepEqual(X.order, o);
      assert.ok(L.max.kg <= X.max.kg + 1e-6, `${at}: ${o.join(" > ")} carries ${X.max.kg} at most, lighter than ${L.max.kg}`);
      checked++;
    }
  }
  assert.ok(checked > 10, "rides were compared");
  /* Royal cities only: the route trades in the royal cities, so its loops never leave the ring */
  const R = route({ royal: true });
  for (const { s, L } of loops(R)) {
    assert.deepEqual(L.off, [], `T${s.tier}`);
    for (const c of L.order) assert.ok(cat.ROYAL.includes(c), `T${s.tier}: ${c}`);
    for (const st of L.stops.values()) for (const b of [...st.raw, ...st.input]) assert.ok(cat.ROYAL.includes(b.at) && cat.ROYAL.includes(st.city), "refining inputs too");
  }
});

test("a mount too small gives up the cheapest weight first, and says when the day still doesn't fit", () => {
  const full = loops(P, BIG).filter((x) => x.L.refinables.some((f) => f.refined > 0) && x.L.order.length > 1);
  assert.ok(full.length > 0, "the route refines somewhere");
  let gave = 0;
  for (const { s, k, L } of full) {
    const at = `T${s.tier}`;
    assert.ok(L.fits && !L.moved.length && !L.cut.length, `${at}: a big enough mount refines everything`);
    assert.ok(close(L.saved, L.fullSave) && L.saved > 0);
    const cap = L.max.kg * 0.7, small = LP.build(B, P, day(P, k), cap);
    if (small.moved.length + small.cut.length > 0) gave++;
    else assert.equal(small.fits, false, `${at}: nothing gave, so it says it doesn't fit`);
    assert.ok(small.saved <= L.saved + 1e-6, `${at}: refining less saves less`);
    if (small.fits) assert.ok(small.max.kg <= cap + 1e-6);
    for (const f of small.refinables) assert.ok(f.refined >= 0 && f.refined <= f.qty + 1e-9);
    for (const x of small.moved) assert.ok(x.to !== x.from, "bought at the bench instead");
    /* what isn't refined any more is bought ready-made, so the crafts still have their materials */
    rebuild(small).forEach((kg, i) => assert.ok(close(kg, small.legs[i].kg, 1e-9)));
    const tiny = LP.build(B, P, day(P, k), 1);
    assert.equal(tiny.fits, false, `${at}: one kilo`);
    assert.ok(tiny.max.kg > 1);
  }
  assert.ok(gave > 0, "a smaller mount made the loop buy at the bench or refine less");
});

test("Expand adds only crafts that pay, within what each market still takes and 90% of the mount", () => {
  const cap = LP.MOUNTS.at(-1).kg;
  let grew = 0;
  for (const s of P.steps) {
    const k = P.steps.indexOf(s), rows = day(P, k);
    const E = LP.expand(B, P, k, rows, cap);
    const at = `T${s.tier}`;
    if (E.base.max.kg >= cap * LP.FILL) { assert.deepEqual(E.added, [], `${at}: already near full`); continue; }
    if (!E.added.length) continue;
    grew++;
    const L = E.loop;
    assert.ok(L.max.kg <= cap * LP.FILL + 1e-6, `${at}: ${L.max.kg} of ${cap} kg`);
    assert.ok(L.tot.keep > E.base.tot.keep, `${at}: keeps more`);
    assert.ok(close(L.crafts, E.base.crafts + sum(E.added, (a) => a.units)), at);
    for (const a of E.added) {
      assert.ok(a.units >= 1 && Number.isInteger(a.units) && a.profit > 0, `${at}: ${a.id}`);
      assert.ok(cat.parse(a.id).tier <= s.tier, `${at}: ${a.id} is a craft this stage can make`);
    }
    /* added crafts only take the room the route's crafts leave in a market's day (those may bank beyond it) */
    const route = new Map(), more = new Map();
    for (const r of E.rows.filter((x) => x.s)) (r.added ? more : route).set(r.s, ((r.added ? more : route).get(r.s) || 0) + r.units);
    assert.ok(more.size > 0);
    for (const [leg, n] of more) assert.ok(n <= Math.max(0, leg.rate - (route.get(leg) || 0)) + 1e-9, `${at}: ${n} more into ${leg.leg.city}, room for ${leg.rate - (route.get(leg) || 0)}`);
    assert.ok(L.sold >= E.base.sold + sum(E.added, (a) => a.units) - 1e-9, `${at}: every added craft sells that day`);
    /* the stage page's view: more crafts a day finish the stage sooner; the other mount rides the same crafts */
    const R = LP.stage(B, P, k, { mount: cap, expand: true, other: OX });
    assert.ok(R.expanded && R.daysNow < R.daysBase, at);
    assert.ok(close(R.other.crafts, R.loop.crafts), `${at}: the comparison rides the same day`);
  }
  assert.ok(grew > 0, "Expand added something somewhere");
  /* with a Transport Mammoth every loop fills, as far as the markets and profit allow */
  const k = P.steps.length - 1, M = LP.stage(B, P, k, { mount: OX, mammoth: true });
  assert.equal(M.loop.cap, LP.MAMMOTH.kg);
  assert.equal(LP.MAMMOTH.kg, 25735, "113.86 / 16.18 of the Elder's ox");
  assert.ok(M.expanded && M.loop.max.kg <= LP.MAMMOTH.kg * LP.FILL + 1e-6 && M.loop.tot.keep >= M.base.tot.keep);
  /* a day with nothing to craft has no loop */
  assert.equal(LP.build(B, P, [], OX), null);
});

test("refining your own: worth it only past 5%, its inputs bought where cheapest, the tier below in the refining city when close", () => {
  /* a market where leather's inputs have set prices: hide cheapest in Bridgewatch, T4 leather in Thetford */
  const fake = (prices) => ({
    ...B,
    stat: (id, c) => (prices[id] ? (prices[id][c] != null ? { pred: prices[id][c], n: 14, perDay: 50 } : { pred: null, n: 0, perDay: 0 }) : B.stat(id, c)),
    listing: (id, c, side) => (prices[id] ? null : B.listing(id, c, side)),
  });
  const RR = cat.RETURN.refineBonus.none;
  const near = fake({ T5_HIDE: { Bridgewatch: 300, Martlock: 320 }, T4_LEATHER: { Thetford: 200, Martlock: 205 } });
  const a = LP.refining(near, { m: "T5_LEATHER", price: 2000 }, 0, cat.CITIES);
  assert.equal(a.at, "Martlock", "leather's refining bonus city");
  assert.deepEqual(a.ins.map((i) => [i.id, i.raw, i.city, i.price]), [["T5_HIDE", true, "Bridgewatch", 300], ["T4_LEATHER", false, "Martlock", 205]], "the tier below within 5% in Martlock, so it isn't carried");
  assert.ok(close(a.own, 3 * (1 - RR) * 300 + 1 * (1 - RR) * 205));
  assert.ok(close(a.saving, 2000 - a.own));
  const far = LP.refining(fake({ T5_HIDE: { Bridgewatch: 300 }, T4_LEATHER: { Thetford: 200, Martlock: 230 } }), { m: "T5_LEATHER", price: 2000 }, 400, cat.CITIES);
  assert.deepEqual(far.ins.map((i) => i.city), ["Bridgewatch", "Thetford"], "more than 5% dearer in Martlock: bought where it's cheapest");
  assert.ok(close(far.fee, S.stationFee("T5_LEATHER", 400)) && close(far.own, 3 * (1 - RR) * 300 + (1 - RR) * 200 + far.fee));
  assert.deepEqual(LP.refining(near, { m: "T5_LEATHER", price: 2000 }, 0, cat.ROYAL).ins.map((i) => i.city), ["Bridgewatch", "Martlock"]);
  assert.equal(LP.refining(fake({ T5_HIDE: {} }), { m: "T5_LEATHER", price: 2000 }, 0, cat.CITIES), null, "an input without a price");
  assert.equal(LP.refining(near, { m: "T5_HIDE", price: 300 }, 0, cat.CITIES), null, "a raw material isn't refined");
  assert.equal(LP.refining(near, { m: "T5_2H_CLAYMORE", price: 9000 }, 0, cat.CITIES), null, "nor is a weapon");
  /* in a loop: everything bought as it is would save 5% or less refined (or a heavy leg gave it up) */
  for (const { s, L } of loops(P, BIG)) {
    for (const f of L.refinables) assert.ok(f.saving > LP.REFINE_MIN * f.price, `T${s.tier}: ${f.m} saves ${f.saving} of ${f.price}`);
    for (const st of L.stops.values()) for (const b of st.buy) {
      const r = LP.refining(B, { m: b.m, price: b.price }, P.fee, P.cities);
      assert.ok(!r || r.saving <= LP.REFINE_MIN * b.price + 1e-9, `T${s.tier}: ${b.m} is bought, refining would save ${r?.saving}`);
    }
    for (const st of L.stops.values()) assert.deepEqual(st.ready, [], `T${s.tier}: nothing cut on a big mount`);
  }
});

test("the first day buys ready-made only what the ride refines before its inputs are aboard", () => {
  let tried = 0;
  for (const { s, k, L } of loops(P, BIG)) {
    for (const f of L.refinables.filter((x) => x.refined > 0)) {
      const raw = [...L.stops.values()].flatMap((st) => st.raw.filter((b) => b.for === f.m).map(() => st.city));
      const from = raw.find((c) => c !== f.city && c !== L.main);
      if (!from || f.city === L.main) continue;
      const rest = L.order.filter((c) => c !== L.main && c !== from && c !== f.city);
      const inputsFirst = LP.build(B, P, day(P, k), BIG, [L.main, from, f.city, ...rest]);
      const refineFirst = LP.build(B, P, day(P, k), BIG, [L.main, f.city, from, ...rest]);
      assert.ok(!inputsFirst.dayOne.some((b) => b.m === f.m), `T${s.tier}: ${f.m}'s ${from} inputs come aboard before ${f.city}`);
      const d = refineFirst.dayOne.find((b) => b.m === f.m);
      assert.ok(d, `T${s.tier}: ${f.city} comes before ${from}, so the first day buys ${f.m}`);
      assert.ok(close(d.qty, f.refined) && d.price === f.price, `T${s.tier}: as much as the loop refines, at the ready-made price`);
      tried++;
    }
    /* refining at the bench, which the first day reaches last, never needs it */
    for (const f of L.refinables) if (f.city === L.main) assert.ok(!L.dayOne.some((b) => b.m === f.m));
  }
  assert.ok(tried > 0, "a refined material with inputs from elsewhere");
});

/* A made-up day, to put weight where a test wants it: one item crafted in `bench`, its materials bought where they
   say, sold where `sell` says (a market with room for all of it). Raw ore stands in for a material nothing refines. */
const leg = (id, city, price) => ({ id, city, price });
function madeUp({ bench = "Lymhurst", sell, mats, crafts }) {
  const id = "T4_2H_CLAYMORE";
  const op = { id, city: bench, fame: 100, rr0: 0, rrF: 0, fee: 0, journal: null, mats: mats.map(([m, city, n, price = 10]) => ({ leg: leg(m, city, price), n, ret: false })) };
  return [{ op, s: { leg: leg(id, sell, 1000), bm: false, rate: 1e9 }, units: crafts, uF: 0 }];
}

test("the ride goes round the lighter way, and puts Caerleon where the load is lightest", () => {
  const crafts = 600 / W("T4_2H_CLAYMORE"), ore = 600 / W("T4_ORE") / crafts;
  /* ore bought in Bridgewatch for Lymhurst, crafts sold in Martlock: one way round they share a leg, the other not */
  const rows = madeUp({ sell: "Martlock", mats: [["T4_ORE", "Bridgewatch", ore]], crafts });
  const L = LP.build(B, P, rows.map((r) => ({ ...r })), BIG);
  assert.deepEqual(L.order, ["Lymhurst", "Martlock", "Bridgewatch"]);
  assert.ok(close(L.max.kg, 600, 1e-9));
  const other = LP.build(B, P, rows.map((r) => ({ ...r })), BIG, ["Lymhurst", "Bridgewatch", "Martlock"]);
  assert.ok(close(other.max.kg, 1200, 1e-9), "the other way carries both on the Bridgewatch to Martlock leg");
  /* crafts sold in Caerleon, ore bought in Martlock: Caerleon goes before Martlock, not at the end */
  const C = LP.build(B, P, madeUp({ sell: "Caerleon", mats: [["T4_ORE", "Martlock", ore]], crafts }), BIG);
  assert.deepEqual(C.order, ["Lymhurst", "Caerleon", "Martlock"]);
  assert.ok(close(C.max.kg, 600, 1e-9));
  assert.deepEqual(C.off, [{ city: "Caerleon", why: LP.OFF_RING.Caerleon }]);
  /* the Black Market trades in Caerleon */
  const bm = LP.build(B, P, madeUp({ sell: cat.BM, mats: [["T4_ORE", "Lymhurst", ore]], crafts }), BIG);
  assert.deepEqual(bm.order, ["Lymhurst", "Caerleon"]);
  assert.equal(bm.stops.get("Caerleon").sell[0].market, cat.BM);
  /* everything in one city: nothing to carry */
  const home = LP.build(B, P, madeUp({ sell: "Lymhurst", mats: [["T4_ORE", "Lymhurst", ore]], crafts }), 1);
  assert.deepEqual([home.order, home.max.kg, home.fits], [["Lymhurst"], 0, true]);
});

test("refining your own at the 5% line: 3% saved buys it ready-made, 11% refines it", () => {
  const fake = (hide) => ({
    ...B,
    stat: (id, c) => (id === "T5_HIDE" ? (c === "Bridgewatch" ? { pred: hide, n: 14, perDay: 50 } : { pred: null, n: 0, perDay: 0 }) : id === "T4_LEATHER" ? (c === "Martlock" ? { pred: 200, n: 14, perDay: 50 } : { pred: null, n: 0, perDay: 0 }) : B.stat(id, c)),
    listing: (id, c, side) => (id === "T5_HIDE" || id === "T4_LEATHER" ? null : B.listing(id, c, side)),
  });
  const RR = cat.RETURN.refineBonus.none;
  const rows = () => madeUp({ sell: "Lymhurst", mats: [["T5_LEATHER", "Lymhurst", 10, 1000]], crafts: 5 });
  const own = (hide) => (1 - RR) * (3 * hide + 200);
  assert.ok(own(444) > 965 && own(444) < 975 && own(400) < 890, "3% and 11% under the ready-made 1,000");
  const keep = LP.build(fake(444), P, rows(), BIG);
  assert.deepEqual(keep.refinables, []);
  assert.deepEqual(keep.stops.get("Lymhurst").buy.map((b) => [b.m, b.qty]), [["T5_LEATHER", 50]]);
  const ref = LP.build(fake(400), P, rows(), BIG);
  assert.deepEqual(ref.refinables.map((f) => [f.m, f.qty, f.refined, f.city]), [["T5_LEATHER", 50, 50, "Martlock"]]);
  assert.ok(close(ref.refinables[0].saving, 1000 - own(400), 1e-9));
  assert.equal(ref.order[0], "Lymhurst");
  assert.deepEqual([...ref.order].sort(), ["Bridgewatch", "Lymhurst", "Martlock"], "hide from Bridgewatch, refined in Martlock");
  assert.ok(ref.tot.keep > keep.tot.keep, "refining saved silver");
  assert.ok(close(ref.saved, 50 * (1000 - own(400)), 1e-9));
});
