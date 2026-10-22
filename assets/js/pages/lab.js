/* Albion Billionaire v2 — Edge Lab: what 200 days of market history say about strategies, tested on months the
   models never saw. Real edges get a "real" stamp; popular beliefs that fail the test get a "busted" one. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.lab = (() => {
  let liq = 3, dest = "bm";
  return {
    title: "Edge Lab",
    render(root) {
      const { esc, icon, silver, pct, spct, int, dateFull } = AB.util;
      const ui = AB.ui, kit = AB.kit, conf = AB.conf;
      const H = { eyebrow: "Edge Lab", title: "What 200 days of trades say", sub: "" };
      const I = conf.insights;
      if (!I) { if (kit.waiting(root, H)) return; }
      const src = I.source;
      H.sub = `${int(src.rows)} daily price records for ${int(src.items)} items on the ${esc(src.server)} server, ${esc(dateFull(Date.parse(src.from + "T00:00:00Z")))} to ${esc(dateFull(Date.parse(src.to + "T00:00:00Z")))}. Every idea below was fitted on the early months and tested on months it never saw. Some edges are real; some popular ones are myths.`;
      const stamp = (k) => (k === "real" ? `<span class="stamp real">${icon("check")}Real edge</span>` : k === "busted" ? `<span class="stamp busted">${icon("myth")}Busted</span>` : `<span class="stamp edge">${icon("bolt")}Use it</span>`);
      const ex = (v) => Math.exp(v) - 1;

      /* hero numbers, straight from the data */
      const crashRow = I.rebound.table[1], busy = [crashRow.byLiq[2], crashRow.byLiq[3]].filter(Boolean);
      const crashN = busy.reduce((a, x) => a + x.n, 0);
      const crashF7 = busy.reduce((a, x) => a + x.f7 * x.n, 0) / crashN, crashWin = busy.reduce((a, x) => a + x.beatFees * x.n, 0) / crashN;
      const forge = Object.entries(I.enchant.byMat).filter(([k, v]) => k.endsWith("|bm") && v.n >= 100).sort((a, b) => b[1].win - a[1].win)[0];
      const bm = I.bmPremium, wd = I.weekday, sv = I.survival;
      const since = AB.util.month(Date.parse(I.index.base + "-15")), nMonths = I.index.months.length;

      root.innerHTML = `
        ${kit.head(H)}
        <section class="card span-12" style="margin-bottom:16px"><div class="lab-hero">
          <div class="lab-stat"><div class="finding num">${esc(spct(ex(crashF7), 1))}</div><div class="finding-sub">average price over the next week after a 25–40% crash in a busy market. It beat today's price plus fees ${pct(crashWin)} of the time (${int(crashN)} crashes).</div></div>
          <div class="lab-stat"><div class="finding num">${esc(spct(ex(bm.median)))}</div><div class="finding-sub">the Black Market's median price over the royal cities for the same item and day. Positive ${pct(bm.share)} of the time, ${int(bm.items)} items.</div></div>
          <div class="lab-stat"><div class="finding num">${pct(forge[1].win)}</div><div class="finding-sub">of days, upgrading gear with ${esc(forge[0].slice(0, 2) + " " + forge[0].split("|")[0].slice(3).toLowerCase())}s and selling to the Black Market cleared a 5% margin (${forge[1].n} item-city pairs).</div></div>
          <div class="lab-stat"><div class="finding num">${wd.oos.corr.toFixed(2)}</div><div class="finding-sub">how well each market's weekday pattern in the first half of the data predicted the second half (median correlation; 0 means not at all, across ${int(wd.oos.series)} item-markets).</div></div>
        </div></section>
        <div class="grid">
          ${ui.chartCard({ id: "l-rebound", span: 7, kicker: stamp("real"), title: "Crashes come back, spikes fade", sub: "Average price over the next 7 days compared with today's, by how far today's price sits from its two-week median.", height: 260,
            actions: ui.seg("liq", conf.LIQ_LABEL.map((l, i) => [i, l + "/day"]), liq, "Market size"),
            below: `<div class="callout how"><b>How to use it:</b> a crash of 25% or more in a market that sells 20+ a day is a buy signal; the Opportunities page lists them as Panic buys. A spike of 25% or more is a sell signal if you hold the item, and a reason not to buy into it. Small moves (under 8%) are noise.</div>` })}
          ${ui.chartCard({ id: "l-paths", span: 5, kicker: stamp("real"), title: "The shape of a crash and a spike", sub: "Average path around 15–40% moves in markets selling 20+ a day, against the two-week median. Shaded: the middle half of cases.", height: 260 })}
          ${ui.chartCard({ id: "l-bm", span: 7, kicker: stamp("real"), title: "The Black Market premium, week by week", sub: "Median of the Black Market's price over the royal-city median for the same item and day. Shaded: the middle half of items.", height: 240,
            below: `<div class="callout how"><b>How to use it:</b> the premium is steady (it barely moved in ${nMonths} months) and sticky for each item: an item with a big premium today keeps much of it tomorrow (day-to-day correlation ${bm.lag1.toFixed(2)}). That is why hauling to the Black Market works week after week, and why a premium far above an item's usual one is the gap to chase.</div>` })}
          ${ui.chartCard({ id: "l-bmhist", span: 5, title: "How the premium is spread", sub: "Share of item-days by Black Market premium. Left of zero, the Black Market paid less than the royal cities.", height: 240 })}
          ${ui.chartCard({ id: "l-forge", span: 7, kicker: stamp("edge"), title: "Enchant forge: which materials pay", sub: "Share of days an upgrade cleared a 5% margin after tax, by material. Blue: sold to the Black Market. Grey: sold in the city where you bought.", height: 300,
            below: `<div class="callout how"><b>How to use it:</b> the Black Market is what makes upgrading pay. Mid-tier relics and T7 souls cleared the bar almost every day; T8 souls and relics almost never did, because the T8 materials cost more than the Black Market adds. The Opportunities page prices every upgrade live as the Forge strategy.</div>` })}
          ${ui.card({ span: 5, title: "The best forge combos in the backtest", sub: "Upgrade, buy city and sale to the Black Market; median profit per item.", body: `<div class="table-wrap"><table class="t"><thead><tr><th>Upgrade</th><th class="r">Won</th><th class="r">Margin</th><th class="r">Profit</th></tr></thead><tbody>${I.enchant.top.slice(0, 9).map((t) => `<tr><td>${ui.item(t.item, { sub: `${esc(t.mat.slice(0, 2) + " " + t.mat.slice(3).toLowerCase())}s · bought in ${esc(t.buy)}`, small: true })}</td><td class="r num">${pct(t.win)}</td><td class="r num">${pct(t.margin)}</td><td class="r num">${esc(silver(t.profit))}</td></tr>`).join("")}</tbody></table></div>` })}
          ${ui.chartCard({ id: "l-surv", span: 6, kicker: stamp("real"), title: "Gaps don't vanish overnight", sub: "Chance a price gap between two markets still beats fees 1 to 5 days later, by the size of the gap today (markets selling 20+ a day).", height: 240,
            actions: ui.seg("dest", [["royal", "Royal city"], ["caerleon", "Caerleon"], ["bm", "Black Market"]], dest, "Destination"),
            below: `<div class="callout how"><b>How to use it:</b> a 30%+ gap into the Black Market is still there the next day more than 9 times in 10, so you have time to buy, travel and sell. Small gaps between royal cities fade fast: act the same day or skip them.</div>` })}
          ${ui.chartCard({ id: "l-vol", span: 6, kicker: stamp("real"), title: "Weekends move more stuff", sub: "Items sold on each weekday compared with that week's average.", height: 240,
            below: `<div class="callout how"><b>How to use it:</b> list on Friday so your orders are up for the weekend rush; sell orders fill faster on Saturday and Sunday. Prices don't follow the same pattern (next chart), so this is about speed, not price.</div>` })}
          ${ui.chartCard({ id: "l-wd", span: 6, kicker: stamp("busted"), title: 'Myth: "buy midweek, sell on Sunday"', sub: "Each item-market's weekday price swing measured on one half of the data (in sample) and then checked on the other half (out of sample), grouped from the steadiest to the wildest swings.", height: 240,
            below: `<div class="callout how"><b>The verdict:</b> the swings look big in hindsight, but the pattern doesn't repeat. Out of sample the weekday edge is about ${pct(wd.oos.outOfSample, 1)}, smaller than the ${pct(I.fee, 1)} in fees. Don't time purchases by weekday.</div>` })}
          ${ui.chartCard({ id: "l-lead", span: 6, kicker: stamp("busted"), title: 'Myth: "raw prices tell you where refined prices go"', sub: `Correlation between 3-day moves in raw and refined prices, with refined shifted from 6 days before to 6 days after (${I.leadLag.pairs} raw/refined pairs in their bonus cities).`, height: 240,
            below: `<div class="callout how"><b>The verdict:</b> every correlation is within a few hundredths of zero. Raw and refined move independently day to day, so refine when the margin is there today, not on a hunch about tomorrow.</div>` })}
          ${ui.chartCard({ id: "l-index", span: 12, title: `${nMonths} months of prices`, sub: `Typical price change since ${since} (the flat line) for the same items, weighted by how many each sold in ${since}. Gear barely moved; raw materials drifted up.`, height: 240 })}
        </div>`;

      const drawRebound = () => {
        const rows = I.rebound.table.map((r) => ({ label: r.bucket, x: r.byLiq[liq] }));
        const ok = rows.filter((r) => r.x);
        ui.plot("l-rebound", "bars", {
          categories: ok.map((r) => r.label), height: 260,
          series: [{ name: "Next 7 days vs today", values: ok.map((r) => ex(r.x.f7)) }],
          colors: ok.map((r) => (r.x.f7 < 0 ? "var(--div-neg)" : "var(--div-pos)")),
          fmt: (v) => spct(v), tipFmt: (v) => spct(v, 1),
          notes: ok.map((r) => `${int(r.x.n)} cases. ${r.label === "flat" ? "" : `Beat fees in the trade direction ${pct(r.x.beatFees)} of the time.`}`),
        }, {
          legend: [{ name: "Price rose after", color: "var(--div-pos)" }, { name: "Price fell after", color: "var(--div-neg)" }],
          table: { cols: ["Today vs 2-week median", { label: "Next 7 days", r: true }, { label: "Beat fees", r: true }, { label: "Cases", r: true }], rows: ok.map((r) => [r.label, spct(ex(r.x.f7), 1), pct(r.x.beatFees), int(r.x.n)]) },
        });
      };
      drawRebound();
      ui.onSeg(root, "liq", (v) => { liq = +v; drawRebound(); });

      const P = I.rebound.paths;
      ui.plot("l-paths", "line", {
        height: 260, x: { type: "linear", fmt: (v) => (v === 0 ? "day 0" : (v > 0 ? "+" : "") + v) }, y: { fmt: (v) => spct(v), zero: false },
        series: [{ name: "After a crash", color: "s1", data: P.dip.k.map((k, i) => [k, ex(P.dip.mean[i])]) }, { name: "After a spike", color: "s2", data: P.spike.k.map((k, i) => [k, ex(P.spike.mean[i])]) }],
        bands: [{ name: "Crash, middle half", color: "s1", opacity: 0.14, data: P.dip.k.map((k, i) => [k, ex(P.dip.q25[i]), ex(P.dip.q75[i])]) }, { name: "Spike, middle half", color: "s2", opacity: 0.14, data: P.spike.k.map((k, i) => [k, ex(P.spike.q25[i]), ex(P.spike.q75[i])]) }],
        hlines: [{ y: 0, label: "two-week median" }], endLabels: true,
        tooltip: { title: (v) => (v === 0 ? "The day of the move" : v > 0 ? `${v} days after` : `${-v} days before`), fmt: (v) => spct(v, 1) },
      }, {
        legend: [{ name: `After a crash (${int(P.dip.n)})`, color: "s1", kind: "line" }, { name: `After a spike (${int(P.spike.n)})`, color: "s2", kind: "line" }],
        table: { cols: ["Day", { label: "Crash avg", r: true }, { label: "Spike avg", r: true }], rows: P.dip.k.map((k, i) => [k, spct(ex(P.dip.mean[i]), 1), spct(ex(P.spike.mean[i]), 1)]) },
      });

      const wk = bm.weekly.map(([d, m, a, b, v]) => ({ t: Date.parse(d + "T00:00:00Z"), m, a, b, v }));
      ui.plot("l-bm", "line", {
        height: 240, x: { type: "time" }, y: { fmt: (v) => spct(v), min: 0 },
        series: [{ name: "Median premium", color: "s1", data: wk.map((w) => [w.t, ex(w.m)]) }],
        bands: [{ name: "Middle half of items", color: "s1", opacity: 0.16, data: wk.map((w) => [w.t, ex(w.a), ex(w.b)]) }],
        tooltip: { title: (t) => "Week of " + dateFull(t), fmt: (v) => spct(v, 1) },
      }, {
        legend: [{ name: "Median premium", color: "s1", kind: "line" }, { name: "Middle half of items", color: "s1", kind: "band" }],
        table: { cols: ["Week", { label: "Median", r: true }, { label: "25%", r: true }, { label: "75%", r: true }], rows: wk.map((w) => [dateFull(w.t), spct(ex(w.m), 1), spct(ex(w.a), 1), spct(ex(w.b), 1)]) },
      });
      const he = bm.hist.edges, hc = bm.hist.counts, tot = hc.reduce((a, b) => a + b, 0);
      ui.plot("l-bmhist", "bars", {
        categories: hc.map((_, i) => spct(ex(he[i]), 0)), height: 240,
        series: [{ name: "Share of item-days", values: hc.map((c) => c / tot) }],
        colors: hc.map((_, i) => (he[i] < 0 ? "var(--div-neg)" : "var(--div-pos)")),
        fmt: (v) => pct(v), tipFmt: (v) => pct(v, 1), notes: hc.map((c, i) => `Premium from ${spct(ex(he[i]))} to ${spct(ex(he[i + 1] ?? he[i] + 0.1))}`),
      }, {
        legend: [{ name: "Black Market paid less", color: "var(--div-neg)" }, { name: "Black Market paid more", color: "var(--div-pos)" }],
        table: { cols: ["Premium from", { label: "Share", r: true }], rows: hc.map((c, i) => [spct(ex(he[i])), pct(c / tot, 1)]) },
      });

      const mats = [...new Set(Object.keys(I.enchant.byMat).map((k) => k.split("|")[0]))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
      const nice = (m) => { const [t, k] = m.split("_"); return `${t} ${k.toLowerCase()}`; };
      ui.plot("l-forge", "bars", {
        categories: mats.map(nice), horizontal: true, height: 300, min: 0, max: 1,
        series: [
          { name: "Sold to the Black Market", color: "s1", values: mats.map((m) => I.enchant.byMat[m + "|bm"]?.win ?? null) },
          { name: "Sold in the same city", color: "var(--deemph)", values: mats.map((m) => I.enchant.byMat[m + "|same"]?.win ?? null) },
        ],
        fmt: (v) => pct(v), notes: mats.map((m) => { const a = I.enchant.byMat[m + "|bm"]; return a ? `Black Market: median margin ${pct(a.margin)}, ${a.n} item-city pairs` : ""; }),
      }, {
        legend: [{ name: "Sold to the Black Market", color: "s1" }, { name: "Sold in the same city", color: "var(--deemph)" }],
        table: { cols: ["Material", { label: "BM win", r: true }, { label: "BM margin", r: true }, { label: "Same-city win", r: true }, { label: "Pairs", r: true }], rows: mats.map((m) => { const a = I.enchant.byMat[m + "|bm"], b = I.enchant.byMat[m + "|same"]; return [nice(m), a ? pct(a.win) : "—", a ? pct(a.margin) : "—", b ? pct(b.win) : "—", a ? String(a.n) : "—"]; }) },
      });

      const drawSurv = () => {
        const c = sv.curves[dest] || {};
        /* each gap band keeps its colour whichever bands a destination has */
        const series = sv.bands.map((b, i) => (c[b] ? { name: `Gap ${b}`, color: `s${i + 1}`, data: c[b].map((v, k) => [k + 1, v]) } : null)).filter(Boolean);
        ui.plot("l-surv", "line", {
          height: 240, x: { type: "linear", min: 1, max: 5, ticks: [1, 2, 3, 4, 5], fmt: (v) => `day ${v}` }, y: { min: 0.4, max: 1, fmt: (v) => pct(v) },
          series, endLabels: true, tooltip: { title: (v) => `${v} day${v > 1 ? "s" : ""} later` },
        }, {
          legend: series.map((s) => ({ name: s.name, color: s.color, kind: "line" })),
          table: { cols: ["Gap today", ...[1, 2, 3, 4, 5].map((d) => ({ label: `Day ${d}`, r: true }))], rows: sv.bands.filter((b) => c[b]).map((b) => [b, ...c[b].map((v) => pct(v))]) },
        });
      };
      drawSurv();
      ui.onSeg(root, "dest", (v) => { dest = v; drawSurv(); });

      const vg = wd.volume["gear|royal"], vb = wd.volume["gear|bm"], vr = wd.volume["refined|royal"];
      ui.plot("l-vol", "bars", {
        categories: wd.days, height: 240,
        series: [{ name: "Gear, royal cities", color: "s1", values: vg.map((v) => v / 100) }, { name: "Gear, Black Market", color: "s2", values: vb.map((v) => v / 100) }, ...(vr ? [{ name: "Refined, royal cities", color: "s3", values: vr.map((v) => v / 100) }] : [])],
        fmt: (v) => spct(v), tipFmt: (v) => spct(v, 1),
      }, {
        legend: [{ name: "Gear, royal cities", color: "s1" }, { name: "Gear, Black Market", color: "s2" }, ...(vr ? [{ name: "Refined, royal cities", color: "s3" }] : [])],
        table: { cols: ["Day", { label: "Gear royal", r: true }, { label: "Gear BM", r: true }, { label: "Refined royal", r: true }], rows: wd.days.map((d, i) => [d, spct(vg[i] / 100, 1), spct(vb[i] / 100, 1), vr ? spct(vr[i] / 100, 1) : "—"]) },
      });

      const dec = wd.oos.deciles;
      ui.plot("l-wd", "bars", {
        categories: dec.map((_, i) => `${i + 1}`), height: 240,
        series: [{ name: "Swing in hindsight (in sample)", color: "var(--deemph)", values: dec.map((d) => d.inSample) }, { name: "Swing that repeated (out of sample)", color: "s1", values: dec.map((d) => d.outOfSample) }],
        fmt: (v) => pct(v, 0), tipFmt: (v) => pct(v, 2), notes: dec.map((_, i) => `Group ${i + 1} of 10, steadiest to wildest weekday swings`),
      }, {
        legend: [{ name: "Swing in hindsight", color: "var(--deemph)" }, { name: "Swing that repeated", color: "s1" }],
        table: { cols: ["Group", { label: "In sample", r: true }, { label: "Out of sample", r: true }], rows: dec.map((d, i) => [String(i + 1), pct(d.inSample, 2), pct(d.outOfSample, 2)]) },
      });

      const ll = I.leadLag;
      ui.plot("l-lead", "bars", {
        categories: ll.lags.map((l) => (l === 0 ? "same days" : l < 0 ? `refined ${-l}d earlier` : `refined ${l}d later`)), height: 240, min: -0.2, max: 0.2,
        series: [{ name: "Correlation", color: "s1", values: ll.corr }],
        fmt: (v) => v.toFixed(2),
      }, { table: { cols: ["Shift", { label: "Correlation", r: true }], rows: ll.lags.map((l, i) => [String(l), ll.corr[i].toFixed(3)]) } });

      const ix = I.index, months = ix.months.map((m) => Date.parse(m + "-15T00:00:00Z"));
      const names = { gear: "Gear", refined: "Refined materials", raw: "Raw materials" };
      const series = Object.keys(names).map((k, i) => (ix.kinds[k] ? { name: names[k], color: `s${i + 1}`, dots: true, data: ix.kinds[k].map((v, j) => [months[j], v ? ex(v.wmed) : null]) } : null)).filter(Boolean);
      ui.plot("l-index", "line", {
        height: 240, x: { type: "time", ticks: months, fmt: AB.util.month }, y: { fmt: (v) => spct(v), zero: false },
        series, endLabels: true, hlines: [{ y: 0 }],
        tooltip: { title: AB.util.monthYear, fmt: (v) => spct(v, 1) },
      }, {
        legend: series.map((s) => ({ name: s.name, color: s.color, kind: "line" })),
        table: { cols: ["Month", ...series.map((s) => ({ label: s.name, r: true }))], rows: ix.months.map((m, j) => [m, ...Object.keys(names).filter((k) => ix.kinds[k]).map((k) => (ix.kinds[k][j] ? spct(ex(ix.kinds[k][j].wmed), 1) : "—"))]) },
      });
    },
  };
})();
