/* Albion Billionaire v2 — the shared page kit, and the play detail drawer: what a play is, what could happen, what
   every number rests on, and how sure we are. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.kit = (() => {
  const { esc, icon, silver, pct, int, aged, dateFull, D } = AB.util;
  const ui = AB.ui, cat = AB.cat, conf = AB.conf;

  function head({ eyebrow = "", title, sub = "", right = "" }) {
    return `<div class="page-head"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${right ? `<div class="row">${right}</div>` : ""}</div>`;
  }
  /* While the first load runs, a page shows its head and grey blocks. Returns true while the page should wait. */
  function waiting(root, h, shape = [8, 4, 12, 7, 5]) {
    if (AB.state.R) return false;
    if (AB.state.error && !AB.state.loading) {
      root.innerHTML = head(h) + `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">No market data yet</div><div class="small">${esc(AB.state.error.message || "Loading failed.")} Press reload in the top bar to try again.</div></div></div>`;
      return true;
    }
    root.innerHTML = head(h) + `<div class="grid" aria-busy="true">${shape.map((s) => `<div class="card span-${s}">${ui.skel(s === 12 ? 90 : 220)}</div>`).join("")}</div>`;
    return true;
  }
  function modeBanner(M) {
    if (!M || M.live) return "";
    return `<div class="banner warn">${icon("clock")}<div class="b-body"><div class="b-title">Saved snapshot, not live prices</div><div class="small">${esc(M.why)} It covers ${esc(dateFull(Date.parse(M.snapshot.start + "T00:00:00Z")))} to ${esc(dateFull(M.asOf))}. Every range is widened for its age and every confidence score is lowered for it. With internet on your own device, the app switches to live prices.</div></div></div>`;
  }
  const kindTag = (k) => { const m = AB.scan.KINDS[k]; return `<span class="kind"><i style="background:var(--${m.color})" aria-hidden="true"></i>${esc(m.short)}</span>`; };
  const zoneTag = (z) => (z === "red" ? ui.tag("Red zone", "skull", "risk-red") : z === "mists" ? ui.tag("Mists", "alert", "risk-red") : z === "city" ? ui.tag("In Caerleon", "shield", "risk-safe") : ui.tag("Safe zones", "shield", "risk-safe"));
  const LIMIT = { capital: "your capital", market: "what the market absorbs", supply: "what's for sale", weight: "your mount's weight", focus: "your daily focus" };
  const ic = (id) => { const p = cat.parse(id); const t = p.tier ? `${p.tier}.${p.ench}` : "?"; return `<span class="ic" aria-hidden="true"><span class="mono">${esc(t)}</span><img src="${cat.icon(id, 1, 64)}" alt="" loading="lazy" decoding="async"></span>`; };

  /* A shared scale for range bars in one list: zero to the 90th percentile of the highs, so one outlier can't squash the rest. */
  function scaleOf(opps) {
    const his = opps.map((o) => o.total.p90).sort((a, b) => a - b);
    const max = his.length ? his[Math.floor(0.9 * (his.length - 1))] : 1;
    const min = Math.min(0, ...opps.map((o) => o.total.p10).sort((a, b) => a - b).slice(Math.floor(opps.length * 0.1)));
    return { min: Math.max(min, -max * 0.6), max };
  }
  function oppRow(o, sc) {
    return `<div class="o-row" role="button" tabindex="0" data-opp="${esc(o.key)}" aria-label="${esc(o.title)}">
      <span class="o-n">${o.n}</span>
      <div class="o-main c-main">${ic(o.item)}<div style="min-width:0"><div class="o-title">${esc(o.title)}</div><div class="o-tags">${kindTag(o.kind)}${zoneTag(o.zone)}<span class="small muted">${int(o.qty)} units · limited by ${LIMIT[o.limit] || o.limit}${o.checks?.length ? ` · ${o.checks.length === 1 ? "a price" : `${o.checks.length} prices`} out of line with sales` : ""}</span></div></div></div>
      <div class="o-profit c-profit"><b>${esc(silver(o.total.p50, { sign: true }))}</b><span class="rb-wrap">${ui.rangeBar(o.total.p10, o.total.p50, o.total.p90, { min: sc.min, max: sc.max, w: 104 })}<span>${esc(silver(o.total.p10))} to ${esc(silver(o.total.p90))}</span></span></div>
      <div class="r num c-hour">${esc(silver(o.perHour))}<div class="small muted">an hour</div></div>
      <div class="r num c-odds" title="Chance it makes money">${pct(o.mc.pWin)}</div>
      <div class="r num c-cap">${esc(silver(o.capital))}</div>
      <div class="r c-conf">${ui.conf(o)}</div>
    </div>`;
  }
  const oppHead = () => `<div class="o-head" aria-hidden="true"><span>#</span><span>Play</span><span>Profit per batch (80% range)</span><span class="r">Per hour</span><span class="r c-odds">Pays</span><span class="r c-cap">Capital</span><span class="r">Confidence</span></div>`;
  function pickRow(o, i, sub = "") {
    return `<div class="pick" role="button" tabindex="0" data-opp="${esc(o.key)}"><span class="p-n">${i}</span><div style="min-width:0"><div class="p-title">${esc(o.title)}</div><div class="p-sub">${kindTag(o.kind)}${sub}</div></div><div class="p-right"><span class="p-val">${esc(silver(o.total.p50, { sign: true }))}</span>${ui.conf(o, { label: false })}</div></div>`;
  }
  /* Open plays from any list: click or Enter on [data-opp]. */
  function wireOpps(root) {
    const open = (el) => { const o = AB.state.R?.opps.find((x) => x.key === el.dataset.opp); if (o) openOpp(o); };
    root.addEventListener("click", (e) => { const el = e.target.closest("[data-opp]"); if (el && root.contains(el)) open(el); });
    root.addEventListener("keydown", (e) => { if (e.key !== "Enter" && e.key !== " ") return; const el = e.target.closest("[data-opp]"); if (el) { e.preventDefault(); open(el); } });
  }

  /* ---------- the confidence gauge ---------- */
  function gauge(score) {
    const t = conf.tier(score), r = 36, c = 2 * Math.PI * r;
    const col = { high: "var(--good)", med: "var(--warning)", low: "var(--serious)", vlow: "var(--critical)" }[t.key];
    return `<div class="gauge" role="img" aria-label="Confidence ${score} out of 100, ${t.label}"><svg viewBox="0 0 88 88"><circle cx="44" cy="44" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="8"/><circle cx="44" cy="44" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}"/></svg><div class="g-num"><div>${score}<small>${esc(t.label)}</small></div></div></div>`;
  }
  /* One honest sentence on why the score is what it is: the two weakest checks, in words. */
  function verdict(o) {
    const words = {
      fresh: "the prices are old", liquidity: "the market is thin", history: "there's little sales history", agree: "the listings don't match recent sales",
      odds: "the simulated odds are mixed", evidence: o.kind === "refine" || o.kind === "craft" || o.kind === "flip" ? "this kind of play hasn't been backtested" : "the backtest for this kind of play is weak",
    };
    const good = { fresh: "fresh prices", liquidity: "a busy market", history: "plenty of history", agree: "listings that match recent sales", odds: "good simulated odds", evidence: "a strong backtest" };
    const sorted = o.factorList.slice().sort((a, b) => a.value - b.value);
    const weak = sorted.filter((f) => f.value < 0.6).slice(0, 2).map((f) => words[f.key]);
    const strong = sorted.slice().reverse().filter((f) => f.value >= 0.75).slice(0, 2).map((f) => good[f.key]);
    const t = o.tier.label;
    let s = `<b>${esc(t)} confidence.</b> `;
    if (strong.length) s += `It has ${strong.join(" and ")}`;
    if (weak.length) s += `${strong.length ? ", but " : "It's held back because "}${weak.join(" and ")}.`;
    else s += strong.length ? "." : "Every check is middling.";
    return s + ` The profit range is a separate thing: 80% of simulated outcomes land between <b>${esc(silver(o.total.p10))}</b> and <b>${esc(silver(o.total.p90))}</b>.`;
  }

  /* ---------- price history and the calibrated forecast for one market ---------- */
  function priceSpec(M, id, city, { listing = null, h = 7, label = "" } = {}) {
    const pts = M.series(id, city);
    const st = M.stat(id, city);
    const H = Math.max(7, Math.ceil(h) + 1);
    const fx = [];
    for (let k = 1; k <= H; k++) fx.push(M.asOf + k * D);
    const b80 = st.pred ? fx.map((x, i) => [x, conf.priceAt(st, i + 1, 0.1), conf.priceAt(st, i + 1, 0.9)]) : [];
    const b50 = st.pred ? fx.map((x, i) => [x, conf.priceAt(st, i + 1, 0.25), conf.priceAt(st, i + 1, 0.75)]) : [];
    const mid = st.pred ? [[M.asOf, pts.length ? pts[pts.length - 1].price : st.pred], ...fx.map((x, i) => [x, conf.priceAt(st, i + 1, 0.5)])] : [];
    const series = [{ name: "Daily average sale", color: "s1", data: pts.map((p) => [p.t, p.price]) }];
    if (mid.length) series.push({ name: "Forecast middle", color: "s1", dash: "4 4", data: mid });
    /* the listing sits where it was seen: now when live, at the snapshot's end when not */
    const seen = listing && listing.ageH != null && isFinite(listing.ageH) ? M.now - listing.ageH * 36e5 : M.live ? M.now : M.asOf;
    const fresh = M.live && (listing?.ageH ?? 0) < 24;
    if (listing) series.push({ name: listing.side === "buy" ? (fresh ? "Buy order now" : "Last buy order seen") : fresh ? "Cheapest listing now" : "Last listing seen", color: "s2", dots: true, data: [[Math.max(pts.length ? pts[0].t : M.asOf - 27 * D, Math.min(seen, fx[fx.length - 1])), listing.price]] });
    const spec = {
      label: label || `${cat.label(id)} in ${city}`, height: 220,
      x: { type: "time", min: pts.length ? pts[0].t : M.asOf - 27 * D, max: fx[fx.length - 1] },
      y: { zero: false },
      series, bands: [{ name: "80% range", color: "s1", opacity: 0.12, data: b80 }, { name: "50% range", color: "s1", opacity: 0.22, data: b50 }],
      vlines: [{ x: M.asOf, label: "last full day" }],
      tooltip: { title: (t) => dateFull(t) },
    };
    const legend = [{ name: "Daily average sale", color: "s1", kind: "line" }];
    if (mid.length) legend.push({ name: "80% / 50% forecast range", color: "s1", kind: "band" });
    if (listing) legend.push({ name: series[series.length - 1].name, color: "s2", kind: "dot" });
    const table = {
      cols: [{ label: "Day" }, { label: "Average sale", r: true }, { label: "Sold", r: true }, { label: "80% range", r: true }],
      rows: [...pts.map((p) => [dateFull(p.t), silver(p.price), int(p.count), ""]), ...b80.map((b, i) => [dateFull(b[0]) + " (forecast)", silver(mid[i + 1]?.[1]), "", `${silver(b[1])} – ${silver(b[2])}`])],
    };
    return { spec, legend, table, st };
  }

  /* ---------- the drawer ---------- */
  function openOpp(o) {
    const M = AB.state.M;
    if (!M) return;
    const xs = AB.scan.samples(o, 2000).sort((a, b) => a - b);
    const legs = o.legs.filter((lg) => lg.id && lg.city);
    /* the market you sell in, then the costliest market you buy in; one chart when they're the same market (a dip
       or an order flip buys and sells the same item in the same city) */
    const sellLeg = legs.find((lg) => lg.role === "sell");
    const chartLegs = [sellLeg, ...legs.filter((lg) => lg.role !== "sell").sort((a, b) => (pointCost(b) - pointCost(a)))]
      .filter((lg, i, a) => lg && a.findIndex((x) => x && x.id === lg.id && x.city === lg.city) === i).slice(0, 2);
    const both = sellLeg && legs.some((lg) => lg.role !== "sell" && lg.id === sellLeg.id && lg.city === sellLeg.city);
    const kp = [
      ui.kpi({ label: `Profit, ${int(o.qty)} units`, value: esc(silver(o.total.p50, { sign: true })), range: `80%: ${esc(silver(o.total.p10))} to ${esc(silver(o.total.p90))}` }),
      ui.kpi({ label: "Per hour", value: esc(silver(o.perHour)), range: `${o.hours.toFixed(1)} h for the batch` }),
      ui.kpi({ label: "Chance it pays", value: pct(o.mc.pWin), range: o.odds ? `Gap lasts a day: ${pct(o.odds.p)}` : "from the simulation" }),
      ui.kpi({ label: "Capital", value: esc(silver(o.capital)), range: `limited by ${esc(LIMIT[o.limit] || o.limit)}` }),
    ].join("");
    /* each price: what the plan uses, the order on the book behind it when the plan doesn't use that order as it is
       (your own orders in a flip, and orders the sale check found out of line with sales), and its calibrated range */
    const legRows = o.legs.map((lg) => {
      const st = lg.st, l = lg.l;
      const r80 = st?.pred ? conf.range(st, lg.h || M.h0) : null;
      const age = l ? (M.live ? aged(l.ageH == null ? null : l.ageH * 36e5) : "last snapshot day") : "";
      const now = lg.own ? `${silver(lg.fixed ?? l.price)} (your order)` : lg.fixed != null ? `${silver(lg.fixed)} (your order)` : l ? (l.off ? `${silver(l.price)} (from sales)` : `${silver(l.price)} · ${age}`) : lg.custom ? `${silver(lg.point)} expected` : "no listing";
      const what = l?.src === "snapshot" ? "Last day's average sale" : l?.side === "buy" ? (lg.city === cat.BM ? "Buy order" : "Best buy order") : "Cheapest sell order";
      const book = l && (lg.own || l.off) ? `<small${l.off ? ' class="l-off"' : ""}>${what}: ${esc(silver(l.raw))}${l.src === "snapshot" ? "" : ` · ${esc(age)}`}${l.off ? `, ${l.off < 0 ? "below" : "above"} the range it sells in` : ""}</small>` : "";
      return `<div class="leg"><div class="l-what"><b>${esc(lg.label || "")}</b>${lg.id ? ` · ${esc(cat.label(lg.id))}` : ""}${lg.city ? ` · ${esc(lg.city)}` : ""}${lg.n ? ` · ×${int(lg.n)}` : ""}</div><div class="l-val">${esc(now)}${book}<small>${r80 ? `80% range when you act: ${esc(silver(r80.lo))} – ${esc(silver(r80.hi))}` : lg.custom ? "drawn from the backtested rebound" : "no sales history to calibrate"}</small></div></div>`;
    }).join("");
    const html = `
      <div class="d-kpis">${kp}</div>
      ${ui.card({ title: "How sure is this?", sub: "Six checks, blended into one score. The profit range above is calibrated separately.", body: `<div class="verdict">${gauge(o.score)}<div class="verdict-text">${verdict(o)}</div></div>${ui.factors(o.factorList)}`, foot: `<a href="#/trust">How the score and the ranges are built</a>` })}
      ${ui.chartCard({ id: "d-hist", title: "What could happen", sub: `2,000 simulated runs of this batch. Bars left of zero lose silver.`, height: 200 })}
      ${ui.card({ title: "Step by step", body: `<ol class="steps">${o.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` })}
      ${ui.card({ title: "What each price rests on", body: `<div class="legs">${legRows}</div>${o.checks?.length ? `<div class="callout sale-check">${icon("alert")}<div><b>Checked against what sold.</b> ${o.checks.map(esc).join(" ")}</div></div>` : ""}` })}
      ${chartLegs.map((lg, i) => ui.chartCard({ id: `d-leg${i}`, title: `${cat.label(lg.id)} in ${lg.city}`, sub: `${lg.role !== "sell" ? "Where you buy" : both ? "Where you buy and sell" : "Where you sell"}: four weeks of daily sales and the calibrated range for the next week.`, height: 220 })).join("")}
      ${evidenceCard(o)}
      <div class="row"><button class="btn primary" type="button" data-log>${icon("plus")}Log this trade</button><a class="btn" href="#/markets/${encodeURIComponent(o.item)}">${icon("chart")}Open ${esc(cat.shortName(o.item))} in Markets</a></div>
      <p class="small muted">Not included: station fees for crafting, refining and enchanting, travel risk beyond what the zone tag says, and buy or sell orders filling at a different price than listed. Check the order book in game before you commit.</p>`;
    ui.drawer.open({
      label: o.title,
      title: `<div class="d-head">${ui.item(o.item, { sub: esc(o.meta.name) })}<div class="d-title">${esc(o.title)}</div><div class="d-tags">${kindTag(o.kind)}${zoneTag(o.zone)}${ui.conf(o)}</div></div>`,
      html,
      onMount: (body) => {
        plotHist("d-hist", xs);
        chartLegs.forEach((lg, i) => {
          /* the order on the book, at its own price, even when the plan priced it from sales (it shows outside the range) */
          const ps = priceSpec(M, lg.id, lg.city, { listing: lg.l ? { ...lg.l, price: lg.l.raw ?? lg.l.price } : null, h: lg.h || M.h0 });
          ui.plot(`d-leg${i}`, "line", ps.spec, { legend: ps.legend, table: ps.table });
        });
        plotEvidence(o);
        body.querySelector("[data-log]").addEventListener("click", () => logTrade(o));
      },
    });
  }
  const pointCost = (lg) => (lg.l?.price || lg.st?.pred || 0) * (lg.n || 1);

  /* xs sorted. The middle 98% is cut into 24 buckets; the rarest 1% at each end joins the end bucket. */
  function plotHist(id, xs) {
    if (!xs.length) return;
    const lo = xs[Math.floor(0.01 * (xs.length - 1))], hi = xs[Math.floor(0.99 * (xs.length - 1))];
    const nb = 24, w = (hi - lo) / nb || 1;
    const counts = new Array(nb).fill(0);
    for (const x of xs) counts[Math.max(0, Math.min(nb - 1, Math.floor((x - lo) / w)))]++;
    const mids = counts.map((_, i) => lo + w * (i + 0.5));
    const cats = mids.map((m) => silver(m));
    const span = (i) => (i === 0 ? `${silver(lo + w)} or less` : i === nb - 1 ? `${silver(hi - w)} or more` : `${silver(lo + w * i)} to ${silver(lo + w * (i + 1))}`);
    ui.plot(id, "bars", {
      categories: cats, height: 200,
      series: [{ name: "Share of runs", values: counts.map((c) => c / xs.length) }],
      colors: mids.map((m) => (m < 0 ? "var(--div-neg)" : "var(--div-pos)")),
      fmt: (v) => pct(v, 0), tipFmt: (v) => pct(v, 1),
      notes: mids.map((_, i) => `Profit ${span(i)}`),
    }, {
      legend: [{ name: "Loses silver", color: "var(--div-neg)" }, { name: "Makes silver", color: "var(--div-pos)" }],
      table: { cols: ["Profit bucket", { label: "Share of runs", r: true }], rows: mids.map((_, i) => [span(i), pct(counts[i] / xs.length, 1)]) },
    });
  }

  function evidenceCard(o) {
    const sub = o.evidence?.text || "No backtest covers this kind of play yet.";
    if (["bm", "haul", "redhaul", "forge", "dip"].includes(o.kind)) return ui.chartCard({ id: "d-ev", title: "What the backtest says", sub: esc(sub), height: 200 });
    return ui.card({ title: "What the backtest says", body: `<p class="small">${esc(sub)}</p>` });
  }
  function plotEvidence(o) {
    const I = conf.insights;
    if (["bm", "haul", "redhaul"].includes(o.kind) && o.odds) {
      const dest = o.kind === "haul" ? "royal" : "bm";
      const curves = I.survival.curves[dest] || {};
      const bands = I.survival.bands;
      const series = bands.map((b, i) => (curves[b] ? { name: `Gap ${b}`, color: `s${i + 1}`, width: b === o.odds.band ? 3 : 1.5, muted: b !== o.odds.band, data: curves[b].map((v, k) => [k + 1, v]) } : null)).filter(Boolean);
      ui.plot("d-ev", "line", {
        height: 200, x: { type: "linear", fmt: (v) => `day ${v}`, min: 1, max: 5, ticks: [1, 2, 3, 4, 5] }, y: { fmt: (v) => pct(v), min: 0.4, max: 1 },
        series, tooltip: { title: (v) => `${v} day${v > 1 ? "s" : ""} later` }, endLabels: true,
      }, {
        legend: series.map((s) => ({ name: s.name + (s.muted ? "" : " (this play)"), color: s.muted ? "var(--deemph)" : s.color, kind: "line" })),
        table: { cols: ["Gap", "Day 1", "Day 2", "Day 3", "Day 4", "Day 5"].map((l, i) => ({ label: l, r: i > 0 })), rows: bands.filter((b) => curves[b]).map((b) => [b, ...curves[b].map((v) => pct(v))]) },
      });
      return;
    }
    if (o.kind === "forge") {
      const mat = o.extra.up.mat;
      const a = conf.enchantEvidence(mat, "bm"), b = conf.enchantEvidence(mat, "same");
      if (!a) { const el = document.getElementById("d-ev"); if (el) el.querySelector(".chart").innerHTML = ui.empty("No backtest for this material."); return; }
      const months = a.winByMonth.map((x) => x[0]);
      const series = [{ name: "Sell to the Black Market", color: "s2", dots: true, data: a.winByMonth.map(([m, v]) => [Date.parse(m + "-15"), v]) }];
      if (b) series.push({ name: "Sell in the city you bought in", color: "s1", dots: true, data: b.winByMonth.map(([m, v]) => [Date.parse(m + "-15"), v]) });
      ui.plot("d-ev", "line", { height: 200, x: { type: "time", ticks: [...new Set(series.flatMap((se) => se.data.map((d) => d[0])))].sort((p, q) => p - q), fmt: AB.util.month }, y: { min: 0, max: 1, fmt: (v) => pct(v) }, series, tooltip: { title: AB.util.monthYear } }, {
        legend: series.map((s) => ({ name: s.name, color: s.color, kind: "line" })),
        table: { cols: ["Month", { label: "Black Market", r: true }, { label: "Same city", r: true }], rows: months.map((m, i) => [m, pct(a.winByMonth[i][1]), b ? pct((b.winByMonth.find((x) => x[0] === m) || [0, null])[1]) : "—"]) },
      });
      return;
    }
    if (o.kind === "dip") {
      const P = I.rebound.paths.dip;
      ui.plot("d-ev", "line", {
        height: 200, x: { type: "linear", fmt: (v) => (v === 0 ? "dip day" : (v > 0 ? "+" : "") + v + "d") }, y: { fmt: (v) => AB.util.spct(Math.exp(v) - 1), zero: false },
        series: [{ name: "Average path", color: "s5", data: P.k.map((k, i) => [k, P.mean[i]]) }],
        bands: [{ name: "Middle half of cases", color: "s5", opacity: 0.18, data: P.k.map((k, i) => [k, P.q25[i], P.q75[i]]) }],
        hlines: [{ y: 0, label: "two-week median" }],
        tooltip: { title: (v) => (v === 0 ? "The dip day" : `${v > 0 ? v + " days after" : -v + " days before"}`) },
      }, {
        legend: [{ name: "Average path vs the two-week median", color: "s5", kind: "line" }, { name: "Middle half of cases", color: "s5", kind: "band" }],
        table: { cols: ["Day", { label: "Average", r: true }, { label: "25th pct", r: true }, { label: "75th pct", r: true }], rows: P.k.map((k, i) => [k, AB.util.spct(Math.exp(P.mean[i]) - 1, 1), AB.util.spct(Math.exp(P.q25[i]) - 1, 1), AB.util.spct(Math.exp(P.q75[i]) - 1, 1)]) },
      });
    }
  }

  function logTrade(o) {
    ui.ask({
      title: "Log this trade",
      ok: "Log it",
      html: `<p class="small">Log what you actually did. When it's done, add the result on the Ledger page and the app checks whether it landed inside the range it promised.</p>
        <div class="form-grid">
          <label class="field"><span>Units</span><input class="input" name="qty" type="number" min="1" step="1" value="${o.qty}"></label>
          <label class="field"><span>Silver spent</span><input class="input" name="cost" type="number" min="0" step="any" value="${Math.round(o.capital)}"></label>
        </div>
        <label class="field"><span>Note (optional)</span><input class="input" name="note" type="text" maxlength="140" placeholder="e.g. bought 3 below the listing"></label>`,
      onOk: (fd) => {
        const qty = Math.max(1, +fd.get("qty") || o.qty), k = qty / o.qty;
        /* an empty field means the plan's capital; 0 is a real answer (items you already owned) */
        const spent = String(fd.get("cost") ?? "").trim(), cost = spent === "" || !(+spent >= 0) ? o.capital : +spent;
        AB.store.addTrade({ key: o.key, title: o.title, kind: o.kind, item: o.item, qty, cost, note: String(fd.get("note") || "").slice(0, 140), pred: { p10: o.total.p10 * k, p50: o.total.p50 * k, p90: o.total.p90 * k }, score: o.score, result: null });
        AB.util.toast("Logged. Add the result on the Ledger page when it's done.");
      },
    });
  }

  /* The road to the goal as a fan of net worth: the middle path, the middle half and 80% of the simulated paths,
     and the goal line. Command and Planner draw it from the same forecast. */
  function fanChart(id, res, { goal, height }) {
    const days = res.days, step = Math.max(1, Math.round(days / 150));
    const idx = [];
    for (let d = 0; d <= days; d += step) idx.push(d);
    if (idx[idx.length - 1] !== days) idx.push(days);
    const t = (d) => Date.now() + d * D;
    ui.plot(id, "line", {
      label: "Net worth paths", height, x: { type: "time" }, y: { fmt: (v) => silver(v), min: 0 },
      bands: [
        { name: "80% of paths", color: "s1", opacity: 0.12, data: idx.map((d) => [t(d), res.fan[d][0], res.fan[d][4]]) },
        { name: "Middle half", color: "s1", opacity: 0.24, data: idx.map((d) => [t(d), res.fan[d][1], res.fan[d][3]]) },
      ],
      series: [{ name: "Middle path", color: "s1", data: idx.map((d) => [t(d), res.fan[d][2]]) }],
      hlines: [{ y: goal, label: `${silver(goal)} goal`, color: "var(--gold)" }],
      tooltip: { title: (x) => dateFull(x) },
    }, {
      legend: [{ name: "Middle path", color: "s1", kind: "line" }, { name: "Middle half and 80% of paths", color: "s1", kind: "band" }, { name: "Goal", color: "var(--gold)", kind: "line" }],
      table: { cols: ["Date", { label: "10%", r: true }, { label: "25%", r: true }, { label: "Middle", r: true }, { label: "75%", r: true }, { label: "90%", r: true }], rows: idx.filter((_, i) => i % 5 === 0).map((d) => [dateFull(t(d)), ...res.fan[d].map((v) => silver(v))]) },
    });
  }

  /* What a restored backup says, given how many of its parts (settings, or the ledger) were refused. */
  const restored = (refused) => (refused ? `Backup restored. ${refused} part${refused === 1 ? " wasn't" : "s weren't"} valid, so ${refused === 1 ? "that part keeps" : "those keep"} what you had.` : "Backup restored.");

  return { head, waiting, modeBanner, kindTag, zoneTag, LIMIT, ic, scaleOf, oppRow, oppHead, pickRow, wireOpps, gauge, verdict, priceSpec, openOpp, plotHist, fanChart, restored };
})();
