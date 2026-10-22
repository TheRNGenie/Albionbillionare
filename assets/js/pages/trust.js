/* Albion Billionaire v2 — Trust: how accurate the numbers are, measured, and how the confidence score is built. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.trust = {
  title: "Trust",
  live: true, // redrawn in place when prices reload by themselves (see app.js)
  scrolled: 0, // the visit whose ?s=data link has been followed
  render(root, { q, visit }) {
    const { esc, pct, int, dateFull, ageText } = AB.util;
    const ui = AB.ui, kit = AB.kit, conf = AB.conf;
    const H = { eyebrow: "Trust", title: "How far to believe every number", sub: "Two separate promises. Ranges and odds are calibrated: when the app says 80%, it has been right about 80% of the time on months it never saw. The confidence score is a guide that blends six checks into one number." };
    const I = conf.insights;
    if (!I) { if (kit.waiting(root, H)) return; }
    const pm = I.priceModel, sv = I.survival;
    const lvl = pm.reliability.level, cal = pm.reliability.calibrated, nai = pm.reliability.naive;
    const i80 = lvl.indexOf(0.8);
    const M = AB.state.M, R = AB.state.R;
    const W = conf.WEIGHTS, FN = conf.FACTOR_NAMES;
    const defs = {
      fresh: "How old the prices are. Live listings lose half their weight every 18 hours; snapshot days every 3 days.",
      liquidity: `How much sells a day where you sell (14-day median). Five a day scores ${conf.F.liquidity(5).toFixed(2)}, twenty ${conf.F.liquidity(20).toFixed(2)}.`,
      history: "How many of the last 14 days had sales. Fewer than 7 also means the range can't be calibrated and falls back to a wide one.",
      agree: `Whether the listing matches what actually sold over the last week. A listing 15% above it scores ${conf.F.agree(1.15, 1).toFixed(2)}, 15% below ${conf.F.agree(0.85, 1).toFixed(2)}.`,
      odds: "The share of 400 simulated outcomes that made money, drawing every price from its calibrated range.",
      evidence: `What the backtest says about this kind of play: the chance such gaps lasted a day, the forge win rate, or the rebound rate. Plays with no backtest get ${AB.scan.NO_TEST} (order flips ${AB.scan.NO_TEST_FLIP}, because whether your orders fill is a guess).`,
    };

    root.innerHTML = `
      ${kit.head(H)}
      <div class="grid">
        ${ui.card({ span: 5, kicker: "Price ranges", body: `<div class="claim num">${pct(cal[i80], 1)}<small>of real prices landed inside the app's 80% ranges, across ${int(pm.nTest)} forecasts on months the model never saw (after ${esc(pm.split)}). A plain bell-curve range built from the same daily swing would have held only ${pct(nai[i80])}.</small></div>
          <hr><p class="small">How: for every item and market, the middle of the range is the median sale of the last 7 days and the width is the typical daily swing of the last 14. The shape of the errors (fat tails, more misses on the high side) was measured on ${int(pm.nTrain)} earlier forecasts, separately for 1, 3 and 7 days ahead, four market sizes and five levels of volatility.${pm.width80 ? ` Honest ranges are not narrow ones: a typical 80% range spans ${pct(pm.width80["1"])} of the price for tomorrow and ${pct(pm.width80["7"])} for a week out.` : ""}</p>` })}
        ${ui.chartCard({ id: "t-rel", span: 7, title: "Promised versus delivered", sub: "For each promised share (10% to 95%), the share of real outcomes that landed inside. On the diagonal is honest.", height: 280 })}
        ${pm.byVol ? ui.chartCard({ id: "t-vol", span: 12, title: "Honest in calm and wild markets alike", sub: "Share of real prices inside the 80% ranges, by how much each market swings. Measuring the error shape per volatility level keeps every group on target; one shared table (the app's first version) was too narrow for steady markets and far too wide for wild ones.", height: 260 }) : ""}
        ${ui.chartCard({ id: "t-haul", span: 6, title: "Haul odds, checked", sub: `The app's chance that a gap between markets still beats fees the next day, against what happened (${int(sv.nTest)} held-out gaps). Bigger dots, more cases. On the diagonal is honest.`, height: 470 })}
        ${ui.card({ span: 6, title: "How the confidence score works", sub: "A weighted geometric mean of six checks, each from 0 to 1. One weak check pulls the whole score down, which is the point: a play is only as trustworthy as its weakest link.", body: `<div class="weights">${Object.entries(W).map(([k, w]) => `<div class="factor"><span class="f-name">${esc(FN[k])}</span>${ui.meter(w / 0.2, "neutral", `Weight ${Math.round(w * 100)}%`)}<span class="f-val">${Math.round(w * 100)}%</span><span class="factor-note">${esc(defs[k])}</span></div>`).join("")}</div><hr>${ui.tierLegend()}` })}
        ${R ? ui.chartCard({ id: "t-dist", span: 6, title: "Today's plays by confidence", sub: `${int(R.opps.length)} plays, grouped by score.`, height: 240 }) : ""}
        ${ui.chartCard({ id: "t-fresh", span: 6, title: "How fresh the prices are", sub: M ? (M.live ? `Median age of the listings the app loaded, by market. Prices checked ${esc(AB.clock.local(M.now))}${AB.store.get("autoReload") ? ", and they reload by themselves while the app is open" : ""}.` : `Median age of the prices in use, by market. The saved snapshot ends ${esc(dateFull(M.asOf))}, ${esc(ageText(M.now - M.asOf))} ago, and quiet items last sold before that.`) : "Loading…", height: 240 })}
        ${ui.card({ span: 12, title: "What the app can't know", body: `<ul class="know">
          <li>How many items sit behind a listing. The price server reports the cheapest sell order and the best buy order, not their size, so batch sizes come from how much sells a day.</li>
          <li>Who else is chasing the same gap. The planner assumes you keep only part of each edge; the backtest odds already include gaps closing.</li>
          <li>Red-zone danger. The odds cover prices, not ganks. A red-zone tag means the road can cost you the load.</li>
          <li>Quality. Prices are for normal quality; better quality sells higher at the Black Market.</li>
          <li>Station fees for crafting, refining and enchanting. They're usually small but not zero.</li>
          <li>Anything that changes faster than the price server hears about it. Live prices come from players running the Albion Data Client; quiet markets update less often, which the freshness check catches.</li>
        </ul>` })}
        ${ui.card({ span: 12, title: "Sources and method", body: `<p class="small">Prices: the <a href="https://www.albion-online-data.com/" target="_blank" rel="noopener">Albion Online Data Project</a> (live order prices and daily sales). Item data: Albion's own files via <a href="https://github.com/ao-data/ao-bin-dumps" target="_blank" rel="noopener">ao-bin-dumps</a>. Research: ${int(I.source.rows)} daily records from ${esc(I.source.from)} to ${esc(I.source.to)} (${esc(I.source.server)}), built into the app by <span class="num">tools/v2/build_insights.py</span>. Models were fitted on the months before ${esc(pm.split)} and tested on the months after. Fees assumed: ${pct(AB.store.tax())} sales tax ${AB.store.get("premium") ? "(premium)" : "(no premium)"} and 2.5% for placing an order.</p>` })}
      </div>`;

    ui.plot("t-rel", "line", {
      height: 280, x: { type: "linear", min: 0, max: 1, fmt: (v) => pct(v) , label: "Promised share" }, y: { min: 0, max: 1, fmt: (v) => pct(v) },
      series: [
        { name: "Perfect", color: "var(--text-3)", width: 1, data: [[0, 0], [1, 1]] },
        { name: "This app's ranges", color: "s1", dots: true, data: lvl.map((l, i) => [l, cal[i]]) },
        { name: "Plain bell curve", color: "s2", dots: true, data: lvl.map((l, i) => [l, nai[i]]) },
      ],
      tooltip: { title: (v) => `Promised ${pct(v)}`, fmt: (v) => pct(v, 1) },
    }, {
      legend: [{ name: "This app's ranges", color: "s1", kind: "line" }, { name: "Plain bell curve", color: "s2", kind: "line" }, { name: "Perfect", color: "var(--text-3)", kind: "line" }],
      table: { cols: ["Promised", { label: "This app", r: true }, { label: "Bell curve", r: true }], rows: lvl.map((l, i) => [pct(l), pct(cal[i], 1), pct(nai[i], 1)]) },
    });
    if (pm.byVol) {
      const bv = pm.byVol, VN = conf.VOL_NAMES, VS = conf.VOL_SWING;
      const cats = VN.slice(0, bv.labels.length);
      ui.plot("t-vol", "bars", {
        categories: cats, height: 260, min: 0, max: 1,
        series: [
          { name: "This app's ranges", color: "s1", values: bv.calibrated },
          { name: "One table for all markets", color: "s3", values: bv.pooled },
          { name: "Plain bell curve", color: "s2", values: bv.naive },
        ],
        hlines: [{ y: 0.8, label: "80% promised" }],
        fmt: (v) => pct(v), tipFmt: (v) => pct(v, 1),
        notes: bv.n.map((n, i) => `${VN[i]} markets swing ${VS[i]} on a typical day. ${int(n)} held-out forecasts.`),
      }, {
        legend: [{ name: "This app's ranges", color: "s1" }, { name: "One table for all markets", color: "s3" }, { name: "Plain bell curve", color: "s2" }, { name: "80% promised", color: "var(--text-2)", kind: "line" }],
        table: { cols: ["Market", "Typical daily swing", { label: "This app", r: true }, { label: "One table", r: true }, { label: "Bell curve", r: true }, { label: "Forecasts", r: true }], rows: cats.map((c, i) => [c, VS[i], pct(bv.calibrated[i], 1), pct(bv.pooled[i], 1), pct(bv.naive[i], 1), int(bv.n[i])]) },
      });
    }
    const rel = sv.reliability;
    ui.plot("t-haul", "scatter", {
      height: 470, diagonal: true,
      points: rel.pred.map((p, i) => ({ x: p, y: rel.obs[i], r: rel.n[i], color: "s1", label: `Predicted ${pct(p)}`, rows: [{ name: "Predicted", value: pct(p, 1) }, { name: "Happened", value: pct(rel.obs[i], 1) }, { name: "Cases", value: int(rel.n[i]) }] })),
      x: { min: 0.5, max: 1, fmt: (v) => pct(v), label: "The app's odds" }, y: { min: 0.5, max: 1, fmt: (v) => pct(v), label: "What happened", zero: false },
      rRange: [5, 16],
    }, { table: { cols: [{ label: "Predicted", r: true }, { label: "Happened", r: true }, { label: "Cases", r: true }], rows: rel.pred.map((p, i) => [pct(p, 1), pct(rel.obs[i], 1), int(rel.n[i])]) } });

    if (R) {
      const bins = Array.from({ length: 10 }, (_, i) => i * 10);
      const counts = bins.map((b) => R.opps.filter((o) => o.score >= b && (o.score < b + 10 || b === 90)).length);
      const tierOf = (b) => conf.tier(b + 5).key;
      ui.plot("t-dist", "bars", {
        categories: bins.map((b) => `${b}–${b === 90 ? 100 : b + 9}`), height: 240,
        series: [{ name: "Plays", values: counts }],
        colors: bins.map((b) => ({ high: "var(--good)", med: "var(--warning)", low: "var(--serious)", vlow: "var(--critical)" }[tierOf(b)])),
        fmt: (v) => int(v),
      }, {
        legend: [{ name: "High", color: "var(--good)" }, { name: "Medium", color: "var(--warning)" }, { name: "Low", color: "var(--serious)" }, { name: "Very low", color: "var(--critical)" }],
        table: { cols: ["Score", { label: "Plays", r: true }], rows: bins.map((b, i) => [`${b}–${b === 90 ? 100 : b + 9}`, int(counts[i])]) },
      });
    }
    if (M) {
      const fr = AB.market.freshnessByCity().filter((f) => f.n);
      ui.plot("t-fresh", "bars", {
        categories: fr.map((f) => f.city), horizontal: true, valueLabels: true,
        series: [{ name: "Median age", color: "s1", values: fr.map((f) => f.p50) }],
        fmt: (v) => (v <= 0 ? "0" : ageText(v * 36e5)), notes: fr.map((f) => `${int(f.n)} prices. ${pct(f.share6h)} under 6 hours old.`),
      }, { table: { cols: ["Market", { label: "Median age", r: true }, { label: "Under 6 h", r: true }, { label: "Prices", r: true }], rows: fr.map((f) => [f.city, ageText(f.p50 * 36e5), pct(f.share6h), int(f.n)]) } });
    }
    /* the status pill links here (?s=data): scroll to the freshness chart once per visit, not on every redraw */
    if (q.s === "data" && R && AB.pages.trust.scrolled !== visit) { AB.pages.trust.scrolled = visit; setTimeout(() => document.getElementById("t-fresh")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }
  },
};
