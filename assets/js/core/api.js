/* Albion Billionaire v2 — market data.
   Live: the Albion Online Data Project (free, no key, called from the player's own device; see the request budget below).
   Snapshot: the last 28 days of the saved history that ships with the app, used when the live server can't be reached
   (a blocked network, an offline phone, a preview page). Every row says which one it came from and how old it is. */
window.AB = window.AB || {};

AB.api = (() => {
  const { parseUTC, loadJSON, sleep } = AB.util;
  const store = AB.store;
  let mode = "loading";          // "live" | "snapshot" | "loading"
  let why = "";                  // why snapshot mode, in plain words
  const ev = AB.util.emitter();
  const host = () => (AB.cat.SERVERS.find((s) => s.id === store.get("server")) || AB.cat.SERVERS[0]).host;

  /* ---------- persistent cache (IndexedDB), so a reload shows the last data at once ---------- */
  const idb = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => {
      try {
        const r = indexedDB.open("ab2-cache", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => res(r.result);
        r.onerror = () => { p = null; rej(r.error); };
      } catch (e) { p = null; rej(e); }
    }));
    const tx = (m, fn) => open().then((d) => new Promise((res, rej) => {
      const t = d.transaction("kv", m), q = fn(t.objectStore("kv"));
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    return {
      get: (k) => tx("readonly", (s) => s.get(k)).catch(() => undefined),
      set: (k, v) => tx("readwrite", (s) => s.put(v, k)).catch(() => undefined),
      clear: () => tx("readwrite", (s) => s.clear()).catch(() => undefined),
      /* Drop copies saved before `cut`. History addresses carry the date, so each day writes new keys. */
      prune: (cut) => tx("readwrite", (s) => {
        const cur = s.openCursor();
        cur.onsuccess = () => { const c = cur.result; if (!c) return; if (!(c.value?.t > cut)) c.delete(); c.continue(); };
        return null;
      }).catch(() => undefined),
    };
  })();
  const mem = new Map();
  /* Older than any cache time below, so nothing pruned could still have been used. Once per session. */
  const KEEP = 24 * 36e5;
  let pruned = false;

  /* ---------- request queue: 6 at a time, identical requests shared, inside the server's limits ---------- */
  /* The price server allows 100 requests a minute and 300 every 5 minutes from one internet connection, answers
     HTTP 429 past that, and blocks a connection for 5 minutes if it keeps going after a 429 (its API docs). The app
     holds itself to about two thirds of each limit (BUDGET), counted over any minute and any 5 minutes, so the
     player's other devices and tools on the same connection keep room. A request that would go over waits. After a
     429 nothing is sent until the server's window resets: a load waits out a reset up to about a minute away and
     tries that request once more; a later reset ends the load with an error that says when. */
  const BUDGET = [[60, 60e3], [200, 300e3]]; // [requests, per milliseconds]
  const WAIT_MAX = 65e3;
  const sent = []; // when recent requests went out, oldest first
  let pausedUntil = 0; // set by a 429: nothing goes out before this
  function waitFor(now) {
    let t = pausedUntil - now;
    for (const [n, ms] of BUDGET) if (sent.length >= n) t = Math.max(t, sent[sent.length - n] + ms - now);
    return Math.max(0, t);
  }
  /* When the server's window ends. Its RateLimit-Reset header (epoch seconds) says, but a page on another origin
     usually can't read it; its message names the period ("…100 per 60 seconds…"), and its windows are whole periods
     counted from 1970, so the next one starts at the next multiple. A second of margin covers a clock running a
     little ahead of the server's. */
  async function resetOf(res) {
    const now = Date.now();
    const head = +(res.headers?.get?.("RateLimit-Reset") || 0) * 1000;
    let t;
    if (head > 0) t = head;
    else {
      const m = /per (\d+) seconds/.exec(await res.text().catch(() => ""));
      const p = (m ? +m[1] : 300) * 1000;
      t = (Math.floor(now / p) + 1) * p;
    }
    return Math.min(Math.max(t + 1000, now + 1000), now + 301e3);
  }
  const at = (t) => (AB.clock ? AB.clock.local(t) : new Date(t).toLocaleTimeString());
  function rateError(until) {
    const e = new Error(`The price server asked the app to slow down. Prices can load again at ${at(until)}.`);
    e.code = "rate";
    e.until = until;
    return e;
  }
  let active = 0;
  const waiting = [];
  const inflight = new Map();
  const slot = () => new Promise((go) => (active < 6 ? (active++, go()) : waiting.push(go)));
  const release = () => { const n = waiting.shift(); n ? n() : active--; };
  let calls = 0;
  async function fetchJSON(url, retry = true) {
    await slot();
    let res;
    try {
      for (let w = waitFor(Date.now()); w > 0; w = waitFor(Date.now())) {
        if (w > WAIT_MAX) throw rateError(Date.now() + w);
        ev.emit("wait", Date.now() + w);
        await sleep(w);
      }
      sent.push(Date.now());
      if (sent.length > BUDGET[BUDGET.length - 1][0]) sent.shift();
      calls++;
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 20000);
      try { res = await fetch(url, { cache: "no-store", signal: ctl.signal }); }
      catch (e) {
        const err = new Error("The price server can't be reached from here.");
        err.code = "blocked";
        throw err;
      } finally { clearTimeout(to); }
      /* before the slot frees, so no request waiting for it goes out in the meantime */
      if (res.status === 429) pausedUntil = Math.max(pausedUntil, await resetOf(res));
    } finally { release(); }
    if (res.status === 429) {
      if (retry && pausedUntil - Date.now() <= WAIT_MAX) return fetchJSON(url, false);
      throw rateError(pausedUntil);
    }
    if (!res.ok) throw new Error("The price server answered " + res.status + ".");
    return res.json();
  }
  /* Cached GET: a copy younger than ttl from memory or IndexedDB, else one request (shared by identical callers). */
  async function getJSON(url, ttl) {
    const now = Date.now();
    if (!pruned) { pruned = true; idb.prune(now - KEEP); }
    const m = mem.get(url);
    if (m && now - m.t < ttl) return m.v;
    if (!m) {
      const d = await idb.get(url);
      if (d && now - d.t < ttl) { mem.set(url, d); return d.v; }
    }
    if (inflight.has(url)) return inflight.get(url);
    const p = fetchJSON(url).then((v) => { const e = { t: Date.now(), v }; mem.set(url, e); idb.set(url, e); return v; }).finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }
  /* Keep URLs under about 3,000 characters. */
  function chunk(ids, max = 2600) {
    const out = [];
    let cur = [], len = 0;
    for (const id of ids) {
      if (cur.length && len + id.length + 1 > max) { out.push(cur); cur = []; len = 0; }
      cur.push(id); len += id.length + 1;
    }
    if (cur.length) out.push(cur);
    return out;
  }
  const realDate = (d) => (d && !d.startsWith("0001") ? d : null);

  /* ---------- snapshot ---------- */
  let snap = null, snapP = null;
  const loadSnap = () => snapP || (snapP = loadJSON("assets/data/v2/snapshot.json").then((s) => { snap = s; snap.t0 = Date.parse(s.start + "T00:00:00Z"); return s; }));
  function snapSeries(id, city) {
    const mi = snap.markets.indexOf(city);
    const a = snap.s[id]?.[mi];
    if (!a) return [];
    const n = snap.days, out = [];
    for (let k = 0; k < n; k++) if (a[n + k] > 0) out.push({ t: snap.t0 + k * 864e5, price: a[k], count: a[n + k] });
    return out;
  }
  const snapshotInfo = () => (snap ? { start: snap.start, end: snap.end, items: Object.keys(snap.s).length, endT: Date.parse(snap.end + "T23:59:00Z") } : null);

  /* ---------- live or snapshot? ---------- */
  async function probe() {
    const want = store.get("dataMode");
    if (want === "snapshot") { await loadSnap(); setMode("snapshot", "You chose snapshot data in Settings."); return mode; }
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(`${host()}/api/v2/stats/gold.json?count=2`, { cache: "no-store", signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error("status " + r.status);
      await r.json();
      setMode("live", "");
    } catch (e) {
      await loadSnap();
      setMode("snapshot", want === "live"
        ? "Live data is switched on, but the price server can't be reached from here."
        : "The live price server can't be reached from here, so the app is using the saved snapshot.");
    }
    return mode;
  }
  function setMode(m, w) { const changed = m !== mode; mode = m; why = w; if (changed) ev.emit("mode", m); }
  /* The live server failed partway through a load: finish that load on the snapshot. */
  async function fallback(w) { await loadSnap(); setMode("snapshot", w); }

  /* ---------- the calls the app uses ---------- */
  /* Current orders: [{id, city, quality, sell, sellDate, buy, buyDate, src}]. A copy up to maxAge old is reused
     (the automatic reload asks with maxAge 0). */
  async function prices(ids, cities = AB.cat.MARKETS, quality = 1, { maxAge = 5 * 60e3 } = {}) {
    ids = [...new Set(ids)];
    if (mode !== "live") {
      await loadSnap();
      const rows = [];
      for (const id of ids) for (const c of cities) {
        const s = snapSeries(id, c);
        if (!s.length) continue;
        const last = s[s.length - 1];
        const iso = new Date(last.t + 12 * 36e5).toISOString().slice(0, 19);
        rows.push({ id, city: c, quality, sell: c === AB.cat.BM ? 0 : last.price, sellDate: c === AB.cat.BM ? null : iso, buy: c === AB.cat.BM ? last.price : 0, buyDate: c === AB.cat.BM ? iso : null, src: "snapshot" });
      }
      return rows;
    }
    const loc = encodeURIComponent(cities.join(","));
    const parts = chunk(ids);
    const res = await Promise.all(parts.map((p) => getJSON(`${host()}/api/v2/stats/prices/${p.map(encodeURIComponent).join(",")}.json?locations=${loc}&qualities=${quality}`, maxAge)));
    const rows = res.flat().map((r) => ({
      id: r.item_id, city: r.city, quality: r.quality,
      sell: r.sell_price_min || 0, sellDate: realDate(r.sell_price_min_date),
      buy: r.buy_price_max || 0, buyDate: realDate(r.buy_price_max_date), src: "live",
    })).filter((r) => r.sell || r.buy);
    return mergeDesktop(rows, ids, cities, quality);
  }
  /* Windows app: prices the player's own Albion Data Client captured win when they're newer. */
  async function mergeDesktop(rows, ids, cities, quality) {
    if (!window.albionDesktop?.prices) return rows;
    let mine = [];
    try { mine = await window.albionDesktop.prices(ids, cities, [quality]); } catch (e) { return rows; }
    mergeClient(rows, mine, quality);
    return rows;
  }
  /* Merge the Data Client's prices ([{ id, city, sell, sellAt, buy, buyAt }], times in ms) into price rows, in
     place: a captured price replaces the row's when it was seen later, and a market with no row gets one. Its time
     keeps the milliseconds, so merging the same capture again changes nothing. Returns how many prices changed. */
  function mergeClient(rows, mine, quality = 1) {
    const key = (r) => `${r.id}|${r.city}`;
    const by = new Map(rows.map((r) => [key(r), r]));
    const newer = (t, d) => t > 0 && (!d || t > parseUTC(d));
    const iso = (t) => new Date(t).toISOString().slice(0, 23);
    let n = 0;
    for (const m of mine) {
      let r = by.get(key(m));
      const sell = m.sell > 0 && newer(m.sellAt, r?.sellDate), buy = m.buy > 0 && newer(m.buyAt, r?.buyDate);
      if (!sell && !buy) continue;
      if (!r) { r = { id: m.id, city: m.city, quality, sell: 0, sellDate: null, buy: 0, buyDate: null, src: "client" }; rows.push(r); by.set(key(r), r); }
      if (sell) { r.sell = Math.round(m.sell); r.sellDate = iso(m.sellAt); n++; }
      if (buy) { r.buy = Math.round(m.buy); r.buyDate = iso(m.buyAt); n++; }
      r.src = "client";
    }
    return n;
  }
  const index = (rows) => { const m = {}; for (const r of rows) (m[r.id] = m[r.id] || {})[r.city] = r; return m; };

  /* Daily sales history: map[id][city] = [{t, price, count}] oldest first, completed days only. Kept per item and
     market (dayMem), so a reload whose scan adds a few items fetches only those, and requests list items in a fixed
     order so the same items always make the same request. */
  const DAY_TTL = 3 * 36e5;
  const dayMem = new Map();
  async function daily(ids, cities = AB.cat.MARKETS, days = 28) {
    ids = [...new Set(ids)];
    const out = {};
    if (mode !== "live") {
      await loadSnap();
      for (const id of ids) for (const c of cities) { const s = snapSeries(id, c).slice(-days); if (s.length) (out[id] = out[id] || {})[c] = s; }
      return out;
    }
    const today = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const from = new Date(today - days * 864e5).toISOString().slice(0, 10);
    const key = (id, c) => `${host()}|${from}|${id}|${c}`;
    const now = Date.now();
    const fresh = (id, c) => now - (dayMem.get(key(id, c))?.t ?? 0) < DAY_TTL;
    const need = ids.filter((id) => !cities.every((c) => fresh(id, c))).sort();
    if (need.length) {
      const loc = encodeURIComponent(cities.join(","));
      const res = await Promise.all(chunk(need, 2000).map((p) => getJSON(`${host()}/api/v2/stats/history/${p.map(encodeURIComponent).join(",")}.json?locations=${loc}&qualities=1&time-scale=24&date=${from}`, DAY_TTL)));
      const got = {};
      for (const r of res.flat()) {
        const pts = (r.data || []).map((p) => ({ t: parseUTC(p.timestamp), price: p.avg_price, count: p.item_count }))
          .filter((p) => p.count > 0 && p.price > 0 && p.t < today).sort((a, b) => a.t - b.t);
        const m = (got[r.item_id] = got[r.item_id] || {});
        if (!m[r.location] || pts.length > m[r.location].length) m[r.location] = pts;
      }
      const t = Date.now();
      for (const id of need) for (const c of cities) dayMem.set(key(id, c), { t, pts: got[id]?.[c] || [] });
    }
    for (const id of ids) for (const c of cities) {
      const pts = dayMem.get(key(id, c))?.pts;
      if (pts?.length) (out[id] = out[id] || {})[c] = pts;
    }
    return out;
  }
  /* Hourly sales for the last week or so: [{t, price, count}] (live only). */
  async function hourly(id, city) {
    if (mode !== "live") return [];
    const rows = await getJSON(`${host()}/api/v2/stats/history/${encodeURIComponent(id)}.json?locations=${encodeURIComponent(city)}&qualities=1&time-scale=1`, 30 * 60e3);
    const r = rows.find((x) => x.location === city) || rows[0];
    return (r?.data || []).map((p) => ({ t: parseUTC(p.timestamp), price: p.avg_price, count: p.item_count }));
  }
  /* Gold price, hourly points [{t, price}] (live only). */
  async function gold(count = 24 * 14) {
    if (mode !== "live") return [];
    const rows = await getJSON(`${host()}/api/v2/stats/gold.json?count=${count}`, 10 * 60e3);
    return rows.map((r) => ({ t: parseUTC(r.timestamp), price: r.price })).sort((a, b) => a.t - b.t);
  }

  /* Forget every saved copy (the rate limits still apply: clearing doesn't let the app ask again any sooner). */
  async function clear() { mem.clear(); dayMem.clear(); await idb.clear(); }

  return {
    probe, fallback, prices, mergeClient, index, daily, hourly, gold, clear, loadSnap, snapshotInfo, host, BUDGET,
    on: (e, fn) => ev.on(e, fn),
    get mode() { return mode; }, get why() { return why; }, get calls() { return calls; },
    /* when the server's rate limit lets requests go out again (0 or a past time: now) */
    get pausedUntil() { return pausedUntil; },
  };
})();
