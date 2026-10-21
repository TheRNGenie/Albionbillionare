import test from "node:test";
import assert from "node:assert/strict";
import { loadAB } from "./load.mjs";

const { silver, pct, spct, esc, ageText } = loadAB().util;

test("silver reads like the game: thousands, k, M and B with sensible precision", () => {
  const cases = [
    [0, "0"], [7.5, "7.5"], [950, "950"], [1234, "1,234"], [12345, "12.3k"], [123456, "123k"],
    [4.56e6, "4.56M"], [12.3e6, "12.3M"], [250e6, "250M"], [1.02e9, "1.02B"], [-2.5e6, "−2.50M"],
  ];
  for (const [v, want] of cases) assert.equal(silver(v), want, `silver(${v})`);
  assert.equal(silver(5000, { sign: true }), "+5,000");
  assert.equal(silver(-5000, { sign: true }), "−5,000");
  for (const bad of [null, undefined, NaN, Infinity]) assert.equal(silver(bad), "—");
});

test("percentages, signed percentages and ages", () => {
  assert.equal(pct(0.1234), "12%");
  assert.equal(pct(0.1234, 1), "12.3%");
  assert.equal(spct(0.05), "+5%");
  assert.equal(spct(-0.05), "−5%");
  assert.equal(spct(0), "0%");
  assert.equal(ageText(30 * 60e3), "30 min");
  assert.equal(ageText(5 * 36e5), "5 h");
  assert.equal(ageText(5 * 864e5), "5 d");
});

test("esc makes any text safe to put in HTML", () => {
  assert.equal(esc(`<img src=x onerror="go()">&'`), "&lt;img src=x onerror=&quot;go()&quot;&gt;&amp;&#39;");
  assert.equal(esc(null), "");
});
