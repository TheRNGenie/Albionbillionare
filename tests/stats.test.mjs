import test from "node:test";
import assert from "node:assert/strict";
import { loadAB } from "./load.mjs";

const S = loadAB().stats;

test("quantile and median match numpy's linear interpolation", () => {
  assert.equal(S.median([3, 1, 2]), 2);
  assert.equal(S.median([1, 2, 3, 4]), 2.5);
  assert.equal(S.quantile([0, 10], 0.25), 2.5);
  assert.equal(S.median([1, null, NaN, 3]), 2, "missing values are ignored");
  assert.equal(S.median([]), null);
});

test("the seeded generator repeats exactly and stays in [0, 1)", () => {
  const a = S.rng(42), b = S.rng(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(S.rng(1)(), S.rng(2)());
});

test("MAD estimates the standard deviation of normal draws", () => {
  const r = S.rng(7), xs = Array.from({ length: 20000 }, () => S.normal(r));
  assert.ok(Math.abs(S.mean(xs)) < 0.03, `mean ${S.mean(xs)}`);
  assert.ok(Math.abs(S.mad(xs) - 1) < 0.03, `mad ${S.mad(xs)}`);
  assert.ok(Math.abs(S.sd(xs) - 1) < 0.03, `sd ${S.sd(xs)}`);
});

test("Wilson intervals contain the share, stay inside [0, 1] and narrow with more cases", () => {
  const [lo0, hi0] = S.wilson(0, 10), [lo1, hi1] = S.wilson(10, 10);
  assert.equal(lo0, 0);
  assert.ok(hi1 <= 1 && hi1 > 0.99);
  assert.ok(lo1 > 0.6 && hi0 < 0.4);
  const small = S.wilson(30, 100), big = S.wilson(300, 1000);
  assert.ok(small[0] < 0.3 && small[1] > 0.3);
  assert.ok(big[1] - big[0] < small[1] - small[0]);
});

test("fromQuantiles hits every knot, never decreases, and extends past the ends", () => {
  const qs = [0.1, 0.25, 0.5, 0.75, 0.9], zs = [-2, -0.5, 0, 1, 3];
  qs.forEach((q, i) => assert.equal(S.fromQuantiles(qs, zs, q), zs[i]));
  let prev = -Infinity;
  for (let u = 0.001; u < 1; u += 0.001) {
    const v = S.fromQuantiles(qs, zs, u);
    assert.ok(v >= prev - 1e-12, `not monotone at ${u}`);
    prev = v;
  }
  assert.ok(S.fromQuantiles(qs, zs, 0.01) < -2);
  assert.ok(S.fromQuantiles(qs, zs, 0.99) > 3);
});

test("interp clamps at the ends and is linear inside", () => {
  assert.equal(S.interp([0, 10], [0, 100], -5), 0);
  assert.equal(S.interp([0, 10], [0, 100], 15), 100);
  assert.equal(S.interp([0, 10], [0, 100], 2.5), 25);
});
