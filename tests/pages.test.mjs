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
