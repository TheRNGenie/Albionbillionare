/* Albion Billionaire v2 — Crafting: what to craft for profit in one crafting line, and the daily loop that makes it
   pay. v1's Crafting tab ("What to craft, category by category") on v2's prices, with ranges and a confidence score.
   The plan lives in engine/crafting.js; the daily loop in engine/loop.js, drawn by pages/craftkit.js.

   The page plans the best mix of a line (its top items together) or one item in it. "Show me the money" picks the
   single item whose day earns the most and plans it. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.crafting = (() => {
  const DEFAULT = "CRAFT_SWORDS";
  const DRAWS = 400, ITEM_DRAWS = 150, RANKED_ROWS = 15;
  /* the line's items planned on their own (for the item list and Show me the money), and with ranges (the chart),
     kept while their inputs match */
  let rankMemo = null, rangeMemo = null, dataErr = null;
  /* Show me the money asked for this item: once its plan is on screen, scroll to it and say what it earns */
  let moneyAsk = null;
  /* the settings that change the plan (the others only change the daily loop) */
  const PLAN_KEYS = ["line", "item", "top", "budget", "focus", "fee", "noCap"];

  return {
    title: "Crafting",
    render(root, { args }) {
      const { esc, icon, silver, int, pct, sleep, toast } = AB.util;
      const ui = AB.ui, kit = AB.kit, ck = AB.craftKit, store = AB.store, S = AB.spec, C = AB.crafting, cat = AB.cat, conf = AB.conf;
      const H = {
        eyebrow: "Crafting",
        title: "What to craft, and the loop that makes it pay",
        sub: "Pick a crafting line. The app prices every item it can craft, T4 to T8 at every enchantment, plans a day of the ones that pay, and lays it out as a loop around the cities for your pack mount. Show me the money picks the single item that earns the most.",
      };
      if (kit.waiting(root, H, [12, 12, 8, 4, 12])) return;
      let alive = true;
      const again = () => { if (alive) AB.app.rerender(); };
      const M = AB.state.M;

      /* ---------- the Destiny Board data (loaded once: the lines, their items and recipes) ---------- */
      if (!S.data) {
        if (dataErr) {
          root.innerHTML = `${kit.head(H)}<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">The crafting data didn't load</div><div class="small">${esc(dataErr.message || "Loading failed.")}</div><div class="row" style="margin-top:8px"><button class="btn" type="button" data-cr-retry>${icon("refresh")}Try again</button></div></div></div>`;
          root.querySelector("[data-cr-retry]").addEventListener("click", () => { dataErr = null; again(); });
        } else {
          root.innerHTML = `${kit.head(H)}<div class="grid" aria-busy="true">${[12, 12, 8, 4].map((s) => `<div class="card span-${s}">${ui.skel(s === 12 ? 90 : 220)}</div>`).join("")}</div>`;
          S.ready().then(again, (e) => { dataErr = e; again(); });
        }
        return () => { alive = false; };
      }

      /* ---------- what to plan: a line (its best mix) or one item in it ---------- */
      const cr = store.get("crafting"), levels = store.get("specLevels");
      const asLine = (id) => { const n = S.node(id); return n && n.kind === "base" && C.lineOf(id) ? id : null; };
      const asItem = (id) => { const n = S.node(id); return n && n.kind === "spec" && C.lineOf(id) ? id : null; };
      let lineId, itemId;
      if (asLine(args[0])) { lineId = args[0]; itemId = ""; }
      else if (asItem(args[0])) { itemId = args[0]; lineId = C.lineOf(itemId).id; }
      else {
        lineId = asLine(cr.line) || DEFAULT;
        itemId = asItem(cr.item) && C.lineOf(cr.item).id === lineId ? cr.item : "";
      }
      /* the last one planned opens next time */
      if (lineId !== cr.line || itemId !== cr.item) store.set("crafting", { ...cr, line: lineId, item: itemId });
      const L = S.node(lineId);
      const items = C.itemsOf(lineId);
      const premium = store.get("premium"), focusDay = store.get("focus"), royal = !!store.get("safeOnly");
      const useFocus = premium && cr.focus;
      const lv = levels[lineId] ?? 0, canCraft = C.unlocked(lv);

      /* ---------- the line's prices ---------- */
      const B = ck.marketFor(lineId, M, again);
      const fail = ck.failure(lineId, M);
      const base = { line: lineId, top: cr.top, budget: cr.budget, focusPerDay: useFocus ? focusDay : 0, levels, premium, fee: cr.fee, share: cr.noCap ? 1 : S.SHARE, royal };
      const memoKey = B ? JSON.stringify([B.seq, lineId, cr.top, cr.budget, base.focusPerDay, [L, ...items].map((n) => levels[n.id] ?? 0), premium, cr.fee, base.share, royal]) : null;
      if (B && rankMemo?.key !== memoKey) rankMemo = { key: memoKey, ranked: C.rank(B, base) };
      const ranked = B ? rankMemo.ranked : null;
      const byId = new Map((ranked || []).map((r) => [r.id, r]));
      const mix = ranked ? C.mixOf(ranked) : [];
      const best = ranked ? C.money(ranked) : null;
      const itemName = (id) => S.short(S.node(id));

      /* ---------- the form ---------- */
      const opt = (id, label, sel) => `<option value="${esc(id)}"${id === sel ? " selected" : ""}>${esc(label)}</option>`;
      const byCat = new Map(Object.keys(S.data.cats).map((k) => [k, []]));
      for (const x of C.lines()) byCat.get(x.cat)?.push(x);
      const lineSel = `<select class="select" id="cr-line">${[...byCat].filter(([, ls]) => ls.length).map(([k, ls]) => `<optgroup label="${esc(S.data.cats[k])}">${ls.slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => opt(x.id, x.name, lineId)).join("")}</optgroup>`).join("")}</select>`;
      /* the items, best day first once the prices are in (alphabetical before) */
      const about = (r) => (!r ? "" : !r.options ? " (not priced here)" : r.profit > 0 ? ` (about ${silver(r.profit)} a day)` : " (nothing pays now)");
      const listed = ranked ? ranked.map((r) => r.node) : items.slice().sort((a, b) => S.short(a).localeCompare(S.short(b)));
      const priced = listed.filter((n) => !ranked || byId.get(n.id).options), unpriced = listed.filter((n) => ranked && !byId.get(n.id).options);
      const itemSel = `<select class="select" id="cr-item">${opt("", !ranked ? `The best mix: the top ${C.MIX} items` : mix.length ? `The best mix: ${mix.map(itemName).join(", ")}` : "The best mix (nothing pays now)", itemId)}${priced.length ? `<optgroup label="One item">${priced.map((n) => opt(n.id, S.short(n) + about(byId.get(n.id)), itemId)).join("")}</optgroup>` : ""}${unpriced.length ? `<optgroup label="Not priced here">${unpriced.map((n) => opt(n.id, S.short(n) + about(byId.get(n.id)), itemId)).join("")}</optgroup>` : ""}</select>`;
      const tierHint = lv > 0 ? `Your ${esc(L.name)} level (${int(lv)}) crafts up to T${canCraft}.` : `<a href="#/costmax/${esc(lineId)}">Enter your levels in Cost to Max</a> to see what you can craft.`;
      const moneyNote = !ranked ? `Show me the money picks the single ${esc(L.name)} item that earns the most a day, once the prices load.`
        : best ? `Show me the money plans the single ${esc(L.name)} item that earns the most a day: right now <b>${esc(best.name)}</b>, about ${silver(best.profit)}.`
          : `No ${esc(L.name)} item pays at today's prices with these settings, so there's no money to show.`;
      const form = `
        <section class="card cm-form-card"><form class="cm-form" id="cr-form">
          <div class="cr-row">
            <label class="field"><span>Crafting line</span>${lineSel}</label>
            <label class="field"><span>What to craft</span>${itemSel}</label>
            <button class="btn primary cr-money" type="button" data-money ${ranked ? "" : "disabled"}>${icon("coin")}Show me the money</button>
          </div>
          <p class="small muted cr-money-note">${moneyNote}</p>
          <div class="cr-row cr-row2">
            <div class="field"><span>Highest tier to craft</span>${ui.seg("cr-top", C.TIERS.map((t) => [t, `T${t}`]), cr.top, "Highest tier to craft")}<span class="hint">${tierHint}</span></div>
            <label class="field"><span>Materials a day (silver)</span><input class="input num" type="number" min="0" step="1000000" inputmode="numeric" data-k="budget" value="${cr.budget}"><span class="hint">The most to spend on materials in a day</span></label>
            <label class="field"><span>Station fee</span><input class="input num" type="number" min="0" max="${S.MAX_FEE}" step="10" data-k="fee" value="${cr.fee}"><span class="hint">Silver per 100 nutrition; 0 on your own island</span></label>
          </div>
          <div class="cm-row cm-opts cr-opts">
            <div class="cm-checks">
              <label class="check"><input type="checkbox" data-k="focus" ${useFocus ? "checked" : ""} ${premium ? "" : "disabled"}> Use focus (${int(focusDay)} a day)</label>
              <label class="check"><input type="checkbox" data-k="royal" ${royal ? "checked" : ""}> Royal cities only (no red zones or mists)</label>
              <label class="check"><input type="checkbox" data-k="noCap" ${cr.noCap ? "checked" : ""}> Remove the safe daily sell limit</label>
            </div>
            <span class="small muted cm-prem">${premium ? "Premium on (4% sales tax)" : "Premium off (8% tax, and focus doesn't refill)"} · <a href="#/settings">Settings</a></span>
          </div>
        </form></section>`;

      if (!B) {
        const msg = fail
          ? `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">Prices for ${esc(L.name)} didn't load</div><div class="small">${esc(fail.message || "Loading failed.")}</div><div class="row" style="margin-top:8px"><button class="btn" type="button" data-cr-retry>${icon("refresh")}Try again</button></div></div></div>`
          : `<div class="grid" aria-busy="true"><div class="card span-12"><div class="small muted">Loading prices and four weeks of sales for every ${esc(L.name)} item and its materials…</div>${ui.skel(70)}</div>${[8, 4, 12].map((s) => `<div class="card span-${s}">${ui.skel(220)}</div>`).join("")}</div>`;
        root.innerHTML = `${kit.head(H)}${kit.modeBanner(M)}${form}${msg}`;
        root.querySelector("[data-cr-retry]")?.addEventListener("click", () => { ck.retry(lineId); again(); });
        return wire();
      }

      /* ---------- the plan ---------- */
      const chosen = itemId ? [itemId] : mix;
      /* nothing in the line pays: every item at once, which plans nothing either, so the page can say why */
      const p = C.plan(B, { ...base, items: chosen.length ? chosen : items.map((n) => n.id), seed: 7, draws: DRAWS });
      const c = S.confidence(B, p);
      const one = itemId ? byId.get(itemId) : null;
      const what = itemId ? itemName(itemId) : `the best mix`;

      /* what the prices on screen can't cover */
      const gaps = [];
      if (p.missing.length) {
        const n1 = p.missing.length === 1;
        gaps.push(`${int(p.missing.length)} material${n1 ? "" : "s"} ${M.live ? (n1 ? "has no recent listings or sales" : "have no recent listings or sales") : n1 ? "isn't in the saved snapshot" : "aren't in the saved snapshot"} (${esc(p.missing.slice(0, 3).map((id) => cat.label(id)).join(", "))}${p.missing.length > 3 ? "…" : ""}), so the items made from ${n1 ? "it" : "them"} are left out.`);
      }
      if (!itemId && unpriced.length) gaps.push(`${esc(unpriced.map((n) => S.short(n)).join(", "))} can't be priced ${M.live ? "right now" : "from the snapshot (artifacts and special materials aren't in it)"}, so the mix leaves ${unpriced.length === 1 ? "it" : "them"} out.`);
      const gapBanner = gaps.length ? `<div class="banner info">${icon("info")}<div class="b-body"><div class="b-title">${M.live ? "Some prices are missing" : "Some of this needs live prices"}</div><div class="small">${gaps.join(" ")}</div></div></div>` : "";
      /* v1's warning for the sell limit switched off */
      const capBanner = cr.noCap ? `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">The safe daily sell limit is off</div><div class="small">Each item can now sell up to a whole normal day's sales in each market, not the quarter that keeps the price steady. Selling that much will push prices down, so treat these profits as the best case and watch the price after each batch.</div></div></div>` : "";

      if (!p.rows.length) {
        const why = !p.options
          ? `${itemId ? `No ${esc(what)} tier` : `None of the ${esc(L.name)} items`} can be priced ${M.live ? "right now. Try again after the next price reload." : "from the saved snapshot (its artifacts and special materials aren't in it). With live prices on your own device, this plan works."}`
          : `${itemId ? `${esc(what)} doesn't pay right now: none of its` : `No ${esc(L.name)} item pays right now: none of their`} ${int(p.options)} tiers and enchantments up to T${p.top} makes a profit after fees, with or without focus, at a volume the markets can take.${royal ? " Try turning off Royal cities only," : " Try"} a higher tier, ${itemId ? "another item, " : ""}or another line.`;
        root.innerHTML = `${kit.head(H)}${kit.modeBanner(M)}${form}${capBanner}${gapBanner}<div class="card">${ui.empty(why, "alert")}</div>`;
        return wire();
      }

      /* ---------- KPIs ---------- */
      const signed = (v) => (v < 0 ? `−${silver(-v)}` : silver(v));
      const fillsFirst = p.spent < p.budget * 0.9;
      const kpis = [
        ui.kpi({ label: `${icon("coin")} Profit a day`, value: esc(signed(p.profit)), range: p.range ? `80% range: ${esc(signed(p.range.p10))} to ${esc(signed(p.range.p90))}` : "", title: "At today's typical prices; the range comes from the calibrated price ranges" }),
        ui.kpi({ label: `${icon("scale")} Materials a day`, value: esc(silver(p.spent)), range: fillsFirst ? `of ${esc(silver(p.budget))}: the markets fill up first` : `of your ${esc(silver(p.budget))}` }),
        ui.kpi({ label: `${icon("hammer")} Crafts a day`, value: int(p.crafts), range: `${p.focusCrafts ? `${int(p.focusCrafts)} with focus · ` : ""}${esc(silver(p.fame))} fame` }),
        ui.kpi({ label: `${icon("shield")} Confidence`, value: `${c.score} <small class="k-tier">${esc(c.tier.label)}</small>`, range: "how far to trust the profit" }),
      ].join("");

      /* ---------- the day's crafts ---------- */
      const sellText = (it) => it.sold.map((x) => `<span class="cm-nw">${esc(x.city)} ${int(x.n)}</span>`).join(" · ");
      const craftCell = (id, sub, sell) => `<td>${ui.item(id, { sub })}${sell ? `<div class="cm-sell-sm">Sell: ${sell}</div>` : ""}</td>`;
      const dayRows = p.dayItems.map((it) => `<tr>${craftCell(it.id, esc(it.op.city ? `Bonus city: ${it.op.city}` : "No bonus city"), sellText(it))}<td class="r num">${int(it.n)}</td><td class="r num cm-wide">${it.nF ? int(it.nF) : "—"}</td><td class="cm-sell cm-wide">${sellText(it)}</td><td class="r num cm-wide">${silver(it.profit / it.n)}</td><td class="r num">${silver(it.profit)}</td></tr>`).join("");
      const dayTable = `<div class="table-wrap"><table class="t cm-steps"><thead><tr><th scope="col">Craft</th><th class="r" scope="col">Crafts</th><th class="r cm-wide" scope="col">With focus</th><th class="cm-wide" scope="col">Sell</th><th class="r cm-wide" scope="col">Profit each</th><th class="r" scope="col">Profit</th></tr></thead><tbody>${dayRows}<tr class="cr-total"><td><b>The day</b></td><td class="r num"><b>${int(p.crafts)}</b></td><td class="r num cm-wide">${p.focusCrafts ? int(p.focusCrafts) : "—"}</td><td class="cm-wide"></td><td class="cm-wide"></td><td class="r num"><b>${esc(signed(p.profit))}</b></td></tr></tbody></table></div>`;
      const places = [...new Set(p.dayItems.map((it) => it.op.city).filter(Boolean))];
      const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : a[0] || "");
      const specOf = new Map(items.flatMap((n) => S.familyIds(n.fam, C.TIERS).map((id) => [id, n])));
      const pickNames = [...new Set(p.dayItems.map((it) => S.short(specOf.get(it.id))))];
      const pickTitle = `The pick: ${itemId ? what : and(pickNames.slice(0, 3))}`;
      const daySub = `Craft ${places.length ? `in ${esc(and(places))}, the bonus ${places.length > 1 ? "cities" : "city"}` : "in any royal city"}, and sell where the table says. ${itemId ? `Every ${esc(what)} tier and enchantment up to T${p.top} was priced; these paid best.` : `The mix plans the top ${C.MIX} items in ${esc(L.name)} together${mix.length ? ` (${esc(mix.map(itemName).join(", "))})` : ""}, at every tier up to T${p.top}.`} At most ${C.MAX_ITEMS} different items a day, so the loop stays doable.`;
      const focusOnly = p.focusOnly.length ? `<p class="small cr-after"><b>Never craft T${p.focusOnly.join(", T")} ${esc(itemId ? what : `${L.name} items`)} without focus:</b> at today's prices none of ${p.focusOnly.length > 1 ? "those tiers" : "that tier"} pays without it.</p>` : "";
      const fillNote = fillsFirst ? `<p class="small muted cr-after">The markets' safe daily amounts fill up before the materials budget does, so more silver adds nothing here.${cr.noCap ? "" : " Removing the safe daily sell limit sells more, at the price's risk."}</p>` : "";

      /* ---------- every craft ranked (v1's table) ---------- */
      const rk = p.ranked.slice(0, RANKED_ROWS);
      const money = (v) => `<span class="${v > 0 ? "up" : "down"}">${esc(signed(v))}</span>`;
      const weeksText = (x) => (x.weeksSeen ? `${x.weeksUp} of ${x.weeksSeen}` : "—");
      const rankRows = rk.map((x) => `<tr><td>${ui.item(x.id, { sub: esc(`Sells in ${x.city} for about ${silver(x.price)}`) })}<div class="cm-sell-sm">Up to ${int(x.cap)} a day${x.weeksSeen ? ` · paid ${weeksText(x)} weeks` : ""}</div></td><td class="r num">${money(x.profitNo)}</td><td class="r num">${x.fc > 0 ? money(x.profitF) : "—"}</td><td class="r num cm-wide">${x.perFocus == null ? "—" : x.profitF > 0 ? x.perFocus.toFixed(1) : "—"}</td><td class="r num cm-wide">${int(x.cap)}</td><td class="r num cm-wide">${weeksText(x)}</td></tr>`).join("");
      const rankTable = `<div class="table-wrap"><table class="t cm-steps cr-rank"><thead><tr><th scope="col">Craft</th><th class="r" scope="col">Profit each</th><th class="r" scope="col">With focus</th><th class="r cm-wide" scope="col">Silver per focus</th><th class="r cm-wide" scope="col">Safe a day</th><th class="r cm-wide" scope="col">Weeks in profit</th></tr></thead><tbody>${rankRows}</tbody></table></div><p class="small muted cr-after">${int(p.ranked.length)} tiers and enchantments sell at least one a day somewhere${p.ranked.length > RANKED_ROWS ? `; the top ${RANKED_ROWS} are shown` : ""}. Profit each is after materials (less what comes back), the station fee and market fees. "Weeks in profit" counts the last four weeks in which the craft paid without focus, at that week's average prices.</p>`;

      /* ---------- the price sheet (v1) ---------- */
      const wk = (w) => (w ? `${int(w.lo)} to ${int(w.hi)}` : "—");
      /* on a phone the weekly range, the focus break-even and the amount fold under the item */
      const sellRows = p.sheet.sells.map((x) => `<tr><td>${ui.item(x.id, { sub: esc(x.bm ? "Black Market" : x.city) })}<div class="cm-sm">Weekly ${wk(x.weeks)}${x.evenF != null ? ` · with focus ${int(x.evenF)}` : ""}</div></td><td class="r num">${int(x.price)}</td><td class="r num cm-wide">${wk(x.weeks)}</td><td class="r num"><span class="${x.price < x.even ? "down" : ""}">${int(x.even)}</span></td><td class="r num cm-wide">${x.evenF != null ? int(x.evenF) : "—"}</td></tr>`).join("");
      const buyRows = p.sheet.buys.map((x) => `<tr><td>${ui.item(x.id, { sub: esc(x.city) })}<div class="cm-sm">${int(x.qty)} a day · weekly ${wk(x.weeks)}</div></td><td class="r num cm-wide">${int(x.qty)}</td><td class="r num">${int(x.price)}</td><td class="r num cm-wide">${wk(x.weeks)}</td><td class="r num"><span class="${x.price > x.max ? "down" : ""}">${int(Math.max(0, x.max))}</span></td></tr>`).join("");
      const sheet = `<p class="small cr-sheet-intro">Use today's typical price as your target and the limits as hard stops: never sell below break-even, never pay more than the max.</p>
        <div class="table-wrap"><table class="t cm-fold"><thead><tr><th scope="col">Sell</th><th class="r" scope="col">Typical</th><th class="r cm-wide" scope="col">Weekly low to high</th><th class="r" scope="col">Break-even</th><th class="r cm-wide" scope="col">With focus</th></tr></thead><tbody>${sellRows}</tbody></table></div>
        <div class="table-wrap" style="margin-top:12px"><table class="t cm-fold"><thead><tr><th scope="col">Buy</th><th class="r cm-wide" scope="col">A day</th><th class="r" scope="col">Typical</th><th class="r cm-wide" scope="col">Weekly low to high</th><th class="r" scope="col">Max to pay</th></tr></thead><tbody>${buyRows}</tbody></table></div>
        <p class="small muted cr-after">Break-even is the sale price where a craft stops paying after market fees: with bought materials and no focus, and with focus. Max to pay is where the cheapest craft that uses the material stops paying without focus. "Weekly" is the range of the last four weeks' average prices. Place buy orders a little under the typical price and sell orders near it.</p>`;

      /* ---------- how sure ---------- */
      const fl = conf.factorList(c.f, {
        fresh: M.live ? "How recent the listings behind today's prices are." : "The snapshot's prices are days old.",
        liquidity: "How much the markets the plan sells into trade a day, weighted by the silver sold there.",
        history: "Days of sales behind each price the plan uses.",
        agree: "Whether today's listings match recent sales.",
        evidence: "No backtest covers a day of crafting, so this stays at the app's neutral 40.",
      });
      const weak = fl.filter((f) => f.value < 0.6).sort((a, b) => a.value - b.value).slice(0, 2).map((f) => ({ fresh: "the prices are old", liquidity: "some of the markets are thin", history: "some prices have little sales history", agree: "some listings don't match recent sales", evidence: "plans like this aren't backtested" }[f.key]));
      const worst = Math.min(...p.weeks.map((w) => w.profit));
      const verdict = `<b>${esc(c.tier.label)} confidence.</b> ${weak.length ? `The profit is less certain because ${weak.join(" and ")}.` : "The prices it rests on look solid."} The 80% range covers a day's price swings; the same day ${worst < 0 ? `lost ${silver(-worst)}` : `made ${silver(worst)}`} in its worst of the last four weeks.`;

      /* ---------- assumptions ---------- */
      const notes = [
        `Prices are each market's typical price: the median sale of the last 7 days (the listing where sales are thin). Materials are bought in the cheapest ${royal ? "royal city (Royal cities only is on)" : "royal city, Caerleon or Brecilien"}; each item is crafted in its bonus city, where ${pct(cat.RETURN.craftBonus.none, 1)} of the materials come back (${pct(cat.RETURN.craftBonus.focus, 1)} with focus).`,
        `${cr.noCap ? "The safe daily sell limit is off, so the plan sells up to a whole day of each market's sales, which will push prices down." : "The plan sells at most a quarter of what each market sells a day, so it adds to a market instead of flooding it."} ${royal ? "It sells in the royal cities only." : "It sells in any city or the Black Market."}`,
        `The day (v1's rules): ${useFocus ? `focus (${int(focusDay)} a day) goes first, to the crafts it adds the most silver per point to; then` : ""} the materials budget goes to the crafts without focus that return the most per silver. At most ${C.MAX_ITEMS} different items, the ones that earn the most${useFocus ? ", and focus only when it beats the same day without it" : ""}. A craft must clear ${pct(C.MIN_MARGIN)} of its price, so the plan doesn't lean on margins inside the noise.`,
        `${useFocus ? `Focus costs fall with your Destiny Board levels in ${esc(L.name)}${lv || items.some((n) => levels[n.id]) ? "" : " (all 0 for now)"}; set them in <a href="#/costmax/${esc(itemId || lineId)}">Cost to Max</a>.` : premium ? "Focus is off." : "Focus is off: without premium it doesn't refill."}`,
        `How sure: the 80% range comes from ${int(DRAWS)} price outcomes drawn from each price's calibrated range (materials at the data's age, sales a day later). The weekly chart prices the same crafts at each of the last four weeks' average prices; a price without sales that week stays at today's.`,
        `Show me the money plans each item in the line on its own, with these settings, and picks the one whose day earns the most. The best mix plans the top ${C.MIX} together, which can earn more: they share the budget and the focus but sell into different markets.`,
        `The daily loop: the day as one ride, city by city, on your pack mount. Mounts carry their Excellent-quality load (albiononlinegrind's table, matching the ratios in Albion's spells.json) without your own gear and bag, so keep about 10% spare. The loop refines a material itself, without focus in its refining bonus city, when that saves more than ${pct(AB.loop.REFINE_MIN)}. Expand this loop adds crafts beyond your materials budget.`,
        "Not counted: your time, travel and its risk, crafting tax beyond the station fee, item quality (crafts are priced as normal quality; better ones sell for more), and prices moving while you sell.",
      ];
      const missingNodes = C.lines().length < S.lines().length || S.lines().some((x) => S.specsOf(x.id).some((n) => !S.craftable(n)));
      if (missingNodes) notes.push(`Not in the lists: ${esc(S.lines().flatMap((x) => [x, ...S.specsOf(x.id)]).filter((n) => !S.craftable(n)).map((n) => (n.kind === "line" ? n.name : S.short(n))).join(", "))}. The app's item data has no recipes for their items yet.`);

      const backToMix = itemId ? `<a href="#/crafting/${esc(lineId)}">Back to the best mix</a>` : "";
      root.innerHTML = `
        ${kit.head(H)}
        ${kit.modeBanner(M)}
        ${form}
        ${capBanner}
        ${gapBanner}
        <section class="card" style="margin-bottom:16px"><div class="kpis">${kpis}</div></section>
        <div class="grid">
          ${ui.card({ span: 8, id: "cr-day", title: pickTitle, sub: daySub, body: dayTable + focusOnly + fillNote, foot: backToMix })}
          ${ui.card({ span: 4, title: "How sure is this?", body: `<div class="verdict">${kit.gauge(c.score)}<div class="verdict-text">${verdict}</div></div>${ui.factors(fl)}`, foot: `<a href="#/trust">How the score and the ranges are built</a>` })}
          ${ui.chartCard({ id: "cr-items", span: 4, title: `Every item in ${L.name}`, sub: "Each one's day on its own, with these settings: typical prices (dot) and the 80% range (bar). Tap one to plan it.", height: 60 + 30 * (priced.length + 1) })}
          ${ui.chartCard({ id: "cr-heat", span: 4, title: itemId ? `Profit each, every ${what} tier` : "Profit each, every tier and enchantment", sub: `Without focus, in each craft's best market${itemId ? "" : ", the best item in the plan"}. Blue pays; red loses silver.`, height: 230 })}
          ${ui.chartCard({ id: "cr-weeks", span: 4, title: "The same day, the last four weeks", sub: "The day's crafts at each past week's average prices, and at today's.", height: 230 })}
          ${ui.card({ span: 12, title: itemId ? `Every ${what} tier ranked` : "Every craft ranked", sub: `By what each could add to a day in its best market: profit each times the safe daily amount, or with focus, times what your focus covers, whichever is larger.`, body: rankTable })}
          ${ui.card({ span: 12, id: "cm-loop", title: "The daily loop", sub: "The day as one ride, city by city, sized to your pack mount: where to buy, refine, craft, sell and bank, in order. Do the stops in this order every day.", body: `<div id="cm-loop-body"></div>` })}
          ${ui.card({ span: 12, title: "Price sheet", body: sheet })}
          ${ui.card({ span: 12, title: "What this assumes", body: `<ul class="know">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>` })}
        </div>`;

      /* profit each by tier and enchantment, the best item of the plan in each cell */
      const tiers = [...new Set(p.ranked.map((x) => x.op.tier))].sort((a, b) => a - b);
      const cell = tiers.map((t) => [0, 1, 2, 3, 4].map((e) => p.ranked.filter((x) => x.op.tier === t && x.op.ench === e).sort((a, b) => b.profitNo - a.profitNo)[0] || null));
      ui.plot("cr-heat", "heat", {
        rows: tiers.map((t) => `T${t}`), cols: [".0", ".1", ".2", ".3", ".4"], scale: "div", gamma: 0.5,
        values: cell.map((row) => row.map((x) => (x ? x.profitNo : null))),
        fmt: (v) => silver(v, { digits: Math.abs(v) < 10 ? 1 : 0 }), valueName: "Profit each, no focus",
        note: (i, j) => { const x = cell[i][j]; if (!x) return "Not priced, or no market takes one a day."; return `${cat.label(x.id)}: ${signed(x.profitNo)} each in ${x.city}${x.fc > 0 ? `, ${signed(x.profitF)} with focus` : ""}; up to ${int(x.cap)} a day.`; },
      }, { table: { cols: ["Craft", "Best market", { label: "Profit each", r: true }, { label: "With focus", r: true }, { label: "Safe a day", r: true }], rows: cell.flat().filter(Boolean).map((x) => [cat.label(x.id), x.city, signed(x.profitNo), x.fc > 0 ? signed(x.profitF) : "—", int(x.cap)]) } });

      /* the day at each of the last four weeks' average prices, oldest first, then today's */
      const weeks = p.weeks.slice().reverse();
      const wkName = (w) => (w === 0 ? "Last 7 days" : `${7 * w + 1}–${7 * w + 7} days ago`);
      const wkShort = (w) => (w === 0 ? "1–7 d" : `${7 * w + 1}–${7 * w + 7} d`);
      ui.plot("cr-weeks", "bars", {
        height: 230, categories: [...weeks.map((w) => wkShort(w.w)), "Today"], label: "The day's profit by week",
        series: [{ name: "Profit a day", color: "s1", values: [...weeks.map((w) => w.profit), p.profit] }],
        colors: [...weeks.map(() => "s1"), "s2"],
        fmt: (v) => silver(v), labelFmt: signed, tipFmt: signed, valueLabels: true,
        notes: [...weeks.map((w) => `${wkName(w.w)}: ${pct(w.own)} of the prices from that week's own sales; the rest at today's.`), "At today's typical prices."],
      }, {
        legend: [{ name: "A past week's average prices", color: "s1" }, { name: "Today's typical prices", color: "s2" }],
        table: { cols: ["Prices of", { label: "Profit a day", r: true }, { label: "From that week's sales", r: true }], rows: [...weeks.map((w) => [wkName(w.w), signed(w.profit), pct(w.own)]), ["Today", signed(p.profit), "—"]] },
      });

      drawLoop();

      /* ---------- after the first paint: every item with its range, and the mix ---------- */
      const rangeKey = memoKey + "|" + mix.join(",");
      const drawItems = (rows) => {
        const ok = rows.filter((r) => r.options);
        const skipped = rows.filter((r) => !r.options).map((r) => r.name);
        const sub = root.querySelector("#cr-items .sub");
        if (sub) sub.textContent = `Each one's day on its own, with these settings: typical prices (dot) and the 80% range (bar). Tap one to plan it.${skipped.length ? ` Not priced here: ${skipped.join(", ")}.` : ""}`;
        const cur = itemId || lineId;
        ui.plot("cr-items", "forest", {
          rows: ok.map((r) => ({ id: r.id, label: r.name, lo: r.range ? r.range.p10 : r.profit, mid: r.profit, hi: r.range ? r.range.p90 : r.profit, tier: r.tier, sub: [r.id === lineId ? `${mix.map(itemName).join(", ")} together: ${int(r.crafts)} crafts a day.` : r.profit > 0 ? `${int(r.crafts)} crafts a day.` : "Nothing pays now.", r.id === best?.id ? "Show me the money's pick." : "", r.id === cur ? "On screen now." : ""].filter(Boolean).join(" ") })),
          fmt: (v) => silver(v), labelFmt: signed, tipFmt: signed, rangeFmt: (lo, hi) => `${signed(lo)} to ${signed(hi)}`, midName: "At typical prices",
          onClick: (r) => { if (r.id !== cur) location.hash = `#/crafting/${r.id}`; },
          empty: "None of this line's items can be priced here.",
        }, { table: { cols: ["Item", { label: "Profit a day", r: true }, { label: "10%", r: true }, { label: "90%", r: true }, { label: "Crafts", r: true }], rows: ok.map((r) => [r.name, signed(r.profit), r.range ? signed(r.range.p10) : "—", r.range ? signed(r.range.p90) : "—", int(r.crafts)]) } });
      };
      (async () => {
        if (rangeMemo?.key !== rangeKey) {
          const rows = [];
          /* the mix first, then each item, best day first */
          const all = [{ id: lineId, name: "The best mix", ids: mix }, ...ranked.map((r) => ({ id: r.id, name: r.name, ids: [r.id], r }))];
          for (const x of all) {
            await sleep(0);
            if (!alive) return;
            if (x.id === lineId && !mix.length) continue;
            const q = x.id === (itemId || lineId) ? p : x.r && !x.r.options ? x.r.plan : C.plan(B, { ...base, items: x.ids, seed: 7, draws: ITEM_DRAWS });
            rows.push({ id: x.id, name: x.name, profit: q.profit, range: q.range, crafts: q.crafts, options: q.options, tier: q.rows.length ? S.confidence(B, q).tier.key : "vlow" });
          }
          rangeMemo = { key: rangeKey, rows };
        }
        drawItems(rangeMemo.rows);
      })();

      /* Show me the money landed here: show the plan and what it earns */
      if (moneyAsk && moneyAsk === itemId) {
        moneyAsk = null;
        requestAnimationFrame(() => showMoney(one));
      }

      return wire();

      /* ---------- the daily loop (v1's crafting loop, engine/loop.js) ----------
         Drawn on its own, so the mount, the Mammoth and Expand change without planning the day again. */
      function drawLoop() {
        const box = root.querySelector("#cm-loop-body");
        if (!box) return;
        const now = store.get("crafting"), { mount, auto, use, other } = ck.mounts(now);
        const R = C.loop(B, p, { mount: use.kg, mammoth: auto, expand: !!now.expand, other: other.kg });
        const ctrl = ck.loopCtrl({ mount, auto });
        if (!R) { box.innerHTML = `${ctrl}${ui.empty("Nothing to craft with these prices, so there's no loop.", "info")}`; return; }
        const intro = `A day of ${itemId ? esc(what) : "the best mix"}: ${int(R.loop.crafts)} crafts.`;
        box.innerHTML = ctrl + ck.loopHTML(R, {
          use, other, auto, intro, words: { make: "craft", Make: "Craft", made: "crafts", one: "craft" }, isRef: false, noCap: cr.noCap,
          who: "the plan", scope: "this plan", heavy: "Split that leg into two trips, or lower the materials budget so each day makes less.", every: false,
        });
      }

      /* Show me the money: scroll to the day's crafts and say what the pick earns */
      function showMoney(r) {
        if (!alive || !r) return;
        root.querySelector("#cr-day")?.scrollIntoView({ block: "start", behavior: "smooth" });
        toast(`Show me the money: ${r.name}, about ${silver(r.profit)} a day, the most of any ${L.name} item.`, 5000);
      }

      /* ---------- the form's controls ---------- */
      function wire() {
        const f = root.querySelector("#cr-form");
        f.addEventListener("submit", (e) => e.preventDefault());
        const set = (patch) => store.set("crafting", { ...store.get("crafting"), ...patch });
        /* another line opens on its best mix; an item opens its own plan */
        f.querySelector("#cr-line").addEventListener("change", (e) => { location.hash = `#/crafting/${e.target.value}`; });
        f.querySelector("#cr-item").addEventListener("change", (e) => { location.hash = `#/crafting/${e.target.value || lineId}`; });
        f.querySelector("[data-money]").addEventListener("click", () => {
          if (!ranked) return;
          if (!best) { toast(`No ${L.name} item pays at today's prices with these settings, so there's no money to show.`, 5000); return; }
          if (best.id === itemId) { showMoney(best); return; }
          moneyAsk = best.id;
          location.hash = `#/crafting/${best.id}`;
        });
        ui.onSeg(f, "cr-top", (v) => set({ top: +v }));
        /* numbers commit on change (blur, Enter, the arrows), so a redraw never takes a field you're typing in */
        f.addEventListener("change", (e) => {
          const el = e.target, k = el.dataset.k;
          if (k === "focus" || k === "noCap") set({ [k]: el.checked });
          else if (k === "royal") store.set("safeOnly", el.checked);
          else if (k === "budget" || k === "fee") {
            const v = +el.value, max = k === "fee" ? S.MAX_FEE : 1e12;
            if (!(v >= 0 && v <= max) || el.value === "") { el.value = cr[k]; return; }
            set({ [k]: v });
          }
        });
        /* the daily loop: the mount, the Mammoth and Expand redraw only the loop */
        const card = root.querySelector("#cm-loop");
        if (card) ck.wireLoop(card, set);
        let prev = store.get("crafting");
        const off = store.on("change", (k) => {
          if (k === "specLevels" || k === "safeOnly") return again();
          if (k !== "crafting") return;
          const now = store.get("crafting"), plan = PLAN_KEYS.some((x) => now[x] !== prev[x]);
          prev = now;
          if (plan) again(); else drawLoop();
        });
        return () => { alive = false; off(); };
      }
    },
  };
})();
