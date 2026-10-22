/* The pages in a simulated browser: what a click, a form or a restored backup actually does. Each test boots a fresh
   app (see dom.mjs). These guard the page wiring that the engine tests can't see: handlers that must not pile up
   across visits, filters that belong to one page, forms that render once, and data from files that must stay data. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot, until, sleep, respond } from "./dom.mjs";

/* Arrays and objects made inside the simulated browser belong to its own JavaScript world, so deepEqual won't match
   them against ones made here. This copies them over. */
const plain = (x) => JSON.parse(JSON.stringify(x));

test("one click on a play opens it once, however many pages came before", async () => {
  const app = await boot();
  for (const h of ["#/command", "#/opps", "#/planner", "#/command", "#/opps"]) await app.go(h);
  let opened = 0;
  const orig = app.AB.scan.samples;
  app.AB.scan.samples = (...a) => { opened++; return orig(...a); };
  app.click(app.$("#o-list [data-opp]"));
  assert.equal(opened, 1);
  assert.equal(app.$$(".drawer").length, 1);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("one delete in the Ledger removes exactly one trade", async () => {
  const app = await boot();
  const { store } = app.AB;
  for (let i = 0; i < 6; i++) store.addTrade({ key: "k" + i, title: "Trade " + i, kind: "bm", item: "T4_BAG", qty: 1, cost: 100, note: "", pred: { p10: 0, p50: 1, p90: 2 }, score: 50, result: null });
  for (const h of ["#/ledger", "#/command", "#/ledger"]) await app.go(h);
  for (let n = 5; n >= 3; n--) {
    app.click(app.$('[data-del-trade="0"]'));
    await sleep(10);
    assert.equal(store.ledger.trades.length, n);
  }
  assert.deepEqual(plain(store.ledger.trades.map((t) => t.title)), ["Trade 2", "Trade 1", "Trade 0"]);
  /* a result typed in, then a delete: still one at a time */
  app.change(app.$('[data-result="1"]'), 1.5);
  await sleep(10);
  app.click(app.$('[data-del-trade="0"]'));
  assert.deepEqual(plain(store.ledger.trades.map((t) => [t.title, t.result])), [["Trade 1", 1.5], ["Trade 0", null]]);
  app.close();
});

test("Opportunities and the Planner keep their own confidence filters", async () => {
  const app = await boot();
  await app.go("#/opps");
  const pressed = () => app.$('[data-seg="min"] button[aria-pressed="true"]')?.dataset.v;
  const before = { v: pressed(), shown: app.$("#o-count").textContent };
  await app.go("#/planner");
  app.click(app.$('[data-seg="min"] button[data-v="70"]'));
  await sleep(25);
  await app.go("#/opps");
  assert.deepEqual({ v: pressed(), shown: app.$("#o-count").textContent }, before);
  app.click(app.$('[data-seg="min"] button[data-v="70"]'));
  assert.equal(pressed(), "70");
  assert.notEqual(app.$("#o-count").textContent, before.shown);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("an edit in the Planner draws the page once", async () => {
  const app = await boot();
  await app.go("#/planner");
  const n = await app.renders("planner", async () => app.change(app.$('#p-form [data-k="goal"]'), 2e9));
  assert.equal(n, 1);
  assert.equal(app.AB.store.get("goal"), 2e9);
  const m = await app.renders("planner", async () => app.change(app.$('#p-form [data-k="hours"]'), 3.5));
  assert.equal(m, 1);
  assert.equal(app.AB.store.get("hours"), 3.5);
  app.close();
});

test("a restored backup can't put markup into the pages", async () => {
  const app = await boot();
  const { store } = app.AB;
  const evil = (id) => `"><img id="${id}" src="x" onerror="window.pwned=1">`;
  const backup = {
    app: "albion-billionaire-v2",
    settings: { hours: "2" + evil("x1"), goal: evil("x2"), theme: "neon", deadline: "2027-01-01" + evil("x3"), watch: ["T4_BAG", evil("x4")], capital: 40e6, premium: "yes" },
    ledger: {
      worth: [{ t: "soon", v: 5 }, { t: Date.parse("2026-10-01T12:00:00Z"), v: 30e6 }],
      trades: [{ t: Date.now(), key: "k", title: "Safe" + evil("x5"), kind: "bm", item: evil("x6"), qty: 1, cost: 5e6, note: evil("x7"), pred: { p10: 0, p50: 1e6, p90: 2e6 }, score: 60, result: "1" + evil("x8") }],
    },
  };
  const refused = store.importAll(JSON.stringify(backup));
  assert.equal(refused, 5); // hours, goal, theme, deadline, premium
  assert.equal(store.get("capital"), 40e6);
  assert.equal(typeof store.get("hours"), "number");
  assert.deepEqual(plain(store.get("watch")), ["T4_BAG"]);
  assert.equal(store.ledger.worth.length, 1);
  assert.equal(store.ledger.trades[0].result, null);
  assert.equal(store.ledger.trades[0].item, "");
  for (const h of ["#/command", "#/planner", "#/ledger", "#/settings", "#/markets"]) {
    await app.go(h);
    for (let i = 1; i <= 8; i++) assert.equal(app.$("#x" + i), null, `markup from the backup reached ${h}`);
    if (h === "#/ledger") assert.match(app.$("#page").textContent, /Safe"><img id="x5"/); // the trade's title shows, as text
  }
  assert.equal(app.w.pwned, undefined);
  assert.throws(() => store.importAll("not json"), /isn't an Albion Billionaire v2 backup/);
  app.close();
});

test("a link with a broken escape still loads the app, and Markets says it names no item", async () => {
  const app = await boot({ hash: "#/markets/T4_BAG%" });
  assert.ok(app.AB.state.R.opps.length > 0);
  assert.equal(app.$("#page h1").textContent, "Look up any item");
  assert.match(app.$("#page .page-head p").textContent, /doesn't name an item \(“T4_BAG%”\)/);
  await app.go("#/markets/T4_BAG");
  assert.match(app.$("#page .it-name").textContent, /Bag/);
  assert.deepEqual(app.errors, []);
  app.close();
});

/* A price server that can be switched on, slowed down, or made to fail partway. Its answers are valid but empty (these
   tests are about which source the app ends up on, not the prices), except for any current prices a test puts in
   `prices`, which every price request gets. */
function server() {
  const s = { online: false, delay: 0, failPrices: false, prices: [] };
  s.net = async (url) => {
    if (!s.online) throw new TypeError("offline");
    if (s.delay) await sleep(s.delay);
    if (url.includes("/gold.json")) return respond([{ price: 4000, timestamp: new Date().toISOString().slice(0, 19) }]);
    if (url.includes("/prices/")) { if (s.failPrices) throw new TypeError("connection reset"); return respond(s.prices); }
    return respond([]);
  };
  return s;
}

test("Reload switches back to live prices once the server answers again", async () => {
  const s = server();
  const app = await boot({ net: s.net });
  assert.equal(app.AB.api.mode, "snapshot");
  s.online = true;
  app.click(app.$("#refreshBtn"));
  await sleep(30);
  await until(() => !app.AB.state.loading);
  assert.equal(app.AB.api.mode, "live");
  assert.equal(app.AB.state.M.live, true);
  app.close();
});

test("a live load that fails partway finishes on the snapshot and says why", async () => {
  const s = server();
  s.online = true;
  s.failPrices = true;
  const app = await boot({ net: s.net });
  assert.equal(app.AB.state.M.mode, "snapshot");
  assert.match(app.AB.state.M.why, /saved snapshot until the next reload/);
  assert.ok(app.AB.state.R.opps.length > 0);
  assert.equal(app.AB.state.error, null);
  app.close();
});

test("picking Snapshot only while live prices load wins over that load", async () => {
  const s = server();
  s.online = true;
  s.delay = 150;
  const app = await boot({ net: s.net });
  assert.equal(app.AB.state.M.mode, "live");
  app.click(app.$("#refreshBtn"));
  await until(() => app.AB.state.loading);
  app.AB.store.set("dataMode", "snapshot");
  await sleep(30);
  await until(() => !app.AB.state.loading);
  assert.equal(app.AB.state.M.mode, "snapshot");
  assert.equal(app.AB.api.mode, "snapshot");
  app.close();
});

test("logging a trade keeps 0 silver spent as 0, and an empty field as the plan's capital", async () => {
  const app = await boot();
  const { store } = app.AB;
  const log = async (cost) => {
    await app.go("#/opps");
    app.click(app.$("#o-list [data-opp]"));
    app.click(app.$(".drawer [data-log]"));
    const form = app.$(".drawer form[data-ask]");
    form.querySelector('[name="cost"]').value = cost;
    app.submit(form);
    return store.ledger.trades[0];
  };
  assert.equal((await log("0")).cost, 0);
  const first = app.AB.state.R.opps.find((o) => o.key === app.$("#o-list [data-opp]").dataset.opp);
  assert.equal((await log("")).cost, first.capital);
  app.close();
});

test("a play that buys and sells in one market shows that market's chart once", async () => {
  const app = await boot();
  const R = app.AB.state.R;
  const o = R.byKind.dip[0] || R.opps.find((x) => x.legs.filter((l) => l.id && l.city).every((l, _, a) => l.id === a[0].id && l.city === a[0].city));
  assert.ok(o, "the snapshot has a dip play");
  app.AB.kit.openOpp(o);
  const charts = app.$$('.drawer [id^="d-leg"]');
  assert.equal(charts.length, 1);
  assert.match(charts[0].closest(".card").textContent, /Where you buy and sell/);
  app.close();
});

/* ---------- alerts and timers ---------- */
/* A stand-in for the browser's notifications, already allowed, that records what it shows. */
function notifications(w) {
  const shown = [];
  w.Notification = class { constructor(title, o) { shown.push([title, o.body]); } static get permission() { return "granted"; } static requestPermission() { return Promise.resolve("granted"); } };
  return shown;
}
const isoNow = () => new Date().toISOString().slice(0, 19);

test("an alert set from an item page fires when its price is met: one notification, a badge, and Met in the list", async () => {
  const s = server();
  s.online = true;
  s.prices = [{ item_id: "T6_BAG", city: "Lymhurst", quality: 1, sell_price_min: 9000, sell_price_min_date: isoNow(), buy_price_max: 12000, buy_price_max_date: isoNow() }];
  const app = await boot({ net: s.net });
  const shown = notifications(app.w);
  const { store, cat } = app.AB;
  await app.go("#/markets/T6_BAG");
  await until(() => /city=Lymhurst/.test(app.$("#m-alert")?.getAttribute("href")));
  await app.go(app.$("#m-alert").getAttribute("href"));
  assert.equal(app.$("#al-item").value, cat.label("T6_BAG"));
  assert.equal(app.$("#al-picked").textContent, "T6_BAG · normal quality");
  assert.equal(app.$("#al-city").value, "Lymhurst");
  app.$("#al-price").value = "10000";
  app.submit(app.$("#al-form"));
  await until(() => shown.length === 1);
  assert.deepEqual(plain(shown), [[`${cat.label("T6_BAG")} in Lymhurst`, "Listed at 9,000 silver, at or under your 10,000 (seen just now)."]]);
  assert.deepEqual(plain(store.get("alerts").map((a) => [a.id, a.city, a.kind, a.price, a.last, a.hit])), [["T6_BAG", "Lymhurst", "below", 10000, 9000, true]]);
  await until(() => /Met/.test(app.$("#al-list").textContent));
  assert.equal(app.$("#nav [data-badge]").hidden, false);
  assert.equal(app.$("#nav [data-badge]").textContent, "1");
  /* checked again while it stays met: no second notification */
  app.click(app.$("#al-check"));
  await until(() => /already told/.test(app.$("#toast")?.textContent || ""));
  assert.equal(shown.length, 1);
  /* deleted: the badge goes */
  app.click(app.$('[data-del-alert="0"]'));
  assert.equal(store.get("alerts").length, 0);
  assert.equal(app.$("#nav [data-badge]").hidden, true);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("the alert form refuses what can't work: no item, no price, a twin, or a listing rule on the Black Market", async () => {
  const app = await boot();
  const { store } = app.AB;
  await app.go("#/alerts");
  const toast = () => app.$("#toast")?.textContent;
  app.$("#al-price").value = "500";
  app.submit(app.$("#al-form"));
  assert.equal(toast(), "Pick an item from the list first.");
  /* search and pick, as a player would */
  app.change(app.$("#al-item"), "t6 bag");
  await until(() => app.$("#al-results button[data-id]"));
  app.click(app.$('#al-results button[data-id="T6_BAG"]') || app.$("#al-results button[data-id]"));
  const id = app.$("#al-picked").textContent.split(" ")[0];
  assert.ok(app.AB.util.isItem(id), id);
  app.$("#al-price").value = "";
  app.submit(app.$("#al-form"));
  assert.equal(toast(), "Type the price to watch for.");
  /* the Black Market only has buy orders to watch */
  app.change(app.$("#al-city"), "Black Market");
  assert.equal(app.$("#al-kind").value, "above");
  assert.equal(app.$('#al-kind [value="below"]').disabled, true);
  app.$("#al-price").value = "20000";
  app.submit(app.$("#al-form"));
  app.$("#al-price").value = "20000";
  app.submit(app.$("#al-form"));
  assert.equal(toast(), "You already have that alert.");
  assert.deepEqual(plain(store.get("alerts").map((a) => [a.id, a.city, a.kind, a.price])), [[id, "Black Market", "above", 20000]]);
  /* typing over the picked item un-picks it */
  app.change(app.$("#al-item"), "something else");
  app.$("#al-price").value = "300";
  app.submit(app.$("#al-form"));
  assert.equal(toast(), "Pick an item from the list first.");
  assert.equal(store.get("alerts").length, 1);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("timers count down from what the player sets, reminders follow them, and Reset settings keeps them", async () => {
  const app = await boot();
  const { store, notify } = app.AB;
  const sent = [];
  const orig = notify.schedule;
  notify.schedule = (list) => { sent.push(plain(list)); return orig(list); };
  await app.go("#/alerts");
  const t0 = Date.now();
  app.click(app.$('[data-now="planted"]'));
  assert.ok(Math.abs(store.get("timers").planted - t0) < 5000);
  assert.match(app.$("#al-clock .kpi .k-value").textContent, /^(22 h 00 min|21 h 59 min)$/);
  app.change(app.$('[data-ago="laborers"]'), 23);
  assert.ok(Math.abs(store.get("timers").laborers - (t0 - 23 * 36e5)) < 5000);
  assert.equal(app.$$("#al-clock .kpi .k-value")[1].textContent, "Back");
  app.change(app.$("#al-focus"), 12000);
  assert.equal(store.get("timers").focus, 12000);
  assert.match(app.$$("#al-clock .kpi")[2].textContent, /12,000.*full/);
  /* the laborers are back already, so only the crops and focus are ahead, soonest first */
  const last = sent[sent.length - 1];
  assert.deepEqual(last.map((r) => r.key).sort(), ["focus", "harvest"]);
  assert.ok(last[0].at <= last[1].at);
  assert.match(app.$("#al-next").textContent, /Next reminder: (Crops ready|Focus nearly full)/);
  /* the maintenance reminder, when ticked, joins them */
  const box = app.$('[data-remind="reset"]');
  box.checked = true;
  box.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  assert.equal(store.get("timers").remind.reset, true);
  assert.ok(sent[sent.length - 1].some((r) => r.key === "reset0"));
  assert.equal(app.$$("#al-maint tbody tr").length, 3);
  assert.match(app.$("#al-maint tr.al-mine").textContent, /Americas/);
  store.reset();
  assert.equal(store.get("timers").focus, 12000);
  assert.equal(store.get("timers").remind.reset, true);
  assert.deepEqual(app.errors, []);
  app.close();
});

/* ---------- automatic price reloads ---------- */
/* The live server's one current price, for a bag in Lymhurst; tests change it and reload. */
const bag = (sell) => [{ item_id: "T6_BAG", city: "Lymhurst", quality: 1, sell_price_min: sell, sell_price_min_date: isoNow(), buy_price_max: 0, buy_price_max_date: "0001-01-01T00:00:00" }];
const shownSell = (app) => app.AB.state.M.P.T6_BAG?.Lymhurst?.sell;
async function liveApp(extra = {}) {
  const s = server();
  s.online = true;
  s.prices = bag(9000);
  const asked = [];
  const app = await boot({ net: (u) => { asked.push(u); return s.net(u); }, ...extra });
  return { s, app, asked };
}

test("reloaded prices wait while the player types, then reach the page with its filters and table view kept", async () => {
  const { s, app } = await liveApp();
  await app.go("#/opps");
  app.click(app.$('[data-seg="min"] [data-v="50"]'));
  app.click(app.$("#o-map [data-table-toggle]"));
  s.prices = bag(8000);
  const search = app.$("#search");
  search.focus();
  const draws = await app.renders("opps", async () => {
    await app.AB.app.reloadPrices();
    await sleep(700);
    assert.equal(shownSell(app), 9000, "not while a field has focus");
    search.blur();
    await until(() => shownSell(app) === 8000);
  });
  assert.equal(draws, 1, "the page is redrawn once with the new prices");
  assert.equal(app.$('[data-seg="min"] [aria-pressed="true"]').dataset.v, "50");
  assert.equal(app.$("#o-map [data-table-toggle]").getAttribute("aria-pressed"), "true");
  assert.equal(app.$("#o-map .chart-table").hidden, false);
  assert.equal(app.$("#statusPill").dataset.mode, "live");
  assert.match(app.$("#statusPill").title, /checked .*reloading every minute/);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("reloaded prices wait while a play or dialog is open, and a page holding a form isn't redrawn under the player", async () => {
  const { s, app } = await liveApp();
  await app.go("#/opps");
  app.AB.ui.drawer.open({ title: "<h2>A play</h2>", html: "<p>Details</p>" });
  s.prices = bag(8000);
  await app.AB.app.reloadPrices();
  await sleep(700);
  assert.equal(shownSell(app), 9000, "held back while the drawer is open");
  app.click(app.$(".drawer [data-close]"));
  await until(() => shownSell(app) === 8000);
  await app.go("#/alerts");
  app.$("#al-price").value = "12345";
  s.prices = bag(7000);
  const draws = await app.renders("alerts", async () => {
    await app.AB.app.reloadPrices();
    await until(() => shownSell(app) === 7000);
  });
  assert.equal(draws, 0);
  assert.equal(app.$("#al-price").value, "12345");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("an automatic reload that fails keeps the prices on screen, says it's retrying, and recovers", async () => {
  const { s, app } = await liveApp();
  const M = app.AB.state.M;
  s.failPrices = true;
  await app.AB.app.reloadPrices();
  assert.equal(app.AB.state.M, M);
  assert.equal(app.AB.api.mode, "live", "no switch to the snapshot");
  assert.equal(app.$("#statusPill").dataset.mode, "retry");
  assert.equal(app.$("#statusPill .sp-text").textContent, "Live · retrying");
  assert.match(app.$("#statusPill").title, /can't be reached.*checked at/);
  s.failPrices = false;
  s.prices = bag(8500);
  await app.AB.app.reloadPrices();
  await until(() => shownSell(app) === 8500);
  assert.equal(app.$("#statusPill").dataset.mode, "live");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a reload is due a minute after the last: showing the app catches up at once, but not while hidden or switched off", async () => {
  const { s, app, asked } = await liveApp();
  const { w, AB } = app;
  const real = w.Date.now.bind(w.Date);
  w.Date.now = () => real() + 61e3; // a minute and a second after the first load
  const prices = () => asked.filter((u) => u.includes("/stats/prices/")).length;
  const shown = () => w.document.dispatchEvent(new w.Event("visibilitychange"));
  const base = prices();
  s.prices = bag(8000);
  Object.defineProperty(w.document, "visibilityState", { value: "hidden", configurable: true });
  shown();
  await app.AB.app.reloadPrices();
  await sleep(50);
  assert.equal(prices(), base, "nothing while the app is hidden");
  delete w.document.visibilityState;
  AB.store.set("autoReload", 0);
  shown();
  await sleep(50);
  assert.equal(prices(), base, "nothing when switched off");
  AB.store.set("autoReload", 60);
  await until(() => shownSell(app) === 8000);
  assert.ok(prices() > base, "switched back on, the overdue reload runs at once");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("an item page takes reloaded prices in place, without going back to grey blocks", async () => {
  const { s, app } = await liveApp();
  await app.go("#/markets/T6_BAG");
  const now = () => app.$('#m-grid tr[data-city="Lymhurst"] td.r.num')?.textContent || "";
  await until(() => /9,000/.test(now()));
  let greyed = 0;
  new app.w.MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.querySelector?.(".skel") || n.classList?.contains("skel")) greyed++; })
    .observe(app.w.document.body, { childList: true, subtree: true });
  s.prices = bag(8000);
  await app.AB.app.reloadPrices();
  await until(() => /8,000/.test(now()));
  await sleep(30);
  assert.equal(greyed, 0);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a link acts once per visit: a redraw with new prices doesn't scroll back to the data section", async () => {
  const { s, app } = await liveApp();
  let scrolls = 0;
  app.w.HTMLElement.prototype.scrollIntoView = () => { scrolls++; };
  await app.go("#/trust?s=data");
  await sleep(100);
  assert.equal(scrolls, 1);
  s.prices = bag(8000);
  const draws = await app.renders("trust", async () => {
    await app.AB.app.reloadPrices();
    await until(() => shownSell(app) === 8000);
    await sleep(100);
  });
  assert.equal(draws, 1);
  assert.equal(scrolls, 1, "the redraw didn't scroll again");
  await app.go("#/command");
  await app.go("#/trust?s=data");
  await sleep(100);
  assert.equal(scrolls, 2, "a new visit to the link does");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a reload run early takes the place of the one planned, so reloads never double up", async () => {
  /* the reload timers: the app plans the next reload a minute ahead */
  const planned = new Set();
  const setup = (w) => {
    const set = w.setTimeout.bind(w), clear = w.clearTimeout.bind(w);
    w.setTimeout = (fn, ms, ...a) => {
      if (!(ms > 30e3 && ms <= 61e3)) return set(fn, ms, ...a);
      const id = set(() => { planned.delete(id); fn(...a); }, ms);
      planned.add(id);
      return id;
    };
    w.clearTimeout = (id) => { planned.delete(id); clear(id); };
  };
  const { s, app } = await liveApp({ setup });
  assert.equal(planned.size, 1, "the first load plans the next reload");
  s.prices = bag(8000);
  await app.AB.app.reloadPrices();
  await until(() => shownSell(app) === 8000);
  assert.equal(planned.size, 1, "a reload run early replaces it");
  s.prices = bag(7500);
  app.w.dispatchEvent(new app.w.Event("online"));
  await until(() => shownSell(app) === 7500);
  assert.equal(planned.size, 1, "and so does one run because the device is back online");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("alerts are checked with every automatic reload, and one on a scanned item costs no request of its own", async () => {
  const { s, app, asked } = await liveApp();
  const { AB } = app;
  const priceRequests = () => asked.filter((u) => u.includes("/stats/prices/")).length;
  const perLoad = priceRequests();
  assert.ok(AB.state.M.U.all.includes("T6_BAG"));
  AB.store.set("alerts", [{ id: "T6_BAG", city: "Lymhurst", kind: "below", price: 8500, t: 0, firedAt: 0, last: null, seen: null, checked: null, hit: false }]);
  s.prices = bag(8000);
  await AB.app.reloadPrices();
  await until(() => AB.store.get("alerts")[0].hit);
  assert.equal(AB.store.get("alerts")[0].last, 8000);
  assert.equal(priceRequests(), 2 * perLoad, "the reload's own requests and nothing more");
  assert.equal(app.$("[data-badge]").hidden, false, "the Alerts badge shows it");
  assert.deepEqual(app.errors, []);
  app.close();
});
