/* The game clock: each server's daily maintenance, and the island, laborer and focus timers behind the reminders.
   Every function takes the time as an argument, so these run at fixed moments. */
import test from "node:test";
import assert from "node:assert/strict";
import { loadAB } from "./load.mjs";

const { clock } = loadAB();
const at = (s) => Date.parse(s + "Z");
const M = 6e4, H = 36e5, D = 864e5;

test("maintenance: today's while it's ahead, 'down' for its 15 minutes, then tomorrow's; Asia's is at 23:00 UTC", () => {
  assert.deepEqual(clock.nextReset("west", at("2026-10-21T09:30:00")), { at: at("2026-10-21T10:00:00"), back: at("2026-10-21T10:15:00"), down: false });
  assert.deepEqual(clock.nextReset("europe", at("2026-10-21T10:05:00")), { at: at("2026-10-21T10:00:00"), back: at("2026-10-21T10:15:00"), down: true });
  assert.deepEqual(clock.nextReset("west", at("2026-10-21T10:15:00")), { at: at("2026-10-22T10:00:00"), back: at("2026-10-22T10:15:00"), down: false });
  assert.equal(clock.nextReset("east", at("2026-10-21T22:59:00")).at, at("2026-10-21T23:00:00"));
  assert.equal(clock.nextReset("east", at("2026-10-21T23:20:00")).at, at("2026-10-22T23:00:00"));
  assert.equal(clock.nextReset("west", at("2026-12-31T11:00:00")).at, at("2027-01-01T10:00:00"), "across a year end");
  assert.equal(clock.nextReset("mars", at("2026-10-21T09:00:00")).at, at("2026-10-21T10:00:00"), "an unknown server counts as the Americas");
});

test("focus refills by the daily amount from what the player typed, up to 30,000", () => {
  const t0 = at("2026-10-21T00:00:00");
  const t = { focus: 12000, focusAt: t0 };
  assert.equal(clock.focusNow(t, 10000, t0 + 12 * H), 17000);
  assert.equal(clock.focusNow(t, 10000, t0 + 5 * D), 30000);
  assert.equal(clock.focusNow(t, 10000, t0 - H), 12000, "a clock set back doesn't drain it");
  assert.equal(clock.focusAt(t, 10000, t0), t0 + ((30000 - 12000) / 10000) * D);
  assert.equal(clock.focusAt(t, 10000, t0, 0.95), t0 + ((30000 * 0.95 - 12000) / 10000) * D);
  assert.equal(clock.focusAt({ focus: 30000, focusAt: t0 }, 10000, t0 + H), t0 + H, "already full: now");
  assert.equal(clock.focusAt(t, 0, t0), null, "no refill: never full");
  assert.equal(clock.focusNow({ focus: null, focusAt: null }, 10000), null);
  assert.equal(clock.harvestAt({ planted: t0 }), t0 + 22 * H);
  assert.equal(clock.laborersAt({ laborers: null }), null);
});

test("reminders: only the ones asked for and still ahead, soonest first, and a week of maintenance for a phone", () => {
  const now = at("2026-10-21T08:00:00");
  const t = { planted: now - 20 * H, laborers: now - 23 * H, focus: 27000, focusAt: now, remind: { harvest: true, laborers: true, focus: true, reset: true } };
  const r = clock.reminders(t, { server: "west", perDay: 10000, now });
  /* maintenance at 10:00 so its reminder at 9:30; crops at 10:00; focus at 95% (28,500) 3.6 hours on; laborers came back an hour ago */
  assert.deepEqual(r.map((x) => [x.key, x.at]), [["reset0", at("2026-10-21T09:30:00")], ["harvest", now + 2 * H], ["focus", now + 0.15 * D]]);
  assert.ok(r.every((x) => x.title && x.body));
  assert.ok(!clock.reminders({ ...t, focus: 29000 }, { perDay: 10000, now }).some((x) => x.key === "focus"), "nearly full already: no focus reminder");
  assert.deepEqual(clock.reminders({ ...t, remind: {} }, { perDay: 10000, now }), [], "nothing ticked, nothing sent");
  const week = clock.reminders({ remind: { reset: true } }, { server: "east", now, days: 7 });
  assert.equal(week.length, 7);
  assert.equal(week[0].at, at("2026-10-21T22:30:00"));
  assert.ok(week.every((x, i) => i === 0 || x.at - week[i - 1].at === D));
  assert.deepEqual(week.map((x) => x.key), ["reset0", "reset1", "reset2", "reset3", "reset4", "reset5", "reset6"]);
});

test("countdowns and times read the way the page shows them", () => {
  assert.equal(clock.until(0), "now");
  assert.equal(clock.until(-5), "now");
  assert.equal(clock.until(30e3), "under a minute");
  assert.equal(clock.until(45 * M), "45 min");
  assert.equal(clock.until(3 * H + 5 * M), "3 h 05 min");
  assert.equal(clock.until(26 * H), "1 d 2 h");
  assert.equal(clock.utc(at("2026-10-21T23:00:00")), "23:00 UTC");
});
