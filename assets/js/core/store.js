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
  };
  const read = (k) => { try { const v = localStorage.getItem(NS + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } };
  const write = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  const fresh = (k) => (k === "deadline" ? year() : JSON.parse(JSON.stringify(DEFAULTS[k])));
  const state = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = read(k);
    state[k] = v === undefined || v === null ? fresh(k) : v;
  }
  if (read("deadline") == null) write("deadline", state.deadline);
  const ev = AB.util.emitter();

  function get(k) { return state[k]; }
  function set(k, v) {
    if (JSON.stringify(state[k]) === JSON.stringify(v)) return; // unchanged: no re-score, no reload
    state[k] = v;
    write(k, v);
    ev.emit("change", k, v);
    ev.emit("change:" + k, v);
  }
  const on = (e, fn) => ev.on(e, fn);
  /* Every setting back to its default (the deadline to a year from today); the watchlist and the ledger stay. */
  function reset() { for (const k of Object.keys(DEFAULTS)) if (k !== "watch") set(k, fresh(k)); }
  /* Sales tax: 4% with premium, 8% without; listing (setup) fee 2.5% on every order placed. */
  const tax = () => (state.premium ? 0.04 : 0.08);
  const setupFee = 0.025;

  /* ---------- ledger: net worth check-ins and logged sessions ---------- */
  const ledger = read("ledger") || { worth: [], trades: [] };
  function saveLedger() { write("ledger", ledger); ev.emit("ledger"); }
  function addWorth(v, t = Date.now()) {
    ledger.worth.push({ t, v: +v });
    ledger.worth.sort((a, b) => a.t - b.t);
    saveLedger();
    /* a back-dated check-in fills in history; only the newest one is your net worth now */
    if (ledger.worth[ledger.worth.length - 1].t === t) set("netWorth", +v);
  }
  function addTrade(x) { ledger.trades.unshift({ t: Date.now(), ...x }); saveLedger(); }
  function removeTrade(i) { ledger.trades.splice(i, 1); saveLedger(); }
  function updateTrade(i, patch) { if (ledger.trades[i]) { Object.assign(ledger.trades[i], patch); saveLedger(); } }
  function removeWorth(i) { ledger.worth.splice(i, 1); saveLedger(); }

  function exportAll() {
    const out = { app: "albion-billionaire-v2", at: new Date().toISOString(), settings: { ...state }, ledger };
    return JSON.stringify(out, null, 1);
  }
  function importAll(text) {
    const j = JSON.parse(text);
    if (!j || j.app !== "albion-billionaire-v2") throw new Error("That file isn't an Albion Billionaire v2 backup.");
    for (const [k, v] of Object.entries(j.settings || {})) if (k in DEFAULTS) set(k, v);
    if (j.ledger) { ledger.worth = j.ledger.worth || []; ledger.trades = j.ledger.trades || []; saveLedger(); }
  }

  return { get, set, on, reset, tax, setupFee, DEFAULTS, ledger, addWorth, addTrade, removeTrade, updateTrade, removeWorth, exportAll, importAll };
})();
