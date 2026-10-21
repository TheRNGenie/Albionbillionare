/* Albion Billionaire v2 — shared helpers: DOM, formatting, icons, events. Everything hangs off window.AB. */
window.AB = window.AB || {};

AB.util = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  /* Escape text for HTML templates. Every string that came from data or the player goes through this. */
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const raf = (fn) => { let q = false; return (...a) => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(...a); }); }; };

  /* ---------- numbers ---------- */
  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const int = (v) => (v == null || !isFinite(v) ? "—" : nf0.format(Math.round(v)));
  /* Silver: 1,234 · 12.3k · 4.56M · 1.02B. Signed when asked. */
  function silver(v, { sign = false, digits = null } = {}) {
    if (v == null || !isFinite(v)) return "—";
    if (v === 0) return "0";
    const a = Math.abs(v), s = v < 0 ? "−" : sign && v > 0 ? "+" : "";
    let out;
    if (a >= 1e9) out = (a / 1e9).toFixed(digits ?? (a >= 1e10 ? 1 : 2)) + "B";
    else if (a >= 1e6) out = (a / 1e6).toFixed(digits ?? (a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)) + "M";
    else if (a >= 1e4) out = (a / 1e3).toFixed(digits ?? (a >= 1e5 ? 0 : 1)) + "k";
    else if (a >= 100) out = nf0.format(Math.round(a));
    else out = a.toFixed(digits ?? (a >= 10 ? 0 : a >= 1 ? 1 : 2));
    return s + out;
  }
  const pct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : (v * 100).toFixed(d) + "%");
  const spct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(d) + "%");

  /* ---------- time ---------- */
  const H = 36e5, D = 864e5;
  const parseUTC = (iso) => (iso ? Date.parse(iso + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? "" : "Z")) : NaN);
  function ago(ms) {
    if (ms == null || !isFinite(ms)) return "unknown age";
    const a = Math.max(0, ms);
    if (a < 60e3) return "just now";
    if (a < H) return Math.round(a / 60e3) + " min ago";
    if (a < 48 * H) return Math.round(a / H) + " h ago";
    return Math.round(a / D) + " days ago";
  }
  const ageText = (ms) => (ms == null || !isFinite(ms) ? "unknown" : ms < H ? Math.max(1, Math.round(ms / 60e3)) + " min" : ms < 48 * H ? Math.round(ms / H) + " h" : Math.round(ms / D) + " d");
  /* Dates print in UTC, the game's server time. Daily sales are stamped 00:00 UTC, so local time would show them a
     day early west of Greenwich (and a month start as the month before). */
  const fmt = (o) => { const f = new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }); return (t) => f.format(new Date(t)); };
  const date = fmt({ month: "short", day: "numeric" });
  const dateFull = fmt({ month: "short", day: "numeric", year: "numeric" });
  const month = fmt({ month: "short" });
  const monthYear = fmt({ month: "long", year: "numeric" });

  /* ---------- events ---------- */
  /* A listener added while an event is being delivered waits for the next one, and one removed before its turn is
     skipped: a page that re-renders on a change (and so swaps its listener) can't be called again in the same pass. */
  function emitter() {
    const m = new Map();
    return {
      on(ev, fn) { (m.get(ev) || m.set(ev, new Set()).get(ev)).add(fn); return () => m.get(ev)?.delete(fn); },
      emit(ev, ...a) {
        const set = m.get(ev);
        if (!set) return;
        for (const fn of [...set]) {
          if (!set.has(fn)) continue;
          try { fn(...a); } catch (e) { console.error(e); }
        }
      },
    };
  }
  const bus = emitter();

  /* ---------- icons: 24px stroke icons drawn for this app ---------- */
  const P = {
    command: '<path d="M4 18h16M5 18l-1-9 5 4 3-7 3 7 5-4-1 9"/><circle cx="12" cy="6" r="0.6"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="16.5" cy="9" r="1.2" fill="currentColor" stroke="none"/>',
    flask: '<path d="M9 3h6M10 3v6L4.8 18.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9V3"/><path d="M7.5 15h9"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M7 15l4-5 3 3 5-7"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    book: '<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M5 16a4 4 0 0 1 4-4h10"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
    half: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    stop: '<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z"/><path d="M9 9l6 6M15 9l-6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    anvil: '<path d="M4 8h12c0 2.5 2 3.5 4 3.5V8"/><path d="M4 8c0 3 2 4 5 4h6"/><path d="M10 12v4M14 12v4M7 20l1.5-4h7L17 20z"/>',
    hammer: '<path d="M14 6l4 4M12.5 7.5l-8 8a1.4 1.4 0 0 0 2 2l8-8"/><path d="M13 4l7 7 1.5-1.5-7-7z"/>',
    wave: '<path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><path d="M3 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0" opacity="0.5"/>',
    band: '<path d="M3 17l5-6 4 4 4-7 5 5"/><path d="M3 12l5-5 4 3 4-5 5 4" opacity="0.45"/>',
    skull: '<path d="M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M11 16h2"/>',
    myth: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    table: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 10h17M3.5 14.5h17M9 5v14"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    scale: '<path d="M12 4v16M6 20h12"/><path d="M5 8h14"/><path d="M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z"/>',
  };
  const icon = (name, cls = "") => `<svg class="${cls}" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`;

  /* ---------- small UI bits ---------- */
  let toastTimer;
  function toast(msg, ms = 3200) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), ms);
  }
  let progEl;
  function progress(frac) {
    if (!progEl) { progEl = document.createElement("div"); progEl.className = "progress"; progEl.innerHTML = "<i></i>"; document.body.appendChild(progEl); }
    const i = progEl.firstChild;
    if (frac == null || frac >= 1) { i.style.width = "100%"; setTimeout(() => { i.style.transition = "none"; i.style.width = "0"; requestAnimationFrame(() => (i.style.transition = "")); }, 350); return; }
    i.style.width = Math.max(4, frac * 100) + "%";
  }

  /* Load a JSON file that ships with the app. Pages built into one file can preload them on window.AB_DATA. */
  const jsonCache = new Map();
  function loadJSON(path) {
    if (window.AB_DATA && window.AB_DATA[path]) return Promise.resolve(window.AB_DATA[path]);
    if (!jsonCache.has(path)) jsonCache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); }).catch((e) => { jsonCache.delete(path); throw e; }));
    return jsonCache.get(path);
  }

  /* An Albion item id, such as T4_BAG or T6_PLANKS@2. Ids arrive from links and backup files, so pages check them. */
  const isItem = (id) => typeof id === "string" && /^[A-Z0-9_@]{2,80}$/.test(id);

  /* A plugin of the Android app (Capacitor), or null in a browser and the Windows app. */
  const isNative = () => !!window.Capacitor?.isNativePlatform?.();
  const plugin = (n) => (isNative() ? window.Capacitor.Plugins?.[n] || window.Capacitor.registerPlugin?.(n) || null : null);

  /* Save text as a file: a normal download in browsers and the Windows app; in the Android app, where web downloads
     don't work, the file is written to the app's cache and handed to the share sheet. */
  async function saveFile(name, text, type = "application/json") {
    if (plugin("Filesystem") && plugin("Share")) {
      const res = await plugin("Filesystem").writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
      await plugin("Share").share({ title: name, url: res.uri, dialogTitle: "Save your backup" });
      return "shared";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return "downloaded";
  }

  return { $, esc, clamp, sleep, debounce, raf, int, silver, pct, spct, H, D, parseUTC, ago, ageText, date, dateFull, month, monthYear, emitter, bus, icon, toast, progress, loadJSON, saveFile, isItem, nativePlugin: plugin };
})();
