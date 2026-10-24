/* Albion Billionaire v2 — Cost to Max: the cheapest route from the player's Destiny Board levels to level 100 in a
   crafting specialization or crafter mastery, priced in today's markets. The route and its rules live in
   engine/spec.js; this page asks for the levels, draws the route and says how far to trust it. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.costmax = (() => {
  const DEFAULT = "CRAFT_SWORDS_CLAYMORE";
  const PACE = { 14: "2 weeks", 30: "1 month", 60: "2 months", 90: "3 months", 180: "6 months", 365: "1 year" };
  const PACE_SHORT = { 14: "2 wk", 30: "1 mo", 60: "2 mo", 90: "3 mo", 180: "6 mo", 365: "1 yr" };
  const paceName = (d) => PACE[d] || `${d} days`;
  const DRAWS = 400, SPEC_DRAWS = 150;
  /* A line's market model: the app's prices plus everything the line's routes may price (AB.market.extend). The last
     few lines opened are kept. When the app has newer prices, the page keeps showing the line's model it has and
     builds a newer one for the next time it draws, so nothing moves under the player. */
  const KEEP_LINES = 3;
  const models = new Map(), pending = new Map(), failed = new Map();
  /* the charts computed after the page draws (every pace, every specialization), kept while their inputs match */
  let paceMemo = null, specMemo = null, dataErr = null;

  /* the line's model for the prices on screen (or the one before them, of the same kind), loading it if needed */
  function marketFor(lineId, M, onReady) {
    const have = models.get(lineId);
    if (have && have.seq === M.seq) return have.B;
    const fail = failed.get(lineId);
    if (!pending.has(lineId) && !(fail && fail.seq === M.seq)) {
      const seq = M.seq;
      const p = AB.market.extend(AB.spec.needs(lineId)).then((B) => {
        failed.delete(lineId);
        models.delete(lineId);
        models.set(lineId, { seq, live: M.live, B });
        while (models.size > KEEP_LINES) models.delete(models.keys().next().value);
      }, (e) => { failed.set(lineId, { seq, e }); });
      pending.set(lineId, p);
      p.finally(() => pending.delete(lineId));
    }
    const shown = have && have.live === M.live ? have.B : null;
    if (!shown && pending.has(lineId)) pending.get(lineId).then(onReady);
    return shown;
  }

  return {
    title: "Cost to Max",
    render(root, { args }) {
      const { esc, icon, silver, int, sleep } = AB.util;
      const ui = AB.ui, kit = AB.kit, store = AB.store, S = AB.spec, cat = AB.cat, conf = AB.conf;
      const H = {
        eyebrow: "Cost to Max",
        title: "The cheapest road to level 100",
        sub: "Pick a crafting line and a specialization, enter your levels, and get the cheapest way to max it at today's prices: what to craft at each stage, where to sell it, what it costs, and how sure that number is. The fame rules come from Albion's own game files.",
      };
      if (kit.waiting(root, H, [12, 12, 8, 4, 6, 6])) return;
      let alive = true;
      const again = () => { if (alive) AB.app.rerender(); };
      const M = AB.state.M;

      /* ---------- the Destiny Board data (loaded once) ---------- */
      if (!S.data) {
        if (dataErr) {
          root.innerHTML = `${kit.head(H)}<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">The Destiny Board data didn't load</div><div class="small">${esc(dataErr.message || "Loading failed.")}</div><div class="row" style="margin-top:8px"><button class="btn" type="button" data-cm-retry>${icon("refresh")}Try again</button></div></div></div>`;
          root.querySelector("[data-cm-retry]").addEventListener("click", () => { dataErr = null; again(); });
        } else {
          root.innerHTML = `${kit.head(H)}<div class="grid" aria-busy="true">${[12, 12, 8, 4].map((s) => `<div class="card span-${s}">${ui.skel(s === 12 ? 90 : 220)}</div>`).join("")}</div>`;
          S.ready().then(again, (e) => { dataErr = e; again(); });
        }
        return () => { alive = false; };
      }

      /* ---------- what to plan ---------- */
      const cm = store.get("costMax"), levels = store.get("specLevels");
      const valid = (id) => (S.node(id) && S.craftable(S.node(id)) ? id : null);
      const nodeId = valid(args[0]) || valid(cm.node) || DEFAULT;
      if (nodeId !== cm.node) store.set("costMax", { ...cm, node: nodeId }); // the last one planned opens next time
      const T = S.node(nodeId), Lm = S.lineOf(nodeId), isSpec = T.kind === "spec";
      const nodes = [Lm, ...S.specsOf(Lm.id)];
      const lv = (id) => levels[id] ?? 0;
      const premium = store.get("premium"), focusDay = store.get("focus");
      const useFocus = premium && cm.focus;
      const nameOf = (n) => (n.kind === "base" ? n.name : S.short(n));
      const tName = nameOf(T);
      const from = isSpec ? lv(T.id) : Math.max(1, lv(Lm.id));
      let lpAll = 0;
      for (let i = Math.min(from, 100); i < 100; i++) lpAll += S.lpOf(T, i);

      /* ---------- the form ---------- */
      const byCat = new Map(Object.keys(S.data.cats).map((k) => [k, []]));
      for (const L of S.lines()) if (S.craftable(L)) byCat.get(L.cat)?.push(L);
      const lineSel = `<select class="select" id="cm-line">${[...byCat].map(([k, ls]) => `<optgroup label="${esc(S.data.cats[k])}">${ls.slice().sort((a, b) => a.name.localeCompare(b.name)).map((L) => `<option value="${esc(L.id)}"${L.id === Lm.id ? " selected" : ""}>${esc(L.name)}</option>`).join("")}</optgroup>`).join("")}</select>`;
      const specs = S.specsOf(Lm.id).filter(S.craftable).sort((a, b) => S.short(a).localeCompare(S.short(b)));
      const opt = (n, label) => `<option value="${esc(n.id)}"${n.id === T.id ? " selected" : ""}>${esc(label)}</option>`;
      const plain = specs.filter((s) => !S.special(s)), fancy = specs.filter((s) => S.special(s));
      const targetSel = `<select class="select" id="cm-target">${opt(Lm, `${Lm.name} (the mastery)`)}${plain.length ? `<optgroup label="Specializations">${plain.map((s) => opt(s, S.short(s))).join("")}</optgroup>` : ""}${fancy.length ? `<optgroup label="Artifact and special items">${fancy.map((s) => opt(s, S.short(s))).join("")}</optgroup>` : ""}</select>`;
      const levelInputs = nodes.map((n) => `<label class="field"><span>${esc(nameOf(n))}</span><input class="input num" type="number" min="0" max="100" step="1" inputmode="numeric" data-node="${esc(n.id)}" value="${lv(n.id)}"></label>`).join("");
      const form = `
        <section class="card cm-form-card"><form class="cm-form" id="cm-form">
          <div class="cm-row">
            <label class="field"><span>Crafting line</span>${lineSel}</label>
            <label class="field"><span>Level to 100</span>${targetSel}</label>
            <div class="field"><span>Time to take</span>${ui.seg("pace", S.PACES.map((d) => [d, PACE_SHORT[d]]), cm.days, "Time to take")}</div>
            <label class="field"><span>Station fee</span><input class="input num" type="number" min="0" max="${S.MAX_FEE}" step="10" data-k="fee" value="${cm.fee}"><span class="hint">Silver per 100 nutrition; 0 on your own island</span></label>
          </div>
          <fieldset class="cm-levels"><legend>Your levels in this line (Destiny Board)</legend><div class="cm-lv-grid">${levelInputs}</div></fieldset>
          <div class="cm-row cm-opts">
            <label class="check"><input type="checkbox" data-k="focus" ${useFocus ? "checked" : ""} ${premium ? "" : "disabled"}> Use focus (${int(focusDay)} a day)</label>
            <label class="check"><input type="checkbox" data-k="journals" ${cm.journals ? "checked" : ""}> Fill and sell journals</label>
            <label class="field cm-lp"><span>Learning points to spend</span><input class="input num" type="number" min="0" step="100" data-k="lp" value="${cm.lp}"><span class="hint">Quick Learn: a level then takes a fifth of its fame. All of ${esc(tName)}: ${int(lpAll)} points.</span></label>
            <span class="small muted cm-prem">${premium ? `Premium on (fame ×1.5, 4% sales tax)` : `Premium off (no fame bonus, 8% tax, and focus doesn't refill)`} · <a href="#/settings">Settings</a></span>
          </div>
        </form></section>`;

      /* ---------- the line's prices ---------- */
      const B = marketFor(Lm.id, M, again);
      const fail = failed.get(Lm.id);
      if (!B) {
        const msg = fail && fail.seq === M.seq
          ? `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">Prices for ${esc(Lm.name)} didn't load</div><div class="small">${esc(fail.e.message || "Loading failed.")}</div><div class="row" style="margin-top:8px"><button class="btn" type="button" data-cm-retry>${icon("refresh")}Try again</button></div></div></div>`
          : `<div class="grid" aria-busy="true"><div class="card span-12"><div class="small muted">Loading prices and four weeks of sales for every ${esc(Lm.name.replace(/ (Crafter|Tailor)$/, "").toLowerCase())} item, its materials and journals…</div>${ui.skel(70)}</div>${[8, 4, 6, 6].map((s) => `<div class="card span-${s}">${ui.skel(220)}</div>`).join("")}</div>`;
        root.innerHTML = `${kit.head(H)}${kit.modeBanner(M)}${form}${msg}`;
        root.querySelector("[data-cm-retry]")?.addEventListener("click", () => { failed.delete(Lm.id); again(); });
        return wire();
      }

      /* ---------- the route ---------- */
      const base = { node: T.id, levels, premium, days: cm.days, focusPerDay: useFocus ? focusDay : 0, journals: cm.journals, fee: cm.fee, lp: cm.lp };
      const p = S.plan(B, { ...base, seed: 7, draws: DRAWS });
      const c = S.confidence(B, p);
      const tot = p.totals;
      /* a cost reads as silver spent; a route that pays reads as such, never as a negative cost */
      const costText = (v) => (v < 0 ? `pays ${silver(-v)}` : silver(v));
      const costWord = (v) => (v < 0 ? `pays ${silver(-v)}` : `costs ${silver(v)}`);
      /* a range of costs in words: "pays 68.4M to 146M", "costs 2M to 5M", or "pays 1M to costs 3M" */
      const rangeText = (lo, hi) => (hi < 0 ? `pays ${silver(-hi)} to ${silver(-lo)}` : lo >= 0 ? `costs ${silver(lo)} to ${silver(hi)}` : `${costWord(lo)} to ${costWord(hi)}`);
      const lvl = (x) => (x >= 99.95 ? "100" : x % 1 ? x.toFixed(1) : String(x));

      /* what the prices on screen can't cover */
      const gaps = [];
      const one = p.missing.length === 1;
      if (p.missing.length) gaps.push(`${int(p.missing.length)} material${one ? "" : "s"} for some ${esc(tName)} items ${M.live ? (one ? "has no recent listings or sales" : "have no recent listings or sales") : one ? "isn't in the saved snapshot" : "aren't in the saved snapshot"} (${esc(p.missing.slice(0, 3).map((id) => cat.label(id)).join(", "))}${p.missing.length > 3 ? "…" : ""}), so those items are left out.`);
      if (p.prelude?.missing) gaps.push(`The first ${esc(Lm.name)} level comes from tier-3 crafts, which ${M.live ? "have no prices right now" : "the snapshot doesn't price"}; its ${silver(p.prelude.fame)} fame (a few thousand silver) is left out.`);
      if (p.journals.on && !p.journals.priced) gaps.push(`Journals ${M.live ? "have no recent sales for this line" : "aren't in the snapshot"}, so the route earns nothing from them.`);
      const gapBanner = gaps.length ? `<div class="banner info">${icon("info")}<div class="b-body"><div class="b-title">${M.live ? "Some prices are missing" : "Some of this needs live prices"}</div><div class="small">${gaps.join(" ")}</div></div></div>` : "";

      if (!p.fame.target || !p.options) {
        const why = !p.fame.target
          ? `${esc(tName)} is already at 100. Pick another specialization, or tap one below the levels to plan it.`
          : `None of the ${esc(tName)} items can be priced ${M.live ? "right now" : "from the saved snapshot (its artifacts and special materials aren't in it)"}. ${M.live ? "Try again after the next price reload." : "With live prices on your own device, this route works."}`;
        root.innerHTML = `${kit.head(H)}${kit.modeBanner(M)}${form}${gapBanner}<div class="card">${ui.empty(why, p.fame.target ? "alert" : "check")}</div>`;
        return wire();
      }

      /* ---------- KPIs ---------- */
      const crafts = tot.crafts, perDay = crafts / p.days;
      const kpis = [
        ui.kpi({ label: `${icon("coin")} ${tot.net < 0 ? "Leveling pays you" : "Cost to max"}`, value: esc(tot.net < 0 ? silver(-tot.net, { sign: true }) : silver(tot.net)), range: `80% range: ${esc(rangeText(p.range.p10, p.range.p90))}`, title: "At today's typical prices; the range comes from the calibrated price ranges" }),
        ui.kpi({ label: `${icon("star")} Fame to earn`, value: esc(silver(p.fame.target)), range: `${int(crafts)} crafts, about ${int(perDay)} a day` }),
        ui.kpi({ label: `${icon("clock")} ${esc(paceName(p.days))}`, value: tot.kept ? `${int(tot.kept)} unsold` : "All sold", range: tot.kept ? "crafts the markets can't take at this pace" : "every craft sells at this pace" }),
        ui.kpi({ label: `${icon("shield")} Confidence`, value: `${c.score} <small class="k-tier">${esc(c.tier.label)}</small>`, range: "how far to trust the cost" }),
      ].join("");

      /* ---------- the route, step by step ---------- */
      const sellText = (it) => it.sold.map((x) => `<span class="cm-nw">${x.city ? esc(x.city) : "kept unsold"} ${int(x.n)}</span>`).join(" · ");
      const mastery = (s) => (!isSpec ? "" : s.to.m - s.from.m >= 0.05 ? ` · ${esc(Lm.name)} ${lvl(s.from.m)} → ${lvl(s.to.m)}` : ` · ${esc(Lm.name)} ${lvl(s.to.m)}`);
      const stageHead = (s) => `<tr class="cm-stage"><th colspan="6" scope="rowgroup"><b>${esc(tName)} ${lvl(s.from.t)} → ${lvl(s.to.t)}</b>${mastery(s)} · crafts up to T${s.tier} · ${silver(s.fame)} fame · ${esc(costText(s.cost.net))}</th></tr>`;
      /* on a phone the Sell column folds under the item (.cm-sell-sm), so the table fits without scrolling sideways */
      const craftCell = (id, sub, sell) => `<td>${ui.item(id, { sub })}${sell ? `<div class="cm-sell-sm">Sell: ${sell}</div>` : ""}</td>`;
      const itemRow = (it) => `<tr>${craftCell(it.id, esc(it.op.city ? `Bonus city: ${it.op.city}` : "No bonus city"), sellText(it))}<td class="r num">${int(it.n)}</td><td class="r num cm-wide">${it.nF ? int(it.nF) : "—"}</td><td class="cm-sell cm-wide">${sellText(it)}</td><td class="r num cm-wide">${it.journals >= 0.5 ? int(it.journals) : "—"}</td><td class="r num">${esc(costText(it.net))}</td></tr>`;
      let preRows = "";
      if (p.prelude) {
        const pr = p.prelude;
        const preSell = pr.op ? sellText({ sold: [...(pr.sold ? [{ city: pr.top.leg.city, n: pr.sold }] : []), ...(pr.n > pr.sold ? [{ city: null, n: pr.n - pr.sold }] : [])] }) : "";
        preRows = `<tr class="cm-stage"><th colspan="6" scope="rowgroup"><b>${esc(Lm.name)} 0 → 1</b> · tier-3 crafts · ${silver(pr.fame)} fame${pr.op ? ` · ${esc(costText(pr.cost))}` : ""}</th></tr>` + (pr.op
          ? `<tr>${craftCell(pr.op.id, "The first level only counts tier 3", preSell)}<td class="r num">${int(pr.n)}</td><td class="r num cm-wide">—</td><td class="cm-sell cm-wide">${preSell}</td><td class="r num cm-wide">—</td><td class="r num">${esc(costText(pr.cost))}</td></tr>`
          : `<tr><td colspan="6" class="small muted">Not priced: no tier-3 ${esc(Lm.name.replace(/ (Crafter|Tailor)$/, "").toLowerCase())} items have prices here.</td></tr>`);
      }
      const routeTable = `<div class="table-wrap"><table class="t cm-steps"><thead><tr><th scope="col">Craft</th><th class="r" scope="col">Crafts</th><th class="r cm-wide" scope="col">With focus</th><th class="cm-wide" scope="col">Sell</th><th class="r cm-wide" scope="col">Journals</th><th class="r" scope="col">Cost</th></tr></thead><tbody>${preRows}${p.steps.map((s) => stageHead(s) + s.items.map(itemRow).join("")).join("")}</tbody></table></div>`;

      /* ---------- how sure ---------- */
      const fl = conf.factorList(c.f, {
        fresh: M.live ? "How recent the listings behind today's prices are." : "The snapshot's prices are days old.",
        liquidity: "How much the markets the route sells into trade a day, weighted by the silver sold there.",
        history: "Days of sales behind each price the route uses.",
        agree: "Whether today's listings match recent sales.",
        evidence: "No backtest covers a whole leveling route, so this stays at the app's neutral 40.",
      });
      const weak = fl.filter((f) => f.value < 0.6).sort((a, b) => a.value - b.value).slice(0, 2).map((f) => ({ fresh: "the prices are old", liquidity: "some of the markets are thin", history: "some prices have little sales history", agree: "some listings don't match recent sales", evidence: "routes like this aren't backtested" }[f.key]));
      const verdict = `<b>${esc(c.tier.label)} confidence.</b> The fame and level rules are exact (Albion's own files)${weak.length ? `; the prices are less certain because ${weak.join(" and ")}` : ", and the prices it rests on look solid"}. The 80% range above covers price swings, not changes to the game.`;

      /* ---------- assumptions ---------- */
      const notes = [
        `Fame per craft comes from the resources in its recipe, times the item's artifact factor; artifacts themselves give none. A craft counts for ${esc(Lm.name)} and its specialization alike${premium ? ", and premium adds half again" : ""}.`,
        `${esc(Lm.name)} unlocks a tier at levels 1, 10, 30, 60 and 100 (T4 to T8), so the route stays on lower tiers until the mastery gets there. ${isSpec ? "" : "A mastery never reaches T8 before it's maxed. "}The first mastery level only counts tier-3 crafts.`,
        `Prices are each market's typical price: the median sale of the last 7 days (the listing where sales are thin). Materials are bought in the cheapest royal city, Caerleon or Brecilien; returns are ${Math.round(cat.RETURN.craftBonus.none * 1000) / 10}% in the item's bonus city (${Math.round(cat.RETURN.craftBonus.focus * 1000) / 10}% with focus).`,
        `The route sells at most a quarter of what each market sells a day, so it adds to a market instead of flooding it. Crafts beyond that are kept, counted as worth nothing: selling them below the usual price would make the route cheaper.`,
        useFocus ? `Focus: ${int(focusDay)} a day over ${esc(paceName(p.days).toLowerCase())}, spread evenly over the route. The route picks its crafts with focus in mind and spends it where it saves the most silver per point, at the levels it has reached by then.` : premium ? "Focus is off." : "Focus is off: without premium it doesn't refill.",
        cm.journals ? `Journals: a craft fills a journal of its tier with its fame (premium bonus left out); empty ones cost ${silver(S.data.jr.silver[0])} to ${silver(S.data.jr.silver[4])} from the NPC or less on the market, and full ones sell in the city that pays most, up to a quarter of its sales.` : "Journals are left out.",
        cm.lp ? `Learning points: ${int(p.ql.used)} spent with Quick Learn where a point saves the most fame, which is ${esc(tName)}'s top levels${p.ql.from != null ? ` (from level ${p.ql.from})` : ""}, saving ${silver(p.fame.saved)} fame.` : "No learning points spent.",
        "Not counted: your time, travel and its risk, crafting tax beyond the station fee, item quality (crafts are priced as normal quality; better ones sell for more), and the Black Market's demand changing while you sell into it.",
        `Not in the lists: ${esc(S.lines().flatMap((L) => [L, ...S.specsOf(L.id)]).filter((n) => !S.craftable(n)).map(nameOf).join(", "))}. The app's item data has no recipes for their items yet.`,
      ];

      root.innerHTML = `
        ${kit.head(H)}
        ${kit.modeBanner(M)}
        ${form}
        ${gapBanner}
        <section class="card" style="margin-bottom:16px"><div class="kpis">${kpis}</div></section>
        <div class="grid">
          ${ui.chartCard({ id: "cm-curve", span: 8, title: `Silver spent on the way to ${tName} 100`, sub: `Running cost by ${esc(tName)} level at today's typical prices, with the 80% range from ${int(DRAWS)} price outcomes. Below zero, the route has paid you so far. Lines mark where ${esc(Lm.name)} unlocks the next tier.`, height: 280 })}
          ${ui.card({ span: 4, title: "How sure is this?", body: `<div class="verdict">${kit.gauge(c.score)}<div class="verdict-text">${verdict}</div></div>${ui.factors(fl)}`, foot: `<a href="#/trust">How the score and the ranges are built</a>` })}
          ${ui.chartCard({ id: "cm-heat", span: 6, title: "Silver per fame, every item it can craft", sub: `Each tier and enchantment sold at its best market, journals in. Red costs silver for each point of fame; blue pays you.${isSpec ? "" : " Each cell shows the line's cheapest item."}`, height: 230 })}
          ${ui.chartCard({ id: "cm-pace", span: 6, title: "What time buys", sub: "The cheapest route at each pace. A shorter time sells less into each market, so more crafts go unsold or pricier items take their place. Below zero, the route pays you.", height: 230 })}
          ${ui.card({ span: 12, title: "The route", sub: `What to craft at each stage, from your levels to ${esc(tName)} 100, and where to sell it. Crafting in the item's bonus city returns more materials.`, body: routeTable })}
          ${ui.chartCard({ id: "cm-specs", span: 7, title: `Every specialization in ${Lm.name}`, sub: "Cost to 100 from your levels with the same settings: at typical prices (dot) and the 80% range (bar). Tap one to plan it.", height: 60 + 30 * (specs.length + 1) })}
          ${ui.chartCard({ id: "cm-flow", span: 5, title: "Where the silver goes", sub: `Spent and earned over the whole route: ${esc(costText(tot.net))} net.`, height: 230 })}
          ${ui.card({ span: 12, title: "What this assumes", body: `<ul class="know">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>` })}
        </div>`;

      /* the running cost by level, with tier unlocks and the Quick Learn mark */
      const vl = p.unlocks.map((u) => ({ x: u.at, label: `T${u.tier}` }));
      if (p.ql.from != null && p.ql.from > p.curve[0].level) vl.push({ x: p.ql.from, label: "Quick Learn" });
      ui.plot("cm-curve", "line", {
        height: 280, label: `Running cost to ${tName} 100`,
        x: { type: "linear", min: p.curve[0].level, max: 100, fmt: (v) => String(Math.round(v)), label: `${tName} level` },
        y: { fmt: (v) => silver(v) },
        series: [{ name: "At typical prices", color: "s1", data: p.curve.map((d) => [d.level, d.point]) }],
        bands: [{ name: "80% range", color: "s1", opacity: 0.16, data: p.curve.map((d) => [d.level, d.p10, d.p90]) }],
        vlines: vl,
        tooltip: { title: (v) => `${tName} level ${Math.round(v)}`, fmt: costText, range: rangeText },
      }, {
        legend: [{ name: "At typical prices", color: "s1", kind: "line" }, { name: "80% range", color: "s1", kind: "band" }],
        table: { cols: ["Level", { label: "Cost so far", r: true }, { label: "10%", r: true }, { label: "90%", r: true }], rows: p.curve.filter((d, i) => d.level % 5 === 0 || i === 0 || d.level === 100).map((d) => [String(d.level), costText(d.point), costText(d.p10), costText(d.p90)]) },
      });

      /* silver per fame by tier and enchantment, the best item in each cell: lower is better, so the scale is flipped
         (blue pays, red costs) */
      const tiers = [...new Set(p.table.map((r) => r.tier))].sort((a, b) => a - b);
      const best = tiers.map((t) => [0, 1, 2, 3, 4].map((e) => p.table.filter((r) => r.tier === t && r.ench === e).sort((a, b) => a.perFame - b.perFame)[0] || null));
      const perFameText = (v) => (v < 0 ? `pays ${silver(-v, { digits: 2 })}` : silver(v, { digits: 2 }));
      ui.plot("cm-heat", "heat", {
        rows: tiers.map((t) => `T${t}`), cols: [".0", ".1", ".2", ".3", ".4"], scale: "div", flip: true, gamma: 0.5, cellH: 32,
        values: best.map((row) => row.map((r) => (r ? r.perFame : null))),
        fmt: (v) => silver(v, { digits: Math.abs(v) < 10 ? 1 : 0 }), valueName: "Silver per fame (below zero: it pays)",
        note: (i, j) => { const r = best[i][j]; if (!r) return "Not craftable here, or not priced."; return `${cat.label(r.id)}: ${perFameText(r.perFame)} silver per fame, ${r.best ? `selling in ${r.best}` : "kept unsold"}.${r.locked ? ` Unlocks at ${Lm.name} ${r.unlockAt}.` : ""}`; },
      }, { table: { cols: ["Item", { label: "Fame", r: true }, { label: "Silver per fame", r: true }, "Best market", "Unlocks at"], rows: best.flat().filter(Boolean).map((r) => [cat.label(r.id), int(r.fame), perFameText(r.perFame), r.best || "kept", `${Lm.name} ${r.unlockAt}`]) } });

      /* spent and earned, the whole route */
      const flow = [
        ["Materials", tot.buy, true], ["Returned", tot.back, false], ["Station fees", tot.fee, true],
        ["Sales", tot.sale, false], ["Journals", tot.journals, false], ["First level", tot.pre, tot.pre >= 0],
      ].filter(([, v], i) => i < 2 || i === 3 || Math.abs(v) >= 1);
      ui.plot("cm-flow", "bars", {
        horizontal: true, valueLabels: true, label: "Silver spent and earned over the route",
        categories: flow.map((f) => f[0]),
        series: [{ name: "Silver", color: "s2", values: flow.map(([, v, spent]) => (spent ? Math.abs(v) : -Math.abs(v))) }],
        colors: flow.map(([, , spent]) => (spent ? "s2" : "s1")),
        fmt: (v) => silver(Math.abs(v)),
      }, {
        legend: [{ name: "Spent", color: "s2" }, { name: "Earned or returned", color: "s1" }],
        table: { cols: ["", { label: "Silver", r: true }], rows: [...flow.map(([n, v, spent]) => [n, `${spent ? "−" : "+"}${silver(Math.abs(v))}`]), ["Net", costText(tot.net)]] },
      });

      /* ---------- after the first paint: every pace, then every specialization ---------- */
      const paces = [...new Set([...S.PACES, p.days])].sort((a, b) => a - b);
      const keyBase = JSON.stringify([B.seq, Lm.id, nodes.map((n) => lv(n.id)), premium, base.focusPerDay, cm.journals, cm.fee, cm.lp]);
      const paceKey = keyBase + T.id + paces.join(",");
      const drawPace = (rows) => {
        const nets = rows.map((r) => (r.d === p.days ? tot.net : r.net));
        const allSold = rows.find((r) => !r.kept);
        const sub = root.querySelector("#cm-pace .sub");
        if (sub) sub.textContent = `The cheapest route at each pace. A shorter time sells less into each market, so more crafts go unsold or pricier items take their place.${allSold ? ` At ${paceName(allSold.d).toLowerCase()}, every craft sells.` : " Some crafts go unsold even at a year."} Below zero, the route pays you.`;
        ui.plot("cm-pace", "bars", {
          categories: rows.map((r) => PACE_SHORT[r.d] || `${r.d} d`), label: "Cost to max by pace",
          series: [{ name: "Cost to max", color: "s1", values: nets }],
          colors: rows.map((r) => (r.d === p.days ? "s1" : "var(--deemph)")),
          fmt: (v) => silver(v), labelFmt: (v) => silver(Math.abs(v)), tipFmt: costText, valueLabels: true,
          notes: rows.map((r) => `${paceName(r.d)}${r.d === p.days ? " (your pace)" : ""}: ${r.kept ? `${int(r.kept)} of ${int(r.crafts)} crafts kept unsold` : `all ${int(r.crafts)} crafts sold`}.`),
        }, { table: { cols: ["Pace", { label: "Cost", r: true }, { label: "Crafts", r: true }, { label: "Unsold", r: true }], rows: rows.map((r, i) => [paceName(r.d), costText(nets[i]), int(r.crafts), int(r.kept)]) } });
      };
      const specKey = keyBase + specs.map((s) => s.id).join(",");
      const drawSpecs = (rows) => {
        const ok = rows.filter((r) => r.range);
        const skipped = rows.filter((r) => !r.range).map((r) => r.name);
        const sub = root.querySelector("#cm-specs .sub");
        if (sub) sub.textContent = `Cost to 100 from your levels with the same settings: at typical prices (dot) and the 80% range (bar). Tap one to plan it.${skipped.length ? ` Not priced here: ${skipped.join(", ")}.` : ""}`;
        ui.plot("cm-specs", "forest", {
          rows: ok.sort((a, b) => a.net - b.net).map((r) => ({ id: r.id, label: `${r.name}${r.id === Lm.id ? " (mastery)" : ""}${r.id === T.id ? " · this one" : ""}`, lo: r.range.p10, mid: r.net, hi: r.range.p90, tier: r.tier, sub: r.done ? "Already at 100" : `${int(r.crafts)} crafts` })),
          fmt: (v) => silver(v), labelFmt: costText, tipFmt: costText, rangeFmt: rangeText, midName: "At typical prices",
          onClick: (r) => { if (r.id !== T.id) location.hash = `#/costmax/${r.id}`; },
          empty: "None of this line's routes can be priced here.",
        }, { table: { cols: ["Specialization", { label: "Cost", r: true }, { label: "10%", r: true }, { label: "90%", r: true }, { label: "Crafts", r: true }], rows: ok.map((r) => [r.name, costText(r.net), costText(r.range.p10), costText(r.range.p90), int(r.crafts)]) } });
      };
      (async () => {
        if (paceMemo?.key !== paceKey) {
          const rows = [];
          for (const d of paces) {
            await sleep(0);
            if (!alive) return;
            const q = d === p.days ? p : S.plan(B, { ...base, days: d, draws: 0 });
            rows.push({ d, net: q.totals.net, crafts: q.totals.crafts, kept: q.totals.kept });
          }
          paceMemo = { key: paceKey, rows };
        }
        drawPace(paceMemo.rows);
        if (specMemo?.key !== specKey) {
          const rows = [];
          for (const s of [Lm, ...specs]) {
            await sleep(0);
            if (!alive) return;
            const q = s.id === T.id ? p : S.plan(B, { ...base, node: s.id, seed: 7, draws: SPEC_DRAWS });
            const done = !q.fame.target, priced = done || q.options > 0;
            rows.push({ id: s.id, name: nameOf(s), net: done ? 0 : q.totals.net, crafts: q.totals.crafts, done, range: !priced ? null : done ? { p10: 0, p90: 0 } : q.range, tier: done ? "high" : S.confidence(B, q).tier.key });
          }
          specMemo = { key: specKey, rows };
        }
        drawSpecs(specMemo.rows);
      })();

      return wire();

      /* ---------- the form's controls ---------- */
      function wire() {
        const f = root.querySelector("#cm-form");
        f.addEventListener("submit", (e) => e.preventDefault());
        const set = (patch) => store.set("costMax", { ...store.get("costMax"), ...patch });
        f.querySelector("#cm-line").addEventListener("change", (e) => {
          /* a new line opens on its first plain specialization (the snapshot prices those), else its mastery */
          const ss = S.specsOf(e.target.value).filter((s) => S.craftable(s) && !S.special(s)).sort((a, b) => S.short(a).localeCompare(S.short(b)));
          location.hash = `#/costmax/${(ss[0] || S.node(e.target.value)).id}`;
        });
        f.querySelector("#cm-target").addEventListener("change", (e) => { location.hash = `#/costmax/${e.target.value}`; });
        /* numbers commit on change (blur, Enter, the arrows), so a redraw never takes a field you're typing in */
        f.addEventListener("change", (e) => {
          const el = e.target;
          if (el.dataset.node) {
            const v = Math.round(+el.value);
            if (!(v >= 0 && v <= 100) || el.value === "") { el.value = lv(el.dataset.node); return; }
            store.set("specLevels", { ...store.get("specLevels"), [el.dataset.node]: v });
          } else if (el.dataset.k === "focus" || el.dataset.k === "journals") set({ [el.dataset.k]: el.checked });
          else if (el.dataset.k === "fee" || el.dataset.k === "lp") {
            const v = +el.value;
            if (!(v >= 0) || el.value === "") { el.value = cm[el.dataset.k]; return; }
            set({ [el.dataset.k]: v });
          }
        });
        ui.onSeg(root, "pace", (v) => set({ days: +v }));
        const off = store.on("change", (k) => { if (k === "costMax" || k === "specLevels") again(); });
        return () => { alive = false; off(); };
      }
    },
  };
})();
