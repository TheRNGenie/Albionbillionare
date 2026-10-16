/* Albion Online Data Project client. Free, no key, called straight from the browser.
   Docs: https://www.albion-online-data.com/  Rate limit: about 180 requests a minute. */
window.ABP = window.ABP || {};

ABP.api = (() => {
  const TTL = 5 * 60 * 1000;
  const cache = new Map();
  // Item names ship with the app (built by tools/build_names.py) so nothing is fetched from GitHub.
  const ITEM_NAMES_URL = "assets/data/names.json";
  let server = "west";
  let names = null;
  let namesPromise = null;

  try { server = localStorage.getItem("abp.server") || server; } catch (e) {}

  function host() {
    return (ABP.SERVERS.find((s) => s.id === server) || ABP.SERVERS[0]).host;
  }

  async function getJSON(url) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < TTL) return hit.v;
    let res;
    try {
      // no-store: this file keeps its own 5-minute cache, so a refresh must never get a stale copy from the HTTP cache.
      res = await fetch(url, { cache: "no-store" });
    } catch (e) {
      const err = new Error("This page cannot reach the price server. Open the app from its GitHub Pages address to load live prices.");
      err.code = "blocked";
      throw err;
    }
    if (res.status === 429) {
      const err = new Error("The price server is rate limiting requests. Wait a minute and refresh.");
      err.code = "rate";
      throw err;
    }
    if (!res.ok) throw new Error("The price server answered " + res.status + ". Try again shortly.");
    const v = await res.json();
    cache.set(url, { t: Date.now(), v });
    return v;
  }

  /* Albion's own game info API (official, public): character search and lifetime fame.
     It has no bank, silver or spec data. Some browsers block it from other sites; the app then offers paste-in. */
  const character = {
    base() { return (ABP.SERVERS.find((s) => s.id === server) || ABP.SERVERS[0]).gameinfo + "/api/gameinfo"; },
    searchUrl(name) { return this.base() + "/search?q=" + encodeURIComponent(name); },
    playerUrl(id) { return this.base() + "/players/" + encodeURIComponent(id); },
    async get(url) {
      let res;
      try { res = await fetch(url); } catch (e) {
        const err = new Error("Your browser blocked the call to Albion's character server from this page.");
        err.code = "blocked"; err.url = url; throw err;
      }
      if (!res.ok) { const err = new Error("Albion's character server answered " + res.status + ". It is often slow; try again shortly."); err.url = url; throw err; }
      return res.json();
    },
    async search(name) { const r = await this.get(this.searchUrl(name)); return r.players || []; },
    player(id) { return this.get(this.playerUrl(id)); },
  };

  /* Split item ids into chunks that keep URLs under about 3,500 characters. */
  function chunk(ids) {
    const out = [];
    let cur = [];
    let len = 0;
    for (const id of ids) {
      if (cur.length && len + id.length + 1 > 3000) { out.push(cur); cur = []; len = 0; }
      cur.push(id);
      len += id.length + 1;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  const isDate = (d) => d && !d.startsWith("0001");

  async function prices(ids, locations, qualities = [1]) {
    const loc = encodeURIComponent(locations.join(","));
    const parts = chunk([...new Set(ids)]);
    const results = await Promise.all(parts.map((p) =>
      getJSON(`${host()}/api/v2/stats/prices/${p.map(encodeURIComponent).join(",")}.json?locations=${loc}&qualities=${qualities.join(",")}`)
    ));
    return results.flat().map((r) => ({
      id: r.item_id,
      city: r.city,
      quality: r.quality,
      sell: r.sell_price_min || 0,
      sellDate: isDate(r.sell_price_min_date) ? r.sell_price_min_date : null,
      buy: r.buy_price_max || 0,
      buyDate: isDate(r.buy_price_max_date) ? r.buy_price_max_date : null,
    }));
  }

  /* Index rows as map[id][city] = row. */
  function index(rows) {
    const m = {};
    for (const r of rows) (m[r.id] = m[r.id] || {})[r.city] = r;
    return m;
  }

  async function history(id, locations, quality = 1) {
    const loc = encodeURIComponent(locations.join(","));
    const rows = await getJSON(`${host()}/api/v2/stats/history/${encodeURIComponent(id)}.json?locations=${loc}&qualities=${quality}&time-scale=24`);
    return rows.map((r) => ({ city: r.location, data: (r.data || []).slice(-7) }));
  }

  /* Hourly sales history (about the last week): [{t: Date, price, count}] for one item and market. */
  async function hourly(id, city, quality = 1) {
    const rows = await getJSON(`${host()}/api/v2/stats/history/${encodeURIComponent(id)}.json?locations=${encodeURIComponent(city)}&qualities=${quality}&time-scale=1`);
    const r = rows.find((x) => x.location === city) || rows[0];
    return (r?.data || []).map((p) => ({ t: new Date(p.timestamp + (p.timestamp.endsWith("Z") ? "" : "Z")), price: p.avg_price, count: p.item_count }));
  }

  /* 7-day sales per item and market: map[id][city] = { sold, perDay, avg }. */
  async function volumes(ids, locations, quality = 1) {
    const loc = encodeURIComponent(locations.join(","));
    const parts = chunk([...new Set(ids)]);
    const results = await Promise.all(parts.map((p) =>
      getJSON(`${host()}/api/v2/stats/history/${p.map(encodeURIComponent).join(",")}.json?locations=${loc}&qualities=${quality}&time-scale=24`)
    ));
    const out = {};
    for (const r of results.flat()) {
      const data = (r.data || []).slice(-7);
      const sold = data.reduce((s, p) => s + p.item_count, 0);
      const avg = sold ? data.reduce((s, p) => s + p.avg_price * p.item_count, 0) / sold : null;
      const prev = (out[r.item_id] = out[r.item_id] || {})[r.location];
      if (!prev || sold > prev.sold) out[r.item_id][r.location] = { sold, perDay: data.length ? sold / 7 : 0, avg };
    }
    return out;
  }

  async function gold(count = 24) {
    const rows = await getJSON(`${host()}/api/v2/stats/gold.json?count=${count}`);
    return rows;
  }

  async function itemNames() {
    if (names) return names;
    if (!namesPromise) {
      namesPromise = (window.ABP_NAMES ? Promise.resolve(window.ABP_NAMES) : fetch(ITEM_NAMES_URL).then((r) => r.json())).then((rows) => {
        const list = rows.map(([id, name]) => ({ id, name }));
        names = list;
        return list;
      }).catch((e) => { namesPromise = null; throw e; });
    }
    return namesPromise;
  }

  function nameOf(id) {
    if (!names) return null;
    const hit = names.find((n) => n.id === id);
    return hit ? hit.name : null;
  }

  return {
    character,
    hourly,
    clearCache() { cache.clear(); },
    get server() { return server; },
    set server(v) { server = v; cache.clear(); try { localStorage.setItem("abp.server", v); } catch (e) {} },
    host, prices, index, history, volumes, gold, itemNames, nameOf,
  };
})();
