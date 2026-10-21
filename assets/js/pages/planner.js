/* Albion Billionaire v2 — Planner: the chance of reaching the goal, what limits it, and what would change it. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.planner = (() => {
  let minScore = 35;
  return {
    title: "Planner",
    render(root) {
      const { esc, icon, silver, pct, int, dateFull, D, sleep } = AB.util;
      const ui = AB.ui, kit = AB.kit, store = AB.store, sim = AB.sim;
      const H = { eyebrow: "Planner", title: "Will you make a billion?", sub: "A Monte Carlo of your silver: each simulated day runs the best plays that fit your hours and capital, draws their results from the calibrated ranges, and keeps only part of the edge, because other traders chase the same gaps." };
      if (kit.waiting(root, H, [12, 12, 7, 5])) return;
      const R = AB.state.R;
      const v = {
        worth: store.get("netWorth"), capital: store.get("capital"), goal: store.get("goal"), deadline: store.get("deadline"),
        hours: store.get("hours"), risk: store.get("risk"), safe: store.get("safeOnly"),
      };
      const f = sim.forecast(R.opps, { minScore });
      const { capital, other, edge, days, res, menu: mu } = f;
      const today = res.first, dr = sim.dayRange(today.picks, 1);
      const ends = res.fan[days];
      /* number inputs show the amount the way the rest of the app writes it (25.0M) under the raw digits */
      const money = (n, val, step, key) => `<label class="field"><span>${n}</span><input class="input num" data-k="${key}" type="number" min="0" step="${step}" value="${Math.round(val)}"><span class="hint num" data-echo="${key}">= ${esc(silver(val))}</span></label>`;

      root.innerHTML = `
        ${kit.head(H)}
        ${kit.modeBanner(AB.state.M)}
        <section class="card" style="margin-bottom:16px"><form class="plan-form" id="p-form">
          ${money("Net worth (silver)", v.worth, 1e6, "netWorth")}
          ${money("Trading capital (silver)", v.capital, 1e6, "capital")}
          ${money("Goal (silver)", v.goal, 1e8, "goal")}
          <label class="field"><span>Deadline</span><input class="input" type="date" data-k="deadline" value="${esc(v.deadline)}"></label>
          <label class="field"><span>Hours a day</span><div class="row"><input type="range" min="0.5" max="10" step="0.5" data-k="hours" value="${v.hours}" aria-label="Hours a day"><span class="out-val" id="p-hours">${v.hours} h</span></div></label>
          <div class="field"><span>Edge you keep on later days</span>${ui.seg("risk", [["cautious", "35%"], ["balanced", "50%"], ["bold", "70%"]], v.risk, "Edge kept")}<span class="hint">Cautious, balanced or bold.</span></div>
          <div class="field"><span>Plays allowed</span>${ui.seg("min", [[30, "Low+"], [35, "Default"], [50, "Medium+"], [70, "High"]], minScore, "Minimum confidence")}<span class="hint">Minimum confidence score.</span></div>
          <label class="field"><span>Red zones</span><span class="check"><input type="checkbox" data-k="safeOnly" ${v.safe ? "checked" : ""}> Avoid red-zone plays</span></label>
        </form></section>
        <section class="card" style="margin-bottom:16px"><div class="kpis">
          ${ui.kpi({ label: `${icon("target")} Chance of ${esc(silver(v.goal))}`, value: res.pGoal >= 0.995 ? ">99%" : res.pGoal <= 0.005 ? "<1%" : pct(res.pGoal), range: `simulation range ${pct(res.pGoalCI[0])}–${pct(res.pGoalCI[1])}` })}
          ${ui.kpi({ label: `${icon("clock")} Half the paths arrive`, value: res.daysTo?.p50 != null ? esc(dateFull(Date.now() + res.daysTo.p50 * D)) : "After the deadline", range: res.daysTo ? `the luckiest tenth by ${esc(dateFull(Date.now() + res.daysTo.p10 * D))}` : `fewer than 1 in 10 paths arrive in time` })}
          ${ui.kpi({ label: `${icon("band")} At the deadline`, value: esc(silver(ends[2])), range: `80% of paths: ${esc(silver(ends[0]))} to ${esc(silver(ends[4]))}` })}
          ${ui.kpi({ label: `${icon("coin")} Today, ${v.hours} h`, value: esc(silver(dr.p50, { sign: true })), range: `80%: ${esc(silver(dr.p10))} to ${esc(silver(dr.p90))}` })}
        </div></section>
        <div class="grid">
          ${ui.chartCard({ id: "p-fan", span: 12, title: `Your silver, ${f.paths} ways`, sub: `Net worth over the next ${days} days. Each path keeps a different share of the edge (around ${pct(edge)}) and lives through different market weeks.`, height: 300 })}
          ${ui.chartCard({ id: "p-grid", span: 7, title: `Chance of ${silver(v.goal)} by your deadline`, sub: "Same plays, different hours a day (across) and trading capital (down). Computing…", height: 260 })}
          ${ui.chartCard({ id: "p-stop", span: 5, title: "What holds you back, month by month", sub: "Share of simulated days limited by capital, by your hours, or by what the market can absorb.", height: 260 })}
          ${ui.chartCard({ id: "p-today", span: 12, title: "Today's routine", sub: "The plays the simulation runs on day one, in order, with each one's 80% range. Tap a row to open it.", height: 60 + 30 * Math.max(1, today.picks.length) })}
        </div>`;

      /* inputs */
      const form = root.querySelector("#p-form");
      form.addEventListener("submit", (e) => e.preventDefault());
      /* commit on change (blur, Enter, slider release) so a re-render never steals the field you're typing in */
      form.addEventListener("input", (e) => {
        const k = e.target.dataset.k;
        if (k === "hours") root.querySelector("#p-hours").textContent = `${e.target.value} h`;
        const echo = k && root.querySelector(`[data-echo="${k}"]`);
        if (echo) echo.textContent = `= ${silver(+e.target.value || 0)}`;
      });
      form.addEventListener("change", (e) => {
        const el = e.target, k = el.dataset.k;
        if (!k) return;
        const val = el.type === "checkbox" ? el.checked : el.type === "date" ? el.value : +el.value;
        if (el.type === "number" && !(val > 0)) return;
        if (k === "deadline" && !/^\d{4}-\d{2}-\d{2}$/.test(val)) return;
        store.set(k, val);
      });
      ui.onSeg(root, "risk", (x) => store.set("risk", x));
      ui.onSeg(root, "min", (x) => { minScore = +x; AB.app.rerender(); });
      const off = store.on("change", (k) => { if (["netWorth", "goal", "deadline", "hours", "risk", "safeOnly"].includes(k)) AB.app.rerender(); });

      kit.fanChart("p-fan", res, { goal: v.goal, height: 300 });

      /* bottlenecks by calendar month (a month label repeats only across a year boundary, so those carry the year) */
      const months = [], keyOf = (d) => { const x = new Date(Date.now() + d * D); return `${x.getUTCFullYear()}-${x.getUTCMonth()}`; };
      for (let d = 1; d <= days; d++) {
        const k = keyOf(d);
        let m = months[months.length - 1];
        if (!m || m.k !== k) { const x = new Date(Date.now() + d * D); m = { k, t: x, capital: 0, hours: 0, market: 0, n: 0 }; months.push(m); }
        const st = res.stops[d];
        m.capital += st.capital; m.hours += st.hours; m.market += st.market; m.n++;
      }
      const mname = (t) => AB.util.month(t);
      const dupe = new Set(months.map((m) => mname(m.t)).filter((n, i, a) => a.indexOf(n) !== i));
      const mlab = months.map((m) => (dupe.has(mname(m.t)) ? `${mname(m.t)} ’${String(m.t.getUTCFullYear()).slice(2)}` : mname(m.t)));
      ui.plot("p-stop", "bars", {
        categories: mlab, stacked: true, height: 260, max: 1,
        series: [
          { name: "Capital", color: "s1", values: months.map((m) => m.capital / m.n) },
          { name: "Your hours", color: "s2", values: months.map((m) => m.hours / m.n) },
          { name: "Market size", color: "s3", values: months.map((m) => m.market / m.n) },
        ],
        fmt: (x) => pct(x),
      }, {
        legend: [{ name: "Capital", color: "s1" }, { name: "Your hours", color: "s2" }, { name: "Market size", color: "s3" }],
        table: { cols: ["Month", { label: "Capital", r: true }, { label: "Hours", r: true }, { label: "Market", r: true }], rows: months.map((m, i) => [mlab[i], pct(m.capital / m.n), pct(m.hours / m.n), pct(m.market / m.n)]) },
      });

      /* today's routine */
      ui.plot("p-today", "forest", {
        rows: today.picks.map((p) => ({ label: `${AB.cat.label(p.m.o.item)} · ${p.m.o.meta.short} ×${int(p.units)}`, lo: p.units * p.m.q[0], mid: p.units * p.m.q[2], hi: p.units * p.m.q[4], tier: p.m.o.tier.key, key: p.m.o.key, sub: `${p.m.o.title} · ${p.hours.toFixed(1)} h` })),
        onClick: (r) => { const o = R.opps.find((x) => x.key === r.key); if (o) kit.openOpp(o); },
        empty: "No play fits your settings.",
      }, { table: { cols: ["Play", { label: "Units", r: true }, { label: "Hours", r: true }, { label: "10%", r: true }, { label: "Middle", r: true }, { label: "90%", r: true }], rows: today.picks.map((p) => [p.m.o.title, int(p.units), p.hours.toFixed(1), silver(p.units * p.m.q[0]), silver(p.units * p.m.q[2]), silver(p.units * p.m.q[4])]) } });

      /* the grid: your own capital and hours replace the nearest row and column, and every cell runs the same paths
         and the same luck as the forecast above, so your cell matches the headline odds exactly. One cell at a time
         (about a tenth of a second each) so the page stays responsive. */
      let alive = true;
      (async () => {
        const near = (list, x, dist) => list.map((y, i) => [dist(x, y), i]).sort((a, b) => a[0] - b[0])[0][1];
        const hoursList = [1, 2, 3, 4, 6, 8], capList = [5e6, 15e6, 40e6, 100e6, 250e6];
        if (!hoursList.includes(f.hours)) hoursList[near(hoursList, f.hours, (a, b) => Math.abs(a - b))] = f.hours;
        if (!capList.includes(capital)) capList[near(capList, capital, (a, b) => Math.abs(Math.log(Math.max(a, 1)) - Math.log(b)))] = capital;
        hoursList.sort((a, b) => a - b);
        capList.sort((a, b) => a - b);
        const vals = capList.map(() => []), sub = root.querySelector("#p-grid .sub"), cells = capList.length * hoursList.length;
        for (const [i, c] of capList.entries()) {
          for (const h of hoursList) {
            await sleep(0);
            if (!alive) return;
            sub.textContent = `Same plays, different hours a day (across) and trading capital (down). Computing ${i * hoursList.length + vals[i].length + 1} of ${cells}…`;
            vals[i].push(c === capital && h === f.hours ? res.pGoal : sim.run({ menu: mu, capital: c, other, goal: f.goal, days, hours: h, edge, paths: f.paths, seed: f.seed }).pGoal);
          }
        }
        if (!alive) return;
        sub.textContent = `Same plays and the same luck, different hours a day (across) and trading capital (down). Ringed: you, ${f.hours} h with ${silver(capital)}.`;
        ui.plot("p-grid", "heat", {
          rows: capList.map((c) => silver(c)), cols: hoursList.map((h) => `${h} h`), values: vals, domain: [0, 1], fmt: (x) => pct(x), valueName: `Chance of ${silver(f.goal)}`, cellH: 40,
          mark: [capList.indexOf(capital), hoursList.indexOf(f.hours)],
          note: (i, j) => `${silver(capList[i])} trading capital, ${hoursList[j]} h a day${capList[i] === capital && hoursList[j] === f.hours ? " (you)" : ""}`,
        }, { table: { cols: ["Capital", ...hoursList.map((h) => ({ label: `${h} h`, r: true }))], rows: capList.map((c, i) => [silver(c), ...vals[i].map((x) => pct(x))]) } });
      })();
      kit.wireOpps(root);
      return () => { alive = false; off(); };
    },
  };
})();
