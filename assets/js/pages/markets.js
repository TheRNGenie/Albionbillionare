/* Albion Billionaire v2 — Markets: one item across all eight markets, with history, a calibrated forecast and a
   confidence score for every price. Works for any item, not only the scanned ones. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.markets = (() => {
  let city = null;

  async function loadItem(id) {
    const api = AB.api, cat = AB.cat;
    const [rows, hist] = await Promise.all([api.prices([id], cat.MARKETS), api.daily([id], cat.MARKETS, 28)]);
    return { P: api.index(rows)[id] || {}, hist: hist[id] || {} };
  }

  return {
    title: "Markets",
    render(root, { args }) {
      const { esc, icon, silver, int, dateFull, ageText } = AB.util;
      const ui = AB.ui, kit = AB.kit, cat = AB.cat, conf = AB.conf, store = AB.store;
      const id = args[0];
      const watch = store.get("watch") || [];
      const H = { eyebrow: "Markets", title: id ? cat.label(id) : "Markets", sub: "" };

      if (!id) {
        root.innerHTML = `${kit.head({ ...H, title: "Look up any item", sub: "Search in the top bar, or pick from your watchlist. Every item shows all eight markets, four weeks of sales, a calibrated forecast and how far to trust each price." })}
          <div class="grid">${ui.card({ title: "Your watchlist", body: watch.length ? `<div class="picks">${watch.map((w, i) => `<a class="pick" href="#/markets/${encodeURIComponent(w)}" style="color:inherit;text-decoration:none"><span class="p-n">${i + 1}</span><div>${ui.item(w, { sub: esc(w), small: true })}</div><span class="p-right">${icon("arrow")}</span></a>`).join("")}</div>` : ui.empty("Nothing on your watchlist yet. Open an item and press Watch.") })}
          ${AB.state.R ? ui.card({ title: "Most traded right now", sub: "The scanner's busiest items.", body: `<div class="watch">${[...new Set(AB.state.R.opps.slice(0, 40).map((o) => o.item))].slice(0, 16).map((x) => `<a class="chip" href="#/markets/${encodeURIComponent(x)}">${esc(cat.label(x))}</a>`).join("")}</div>` }) : ""}</div>`;
        return;
      }
      if (!AB.state.M) { if (kit.waiting(root, H)) return; }
      const M = AB.state.M;
      const p = cat.parse(id);
      const watching = watch.includes(id);
      const up = cat.upgrade(id);
      const facts = [
        ["Item power", cat.ip(id)], ["Weight", cat.weight(id) != null ? `${cat.weight(id)} kg` : null], ["Crafted best in", cat.craftCity(id)],
        ["Enchanted from", up ? `T${p.tier}.${p.ench - 1} with ${up.count} T${p.tier} ${up.mat.split("_")[1].toLowerCase()}s` : null],
      ].filter((f) => f[1] != null);
      root.innerHTML = `
        <div class="page-head"><div class="mk-head" style="width:100%">
          <div>${ui.item(id, { sub: `<span class="num">${esc(id)}</span>` }).replace('class="item"', 'class="item lg"')}</div>
          <div class="row"><button class="btn${watching ? " primary" : ""}" type="button" id="m-watch">${icon("star")}${watching ? "Watching" : "Watch"}</button></div>
        </div></div>
        <div class="mk-facts" style="margin:-6px 0 16px">${facts.map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join("")}</div>
        ${kit.modeBanner(M)}
        <div class="grid" id="m-grid">${[8, 4, 12].map((s) => `<div class="card span-${s}">${ui.skel(220)}</div>`).join("")}</div>`;
      root.querySelector("#m-watch").addEventListener("click", () => {
        const w = store.get("watch") || [];
        store.set("watch", w.includes(id) ? w.filter((x) => x !== id) : [id, ...w].slice(0, 30));
        AB.app.rerender();
      });

      let alive = true;
      loadItem(id).then((d) => {
        if (!alive) return;
        const stats = Object.fromEntries(cat.MARKETS.map((c) => [c, conf.seriesStats(d.hist[c] || [], M.asOf)]));
        const has = cat.MARKETS.filter((c) => (d.hist[c] || []).length || d.P[c]);
        if (!has.length) { root.querySelector("#m-grid").innerHTML = `<div class="span-12">${ui.empty(M.live ? "No market has reported this item in the last four weeks." : "The saved snapshot doesn't include this item. Live prices would.")}</div>`; return; }
        if (!city || !has.includes(city)) city = has.slice().sort((a, b) => (stats[b].v14 || 0) - (stats[a].v14 || 0))[0];
        const ageH = (iso) => (iso ? (M.now - AB.util.parseUTC(iso)) / 36e5 : null);
        const rowsT = has.map((c) => {
          const r = d.P[c] || {}, s = stats[c];
          const isBM = c === cat.BM;
          const price = isBM ? r.buy : r.sell;
          const a = ageH(isBM ? r.buyDate : r.sellDate);
          const f = { fresh: price ? M.fresh(a) : null, liquidity: conf.F.liquidity(s.v14), history: conf.F.history(s), agree: price && s.pred ? conf.F.agree(price, s.pred) : null };
          const score = conf.score(f);
          const rg = s.pred ? conf.range(s, M.h0) : null;
          return { c, price, a, s, score, rg, isBM };
        });
        const plays = AB.state.R ? AB.state.R.opps.filter((o) => o.item === id || o.legs.some((lg) => lg.id === id)).slice(0, 8) : [];
        root.querySelector("#m-grid").innerHTML = `
          ${ui.chartCard({ id: "m-all", span: 8, title: "Four weeks in every market", sub: "Daily average sale, normal quality, on the same scale in every panel. Dashed: the royal-city median, for reference. The Black Market panel is what its buy orders paid. Tap a market to forecast it.", height: 360 })}
          ${ui.card({ span: 4, title: "Where to buy, where to sell", sub: `Listing now, the usual price, and how far to trust it. Range: 80% of outcomes ${M.live ? "today" : "by today"}.`, body: `<div class="table-wrap"><table class="t"><thead><tr><th>Market</th><th class="r">Now</th><th class="r">Usual</th><th class="r">Trust</th></tr></thead><tbody>${rowsT.map((r) => `<tr class="clickable" data-city="${esc(r.c)}"><td><button type="button" class="link-btn" data-city="${esc(r.c)}"><b>${esc(r.c)}</b></button><div class="small muted">${r.s.v14 != null ? `${r.s.v14 < 10 ? r.s.v14.toFixed(1) : int(r.s.v14)} sold/day` : ""}</div></td><td class="r num">${r.price ? esc(silver(r.price)) : "—"}<div class="small muted">${r.price ? (M.live ? esc(ageText(r.a * 36e5)) + " old" : "last day") : r.isBM ? "no buy order" : "no listing"}</div></td><td class="r num">${r.s.pred ? esc(silver(r.s.pred)) : "—"}<div class="small muted">${r.rg ? `${esc(silver(r.rg.lo))}–${esc(silver(r.rg.hi))}` : ""}</div></td><td class="r">${ui.conf(r.score, { label: false })}</td></tr>`).join("")}</tbody></table></div>`, foot: "Trust blends fresh prices, a busy market, enough history and the listing matching recent sales. Tap a market to forecast it." })}
          ${ui.chartCard({ id: "m-fc", span: 8, title: `Next week in ${city === cat.BM ? "the Black Market" : city}`, sub: "Calibrated forecast: the 80% band held 80% of outcomes in the out-of-sample test.", height: 260, actions: `<select class="select" id="m-city" aria-label="Market">${has.map((c) => `<option ${c === city ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` })}
          ${ui.chartCard({ id: "m-vol", span: 4, title: "Sold per day", sub: `${city === cat.BM ? "Black Market" : esc(city)}, four weeks.`, height: 260 })}
          ${M.live ? ui.chartCard({ id: "m-hour", span: 12, title: "Hour by hour", sub: `Average sale price each hour in ${esc(city)} (live only).`, height: 220 }) : ""}
          ${ui.card({ span: 12, title: "Plays with this item", sub: plays.length ? "From today's scan." : "", body: plays.length ? `<div class="picks">${plays.map((o, i) => kit.pickRow(o, i + 1, `<span>${esc(AB.util.silver(o.perHour))}/h</span>`)).join("")}</div>` : ui.empty("No scored play uses this item right now.") })}`;

        /* one small panel per market on a shared scale (eight colours can't all be told apart, eight panels can) */
        const series = has.filter((c) => (d.hist[c] || []).length).map((c) => ({ key: c, name: c === cat.BM ? "Black Market" : c, data: d.hist[c].map((x) => [x.t, x.price]) }));
        const days = [...new Set(series.flatMap((s) => s.data.map((x) => x[0])))].sort((a, b) => a - b);
        const med = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
        const royal = series.filter((s) => cat.ROYAL.includes(s.key));
        const ref = royal.length >= 2 ? days.map((t) => [t, med(royal.map((s) => s.data.find((x) => x[0] === t)?.[1]))]) : null;
        ui.plot("m-all", "multi", {
          panels: series.map((s) => ({ key: s.key, title: s.name, data: s.data, on: s.key === city, value: silver(s.data[s.data.length - 1][1]), sub: stats[s.key].v14 != null ? `${stats[s.key].v14 < 10 ? stats[s.key].v14.toFixed(1) : int(stats[s.key].v14)} sold a day` : "" })),
          ref: ref ? { name: "Royal-city median", data: ref } : null,
          onClick: (pn) => { city = pn.key; AB.app.rerender(); },
        }, {
          legend: [{ name: "Daily average sale", color: "s1", kind: "line" }, ...(ref ? [{ name: "Royal-city median", color: "var(--text-3)", kind: "line" }] : [])],
          table: { cols: ["Day", ...series.map((s) => ({ label: s.name, r: true }))], rows: days.map((t) => [dateFull(t), ...series.map((s) => { const x = s.data.find((y) => y[0] === t); return x ? silver(x[1]) : "—"; })]) },
        });
        const drawCity = () => {
          const fakeM = { ...M, series: (i, c) => d.hist[c] || [], stat: (i, c) => stats[c] };
          const r = d.P[city] || {};
          const isBM = city === cat.BM;
          const price = isBM ? r.buy : r.sell;
          const ps = kit.priceSpec(fakeM, id, city, { listing: price ? { price, side: isBM ? "buy" : "sell", ageH: ageH(isBM ? r.buyDate : r.sellDate) } : null, h: M.h0 });
          ui.plot("m-fc", "line", ps.spec, { legend: ps.legend, table: ps.table });
          const pts = d.hist[city] || [];
          ui.plot("m-vol", "bars", { categories: pts.map((x) => AB.util.date(x.t)), height: 260, series: [{ name: "Sold", color: "s1", values: pts.map((x) => x.count) }], fmt: (v) => int(v) }, {
            table: { cols: ["Day", { label: "Sold", r: true }], rows: pts.map((x) => [dateFull(x.t), int(x.count)]) },
          });
          if (M.live) AB.api.hourly(id, city).then((hs) => {
            if (!alive || !document.getElementById("m-hour")) return;
            /* server time (UTC), like the rest of the app: ticks fall on 00:00 UTC */
            const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }), hour = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", hourCycle: "h23", timeZone: "UTC" });
            const at = (t) => `${hour.format(new Date(t))}:00 UTC`;
            ui.plot("m-hour", "line", { height: 220, x: { type: "time", fmt: (t) => day.format(new Date(t)) }, y: { zero: false }, series: [{ name: "Hourly average", color: "s1", data: hs.map((x) => [x.t, x.price]) }], tooltip: { title: at } }, {
              table: { cols: ["Hour", { label: "Average", r: true }, { label: "Sold", r: true }], rows: hs.map((x) => [at(x.t), silver(x.price), int(x.count)]) },
            });
          }).catch(() => {});
        };
        drawCity();
        root.querySelector("#m-city").addEventListener("change", (e) => { city = e.target.value; AB.app.rerender(); });
        /* a row click (mouse) or its market button (keyboard) forecasts that market */
        root.querySelectorAll("tr[data-city]").forEach((tr) => tr.addEventListener("click", () => { city = tr.dataset.city; AB.app.rerender(); }));
        kit.wireOpps(root);
      }).catch((e) => {
        if (!alive) return;
        root.querySelector("#m-grid").innerHTML = `<div class="span-12 banner warn">${icon("alert")}<div class="b-body"><div class="b-title">Couldn't load this item</div><div class="small">${esc(e.message)}</div></div></div>`;
      });
      return () => { alive = false; };
    },
  };
})();
