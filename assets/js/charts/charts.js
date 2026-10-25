/* Albion Billionaire v2 — chart kit. Plain SVG, drawn for this app.
   Rules it follows: thin marks (2px lines, bars at most 24px with 4px rounded ends), hairline solid grid, one y axis,
   a crosshair tooltip that lists every series, colours by entity in a fixed validated order, text in text colours,
   and every chart has a table view (the card wrapper in ui.js adds it). */
window.AB = window.AB || {};

AB.charts = (() => {
  const { esc, silver, clamp, date } = AB.util;
  const col = (c) => (!c ? "var(--s1)" : c.startsWith("#") || c.startsWith("var(") || c.startsWith("rgb") || c.startsWith("color-mix") ? c : `var(--${c})`);

  /* ---------- tooltip (one for the whole app) ---------- */
  let tipEl = null;
  function tip() {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tooltip"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
    return tipEl;
  }
  /* rows: [{color, name, value, box}] — values lead, names follow. All text goes in through textContent. */
  function showTip(x, y, title, rows, note) {
    const t = tip();
    t.textContent = "";
    if (title) { const d = document.createElement("div"); d.className = "tt-title"; d.textContent = title; t.appendChild(d); }
    for (const r of rows) {
      const row = document.createElement("div"); row.className = "tt-row";
      const k = document.createElement("span"); k.className = "tt-key" + (r.box ? " box" : ""); k.style.background = col(r.color);
      const n = document.createElement("span"); n.textContent = r.name;
      const v = document.createElement("span"); v.className = "tt-val"; v.textContent = r.value;
      row.append(k, n, v); t.appendChild(row);
    }
    if (note) { const d = document.createElement("div"); d.className = "tt-note"; d.textContent = note; t.appendChild(d); }
    t.classList.add("on");
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + h > window.innerHeight - 8) top = y - h - 14;
    t.style.left = clamp(left, 8, window.innerWidth - w - 8) + "px";
    t.style.top = clamp(top, 8, window.innerHeight - h - 8) + "px";
  }
  const hideTip = () => tipEl && tipEl.classList.remove("on");
  window.addEventListener("scroll", hideTip, { passive: true });

  /* ---------- scales and ticks ---------- */
  function niceStep(span, count) {
    const raw = span / Math.max(1, count);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function niceTicks(lo, hi, count = 5) {
    if (!isFinite(lo) || !isFinite(hi)) return [0];
    if (lo === hi) { const d = Math.abs(lo) || 1; lo -= d * 0.1; hi += d * 0.1; }
    const step = niceStep(hi - lo, count);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    const out = [];
    for (let v = a; v <= b + step * 0.5; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function timeTicks(lo, hi, width) {
    const day = 864e5, span = (hi - lo) / day;
    const max = Math.max(2, Math.floor(width / 70));
    const steps = [1, 2, 3, 7, 14, 30, 61, 91, 182];
    const st = steps.find((s) => span / s <= max) || 365;
    const start = Math.ceil(lo / day) * day;
    const out = [];
    for (let t = start; t <= hi; t += st * day) out.push(t);
    return out;
  }
  const lin = (d0, d1, r0, r1) => { const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0); const f = (v) => r0 + (v - d0) * k; f.inv = (p) => d0 + (p - r0) / (k || 1); return f; };
  const textW = (s, px = 11) => String(s).length * px * 0.58 + 2;
  /* Axis ticks drop trailing zeros: 2.00M -> 2M, 1.50B -> 1.5B, 0.00 -> 0. Tooltips keep full precision. */
  const trim = (t) => String(t).replace(/(\.\d*?[1-9])0+(?=\D*$)/, "$1").replace(/\.0+(?=\D*$)/, "");
  const tick = (f) => (v) => trim(f(v));
  /* Shorten a label to fit a width (estimated), with an ellipsis. The full text stays in the tooltip. */
  const fit = (t, maxW, px = 12) => { t = String(t); if (textW(t, px) <= maxW) return t; const n = Math.max(1, Math.floor((maxW - 2) / (px * 0.58)) - 1); return t.slice(0, n).trimEnd() + "…"; };
  /* Every k-th label of a row of evenly spaced x-axis ticks, the fewest skipped so neighbours keep 8px apart on a
     narrow chart (the gridlines all stay). */
  const tickEvery = (ticks, X, ft) => { if (ticks.length < 2) return 1; const gap = Math.abs(X(ticks[1]) - X(ticks[0])), w = Math.max(...ticks.map((v) => textW(ft(v)))); return Math.max(1, Math.ceil((w + 8) / Math.max(1, gap))); };

  function svgEl(w, h, label) {
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label || "chart")}">`;
  }
  /* Rounded-top bar path (square at the baseline). */
  function barPath(x, y, w, h, r = 4, dir = "up") {
    if (h <= 0 || w <= 0) return "";
    r = Math.min(r, w / 2, h);
    if (dir === "up") return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    if (dir === "down") return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    if (dir === "right") return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  }

  /* ---------- mount helper: render on size changes ---------- */
  function mount(el, draw) {
    let spec = null, w = 0;
    const ro = new ResizeObserver(AB.util.raf(() => { const nw = Math.floor(el.clientWidth); if (nw && nw !== w) { w = nw; draw(el, spec, w); } }));
    ro.observe(el);
    return {
      update(s) { spec = s; w = Math.floor(el.clientWidth) || 600; draw(el, spec, w); },
      destroy() { ro.disconnect(); el.innerHTML = ""; },
      get spec() { return spec; },
    };
  }

  /* =====================================================================================================
     Line / area / band chart. spec: { series:[{name,color,data:[[x,y]],width,dash,area,dots,muted}], bands:[{name,color,data:[[x,lo,hi]],opacity}],
     x:{type:'time'|'linear',fmt,min,max,label}, y:{fmt,min,max,zero,label}, height, hlines:[{y,label}], vlines:[{x,label}], endLabels, legend,
     tooltip:{title(x), fmt(y), range(lo, hi) (a band's range in words), note(x)} } */
  function drawLine(el, s, W) {
    if (!s) return;
    const H = s.height || 240;
    const xs = [], ys = [];
    for (const se of s.series || []) for (const [x, y] of se.data) { if (y != null && isFinite(y)) { xs.push(x); ys.push(y); } }
    for (const b of s.bands || []) for (const [x, lo, hi] of b.data) { if (lo != null) { xs.push(x); ys.push(lo, hi); } }
    for (const h of s.hlines || []) ys.push(h.y);
    if (!xs.length) { el.innerHTML = `<div class="empty">${esc(s.empty || "No data to draw yet.")}</div>`; return; }
    let x0 = s.x?.min ?? Math.min(...xs), x1 = s.x?.max ?? Math.max(...xs);
    let y0 = s.y?.min ?? Math.min(...ys), y1 = s.y?.max ?? Math.max(...ys);
    if (s.y?.zero !== false && s.y?.min == null && y0 > 0 && y0 < y1 * 0.35) y0 = 0;
    const pad = (y1 - y0) * 0.06 || Math.abs(y1) * 0.1 || 1;
    if (s.y?.min == null && !(s.y?.zero !== false && y0 === 0)) y0 -= pad;
    if (s.y?.max == null) y1 += pad;
    const yt = niceTicks(y0, y1, Math.max(3, Math.round(H / 55)));
    y0 = Math.min(y0, yt[0]); y1 = Math.max(y1, yt[yt.length - 1]);
    if (s.y?.min != null) y0 = s.y.min;
    if (s.y?.max != null) y1 = s.y.max;
    const yf = s.y?.fmt || ((v) => silver(v)), yft = tick(yf);
    const xf = s.x?.fmt || (s.x?.type === "time" ? (t) => date(t) : (v) => String(+v.toFixed(2))), xft = tick(xf);
    const endLab = s.endLabels ? Math.max(...(s.series || []).map((se) => textW(se.name, 11))) + 22 : 0;
    const ml = Math.max(...yt.map((v) => textW(yft(v)))) + 10, mr = 10 + endLab, mt = 10, mb = s.x?.label ? 38 : 24;
    const iw = Math.max(40, W - ml - mr), ih = H - mt - mb;
    const X = lin(x0, x1, ml, ml + iw), Y = lin(y0, y1, mt + ih, mt);
    let xt = s.x?.ticks ? s.x.ticks.filter((v) => v >= x0 && v <= x1) : s.x?.type === "time" ? timeTicks(x0, x1, iw) : niceTicks(x0, x1, Math.max(2, Math.floor(iw / 80))).filter((v) => v >= x0 && v <= x1);
    if (s.x?.ticks) { const room = Math.max(1, Math.floor(iw / Math.max(36, ...xt.map((v) => textW(xft(v)) + 10)))); const every = Math.ceil(xt.length / room); xt = xt.filter((_, i) => i % every === 0); }
    let g = svgEl(W, H, s.label);
    for (const v of yt) if (v >= y0 && v <= y1) g += `<line class="gridline" x1="${ml}" x2="${ml + iw}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${ml - 8}" y="${Y(v) + 3.5}" text-anchor="end">${esc(yft(v))}</text>`;
    for (const v of xt) g += `<text x="${X(v)}" y="${mt + ih + 16}" text-anchor="middle">${esc(xft(v))}</text>`;
    if (s.x?.label) g += `<text x="${ml + iw / 2}" y="${H - 4}" text-anchor="middle" class="label-2">${esc(s.x.label)}</text>`;
    g += `<g class="ax"><line x1="${ml}" x2="${ml + iw}" y1="${Y(Math.max(y0, Math.min(y1, s.y?.base ?? (y0 <= 0 && y1 >= 0 ? 0 : y0))))}" y2="${Y(Math.max(y0, Math.min(y1, s.y?.base ?? (y0 <= 0 && y1 >= 0 ? 0 : y0))))}"/></g>`;
    for (const b of s.bands || []) {
      const pts = b.data.filter((d) => d[1] != null && d[2] != null);
      if (pts.length < 2) continue;
      const top = pts.map((d) => `${X(d[0])},${Y(d[2])}`).join("L"), bot = pts.slice().reverse().map((d) => `${X(d[0])},${Y(d[1])}`).join("L");
      g += `<path d="M${top}L${bot}Z" style="fill:${col(b.color)};opacity:${b.opacity ?? 0.16}"/>`;
    }
    for (const h of s.hlines || []) {
      g += `<line x1="${ml}" x2="${ml + iw}" y1="${Y(h.y)}" y2="${Y(h.y)}" style="stroke:${col(h.color || "var(--text-3)")};stroke-width:1" />`;
      if (h.label) g += `<text x="${ml + iw - 4}" y="${Y(h.y) - 5}" text-anchor="end" class="label-2">${esc(h.label)}</text>`;
    }
    for (const v of s.vlines || []) {
      g += `<line x1="${X(v.x)}" x2="${X(v.x)}" y1="${mt}" y2="${mt + ih}" style="stroke:var(--axis);stroke-width:1"/>`;
      if (v.label) g += `<text x="${X(v.x) + 4}" y="${mt + 10}" class="label-2">${esc(v.label)}</text>`;
    }
    const segs = (data) => {
      let d = "", pen = false;
      for (const [x, y] of data) { if (y == null || !isFinite(y)) { pen = false; continue; } d += (pen ? "L" : "M") + X(x).toFixed(1) + "," + Y(y).toFixed(1); pen = true; }
      return d;
    };
    (s.series || []).forEach((se) => {
      if (se.area) {
        const pts = se.data.filter((d) => d[1] != null);
        if (pts.length > 1) g += `<path d="M${X(pts[0][0])},${Y(Math.max(y0, 0))}L${pts.map((d) => `${X(d[0])},${Y(d[1])}`).join("L")}L${X(pts[pts.length - 1][0])},${Y(Math.max(y0, 0))}Z" style="fill:${col(se.color)};opacity:0.1"/>`;
      }
      g += `<path d="${segs(se.data)}" fill="none" style="stroke:${col(se.muted ? "var(--deemph)" : se.color)};stroke-width:${se.width || 2};${se.dash ? "stroke-dasharray:" + se.dash + ";" : ""}" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (se.dots) for (const [x, y] of se.data) if (y != null) g += `<circle cx="${X(x)}" cy="${Y(y)}" r="4" style="fill:${col(se.color)};stroke:var(--surface-1);stroke-width:2"/>`;
    });
    if (s.endLabels) {
      const ends = (s.series || []).map((se) => { const last = [...se.data].reverse().find((d) => d[1] != null); return last ? { se, y: Y(last[1]), x: X(last[0]) } : null; }).filter(Boolean).sort((a, b) => a.y - b.y);
      /* stack the labels at least 13px apart (pushing down from the top), then slide the stack back up if it ran past
         the bottom of the plot */
      let prev = -Infinity;
      for (const e of ends) { e.ly = Math.max(e.y, prev + 13); prev = e.ly; }
      let next = mt + ih + 8 + 13;
      for (let i = ends.length - 1; i >= 0; i--) { ends[i].ly = Math.min(ends[i].ly, next - 13); next = ends[i].ly; }
      for (const e of ends) {
        const ly = e.ly;
        const c = col(e.se.muted ? "var(--deemph)" : e.se.color);
        /* a swatch on every label keeps its colour key next to the name even when the label had to move */
        if (Math.abs(ly - e.y) > 2) g += `<line x1="${e.x + 3}" y1="${e.y}" x2="${ml + iw + 9}" y2="${ly}" style="stroke:var(--axis);stroke-width:1"/>`;
        g += `<circle cx="${e.x}" cy="${e.y}" r="4" style="fill:${c};stroke:var(--surface-1);stroke-width:2"/><circle cx="${ml + iw + 13}" cy="${ly}" r="3.5" style="fill:${c}"/><text x="${ml + iw + 20}" y="${ly + 3.5}" class="label-2">${esc(e.se.name)}</text>`;
      }
    }
    g += `<line class="crosshair" x1="0" x2="0" y1="${mt}" y2="${mt + ih}" visibility="hidden"/><g class="hot"></g><rect class="hit" x="${ml}" y="${mt}" width="${iw}" height="${ih}"/></svg>`;
    el.innerHTML = g;
    const svg = el.firstChild, hit = svg.querySelector(".hit"), ch = svg.querySelector(".crosshair"), hot = svg.querySelector(".hot");
    const allX = [...new Set(xs)].sort((a, b) => a - b);
    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (W / rect.width);
      const xv = X.inv(px);
      let best = allX[0];
      for (const x of allX) if (Math.abs(x - xv) < Math.abs(best - xv)) best = x;
      ch.setAttribute("x1", X(best)); ch.setAttribute("x2", X(best)); ch.setAttribute("visibility", "visible");
      const rows = [];
      let dots = "";
      for (const se of s.series || []) {
        const p = se.data.find((d) => d[0] === best);
        if (!p || p[1] == null) continue;
        rows.push({ color: se.muted ? "var(--deemph)" : se.color, name: se.name, value: (se.fmt || s.tooltip?.fmt || yf)(p[1]) });
        dots += `<circle cx="${X(best)}" cy="${Y(p[1])}" r="4" style="fill:${col(se.muted ? "var(--deemph)" : se.color)};stroke:var(--surface-1);stroke-width:2"/>`;
      }
      for (const b of s.bands || []) {
        const p = b.data.find((d) => d[0] === best);
        if (p && p[1] != null && b.name) rows.push({ color: b.color, name: b.name, value: s.tooltip?.range ? s.tooltip.range(p[1], p[2]) : `${(s.tooltip?.fmt || yf)(p[1])} – ${(s.tooltip?.fmt || yf)(p[2])}`, box: true });
      }
      hot.innerHTML = dots;
      showTip(ev.clientX, ev.clientY, (s.tooltip?.title || xf)(best), rows, s.tooltip?.note?.(best));
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { ch.setAttribute("visibility", "hidden"); hot.innerHTML = ""; hideTip(); });
  }

  /* =====================================================================================================
     Bars. spec: { categories:[...], series:[{name,color,values:[...]}], stacked, horizontal, fmt, height, valueLabels, labelFmt (the value
     labels; fmt otherwise), tipFmt, colors:[per-category color], zero line, diverging (values can be negative), notes:[per-category tooltip note] } */
  function drawBars(el, s, W) {
    if (!s) return;
    const cats = s.categories || [], ser = s.series || [];
    if (!cats.length) { el.innerHTML = `<div class="empty">${esc(s.empty || "No data to draw yet.")}</div>`; return; }
    const fmt = s.fmt || ((v) => silver(v)), ft = tick(fmt), lf = s.labelFmt || fmt;
    const tot = cats.map((_, i) => s.stacked ? ser.reduce((a, se) => a + Math.max(0, se.values[i] || 0), 0) : Math.max(...ser.map((se) => se.values[i] ?? 0)));
    const neg = cats.map((_, i) => s.stacked ? ser.reduce((a, se) => a + Math.min(0, se.values[i] || 0), 0) : Math.min(0, ...ser.map((se) => se.values[i] ?? 0)));
    let lo = Math.min(0, ...neg), hi = Math.max(0, ...tot);
    if (lo < 0 && hi > 0 && -lo < hi * 0.03) lo = 0; /* a sliver below zero shouldn't add a whole negative band */
    if (s.min != null) lo = s.min;
    if (s.max != null) hi = s.max;
    const ticks = niceTicks(lo, hi, 4);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const n = cats.length, k = s.stacked ? 1 : ser.length;
    let g;
    if (s.horizontal) {
      const rowH = s.rowHeight || Math.max(22, Math.min(34, 8 + 16 * k));
      const labW = Math.min(W * 0.42, Math.max(...cats.map((c) => textW(c, 12))) + 12);
      const valW = s.valueLabels ? Math.max(...tot.map((v) => textW(lf(v)))) + 10 : 10;
      const H = s.height || n * rowH + 28;
      const ml = labW, mr = valW, mt = 4, mb = 22, iw = Math.max(40, W - ml - mr), ih = H - mt - mb;
      const X = lin(lo, hi, ml, ml + iw);
      const band = ih / n, bw = Math.min(s.stacked ? 18 : 14, (band - 6) / k);
      g = svgEl(W, H, s.label);
      const ke = tickEvery(ticks, X, ft);
      ticks.forEach((v, i) => { g += `<line class="gridline" x1="${X(v)}" x2="${X(v)}" y1="${mt}" y2="${mt + ih}"/>${i % ke === 0 ? `<text x="${X(v)}" y="${H - 6}" text-anchor="middle">${esc(ft(v))}</text>` : ""}`; });
      g += `<g class="ax"><line x1="${X(0)}" x2="${X(0)}" y1="${mt}" y2="${mt + ih}"/></g>`;
      cats.forEach((c, i) => {
        const cy = mt + band * i + band / 2;
        g += `<text x="${ml - 10}" y="${cy + 4}" text-anchor="end" class="label-2" style="font-size:12px">${esc(fit(c, ml - 12))}</text>`;
        let acc = 0, accN = 0;
        ser.forEach((se, j) => {
          const v = se.values[i];
          if (v == null) return;
          const color = s.colors?.[i] || se.colors?.[i] || se.color;
          let x0v, x1v;
          if (s.stacked) { if (v >= 0) { x0v = acc; acc += v; x1v = acc; } else { x0v = accN + v; x1v = accN; accN += v; } }
          else { x0v = Math.min(0, v); x1v = Math.max(0, v); }
          const y = s.stacked ? cy - bw / 2 : cy - (k * bw + (k - 1) * 2) / 2 + j * (bw + 2);
          const xa = clamp(X(x0v), ml, ml + iw), xb = clamp(X(x1v), ml, ml + iw), gap = s.stacked && j > 0 && v >= 0 ? 2 : 0;
          const last = !s.stacked || j === ser.length - 1 || ser.slice(j + 1).every((o) => !o.values[i]);
          const d = last ? barPath(xa + gap, y, Math.max(0, xb - xa - gap), bw, 4, v >= 0 ? "right" : "left") : `M${xa + gap},${y}H${xb}V${y + bw}H${xa + gap}Z`;
          g += `<path class="mark-hover" data-i="${i}" data-j="${j}" d="${d}" style="fill:${col(color)}"/>`;
        });
        if (s.valueLabels) { const v = s.stacked ? tot[i] : ser[0].values[i]; if (v != null) g += `<text x="${X(Math.max(0, v)) + 6}" y="${cy + 4}" class="label-strong" style="font-size:11.5px">${esc(lf(v))}</text>`; }
        g += `<rect class="hit" data-row="${i}" x="0" y="${mt + band * i}" width="${W}" height="${band}" style="cursor:default"/>`;
      });
      g += "</svg>";
    } else {
      const H = s.height || 220;
      const ml = Math.max(...ticks.map((v) => textW(ft(v)))) + 10, mr = 8, mt = s.valueLabels ? 18 : 8, mb = 26;
      const iw = Math.max(40, W - ml - mr), ih = H - mt - mb;
      const Y = lin(lo, hi, mt + ih, mt);
      const band = iw / n, bw = Math.min(24, (band * 0.7 - (k - 1) * 2) / k);
      /* value labels only when each fits above its bar; on a narrow chart the tooltip and the table carry them */
      const labels = s.valueLabels && cats.every((_, i) => { const v = s.stacked ? tot[i] : ser[0].values[i]; return v == null || textW(lf(v), 11) <= band - 2; });
      g = svgEl(W, H, s.label);
      for (const v of ticks) g += `<line class="gridline" x1="${ml}" x2="${ml + iw}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${ml - 8}" y="${Y(v) + 3.5}" text-anchor="end">${esc(ft(v))}</text>`;
      const every = Math.ceil(n / Math.max(1, Math.floor(iw / Math.max(28, Math.max(...cats.map((c) => textW(c))) + 6))));
      cats.forEach((c, i) => {
        const cx = ml + band * i + band / 2;
        if (i % every === 0) g += `<text x="${cx}" y="${mt + ih + 16}" text-anchor="middle">${esc(c)}</text>`;
        let acc = 0, accN = 0;
        ser.forEach((se, j) => {
          const v = se.values[i];
          if (v == null) return;
          const color = s.colors?.[i] || se.colors?.[i] || se.color;
          let a, b;
          if (s.stacked) { if (v >= 0) { a = acc; acc += v; b = acc; } else { a = accN + v; b = accN; accN += v; } } else { a = Math.min(0, v); b = Math.max(0, v); }
          const x = s.stacked ? cx - bw / 2 : cx - (k * bw + (k - 1) * 2) / 2 + j * (bw + 2);
          const ya = clamp(Y(b), mt, mt + ih), yb = clamp(Y(a), mt, mt + ih), gap = s.stacked && j > 0 && v >= 0 ? 2 : 0;
          const last = !s.stacked || j === ser.length - 1 || ser.slice(j + 1).every((o) => !o.values[i]);
          const d = last ? barPath(x, ya, bw, Math.max(0, yb - ya - gap), 4, v >= 0 ? "up" : "down") : `M${x},${ya}H${x + bw}V${yb - gap}H${x}Z`;
          g += `<path class="mark-hover" data-i="${i}" data-j="${j}" d="${d}" style="fill:${col(color)}"/>`;
        });
        if (labels) { const v = s.stacked ? tot[i] : ser[0].values[i]; if (v != null) g += `<text x="${cx}" y="${Y(Math.max(0, v)) - 5}" text-anchor="middle" class="label-strong" style="font-size:11px">${esc(lf(v))}</text>`; }
        g += `<rect class="hit" data-row="${i}" x="${ml + band * i}" y="${mt}" width="${band}" height="${ih}" style="cursor:default"/>`;
      });
      g += `<g class="ax"><line x1="${ml}" x2="${ml + iw}" y1="${Y(Math.max(lo, 0))}" y2="${Y(Math.max(lo, 0))}"/></g>`;
      /* reference lines (a target, a break-even), drawn over the bars with a halo behind the label */
      for (const h of s.hlines || []) {
        g += `<line x1="${ml}" x2="${ml + iw}" y1="${Y(h.y)}" y2="${Y(h.y)}" style="stroke:${col(h.color || "var(--text-2)")};stroke-width:1.25;stroke-dasharray:5 4;pointer-events:none"/>`;
        if (h.label) g += `<text x="${ml + iw - 4}" y="${Y(h.y) - 6}" text-anchor="end" class="label-2" style="paint-order:stroke;stroke:var(--surface-1);stroke-width:4px;stroke-linejoin:round;pointer-events:none">${esc(h.label)}</text>`;
      }
      g += `</svg>`;
    }
    el.innerHTML = g;
    el.querySelectorAll(".hit").forEach((r) => {
      const i = +r.dataset.row;
      const on = (ev) => {
        el.querySelectorAll(`.mark-hover`).forEach((m) => m.classList.toggle("is-hot", +m.dataset.i === i));
        showTip(ev.clientX, ev.clientY, cats[i], ser.filter((se) => se.values[i] != null).map((se) => ({ color: s.colors?.[i] || se.colors?.[i] || se.color, name: se.name, value: (se.fmt || s.tipFmt || fmt)(se.values[i]), box: true })), s.notes?.[i]);
      };
      r.addEventListener("pointermove", on);
      r.addEventListener("pointerdown", on);
      r.addEventListener("pointerleave", () => { el.querySelectorAll(".is-hot").forEach((m) => m.classList.remove("is-hot")); hideTip(); });
    });
  }

  /* =====================================================================================================
     Scatter / bubble. spec: { points:[{x,y,r,color,label,sub,id}], x:{fmt,label,min,max}, y:{fmt,label,min,max,zero}, height, onClick, rRange:[4,18],
     quadrant:{x,y,labels:[tl,tr,bl,br]}, diagonal } */
  function drawScatter(el, s, W) {
    if (!s) return;
    const pts = (s.points || []).filter((p) => isFinite(p.x) && isFinite(p.y));
    if (!pts.length) { el.innerHTML = `<div class="empty">${esc(s.empty || "Nothing to plot yet.")}</div>`; return; }
    const H = s.height || 300;
    /* optional log scale on y (profit an hour spans four orders of magnitude) */
    const ylog = !!s.y?.log;
    const ty = (v) => (ylog ? Math.log10(Math.max(1, v)) : v);
    let x0 = s.x?.min ?? Math.min(...pts.map((p) => p.x)), x1 = s.x?.max ?? Math.max(...pts.map((p) => p.x));
    let y0 = s.y?.min != null ? ty(s.y.min) : Math.min(...pts.map((p) => ty(p.y))), y1 = s.y?.max != null ? ty(s.y.max) : Math.max(...pts.map((p) => ty(p.y)));
    if (!ylog && s.y?.zero !== false && s.y?.min == null) y0 = Math.min(0, y0);
    const xt = niceTicks(x0, x1, 5);
    let yt = ylog ? [] : niceTicks(y0, y1, 5);
    if (ylog) { y0 = Math.floor(y0); y1 = Math.ceil(y1); if (y1 === y0) y1 = y0 + 1; for (let v = y0; v <= y1; v++) yt.push(v); }
    if (s.x?.min == null) x0 = xt[0]; if (s.x?.max == null) x1 = xt[xt.length - 1];
    if (!ylog) { if (s.y?.min == null) y0 = yt[0]; if (s.y?.max == null) y1 = yt[yt.length - 1]; }
    const xf = s.x?.fmt || ((v) => silver(v)), yfRaw = s.y?.fmt || ((v) => silver(v));
    const yf = tick(ylog ? (v) => yfRaw(Math.pow(10, v)) : yfRaw), xft = tick(xf);
    const ml = Math.max(...yt.map((v) => textW(yf(v)))) + 12, mr = 14, mt = s.y?.label ? 24 : 12, mb = s.x?.label ? 40 : 26;
    const iw = W - ml - mr, ih = H - mt - mb;
    const X = lin(x0, x1, ml, ml + iw), Y0 = lin(y0, y1, mt + ih, mt), Y = (v) => Y0(v);
    const PY = (p) => Y0(ty(p.y));
    const rs = pts.map((p) => p.r ?? 1), rmax = Math.max(...rs), [ra, rb] = s.rRange || [5, 18];
    const R = (r) => (rmax > 0 ? ra + (rb - ra) * Math.sqrt(Math.max(0, r) / rmax) : ra);
    let g = svgEl(W, H, s.label);
    for (const v of yt) if (v >= y0 && v <= y1) g += `<line class="gridline" x1="${ml}" x2="${ml + iw}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${ml - 8}" y="${Y(v) + 3.5}" text-anchor="end">${esc(yf(v))}</text>`;
    for (const v of xt) if (v >= x0 && v <= x1) g += `<text x="${X(v)}" y="${mt + ih + 16}" text-anchor="middle">${esc(xft(v))}</text>`;
    if (s.x?.label) g += `<text x="${ml + iw / 2}" y="${H - 4}" text-anchor="middle" class="label-2">${esc(s.x.label)}</text>`;
    if (s.y?.label) g += `<text x="${ml}" y="${mt - 10}" class="label-2">${esc(s.y.label)}</text>`;
    g += `<g class="ax"><line x1="${ml}" x2="${ml + iw}" y1="${Y(ylog ? y0 : Math.max(y0, 0))}" y2="${Y(ylog ? y0 : Math.max(y0, 0))}"/><line x1="${ml}" x2="${ml}" y1="${mt}" y2="${mt + ih}"/></g>`;
    if (s.diagonal) g += `<line x1="${X(Math.max(x0, y0))}" y1="${Y(Math.max(x0, y0))}" x2="${X(Math.min(x1, y1))}" y2="${Y(Math.min(x1, y1))}" style="stroke:var(--text-3);stroke-width:1"/>`;
    if (s.quadrant) {
      const qx = X(s.quadrant.x), qy = Y0(ty(s.quadrant.y)), L = s.quadrant.labels || [];
      g += `<line x1="${qx}" x2="${qx}" y1="${mt}" y2="${mt + ih}" style="stroke:var(--axis)"/><line x1="${ml}" x2="${ml + iw}" y1="${qy}" y2="${qy}" style="stroke:var(--axis)"/>`;
      if (L[1]) g += `<text x="${ml + iw - 6}" y="${mt + 12}" text-anchor="end" class="label-2" style="font-weight:600">${esc(L[1])}</text>`;
      if (L[0]) g += `<text x="${ml + 6}" y="${mt + 12}" class="label-2">${esc(L[0])}</text>`;
      if (L[3]) g += `<text x="${ml + iw - 6}" y="${mt + ih - 6}" text-anchor="end" class="label-2">${esc(L[3])}</text>`;
      if (L[2]) g += `<text x="${ml + 6}" y="${mt + ih - 6}" class="label-2">${esc(L[2])}</text>`;
    }
    const order = pts.map((p, i) => i).sort((a, b) => (pts[b].r ?? 1) - (pts[a].r ?? 1));
    for (const i of order) {
      const p = pts[i];
      g += `<circle class="mark-hover" data-i="${i}" cx="${X(p.x)}" cy="${PY(p)}" r="${R(p.r ?? 1)}" style="fill:${col(p.color)};fill-opacity:${p.r != null ? s.fillOpacity ?? 0.45 : 0.9};stroke:${p.r != null ? col(p.color) : "var(--surface-1)"};stroke-width:${p.r != null ? 1 : 2}"/>`;
    }
    for (const p of pts.filter((p) => p.tag)) g += `<text x="${X(p.x) + R(p.r ?? 1) + 4}" y="${PY(p) + 4}" class="label-strong" style="font-size:11px">${esc(p.tag)}</text>`;
    g += `<rect class="hit" x="${ml}" y="${mt}" width="${iw}" height="${ih}" style="cursor:${s.onClick ? "pointer" : "default"}"/></svg>`;
    el.innerHTML = g;
    const svg = el.firstChild, hit = svg.querySelector(".hit");
    const nearest = (ev) => {
      const rect = svg.getBoundingClientRect(), k = W / rect.width;
      const px = (ev.clientX - rect.left) * k, py = (ev.clientY - rect.top) * k;
      let best = -1, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.hypot(X(p.x) - px, PY(p) - py) - R(p.r ?? 1); if (d < bd) { bd = d; best = i; } });
      return bd < 28 ? best : -1;
    };
    hit.addEventListener("pointermove", (ev) => {
      const i = nearest(ev);
      svg.querySelectorAll(".mark-hover").forEach((m) => m.classList.toggle("is-hot", +m.dataset.i === i));
      if (i < 0) return hideTip();
      const p = pts[i];
      showTip(ev.clientX, ev.clientY, p.label, (p.rows || [{ name: s.x?.label || "x", value: xf(p.x) }, { name: s.y?.label || "y", value: yfRaw(p.y) }]).map((r) => ({ color: p.color, box: true, ...r })), p.sub);
    });
    hit.addEventListener("pointerleave", () => { svg.querySelectorAll(".is-hot").forEach((m) => m.classList.remove("is-hot")); hideTip(); });
    if (s.onClick) hit.addEventListener("click", (ev) => { const i = nearest(ev); if (i >= 0) { hideTip(); s.onClick(pts[i]); } });
  }

  /* =====================================================================================================
     Heatmap. spec: { rows:[...], cols:[...], values:[[...]] (null = no data), scale:'seq'|'div', domain:[lo,hi] (div: symmetric),
     flip (div: negative values take the positive pole's colour, for a measure where lower is better), gamma (div: below 1 lifts the colour
     of small values next to big ones; 0.5 is a square-root scale), fmt, cellH, note(i,j) } */
  /* Sequential: low values sit close to the surface, high values stand out from it. The --seq tokens are defined
     per theme with seq-1 nearest the surface, so the same order works in light and dark. */
  function seqColor(t) {
    const css = getComputedStyle(document.documentElement);
    const arr = [1, 2, 3, 4, 5, 6, 7].map((k) => css.getPropertyValue(`--seq-${k}`).trim() || "#3987e5");
    const i = clamp(t, 0, 1) * (arr.length - 1), a = Math.floor(i), b = Math.min(arr.length - 1, a + 1);
    return mix(arr[a], arr[b], i - a);
  }
  function mix(h1, h2, t) {
    const p = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    const a = p(h1), b = p(h2);
    if (a.some(isNaN) || b.some(isNaN)) return h1;
    return "#" + a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  function divColor(t) {
    const css = getComputedStyle(document.documentElement);
    const neg = css.getPropertyValue("--div-neg").trim(), mid = css.getPropertyValue("--div-mid").trim(), pos = css.getPropertyValue("--div-pos").trim();
    return t < 0 ? mix(mid, neg, Math.min(1, -t)) : mix(mid, pos, Math.min(1, t));
  }
  const lum = (hex) => { const p = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; };
  function drawHeat(el, s, W) {
    if (!s) return;
    const rows = s.rows || [], cols = s.cols || [];
    if (!rows.length || !cols.length) { el.innerHTML = `<div class="empty">${esc(s.empty || "No data.")}</div>`; return; }
    const fmt = s.fmt || ((v) => String(v));
    const vals = s.values.flat().filter((v) => v != null && isFinite(v));
    let [lo, hi] = s.domain || [Math.min(...vals), Math.max(...vals)];
    if (s.scale === "div") { const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -m; hi = m; }
    const tone = (t) => Math.sign(t) * Math.pow(Math.min(1, Math.abs(t)), s.gamma || 1);
    const labW = Math.min(W * 0.36, Math.max(...rows.map((r) => textW(r, 12))) + 12);
    const cellH = s.cellH || 30, mt = 22, leg = s.legend === false ? 0 : 40, H = mt + rows.length * cellH + 4 + leg;
    const cw = (W - labW - 4) / cols.length;
    let g = svgEl(W, H, s.label);
    cols.forEach((c, j) => { g += `<text x="${labW + cw * j + cw / 2}" y="14" text-anchor="middle">${esc(c)}</text>`; });
    rows.forEach((r, i) => {
      g += `<text x="${labW - 8}" y="${mt + cellH * i + cellH / 2 + 4}" text-anchor="end" class="label-2" style="font-size:12px">${esc(fit(r, labW - 10))}</text>`;
      cols.forEach((c, j) => {
        const v = s.values[i]?.[j];
        const x = labW + cw * j + 1, y = mt + cellH * i + 1;
        let fill = "var(--surface-2)";
        if (v != null && isFinite(v)) fill = s.scale === "div" ? divColor(tone((s.flip ? -v : v) / hi)) : seqColor((v - lo) / (hi - lo || 1));
        g += `<rect class="mark-hover" data-i="${i}" data-j="${j}" x="${x}" y="${y}" width="${Math.max(0, cw - 2)}" height="${cellH - 2}" rx="4" style="fill:${fill}"/>`;
        if (s.cellLabels !== false && v != null && cw > 34) {
          const ink = fill.startsWith("#") && lum(fill) > 0.32 ? "#0b0b0b" : "#ffffff";
          g += `<text x="${x + (cw - 2) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" style="fill:${ink};font-size:${cellH >= 36 ? 12.5 : 11}px;font-weight:${cellH >= 36 ? 600 : 400};pointer-events:none">${esc(fmt(v))}</text>`;
        }
      });
    });
    /* an optional ring around one cell, e.g. "you are here" */
    if (s.mark && s.mark[0] >= 0 && s.mark[1] >= 0) g += `<rect x="${labW + cw * s.mark[1]}" y="${mt + cellH * s.mark[0]}" width="${cw}" height="${cellH}" rx="5" style="fill:none;stroke:var(--gold);stroke-width:2.5;pointer-events:none"/>`;
    if (leg) {
      /* the scale: a gradient strip from the lowest to the highest value, labelled at both ends */
      const nameW = s.valueName ? textW(s.valueName) + 12 : 0;
      const gy = mt + rows.length * cellH + 18, gw = Math.max(80, Math.min(260, W - labW - 8 - nameW)), gx = labW + 1, id = "hg" + Math.random().toString(36).slice(2, 8);
      const stops = s.scale === "div" ? [-1, -0.5, 0, 0.5, 1].map((t) => divColor(s.flip ? -t : t)) : [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1].map((t) => seqColor(t));
      g += `<defs><linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0">${stops.map((c, k) => `<stop offset="${(k / (stops.length - 1)) * 100}%" stop-color="${c}"/>`).join("")}</linearGradient></defs>`;
      g += `<rect x="${gx}" y="${gy}" width="${gw}" height="8" rx="4" fill="url(#${id})"/>`;
      g += `<text x="${gx}" y="${gy + 21}" class="label-2">${esc(fmt(lo))}</text><text x="${gx + gw}" y="${gy + 21}" text-anchor="end" class="label-2">${esc(fmt(hi))}</text>`;
      if (s.valueName) g += `<text x="${gx + gw + 10}" y="${gy + 8}" class="label-2">${esc(fit(s.valueName, W - gx - gw - 12, 11))}</text>`;
    }
    g += "</svg>";
    el.innerHTML = g;
    el.querySelectorAll("rect.mark-hover").forEach((m) => {
      const i = +m.dataset.i, j = +m.dataset.j;
      const on = (ev) => { const v = s.values[i]?.[j]; showTip(ev.clientX, ev.clientY, `${rows[i]} · ${cols[j]}`, [{ color: "var(--seq-4)", name: s.valueName || "Value", value: v == null ? "no data" : fmt(v), box: true }], s.note?.(i, j)); };
      m.addEventListener("pointermove", on); m.addEventListener("pointerdown", on); m.addEventListener("pointerleave", hideTip);
    });
  }

  /* =====================================================================================================
     Forest plot: the confidence ladder. spec: { rows:[{label,sub,lo,mid,hi,tier,id}], fmt (axis), labelFmt (the value beside each row), tipFmt,
     rangeFmt(lo, hi) (a range in words, for the tooltip and screen readers), midName, rangeName, onClick, zero:true } */
  function drawForest(el, s, W) {
    if (!s) return;
    const rows = s.rows || [];
    if (!rows.length) { el.innerHTML = `<div class="empty">${esc(s.empty || "Nothing to rank yet.")}</div>`; return; }
    const fmt = s.fmt || ((v) => silver(v)), ft = tick(fmt), lf = s.labelFmt || fmt, tf = s.tipFmt || fmt;
    const rowH = 30, mt = 6, mb = 24, H = mt + rows.length * rowH + mb;
    let lo = Math.min(0, ...rows.map((r) => Math.min(r.lo, r.mid))), hi = Math.max(...rows.map((r) => Math.max(r.hi, r.mid)));
    const ticks = niceTicks(lo, hi, 4);
    lo = ticks[0]; hi = ticks[ticks.length - 1];
    const labW = Math.min(W * 0.42, Math.max(...rows.map((r) => textW(r.label, 12))) + 16);
    const ml = labW, mr = Math.max(...rows.map((r) => textW(lf(r.mid)))) + 14, iw = Math.max(60, W - ml - mr);
    const X = lin(lo, hi, ml, ml + iw);
    const color = { high: "var(--good)", med: "var(--warning)", low: "var(--serious)", vlow: "var(--critical)" };
    let g = svgEl(W, H, s.label);
    const ke = tickEvery(ticks, X, ft);
    ticks.forEach((v, i) => { g += `<line class="gridline" x1="${X(v)}" x2="${X(v)}" y1="${mt}" y2="${mt + rows.length * rowH}"/>${i % ke === 0 ? `<text x="${X(v)}" y="${H - 6}" text-anchor="middle">${esc(ft(v))}</text>` : ""}`; });
    if (lo < 0) g += `<line x1="${X(0)}" x2="${X(0)}" y1="${mt}" y2="${mt + rows.length * rowH}" style="stroke:var(--text-3);stroke-width:1"/>`;
    rows.forEach((r, i) => {
      const cy = mt + rowH * i + rowH / 2, c = color[r.tier] || "var(--s1)";
      g += `<text x="${ml - 10}" y="${cy + 4}" text-anchor="end" class="label-2" style="font-size:12px">${esc(fit(r.label, ml - 12))}</text>`;
      g += `<rect x="${X(r.lo)}" y="${cy - 4}" width="${Math.max(2, X(r.hi) - X(r.lo))}" height="8" rx="4" style="fill:${c};opacity:0.35"/>`;
      g += `<circle cx="${X(r.mid)}" cy="${cy}" r="5" style="fill:${c};stroke:var(--surface-1);stroke-width:2"/>`;
      g += `<text x="${ml + iw + 8}" y="${cy + 4}" class="label-strong" style="font-size:11.5px">${esc(lf(r.mid))}</text>`;
      /* rows that open something are buttons for the keyboard too */
      const btn = s.onClick ? ` tabindex="0" role="button" aria-label="${esc(`${r.label}: ${(s.midName || "most likely").toLowerCase()} ${tf(r.mid)}, 80% range ${s.rangeFmt ? s.rangeFmt(r.lo, r.hi) : `${tf(r.lo)} to ${tf(r.hi)}`}`)}"` : "";
      g += `<rect class="hit" data-i="${i}" x="0" y="${mt + rowH * i}" width="${W}" height="${rowH}" style="cursor:${s.onClick ? "pointer" : "default"}"${btn}/>`;
    });
    g += "</svg>";
    el.innerHTML = g;
    el.querySelectorAll(".hit").forEach((h) => {
      const r = rows[+h.dataset.i];
      const on = (ev) => showTip(ev.clientX, ev.clientY, r.label, [
        { color: color[r.tier], name: s.midName || "Most likely", value: tf(r.mid), box: true },
        { color: color[r.tier], name: s.rangeName || "80% range", value: s.rangeFmt ? s.rangeFmt(r.lo, r.hi) : `${tf(r.lo)} – ${tf(r.hi)}`, box: true },
        ...(r.extra || []),
      ], r.sub);
      h.addEventListener("pointermove", on);
      h.addEventListener("pointerleave", hideTip);
      if (s.onClick) {
        h.addEventListener("click", () => { hideTip(); s.onClick(r); });
        h.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); s.onClick(r); } });
      }
    });
  }

  /* =====================================================================================================
     Albion schematic: the royal ring, Caerleon in the middle, Brecilien in the mists. spec: { routes:[{from,to,label,weight,risk}], marks:{city:value} } */
  const POS = { "Fort Sterling": [0.36, 0.12], Thetford: [0.82, 0.24], Martlock: [0.84, 0.74], Bridgewatch: [0.44, 0.9], Lymhurst: [0.12, 0.5], Caerleon: [0.5, 0.48], Brecilien: [0.08, 0.86], "Black Market": [0.5, 0.48] };
  function drawMap(el, s, W) {
    if (!s) return;
    const H = s.height || Math.min(340, Math.max(240, W * 0.62));
    const P = (c) => { const p = POS[c] || [0.5, 0.5]; return [24 + p[0] * (W - 48), 18 + p[1] * (H - 40)]; };
    let g = svgEl(W, H, s.label || "Map of the royal cities").replace(">", `><style>.map-t{paint-order:stroke;stroke:var(--surface-1);stroke-width:4px;stroke-linejoin:round}</style>`);
    const ring = AB.cat.RING.concat(AB.cat.RING[0]).map(P);
    g += `<path d="M${ring.map((p) => p.join(",")).join("L")}" fill="none" style="stroke:var(--line-2);stroke-width:10;stroke-linejoin:round;opacity:0.6"/>`;
    const cc = P("Caerleon");
    g += `<circle cx="${cc[0]}" cy="${cc[1]}" r="${Math.min(W, H) * 0.2}" style="fill:var(--critical);opacity:0.07"/>`;
    g += `<text x="${cc[0]}" y="${cc[1] + Math.min(W, H) * 0.2 - 8}" text-anchor="middle" class="map-t" style="font-size:10px">red zones</text>`;
    const maxW = Math.max(1, ...(s.routes || []).map((r) => r.weight || 1));
    (s.routes || []).forEach((r, i) => {
      const a = P(r.from), b = P(r.to);
      const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.12, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.12;
      const w = 1.5 + 4 * Math.sqrt((r.weight || 1) / maxW);
      g += `<path class="mark-hover" data-i="${i}" d="M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}" fill="none" style="stroke:${col(r.color || (r.risk === "red" ? "var(--s2)" : "var(--s1)"))};stroke-width:${w};opacity:0.85" stroke-linecap="round"/>`;
      const ang = Math.atan2(b[1] - my, b[0] - mx), ex = b[0] - Math.cos(ang) * 14, ey = b[1] - Math.sin(ang) * 14;
      g += `<path d="M${ex},${ey} l${-Math.cos(ang - 0.5) * 8},${-Math.sin(ang - 0.5) * 8} M${ex},${ey} l${-Math.cos(ang + 0.5) * 8},${-Math.sin(ang + 0.5) * 8}" style="stroke:${col(r.color || (r.risk === "red" ? "var(--s2)" : "var(--s1)"))};stroke-width:2" stroke-linecap="round"/>`;
    });
    for (const c of [...AB.cat.ROYAL, "Caerleon", "Brecilien"]) {
      const [x, y] = P(c), v = s.marks?.[c];
      g += `<circle cx="${x}" cy="${y}" r="7" style="fill:var(--surface-1);stroke:${c === "Caerleon" ? "var(--critical)" : c === "Brecilien" ? "var(--s7)" : "var(--gold)"};stroke-width:2.5"/>`;
      g += `<text x="${x}" y="${y - 12}" text-anchor="middle" class="label-strong map-t" style="font-size:11.5px">${esc(c === "Caerleon" ? "Caerleon + BM" : c)}</text>`;
      if (v != null) g += `<text x="${x}" y="${y + 20}" text-anchor="middle" class="label-2 map-t">${esc(v)}</text>`;
    }
    g += "</svg>";
    el.innerHTML = g;
    el.querySelectorAll("path.mark-hover").forEach((p) => {
      const r = s.routes[+p.dataset.i];
      p.addEventListener("pointermove", (ev) => showTip(ev.clientX, ev.clientY, `${r.from} → ${r.to}`, r.rows || [{ color: r.color || "var(--s1)", name: "Route", value: r.label || "" }], r.note));
      p.addEventListener("pointerleave", hideTip);
    });
  }

  /* =====================================================================================================
     Small multiples: one small line chart per entity on a shared y scale, so levels and shapes compare directly and
     no line needs its own colour (eight colours can't all be told apart). Each panel is a button.
     spec: { panels:[{title, value, sub, data:[[t,y]], on}], ref:{name, data:[[t,y]]}, y:{fmt}, height, minW, onClick(panel), empty } */
  function drawMulti(el, s, W) {
    if (!s) return;
    const panels = (s.panels || []).filter((p) => p.data.some((d) => d[1] != null && isFinite(d[1])));
    if (!panels.length) { el.innerHTML = `<div class="empty">${esc(s.empty || "No data to draw yet.")}</div>`; return; }
    const gap = 10, cols = Math.max(1, Math.min(panels.length, Math.floor((W + gap) / ((s.minW || 210) + gap))));
    const pw = Math.floor((W - gap * (cols - 1)) / cols), sw = pw - 22, ph = s.height || 104;
    const ok = (v) => v != null && isFinite(v);
    const vals = panels.flatMap((p) => p.data.map((d) => d[1])).concat((s.ref?.data || []).map((d) => d[1])).filter(ok);
    const xs = panels.flatMap((p) => p.data.map((d) => d[0])).concat((s.ref?.data || []).map((d) => d[0]));
    let y0 = Math.min(...vals), y1 = Math.max(...vals);
    const pad = (y1 - y0) * 0.08 || Math.abs(y1) * 0.1 || 1;
    y0 -= pad; y1 += pad;
    const yt = niceTicks(y0, y1, 3).filter((v) => v >= y0 && v <= y1);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const yf = s.y?.fmt || ((v) => silver(v)), yft = tick(yf);
    const ml = Math.max(...yt.map((v) => textW(yft(v), 10))) + 6, mt = 4, mb = 16, iw = Math.max(30, sw - ml - 4), ih = ph - mt - mb;
    const X = lin(x0, x1, ml, ml + iw), Y = lin(y0, y1, mt + ih, mt);
    const path = (data) => { let d = "", pen = false; for (const [x, y] of data) { if (!ok(y)) { pen = false; continue; } d += (pen ? "L" : "M") + X(x).toFixed(1) + "," + Y(y).toFixed(1); pen = true; } return d; };
    const refD = s.ref ? path(s.ref.data) : "";
    let h = `<div class="multi" style="grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${gap}px">`;
    panels.forEach((p, i) => {
      let g = `<svg viewBox="0 0 ${sw} ${ph}" width="${sw}" height="${ph}" aria-hidden="true">`;
      for (const v of yt) g += `<line class="gridline" x1="${ml}" x2="${ml + iw}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${ml - 4}" y="${Y(v) + 3}" text-anchor="end" style="font-size:10px">${esc(yft(v))}</text>`;
      g += `<text x="${ml}" y="${ph - 3}" style="font-size:10px">${esc(date(x0))}</text><text x="${ml + iw}" y="${ph - 3}" text-anchor="end" style="font-size:10px">${esc(date(x1))}</text>`;
      if (refD) g += `<path d="${refD}" fill="none" style="stroke:var(--text-3);stroke-width:1.25;stroke-dasharray:3 3"/>`;
      g += `<path d="${path(p.data)}" fill="none" style="stroke:${col(p.color || "s1")};stroke-width:2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const last = [...p.data].reverse().find((d) => ok(d[1]));
      if (last) g += `<circle cx="${X(last[0])}" cy="${Y(last[1])}" r="3.5" style="fill:${col(p.color || "s1")};stroke:var(--surface-2);stroke-width:2"/>`;
      g += `<line class="crosshair" x1="0" x2="0" y1="${mt}" y2="${mt + ih}" visibility="hidden"/><g class="hot"></g><rect class="hit" x="${ml}" y="${mt}" width="${iw}" height="${ih}"/></svg>`;
      h += `<button type="button" class="mp${p.on ? " on" : ""}" data-i="${i}" aria-pressed="${p.on ? "true" : "false"}" aria-label="${esc(`${p.title}: ${p.value ?? ""} ${p.sub ?? ""}`)}"><span class="mp-head"><span class="mp-title">${esc(p.title)}</span><span class="mp-val num">${esc(p.value ?? "")}</span></span><span class="mp-sub">${esc(p.sub ?? "")}</span>${g}</button>`;
    });
    el.innerHTML = h + "</div>";
    el.querySelectorAll(".mp").forEach((b) => {
      const p = panels[+b.dataset.i], svg = b.querySelector("svg"), hit = svg.querySelector(".hit"), ch = svg.querySelector(".crosshair"), hot = svg.querySelector(".hot");
      const px = p.data.filter((d) => ok(d[1])).map((d) => d[0]);
      hit.addEventListener("pointermove", (ev) => {
        const r = svg.getBoundingClientRect(), xv = X.inv((ev.clientX - r.left) * (sw / r.width));
        let best = px[0];
        for (const x of px) if (Math.abs(x - xv) < Math.abs(best - xv)) best = x;
        const v = p.data.find((d) => d[0] === best)?.[1], rv = s.ref?.data.find((d) => d[0] === best)?.[1];
        ch.setAttribute("x1", X(best)); ch.setAttribute("x2", X(best)); ch.setAttribute("visibility", "visible");
        hot.innerHTML = `<circle cx="${X(best)}" cy="${Y(v)}" r="4" style="fill:${col(p.color || "s1")};stroke:var(--surface-2);stroke-width:2"/>`;
        const rows = [{ color: p.color || "s1", name: p.title, value: yf(v) }];
        if (ok(rv)) rows.push({ color: "var(--text-3)", name: s.ref.name || "Reference", value: yf(rv) });
        showTip(ev.clientX, ev.clientY, date(best), rows, p.note?.(best));
      });
      hit.addEventListener("pointerleave", () => { ch.setAttribute("visibility", "hidden"); hot.innerHTML = ""; hideTip(); });
      if (s.onClick) b.addEventListener("click", () => { hideTip(); s.onClick(p); });
    });
  }

  /* ---------- inline sparkline (a string, for tiles and table cells) ---------- */
  function spark(values, { w = 120, h = 32, color = "s1", band = null, fill = true } = {}) {
    const v = values.filter((x) => x != null && isFinite(x));
    if (v.length < 2) return "";
    const lo = Math.min(...v, ...(band ? band.map((b) => b[0]) : [])), hi = Math.max(...v, ...(band ? band.map((b) => b[1]) : []));
    const X = (i) => 2 + (i * (w - 4)) / (values.length - 1), Y = (x) => h - 3 - ((x - lo) / (hi - lo || 1)) * (h - 6);
    let d = "", pen = false;
    values.forEach((x, i) => { if (x == null || !isFinite(x)) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(x).toFixed(1); pen = true; });
    const last = values.length - 1;
    const area = fill ? `<path d="${d}L${X(last)},${h}L${X(values.findIndex((x) => x != null))},${h}Z" style="fill:${col(color)};opacity:0.1"/>` : "";
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">${area}<path d="${d}" fill="none" style="stroke:${col(color)};stroke-width:1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }

  return {
    line: (el, s) => { const c = mount(el, drawLine); c.update(s); return c; },
    bars: (el, s) => { const c = mount(el, drawBars); c.update(s); return c; },
    scatter: (el, s) => { const c = mount(el, drawScatter); c.update(s); return c; },
    heat: (el, s) => { const c = mount(el, drawHeat); c.update(s); return c; },
    forest: (el, s) => { const c = mount(el, drawForest); c.update(s); return c; },
    map: (el, s) => { const c = mount(el, drawMap); c.update(s); return c; },
    multi: (el, s) => { const c = mount(el, drawMulti); c.update(s); return c; },
    spark, showTip, hideTip, niceTicks, seqColor, divColor, col,
  };
})();
