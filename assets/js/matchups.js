/* Albion Billionaire: the Matchup tab.
   Data comes from Murder Ledger (murderledger.com, now part of Albion Online 2D), which tallies every 1v1 kill on the
   official killboard. Its API is open source (MIT, gitlab.com/albion-murder-ledger/api):
     /api/weapon-matrix                 7-day weapon vs weapon wins and losses (stalker 900-1100 IP and 1200+ IP fights)
     /api/weapon-matrix?slayer=true     the same, only fights where both sides were above 1200 IP
     /api/builds/<dataset>              most used 1v1 builds over 7 days: 1v1_stalker_7_day, 1v1_high_ip_7_day, 1v1_high_elo_7_day
   Murder Ledger turns away requests from cloud servers and its API only allows browser pages from its own site, so the
   app asks for the data from the player's own device when they press Load: the Windows app through its main process,
   the Android app through native HTTP. In a plain browser, or if Murder Ledger says no, the player can open the five
   links themselves and import the saved files. Nothing is fetched until they ask. */
window.ABP = window.ABP || {};

ABP.matchups = (() => {
  const HOSTS = {
    west: ["murderledger.albiononline2d.com", "murderledger.com"],
    europe: ["murderledger-europe.albiononline2d.com"],
    east: ["murderledger-asia.albiononline2d.com"],
  };
  const MATRICES = [
    { key: "all", path: "/api/weapon-matrix", label: "All 1v1", about: "Every solo 1v1 kill of the last 7 days where both players were at stalker power (900 to 1100 IP) or both above 1200 IP." },
    { key: "slayer", path: "/api/weapon-matrix?slayer=true", label: "Slayer", about: "Only 1v1 kills of the last 7 days where both players were above 1200 IP." },
  ];
  const BUILDS = [
    { key: "1v1_stalker_7_day", path: "/api/builds/1v1_stalker_7_day", label: "Stalker", about: "1v1 fights of the last 7 days with both players at 900 to 1100 IP. Murder Ledger lists builds used more than 100 times." },
    { key: "1v1_high_ip_7_day", path: "/api/builds/1v1_high_ip_7_day", label: "Slayer", about: "1v1 fights of the last 7 days with both players above 1200 IP. Builds used more than 100 times." },
    { key: "1v1_high_elo_7_day", path: "/api/builds/1v1_high_elo_7_day", label: "Top rated", about: "Slayer 1v1 fights of the last 7 days by players in the top 500 of Murder Ledger's 1v1 rating. Builds used more than 50 times." },
  ];
  const SLOTS = ["main_hand", "off_hand", "head", "body", "shoe", "cape"];
  const SLOT_LABEL = ["Weapon", "Off-hand", "Head", "Armor", "Shoes", "Cape"];
  const KEY = "data";
  const GAP = 700; /* Murder Ledger allows 2 requests a second */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const urls = (server) => (HOSTS[server] || HOSTS.west).map((h) => [...MATRICES, ...BUILDS].map((s) => ({ key: s.key, url: "https://" + h + s.path })));

  /* ---------- Saved data ----------
     A full set is a few megabytes, more than localStorage holds, so it lives in IndexedDB. */
  const db = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open("abp-matchups", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => { p = null; rej(r.error); };
    }));
    const tx = (mode, fn) => open().then((d) => new Promise((res, rej) => {
      const t = d.transaction("kv", mode), q = fn(t.objectStore("kv"));
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    return { get: (k) => tx("readonly", (s) => s.get(k)), set: (k, v) => tx("readwrite", (s) => s.put(v, k)), del: (k) => tx("readwrite", (s) => s.delete(k)) };
  })();
  let data = null;
  const ready = db.get(KEY).then((v) => { data = v || null; }).catch(() => { data = null; });
  const save = () => db.set(KEY, data).then(() => true, () => false);
  const empty = () => ({ at: 0, source: "", server: "", m: {}, b: {}, names: {}, upd: {} });

  /* ---------- Reading Murder Ledger's answers ---------- */
  function kindOf(j) {
    if (j && j.matrix && typeof j.matrix === "object") return { kind: "matrix", key: j.name === "slayer" ? "slayer" : "all" };
    if (j && Array.isArray(j.builds) && j.metric_name) return { kind: "builds", key: String(j.metric_name).split(".")[0] };
    return null;
  }
  /* Matrix cells become [wins, losses] of the row weapon against the column weapon. */
  function packMatrix(j) {
    const out = {};
    for (const [a, row] of Object.entries(j.matrix || {})) {
      if (!a) continue;
      const r = {};
      for (const [b, c] of Object.entries(row || {})) if (b && c && (c.wins || c.losses)) r[b] = [c.wins | 0, c.losses | 0];
      out[a] = r;
    }
    return out;
  }
  /* A build becomes [main, off, head, body, shoe, cape, uses, kills, deaths, average IP, fame ratio]. */
  function packBuilds(j, names) {
    return (j.builds || []).map((s) => {
      const b = s.build || {};
      const ids = SLOTS.map((k) => { const it = b[k] || {}; if (it.type && it.en_name) names[it.type] = it.en_name; return it.type || ""; });
      return [...ids, s.usages | 0, s.kills | 0, s.deaths | 0, Math.round(s.average_item_power || s.averageItemPower || 0), s.fame_ratio == null ? null : +(+s.fame_ratio).toFixed(2)];
    }).filter((r) => r[0]);
  }
  function add(target, j) {
    const k = kindOf(j);
    if (!k) return null;
    if (k.kind === "matrix") target.m[k.key] = packMatrix(j);
    else target.b[k.key] = packBuilds(j, target.names);
    if (j.last_update) target.upd[k.key] = j.last_update;
    return k;
  }

  /* ---------- Fetching, only when the player presses Load ---------- */
  async function getJSON(url) {
    if (window.albionDesktop?.murderLedger) return window.albionDesktop.murderLedger(url);
    let res;
    try { res = await fetch(url, { cache: "no-store", credentials: "omit" }); } catch (e) {
      const err = new Error("blocked"); err.code = "blocked"; throw err;
    }
    if (!res.ok) { const err = new Error("Murder Ledger answered " + res.status + "."); err.status = res.status; throw err; }
    return res.json();
  }
  async function download(server, onStep) {
    const lists = urls(server);
    let lastErr = null;
    for (const list of lists) {
      const got = empty(), fails = [];
      for (let i = 0; i < list.length; i++) {
        onStep?.(i, list.length);
        try {
          const k = add(got, await getJSON(list[i].url));
          if (!k) fails.push(list[i].key);
        } catch (e) {
          lastErr = e;
          fails.push(list[i].key);
          if (i === 0) break; /* this address doesn't work at all; try the next one */
        }
        if (i < list.length - 1) await sleep(GAP);
      }
      if (got.m.all || got.m.slayer) {
        got.at = Date.now(); got.server = server; got.source = new URL(list[0].url).host; got.fails = fails;
        data = got;
        return { ok: true, saved: await save(), fails };
      }
    }
    throw lastErr || new Error("Murder Ledger sent nothing the app could read.");
  }
  /* Import files or pasted text the player saved from the five links. Adds to what's already there. */
  async function importJSON(texts, server) {
    const next = data && data.server === server ? JSON.parse(JSON.stringify(data)) : empty();
    const done = [], bad = [];
    for (const t of texts) {
      let j = null;
      try { j = JSON.parse(t.text); } catch (e) { bad.push(t.name || "pasted text"); continue; }
      const k = add(next, j);
      k ? done.push(k.key) : bad.push(t.name || "pasted text");
    }
    if (done.length) { next.at = Date.now(); next.server = server; next.source = "import"; data = next; }
    return { done, bad, saved: done.length ? await save() : true };
  }
  function clear() { data = null; return db.del(KEY).catch(() => {}); }

  /* ---------- Numbers ---------- */
  /* Wilson 95% interval: a 60% record over 15 fights proves less than 55% over 900. */
  function wilson(w, n) {
    if (!n) return [0, 1];
    const z = 1.96, p = w / n, d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n), s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return [(c - s) / d, (c + s) / d];
  }
  function weapons(mKey) {
    const M = data?.m?.[mKey] || {};
    return Object.keys(M).map((id) => {
      let w = 0, l = 0;
      for (const [o, [a, b]] of Object.entries(M[id])) if (o !== id) { w += a; l += b; }
      const n = w + l;
      return { id, w, l, n, p: n ? w / n : 0, ci: wilson(w, n) };
    });
  }
  function matchups(id, mKey, minN) {
    const row = data?.m?.[mKey]?.[id] || {};
    const all = Object.entries(row).filter(([o]) => o !== id).map(([o, [w, l]]) => ({ o, w, l, n: w + l, p: (w + l) ? w / (w + l) : 0, ci: wilson(w, w + l) }));
    const rows = all.filter((r) => r.n >= minN);
    const best = rows.slice().sort((a, b) => b.ci[0] - a.ci[0] || b.n - a.n);
    const worst = rows.slice().sort((a, b) => a.ci[1] - b.ci[1] || b.n - a.n);
    return { all, rows, best, worst };
  }
  function builds(bKey, id) {
    return (data?.b?.[bKey] || []).filter((r) => r[0] === id).map((r) => {
      const n = r[6], k = r[7];
      return { items: r.slice(0, 6), n, kills: k, deaths: r[8], ip: r[9], fr: r[10], p: n ? k / n : 0, ci: wilson(k, n) };
    });
  }
  function topBuilds(bKey) {
    return (data?.b?.[bKey] || []).map((r) => ({ items: r.slice(0, 6), n: r[6], kills: r[7], deaths: r[8], ip: r[9], fr: r[10], p: r[6] ? r[7] / r[6] : 0, ci: wilson(r[7], r[6]) }));
  }

  return {
    ready, HOSTS, MATRICES, BUILDS, SLOT_LABEL, urls, download, importJSON, clear, wilson, weapons, matchups, builds, topBuilds,
    get data() { return data; },
  };
})();

/* ---------- The tab ---------- */
(() => {
  const M = ABP.matchups;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p, d = 0) => (p * 100).toFixed(d) + "%";
  const num = (n) => Math.round(n).toLocaleString("en-US");
  const st = { weapon: "", m: "all", b: "1v1_high_ip_7_day", min: 20 };
  try { Object.assign(st, JSON.parse(localStorage.getItem("abp.matchups.view") || "{}")); } catch (e) {}
  const keep = () => { try { localStorage.setItem("abp.matchups.view", JSON.stringify(st)); } catch (e) {} };
  const server = () => ABP.api?.server || "west";
  const serverLabel = () => (ABP.SERVERS || []).find((s) => s.id === server())?.label || "Americas";

  /* Names: Murder Ledger's own names first (they come with the builds), then the app's item list. */
  let appNames = null;
  ABP.api?.itemNames?.().then((list) => { appNames = new Map(list.map((x) => [x.id, x.name])); if (!$("#panel-matchups").hidden) paint(); }).catch(() => {});
  function nameOf(id) {
    if (!id) return "";
    const n = M.data?.names?.[id] || appNames?.get("T8_" + id) || appNames?.get("T4_" + id);
    if (n) return n.replace(/^Elder's /, "");
    return id.replace(/^(MAIN|2H|OFF)_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  /* Weapon line (Swords, Bows, ...) from the bundled recipe categories, labelled like the Crafting tab. */
  let cats = null;
  fetch("assets/data/recipes.json").then((r) => r.json()).then((j) => { cats = j.c || {}; if (!$("#panel-matchups").hidden && st.weapon) paint(); }).catch(() => {});
  const catLabel = (k) => (ABP.crafting?.CATS || []).find((c) => c.key === k)?.label || (k ? k[0].toUpperCase() + k.slice(1) : "Other");
  const lineOf = (id) => cats?.["T8_" + id] || cats?.["T4_" + id] || "";
  const icon = (id, size = 40, alt = "") => id
    ? `<img class="mu-ico" src="https://render.albiononline.com/v1/item/T8_${encodeURIComponent(id)}.png?size=${size * 2}" width="${size}" height="${size}" alt="${esc(alt)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'mu-ico mu-ico-x',textContent:'?'}))">`
    : `<span class="mu-ico mu-ico-x" style="width:${size}px;height:${size}px" aria-hidden="true"></span>`;

  function render() {
    const p = $("#panel-matchups");
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Matchups</span>
        <h2>What your weapon beats, and what beats it</h2>
        <p>Pick a weapon to see the weapons it wins against most often in 1v1 fights, the ones it loses to, and the builds players run with it. Numbers are last week's solo kills on the killboard, tallied by Murder Ledger.</p>
      </div>
      <div class="box stack" id="mu-src"></div>
      <div id="mu-out" class="stack"></div>`;
    $("#mu-src").innerHTML = `<p class="small muted">Opening saved matchup data…</p>`;
    M.ready.then(() => { paintSource(); paint(); });
  }

  /* Where the data came from, and the Load and Import controls. */
  function paintSource() {
    const d = M.data, box = $("#mu-src");
    const age = d?.at ? Math.round((Date.now() - d.at) / 36e5) : null;
    const desktop = !!window.albionDesktop?.murderLedger, native = !!window.Capacitor?.isNativePlatform?.();
    const links = M.urls(server())[0];
    box.innerHTML = `
      <div class="row spread">
        <div><h3>Murder Ledger data</h3>
          <p class="small muted">${d?.at ? `Loaded ${age < 1 ? "under an hour" : age < 48 ? age + " h" : Math.round(age / 24) + " days"} ago for the ${esc((ABP.SERVERS || []).find((s) => s.id === d.server)?.label || d.server)} server${d.source === "import" ? ", from files you imported" : ""}. Murder Ledger refreshes these tallies about once a day.` : "Nothing loaded yet. The app only contacts Murder Ledger when you press Load."}</p></div>
        <div class="row"><button class="btn" type="button" id="mu-load">${d?.at ? "Reload" : "Load"} from Murder Ledger</button>
          <button class="btn ghost" type="button" id="mu-imp-open" aria-expanded="false">Import files</button></div>
      </div>
      <p class="small muted" id="mu-msg" aria-live="polite">Uses the ${esc(serverLabel())} server (change it on the Market tab). ${desktop || native ? "" : "A web browser may not be allowed to load Murder Ledger directly; if Load fails, use Import files."}</p>
      <div id="mu-imp" class="stack" hidden>
        <p class="small">Open each link, save the page (Ctrl+S, or long-press and share on a phone), then pick all the saved files here. You can also copy a page's text and paste it below. Import adds to what's loaded, so you can do one link at a time.</p>
        <ol class="small mu-links">${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url.replace("https://", ""))}</a></li>`).join("")}</ol>
        <div class="row"><label class="field"><span>Saved files</span><input type="file" id="mu-files" accept=".json,application/json,text/plain" multiple></label></div>
        <label class="field"><span>Or paste one page's text</span><textarea id="mu-paste" rows="3" spellcheck="false"></textarea></label>
        <div class="row"><button class="btn" type="button" id="mu-paste-go">Import pasted text</button>${d?.at ? `<button class="btn ghost" type="button" id="mu-clear">Clear saved data</button>` : ""}</div>
      </div>`;
    const msg = (t) => { $("#mu-msg").textContent = t; };
    $("#mu-imp-open").addEventListener("click", (e) => { const o = $("#mu-imp").hidden; $("#mu-imp").hidden = !o; e.target.setAttribute("aria-expanded", String(o)); });
    $("#mu-load").addEventListener("click", async (e) => {
      const btn = e.target; btn.disabled = true;
      try {
        const r = await M.download(server(), (i, n) => msg(`Loading ${i + 1} of ${n} from Murder Ledger…`));
        paintSource();
        msg(`Loaded.${r.fails.length ? " Some build lists didn't come through: " + r.fails.join(", ") + "." : ""}${r.saved ? "" : " This device couldn't save it, so the data lasts until you close the app."}`);
        paint();
      } catch (err) {
        btn.disabled = false;
        const why = err.code === "blocked" ? "This browser isn't allowed to read Murder Ledger directly." : err.status === 403 ? "Murder Ledger turned the request away." : err.message;
        msg(why + " Use Import files instead: open the links in your browser and import what they show.");
        $("#mu-imp").hidden = false; $("#mu-imp-open").setAttribute("aria-expanded", "true");
      }
    });
    $("#mu-files").addEventListener("change", async (e) => {
      const texts = await Promise.all([...e.target.files].map(async (f) => ({ name: f.name, text: await f.text() })));
      done(await M.importJSON(texts, server()));
    });
    $("#mu-paste-go").addEventListener("click", async () => {
      const t = $("#mu-paste").value.trim();
      if (!t) return msg("Paste a page's text first.");
      done(await M.importJSON([{ text: t }], server()));
    });
    $("#mu-clear")?.addEventListener("click", async () => { await M.clear(); paintSource(); paint(); });
    function done(r) {
      paintSource();
      const names = r.done.map((k) => [...M.MATRICES, ...M.BUILDS].find((s) => s.key === k)?.label + (M.MATRICES.some((s) => s.key === k) ? " matchups" : " builds"));
      msg((r.done.length ? "Imported " + names.join(", ") + "." : "") + (r.bad.length ? " Couldn't read " + r.bad.join(", ") + ": it isn't one of the five Murder Ledger pages." : "") + (r.saved ? "" : " This device couldn't save it, so it lasts until you close the app."));
      if (r.done.length) { $("#mu-imp").hidden = false; paint(); }
    }
  }

  function paint() {
    const out = $("#mu-out"), d = M.data;
    if (!d || !(d.m.all || d.m.slayer)) {
      out.innerHTML = d && Object.keys(d.b).length ? `<p class="notice">Builds are loaded. Import one of the two weapon matrix pages to see matchups.</p>${buildsOverview()}` : "";
      wireBuildTabs();
      return;
    }
    if (!d.m[st.m]) st.m = d.m.all ? "all" : "slayer";
    const list = M.weapons(st.m).filter((w) => w.n > 0).sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)));
    if (st.weapon && !list.some((w) => w.id === st.weapon)) st.weapon = "";
    out.innerHTML = `
      <div class="box">
        <div class="controls mu-controls">
          <label class="field"><span>Weapon</span><input id="mu-w" list="mu-wl" placeholder="Type a weapon, e.g. Bloodletter" value="${esc(st.weapon ? nameOf(st.weapon) : "")}" autocomplete="off"></label>
          <datalist id="mu-wl">${list.map((w) => `<option value="${esc(nameOf(w.id))}"></option>`).join("")}</datalist>
          <div class="field"><span>Fights</span><div class="chips" role="group" aria-label="Fights">${M.MATRICES.filter((s) => d.m[s.key]).map((s) => `<button class="chip" type="button" data-m="${s.key}" aria-pressed="${st.m === s.key}" title="${esc(s.about)}">${esc(s.label)}</button>`).join("")}</div></div>
          <label class="field"><span>Ignore matchups under</span><select id="mu-min">${[5, 10, 20, 50, 100].map((n) => `<option value="${n}" ${st.min === n ? "selected" : ""}>${n} fights</option>`).join("")}</select></label>
          ${st.weapon ? `<div class="field"><span>&nbsp;</span><button class="btn ghost" type="button" id="mu-x">Show all weapons</button></div>` : ""}
        </div>
        <p class="small muted">${esc(M.MATRICES.find((s) => s.key === st.m).about)}</p>
      </div>
      <div id="mu-view" class="stack">${st.weapon ? weaponView(st.weapon) : overview(list)}</div>`;
    const pick = (v) => {
      const hit = list.find((w) => nameOf(w.id).toLowerCase() === v.trim().toLowerCase());
      if (hit) { st.weapon = hit.id; keep(); paint(); window.scrollTo({ top: $("#mu-out").offsetTop - 120, behavior: "smooth" }); }
    };
    $("#mu-w").addEventListener("change", (e) => pick(e.target.value));
    $("#mu-w").addEventListener("input", (e) => { if (list.some((w) => nameOf(w.id).toLowerCase() === e.target.value.trim().toLowerCase())) pick(e.target.value); });
    out.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { st.m = b.dataset.m; keep(); paint(); }));
    $("#mu-min").addEventListener("change", (e) => { st.min = +e.target.value; keep(); paint(); });
    $("#mu-x")?.addEventListener("click", () => { st.weapon = ""; keep(); paint(); });
    out.querySelectorAll("[data-w]").forEach((b) => b.addEventListener("click", () => { st.weapon = b.dataset.w; keep(); paint(); window.scrollTo({ top: $("#mu-out").offsetTop - 120, behavior: "smooth" }); }));
    wireBuildTabs();
  }

  /* A bar centred on 50%: it grows right in green for a winning record, left in red for a losing one. */
  function bar(p, ci) {
    const left = Math.min(p, 0.5) * 100, width = Math.abs(p - 0.5) * 100;
    return `<span class="mu-track" aria-hidden="true"><span class="mu-ci" style="left:${(ci[0] * 100).toFixed(1)}%;width:${((ci[1] - ci[0]) * 100).toFixed(1)}%"></span><span class="mu-fill ${p >= 0.5 ? "good" : "bad"}" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></span><span class="mu-mid"></span></span>`;
  }
  function mRow(r, side) {
    const sure = side === "best" ? r.ci[0] > 0.5 : r.ci[1] < 0.5;
    return `<li class="mu-row"><button type="button" class="linkish mu-who" data-w="${esc(r.o)}" title="See ${esc(nameOf(r.o))}'s matchups">${icon(r.o, 32)}<span class="mu-name">${esc(nameOf(r.o))}</span></button>
      ${bar(r.p, r.ci)}<span class="mu-val ${r.p >= 0.5 ? "good" : "bad"}">${pct(r.p)}</span><span class="small muted mu-n">${num(r.n)} fights${sure ? "" : " · close"}</span></li>`;
  }

  function weaponView(id) {
    const d = M.data, all = M.weapons(st.m).find((w) => w.id === id) || { w: 0, l: 0, n: 0, p: 0, ci: [0, 1] };
    const mu = M.matchups(id, st.m, st.min);
    const best = mu.best.filter((r) => r.p > 0.5).slice(0, 8), worst = mu.worst.filter((r) => r.p < 0.5).slice(0, 8);
    const clearWins = mu.rows.filter((r) => r.ci[0] > 0.5).length, clearLosses = mu.rows.filter((r) => r.ci[1] < 0.5).length;
    const ring = (p) => { const c = 2 * Math.PI * 42; return `<svg class="mu-ring" viewBox="0 0 100 100" role="img" aria-label="Win rate ${pct(p)}"><circle cx="50" cy="50" r="42" class="mu-ring-bg"/><circle cx="50" cy="50" r="42" class="mu-ring-fg ${p >= 0.5 ? "good" : "bad"}" stroke-dasharray="${(p * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/><text x="50" y="50" class="mu-ring-t">${pct(p)}</text><text x="50" y="66" class="mu-ring-s">wins</text></svg>`; };
    /* Record against each weapon line, from every matchup (small ones too, since lines pool many fights). */
    const lines = new Map();
    for (const r of mu.all) { const k = lineOf(r.o) || "other"; const g = lines.get(k) || { w: 0, n: 0 }; g.w += r.w; g.n += r.n; lines.set(k, g); }
    const lineRows = [...lines.entries()].filter(([, g]) => g.n >= st.min).map(([k, g]) => ({ k, ...g, p: g.w / g.n })).sort((a, b) => b.p - a.p);
    const tone = (p) => { const t = Math.min(1, Math.abs(p - 0.5) / 0.2); return `--mu-t:${Math.round(12 + t * 48)}%`; };
    return `
      <section class="box mu-hero">
        <div class="mu-hero-id">${icon(id, 72, nameOf(id))}<div><span class="label">${esc(catLabel(lineOf(id)))}</span><h3>${esc(nameOf(id))}</h3>
          <p class="small muted">${num(all.n)} 1v1 fights last week · ${num(all.w)} won, ${num(all.l)} lost</p></div></div>
        ${ring(all.p)}
        <div class="stats mu-hero-stats">
          <div class="stat"><span class="label">Clearly beats</span><span class="v good">${clearWins}</span><span class="small muted">weapons, with ${st.min}+ fights</span></div>
          <div class="stat"><span class="label">Clearly loses to</span><span class="v bad">${clearLosses}</span><span class="small muted">weapons</span></div>
          <div class="stat"><span class="label">Matchups counted</span><span class="v">${mu.rows.length}</span><span class="small muted">of ${mu.all.length} weapons met</span></div>
        </div>
      </section>
      <div class="mu-cols">
        <section class="box"><h3 class="good">Best against</h3><p class="small muted">Highest win rate it can count on. "Close" means the record could still be luck.</p>
          ${best.length ? `<ol class="mu-list">${best.map((r) => mRow(r, "best")).join("")}</ol>` : `<p class="small">No winning matchup with ${st.min}+ fights. Lower the fight count above.</p>`}</section>
        <section class="box"><h3 class="bad">Worst against</h3><p class="small muted">Lowest win rate, most certain first. Avoid these or bring a counter.</p>
          ${worst.length ? `<ol class="mu-list">${worst.map((r) => mRow(r, "worst")).join("")}</ol>` : `<p class="small">No losing matchup with ${st.min}+ fights.</p>`}</section>
      </div>
      ${lineRows.length ? `<section class="box"><h3>Against each weapon line</h3><p class="small muted">All fights against every weapon of that line added together.</p>
        <div class="mu-lines">${lineRows.map((g) => `<div class="mu-line ${g.p >= 0.5 ? "good" : "bad"}" style="${tone(g.p)}"><span class="mu-line-n">${esc(g.k === "other" ? "Other" : catLabel(g.k))}</span><span class="mu-line-p">${pct(g.p)}</span><span class="small muted">${num(g.n)}</span></div>`).join("")}</div></section>` : ""}
      ${buildSection(id)}
      ${foot()}`;
  }

  function overview(list) {
    const ranked = list.filter((w) => w.n >= 100);
    const top = ranked.slice().sort((a, b) => b.ci[0] - a.ci[0]).slice(0, 10);
    const low = ranked.slice().sort((a, b) => a.ci[1] - b.ci[1]).slice(0, 10);
    const played = list.slice().sort((a, b) => b.n - a.n).slice(0, 12);
    const row = (w) => `<li class="mu-row"><button type="button" class="linkish mu-who" data-w="${esc(w.id)}">${icon(w.id, 32)}<span class="mu-name">${esc(nameOf(w.id))}</span></button>${bar(w.p, w.ci)}<span class="mu-val ${w.p >= 0.5 ? "good" : "bad"}">${pct(w.p)}</span><span class="small muted mu-n">${num(w.n)} fights</span></li>`;
    return `
      <p class="notice">Type a weapon above, or tap one below, to see its matchups and builds.</p>
      <div class="mu-cols">
        <section class="box"><h3 class="good">Winning the most this week</h3><p class="small muted">Weapons with 100+ fights, ranked by the win rate they can count on.</p><ol class="mu-list">${top.map(row).join("")}</ol></section>
        <section class="box"><h3 class="bad">Losing the most this week</h3><p class="small muted">Same weapons, lowest win rate first.</p><ol class="mu-list">${low.map(row).join("")}</ol></section>
      </div>
      <section class="box"><h3>Most played</h3><div class="mu-played">${played.map((w) => `<button type="button" class="mu-tile" data-w="${esc(w.id)}">${icon(w.id, 48)}<span class="mu-name">${esc(nameOf(w.id))}</span><span class="small muted">${num(w.n)} fights · ${pct(w.p)}</span></button>`).join("")}</div></section>
      ${buildsOverview()}
      ${foot()}`;
  }

  /* Builds, in Murder Ledger's three settings: stalker, slayer and top-rated players. */
  function buildTabs() {
    const have = M.BUILDS.filter((s) => M.data?.b?.[s.key]);
    if (!have.length) return "";
    if (!have.some((s) => s.key === st.b)) st.b = have[0].key;
    return `<div class="chips" role="tablist" aria-label="Build setting">${have.map((s) => `<button class="chip" type="button" role="tab" data-b="${s.key}" aria-pressed="${st.b === s.key}" aria-selected="${st.b === s.key}">${esc(s.label)}</button>`).join("")}</div>
      <p class="small muted">${esc(M.BUILDS.find((s) => s.key === st.b).about)}</p>`;
  }
  function buildCard(b, tag) {
    return `<li class="mu-build">
      <div class="mu-kit">${b.items.map((it, i) => it ? `<span class="mu-slot" title="${esc(M.SLOT_LABEL[i] + ": " + nameOf(it))}">${icon(it, 44, nameOf(it))}<span class="mu-slot-n">${esc(nameOf(it))}</span></span>` : `<span class="mu-slot mu-slot-empty" title="${M.SLOT_LABEL[i]}: none">${icon("", 44)}<span class="mu-slot-n muted">No ${M.SLOT_LABEL[i].toLowerCase()}</span></span>`).join("")}</div>
      <div class="mu-build-stats">${tag ? `<span class="pill good">${esc(tag)}</span>` : ""}
        <span><span class="label">Win rate</span> <strong class="${b.p >= 0.5 ? "good" : "bad"}">${pct(b.p, 1)}</strong></span>
        <span><span class="label">Used</span> ${num(b.n)}</span><span><span class="label">K / D</span> ${num(b.kills)} / ${num(b.deaths)}</span>
        ${b.ip ? `<span><span class="label">Avg IP</span> ${num(b.ip)}</span>` : ""}${b.fr != null ? `<span><span class="label">Fame ratio</span> ${b.fr}</span>` : ""}</div></li>`;
  }
  function buildSection(id) {
    const tabs = buildTabs();
    if (!tabs) return `<section class="box"><h3>Builds</h3><p class="small">No build lists loaded. Load from Murder Ledger, or import its build pages.</p></section>`;
    const list = M.builds(st.b, id);
    const bestI = list.length ? list.reduce((bi, b, i, a) => (b.ci[0] > a[bi].ci[0] ? i : bi), 0) : -1;
    const shown = list.slice(0, 6);
    if (bestI >= 6) shown.unshift(list[bestI]);
    return `<section class="box stack" id="mu-builds"><div class="row spread"><h3>Builds with ${esc(nameOf(id))}</h3></div>${tabs}
      ${list.length ? `<ol class="mu-builds">${shown.map((b) => buildCard(b, b === list[bestI] ? "Best record" : b === list[0] ? "Most played" : "")).join("")}</ol>
        <p class="small muted">Sorted by how often each build was used, like Murder Ledger. "Best record" is the build whose win rate holds up best given how often it was used.</p>`
      : `<p class="small">No ${esc(nameOf(id))} build was used often enough to make this list. Try another setting.</p>`}</section>`;
  }
  function buildsOverview() {
    const tabs = buildTabs();
    if (!tabs) return "";
    const all = M.topBuilds(st.b);
    const best = all.slice().sort((a, b) => b.ci[0] - a.ci[0]).slice(0, 6);
    return `<section class="box stack" id="mu-builds"><h3>Builds winning the most</h3>${tabs}
      <ol class="mu-builds">${best.map((b) => buildCard(b, "")).join("")}</ol>
      <p class="small muted">Top 6 by the win rate each build can count on, given how often it was used.</p></section>`;
  }
  function wireBuildTabs() {
    document.querySelectorAll("#mu-builds [data-b]").forEach((b) => b.addEventListener("click", () => {
      st.b = b.dataset.b; keep();
      const el = $("#mu-builds");
      el.outerHTML = st.weapon && M.data?.m?.[st.m] ? buildSection(st.weapon) : buildsOverview();
      wireBuildTabs();
    }));
  }
  const foot = () => `<p class="small muted">Data from <a href="https://murderledger.albiononline2d.com/" target="_blank" rel="noopener">Murder Ledger</a> by David Findley (Albion Online 2D), built from Albion's official killboard. Win rates count solo 1v1 kills only, so group fights, ganks and zone type are not in them. The bar's faint band is the range the true win rate likely falls in.</p>`;

  ABP.renderMatchups = render;
})();
