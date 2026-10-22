/* Albion Billionaire v2 — shared UI pieces: cards with a chart/table switch, confidence badges, meters and range bars,
   item tokens, the detail drawer and small control helpers. Pages build HTML strings with these, then mount charts. */
window.AB = window.AB || {};

AB.ui = (() => {
  const { esc, icon, silver } = AB.util;

  /* ---------- cards ---------- */
  function card({ id = "", title = "", sub = "", body = "", actions = "", foot = "", cls = "", span = 12, kicker = "" }) {
    const head = title || actions || kicker
      ? `<div class="card-head"><div class="ch-text">${kicker ? `<div class="eyebrow">${kicker}</div>` : ""}${title ? `<h2>${esc(title)}</h2>` : ""}${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions ? `<div class="card-actions">${actions}</div>` : ""}</div>`
      : "";
    return `<section class="card span-${span} ${cls}"${id ? ` id="${id}"` : ""}>${head}${body}${foot ? `<div class="card-foot">${foot}</div>` : ""}</section>`;
  }

  /* A chart card: title, legend, the chart, and a button that swaps the chart for a table of the same numbers.
     sub and foot are trusted HTML written by the app; anything from data must be escaped by the caller. */
  function chartCard({ id, title, sub = "", foot = "", cls = "", span = 12, actions = "", height = 200, kicker = "", above = "", below = "" }) {
    return `<section class="card span-${span} ${cls}" id="${id}" data-chart-card>
      <div class="card-head"><div class="ch-text">${kicker ? `<div class="eyebrow">${kicker}</div>` : ""}<h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
        <div class="card-actions">${actions}<button class="icon-btn sm" type="button" data-table-toggle aria-pressed="false" title="Show the numbers as a table" aria-label="Show the numbers as a table" hidden>${icon("table")}</button></div></div>
      ${above}
      <div class="legend" hidden></div>
      <div class="chart" style="min-height:${height}px"></div>
      <div class="chart-table" hidden></div>
      ${below}
      ${foot ? `<div class="card-foot">${foot}</div>` : ""}
    </section>`;
  }

  const live = new Map();
  /* Draw a chart into a chart card. legend: [{name, color, kind:'line'|'box'|'band'|'dot'}]; table: {cols:[{label, r}], rows:[[...]]}. */
  function plot(id, type, spec, { legend = null, table = null } = {}) {
    const cardEl = document.getElementById(id);
    if (!cardEl) return null;
    const chartEl = cardEl.querySelector(".chart"), tableEl = cardEl.querySelector(".chart-table"), legEl = cardEl.querySelector(".legend");
    chartEl.style.minHeight = "";
    const prev = live.get(id);
    if (prev) prev.destroy();
    const hasLegend = !!(legend && legend.length);
    legEl.innerHTML = hasLegend ? legendHTML(legend) : "";
    const btn = cardEl.querySelector("[data-table-toggle]");
    const showTable = btn && btn.getAttribute("aria-pressed") === "true";
    legEl.hidden = !hasLegend || showTable;
    const c = AB.charts[type](chartEl, spec);
    live.set(id, c);
    if (table) tableEl.innerHTML = tableHTML(table);
    if (btn) {
      btn.hidden = !table;
      btn.onclick = () => {
        const on = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", String(on));
        btn.title = on ? "Show the chart" : "Show the numbers as a table";
        tableEl.hidden = !on; chartEl.hidden = on; legEl.hidden = on || !hasLegend;
      };
      tableEl.hidden = !showTable; chartEl.hidden = !!showTable;
    }
    return c;
  }
  const legendHTML = (items) => items.map((l) => `<span class="lg"><span class="sw ${l.kind || "box"}" style="background:${AB.charts.col(l.color)}"></span>${esc(l.name)}</span>`).join("");
  function tableHTML({ cols, rows }) {
    const c = cols.map((x) => (typeof x === "string" ? { label: x } : x));
    return `<table class="t"><thead><tr>${c.map((x) => `<th class="${x.r ? "r" : ""}" scope="col">${esc(x.label)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((v, i) => `<td class="${c[i]?.r ? "r num" : ""}">${esc(v)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }
  /* Called when the page changes: stop every chart that is no longer on screen. */
  function sweep(all = false) {
    for (const [id, c] of live) if (all || !document.getElementById(id)) { c.destroy(); live.delete(id); }
    AB.charts.hideTip();
  }

  /* ---------- confidence ---------- */
  function conf(c, { score = true, label = true, size = "" } = {}) {
    if (c == null) return "";
    const s = typeof c === "number" ? c : c.score;
    const t = AB.conf.tier(s);
    return `<span class="conf ${t.key} ${size}" title="Confidence ${s} out of 100 (${t.label}). Open the play to see what it rests on.">${icon(t.icon)}${label ? `<span>${t.label}</span>` : ""}${score ? `<b>${s}</b>` : ""}</span>`;
  }
  const meter = (v, key, label) => `<div class="meter ${key}" role="img" aria-label="${esc(label || `${Math.round(v * 100)} out of 100`)}"><i style="width:${Math.max(2, Math.min(100, v * 100)).toFixed(1)}%"></i></div>`;
  function factors(list) {
    return `<div class="factors">${list.map((f) => {
      const t = AB.conf.tier(f.value * 100).key;
      return `<div class="factor"><span class="f-name">${esc(f.name)}</span>${meter(f.value, t)}<span class="f-val">${Math.round(f.value * 100)}</span>${f.note ? `<span class="factor-note">${esc(f.note)}</span>` : ""}</div>`;
    }).join("")}</div>`;
  }
  /* The 80% range as a band, the most likely value as a dot, zero as a tick. Rows in one list share min and max. */
  function rangeBar(lo, mid, hi, { min = null, max = null, w = 120, fmt = silver } = {}) {
    if (lo == null || hi == null) return "";
    min = min ?? Math.min(0, lo);
    max = max ?? Math.max(0, hi);
    const X = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100));
    return `<span class="rbar" style="width:${w}px" role="img" aria-label="80% range ${esc(fmt(lo))} to ${esc(fmt(hi))}, most likely ${esc(fmt(mid))}"><span class="rb-axis"></span>${min < 0 && max > 0 ? `<span class="rb-zero" style="left:${X(0)}%"></span>` : ""}<span class="rb-band" style="left:${X(lo)}%;width:${Math.max(1.5, X(hi) - X(lo))}%"></span><span class="rb-dot" style="left:${X(mid)}%"></span></span>`;
  }
  const tierLegend = () => `<div class="tier-legend">${[85, 60, 40, 20].map((s) => conf(s, { score: false })).join("")}<span class="small muted">High 70+, Medium 50+, Low 30+, Very low below 30</span></div>`;

  /* ---------- items and tags ---------- */
  /* Item pictures come from Albion's render server: show one once it loads, keep the tier text if it fails.
     (load and error don't bubble, so one listener catches them on the way down.) */
  document.addEventListener("load", (e) => { if (e.target.matches?.(".ic > img")) e.target.parentNode.classList.add("has-img"); }, true);
  document.addEventListener("error", (e) => { if (e.target.matches?.(".ic > img")) e.target.remove(); }, true);
  function item(id, { sub = "", name = null, small = false } = {}) {
    const p = AB.cat.parse(id);
    const t = p.tier ? `${p.tier}.${p.ench}` : "";
    return `<span class="item${small ? " sm" : ""}"><span class="ic" aria-hidden="true"><span class="mono">${esc(t || "?")}</span><img src="${AB.cat.icon(id, 1, 64)}" alt="" loading="lazy" decoding="async"></span><span class="it-text"><span class="it-name">${esc(name || AB.cat.shortName(id))}${t ? ` <span class="tier">${t}</span>` : ""}</span>${sub ? `<span class="it-sub">${sub}</span>` : ""}</span></span>`;
  }
  const tag = (text, ic = "", cls = "") => `<span class="tag ${cls}">${ic ? icon(ic) : ""}${esc(text)}</span>`;
  const riskTag = (risk) => (risk === "red" ? tag("Red zone", "skull", "risk-red") : risk === "mists" ? tag("Mists", "alert", "risk-red") : tag("Safe zones", "shield", "risk-safe"));
  const route = (from, to) => `<span class="route">${esc(from)}${icon("arrow")}${esc(to)}</span>`;
  const empty = (msg, ic = "info") => `<div class="empty">${icon(ic)}<div>${esc(msg)}</div></div>`;
  const skel = (h = 120) => `<div class="skel" style="height:${h}px"></div>`;
  function kpi({ label, value, range = "", foot = "", spark = "", title = "" }) {
    return `<div class="kpi"${title ? ` title="${esc(title)}"` : ""}><div class="k-label">${label}</div><div class="k-value num">${value}</div>${range ? `<div class="k-range num">${range}</div>` : ""}${spark ? `<div class="k-spark">${spark}</div>` : ""}${foot ? `<div class="k-foot">${foot}</div>` : ""}</div>`;
  }
  function seg(name, options, value, label = "") {
    return `<div class="seg" role="group" data-seg="${esc(name)}"${label ? ` aria-label="${esc(label)}"` : ""}>${options
      .map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`)
      .join("")}</div>`;
  }
  /* Delegated click handling for seg controls inside root. */
  function onSeg(root, name, fn) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest(`[data-seg="${name}"] button`);
      if (!b || !root.contains(b)) return;
      b.parentNode.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      fn(b.dataset.v, b);
    });
  }
  /* ---------- item search: a text box with a list of matching items (the top bar, the alert form) ---------- */
  /* Arrow keys move through the list, Enter picks, Escape or a click elsewhere closes it. Returns { close, off };
     a page that makes one calls off() when it leaves. */
  function picker(input, list, onPick, limit = 12) {
    let items = [], sel = -1;
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); sel = -1; };
    const pick = (id) => { close(); onPick(id); };
    const draw = () => {
      list.innerHTML = items.length ? items.map((it, i) => `<button type="button" role="option" data-id="${esc(it.id)}" aria-selected="${i === sel}">${item(it.id, { sub: esc(it.id), small: true })}</button>`).join("") : `<div class="empty">No item matches that.</div>`;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    input.addEventListener("input", AB.util.debounce(() => {
      const q = input.value.trim();
      if (!q) return close();
      items = AB.cat.search(q, limit);
      sel = -1;
      draw();
    }, 120));
    input.addEventListener("keydown", (e) => {
      if (list.hidden) return;
      if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { const it = items[sel >= 0 ? sel : 0]; if (it) pick(it.id); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    list.addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b) pick(b.dataset.id); });
    const box = list.parentNode;
    const outside = (e) => { if (!box.contains(e.target)) close(); };
    document.addEventListener("click", outside);
    return { close, off: () => document.removeEventListener("click", outside) };
  }
  const chip = (v, label, on, n = null) => `<button class="chip" type="button" data-v="${esc(v)}" aria-pressed="${!!on}">${label}${n != null ? ` <span class="n">${n}</span>` : ""}</button>`;

  /* ---------- drawer ---------- */
  const drawer = (() => {
    let back = null, el = null, lastFocus = null, onClose = null;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && el) {
        const f = [...el.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    function open({ title, sub = "", html = "", label = "", onMount = null, close: cb = null }) {
      if (el) close(true);
      lastFocus = document.activeElement;
      onClose = cb;
      back = document.createElement("div");
      back.className = "drawer-back";
      el = document.createElement("aside");
      el.className = "drawer";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-label", label || "Details");
      el.innerHTML = `<div class="drawer-head"><div class="dh-text">${title}${sub ? `<div class="small">${sub}</div>` : ""}</div><button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div><div class="drawer-body">${html}</div>`;
      document.body.append(back, el);
      document.body.classList.add("no-scroll");
      requestAnimationFrame(() => { back && back.classList.add("on"); el && el.classList.add("on"); });
      back.addEventListener("click", () => close());
      el.querySelector("[data-close]").addEventListener("click", () => close());
      document.addEventListener("keydown", onKey);
      el.querySelector("[data-close]").focus({ preventScroll: true });
      if (onMount) onMount(el.querySelector(".drawer-body"), el);
      return el;
    }
    function close(quick = false) {
      if (!el) return;
      const b = back, d = el, cb = onClose;
      back = el = onClose = null;
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
      const done = () => { b.remove(); d.remove(); sweep(); };
      if (quick) done();
      else { b.classList.remove("on"); d.classList.remove("on"); setTimeout(done, 200); }
      AB.charts.hideTip();
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      if (cb) cb();
    }
    return { open, close, get isOpen() { return !!el; }, get el() { return el; } };
  })();

  /* ---------- small dialog for confirmations and quick input ---------- */
  function ask({ title, html, ok = "Save", cancel = "Cancel", onOk }) {
    drawer.open({
      title: `<h2>${esc(title)}</h2>`, label: title,
      html: `<form class="stack" data-ask>${html}<div class="row"><button class="btn primary" type="submit">${esc(ok)}</button><button class="btn ghost" type="button" data-cancel>${esc(cancel)}</button></div></form>`,
      onMount: (body) => {
        const f = body.querySelector("form");
        f.addEventListener("submit", (e) => { e.preventDefault(); if (onOk(new FormData(f), f) !== false) drawer.close(); });
        body.querySelector("[data-cancel]").addEventListener("click", () => drawer.close());
        const first = f.querySelector("input, select, textarea");
        if (first) first.focus();
      },
    });
  }

  return { card, chartCard, plot, sweep, legendHTML, tableHTML, conf, meter, factors, rangeBar, tierLegend, item, tag, riskTag, route, empty, skel, kpi, seg, onSeg, picker, chip, drawer, ask };
})();
