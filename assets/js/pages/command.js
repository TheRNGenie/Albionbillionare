/* Albion Billionaire v2 — Command: the road to a billion, today's plan, and the best plays with their confidence. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.command = {
  title: "Command",
  live: true, // redrawn in place when prices reload by themselves (see app.js)
  render(root) {
    const { esc, icon, silver, pct, spct, int, dateFull, date, D, ageText } = AB.util;
    const ui = AB.ui, kit = AB.kit, sim = AB.sim, cat = AB.cat;
    const H = { eyebrow: "Command", title: "Road to a billion", sub: "Every play below is scored for profit and for how much to believe it. The road is a Monte Carlo of those plays, not a straight line." };
    if (kit.waiting(root, H)) return;
    const M = AB.state.M, R = AB.state.R;
    const f = sim.forecast(R.opps);
    const { goal, capital, worth, hours, edge, days, res } = f;
    const today = res.first;
    const dr = sim.dayRange(today.picks, 1);
    const deadline = Date.now() + days * D;
    const ends = res.fan[days];
    const tiers = { high: 0, med: 0, low: 0, vlow: 0 };
    R.opps.forEach((o) => tiers[o.tier.key]++);
    const tierBar = `<div class="tierbar" role="img" aria-label="${tiers.high} high, ${tiers.med} medium, ${tiers.low} low, ${tiers.vlow} very low">${["high", "med", "low", "vlow"].map((k) => (tiers[k] ? `<i class="${k}" style="flex:${tiers[k]}"></i>` : "")).join("")}</div>
      <div class="tier-counts">${[["high", "check", "High"], ["med", "half", "Medium"], ["low", "alert", "Low"], ["vlow", "stop", "Very low"]].map(([k, ic, l]) => `<span class="${k}">${icon(ic)}${tiers[k]} ${l.toLowerCase()}</span>`).join("")}</div>`;
    const best = R.opps[0];
    const dips = R.byKind.dip.filter((o) => o.total.p50 > 0);
    const spikes = R.alerts.slice(0, 6);
    const spikeFall = spikes.length ? spikes.map((a) => Math.exp(a.row.f7) - 1).sort((x, y) => x - y)[Math.floor(spikes.length / 2)] : 0;
    const pulse = R.pulse;
    const weekly = pulse.weekly.map((w) => w[1]);
    const ageH = M.live ? M.medianAgeH : (M.now - M.asOf) / 36e5;

    const pTxt = res.pGoal >= 0.995 ? ">99%" : res.pGoal <= 0.005 ? "<1%" : pct(res.pGoal);
    const dt = res.daysTo;
    const arrival = dt?.p50 != null
      ? `Half the paths reach ${silver(goal)} by <b>${esc(dateFull(Date.now() + dt.p50 * D))}</b>; the luckiest tenth by ${esc(date(Date.now() + dt.p10 * D))}.`
      : dt
        ? `Fewer than half the paths make it in time; the luckiest tenth reach ${silver(goal)} by <b>${esc(dateFull(Date.now() + dt.p10 * D))}</b>.`
        : `Most paths don't reach ${silver(goal)} by the deadline.`;
    const stopText = {
      capital: `<b>Capital is the limit today.</b> The plan stops when your ${esc(silver(capital))} is committed; better plays are waiting for more silver.`,
      hours: `<b>Your hours are the limit today.</b> More time would add the next plays on the list.`,
      market: `<b>The market is the limit today.</b> Every play is sized to what sells; more capital wouldn't add much until new gaps open.`,
    }[today.stop];

    root.innerHTML = `
      ${kit.head({ ...H, eyebrow: `Command · ${esc(new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }))}` })}
      ${kit.modeBanner(M)}
      <div class="grid">
        ${ui.chartCard({
          id: "c-road", span: 8, title: `Chance of ${silver(goal)} by ${dateFull(deadline)}`, height: 260,
          sub: `${f.paths} simulated paths from ${esc(silver(worth))} (${esc(silver(capital))} trading), ${hours} h a day, keeping ${pct(edge)} of today's edge on average. <a href="#/planner">Change in Planner</a>`,
          above: `<div class="road-top"><div class="hero-num num">${pTxt}</div><div class="road-meta"><span>Simulation range ${pct(res.pGoalCI[0])}–${pct(res.pGoalCI[1])}</span><span>${arrival}</span><span>At the deadline, 80% of paths end between <b>${esc(silver(ends[0]))}</b> and <b>${esc(silver(ends[4]))}</b>.</span></div></div>`,
        })}
        ${ui.card({
          span: 4, title: `Today's plan · ${hours} h`, sub: "The best plays that fit your time and capital, in order.",
          body: today.picks.length ? `<div class="plan-total"><span class="big num">${esc(silver(dr.p50, { sign: true }))}</span><span class="small">80%: ${esc(silver(dr.p10))} to ${esc(silver(dr.p90))} · ${pct(1 - dr.pLoss)} chance of a winning day</span></div>
            <div class="picks" id="c-picks">${today.picks.map((p, i) => kit.pickRow({ ...p.m.o, total: { p50: p.units * p.m.o.mc.p50 } }, i + 1, `<span>${int(p.units)} units · ${p.hours.toFixed(1)} h</span>`)).join("")}</div>
            <div class="callout bottleneck">${icon("bolt")}<div>${stopText}</div></div>` : ui.empty("No play fits right now. Lower the confidence filter in Planner or add capital."),
        })}
        <section class="card span-12"><div class="kpis">
          ${ui.kpi({ label: `${icon("radar")} Plays scored`, value: int(R.opps.length), foot: tierBar })}
          ${ui.kpi({ label: `${icon("star")} Best bet right now`, value: esc(silver(best?.perHour)) + "<small class='muted' style='font-size:13px;font-weight:600'> /h</small>", range: best ? `<button type="button" class="link-btn" data-opp="${esc(best.key)}">${esc(best.title)}</button>` : "", foot: best ? ui.conf(best) : "" })}
          ${ui.kpi({ label: `${icon("coin")} Black Market premium`, value: esc(spct(Math.exp(pulse.now) - 1)), range: `over royal-city prices now; usual ${esc(spct(Math.exp(pulse.usual) - 1))}`, spark: AB.charts.spark([...weekly, pulse.now], { color: "s1", h: 30 }), title: "Median of the Black Market's price over the median royal-city price, across the scanned gear. The line is the weekly median since April." })}
          ${ui.kpi({ label: `${icon("clock")} Price age`, value: esc(ageText(ageH * 36e5)), range: M.live ? "median age of live listings" : `snapshot to ${esc(dateFull(M.asOf))}`, foot: `<span class="small">Counts for <b>${pct(M.fresh(M.live ? M.medianAgeH : ageH))}</b> freshness in scores</span>` })}
        </div></section>
        ${ui.chartCard({ id: "c-ladder", span: 7, title: "Confidence ladder: today's top plays", sub: "Dot: most likely profit for the batch. Bar: 80% of simulated outcomes. Colour: confidence. Tap a row to open the play.", height: 380 })}
        ${ui.chartCard({ id: "c-map", span: 5, title: "Where the money moves", sub: "Best routes right now. Thicker arrows earn more an hour; orange crosses red zones.", height: 300 })}
        ${ui.card({ span: 6, title: "Crashes worth buying", sub: "Busy markets trading well under their two-week median. Crashes like these mostly came back within a week in the backtest.", body: dips.length ? `<div class="picks">${dips.slice(0, 6).map((o, i) => kit.pickRow(o, i + 1, `<span>${esc(spct(Math.exp(o.extra.dev) - 1))} vs median</span>`)).join("")}</div>` : ui.empty("No crash big enough in a busy market right now.") })}
        ${ui.card({ span: 6, title: "Spikes to sell into", sub: spikes.length ? `If you hold these, the price is unusually high. In the backtest, spikes like these lost about ${esc(pct(-spikeFall))} of their price within a week.` : "", body: spikes.length ? `<div class="picks">${spikes.map((a, i) => `<a class="pick" href="#/markets/${encodeURIComponent(a.id)}" style="color:inherit;text-decoration:none"><span class="p-n">${i + 1}</span><div style="min-width:0"><div class="p-title">${esc(cat.label(a.id))} in ${esc(a.city)}</div><div class="p-sub"><span>${esc(spct(Math.exp(a.dev) - 1))} over its two-week median of ${esc(silver(a.typical))}</span></div></div><div class="p-right"><span class="p-val">${esc(silver(a.price))}</span><span class="small muted">${a.v14 < 10 ? a.v14.toFixed(1) : int(a.v14)} sold a day</span></div></a>`).join("")}</div>` : ui.empty("No spikes in busy markets right now.") })}
      </div>`;

    kit.fanChart("c-road", res, { goal, height: 260 });

    /* the confidence ladder */
    const top = R.opps.slice(0, 12);
    ui.plot("c-ladder", "forest", {
      label: "Top plays with 80% profit ranges",
      rows: top.map((o) => ({ label: `${cat.label(o.item)} · ${o.meta.short}`, lo: o.total.p10, mid: o.total.p50, hi: o.total.p90, tier: o.tier.key, key: o.key, sub: o.title, extra: [{ color: "var(--text-3)", name: "Confidence", value: `${o.score} (${o.tier.label})`, box: true }, { color: "var(--text-3)", name: "Per hour", value: silver(o.perHour), box: true }] })),
      onClick: (r) => { const o = R.opps.find((x) => x.key === r.key); if (o) kit.openOpp(o); },
    }, {
      legend: [{ name: "High", color: "var(--good)", kind: "dot" }, { name: "Medium", color: "var(--warning)", kind: "dot" }, { name: "Low", color: "var(--serious)", kind: "dot" }, { name: "Very low", color: "var(--critical)", kind: "dot" }],
      table: { cols: ["Play", { label: "10%", r: true }, { label: "Most likely", r: true }, { label: "90%", r: true }, { label: "Confidence", r: true }], rows: top.map((o) => [o.title, silver(o.total.p10), silver(o.total.p50), silver(o.total.p90), `${o.score} ${o.tier.label}`]) },
    });

    /* routes */
    const pairs = new Map();
    for (const o of R.opps) {
      if (!["haul", "redhaul"].includes(o.kind) || o.score < 30) continue;
      const k = `${o.from}|${o.kind === "redhaul" ? "Caerleon" : o.to}`;
      const cur = pairs.get(k);
      if (!cur || o.perHour > cur.perHour) pairs.set(k, o);
    }
    const routes = [...pairs.values()].sort((a, b) => b.perHour - a.perHour).slice(0, 7).map((o) => ({
      from: o.from, to: o.kind === "redhaul" ? "Caerleon" : o.to, weight: o.perHour, risk: o.zone === "red" ? "red" : "safe",
      color: o.zone === "red" ? "var(--s4)" : "var(--s3)",
      rows: [{ color: o.zone === "red" ? "var(--s4)" : "var(--s3)", name: cat.label(o.item), value: `${silver(o.perHour)}/h` }, { color: "var(--text-3)", name: "Confidence", value: `${o.score} ${o.tier.label}` }],
      note: o.title,
    }));
    const marks = {};
    for (const c of [...cat.ROYAL, "Caerleon", "Brecilien"]) { const n = R.opps.filter((o) => o.from === c).length; if (n) marks[c] = `${n} plays`; }
    ui.plot("c-map", "map", { routes, marks, height: 300 }, {
      legend: [{ name: "Safe-zone haul", color: "var(--s3)", kind: "line" }, { name: "Crosses red zones", color: "var(--s4)", kind: "line" }],
      table: { cols: ["From", "To", { label: "Per hour", r: true }, "Play"], rows: routes.map((r) => [r.from, r.to, silver(r.weight), r.note]) },
    });

    kit.wireOpps(root);
  },
};
