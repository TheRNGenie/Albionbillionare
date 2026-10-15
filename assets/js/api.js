/* Albion Online Data Project client. Free, no key, called straight from the browser.
   Docs: https://www.albion-online-data.com/  Rate limit: about 180 requests a minute. */
window.ABP = window.ABP || {};

ABP.api = (() => {
  const TTL = 5 * 60 * 1000;
  const cache = new Map();
  const ITEM_NAMES_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.txt";
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
      res = await fetch(url);
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

  async function gold() {
    const rows = await getJSON(`${host()}/api/v2/stats/gold.json?count=24`);
    return rows;
  }

  async function itemNames() {
    if (names) return names;
    if (!namesPromise) {
      namesPromise = fetch(ITEM_NAMES_URL).then((r) => r.text()).then((txt) => {
        const list = [];
        for (const line of txt.split("\n")) {
          const m = line.match(/^\s*\d+:\s*(\S+)\s*:\s*(.+?)\s*$/);
          if (m) list.push({ id: m[1], name: m[2] });
        }
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
    get server() { return server; },
    set server(v) { server = v; cache.clear(); try { localStorage.setItem("abp.server", v); } catch (e) {} },
    host, prices, index, history, gold, itemNames, nameOf,
  };
})();
