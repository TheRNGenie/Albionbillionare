/* Albion Billionaire v2 — the app: navigation, the top bar, loading and refreshing data, and page routing.
   Pages live in assets/js/pages and register themselves on AB.pages. */
window.AB = window.AB || {};

AB.state = { M: null, R: null, error: null, loading: false };

AB.app = (() => {
  const { $, esc, icon, toast, progress, ago, dateFull, debounce } = AB.util;
  const store = AB.store;
  const NAV = [
    { id: "command", label: "Command", icon: "command", mobile: true },
    { id: "opps", label: "Opportunities", icon: "radar", mobile: true },
    { id: "lab", label: "Edge Lab", icon: "flask", mobile: true },
    { id: "markets", label: "Markets", icon: "chart", mobile: true },
    { id: "planner", label: "Planner", icon: "target" },
    { id: "trust", label: "Trust", icon: "shield" },
    { id: "ledger", label: "Ledger", icon: "book" },
    { id: "settings", label: "Settings", icon: "gear", sep: true },
  ];
  let current = null, cleanup = null;

  /* ---------- theme ---------- */
  function applyTheme() {
    const t = store.get("theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    const dark = t === "dark" || (t !== "light" && !matchMedia("(prefers-color-scheme: light)").matches);
    $("#themeBtn").innerHTML = icon(dark ? "sun" : "moon");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#0b0d10" : "#f3f1ec";
    /* The Android app draws under the status bar: light icons on the dark theme, dark icons on the light one. */
    const bars = AB.util.nativePlugin("SystemBars");
    if (bars) Promise.resolve().then(() => bars.setStyle({ style: dark ? "DARK" : "LIGHT" })).catch(() => {});
  }
  function toggleTheme() {
    const t = store.get("theme");
    const dark = t === "dark" || (t !== "light" && !matchMedia("(prefers-color-scheme: light)").matches);
    store.set("theme", dark ? "light" : "dark");
  }

  /* ---------- navigation ---------- */
  function buildNav() {
    $("#nav").innerHTML = NAV.map((n) => `${n.sep ? '<div class="nav-sep"></div>' : ""}<a href="#/${n.id}" data-route="${n.id}">${icon(n.icon)}<span>${esc(n.label)}</span></a>`).join("");
    const mob = NAV.filter((n) => n.mobile);
    $("#bottomNav").innerHTML = mob.map((n) => `<a href="#/${n.id}" data-route="${n.id}">${icon(n.icon)}<span>${esc(n.label === "Opportunities" ? "Plays" : n.label)}</span></a>`).join("") +
      `<button type="button" id="moreBtn" aria-haspopup="dialog">${icon("menu")}<span>More</span></button>`;
    $("#moreSheet").innerHTML = `<div class="row between" style="margin-bottom:8px"><b>More</b><button class="icon-btn sm" type="button" id="moreClose" aria-label="Close">${icon("x")}</button></div><nav class="nav">${NAV.filter((n) => !n.mobile).map((n) => `<a href="#/${n.id}" data-route="${n.id}">${icon(n.icon)}<span>${esc(n.label)}</span></a>`).join("")}</nav>`;
    const sheet = $("#moreSheet"), more = $("#moreBtn");
    const show = (on) => {
      sheet.hidden = !on;
      sheet.classList.toggle("on", on);
      more.setAttribute("aria-expanded", String(on));
      if (on) sheet.querySelector("a")?.focus();
    };
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", () => show(sheet.hidden));
    $("#moreClose").addEventListener("click", () => { show(false); more.focus(); });
    sheet.addEventListener("click", (e) => { if (e.target.closest("a")) show(false); });
    sheet.addEventListener("keydown", (e) => { if (e.key === "Escape") { show(false); more.focus(); } });
  }
  function markNav(id) {
    document.querySelectorAll("[data-route]").forEach((a) => (a.dataset.route === id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  }

  /* A hand-typed or cut-off link can hold a broken escape (a stray %): keep that part as typed instead of failing. */
  const decode = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = h.split("?");
    const parts = path.split("/").filter(Boolean).map(decode);
    const q = Object.fromEntries(new URLSearchParams(query));
    return { id: AB.pages[parts[0]] ? parts[0] : "command", args: parts.slice(1), q };
  }
  function route() {
    const { id, args, q } = parseHash();
    const page = AB.pages[id];
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    AB.ui.drawer.close(true);
    AB.ui.sweep(true);
    const changed = current !== id;
    current = id;
    markNav(id);
    $("#topTitle").textContent = page.title;
    document.title = `${page.title} · Albion Billionaire v2`;
    /* Each render gets a fresh, empty page element. Pages attach their click and change handlers to it, so those
       leave with the old element instead of piling up on one that every page shares. */
    const old = $("#page");
    const root = old.cloneNode(false);
    old.replaceWith(root);
    root.dataset.page = id;
    try { cleanup = page.render(root, { args, q }) || null; }
    catch (e) { console.error(e); root.innerHTML = `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">This page hit a problem</div><div class="small">${esc(e.message)}</div></div></div>`; }
    if (changed) window.scrollTo(0, 0);
  }
  /* Re-render the current page in place (new data or settings), keeping the scroll position. */
  function rerender() {
    const y = window.scrollY;
    route();
    window.scrollTo(0, y);
  }

  /* ---------- status ---------- */
  function setStatus(mode, text) {
    const pill = $("#statusPill");
    pill.dataset.mode = mode;
    pill.querySelector(".sp-text").textContent = text;
    pill.title = mode === "live" ? "Live prices from the Albion Online Data Project. Tap for data details." : mode === "snapshot" ? "Saved snapshot of daily sales. Tap for why and what it means." : text;
  }
  function statusText(M) {
    if (!M) return "Loading";
    if (M.live) return `Live · ${M.medianAgeH != null ? ago(M.medianAgeH * 36e5).replace(" ago", "") + " old" : "now"}`;
    return `Snapshot · ${dateFull(M.asOf).replace(/, \d{4}$/, "")}`;
  }
  function sideFoot() {
    const M = AB.state.M;
    const srv = AB.cat.SERVERS.find((s) => s.id === store.get("server"))?.label || "Americas";
    $("#sideFoot").innerHTML = `${esc(srv)} server · ${store.get("premium") ? "premium" : "no premium"}<br>${M ? (M.live ? "Live prices" : "Saved snapshot to " + esc(dateFull(M.asOf))) : "Loading prices"}<br><span class="muted">Not affiliated with Sandbox Interactive.</span>`;
  }

  /* ---------- data ---------- */
  /* One load at a time. A reload asked for during a load runs right after it; a change of server or data source
     during a load (see `invalidate`) also throws away what that load was gathering, since it may mix the two. */
  let again = null, wanted = 0;
  function invalidate() { wanted++; AB.market.reset(); }
  async function refresh({ quiet = false } = {}) {
    if (AB.state.loading) { again = { quiet: quiet && (again ? again.quiet : true) }; return; }
    AB.state.loading = true;
    AB.state.error = null;
    const gen = wanted;
    let applied = false;
    const btn = $("#refreshBtn");
    btn.classList.add("spin");
    setStatus("loading", "Loading");
    progress(0.04);
    try {
      const M = await AB.market.load({ onStep: (msg, f) => { progress(f); setStatus("loading", msg); } });
      if (gen !== wanted) { again = again || { quiet: true }; return; }
      AB.state.M = M;
      AB.state.R = AB.scan.run(M);
      applied = true;
      progress(1);
      setStatus(M.mode, statusText(M));
      if (!quiet) toast(M.live ? `Live prices loaded: ${AB.state.R.opps.length} plays scored.` : `Using the saved snapshot: ${AB.state.R.opps.length} plays scored.`);
    } catch (e) {
      if (gen !== wanted) { again = again || { quiet: true }; return; }
      console.error(e);
      AB.state.error = e;
      applied = true;
      progress(1);
      setStatus("snapshot", "No data");
      toast(e.message || "Couldn't load prices.");
    } finally {
      AB.state.loading = false;
      btn.classList.remove("spin");
      if (applied) {
        sideFoot();
        AB.util.bus.emit("data");
        rerender();
      }
      const next = again;
      again = null;
      if (next) refresh(next);
    }
  }
  /* Settings that change the numbers (premium, capital, focus) re-score without reloading prices. */
  const rescore = debounce(() => {
    if (!AB.state.M) return;
    AB.state.R = AB.scan.run(AB.state.M);
    AB.util.bus.emit("data");
    rerender();
  }, 250);

  /* ---------- search ---------- */
  function wireSearch() {
    const input = $("#search"), list = $("#searchList");
    $("#searchIcon").outerHTML = icon("search");
    let items = [], sel = -1;
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); sel = -1; };
    const go = (id) => { close(); input.value = ""; input.blur(); location.hash = `#/markets/${encodeURIComponent(id)}`; };
    const draw = () => {
      list.innerHTML = items.length ? items.map((it, i) => `<button type="button" role="option" data-id="${esc(it.id)}" aria-selected="${i === sel}">${AB.ui.item(it.id, { sub: esc(it.id), small: true })}</button>`).join("") : `<div class="empty">No item matches that.</div>`;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    input.addEventListener("input", debounce(() => {
      const q = input.value.trim();
      if (!q) return close();
      items = AB.cat.search(q, 12);
      sel = -1;
      draw();
    }, 120));
    input.addEventListener("keydown", (e) => {
      if (list.hidden) return;
      if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { const it = items[sel >= 0 ? sel : 0]; if (it) go(it.id); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    list.addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b) go(b.dataset.id); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) close(); });
  }

  async function boot() {
    applyTheme();
    buildNav();
    $("#refreshBtn").innerHTML = icon("refresh");
    $("#refreshBtn").addEventListener("click", () => { AB.api.clear().then(() => refresh()); });
    $("#themeBtn").addEventListener("click", toggleTheme);
    $("#statusPill").addEventListener("click", () => (location.hash = "#/trust?s=data"));
    /* the skip link moves focus without touching the hash, which is the router's */
    document.querySelector(".skip")?.addEventListener("click", (e) => { e.preventDefault(); $("#page").focus(); });
    wireSearch();
    store.on("change:theme", applyTheme);
    matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { applyTheme(); if (store.get("theme") === "auto") rerender(); });
    store.on("change", (k) => {
      if (["premium", "capital", "focus", "refineSpec", "mountKg"].includes(k)) rescore();
      if (["server", "dataMode"].includes(k)) { invalidate(); AB.api.clear().then(() => refresh()); }
      sideFoot();
    });
    window.addEventListener("hashchange", route);
    sideFoot();
    try { route(); } catch (e) { console.error(e); } // a page that fails to draw must not stop the data loading
    try { await Promise.all([AB.cat.ready(), AB.conf.ready()]); }
    catch (e) {
      $("#page").insertAdjacentHTML("afterbegin", `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">The app's data files didn't load</div><div class="small">${esc(e.message)}. Reload the page to try again.</div></div></div>`);
      return;
    }
    rerender();
    refresh({ quiet: true });
  }

  return { boot, refresh, rerender, route, NAV, get page() { return current; } };
})();

AB.pages = AB.pages || {};
document.addEventListener("DOMContentLoaded", () => AB.app.boot());
