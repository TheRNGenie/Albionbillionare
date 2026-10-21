/* Albion Billionaire v2 — Ledger: net worth check-ins, logged trades, and your own calibration: did the app's
   ranges hold for the trades you actually made? */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.ledger = {
  title: "Ledger",
  render(root) {
    const { esc, icon, silver, pct, int, dateFull, D, toast } = AB.util;
    const ui = AB.ui, kit = AB.kit, store = AB.store;
    const L = store.ledger;
    const goal = store.get("goal");
    const done = L.trades.filter((t) => t.result != null && isFinite(t.result) && t.pred);
    const inside = done.filter((t) => t.result >= t.pred.p10 && t.result <= t.pred.p90).length;
    const realized = done.reduce((a, t) => a + t.result, 0);
    const predicted = done.reduce((a, t) => a + t.pred.p50, 0);
    const today = new Date().toISOString().slice(0, 10);

    root.innerHTML = `
      ${kit.head({ eyebrow: "Ledger", title: "Your silver, checked", sub: "Check in your net worth now and then, and log the trades you make. The app then checks its own promises against your results." })}
      <div class="grid">
        ${ui.chartCard({ id: "g-worth", span: 8, title: "Net worth", sub: L.worth.length ? `${L.worth.length} check-ins. The dashed line is the straight pace from your first check-in to ${esc(silver(goal))} by the deadline.` : "Add a check-in to start the line.", height: 260 })}
        ${ui.card({ span: 4, title: "Check in", sub: "Your total silver and item value in game.", body: `
          <form class="stack" id="g-form">
            <div class="form-grid"><label class="field"><span>Net worth</span><input class="input num" name="v" type="number" min="0" step="any" required value="${Math.round(store.get("netWorth"))}"><span class="hint num" id="g-echo">= ${esc(silver(store.get("netWorth")))}</span></label>
            <label class="field"><span>Date</span><input class="input" name="d" type="date" value="${today}" max="${today}"></label></div>
            <button class="btn primary" type="submit">${icon("plus")}Add check-in</button>
          </form>
          ${L.worth.length ? `<hr><div class="table-wrap"><table class="t"><tbody>${L.worth.slice().reverse().slice(0, 6).map((w) => { const i = L.worth.indexOf(w); return `<tr><td>${esc(dateFull(w.t))}</td><td class="r num">${esc(silver(w.v))}</td><td class="r"><button class="icon-btn sm" type="button" data-del-worth="${i}" aria-label="Delete this check-in">${icon("trash")}</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}` })}
        ${ui.card({ span: 12, title: "Your calibration", sub: "For trades with a result: did it land inside the 80% range the app gave when you logged it?", body: done.length ? `<div class="kpis">
            ${ui.kpi({ label: "Inside the 80% range", value: `${inside} of ${done.length}`, range: `${pct(inside / done.length)}; an honest range should catch about 80% over many trades` })}
            ${ui.kpi({ label: "Realized profit", value: esc(silver(realized, { sign: true })), range: `the app's middle estimates added up to ${esc(silver(predicted, { sign: true }))}` })}
            ${ui.kpi({ label: "Average miss", value: esc(silver(done.reduce((a, t) => a + Math.abs(t.result - t.pred.p50), 0) / done.length)), range: "distance from the middle estimate" })}
            ${ui.kpi({ label: "Trades logged", value: int(L.trades.length), range: `${L.trades.length - done.length} waiting for a result` })}
          </div>` : ui.empty("No finished trades yet. Log a trade from any play, then add its result below.") })}
        ${done.length ? ui.chartCard({ id: "g-cal", span: 12, title: "Promised range versus what happened", sub: "Bar: the 80% range when you logged it. Dot: your result, green inside the range, red outside.", height: 60 + 30 * Math.min(done.length, 20) }) : ""}
        ${ui.card({ span: 12, title: "Trades", sub: L.trades.length ? "Type the final profit (after fees) when a trade is done." : "", body: L.trades.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Logged</th><th>Play</th><th class="r">Units</th><th class="r">Spent</th><th class="r">80% range</th><th class="r">Result</th><th></th><th></th></tr></thead><tbody>${L.trades.map((t, i) => {
          const ok = t.result != null && t.pred ? t.result >= t.pred.p10 && t.result <= t.pred.p90 : null;
          return `<tr><td class="num">${esc(dateFull(t.t))}</td><td>${esc(t.title)}${t.note ? `<div class="small muted">${esc(t.note)}</div>` : ""}</td><td class="r num">${int(t.qty)}</td><td class="r num">${esc(silver(t.cost))}</td><td class="r num">${t.pred ? `${esc(silver(t.pred.p10))} – ${esc(silver(t.pred.p90))}` : "—"}</td>
            <td class="r"><input class="input num" style="width:120px;text-align:right" type="number" step="any" data-result="${i}" value="${t.result ?? ""}" placeholder="profit" aria-label="Result for ${esc(t.title)}"></td>
            <td>${ok == null ? "" : ok ? `<span class="pill-ok">${icon("check")}Inside</span>` : `<span class="pill-miss">${icon("stop")}Outside</span>`}</td>
            <td class="r"><button class="icon-btn sm" type="button" data-del-trade="${i}" aria-label="Delete this trade">${icon("trash")}</button></td></tr>`;
        }).join("")}</tbody></table></div>` : ui.empty("No trades logged yet. Open any play and press Log this trade.") })}
        ${ui.card({ span: 12, title: "Backup", sub: "Your settings and ledger live in this browser only. Save a copy before you clear site data or switch devices.", body: `<div class="row"><button class="btn" type="button" id="g-export">${icon("download")}Save a backup</button><label class="btn">${icon("upload")}Restore a backup<input type="file" accept="application/json,.json" id="g-import" hidden></label></div>` })}
      </div>`;

    /* chart: check-ins and the straight pace */
    if (L.worth.length) {
      const first = L.worth[0];
      const dl = Date.parse(store.get("deadline") + "T23:59:59Z");
      const end = Math.max(Date.now(), L.worth[L.worth.length - 1].t) + 7 * D;
      const pace = (t) => first.v + ((goal - first.v) * (t - first.t)) / Math.max(D, dl - first.t);
      ui.plot("g-worth", "line", {
        height: 260, x: { type: "time", max: end }, y: { min: 0 },
        series: [
          { name: "Straight pace", color: "var(--deemph)", dash: "5 5", data: [[first.t, first.v], [end, pace(end)]] },
          { name: "Your net worth", color: "s1", dots: true, data: L.worth.map((w) => [w.t, w.v]) },
        ],
        tooltip: { title: (t) => dateFull(t) },
      }, {
        legend: [{ name: "Your net worth", color: "s1", kind: "line" }, { name: "Straight pace to the goal", color: "var(--deemph)", kind: "line" }],
        table: { cols: ["Date", { label: "Net worth", r: true }, { label: "Pace", r: true }], rows: L.worth.map((w) => [dateFull(w.t), silver(w.v), silver(pace(w.t))]) },
      });
    } else root.querySelector("#g-worth .chart").innerHTML = ui.empty("No check-ins yet.");

    if (done.length) {
      const rows = done.slice(0, 20);
      ui.plot("g-cal", "forest", {
        midName: "Your result", rangeName: "80% range when logged",
        rows: rows.map((t) => ({ label: t.title.length > 42 ? t.title.slice(0, 40) + "…" : t.title, lo: t.pred.p10, mid: t.result, hi: t.pred.p90, tier: t.result >= t.pred.p10 && t.result <= t.pred.p90 ? "high" : "vlow", sub: dateFull(t.t) })),
      }, {
        legend: [{ name: "Inside the range", color: "var(--good)", kind: "dot" }, { name: "Outside the range", color: "var(--critical)", kind: "dot" }],
        table: { cols: ["Trade", { label: "10%", r: true }, { label: "90%", r: true }, { label: "Result", r: true }], rows: rows.map((t) => [t.title, silver(t.pred.p10), silver(t.pred.p90), silver(t.result)]) },
      });
    }

    root.querySelector("#g-form").addEventListener("input", (e) => { if (e.target.name === "v") root.querySelector("#g-echo").textContent = `= ${silver(+e.target.value || 0)}`; });
    root.querySelector("#g-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const v = +fd.get("v");
      if (!(v >= 0)) return;
      const d = String(fd.get("d") || today);
      store.addWorth(v, Date.parse(d + "T12:00:00Z"));
      toast("Check-in saved.");
      AB.app.rerender();
    });
    root.addEventListener("click", (e) => {
      const w = e.target.closest("[data-del-worth]"), t = e.target.closest("[data-del-trade]");
      if (w) { store.removeWorth(+w.dataset.delWorth); AB.app.rerender(); }
      if (t) { store.removeTrade(+t.dataset.delTrade); AB.app.rerender(); }
    });
    root.addEventListener("change", (e) => {
      const r = e.target.closest("[data-result]");
      if (!r) return;
      store.updateTrade(+r.dataset.result, { result: r.value === "" ? null : +r.value });
      AB.app.rerender();
    });
    root.querySelector("#g-export").addEventListener("click", () => AB.util.saveFile(`albion-billionaire-v2-backup-${today}.json`, store.exportAll()).catch((e) => toast(e.message || "The backup couldn't be saved.")));
    root.querySelector("#g-import").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try { store.importAll(await f.text()); toast("Backup restored."); AB.app.rerender(); }
      catch (err) { toast(err.message || "That file couldn't be read."); }
    });
  },
};
