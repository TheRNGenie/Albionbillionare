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
    { id: "costmax", label: "Cost to Max", icon: "summit" },
    { id: "trust", label: "Trust", icon: "shield" },
    { id: "ledger", label: "Ledger", icon: "book" },
    { id: "alerts", label: "Alerts", icon: "bell" },
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
  /* Alerts carries a count of the price alerts that are met right now. */
  const link = (n) => `<a href="#/${n.id}" data-route="${n.id}">${icon(n.icon)}<span>${esc(n.label)}</span>${n.id === "alerts" ? '<b class="nav-badge" data-badge hidden></b>' : ""}</a>`;
  function buildNav() {
    $("#nav").innerHTML = NAV.map((n) => `${n.sep ? '<div class="nav-sep"></div>' : ""}${link(n)}`).join("");
    const mob = NAV.filter((n) => n.mobile);
    $("#bottomNav").innerHTML = mob.map((n) => `<a href="#/${n.id}" data-route="${n.id}">${icon(n.icon)}<span>${esc(n.label === "Opportunities" ? "Plays" : n.label)}</span></a>`).join("") +
      `<button type="button" id="moreBtn" aria-haspopup="dialog">${icon("menu")}<span>More</span><b class="nav-dot" data-badge-dot hidden></b></button>`;
    $("#moreSheet").innerHTML = `<div class="row between" style="margin-bottom:8px"><b>More</b><button class="icon-btn sm" type="button" id="moreClose" aria-label="Close">${icon("x")}</button></div><nav class="nav">${NAV.filter((n) => !n.mobile).map(link).join("")}</nav>`;
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
  function badges() {
    const now = Date.now(), n = store.get("alerts").filter((a) => AB.alerts.met(a, now)).length;
    document.querySelectorAll("[data-badge]").forEach((b) => { b.hidden = !n; b.textContent = n; b.setAttribute("aria-label", `${n} price alert${n === 1 ? "" : "s"} met`); });
    document.querySelectorAll("[data-badge-dot]").forEach((b) => (b.hidden = !n));
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
  /* A visit starts when the address changes (or the app opens). Pages act on one-time requests in the address
     (open a play, scroll to a section) once per visit, not again on every redraw. */
  let visit = 0;
  function route() { visit++; draw(); }
  function draw() {
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
    try { cleanup = page.render(root, { args, q, visit }) || null; }
    catch (e) { console.error(e); root.innerHTML = `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">This page hit a problem</div><div class="small">${esc(e.message)}</div></div></div>`; }
    if (changed) window.scrollTo(0, 0);
  }
  /* Re-render the current page in place (new data or settings), keeping the scroll position. */
  function rerender() {
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
  }

  /* ---------- status ---------- */
  function setStatus(mode, text) {
    const pill = $("#statusPill");
    pill.dataset.mode = mode;
    pill.querySelector(".sp-text").textContent = text;
    pill.title = mode === "live" ? `Live prices from the Albion Online Data Project, ${checked()}. Tap for data details.`
      : mode === "retry" ? `${autoErr?.message || "The last automatic reload failed."} Showing prices ${checked().replace(/^checked/, "checked at")}. Tap for data details.`
      : mode === "snapshot" ? "Saved snapshot of daily sales. Tap for why and what it means." : text;
  }
  /* "checked 2:05 PM; reloading every minute" */
  function checked() {
    const M = AB.state.M, s = every() / 1000;
    if (!M?.live) return "";
    return `checked ${AB.clock.local(M.checkedAt)}${s ? `; reloading ${s === 60 ? "every minute" : `every ${s / 60} minutes`} while the app is open` : ""}`;
  }
  function statusText(M) {
    if (!M) return "Loading";
    if (M.live) return `Live · ${M.medianAgeH != null ? ago(M.medianAgeH * 36e5).replace(" ago", "") + " old" : "now"}`;
    return `Snapshot · ${dateFull(M.asOf).replace(/, \d{4}$/, "")}`;
  }
  function sideFoot() {
    const M = AB.state.M;
    const srv = AB.cat.SERVERS.find((s) => s.id === store.get("server"))?.label || "Americas";
    const r = AB.clock.nextReset(store.get("server"));
    const maint = r.down ? `Maintenance now, back about ${AB.clock.utc(r.back)}` : `Maintenance in ${AB.clock.until(r.at - Date.now())}`;
    $("#sideFoot").innerHTML = `${esc(srv)} server · ${store.get("premium") ? "premium" : "no premium"}<br>${esc(maint)}<br>${M ? (M.live ? `Live prices, checked ${esc(AB.clock.local(M.checkedAt))}` : "Saved snapshot to " + esc(dateFull(M.asOf))) : "Loading prices"}<br><span class="muted">Not affiliated with Sandbox Interactive.</span>`;
  }

  /* ---------- reminders and alert checks ---------- */
  /* The timer reminders the player asked for go to the system (a week of them on Android, which holds them with the
     app closed) and are refreshed when the timers, the server or the focus refill change, and every hour. */
  let scheduledAt = 0;
  function scheduleReminders() {
    scheduledAt = Date.now();
    const list = AB.clock.reminders(store.get("timers"), { server: store.get("server"), perDay: store.get("focus"), days: AB.notify.native ? 7 : 1 });
    AB.notify.schedule(list).catch(() => {});
  }
  /* With a model just loaded, every alert is checked now against its prices (see engine/alerts.js); with one rebuilt
     from Data Client captures (`local`), the alerts it covers, asking the server nothing; otherwise at most every 10
     minutes. */
  const checkAlerts = (M, local = false) => { AB.alerts.check(M ? { force: true, M, local } : {}).catch(() => {}); };
  function tick() {
    sideFoot();
    badges(); // a "met" from over 48 hours ago stops counting
    AB.util.bus.emit("tick");
    if (Date.now() - scheduledAt > 36e5) scheduleReminders();
    checkAlerts(); // at most every 10 minutes (see engine/alerts.js)
  }

  /* ---------- data ---------- */
  /* One load at a time. A reload asked for during a load runs right after it; a change of server or data source
     during a load (see `invalidate`) also throws away what that load was gathering, since it may mix the two. */
  let again = null, wanted = 0, scoredFor = 0;
  function invalidate() { wanted++; AB.market.reset(); }
  async function refresh({ quiet = false } = {}) {
    if (AB.state.loading) { again = { quiet: quiet && (again ? again.quiet : true) }; return; }
    AB.state.loading = true;
    AB.state.error = null;
    newer = null; // a full load replaces an automatic reload still waiting to be shown
    askedAt = Date.now();
    const gen = wanted;
    let applied = false, loaded = null;
    const btn = $("#refreshBtn");
    btn.classList.add("spin");
    setStatus("loading", "Loading");
    progress(0.04);
    try {
      const M = await AB.market.load({ onStep: (msg, f) => { progress(f); setStatus("loading", msg); } });
      if (gen !== wanted) { again = again || { quiet: true }; return; }
      AB.state.M = loaded = M;
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
        if (loaded?.live) checkAlerts(loaded);
      }
      const next = again;
      again = null;
      if (next) refresh(next);
      else { autoFails = 0; autoErr = null; retryAt = 0; planReload(); applyCaptures(); }
    }
  }
  /* Settings that change the numbers (premium, capital, focus) re-score without reloading prices. */
  const rescore = debounce(() => {
    if (!AB.state.M) return;
    scoredFor++;
    AB.state.R = AB.scan.run(AB.state.M);
    AB.util.bus.emit("data");
    rerender();
  }, 250);

  /* ---------- automatic price reloads ---------- */
  /* With live prices on screen, current prices reload by themselves every `autoReload` seconds (Settings: every
     minute, every 5 minutes, or only with the reload button). A reload asks only for current orders, about 7
     requests (histories are kept), which keeps the app far inside the price server's limits (see api.js). Reloads stop while
     the app is hidden and catch up when it's back. A reload that fails keeps the prices on screen and tries again
     later, waiting longer each time, and never before the server allows. When the app is on the snapshot only
     because the server said slow down, or the device was offline, it goes back to live prices by itself once it can.
     New prices reach the screen at a calm moment, so the page never changes under the player: not while they type
     in a field, have a play, menu or chart tooltip open, or have text selected, and not within two seconds of a tap,
     key or scroll. Only pages that show current prices (`live: true`) are redrawn, keeping scroll position and
     keyboard focus; the others show the new prices the next time they open. */
  const CALM_MS = 2000, RETRY_MAX = 10 * 60e3;
  let autoTimer = null, autoFails = 0, autoErr = null, askedAt = 0, retryAt = 0, background = false;
  let newer = null, calmTimer = null, lastInput = 0, pressing = false;
  const every = () => (store.get("autoReload") || 0) * 1000;
  /* Plan the next reload: `every` after the last one began, or after a failed one's wait (retryAt), and never before
     the price server's limit allows (a model shown or the setting changed meanwhile doesn't cut a wait short). */
  function planReload(delay) {
    clearTimeout(autoTimer);
    autoTimer = null;
    if (!every() || document.visibilityState !== "visible" || !AB.state.M) return;
    const paused = AB.api.pausedUntil - Date.now();
    if (AB.state.M.live && AB.api.mode === "live") autoTimer = setTimeout(autoReload, Math.max(0, paused, delay ?? Math.max(askedAt + every(), retryAt) - Date.now()));
    else if (paused > 0 && store.get("dataMode") !== "snapshot") autoTimer = setTimeout(() => autoReload({ full: true }), paused);
  }
  /* One automatic reload: current prices on the live model, or (full) a whole load to get back to live prices. */
  async function autoReload({ full = false } = {}) {
    clearTimeout(autoTimer); // run early (back online), it replaces the planned one rather than adding a second
    autoTimer = null;
    if (AB.state.loading || document.visibilityState !== "visible") return; // a running load plans the next one when it ends
    AB.state.loading = true;
    background = true;
    const gen = wanted, btn = $("#refreshBtn");
    btn.classList.add("spin");
    askedAt = Date.now();
    try {
      const M = await (full ? AB.market.load() : AB.market.update());
      if (!M.live) throw new Error(M.why || "The price server can't be reached from here.");
      checkAlerts(M); // alerts don't wait for a calm moment: a notification doesn't move the page
      const scored = scoredFor; // settings changed during the scan make it stale too
      const R = await AB.scan.runSoon(M);
      autoFails = 0;
      autoErr = null;
      retryAt = 0;
      if (gen === wanted) offer({ M, R, gen, scored });
    } catch (e) {
      autoErr = e;
      autoFails++;
      retryAt = Date.now() + Math.min(every() * 2 ** autoFails, RETRY_MAX);
      if (AB.state.M?.live && gen === wanted) setStatus("retry", "Live · retrying");
    } finally {
      AB.state.loading = false;
      background = false;
      btn.classList.remove("spin");
      const next = again;
      again = null;
      if (next) refresh(next);
      else { planReload(); applyCaptures(); }
    }
  }
  /* A reload's prices wait here for a calm moment; a newer reload replaces them. A model older than the one shown or
     waiting (a capture scoring that ended after a reload's) is dropped: the newer one has its prices too. */
  function offer(n) {
    if (n.M.seq < Math.max(AB.state.M?.seq ?? 0, newer?.M.seq ?? 0)) return;
    newer = n;
    clearInterval(calmTimer);
    calmTimer = setInterval(showNewer, 500);
    showNewer();
  }
  function showNewer() {
    const n = newer;
    if (n && n.gen === wanted && !calm()) return;
    clearInterval(calmTimer);
    calmTimer = null;
    newer = null;
    if (!n || n.gen !== wanted) return;
    AB.state.M = n.M;
    AB.state.R = n.scored === scoredFor ? n.R : AB.scan.run(n.M); // the settings changed while it waited
    AB.state.error = null;
    /* captures shown while reloads are failing: the server still isn't answering, so the pill keeps saying so */
    if (autoErr && n.M.live) setStatus("retry", "Live · retrying");
    else setStatus(n.M.mode, statusText(n.M));
    sideFoot();
    AB.util.bus.emit("data");
    if (AB.pages[current]?.live) redraw();
    planReload();
  }
  /* Is the player between actions? (see above) Choices in a select are committed as they're made, so only fields
     that hold half-typed text count as busy. */
  const TYPING = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color]):not([type=file]), textarea";
  function calm() {
    if (document.visibilityState !== "visible" || Date.now() - lastInput < CALM_MS) return false;
    if (pressing && Date.now() - lastInput < 60e3) return false; // mid-drag (a lost pointerup stops counting after a minute)
    if (AB.ui.drawer.isOpen || !$("#moreSheet").hidden || document.querySelector(".tooltip.on")) return false;
    if (document.activeElement?.matches?.(TYPING)) return false;
    const sel = window.getSelection?.();
    return !(sel && !sel.isCollapsed && String(sel).trim());
  }
  /* Redraw the page with new prices, keeping the reader's place: the scroll position (rerender) and keyboard focus,
     found again by id, by the play it opens, or else by its place among the page's controls. */
  const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";
  function redraw() {
    const controls = () => [...$("#page").querySelectorAll(FOCUSABLE)];
    const a = document.activeElement, page = $("#page");
    const i = a && a !== page && page.contains(a) ? controls().indexOf(a) : -1;
    const same = i < 0 ? null : a.id ? `#${CSS.escape(a.id)}` : a.dataset.opp ? `[data-opp="${CSS.escape(a.dataset.opp)}"]` : null;
    rerender();
    if (i < 0) return;
    const el = (same ? $("#page").querySelector(same) : controls()[i]) || $("#page");
    el.focus({ preventScroll: true });
  }
  function watchInput() {
    const touched = () => (lastInput = Date.now());
    const opts = { capture: true, passive: true };
    for (const t of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(t, touched, opts);
    document.addEventListener("scroll", touched, opts); // the page or any scrolling box in it
    window.addEventListener("pointerdown", () => (pressing = true), opts);
    for (const t of ["pointerup", "pointercancel"]) window.addEventListener(t, () => (pressing = false), opts);
  }

  /* ---------- prices from the player's own Data Client (Windows app) ----------
     The Windows app sends what its Albion Data Client captures within a second of the player opening a market in game
     (desktop/main.js). Those prices go straight into the model (AB.market.withCaptures: no request to the price
     server), the alerts they cover are checked, and the plays are scored again; the result reaches the page at a calm
     moment, like a reload's. One at a time, and at most one every 2 seconds (scoring every play takes about a third
     of a second, and clicking through a market in game sends a capture every moment): captures that arrive meanwhile,
     or during a load or reload, are taken together after it. A reload never waits for this (whichever model is newer
     wins, see `offer`). While the app is hidden the captures are only kept, so scoring doesn't take processor time
     from the game, and are taken when it's shown. */
  const CAPTURE_GAP = 2000;
  let capturing = false, capTimer = null, capDone = 0;
  async function applyCaptures() {
    if (capturing || capTimer || AB.state.loading || document.visibilityState !== "visible" || !AB.market.hasCaptures()) return;
    const wait = capDone + CAPTURE_GAP - Date.now();
    if (wait > 0) { capTimer = setTimeout(() => { capTimer = null; applyCaptures(); }, wait); return; }
    const M = AB.market.withCaptures();
    if (!M) return;
    capturing = true;
    const gen = wanted, scored = scoredFor;
    try {
      checkAlerts(M, true);
      const R = await AB.scan.runSoon(M);
      if (gen === wanted) offer({ M, R, gen, scored });
    } catch (e) { console.error(e); }
    finally {
      capturing = false;
      capDone = Date.now();
      applyCaptures();
    }
  }

  /* ---------- search ---------- */
  function wireSearch() {
    const input = $("#search");
    $("#searchIcon").outerHTML = icon("search");
    AB.ui.picker(input, $("#searchList"), (id) => { input.value = ""; input.blur(); location.hash = `#/markets/${encodeURIComponent(id)}`; });
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
      if (k === "autoReload") {
        autoFails = 0;
        retryAt = 0;
        planReload();
        if (AB.state.M && !AB.state.loading) setStatus(AB.state.M.mode, statusText(AB.state.M));
      }
      if (["server", "dataMode"].includes(k)) { invalidate(); AB.api.clear().then(() => refresh()); }
      if (["timers", "server", "focus"].includes(k)) scheduleReminders();
      if (k === "alerts") badges();
      sideFoot();
    });
    window.addEventListener("hashchange", () => route());
    sideFoot();
    badges();
    scheduleReminders();
    setInterval(tick, 30e3);
    /* back on screen (a phone app resumed, a tab shown): catch up on alerts and prices and top the reminders back
       up; hidden: no price reloads */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { scheduleReminders(); checkAlerts(); applyCaptures(); }
      planReload();
    });
    /* Windows app: prices the Data Client captures, within a second (see applyCaptures) */
    window.albionDesktop?.onPrices?.((rows) => { if (AB.market.capture(rows)) applyCaptures(); });
    /* the device is back online: reload now rather than at the end of a failed reload's wait */
    window.addEventListener("online", () => {
      autoFails = 0;
      retryAt = 0;
      if (AB.state.M?.live) planReload(0);
      else if (AB.state.M && every() && store.get("dataMode") !== "snapshot") autoReload({ full: true });
    });
    /* a load waiting for the price server's limit says so */
    AB.api.on("wait", (until) => { if (AB.state.loading && !background) setStatus("loading", `Waiting ${Math.ceil((until - Date.now()) / 1000)} s for the price server`); });
    watchInput();
    try { route(); } catch (e) { console.error(e); } // a page that fails to draw must not stop the data loading
    try { await Promise.all([AB.cat.ready(), AB.conf.ready()]); }
    catch (e) {
      $("#page").insertAdjacentHTML("afterbegin", `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">The app's data files didn't load</div><div class="small">${esc(e.message)}. Reload the page to try again.</div></div></div>`);
      return;
    }
    rerender();
    refresh({ quiet: true });
  }

  return { boot, refresh, rerender, route, reschedule: scheduleReminders, reloadPrices: () => autoReload(), NAV, get page() { return current; } };
})();

AB.pages = AB.pages || {};
document.addEventListener("DOMContentLoaded", () => AB.app.boot());
