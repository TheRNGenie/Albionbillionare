/* The data files the app ships with: the saved snapshot, the model built from history, and Albion's item data. These
   are built by tools/v2/*.py; the checks catch a broken or mismatched rebuild before the app does. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadAB } from "./load.mjs";

const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const snap = json("assets/data/v2/snapshot.json");
const ins = json("assets/data/v2/insights.json");
const items = json("assets/data/v2/items.json");
const recipes = json("assets/data/recipes.json");
const names = json("assets/data/names.json");
const AB = loadAB();
const DAY = 864e5;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

test("snapshot: 28 whole days for the eight markets, a price on every day with sales", () => {
  assert.ok(isDate(snap.start) && isDate(snap.end));
  assert.equal(snap.days, (Date.parse(snap.end) - Date.parse(snap.start)) / DAY + 1);
  assert.equal(snap.days, 28);
  assert.deepEqual([...snap.markets].sort(), [...AB.cat.MARKETS].sort(), "the snapshot covers exactly the app's markets");
  const ids = Object.keys(snap.s);
  assert.ok(ids.length > 1500);
  for (const id of ids) for (const [mi, a] of Object.entries(snap.s[id])) {
    assert.ok(snap.markets[+mi], `${id}: market index ${mi}`);
    assert.equal(a.length, 2 * snap.days, `${id}@${mi}: prices then counts`);
    for (let k = 0; k < snap.days; k++) {
      const price = a[k], count = a[snap.days + k];
      assert.ok(Number.isInteger(count) && count >= 0, `${id}@${mi} day ${k} count`);
      assert.ok(price >= 0 && (count === 0 || price > 0), `${id}@${mi} day ${k} price`);
    }
  }
});

test("snapshot covers the scanning universe the model picked", () => {
  const bases = ins.universe.bases;
  assert.ok(bases.length >= 100);
  const covered = bases.filter((b) => snap.s[b]).length;
  assert.ok(covered / bases.length > 0.95, `${covered} of ${bases.length} gear bases have snapshot sales`);
  for (const b of bases) assert.match(b, /^T[4-8]_[A-Z0-9_]+$/, b);
});

test("the model: dates line up, the test months come after the training months", () => {
  assert.ok(isDate(ins.v) && isDate(ins.source.from) && isDate(ins.source.to));
  assert.ok(ins.source.from < ins.priceModel.split && ins.priceModel.split < ins.source.to);
  assert.ok(ins.source.to >= snap.end, "the model was built from history at least as new as the snapshot");
  assert.ok(ins.priceModel.nTrain > 1e5 && ins.priceModel.nTest > 1e5, "hundreds of thousands of cases each side");
  assert.ok(ins.fee > 0 && ins.fee < 0.2);
  const sv = ins.survival;
  assert.equal(sv.bands.length, sv.edges.length);
  for (let i = 1; i < sv.edges.length; i++) assert.ok(sv.edges[i] > sv.edges[i - 1]);
  for (const k of Object.keys(sv.s1)) {
    const [dest, liq, band] = k.split("|");
    assert.ok(["royal", "bm", "caerleon"].includes(dest) && sv.liq.includes(liq) && sv.bands.includes(band), k);
    assert.ok(sv.n[k] > 0, `${k} has cases`);
  }
  const rb = ins.rebound;
  assert.equal(rb.table.length, rb.edges.length + 1);
  for (const row of rb.table) for (const c of row.byLiq) if (c && c.n) {
    assert.ok(c.beatFees >= 0 && c.beatFees <= 1);
    for (let i = 1; i < c.f7q.length; i++) assert.ok(c.f7q[i] >= c.f7q[i - 1], `${row.bucket} rebound quantiles ordered`);
  }
});

test("item data: upgrade costs, item power and recipes are sane", () => {
  for (const [id, counts] of Object.entries(items.up)) {
    assert.equal(counts.length, 3, id);
    assert.ok(counts.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000), `${id}: ${counts}`);
  }
  for (const [id, ip] of Object.entries(items.ip)) assert.ok(Number.isInteger(ip) && ip >= 0 && ip <= 2000, `${id}: ${ip}`);
  /* every refined resource the refining scanner looks for has a recipe and a weight */
  for (const r of AB.cat.RESOURCES) for (let t = 4; t <= 8; t++) {
    const id = `T${t}_${r.refined}`;
    assert.ok(recipes.r[id], `${id} recipe`);
    assert.ok(recipes.w[id] > 0, `${id} weight`);
  }
  for (const [id, rec] of Object.entries(recipes.r).slice(0, 2000)) {
    const [focus, amount, mats] = rec;
    assert.ok(focus >= 0 && amount >= 1 && mats.length >= 1, id);
    for (const [m, n] of mats) assert.ok(typeof m === "string" && n > 0, `${id} needs ${n} ${m}`);
  }
  assert.ok(names.length > 5000 && names.every(([id, n]) => typeof id === "string" && typeof n === "string" && n.length));
});

test("upgrades read from the item data: runes, souls, relics in order", async () => {
  await AB.cat.ready();
  const up1 = AB.cat.upgrade("T6_MAIN_SWORD@1"), up3 = AB.cat.upgrade("T6_MAIN_SWORD@3");
  assert.deepEqual({ from: up1.from, mat: up1.mat }, { from: "T6_MAIN_SWORD", mat: "T6_RUNE" });
  assert.deepEqual({ from: up3.from, mat: up3.mat }, { from: "T6_MAIN_SWORD@2", mat: "T6_RELIC" });
  assert.ok(up1.count > 0);
  assert.equal(AB.cat.upgrade("T6_MAIN_SWORD"), null, ".0 has nothing below it");
  assert.equal(AB.cat.upgrade("T6_LEATHER@1"), null, "resources are refined, not upgraded");
  assert.equal(AB.cat.label("T6_2H_CLAYMORE@1"), "T6.1 Claymore");
});

test("destiny.json: the crafting half of the Destiny Board, with the game's level totals and unlocks", () => {
  const d = json("assets/data/v2/destiny.json");
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  assert.ok(isDate(d.v));
  for (const k of ["base", "spec"]) {
    for (const col of ["fame", "lp", "min"]) assert.equal(d.tpl[k][col].length, 100, `${k}.${col}: one per level`);
    assert.ok(d.tpl[k].fame.every((f) => f > 0) && d.tpl[k].lp.every((x) => x > 0));
  }
  assert.equal(sum(d.tpl.base.fame), 6439736, "a mastery at fame multiplier 1");
  assert.equal(sum(d.tpl.spec.fame), 12879472, "a specialization at fame multiplier 1");
  assert.deepEqual(d.tpl.base.unlock, { 4: 1, 5: 10, 6: 30, 7: 60, 8: 100 });
  assert.equal(d.tpl.base.min[0], 3, "a mastery's first level counts tier-3 crafts");
  assert.ok(d.tpl.base.min.slice(1).every((t) => t === 4) && d.tpl.spec.min.every((t) => t === 4));
  assert.deepEqual(d.jr.silver, [2000, 4000, 8000, 16000, 32000]);
  assert.ok(d.jr.fame.length === 5 && d.jr.fame.every((f, i) => f > 0 && (i === 0 || f > d.jr.fame[i - 1])));
  assert.deepEqual(Object.keys(d.cats).sort(), ["hunter", "mage", "toolmaker", "warrior"]);
  assert.equal(d.lines.length, 39);
  const ids = new Set();
  for (const L of d.lines) {
    assert.ok(d.cats[L.cat], L.id);
    assert.ok(L.specs.length > 0, L.id);
    for (const n of [L, ...L.specs]) {
      assert.match(n.id, /^CRAFT_[A-Z0-9_]+$/);
      assert.ok(!ids.has(n.id), `${n.id} once`);
      ids.add(n.id);
      assert.ok(n.name && n.fm > 0 && n.lpm > 0, n.id);
      assert.ok(n.fc.length > 0 && n.fc.every(([bonus, i]) => bonus > 0 && d.pat[i]?.length > 0), `${n.id}: focus bonuses`);
    }
    for (const s of L.specs) {
      assert.ok(s.fam.every((f) => L.fam.includes(f)), `${s.id}: its items are its line's`);
      assert.ok(d.jr.types.includes(s.j), `${s.id}: journal type`);
    }
  }
  for (const t of [3, 4, 5, 6, 7, 8]) for (const r of ["PLANKS", "METALBAR", "LEATHER", "CLOTH"]) assert.ok(d.res[`T${t}_${r}`]?.[0] > 0, `T${t}_${r} has fame`);
  assert.ok(Object.values(d.ff).every((f) => f >= 1.1 && f <= 1.4), "artifact factors 1.1 to 1.4");
});

