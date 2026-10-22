/* Albion Billionaire v2 — price alerts. An alert is an item, a market, a rule and a price: tell me when the cheapest
   listing is at or under the price (time to buy), or when the best buy order is at or over it (time to sell). Alerts
   are checked against live prices whenever they load, so with every automatic reload, and every 10 minutes while the
   app is open; in the Windows app also as its Data Client captures prices. One fires when a price seen in the last 48
   hours meets it, then at most once every 6 hours while it stays met, so an old listing or a price that sits at the
   line can't fire it over and over. */
window.AB = window.AB || {};

AB.alerts = (() => {
  const EVERY = 10 * 6e4, QUIET = 6 * 36e5, FRESH_H = 48;
  const { parseUTC, int, ago } = AB.util;

  /* The price a rule reads (sell listings for "below", buy orders for "above") and when it was seen. */
  function priceFor(a, row) {
    if (!row) return { price: null, seen: null };
    const above = a.kind === "above";
    const price = (above ? row.buy : row.sell) || null;
    const seen = parseUTC(above ? row.buyDate : row.sellDate);
    return { price, seen: price && isFinite(seen) ? seen : null };
  }
  /* Given the alerts and price rows indexed [id][city], the alerts with their new state and the ones that fire now.
     `covered` says which alerts the rows were fetched for; any other alert (added while they loaded) is left as it was
     rather than read as "no price". */
  function evaluate(list, idx, now = Date.now(), covered = () => true) {
    const fired = [];
    const next = list.map((a) => {
      if (!covered(a)) return a;
      const { price, seen } = priceFor(a, idx[a.id]?.[a.city]);
      const fresh = price != null && seen != null && now - seen <= FRESH_H * 36e5;
      const hit = fresh && (a.kind === "above" ? price >= a.price : price <= a.price);
      const b = { ...a, last: price, seen, checked: now, hit };
      if (hit && now - (a.firedAt || 0) >= QUIET) { b.firedAt = now; fired.push(b); }
      return b;
    });
    return { list: next, fired };
  }

  /* Met as of a check in the last 48 hours: an older "met" (the app was offline or on the snapshot since) is left out
     of the badge and shown as waiting. */
  const met = (a, now = Date.now()) => a.hit && a.checked != null && now - a.checked <= FRESH_H * 36e5;

  const title = (a) => `${AB.cat.label(a.id)} in ${a.city}`;
  const body = (a, now = Date.now()) => `${a.kind === "above" ? "Buy order at" : "Listed at"} ${int(a.last)} silver, ${a.kind === "above" ? "at or over" : "at or under"} your ${int(a.price)} (seen ${ago(now - a.seen)}).`;

  let busy = null, lastRun = 0;
  /* Check every alert against live prices and notify for the ones that fire. Resolves to { live:false } without live
     prices, to null when there's nothing to do or the last check was under 10 minutes ago (unless forced), and to
     { checked, met, fired } otherwise. A forced check asked for during another one runs right after it, so an alert
     added meanwhile is checked too. Given M, a live model just loaded, alerts on items it scanned read its prices
     and only the others ask the server (fresh, not from the cache), so a reload's check usually costs no request.
     `local` (a model just rebuilt with Data Client captures) checks only the alerts M covers and asks nothing, and
     leaves the 10-minute check of the others as it was. */
  function check({ force = false, M = null, local = false } = {}) {
    if (busy) return force ? busy.catch(() => {}).then(() => check({ force, M, local })) : busy;
    const list = AB.store.get("alerts");
    if (!list.length) return Promise.resolve(null);
    if (AB.api.mode !== "live") return Promise.resolve({ live: false });
    if (!force && Date.now() - lastRun < EVERY - 5000) return Promise.resolve(null);
    const scanned = M?.live ? new Set(M.U.all) : null;
    const inM = (a) => !!scanned && scanned.has(a.id) && AB.cat.MARKETS.includes(a.city);
    if (local && !list.some(inM)) return Promise.resolve(null);
    const run = async () => {
      const ask = local ? [] : list.filter((a) => !inM(a));
      const ids = new Set(ask.map((a) => a.id)), cities = new Set(ask.map((a) => a.city));
      const got = AB.api.index(ask.length ? await AB.api.prices([...ids], [...cities], 1, M ? { maxAge: 0 } : {}) : []);
      /* the list again: the player may have added or removed an alert while the prices loaded */
      const cur = AB.store.get("alerts"), idx = {};
      for (const a of cur) { const r = (inM(a) ? M.P : got)[a.id]?.[a.city]; if (r) (idx[a.id] ||= {})[a.city] = r; }
      const res = evaluate(cur, idx, Date.now(), (a) => inM(a) || (ids.has(a.id) && cities.has(a.city)));
      AB.store.set("alerts", res.list);
      if (!local) lastRun = Date.now();
      for (const a of res.fired) await AB.notify.send(title(a), body(a), { id: AB.notify.ALERT_ID + res.list.indexOf(a) });
      AB.util.bus.emit("alerts");
      return { checked: res.list.length, met: res.list.filter((a) => a.hit).length, fired: res.fired.length };
    };
    /* Cleared once the check has settled, never inside it: a check that asks nothing and fires nothing finishes
       before it could be stored, and clearing from inside would leave it in `busy` for good, so every later forced
       check would wait on it again and again without end. */
    const p = run().finally(() => { if (busy === p) busy = null; });
    busy = p;
    return p;
  }

  /* The usual 80% range for an item in a market today, from four weeks of its daily sales: a starting point for an
     alert's price (its low end to buy, its high end to sell). Null when there isn't enough history. */
  async function usual(id, city) {
    const M = AB.state.M;
    if (!M) return null;
    const hist = await AB.api.daily([id], [city], 28);
    const st = AB.conf.seriesStats(hist[id]?.[city] || [], M.asOf);
    return st.pred ? AB.conf.range(st, M.h0) : null;
  }

  return { evaluate, check, usual, met, title, body, EVERY, QUIET, FRESH_H };
})();
