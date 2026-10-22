/* The scan over the saved snapshot: every play the app shows must be internally consistent, sized within its limits,
   ranked as documented and reproducible. */
import test from "node:test";
import assert from "node:assert/strict";
import { scanned } from "./load.mjs";

const { AB, M, R } = await scanned();
const { conf, scan, store } = AB;

const ordered = (q) => q.p10 <= q.p25 && q.p25 <= q.p50 && q.p50 <= q.p75 && q.p75 <= q.p90;
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

test("without the price server the app opens the saved snapshot and says why", () => {
  assert.equal(M.mode, "snapshot");
  assert.equal(M.live, false);
  assert.match(M.why, /snapshot/);
  assert.ok(M.snapshot.items > 1000, "the snapshot covers the scanning universe");
  assert.ok(M.h0 >= 1, "plays are priced at least a day past the snapshot's last day");
});

test("the scan finds plays of every kind the snapshot supports, and no live-only ones", () => {
  assert.ok(R.opps.length > 300, `${R.opps.length} plays`);
  for (const k of scan.ORDER) {
    if (k === "flip") assert.equal(R.byKind.flip.length, 0, "order flips need live order books");
    else assert.ok(R.byKind[k].length > 0, `no ${k} plays`);
  }
  const sum = Object.values(R.byKind).reduce((a, v) => a + v.length, 0);
  assert.equal(sum, R.opps.length);
  for (const [k, list] of Object.entries(R.byKind)) for (const o of list) assert.equal(o.kind, k);
});

test("every play is internally consistent", () => {
  const keys = new Set();
  R.opps.forEach((o, i) => {
    const at = `${o.key}`;
    assert.ok(!keys.has(o.key), `duplicate ${at}`);
    keys.add(o.key);
    assert.ok(scan.KINDS[o.kind], at);
    assert.equal(o.n, i + 1, `numbered in rank order: ${at}`);
    assert.ok(ordered(o.mc) && ordered(o.total), `ordered quantiles: ${at}`);
    for (const v of [o.mc.p10, o.mc.p90, o.mc.mean, o.total.mean, o.point, o.hours, o.unitCost]) assert.ok(Number.isFinite(v), `finite numbers: ${at}`);
    assert.ok(o.mc.mean > 0, `only plays that pay on average are listed: ${at}`);
    assert.ok(o.mc.pWin >= 0 && o.mc.pWin <= 1, at);
    assert.ok(Number.isInteger(o.score) && o.score >= 0 && o.score <= 100, at);
    assert.equal(o.tier.key, conf.tier(o.score).key, at);
    assert.ok(Number.isInteger(o.qty) && o.qty >= 1, at);
    assert.ok(o.hours > 0, at);
    assert.ok(close(o.total.mean, o.qty * o.mc.mean), `total is per-unit times quantity: ${at}`);
    assert.ok(close(o.capital, o.unitCost * o.qty), at);
    assert.ok(close(o.perHour, o.total.mean / o.hours), at);
    assert.ok(close(o.rank, (Math.max(0, o.total.mean) / o.hours) * (o.score / 100) ** 2), `rank formula: ${at}`);
    for (const [k, v] of Object.entries(o.factors)) if (v != null) assert.ok(v >= 0 && v <= 1, `${k} in [0,1]: ${at}`);
    assert.equal(o.factorList.length, Object.values(o.factors).filter((v) => v != null).length);
    assert.ok(o.steps.length >= 2 && o.steps.every((s) => typeof s === "string" && s.length > 10), `has steps: ${at}`);
    assert.ok(["safe", "red", "city", "mists"].includes(o.zone), at);
  });
  for (let i = 1; i < R.opps.length; i++) assert.ok(R.opps[i - 1].rank >= R.opps[i].rank, "sorted by rank");
});

test("batch sizes respect every limit, including 35% of capital per play", () => {
  const capital = store.get("capital");
  for (const o of R.opps) {
    const caps = Object.entries(o.caps).filter(([, v]) => v != null && Number.isFinite(v));
    for (const [k, v] of caps) assert.ok(o.qty <= Math.max(1, v), `${o.key}: qty ${o.qty} over the ${k} limit ${v}`);
    assert.ok(o.capital <= Math.max(o.unitCost, 0.35 * capital) + 1e-6, `${o.key} ties up ${o.capital}`);
    assert.ok(o.caps[o.limit] != null, `${o.key}: the named limit exists`);
  }
});

test("spike alerts and the Black Market pulse follow their filters", () => {
  for (const a of R.alerts) {
    assert.ok(a.dev >= 0.25 && a.dev <= Math.log(3) + 1e-12, `${a.id} ${a.city} dev ${a.dev}`);
    assert.ok(a.v14 >= 10 && a.typical >= 500);
  }
  assert.ok(R.alerts.length <= 40);
  const p = R.pulse;
  assert.ok(Number.isFinite(p.now) && p.q25 <= p.now && p.now <= p.q75 && p.n > 50);
});

test("the same market gives the same plays, numbers and order", () => {
  const again = scan.run(M);
  assert.equal(again.opps.length, R.opps.length);
  again.opps.forEach((o, i) => {
    const a = R.opps[i];
    assert.equal(o.key, a.key);
    assert.equal(o.score, a.score);
    assert.deepEqual(o.mc, a.mc);
  });
});

test("the outcome histogram draws agree with the play's range", () => {
  for (const o of R.opps.slice(0, 25)) {
    const xs = scan.samples(o, 2000).sort((a, b) => a - b);
    assert.ok(xs.length > 1900 && xs.every(Number.isFinite), o.key);
    const med = xs[Math.floor(xs.length / 2)];
    assert.ok(med >= o.total.p10 && med <= o.total.p90, `${o.key}: median ${med} outside ${o.total.p10}..${o.total.p90}`);
  }
});

test("settings flow through: less capital means smaller batches, no premium means lower profit", async (t) => {
  const keep = { capital: store.get("capital"), premium: store.get("premium") };
  t.after(() => { store.set("capital", keep.capital); store.set("premium", keep.premium); });

  store.set("capital", 2e6);
  const poor = scan.run(M);
  for (const o of poor.opps) assert.ok(o.capital <= Math.max(o.unitCost, 0.35 * 2e6) + 1e-6, o.key);
  assert.ok(poor.opps.filter((o) => o.limit === "capital").length > R.opps.filter((o) => o.limit === "capital").length);
  store.set("capital", keep.capital);

  store.set("premium", false);
  const noPrem = scan.run(M);
  const base = new Map(R.opps.map((o) => [o.key, o]));
  let compared = 0;
  for (const o of noPrem.opps) {
    const a = base.get(o.key);
    if (!a) continue;
    compared++;
    /* each play draws from the same seeded stream, so every outcome is lower by the extra tax */
    assert.ok(o.mc.mean < a.mc.mean, `${o.key}: ${o.mc.mean} vs ${a.mc.mean}`);
  }
  assert.ok(compared > 100);
  assert.ok(noPrem.opps.length < R.opps.length, "8% tax leaves fewer plays than 4%");
});
