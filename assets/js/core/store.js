/* Albion Billionaire v2 — the player's settings and ledger, kept in this browser (localStorage, every access guarded). */
window.AB = window.AB || {};

AB.store = (() => {
  const NS = "ab2.";
  const year = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
  const DEFAULTS = {
    server: "west",
    premium: true,
    theme: "auto",
    dataMode: "auto",
    autoReload: 60, // seconds between automatic price reloads; 0 = only the reload button (see app.js)
    safeOnly: false,
    goal: 1e9,
    netWorth: 25e6,
    capital: 15e6,
    hours: 2,
    deadline: null, // a year from the first run (see fresh)
    focus: 10000,
    mountKg: 3657,
    refineSpec: { wood: 0, ore: 0, hide: 0, fiber: 0, rock: 0 },
    watch: ["T4_BAG", "T6_MAIN_SWORD", "T5_LEATHER", "T6_2H_CLAYMORE@1", "T7_RELIC", "T5_PLANKS_LEVEL1@1"],
    risk: "balanced",
    alerts: [], // price alerts (see engine/alerts.js)
    timers: { planted: null, laborers: null, focus: null, focusAt: null, remind: { harvest: true, laborers: true, focus: true, reset: false } },
    /* Cost to Max: the target node, days to take, focus and journals on or off, the station's fee per 100 nutrition,
       the learning points to spend and the safe daily sell limit switched off (see engine/spec.js); the daily loop's
       pack mount, the Transport Mammoth and Expand this loop (see engine/loop.js) */
    costMax: { node: "CRAFT_SWORDS_CLAYMORE", days: 90, focus: true, journals: true, fee: 0, lp: 0, noCap: false, mount: "ox8", mammoth: false, expand: false },
    specLevels: {}, // the player's Destiny Board crafting levels, {nodeId: 0-100}
  };
  /* Kept by "Reset settings": they're the player's own lists, not preferences. */
  const KEEP = new Set(["watch", "alerts", "timers", "specLevels"]);
  const read = (k) => { try { const v = localStorage.getItem(NS + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } };
  const write = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  /* What each setting may hold. Values come from this browser's storage and from backup files, which anyone can
     edit, and some are printed into pages, so each one is checked: numbers are clamped into a sane range, choices
     must be one of the options, and anything else (undefined) is refused and keeps the current value. */
  const clampTo = (lo, hi) => (v) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const oneOf = (...xs) => (v) => (xs.includes(v) ? v : undefined);
  const bool = (v) => (typeof v === "boolean" ? v : undefined);
  const fin = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const { isItem } = AB.util;
  const SILVER = clampTo(0, 1e13);
  /* A market name: letters and spaces only, so it can't carry markup into a page or a request. */
  const PLACE = /^[A-Za-z ]{2,30}$/;
  /* A Destiny Board crafting node (CRAFT_SWORDS_CLAYMORE): capitals, digits and underscores only. */
  const NODE = /^CRAFT_[A-Z0-9_]{1,48}$/;
  /* The daily loop's pack mounts (engine/loop.js MOUNTS). */
  const MOUNT = oneOf("ox8", "bear8", "ox7", "ox6", "ox5");
  const level = clampTo(0, 100);
  function cleanAlert(a) {
    if (!obj(a) || !isItem(a.id) || typeof a.city !== "string" || !PLACE.test(a.city) || !["below", "above"].includes(a.kind) || !(fin(a.price) > 0)) return null;
    return {
      id: a.id, city: a.city, kind: a.kind, price: Math.min(a.price, 1e12), t: fin(a.t) ?? 0,
      firedAt: Math.max(0, fin(a.firedAt) ?? 0), last: fin(a.last), seen: fin(a.seen), checked: fin(a.checked), hit: a.hit === true,
    };
  }
  function cleanTimers(v) {
    if (!obj(v)) return undefined;
    const r = obj(v.remind) ? v.remind : DEFAULTS.timers.remind;
    return {
      planted: fin(v.planted), laborers: fin(v.laborers), focus: v.focus == null ? null : clampTo(0, 30000)(v.focus) ?? null, focusAt: fin(v.focusAt),
      remind: Object.fromEntries(Object.keys(DEFAULTS.timers.remind).map((k) => [k, r[k] === true])),
    };
  }
  const CHECK = {
    server: oneOf("west", "europe", "east"),
    premium: bool,
    theme: oneOf("auto", "light", "dark"),
    dataMode: oneOf("auto", "live", "snapshot"),
    autoReload: oneOf(0, 60, 300),
    safeOnly: bool,
    goal: clampTo(1e6, 1e13),
    netWorth: SILVER,
    capital: SILVER,
    hours: clampTo(0.5, 24),
    deadline: (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && isFinite(Date.parse(v + "T00:00:00Z")) ? v : undefined),
    focus: clampTo(0, 1e6),
    mountKg: clampTo(0, 1e5),
    refineSpec: (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(DEFAULTS.refineSpec).map((r) => [r, clampTo(0, 60000)(v[r]) ?? 0])) : undefined),
    watch: (v) => (Array.isArray(v) ? [...new Set(v.filter(isItem))].slice(0, 60) : undefined),
    risk: oneOf("cautious", "balanced", "bold"),
    alerts: (v) => (Array.isArray(v) ? v.map(cleanAlert).filter(Boolean).slice(0, 50) : undefined),
    timers: cleanTimers,
    costMax: (v) => (obj(v) && NODE.test(v.node) ? {
      node: v.node, days: Math.round(clampTo(1, 3650)(v.days) ?? 90), focus: v.focus !== false, journals: v.journals !== false,
      fee: clampTo(0, 1000)(v.fee) ?? 0, lp: Math.round(clampTo(0, 1e6)(v.lp) ?? 0),
      noCap: v.noCap === true, mount: MOUNT(v.mount) ?? "ox8", mammoth: v.mammoth === true, expand: v.expand === true,
    } : undefined),
    specLevels: (v) => (obj(v) ? Object.fromEntries(Object.entries(v).filter(([k, x]) => NODE.test(k) && level(x) !== undefined).slice(0, 400).map(([k, x]) => [k, Math.floor(level(x))])) : undefined),
  };
  const clean = (k, v) => (v == null ? undefined : CHECK[k](v));

  const fresh = (k) => (k === "deadline" ? year() : JSON.parse(JSON.stringify(DEFAULTS[k])));
  const state = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = clean(k, read(k));
    state[k] = v === undefined ? fresh(k) : v;
  }
  if (clean("deadline", read("deadline")) === undefined) write("deadline", state.deadline);
  const ev = AB.util.emitter();

  function get(k) { return state[k]; }
  /* Returns false when the value isn't one the setting can hold (nothing changes then). */
  function set(k, v) {
    if (!(k in CHECK)) return false;
    const c = clean(k, v);
    if (c === undefined) return false;
    if (JSON.stringify(state[k]) === JSON.stringify(c)) return true; // unchanged: no re-score, no reload
    state[k] = c;
    write(k, c);
    ev.emit("change", k, c);
    ev.emit("change:" + k, c);
    return true;
  }
  const on = (e, fn) => ev.on(e, fn);
  /* Every setting back to its default (the deadline to a year from today); the ledger and the lists in KEEP stay. */
  function reset() { for (const k of Object.keys(DEFAULTS)) if (!KEEP.has(k)) set(k, fresh(k)); }
  /* Sales tax: 4% with premium, 8% without; listing (setup) fee 2.5% on every order placed. */
  const tax = () => (state.premium ? 0.04 : 0.08);
  const setupFee = 0.025;

  /* ---------- ledger: net worth check-ins and logged sessions ---------- */
  /* The same care for the ledger: known fields only, numbers finite, text cut to length. */
  const text = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  function cleanLedger(j) {
    const worth = (Array.isArray(j?.worth) ? j.worth : [])
      .map((w) => ({ t: fin(w?.t), v: fin(w?.v) }))
      .filter((w) => w.t != null && w.v != null && w.v >= 0)
      .sort((a, b) => a.t - b.t);
    const trades = (Array.isArray(j?.trades) ? j.trades : []).filter((x) => x && typeof x === "object").map((x) => {
      const p = x.pred && typeof x.pred === "object" ? { p10: fin(x.pred.p10), p50: fin(x.pred.p50), p90: fin(x.pred.p90) } : null;
      return {
        t: fin(x.t) ?? Date.now(), key: text(x.key, 300), title: text(x.title, 200), kind: text(x.kind, 24), item: isItem(x.item) ? x.item : "",
        qty: Math.max(0, fin(x.qty) ?? 0), cost: Math.max(0, fin(x.cost) ?? 0), note: text(x.note, 140),
        pred: p && p.p10 != null && p.p50 != null && p.p90 != null ? p : null, score: fin(x.score), result: fin(x.result),
      };
    });
    return { worth, trades };
  }
  const ledger = cleanLedger(read("ledger"));
  function saveLedger() { write("ledger", ledger); ev.emit("ledger"); }
  /* Returns false for a value or date that can't be a check-in (nothing is saved then). */
  function addWorth(v, t = Date.now()) {
    v = +v;
    if (!(isFinite(v) && v >= 0 && isFinite(t))) return false;
    v = Math.min(v, 1e13);
    ledger.worth.push({ t, v });
    ledger.worth.sort((a, b) => a.t - b.t);
    saveLedger();
    /* a back-dated check-in fills in history; only the newest one is your net worth now */
    if (ledger.worth[ledger.worth.length - 1].t === t) set("netWorth", v);
    return true;
  }
  function addTrade(x) { ledger.trades.unshift({ t: Date.now(), ...x }); saveLedger(); }
  function removeTrade(i) { ledger.trades.splice(i, 1); saveLedger(); }
  function updateTrade(i, patch) {
    if (!ledger.trades[i]) return;
    if ("result" in patch) patch = { ...patch, result: fin(patch.result) };
    Object.assign(ledger.trades[i], patch);
    saveLedger();
  }
  function removeWorth(i) { ledger.worth.splice(i, 1); saveLedger(); }

  function exportAll() {
    const out = { app: "albion-billionaire-v2", at: new Date().toISOString(), settings: { ...state }, ledger };
    return JSON.stringify(out, null, 1);
  }
  /* Restores a backup. Returns how many parts were refused: settings it can't hold keep their current value, and a
     ledger that isn't one leaves yours as it is. */
  function importAll(raw) {
    let j;
    try { j = JSON.parse(raw); } catch (e) { j = null; }
    if (!j || j.app !== "albion-billionaire-v2") throw new Error("That file isn't an Albion Billionaire v2 backup.");
    let refused = 0;
    for (const [k, v] of Object.entries(j.settings && typeof j.settings === "object" ? j.settings : {})) {
      if (k in DEFAULTS && !set(k, v)) refused++;
    }
    if (j.ledger && typeof j.ledger === "object" && !Array.isArray(j.ledger)) {
      const L = cleanLedger(j.ledger);
      ledger.worth = L.worth;
      ledger.trades = L.trades;
      saveLedger();
    } else if (j.ledger != null) refused++;
    return refused;
  }

  return { get, set, on, reset, tax, setupFee, DEFAULTS, ledger, addWorth, addTrade, removeTrade, updateTrade, removeWorth, exportAll, importAll, cleanLedger };
})();
