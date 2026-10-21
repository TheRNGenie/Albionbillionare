/* The road-to-a-billion simulator: the menu of repeatable plays, one day's plan, the day's profit range and the fan
   of paths. */
import test from "node:test";
import assert from "node:assert/strict";
import { scanned } from "./load.mjs";

const { AB, R } = await scanned();
const { sim, store } = AB;
const mu = sim.menu(R.opps);
const base = { menu: mu, capital: 15e6, other: 10e6, goal: 1e9, days: 365, hours: 2, edge: 0.5, paths: 200, seed: 11 };

test("the menu keeps confident plays that pay, best per hour first", () => {
  assert.ok(mu.length > 10 && mu.length <= 40);
  for (const m of mu) {
    assert.ok(m.o.score >= 35 && m.mean > 0 && m.units >= 1 && m.hours > 0);
    assert.ok(m.pos >= 0 && m.neg <= 0, "average gain and loss per unit keep their signs");
    for (let i = 1; i < m.q.length; i++) assert.ok(m.q[i] >= m.q[i - 1]);
  }
  for (let i = 1; i < mu.length; i++) assert.ok(mu[i - 1].perHour >= mu[i].perHour);
  const safe = sim.menu(R.opps, { safeOnly: true });
  assert.ok(safe.length > 0 && safe.every((m) => m.o.zone !== "red"));
  const strict = sim.menu(R.opps, { minScore: 70 });
  assert.ok(strict.every((m) => m.o.score >= 70));
});

test("later days rank by what you keep after competition and drop plays that stop paying", () => {
  for (const edge of [0.2, 0.5, 1]) {
    const later = sim.laterMenu(mu, edge);
    const kept = (m) => edge * m.pos + m.neg;
    assert.ok(later.every((m) => kept(m) > 0));
    assert.equal(later.length, mu.filter((m) => kept(m) > 0).length);
    for (let i = 1; i < later.length; i++) assert.ok((kept(later[i - 1]) * later[i - 1].units) / later[i - 1].hours >= (kept(later[i]) * later[i].units) / later[i].hours);
  }
  assert.ok(sim.laterMenu(mu, 0.05).length <= sim.laterMenu(mu, 0.5).length, "keeping less of the edge leaves fewer plays");
});

test("a day's plan never spends more capital or time than you have, and says what stopped it", () => {
  for (const [capital, hours] of [[1e5, 2], [5e6, 1], [15e6, 2], [1e8, 6], [1e12, 0.5], [1e12, 1000]]) {
    const d = sim.choose(mu, capital, hours);
    assert.ok(d.capitalUsed <= capital + 1e-6, `capital ${capital}`);
    assert.ok(d.hoursUsed <= hours + 1e-9, `hours ${hours}`);
    for (const p of d.picks) assert.ok(p.units >= 1 && p.units <= p.m.units && p.hours > 0);
    assert.ok(["hours", "capital", "market"].includes(d.stop));
  }
  assert.equal(sim.choose(mu, 1e12, 0.5).stop, "hours", "unlimited silver, half an hour");
  assert.equal(sim.choose(mu, 1e12, 1000).stop, "market", "unlimited silver and time: the plays run out");
  assert.equal(sim.choose(mu, 1e5, 2).stop, "capital", "100k can't fund most batches");
  assert.deepEqual(sim.choose([], 1e6, 2).picks, []);
});

test("a day's plan charges each batch the hours its size takes, and skips a play whose time doesn't fit", () => {
  /* plays made to measure: an hour's work scales with the batch, or is fixed (a haul takes the trip however much you carry) */
  const play = (key, hoursFn, { units = 100, unitCost = 1000, mean = 50 } = {}) => {
    const o = { key, hoursFn };
    return { o, units, unitCost, lock: 1, mean, hours: sim.hoursFor(o, units) };
  };
  const scaled = play("scaled", (q) => 0.25 + q * 0.01);
  /* half the batch affordable: half the batch's hours, not the full batch's 1.25 */
  let d = sim.choose([scaled], 50 * 1000, 8);
  assert.equal(d.picks[0].units, 50);
  assert.ok(Math.abs(d.picks[0].hours - 0.75) < 1e-9 && Math.abs(d.hoursUsed - 0.75) < 1e-9);
  assert.equal(d.stop, "capital");
  /* plenty of silver but an hour to spend: the biggest batch that fits in it */
  d = sim.choose([scaled], 1e9, 1);
  assert.equal(d.picks[0].units, 75);
  assert.ok(d.hoursUsed <= 1 + 1e-9);
  assert.equal(d.stop, "hours");
  /* a fixed three-hour trip doesn't fit in two hours at any size, so the next play gets the time */
  const trip = play("trip", 3), quick = play("quick", 0.5);
  d = sim.choose([trip, quick], 1e9, 2);
  assert.deepEqual(d.picks.map((p) => p.m.o.key), ["quick"]);
  assert.equal(d.stop, "hours");
  /* and the real menu: every pick's hours are its own batch's */
  for (const [capital, hours] of [[5e6, 1], [15e6, 2], [1e8, 6]]) {
    const r = sim.choose(mu, capital, hours);
    for (const p of r.picks) assert.ok(Math.abs(p.hours - sim.hoursFor(p.m.o, p.units)) < 1e-9);
    assert.ok(Math.abs(r.hoursUsed - r.picks.reduce((a, p) => a + p.hours, 0)) < 1e-6);
  }
});

test("a day's profit range: ordered, losses kept in full, only gains shared", () => {
  const picks = sim.choose(mu, 15e6, 2).picks;
  const full = sim.dayRange(picks, 1), half = sim.dayRange(picks, 0.5);
  for (const r of [full, half]) assert.ok(r.p10 <= r.p25 && r.p25 <= r.p50 && r.p50 <= r.p75 && r.p75 <= r.p90);
  /* sharing gains is a monotone map of each outcome, so every quantile maps the same way */
  const share = (x) => (x > 0 ? x * 0.5 : x);
  for (const k of ["p10", "p25", "p50", "p75", "p90"]) assert.ok(Math.abs(half[k] - share(full[k])) < 1e-6, k);
  assert.equal(half.pLoss, full.pLoss);
  assert.ok(full.pLoss >= 0 && full.pLoss <= 1);
});

test("the fan: starts at your net worth, stays ordered, and its odds agree with its arrival days", () => {
  const res = sim.run(base);
  assert.equal(res.fan.length, base.days + 1);
  assert.ok(res.fan[0].every((x) => x === base.capital + base.other));
  for (const day of res.fan) for (let i = 1; i < 5; i++) assert.ok(day[i] >= day[i - 1]);
  assert.ok(res.pGoal >= 0 && res.pGoal <= 1);
  assert.ok(res.pGoalCI[0] <= res.pGoal && res.pGoal <= res.pGoalCI[1]);
  const dt = res.daysTo;
  assert.equal(dt == null, res.pGoal < 0.1, "an arrival date for the luckiest tenth exists exactly when a tenth arrive");
  if (dt) {
    assert.equal(dt.p50 == null, res.pGoal < 0.5);
    assert.equal(dt.p90 == null, res.pGoal < 0.9);
    assert.ok(dt.p50 == null || dt.p10 <= dt.p50);
    assert.ok(dt.p90 == null || dt.p50 <= dt.p90);
  }
  for (const s of res.stops.slice(1)) assert.ok(Math.abs(s.hours + s.capital + s.market - 1) < 1e-9);
  assert.ok(res.first.capitalUsed <= base.capital * 0.85 + 1e-6, "day one keeps 15% of capital back");
});

test("the fan is reproducible and moves the right way with each setting", () => {
  assert.deepEqual(sim.run(base), sim.run(base));
  const p = (over) => sim.run({ ...base, ...over }).pGoal;
  const mid = p({});
  assert.ok(mid > 0.2 && mid < 0.9, `a billion in a year from 25M at 2 h a day: in reach, not certain (got ${mid})`);
  assert.ok(p({ hours: 6 }) > mid, "more hours");
  assert.ok(p({ hours: 0.5 }) < mid, "fewer hours");
  assert.ok(p({ edge: sim.EDGE.bold }) > mid, "keeping more of the edge");
  assert.ok(p({ edge: sim.EDGE.cautious }) < mid, "keeping less of the edge");
  assert.ok(p({ goal: 2e9 }) < mid, "a bigger goal");
  assert.ok(p({ days: 120 }) < mid, "less time");
  const done = sim.run({ ...base, goal: 2e7 });
  assert.equal(done.pGoal, 1, "already past the goal");
  assert.equal(done.daysTo.p10, 0);
});

test("runs share their luck, so the odds grid moves the right way cell to cell", () => {
  /* without common luck, 120-path cells differ by several points of pure noise and the grid zig-zags */
  const caps = [5e6, 15e6, 40e6, 100e6], hrs = [1, 2, 4, 8];
  const g = caps.map((capital) => hrs.map((hours) => sim.run({ ...base, capital, hours, paths: 120 }).pGoal));
  for (let i = 0; i < caps.length; i++) {
    for (let j = 0; j < hrs.length; j++) {
      if (i) assert.ok(g[i][j] >= g[i - 1][j] - 0.03, `more capital at ${hrs[j]} h: ${g[i - 1][j]} -> ${g[i][j]}`);
      if (j) assert.ok(g[i][j] >= g[i][j - 1] - 0.03, `more hours with ${caps[i]}: ${g[i][j - 1]} -> ${g[i][j]}`);
    }
  }
  assert.notDeepEqual(sim.run({ ...base, seed: 12 }), sim.run(base), "a different seed is different luck");
});

test("the deadline: end of that day, at least a week, at most two years, a year if missing or past", () => {
  const now = Date.UTC(2026, 9, 21, 12);
  assert.equal(sim.daysLeft("2026-11-20", now), 30, "whole days to the end of that day");
  assert.equal(new Date(now + sim.daysLeft("2026-11-20", now) * 864e5).toISOString().slice(0, 10), "2026-11-20", "the last day lands on the deadline");
  assert.equal(sim.daysLeft("2026-10-21", now), 7, "a deadline today still simulates a week");
  assert.equal(sim.daysLeft("2026-10-23", now), 7, "a deadline in two days still simulates a week");
  assert.equal(sim.daysLeft("2030-01-01", now), 730);
  assert.equal(sim.daysLeft("2026-10-01", now), 365);
  assert.equal(sim.daysLeft(null, now), 365);
  assert.equal(sim.daysLeft("soon", now), 365);
});

test("Command and Planner share one forecast from the saved settings", () => {
  const a = sim.forecast(R.opps), b = sim.forecast(R.opps);
  assert.equal(a, b, "the second page reuses the first page's run");
  assert.equal(a.worth, Math.max(store.get("netWorth"), store.get("capital")));
  assert.equal(a.other, a.worth - a.capital);
  const strict = sim.forecast(R.opps, { minScore: 70 });
  assert.notEqual(strict, a);
  assert.ok(strict.menu.every((m) => m.o.score >= 70));
});
