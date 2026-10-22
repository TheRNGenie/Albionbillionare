import test from "node:test";
import assert from "node:assert/strict";
import { loadAB } from "./load.mjs";

const { silver, pct, spct, esc, ageText, aged, emitter, isItem } = loadAB().util;

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
  assert.equal(aged(20e3), "just now", "a price the Data Client just captured");
  assert.equal(aged(90e3), "2 min old");
  assert.equal(aged(null), "age unknown");
});

test("esc makes any text safe to put in HTML", () => {
  assert.equal(esc(`<img src=x onerror="go()">&'`), "&lt;img src=x onerror=&quot;go()&quot;&gt;&amp;&#39;");
  assert.equal(esc(null), "");
});

test("events: a listener added during an event waits for the next one, one removed before its turn is skipped", (t) => {
  t.mock.method(console, "error", () => {});
  const ev = emitter();
  const seen = [];
  let offB = null, added = false;
  ev.on("x", () => {
    seen.push("a");
    if (!added) { added = true; ev.on("x", () => seen.push("late")); }
    offB();
  });
  offB = ev.on("x", () => seen.push("b"));
  ev.on("x", () => { throw new Error("a listener that throws doesn't stop the rest"); });
  ev.on("x", (n) => seen.push("c" + n));
  ev.emit("x", 1);
  assert.deepEqual(seen, ["a", "c1"]);
  ev.emit("x", 2);
  assert.deepEqual(seen, ["a", "c1", "a", "c2", "late"]);
  ev.emit("nobody listens");
});

test("isItem takes item ids and nothing else", () => {
  for (const id of ["T4_BAG", "T6_PLANKS@2", "T5_PLANKS_LEVEL1@1", "T8_2H_TOOL_SICKLE_AVALON", "UNIQUE_HIDEOUT"]) assert.ok(isItem(id), id);
  for (const x of ["", "T", "t4_bag", "T4_BAG%", "T4 BAG", '"><img src=x>', "A".repeat(81), null, 42, ["T4_BAG"]]) assert.ok(!isItem(x), String(x));
});
