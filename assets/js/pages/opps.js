/* Albion Billionaire v2 — Opportunities: every scored play, a risk-and-reward map, filters and the ranked list. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.opps = (() => {
  const st = { kinds: new Set(), min: 0, sort: "best", safe: null, shown: 40, visit: 0 };
  const SORTS = {
    best: [(o) => o.rank, "Best bet"],
    hour: [(o) => o.perHour, "Per hour"],
    profit: [(o) => o.total.p50, "Profit"],
    conf: [(o) => o.score, "Confidence"],
    roi: [(o) => o.roi, "Return"],
  };
  return {
    title: "Opportunities",
    live: true, // redrawn in place when prices reload by themselves (see app.js)
    render(root, { q, visit }) {
      const { esc, silver, int } = AB.util;
      const ui = AB.ui, kit = AB.kit, scan = AB.scan;
      const H = { eyebrow: "Opportunities", title: "Every play, scored twice", sub: "Once for what it could earn (an 80% range from simulation), once for how much to believe it (the confidence score)." };
      if (kit.waiting(root, H, [12, 12])) return;
      const M = AB.state.M, R = AB.state.R;
      if (st.safe == null) st.safe = !!AB.store.get("safeOnly");
      /* a link can pick a strategy (?kind=) and open a play (?open=): once per visit, so a redraw keeps the
         player's own filters and doesn't reopen a play they closed */
      const fromLink = st.visit !== visit;
      st.visit = visit;
      if (fromLink && q.kind && scan.KINDS[q.kind]) { st.kinds = new Set([q.kind]); }

      root.innerHTML = `
        ${kit.head({ ...H, sub: `${int(R.opps.length)} plays from ${int(M.counts.items)} items across 8 markets, scored in ${int(R.ms)} ms. ${H.sub}` })}
        ${kit.modeBanner(M)}
        <div class="filters" role="group" aria-label="Filters">
          <div class="chips" id="o-kinds"></div>
        </div>
        <div class="filters">
          ${ui.seg("min", [[0, "Any confidence"], [30, "Low and up"], [50, "Medium and up"], [70, "High only"]], st.min, "Minimum confidence")}
          ${ui.seg("sort", Object.entries(SORTS).map(([k, v]) => [k, v[1]]), st.sort, "Sort by")}
          <label class="check"><input type="checkbox" id="o-safe" ${st.safe ? "checked" : ""}> Hide red-zone plays</label>
        </div>
        <div class="grid">
          ${ui.chartCard({ id: "o-map", title: "Risk and reward", sub: "Right is more trustworthy, up is more silver an hour (log scale), bigger needs more capital. Tap a dot to open the play.", height: 380 })}
          <section class="card span-12"><div class="list-meta"><span id="o-count"></span>${ui.tierLegend()}</div><div class="olist" id="o-list"></div><div class="o-more" id="o-more"></div></section>
        </div>`;

      const kindsEl = root.querySelector("#o-kinds");
      const filtered = () => {
        const f = R.opps.filter((o) => (!st.kinds.size || st.kinds.has(o.kind)) && o.score >= st.min && (!st.safe || o.zone !== "red"));
        const key = SORTS[st.sort][0];
        return f.sort((a, b) => key(b) - key(a));
      };
      function drawChips() {
        const base = R.opps.filter((o) => o.score >= st.min && (!st.safe || o.zone !== "red"));
        kindsEl.innerHTML = ui.chip("", "All plays", !st.kinds.size, base.length) + scan.ORDER.filter((k) => R.byKind[k].length || k === "flip").map((k) => {
          const m = scan.KINDS[k], n = base.filter((o) => o.kind === k).length;
          return ui.chip(k, `<span class="kind"><i style="background:var(--${m.color})" aria-hidden="true"></i>${esc(m.short)}</span>`, st.kinds.has(k), n);
        }).join("");
        const flipChip = kindsEl.querySelector('[data-v="flip"]');
        if (flipChip && !M.live) { flipChip.disabled = true; flipChip.title = "Order flips need live order books; the snapshot only has daily averages."; }
      }
      function drawList() {
        const list = filtered();
        const shown = list.slice(0, st.shown);
        const sc = kit.scaleOf(shown);
        root.querySelector("#o-count").textContent = list.length ? `Showing ${Math.min(st.shown, list.length)} of ${int(list.length)} plays, sorted by ${SORTS[st.sort][1].toLowerCase()}` : "No play matches these filters.";
        root.querySelector("#o-list").innerHTML = list.length ? kit.oppHead() + shown.map((o) => kit.oppRow(o, sc)).join("") : ui.empty("Nothing matches. Loosen the confidence filter or pick another strategy.");
        root.querySelector("#o-more").innerHTML = list.length > st.shown ? `<button class="btn" type="button" id="o-moreBtn">Show ${Math.min(40, list.length - st.shown)} more</button>` : "";
        const more = root.querySelector("#o-moreBtn");
        if (more) more.addEventListener("click", () => { st.shown += 40; drawList(); });
        drawMap(list);
      }
      function drawMap(list) {
        const pts = list.slice(0, 600).filter((o) => o.perHour > 0);
        const ys = pts.map((o) => o.perHour).sort((a, b) => a - b);
        const kinds = [...new Set(pts.map((o) => o.kind))];
        ui.plot("o-map", "scatter", {
          label: "Plays by confidence and profit an hour", height: 380, fillOpacity: 0.4,
          points: pts.map((o) => ({
            x: o.score, y: o.perHour, r: o.capital, color: scan.KINDS[o.kind].color, label: o.title, key: o.key,
            rows: [{ name: "Confidence", value: `${o.score} (${o.tier.label})` }, { name: "Per hour", value: silver(o.perHour) }, { name: "Batch profit", value: `${silver(o.total.p10)} to ${silver(o.total.p90)}` }, { name: "Capital", value: silver(o.capital) }],
            sub: scan.KINDS[o.kind].name,
          })),
          x: { min: 0, max: 100, fmt: (v) => String(v), label: "Confidence score" },
          y: { log: true, fmt: (v) => silver(v), label: "Silver an hour" },
          rRange: [2.5, 11],
          quadrant: ys.length ? { x: 50, y: ys[Math.floor(ys.length / 2)], labels: ["Long shots", "Sure things", "Not worth it", "Safe but small"] } : null,
          onClick: (p) => { const o = R.opps.find((x) => x.key === p.key); if (o) kit.openOpp(o); },
          empty: "No play matches these filters.",
        }, {
          legend: kinds.map((k) => ({ name: scan.KINDS[k].name, color: scan.KINDS[k].color, kind: "dot" })),
          table: { cols: ["Play", { label: "Confidence", r: true }, { label: "Per hour", r: true }, { label: "Capital", r: true }], rows: pts.slice(0, 200).map((o) => [o.title, String(o.score), silver(o.perHour), silver(o.capital)]) },
        });
      }
      kindsEl.addEventListener("click", (e) => {
        const b = e.target.closest(".chip");
        if (!b || b.disabled) return;
        const k = b.dataset.v;
        if (!k) st.kinds.clear();
        else if (st.kinds.has(k)) st.kinds.delete(k);
        else st.kinds.add(k);
        st.shown = 40;
        drawChips(); drawList();
      });
      ui.onSeg(root, "min", (v) => { st.min = +v; st.shown = 40; drawChips(); drawList(); });
      ui.onSeg(root, "sort", (v) => { st.sort = v; drawList(); });
      root.querySelector("#o-safe").addEventListener("change", (e) => { st.safe = e.target.checked; st.shown = 40; drawChips(); drawList(); });
      drawChips();
      drawList();
      kit.wireOpps(root);
      if (fromLink && q.open) { const o = R.opps.find((x) => x.key === q.open); if (o) setTimeout(() => kit.openOpp(o), 50); }
    },
  };
})();
