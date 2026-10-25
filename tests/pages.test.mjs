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
   `prices` and any sales history in `history`, which every request of that kind gets. */
function server() {
  const s = { online: false, delay: 0, failPrices: false, prices: [], history: [] };
  s.net = async (url) => {
    if (!s.online) throw new TypeError("offline");
    if (s.delay) await sleep(s.delay);
    if (url.includes("/gold.json")) return respond([{ price: 4000, timestamp: new Date().toISOString().slice(0, 19) }]);
    if (url.includes("/prices/")) { if (s.failPrices) throw new TypeError("connection reset"); return respond(s.prices); }
    if (url.includes("/history/")) return respond(s.history);
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

/* ---------- the sale check: orders out of line with what sells ---------- */
test("a play priced from sales says so in the list and in the play, with the price behind it", async () => {
  const app = await boot();
  const o = app.AB.state.R.opps.find((x) => x.checks.length && x.kind !== "dip");
  assert.ok(o, "the snapshot has a play with a last day out of line with sales");
  assert.match(app.AB.kit.oppRow(o, { min: 0, max: 1 }), /(a price|\d prices) out of line with sales/);
  app.AB.kit.openOpp(o);
  const d = app.$(".drawer");
  assert.match(d.querySelector(".sale-check").textContent, /^Checked against what sold\. In the saved snapshot, the last day's average sale for .* one odd day isn't a price to count on\. Planned at /);
  const leg = app.$$(".drawer .leg").find((x) => /\(from sales\)/.test(x.textContent));
  assert.match(leg.querySelector(".l-off").textContent, /^Last day's average sale: .*, (below|above) the range it sells in$/);
  await app.go("#/trust");
  assert.match(app.$("#page").textContent, /Orders that don't match sales.*This needs live prices/);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("with live prices, Markets marks an order out of line with sales and Trust counts them by market", async () => {
  const s = server();
  s.online = true;
  /* two weeks of planks selling near 1,000 in Lymhurst, and an order book of 10 to buy and 3,000 to sell */
  const day0 = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  s.history = [{ location: "Lymhurst", item_id: "T5_PLANKS", quality: 1, data: Array.from({ length: 14 }, (_, k) => ({ item_count: 40, avg_price: Math.round(1000 * (1 + 0.03 * Math.sin(k))), timestamp: new Date(day0 - (14 - k) * 864e5).toISOString().slice(0, 19) })) }];
  s.prices = [{ item_id: "T5_PLANKS", city: "Lymhurst", quality: 1, sell_price_min: 3000, sell_price_min_date: isoNow(), buy_price_max: 10, buy_price_max_date: isoNow() }];
  const app = await boot({ net: s.net });
  assert.equal(app.AB.state.M.live, true);
  const sold = app.AB.state.M.sold("T5_PLANKS", "Lymhurst");
  assert.ok(sold.lo > 10 && sold.hi < 3000);
  await app.go("#/markets/T5_PLANKS");
  await until(() => app.$('#m-grid tr[data-city="Lymhurst"]'));
  assert.match(app.$('#m-grid tr[data-city="Lymhurst"]').textContent, /above what sells/);
  await app.go("#/trust");
  assert.ok(app.$("#t-bait svg"), "the chart is drawn");
  const row = [...app.$$("#t-bait table tr")].find((tr) => /Lymhurst/.test(tr.textContent));
  assert.deepEqual([...row.querySelectorAll("td")].map((td) => td.textContent), ["Lymhurst", "100.0%", "1", "100.0%", "1"]);
  assert.deepEqual(app.errors, []);
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

test("an alert the reloads keep checking without it firing never stops the app", async () => {
  /* a check that asks the server nothing and fires nothing finishes at once; the next one must not wait on it forever */
  const { s, app } = await liveApp();
  const { AB } = app;
  AB.store.set("alerts", [{ id: "T6_BAG", city: "Lymhurst", kind: "below", price: 1, t: 0, firedAt: 0, last: null, seen: null, checked: null, hit: false }]);
  for (const sell of [8000, 7000, 6000]) {
    s.prices = bag(sell);
    await AB.app.reloadPrices();
    await until(() => shownSell(app) === sell, 5000);
    await until(() => AB.store.get("alerts")[0].last === sell, 5000);
  }
  assert.equal(AB.store.get("alerts")[0].hit, false);
  assert.deepEqual(app.errors, []);
  app.close();
});

/* ---------- prices from the Windows app's Data Client ---------- */
/* The Windows app's bridge as far as these tests need it: the push of what the Data Client captures, and the prices a
   load asks it for. `extra(w)` adds to the window's setup. */
function desktop(extra = null) {
  const d = { push: null, rows: [] };
  d.setup = (w) => {
    w.albionDesktop = {
      prices: async (ids, cities) => d.rows.filter((r) => ids.includes(r.id) && cities.includes(r.city)),
      onPrices: (cb) => { d.push = cb; return () => {}; },
    };
    extra?.(w);
  };
  return d;
}
const captured = (o) => ({ id: "T6_BAG", city: "Lymhurst", quality: 1, sell: 0, sellAt: 0, buy: 0, buyAt: 0, ...o });
const bagNow = (app) => app.$('#m-grid tr[data-city="Lymhurst"] td.r.num')?.textContent || "";

test("prices the Data Client captures reach the page within seconds, scored, with no request to the price server", async () => {
  const d = desktop();
  const { app, asked } = await liveApp({ setup: d.setup });
  const { AB } = app;
  await app.go("#/markets/T6_BAG");
  await until(() => /9,000/.test(bagNow(app)));
  const M0 = AB.state.M, R0 = AB.state.R, title = app.$("#statusPill").title, requests = asked.length;
  const t0 = Date.now();
  d.push([captured({ sell: 8100, sellAt: Date.now() })]);
  await until(() => /8,100/.test(bagNow(app)), 3000);
  assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  assert.equal(shownSell(app), 8100);
  assert.notEqual(AB.state.R, R0, "the plays were scored again");
  assert.equal(asked.length, requests, "no request");
  assert.equal(AB.state.M.checkedAt, M0.checkedAt);
  assert.equal(app.$("#statusPill").title, title, "still says when prices were last checked with the server");
  /* pushes with nothing new for the scan (another quality, a price older than the one shown) change nothing */
  const M1 = AB.state.M;
  d.push([captured({ quality: 3, sell: 1, sellAt: Date.now() })]);
  d.push([captured({ sell: 1, sellAt: Date.now() - 36e5 })]);
  await sleep(300);
  assert.equal(AB.state.M, M1);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a capture that lands during a reload is kept, and alerts it meets fire at once without a request", async () => {
  const d = desktop();
  const { s, app, asked } = await liveApp({ setup: d.setup });
  const { AB } = app;
  s.delay = 200;
  s.prices = bag(8800);
  const reload = AB.app.reloadPrices();
  await sleep(50);
  d.push([captured({ city: "Martlock", sell: 9999, sellAt: Date.now() })]); // a market the server has no price for
  await reload;
  await until(() => shownSell(app) === 8800 && AB.state.M.P.T6_BAG?.Martlock?.sell === 9999, 5000);
  s.delay = 0;
  AB.store.set("alerts", [{ id: "T6_BAG", city: "Lymhurst", kind: "below", price: 8500, t: 0, firedAt: 0, last: null, seen: null, checked: null, hit: false }]);
  const requests = asked.length;
  d.push([captured({ sell: 8400, sellAt: Date.now() })]);
  await until(() => AB.store.get("alerts")[0].hit, 3000);
  assert.equal(AB.store.get("alerts")[0].last, 8400);
  assert.equal(asked.length, requests, "no request");
  assert.equal(app.$("[data-badge]").hidden, false);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("captures wait while the app is hidden, so scoring never takes time from the game, and arrive when it's shown", async () => {
  const d = desktop();
  const { app } = await liveApp({ setup: d.setup });
  const { w } = app;
  Object.defineProperty(w.document, "visibilityState", { value: "hidden", configurable: true });
  d.push([captured({ sell: 8200, sellAt: Date.now() })]);
  await sleep(300);
  assert.equal(shownSell(app), 9000);
  delete w.document.visibilityState;
  w.document.dispatchEvent(new w.Event("visibilitychange"));
  await until(() => shownSell(app) === 8200, 3000);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("captures shown while a failed reload waits to try again don't cut the wait short", async () => {
  const planned = new Map(); // reload timers: id -> when they fire
  const d = desktop((w) => {
    const set = w.setTimeout.bind(w), clear = w.clearTimeout.bind(w);
    w.setTimeout = (fn, ms, ...a) => {
      if (!(ms > 30e3)) return set(fn, ms, ...a);
      const id = set(() => { planned.delete(id); fn(...a); }, ms);
      planned.set(id, Date.now() + ms);
      return id;
    };
    w.clearTimeout = (id) => { planned.delete(id); clear(id); };
  });
  const { s, app } = await liveApp({ setup: d.setup });
  const due = () => [...planned.values()].map((t) => Math.round((t - Date.now()) / 1000));
  s.failPrices = true;
  await app.AB.app.reloadPrices();
  assert.equal(app.$("#statusPill").dataset.mode, "retry");
  const [wait] = due();
  assert.ok(wait > 110 && wait <= 120, `the retry waits two minutes (${wait} s)`);
  d.push([captured({ sell: 8300, sellAt: Date.now() })]);
  await until(() => shownSell(app) === 8300, 3000);
  assert.equal(planned.size, 1);
  assert.ok(Math.abs(due()[0] - wait) <= 2, `still ${wait} s, not ${due()[0]} s`);
  assert.equal(app.$("#statusPill").dataset.mode, "retry", "and the pill still says the server isn't answering");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a capture still being scored when a reload ends doesn't put the older prices back", async () => {
  const d = desktop();
  const { s, app } = await liveApp({ setup: d.setup });
  const { AB } = app;
  /* the capture's scoring takes a while; the reload's doesn't */
  const runSoon = AB.scan.runSoon;
  let slow = true;
  AB.scan.runSoon = async (M) => { if (slow) { slow = false; await sleep(400); } return runSoon(M); };
  d.push([captured({ city: "Martlock", sell: 9999, sellAt: Date.now() })]);
  await sleep(50);
  s.prices = bag(8700);
  await AB.app.reloadPrices();
  await until(() => shownSell(app) === 8700);
  assert.equal(AB.state.M.P.T6_BAG.Martlock.sell, 9999, "the reload has the capture too");
  await sleep(600);
  assert.equal(shownSell(app), 8700, "the reload's prices stay");
  assert.equal(AB.state.M.P.T6_BAG.Martlock.sell, 9999);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a burst of captures is scored together, at most once every 2 seconds, and every price in it arrives", async () => {
  const d = desktop();
  const { app } = await liveApp({ setup: d.setup });
  const { AB } = app;
  let builds = 0;
  AB.market.on("ready", () => builds++);
  const cities = ["Lymhurst", "Martlock", "Thetford", "Bridgewatch", "Fort Sterling", "Caerleon"];
  const t0 = Date.now();
  for (const [i, city] of cities.entries()) {
    d.push([captured({ city, sell: 7000 + i, sellAt: Date.now() })]);
    await sleep(100);
  }
  await until(() => cities.every((c, i) => AB.state.M.P.T6_BAG?.[c]?.sell === 7000 + i), 6000);
  assert.ok(Date.now() - t0 >= 2000, "the rest waited for the 2-second spacing");
  assert.equal(builds, 2, "the first push at once, the rest together");
  assert.deepEqual(app.errors, []);
  app.close();
});

/* ---------- Cost to Max ---------- */
/* the page is done drawing once its last chart (every specialization) is up, or it shows why it can't be */
const cmReady = (app) => until(() => app.$("#cm-specs svg") || app.$("#page .card .empty") || app.$("[data-cm-retry]"));
const stageTiers = (app) => app.$$(".cm-steps .cm-stage").map((r) => /crafts up to T(\d)/.exec(r.textContent)?.[1] ?? "tier 3");

test("Cost to Max draws the cheapest route from the snapshot: the totals, every chart and each stage's crafts", async () => {
  const app = await boot({ hash: "#/costmax" });
  await cmReady(app);
  const { $, $$ } = app;
  assert.ok($$("#nav a").some((a) => a.textContent.includes("Cost to Max")));
  assert.equal($("#cm-target").value, "CRAFT_SWORDS_CLAYMORE", "Claymore opens first");
  assert.equal($$(".kpi").length, 4);
  assert.match($(".kpi .k-range").textContent, /^80% range: (pays [\d.]+[kMB]? to [\d.]+[kMB]?|costs .+ to .+|pays .+ to costs .+)$/, "a range reads in one direction, never \"pays X to pays Y\"");
  for (const id of ["cm-curve", "cm-heat", "cm-pace", "cm-specs", "cm-flow"]) assert.ok($(`#${id} svg`), `${id} drew`);
  assert.deepEqual(stageTiers(app), ["tier 3", "4", "5", "6", "7", "8"], "Sword Crafter's first level, then a stage per tier it opens");
  assert.ok($$(".cm-steps tbody tr:not(.cm-stage)").length >= 5);
  /* the snapshot doesn't price tier 3 or journals, and the page says so */
  assert.match($("#page .banner.info").textContent, /tier-3 crafts.*snapshot/);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a level typed into Cost to Max is saved and the route starts from it; a bad entry is put back", async () => {
  const app = await boot({ hash: "#/costmax" });
  await cmReady(app);
  const { $, AB } = app;
  const n = await app.renders("costmax", async () => { app.change($('input[data-node="CRAFT_SWORDS"]'), 45); await cmReady(app); });
  assert.equal(n, 1, "one edit, one redraw");
  assert.equal(AB.store.get("specLevels").CRAFT_SWORDS, 45);
  assert.deepEqual(stageTiers(app), ["6", "7", "8"], "Sword Crafter 45 has T4 to T6 open already");
  for (const bad of [150, -3, ""]) {
    app.change($('input[data-node="CRAFT_SWORDS_CLAYMORE"]'), bad);
    assert.equal($('input[data-node="CRAFT_SWORDS_CLAYMORE"]').value, "0", `${JSON.stringify(bad)} isn't a level`);
  }
  assert.deepEqual(plain(AB.store.get("specLevels")), { CRAFT_SWORDS: 45 });
  AB.store.reset();
  assert.equal(AB.store.get("specLevels").CRAFT_SWORDS, 45, "Reset settings keeps the player's levels");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a link to a Cost to Max route opens it and is remembered; a link to no route falls back to the last one", async () => {
  const app = await boot({ hash: "#/costmax/CRAFT_BAG" });
  await cmReady(app);
  const { $, AB } = app;
  assert.equal($("#cm-target").value, "CRAFT_BAG");
  assert.equal($("#cm-line").value, "CRAFT_BAG");
  assert.equal(AB.store.get("costMax").node, "CRAFT_BAG");
  assert.equal($('#cm-line option[value="CRAFT_TOOL_TRACKING"]'), null, "a line with no recipes in the item data isn't offered");
  for (const h of ["#/costmax/CRAFT_NOT_A_NODE", "#/costmax/CRAFT_TOOL_TRACKING", `#/costmax/${encodeURIComponent('"><img id="x1" src=x>')}`]) {
    await app.go(h);
    await cmReady(app);
    assert.equal($("#cm-target").value, "CRAFT_BAG", h);
  }
  assert.equal($("#x1"), null);
  /* another line opens on its first specialization the snapshot can price */
  const line = $("#cm-line");
  line.value = "CRAFT_SWORDS";
  line.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  await sleep(25);
  await cmReady(app);
  const id = decodeURIComponent(app.w.location.hash.split("/")[2]), node = AB.spec.node(id);
  assert.deepEqual([node.line, node.kind, AB.spec.special(node)], ["CRAFT_SWORDS", "spec", false]);
  assert.equal($("#cm-target").value, id);
  assert.equal(AB.store.get("costMax").node, id);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Cost to Max says plainly when the snapshot can't price a route, or the route is already done", async () => {
  const app = await boot({ hash: "#/costmax/CRAFT_SWORDS_AVALON" });
  await cmReady(app);
  assert.match(app.$("#page .card .empty").textContent, /None of the Kingmaker items can be priced from the saved snapshot/);
  app.AB.store.set("specLevels", { CRAFT_SWORDS_CLAYMORE: 100 });
  await app.go("#/costmax/CRAFT_SWORDS_CLAYMORE");
  await cmReady(app);
  assert.match(app.$("#page .card .empty").textContent, /Claymore is already at 100/);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a doctored backup can't put markup into Cost to Max, and keeps the levels it can use", async () => {
  const app = await boot();
  const { store } = app.AB;
  const evil = (id) => `"><img id="${id}" src="x" onerror="window.pwned=1">`;
  const refused = store.importAll(JSON.stringify({
    app: "albion-billionaire-v2",
    settings: {
      costMax: { node: "CRAFT_SWORDS" + evil("c1"), days: 30 },
      specLevels: { CRAFT_SWORDS: 30, [evil("c2")]: 50, CRAFT_SWORDS_CLAYMORE: evil("c3"), CRAFT_BAG: 250, CRAFT_SWORDS_DUAL: 12.7 },
    },
  }));
  assert.equal(refused, 1, "the target with markup in it");
  assert.equal(store.get("costMax").node, "CRAFT_SWORDS_CLAYMORE");
  assert.deepEqual(plain(store.get("specLevels")), { CRAFT_SWORDS: 30, CRAFT_BAG: 100, CRAFT_SWORDS_DUAL: 12 });
  await app.go("#/costmax");
  await cmReady(app);
  for (const id of ["c1", "c2", "c3"]) assert.equal(app.$("#" + id), null);
  assert.equal(app.$('input[data-node="CRAFT_SWORDS"]').value, "30");
  assert.equal(app.w.pwned, undefined);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Cost to Max loads a line's prices once and keeps them; a failed load says so and tries again when asked", async () => {
  const app = await boot();
  const { AB } = app;
  const extend = AB.market.extend;
  let calls = 0, fail = true;
  AB.market.extend = (ids) => {
    calls++;
    if (fail) { fail = false; return Promise.reject(new Error("The price server didn't answer.")); }
    return extend(ids);
  };
  await app.go("#/costmax");
  await until(() => app.$("[data-cm-retry]"));
  assert.match(app.$("[data-cm-retry]").closest(".banner").textContent, /Prices for Sword Crafter didn't load.*The price server didn't answer/);
  for (const h of ["#/command", "#/costmax"]) await app.go(h);
  assert.equal(calls, 1, "a failed load waits to be asked again");
  app.click(app.$("[data-cm-retry]"));
  await cmReady(app);
  assert.ok(app.$("#cm-curve svg"));
  assert.equal(calls, 2);
  for (const h of ["#/command", "#/costmax", "#/costmax/CRAFT_SWORDS_DUAL", "#/costmax/CRAFT_SWORDS"]) { await app.go(h); if (h !== "#/command") await cmReady(app); }
  assert.equal(calls, 2, "one load serves every visit and every route in the line");
  await app.go("#/costmax/CRAFT_BAG");
  await cmReady(app);
  assert.equal(calls, 3, "another line loads its own");
  await app.go("#/costmax/CRAFT_SWORDS_CLAYMORE");
  await cmReady(app);
  assert.equal(calls, 3, "and the first is still kept");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Cost to Max's pace, focus and journal choices are saved, and focus waits for premium", async () => {
  const app = await boot({ hash: "#/costmax" });
  await cmReady(app);
  const { $, $$, AB } = app;
  app.click($('[data-seg="pace"] button[data-v="14"]'));
  await cmReady(app);
  assert.equal(AB.store.get("costMax").days, 14);
  assert.match($$(".kpi")[2].textContent, /2 weeks/);
  assert.equal($('[data-seg="pace"] button[aria-pressed="true"]').dataset.v, "14");
  for (const k of ["focus", "journals"]) {
    const box = $(`input[data-k="${k}"]`);
    assert.equal(box.checked, true);
    box.checked = false;
    box.dispatchEvent(new app.w.Event("change", { bubbles: true }));
    await cmReady(app);
    assert.equal(AB.store.get("costMax")[k], false, k);
    assert.equal($(`input[data-k="${k}"]`).checked, false, `${k} stays off after the redraw`);
  }
  assert.match($("#page .know").textContent, /Focus is off\..*Journals are left out\./);
  AB.store.set("costMax", { ...AB.store.get("costMax"), focus: true });
  AB.store.set("premium", false);
  for (const h of ["#/settings", "#/costmax"]) await app.go(h);
  await cmReady(app);
  assert.equal($('input[data-k="focus"]').disabled, true, "without premium, focus doesn't refill");
  assert.equal($('input[data-k="focus"]').checked, false);
  assert.match($("#page .know").textContent, /Focus is off: without premium it doesn't refill/);
  assert.deepEqual(app.errors, []);
  app.close();
});

/* ---------- Cost to Max: the daily loop ---------- */
const loopText = (app) => app.$("#cm-loop-body").textContent;
const tick = (app, el, on) => { el.checked = on; el.dispatchEvent(new app.w.Event("change", { bubbles: true })); };

test("Cost to Max lays each stage's day out as a loop; its stage, mount, Mammoth and Expand redraw only the loop", async () => {
  const app = await boot({ hash: "#/costmax" });
  await cmReady(app);
  const { $, $$, AB } = app;
  assert.ok($("#cm-loop-body table.cm-loop"), "the stops");
  assert.match($$("#cm-loop-body tr.cm-stop th")[0].textContent, /^1\. Lymhurst/, "it starts where claymores are crafted");
  assert.deepEqual($$('[data-seg="cm-stage"] button').map((b) => b.dataset.v), ["4", "5", "6", "7", "8"], "a stage per tier the route crafts");
  assert.match(loopText(app), /crafts up to T4/);
  const curve = $("#cm-curve svg");
  const n = await app.renders("costmax", async () => {
    app.click($('[data-seg="cm-stage"] button[data-v="7"]'));
    app.change($("#cm-mount"), "ox5");
  });
  assert.equal(n, 0, "the stage and the mount redraw only the loop");
  assert.equal($("#cm-curve svg"), curve, "the charts stay as they are");
  assert.match(loopText(app), /crafts up to T7.*Expert's Transport Ox/);
  assert.equal(AB.store.get("costMax").mount, "ox5", "the mount is saved");
  assert.equal($('[data-seg="cm-stage"] button[aria-pressed="true"]').dataset.v, "7");
  /* a Transport Mammoth fills the loop and stands in for the mount */
  tick(app, $('#cm-loop input[data-k="mammoth"]'), true);
  assert.equal(AB.store.get("costMax").mammoth, true);
  assert.equal($("#cm-mount").disabled, true);
  assert.match(loopText(app), /Elder's Transport Mammoth.*Filled for the Mammoth/);
  assert.equal($("[data-cm-expand]"), null, "nothing to expand or undo: the Mammoth always fills");
  tick(app, $('#cm-loop input[data-k="mammoth"]'), false);
  /* Expand this loop on a stage with room, then back */
  app.click($('[data-seg="cm-stage"] button[data-v="4"]'));
  app.change($("#cm-mount"), "ox8");
  const grow = $('[data-cm-expand="1"]');
  assert.ok(grow, "the T4 day leaves the ox mostly empty");
  const e = await app.renders("costmax", async () => {
    app.click(grow);
    assert.equal(grow.disabled, true);
    assert.equal(grow.textContent, "Packing the mount…");
    await until(() => $(".cm-expand .b-title"));
  });
  assert.equal(e, 0);
  assert.equal(AB.store.get("costMax").expand, true);
  assert.match(loopText(app), /Expanded.*Added .* Claymore.*\(added\)/);
  assert.match($$("#cm-loop-body .cm-loop td")[0].textContent, /^Craft /);
  app.click($('[data-cm-expand="0"]'));
  await until(() => !$(".cm-expand .b-title"));
  assert.equal(AB.store.get("costMax").expand, false);
  /* every stage on the mount, drawn when opened */
  const all = $("#cm-loop-all");
  all.open = true;
  all.dispatchEvent(new app.w.Event("toggle"));
  await until(() => all.querySelector(".cm-more-body table"));
  assert.equal(all.querySelectorAll("tbody tr").length, 5);
  assert.match(all.querySelector("thead").textContent, /Elder's Transport Ox.*Saddled Direbear/, "the ox, and the Direbear to compare");
  /* the stage on screen survives a redraw of the page; another route opens on its first stage */
  app.click($('[data-seg="cm-stage"] button[data-v="6"]'));
  app.click($('[data-seg="pace"] button[data-v="30"]'));
  await cmReady(app);
  assert.equal($('[data-seg="cm-stage"] button[aria-pressed="true"]').dataset.v, "6");
  await app.go("#/costmax/CRAFT_SWORDS_DUAL");
  await cmReady(app);
  assert.equal($('[data-seg="cm-stage"] button[aria-pressed="true"]').dataset.v, $$('[data-seg="cm-stage"] button')[0].dataset.v);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Royal cities only keeps the route and its loops on the ring; the sell limit switched off says what it risks", async () => {
  const app = await boot({ hash: "#/costmax" });
  await cmReady(app);
  const { $, AB } = app;
  assert.ok($("#cm-loop-body .cm-risk"), "the usual route's loop leaves the ring, and says so");
  assert.match($("#cm-loop-body .cm-risk").textContent, /Red zone.*Caerleon/);
  const n = await app.renders("costmax", async () => { tick(app, $('#cm-form input[data-k="royal"]'), true); await cmReady(app); });
  assert.equal(n, 1, "one switch, one redraw");
  assert.equal(AB.store.get("safeOnly"), true, "the same setting as the Planner's red-zone switch");
  assert.equal($('#cm-form input[data-k="royal"]').checked, true);
  assert.equal($("#cm-loop-body .cm-risk"), null);
  assert.doesNotMatch($("#cm-loop-body").textContent, /Caerleon|Brecilien|Black Market/);
  assert.match($("#page .know").textContent, /cheapest royal city \(Royal cities only is on\).*sells in the royal cities only/);
  /* the sell limit */
  const capWarn = () => app.$$("#page .banner.warn").find((b) => /sell limit is off/.test(b.textContent));
  assert.equal(capWarn(), undefined);
  tick(app, $('#cm-form input[data-k="noCap"]'), true);
  await cmReady(app);
  assert.equal(AB.store.get("costMax").noCap, true);
  assert.match(capWarn().textContent, /The safe daily sell limit is off.*push prices down/);
  assert.match($("#page .know").textContent, /sells up to a whole day of each market's sales/);
  assert.equal($('#cm-form input[data-k="noCap"]').checked, true);
  tick(app, $('#cm-form input[data-k="noCap"]'), false);
  await cmReady(app);
  assert.equal(capWarn(), undefined);
  assert.deepEqual(app.errors, []);
  app.close();
});

/* ---------- Cost to Max for refining ---------- */
const stageRows = (app) => app.$$(".cm-steps .cm-stage").map((r) => /^(.+?) · /.exec(r.textContent.replace(/\s+/g, " ").trim())[1]);

test("Cost to Max switches to refining and back, each to its last route, and a refining route draws in full", async () => {
  const app = await boot({ hash: "#/costmax" });
  await cmReady(app);
  const { $, $$, AB } = app;
  assert.equal($('[data-seg="cm-mode"] button[aria-pressed="true"]').dataset.v, "craft");
  app.click($('[data-seg="cm-mode"] button[data-v="refine"]'));
  await until(() => $("#cm-line")?.value === "CRAFT_REFINE_ORE");
  await cmReady(app);
  assert.equal(app.w.location.hash, "#/costmax/CRAFT_REFINE_ORE", "Ore Smelter opens first");
  assert.equal($('[data-seg="cm-mode"] button[aria-pressed="true"]').dataset.v, "refine");
  assert.deepEqual($$("#cm-line option").map((o) => o.textContent).sort(), ["Fiber Weaver (cloth)", "Hide Tanner (leather)", "Ore Smelter (metal bars)", "Stone Cutter (stone blocks)", "Wood Planer (planks)"]);
  assert.equal($("#cm-target").value, "CRAFT_REFINE_ORE", "all five tiers");
  assert.deepEqual($$("#cm-form input[data-node]").map((i) => i.dataset.node), [4, 5, 6, 7, 8].map((t) => `CRAFT_REFINE_ORE_T${t}`));
  assert.equal($('#cm-form input[data-k="journals"]'), null, "refines earn no journals");
  assert.equal(AB.store.get("costMax").mode, "refine");
  assert.equal(AB.store.get("costMax").refine, "CRAFT_REFINE_ORE");
  /* the snapshot has no T2 or T3 ore or bars, so Adept's first level goes unpriced, and the page says so */
  assert.equal(stageRows(app)[0], "Adept Ore Smelter 0 → 1");
  assert.match($("#page .banner.info").textContent, /Nothing in the snapshot is priced for Adept Ore Smelter's first level.*With live prices in the app, the whole route is priced/);
  /* back to crafting, on the route it left */
  app.click($('[data-seg="cm-mode"] button[data-v="craft"]'));
  await until(() => $("#cm-target")?.value === "CRAFT_SWORDS_CLAYMORE");
  await cmReady(app);
  assert.equal(AB.store.get("costMax").mode, "craft");
  assert.equal(AB.store.get("costMax").refine, "CRAFT_REFINE_ORE", "the refining route is kept for next time");
  assert.ok($('#cm-form input[data-k="journals"]'));
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a refining route lays its stages out by tier: first levels unlock tiers, and a level typed in moves the route", async () => {
  const app = await boot({ hash: "#/costmax/CRAFT_REFINE_HIDE" });
  await cmReady(app);
  const { $, $$, AB } = app;
  assert.deepEqual(stageRows(app), ["Adept Hide Tanner 0 → 1", "Adept Hide Tanner 1 → 100", "Expert Hide Tanner 1 → 100", "Master Hide Tanner 1 → 100", "Grandmaster Hide Tanner 1 → 100", "Elder Hide Tanner 1 → 100"], "maxing Adept unlocks the rest on the way");
  for (const id of ["cm-curve", "cm-heat", "cm-pace", "cm-specs", "cm-flow"]) assert.ok($(`#${id} svg`), `${id} drew`);
  assert.match($$(".cm-steps .cm-stage")[4].textContent, /not priced/, "the snapshot has no T7 hide");
  assert.match($("#page .banner.info").textContent, /Grandmaster Hide Tanner's levels/);
  assert.ok($$(".cm-steps tbody tr:not(.cm-stage)").some((r) => /Refine in Martlock/.test(r.textContent)), "refined in hide's bonus city");
  assert.match($("#page .know").textContent, /maxing Adept unlocks Expert, Master and Grandmaster/);
  /* Adept at 100: Expert's first level is a stage of its own, from refines up to T4 */
  const n = await app.renders("costmax", async () => { app.change($('input[data-node="CRAFT_REFINE_HIDE_T4"]'), 100); await cmReady(app); });
  assert.equal(n, 1, "one edit, one redraw");
  assert.equal(AB.store.get("specLevels").CRAFT_REFINE_HIDE_T4, 100);
  assert.deepEqual(stageRows(app).slice(0, 2), ["Expert Hide Tanner 0 → 1", "Expert Hide Tanner 1 → 100"]);
  assert.match($$(".cm-steps .cm-stage")[0].textContent, /unlocks T5 · any refine up to T4/);
  assert.equal($('input[data-node="CRAFT_REFINE_HIDE_T4"]').value, "100");
  app.change($('input[data-node="CRAFT_REFINE_HIDE_T5"]'), 101);
  assert.equal($('input[data-node="CRAFT_REFINE_HIDE_T5"]').value, "0", "101 isn't a level");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a link to one refining tier opens it, another line keeps the tier, and a tier at 100 says so", async () => {
  const app = await boot({ hash: "#/costmax/CRAFT_REFINE_HIDE_T6" });
  await cmReady(app);
  const { $, AB } = app;
  assert.equal($("#cm-target").value, "CRAFT_REFINE_HIDE_T6");
  assert.equal($("#cm-line").value, "CRAFT_REFINE_HIDE");
  assert.equal(AB.store.get("costMax").refine, "CRAFT_REFINE_HIDE_T6");
  assert.deepEqual(stageRows(app), ["Adept Hide Tanner 0 → 1", "Expert Hide Tanner 0 → 1", "Master Hide Tanner 0 → 1", "Master Hide Tanner 1 → 100"]);
  const line = $("#cm-line");
  line.value = "CRAFT_REFINE_WOOD";
  line.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  await until(() => $("#cm-target")?.value === "CRAFT_REFINE_WOOD_T6");
  await cmReady(app);
  assert.equal(app.w.location.hash, "#/costmax/CRAFT_REFINE_WOOD_T6");
  /* the whole line, then a tier already maxed */
  const target = $("#cm-target");
  target.value = "CRAFT_REFINE_WOOD";
  target.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  await until(() => app.w.location.hash === "#/costmax/CRAFT_REFINE_WOOD");
  await cmReady(app);
  AB.store.set("specLevels", { CRAFT_REFINE_WOOD_T6: 100 });
  await app.go("#/costmax/CRAFT_REFINE_WOOD_T6");
  await cmReady(app);
  assert.match($("#page .card .empty").textContent, /Master Wood Planer is already at 100/);
  /* a link to no refining line falls back to the last one */
  await app.go("#/costmax/CRAFT_REFINE_GOLD");
  await cmReady(app);
  assert.equal($("#cm-target").value, "CRAFT_REFINE_WOOD_T6");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("a refining stage's day is a loop from the bonus city, with a stage for each first level and each tier", async () => {
  const app = await boot({ hash: "#/costmax/CRAFT_REFINE_HIDE" });
  await cmReady(app);
  const { $, $$ } = app;
  assert.deepEqual($$('[data-seg="cm-stage"] button').map((b) => `${b.dataset.v} ${b.textContent}`), ["u4 Open T4", "l4 T4", "l5 T5", "l6 T6", "l7 T7", "l8 T8"]);
  assert.equal($('[data-seg="cm-stage"] button[aria-pressed="true"]').dataset.v, "u4", "the first stage the snapshot prices");
  assert.match(loopText(app), /Adept Hide Tanner 0 → 1, any refine up to T3/);
  const n = await app.renders("costmax", async () => { app.click($('[data-seg="cm-stage"] button[data-v="l5"]')); });
  assert.equal(n, 0, "the stage redraws only the loop");
  assert.match(loopText(app), /Expert Hide Tanner 1 → 100/);
  assert.ok($$("#cm-loop-body .cm-loop td").some((td) => /^Refine /.test(td.textContent)), "a refine stop");
  assert.ok($$("#cm-loop-body tr.cm-stop th").some((th) => /Martlock/.test(th.textContent)), "hide is refined in Martlock");
  assert.doesNotMatch(loopText(app), /\bcraft/i, "nothing is crafted");
  /* the stage on screen survives a redraw of the page */
  app.click($('[data-seg="pace"] button[data-v="30"]'));
  await cmReady(app);
  assert.equal($('[data-seg="cm-stage"] button[aria-pressed="true"]').dataset.v, "l5");
  assert.deepEqual(app.errors, []);
  app.close();
});

/* ---------- Crafting ---------- */
/* the page is done drawing once its last chart (every item in the line) is up, or it shows why it can't be */
const crReady = (app) => until(() => app.$("#cr-items .chart svg") || app.$("#page .card .empty") || app.$("[data-cr-retry]"));
/* the day's crafts: each row's item and tier */
const dayRows = (app) => app.$$("#cr-day tbody tr:not(.cr-total) .it-name").map((n) => n.textContent.trim());
const pick = (app, sel, value) => { const el = app.$(sel); el.value = value; el.dispatchEvent(new app.w.Event("change", { bubbles: true })); };
/* the plan the page should show: the engine's, with the page's settings */
function expected(AB, items) {
  const { store, spec: S, crafting: C } = AB, cr = store.get("crafting");
  const premium = store.get("premium");
  const base = { line: cr.line, top: cr.top, budget: cr.budget, focusPerDay: premium && cr.focus ? store.get("focus") : 0, levels: store.get("specLevels"), premium, fee: cr.fee, share: cr.noCap ? 1 : S.SHARE, royal: !!store.get("safeOnly") };
  const B = AB.craftKit.marketFor(cr.line, AB.state.M, () => {});
  const ranked = C.rank(B, base);
  return { ranked, best: C.money(ranked), plan: items && C.plan(B, { ...base, items, draws: 0 }) };
}

test("Crafting plans a line's best mix, and Show me the money plans the single item that earns the most", async () => {
  const app = await boot({ hash: "#/crafting" });
  await crReady(app);
  const { $, $$, AB } = app;
  assert.ok($$("#nav a").some((a) => a.textContent.includes("Crafting")));
  assert.equal($("#cr-line").value, "CRAFT_SWORDS");
  assert.equal($("#cr-item").value, "", "the best mix opens first");
  assert.equal($$(".kpi").length, 4);
  for (const id of ["cr-items", "cr-heat", "cr-weeks"]) assert.ok($(`#${id} .chart svg`), `${id} drew`);
  const { ranked, best } = expected(AB);
  const mix = AB.crafting.mixOf(ranked);
  /* the list: each item with its day, best first, and the ones the snapshot can't price apart */
  assert.deepEqual($$('#cr-item optgroup[label="One item"] option').map((o) => o.value), ranked.filter((r) => r.options).map((r) => r.id));
  assert.match($(`#cr-item option[value="${best.id}"]`).textContent, new RegExp(`^${best.name} \\(about [\\d.]+[kM] a day\\)$`));
  assert.ok($$('#cr-item optgroup[label="Not priced here"] option').some((o) => /Kingmaker/.test(o.textContent)));
  assert.match($(".cr-money-note").textContent, new RegExp(`right now ${best.name}, about`));
  /* the day is the mix's: the page's profit is the engine's */
  const want = expected(AB, mix).plan;
  assert.equal($(".kpi .k-value").textContent, AB.util.silver(want.profit));
  assert.equal(dayRows(app).length, want.dayItems.length);
  assert.equal($$("#cr-items .chart-table tbody tr").length, 1 + ranked.filter((r) => r.options).length, "the mix and every priced item");
  /* Show me the money: the item that earns the most, its plan on screen, and what it earns */
  app.click($("[data-money]"));
  await until(() => app.w.location.hash === `#/crafting/${best.id}`);
  await sleep(25);
  await crReady(app);
  await until(() => $("#toast")?.textContent);
  assert.equal($("#cr-item").value, best.id);
  assert.equal(AB.store.get("crafting").item, best.id, "remembered");
  assert.match($("#toast").textContent, new RegExp(`Show me the money: ${best.name}, about ${AB.util.silver(best.profit).replace(".", "\\.")} a day, the most of any Sword Crafter item`));
  assert.equal($("#cr-day h2").textContent, `The pick: ${best.name}`);
  assert.ok(dayRows(app).every((n) => n.startsWith(AB.cat.shortName(expected(AB, [best.id]).plan.dayItems[0].id))), "only that item's tiers");
  assert.equal($(".kpi .k-value").textContent, AB.util.silver(best.profit));
  /* pressed again on the pick: no new plan, the same answer */
  $("#toast").textContent = "";
  const n = await app.renders("crafting", async () => { app.click($("[data-money]")); });
  assert.equal(n, 0);
  assert.match($("#toast").textContent, new RegExp(best.name));
  /* back to the mix */
  await app.go($("#cr-day .card-foot a").getAttribute("href"));
  await crReady(app);
  assert.equal($("#cr-item").value, "");
  assert.equal(AB.store.get("crafting").item, "");
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Crafting's lists, settings and loop: another line, one item, a budget that re-plans and a mount that only redraws the loop", async () => {
  const app = await boot({ hash: "#/crafting" });
  await crReady(app);
  const { $, $$, AB } = app;
  /* another line opens on its best mix; an item opens its own plan */
  const other = AB.crafting.lines().find((l) => l.name === "Bag Tailor").id;
  pick(app, "#cr-line", other);
  await until(() => app.w.location.hash === `#/crafting/${other}`);
  await sleep(25);
  await crReady(app);
  assert.deepEqual([$("#cr-line").value, $("#cr-item").value, AB.store.get("crafting").line], [other, "", other]);
  await app.go("#/crafting/CRAFT_SWORDS");
  await crReady(app);
  pick(app, "#cr-item", "CRAFT_SWORDS_DUAL");
  await until(() => app.w.location.hash === "#/crafting/CRAFT_SWORDS_DUAL");
  await sleep(25);
  await crReady(app);
  assert.equal($("#cr-day h2").textContent, "The pick: Dual Swords");
  /* the budget re-plans once; a bad one is put back */
  let n = await app.renders("crafting", async () => { app.change($('input[data-k="budget"]'), 1e6); await crReady(app); });
  assert.equal(n, 1);
  assert.equal(AB.store.get("crafting").budget, 1e6);
  assert.equal($(".kpi .k-value").textContent, AB.util.silver(expected(AB, ["CRAFT_SWORDS_DUAL"]).plan.profit));
  for (const bad of [-5, ""]) {
    app.change($('input[data-k="budget"]'), bad);
    assert.equal($('input[data-k="budget"]').value, "1000000", `${JSON.stringify(bad)} isn't a budget`);
  }
  /* the highest tier */
  app.click($('[data-seg="cr-top"] button[data-v="5"]'));
  await sleep(25);
  await crReady(app);
  assert.equal(AB.store.get("crafting").top, 5);
  assert.ok(dayRows(app).length && $$("#cr-day tbody tr:not(.cr-total) .tier").every((t) => +t.textContent[0] <= 5), "nothing above T5");
  /* the mount, the Mammoth and Expand redraw only the loop */
  n = await app.renders("crafting", async () => { pick(app, "#cm-mount", "bear8"); });
  assert.equal(n, 0);
  assert.equal(AB.store.get("crafting").mount, "bear8");
  assert.match(loopText(app), /Saddled Direbear|over your mount/);
  n = await app.renders("crafting", async () => { app.click($('#cm-loop input[data-k="mammoth"]')); });
  assert.equal(n, 0);
  assert.ok($("#cm-mount").disabled);
  assert.match(loopText(app), /Filled for the Mammoth/);
  /* the sell limit off says so; Royal cities only sells in them */
  app.click($('#cr-form input[data-k="noCap"]'));
  await sleep(25);
  await crReady(app);
  assert.match($$("#page .banner.warn").map((b) => b.textContent).join(" "), /The safe daily sell limit is off/);
  app.click($('#cr-form input[data-k="royal"]'));
  await sleep(25);
  await crReady(app);
  assert.equal(AB.store.get("safeOnly"), true);
  const royal = AB.cat.ROYAL;
  for (const cell of $$("#cr-day tbody tr:not(.cr-total) td.cm-sell")) for (const city of cell.textContent.split(" · ").map((s) => s.replace(/ \d+$/, ""))) assert.ok(royal.includes(city), city);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Crafting says plainly when nothing pays or nothing can be priced, and an address it doesn't know can't break it", async () => {
  const app = await boot({ hash: "#/crafting/CRAFT_SWORDS_AVALON" });
  await crReady(app);
  const { $, AB } = app;
  assert.match($("#page .card .empty").textContent, /No Kingmaker tier can be priced from the saved snapshot/);
  /* no budget: nothing pays, and Show me the money says so */
  AB.store.set("crafting", { ...AB.store.get("crafting"), budget: 0 });
  await app.go("#/crafting/CRAFT_SWORDS");
  await crReady(app);
  assert.match($("#page .card .empty").textContent, /No Sword Crafter item pays right now/);
  assert.match($(".cr-money-note").textContent, /no money to show/);
  const n = await app.renders("crafting", async () => { app.click($("[data-money]")); });
  assert.equal(n, 0);
  assert.match($("#toast").textContent, /No Sword Crafter item pays/);
  /* an address it doesn't know opens the last line and item */
  for (const h of ["#/crafting/CRAFT_NOT_A_NODE", "#/crafting/CRAFT_TOOL_TRACKING", `#/crafting/${encodeURIComponent('"><img id="x2" src=x>')}`]) {
    await app.go(h);
    await crReady(app);
    assert.equal($("#cr-line").value, "CRAFT_SWORDS", h);
  }
  assert.equal($("#x2"), null);
  /* a doctored backup can't put markup in */
  const refused = AB.store.importAll(JSON.stringify({ app: "albion-billionaire-v2", settings: { crafting: { line: 'CRAFT_SWORDS"><img id="x3" src=x>', budget: 5e6 } } }));
  assert.equal(refused, 1);
  await app.go("#/crafting");
  await crReady(app);
  assert.equal($("#x3"), null);
  assert.deepEqual(app.errors, []);
  app.close();
});

test("Crafting and Cost to Max share a line's prices: one load serves both pages", async () => {
  const app = await boot();
  const { AB } = app;
  const extend = AB.market.extend;
  let calls = 0;
  AB.market.extend = (ids) => { calls++; return extend(ids); };
  await app.go("#/crafting");
  await crReady(app);
  for (const h of ["#/costmax/CRAFT_SWORDS_CLAYMORE", "#/crafting/CRAFT_SWORDS_DUAL", "#/costmax/CRAFT_SWORDS"]) { await app.go(h); await (h.includes("costmax") ? cmReady(app) : crReady(app)); }
  assert.equal(calls, 1);
  assert.deepEqual(app.errors, []);
  app.close();
});
