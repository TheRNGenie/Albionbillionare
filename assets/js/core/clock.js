/* Albion Billionaire v2 — the game clock: each server's daily maintenance, and the player's island, laborer and focus
   timers. Plain functions of the time passed in, so the Alerts page, the reminders and the tests all agree. */
window.AB = window.AB || {};

AB.clock = (() => {
  /* Daily maintenance, from the AlbionZVZ downtime monitor's records for October 2026: the Americas and Europe servers
     go down at about 10:00 UTC and Asia at about 23:00 UTC, and each is usually back within 15 minutes (a few days
     ran to about 25). The server day rolls over then: daily challenges and the daily production bonus reset. */
  const RESET_UTC = { west: 10, europe: 10, east: 23 };
  const DOWN_MIN = 15;
  const SOURCE = { label: "AlbionZVZ downtime monitor", url: "https://www.albionzvz.com/albion-downtime" };
  /* Crops and herbs grow in 22 hours, laborers return in 22, and focus tops out at 30,000 (Albion Online wiki). */
  const CROP_H = 22, LABOR_H = 22, FOCUS_MAX = 30000;
  const M = 6e4, H = 36e5, D = 864e5;

  /* The next maintenance on a server: when it starts, when it's usually over, and whether it's on right now. */
  function nextReset(server, now = Date.now()) {
    const d = new Date(now), win = DOWN_MIN * M;
    let at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESET_UTC[server] ?? RESET_UTC.west);
    if (now >= at && now < at + win) return { at, back: at + win, down: true };
    if (now >= at) at += D; // UTC has no daylight saving, so the next one is exactly a day later
    return { at, back: at + win, down: false };
  }

  /* Focus now: what the player had when they told us, plus the daily refill since, up to the cap. */
  function focusNow(t, perDay, now = Date.now()) {
    if (t?.focus == null || t.focusAt == null) return null;
    return Math.min(FOCUS_MAX, t.focus + (Math.max(0, now - t.focusAt) / D) * Math.max(0, perDay));
  }
  /* When focus reaches `share` of the cap: now if it's there already, null if it doesn't refill. */
  function focusAt(t, perDay, now = Date.now(), share = 1) {
    const f = focusNow(t, perDay, now);
    if (f == null) return null;
    if (f >= FOCUS_MAX * share) return now;
    return perDay > 0 ? now + ((FOCUS_MAX * share - f) / perDay) * D : null;
  }
  const harvestAt = (t) => (t?.planted != null ? t.planted + CROP_H * H : null);
  const laborersAt = (t) => (t?.laborers != null ? t.laborers + LABOR_H * H : null);

  /* The reminders the player asked for that are still ahead, soonest first: [{ key, at, title, body }]. The one before
     maintenance comes for each of the next `days` days, so a phone can hold a week of them with the app closed. */
  function reminders(t, { server = "west", perDay = 0, now = Date.now(), days = 1 } = {}) {
    const out = [], want = t?.remind || {};
    const add = (key, at, title, body) => { if (at != null && at > now) out.push({ key, at, title, body }); };
    if (want.harvest) add("harvest", harvestAt(t), "Crops ready", "Your island is ready to harvest and replant.");
    if (want.laborers) add("laborers", laborersAt(t), "Laborers back", "Collect what they brought and hand in fresh journals.");
    if (want.focus) {
      const f = focusNow(t, perDay, now);
      if (f != null && f < FOCUS_MAX * 0.95) add("focus", focusAt(t, perDay, now, 0.95), "Focus nearly full", "Spend it before it reaches 30,000 and the refill goes to waste.");
    }
    if (want.reset) {
      const first = nextReset(server, now).at;
      for (let i = 0; i < days; i++) add(`reset${i}`, first + i * D - 30 * M, "Server maintenance in 30 minutes", "Don't start a long transport or a dungeon now.");
    }
    return out.sort((a, b) => a.at - b.at);
  }

  /* "3 h 05 min", "45 min", "under a minute", "now". */
  function until(ms) {
    if (!(ms > 0)) return "now";
    if (ms < M) return "under a minute";
    const m = Math.round(ms / M), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d} d ${h} h` : h ? `${h} h ${String(mm).padStart(2, "0")} min` : `${mm} min`;
  }
  /* Times of day: the game's (UTC), and the player's own clock, with the weekday when it isn't today. */
  const utcF = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  const localF = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  const dayF = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const utc = (t) => `${utcF.format(new Date(t))} UTC`;
  function local(t, now = Date.now()) {
    const a = new Date(t), b = new Date(now);
    const today = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    return (today ? "" : dayF.format(a) + " ") + localF.format(a);
  }

  return { RESET_UTC, DOWN_MIN, SOURCE, CROP_H, LABOR_H, FOCUS_MAX, nextReset, focusNow, focusAt, harvestAt, laborersAt, reminders, until, utc, local };
})();
