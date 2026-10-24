/* Albion Billionaire v2 — Cost to Max: the cheapest route from the player's Destiny Board levels to level 100 in a
   crafting specialization or crafter mastery, or in a refining line (all five tiers, or one), priced in today's
   markets. The routes and their rules live in engine/spec.js (crafting) and engine/refine.js (refining); this page
   asks for the levels, draws the route, says how far to trust it, and lays each stage out as a daily loop around the
   cities for the player's pack mount (engine/loop.js). */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.costmax = (() => {
  const DEFAULT = "CRAFT_SWORDS_CLAYMORE", DEFAULT_REFINE = "CRAFT_REFINE_ORE";
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
  /* the daily loop's stage on screen, by the node planned (a crafting stage is known by its tier, a refining one by
     its kind and tier) */
  const loopAt = new Map();
  const stageKey = (s) => (s.kind ? `${s.kind[0]}${s.tier}` : String(s.tier));
  /* the settings that change the route (the others only change the daily loop) */
  const ROUTE_KEYS = ["mode", "node", "refine", "days", "focus", "journals", "fee", "lp", "noCap"];
  /* what a line's routes may price: a crafting line's items, or a refining line's refines */
  const needsOf = (lineId) => (AB.refine.has(lineId) ? AB.refine.needs(lineId) : AB.spec.needs(lineId));

  /* the line's model for the prices on screen (or the one before them, of the same kind), loading it if needed */
  function marketFor(lineId, M, onReady) {
    const have = models.get(lineId);
    if (have && have.seq === M.seq) return have.B;
    const fail = failed.get(lineId);
    if (!pending.has(lineId) && !(fail && fail.seq === M.seq)) {
      const seq = M.seq;
      const p = AB.market.extend(needsOf(lineId)).then((B) => {
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
      const { esc, icon, silver, int, pct, sleep } = AB.util;
      const ui = AB.ui, kit = AB.kit, store = AB.store, S = AB.spec, RF = AB.refine, cat = AB.cat, conf = AB.conf;
      const H = {
        eyebrow: "Cost to Max",
        title: "The cheapest road to level 100",
        sub: "Pick a crafting or refining line, enter your levels, and get the cheapest way to max it at today's prices: what to make at each stage, where to sell it, what it costs, and how sure that number is. The fame rules come from Albion's own game files.",
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

      /* ---------- what to plan: a crafting node, or a refining line or node ---------- */
      const cm = store.get("costMax"), levels = store.get("specLevels");
      const validCraft = (id) => (S.node(id) && S.craftable(S.node(id)) ? id : null);
      const validRefine = (id) => (RF.has(id) ? id : null);
      const mode = validRefine(args[0]) ? "refine" : validCraft(args[0]) ? "craft" : cm.mode;
      const isRef = mode === "refine";
      const craftId = validCraft(isRef ? cm.node : args[0]) || validCraft(cm.node) || DEFAULT;
      const refineId = validRefine(isRef ? args[0] : cm.refine) || validRefine(cm.refine) || DEFAULT_REFINE;
      const nodeId = isRef ? refineId : craftId;
      /* the last one planned of each kind opens next time */
      if (mode !== cm.mode || craftId !== cm.node || refineId !== cm.refine) store.set("costMax", { ...cm, mode, node: craftId, refine: refineId });
      const lv = (id) => levels[id] ?? 0;
      const premium = store.get("premium"), focusDay = store.get("focus"), royal = !!store.get("safeOnly");
      const useFocus = premium && cm.focus;
      const lvl = (x) => (x >= 99.95 ? "100" : x % 1 ? x.toFixed(1) : String(x));

      /* crafting: the node, its line and the line's nodes; refining: the line, the node (none: all five tiers) */
      const T = isRef ? null : S.node(nodeId), Lm = isRef ? null : S.lineOf(nodeId), isSpec = !isRef && T.kind === "spec";
      const RL = isRef ? RF.line(nodeId) : null, RT = isRef ? RF.node(nodeId) : null;
      const nodes = isRef ? RL.nodes : [Lm, ...S.specsOf(Lm.id)];
      const lineId = isRef ? RL.id : Lm.id, lineName = isRef ? RL.name : Lm.name;
      const nameOf = (n) => (n.kind === "base" ? n.name : n.kind === "refine" ? `${RF.rank(n)} (T${n.tier})` : S.short(n));
      /* what the route levels: "Claymore", "Elder Ore Smelter", or every node of a refining line */
      const tName = isRef ? (RT ? RT.name : `all five ${RL.name} tiers`) : nameOf(T);
      const goal = isRef && !RT ? `all five ${RL.name} tiers at 100` : `${tName} 100`;
      /* the words for what the route makes */
      const W = isRef ? { make: "refine", Make: "Refine", made: "refines", one: "refine" } : { make: "craft", Make: "Craft", made: "crafts", one: "craft" };
      const targets = isRef ? (RT ? [RT] : RL.nodes) : [T];
      let lpAll = 0;
      for (const n of targets) {
        const from = isRef ? Math.max(1, lv(n.id)) : isSpec ? lv(n.id) : Math.max(1, lv(Lm.id));
        for (let i = Math.min(from, 100); i < 100; i++) lpAll += S.lpOf(n, i);
      }

      /* ---------- the form ---------- */
      const opt = (id, label, sel) => `<option value="${esc(id)}"${id === sel ? " selected" : ""}>${esc(label)}</option>`;
      let lineSel, targetSel;
      if (isRef) {
        lineSel = `<select class="select" id="cm-line">${RF.lines().map((L) => opt(L.id, `${L.name} (${L.refinedName.toLowerCase()})`, RL.id)).join("")}</select>`;
        targetSel = `<select class="select" id="cm-target">${opt(RL.id, "All five tiers (Adept to Elder)", nodeId)}<optgroup label="One tier">${RL.nodes.map((n) => opt(n.id, `${n.name} (T${n.tier})`, nodeId)).join("")}</optgroup></select>`;
      } else {
        const byCat = new Map(Object.keys(S.data.cats).map((k) => [k, []]));
        for (const L of S.lines()) if (S.craftable(L)) byCat.get(L.cat)?.push(L);
        lineSel = `<select class="select" id="cm-line">${[...byCat].map(([k, ls]) => `<optgroup label="${esc(S.data.cats[k])}">${ls.slice().sort((a, b) => a.name.localeCompare(b.name)).map((L) => opt(L.id, L.name, Lm.id)).join("")}</optgroup>`).join("")}</select>`;
        const specs0 = S.specsOf(Lm.id).filter(S.craftable).sort((a, b) => S.short(a).localeCompare(S.short(b)));
        const plain = specs0.filter((s) => !S.special(s)), fancy = specs0.filter((s) => S.special(s));
        targetSel = `<select class="select" id="cm-target">${opt(Lm.id, `${Lm.name} (the mastery)`, T.id)}${plain.length ? `<optgroup label="Specializations">${plain.map((s) => opt(s.id, S.short(s), T.id)).join("")}</optgroup>` : ""}${fancy.length ? `<optgroup label="Artifact and special items">${fancy.map((s) => opt(s.id, S.short(s), T.id)).join("")}</optgroup>` : ""}</select>`;
      }
      const specs = isRef ? [] : S.specsOf(Lm.id).filter(S.craftable).sort((a, b) => S.short(a).localeCompare(S.short(b)));
      const levelInputs = nodes.map((n) => `<label class="field"><span>${esc(nameOf(n))}</span><input class="input num" type="number" min="0" max="100" step="1" inputmode="numeric" data-node="${esc(n.id)}" value="${lv(n.id)}"></label>`).join("");
      const form = `
        <section class="card cm-form-card"><form class="cm-form" id="cm-form">
          <div class="cm-mode">${ui.seg("cm-mode", [["craft", "Crafting"], ["refine", "Refining"]], mode, "What to max")}</div>
          <div class="cm-row">
            <label class="field"><span>${isRef ? "Refining line" : "Crafting line"}</span>${lineSel}</label>
            <label class="field"><span>Level to 100</span>${targetSel}</label>
            <div class="field"><span>Time to take</span>${ui.seg("pace", S.PACES.map((d) => [d, PACE_SHORT[d]]), cm.days, "Time to take")}</div>
            <label class="field"><span>Station fee</span><input class="input num" type="number" min="0" max="${S.MAX_FEE}" step="10" data-k="fee" value="${cm.fee}"><span class="hint">Silver per 100 nutrition; 0 on your own island</span></label>
          </div>
          <fieldset class="cm-levels"><legend>Your levels in this line (Destiny Board)</legend><div class="cm-lv-grid">${levelInputs}</div></fieldset>
          <div class="cm-row cm-opts">
            <div class="cm-checks">
              <label class="check"><input type="checkbox" data-k="focus" ${useFocus ? "checked" : ""} ${premium ? "" : "disabled"}> Use focus (${int(focusDay)} a day)</label>
              ${isRef ? "" : `<label class="check"><input type="checkbox" data-k="journals" ${cm.journals ? "checked" : ""}> Fill and sell journals</label>`}
              <label class="check"><input type="checkbox" data-k="royal" ${royal ? "checked" : ""}> Royal cities only (no red zones or mists)</label>
              <label class="check"><input type="checkbox" data-k="noCap" ${cm.noCap ? "checked" : ""}> Remove the safe daily sell limit</label>
            </div>
            <label class="field cm-lp"><span>Learning points to spend</span><input class="input num" type="number" min="0" step="100" data-k="lp" value="${cm.lp}"><span class="hint">Quick Learn: a level then takes a fifth of its fame. ${isRef && !RT ? "All five tiers" : `All of ${esc(tName)}`}: ${int(lpAll)} points.</span></label>
            <span class="small muted cm-prem">${premium ? `Premium on (fame ×1.5, 4% sales tax)` : `Premium off (no fame bonus, 8% tax, and focus doesn't refill)`} · <a href="#/settings">Settings</a></span>
          </div>
        </form></section>`;

      /* ---------- the line's prices ---------- */
      const B = marketFor(lineId, M, again);
      const fail = failed.get(lineId);
      if (!B) {
        const what = isRef ? `every ${RL.refinedName.toLowerCase().replace(/s$/, "")} refine and its ${RL.rawName.toLowerCase()}` : `every ${Lm.name.replace(/ (Crafter|Tailor)$/, "").toLowerCase()} item, its materials and journals`;
        const msg = fail && fail.seq === M.seq
          ? `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">Prices for ${esc(lineName)} didn't load</div><div class="small">${esc(fail.e.message || "Loading failed.")}</div><div class="row" style="margin-top:8px"><button class="btn" type="button" data-cm-retry>${icon("refresh")}Try again</button></div></div></div>`
          : `<div class="grid" aria-busy="true"><div class="card span-12"><div class="small muted">Loading prices and four weeks of sales for ${esc(what)}…</div>${ui.skel(70)}</div>${[8, 4, 6, 6].map((s) => `<div class="card span-${s}">${ui.skel(220)}</div>`).join("")}</div>`;
        root.innerHTML = `${kit.head(H)}${kit.modeBanner(M)}${form}${msg}`;
        root.querySelector("[data-cm-retry]")?.addEventListener("click", () => { failed.delete(lineId); again(); });
        return wire();
      }

      /* ---------- the route ---------- */
      const base = isRef
        ? { node: nodeId, levels, premium, days: cm.days, focusPerDay: useFocus ? focusDay : 0, fee: cm.fee, lp: cm.lp, share: cm.noCap ? 1 : S.SHARE, royal }
        : { node: T.id, levels, premium, days: cm.days, focusPerDay: useFocus ? focusDay : 0, journals: cm.journals, fee: cm.fee, lp: cm.lp, share: cm.noCap ? 1 : S.SHARE, royal };
      const planOf = (o) => (isRef ? RF.plan(B, o) : S.plan(B, o));
      const p = planOf({ ...base, seed: 7, draws: DRAWS });
      const c = S.confidence(B, p);
      const tot = p.totals;
      /* a cost reads as silver spent; a route that pays reads as such, never as a negative cost */
      const costText = (v) => (v < 0 ? `pays ${silver(-v)}` : silver(v));
      const costWord = (v) => (v < 0 ? `pays ${silver(-v)}` : `costs ${silver(v)}`);
      /* a range of costs in words: "pays 68.4M to 146M", "costs 2M to 5M", or "pays 1M to costs 3M" */
      const rangeText = (lo, hi) => (hi < 0 ? `pays ${silver(-hi)} to ${silver(-lo)}` : lo >= 0 ? `costs ${silver(lo)} to ${silver(hi)}` : `${costWord(lo)} to ${costWord(hi)}`);
      /* a refining stage in words: a node's first level (which unlocks its tier) or the rest of its levels */
      const upTo = (s) => `any refine up to T${Math.max(...s.tiers)}`;
      const refStage = (s) => (s.kind === "unlock" ? `<b>${esc(s.node.name)} 0 → 1</b> · unlocks T${s.tier} · ${upTo(s)}` : `<b>${esc(s.node.name)} ${lvl(s.from.t)} → 100</b> · refines T${s.tier}`);
      const unpriced = isRef ? p.steps.filter((s) => s.short > 1) : [];

      /* what the prices on screen can't cover */
      const gaps = [];
      const one = p.missing.length === 1;
      const ofWhat = isRef ? `some ${RL.name} refines` : `some ${tName} items`;
      if (p.missing.length) gaps.push(`${int(p.missing.length)} material${one ? "" : "s"} for ${esc(ofWhat)} ${M.live ? (one ? "has no recent listings or sales" : "have no recent listings or sales") : one ? "isn't in the saved snapshot" : "aren't in the saved snapshot"} (${esc(p.missing.slice(0, 3).map((id) => cat.label(id)).join(", "))}${p.missing.length > 3 ? "…" : ""}), so those ${isRef ? "refines" : "items"} are left out.`);
      if (unpriced.length) {
        const fame = unpriced.reduce((a, s) => a + s.short, 0);
        gaps.push(`Nothing ${M.live ? "has recent prices" : "in the snapshot is priced"} for ${esc(unpriced.map((s) => (s.kind === "unlock" ? `${s.node.name}'s first level` : `${s.node.name}'s levels`)).join(", "))}, so the totals leave out ${silver(fame)} fame${M.live ? "" : ". With live prices in the app, the whole route is priced"}.`);
      }
      if (p.prelude?.missing) gaps.push(`The first ${esc(Lm.name)} level comes from tier-3 crafts, which ${M.live ? "have no prices right now" : "the snapshot doesn't price"}; its ${silver(p.prelude.fame)} fame (a few thousand silver) is left out.`);
      if (!isRef && p.journals.on && !p.journals.priced) gaps.push(`Journals ${M.live ? "have no recent sales for this line" : "aren't in the snapshot"}, so the route earns nothing from them.`);
      const gapBanner = gaps.length ? `<div class="banner info">${icon("info")}<div class="b-body"><div class="b-title">${M.live ? "Some prices are missing" : "Some of this needs live prices"}</div><div class="small">${gaps.join(" ")}</div></div></div>` : "";
      /* v1's warning for the sell limit switched off */
      const capBanner = cm.noCap ? `<div class="banner warn">${icon("alert")}<div class="b-body"><div class="b-title">The safe daily sell limit is off</div><div class="small">Each item can now sell up to a whole normal day's sales in each market, not the quarter that keeps the price steady. Selling that much will push prices down, so treat these numbers as the best case and watch the price after each batch.</div></div></div>` : "";

      if (!p.fame.target || !p.options) {
        const why = !p.fame.target
          ? isRef ? `${esc(RT ? RT.name : `Every ${RL.name} tier`)} ${RT ? "is" : "is"} already at 100. Pick another tier or line above.` : `${esc(tName)} is already at 100. Pick another specialization, or tap one below the levels to plan it.`
          : isRef ? `None of the ${esc(RL.name)} refines can be priced ${M.live ? "right now. Try again after the next price reload." : "from the saved snapshot. With live prices on your own device, this route works."}` : `None of the ${esc(tName)} items can be priced ${M.live ? "right now" : "from the saved snapshot (its artifacts and special materials aren't in it)"}. ${M.live ? "Try again after the next price reload." : "With live prices on your own device, this route works."}`;
        root.innerHTML = `${kit.head(H)}${kit.modeBanner(M)}${form}${capBanner}${gapBanner}<div class="card">${ui.empty(why, p.fame.target ? "alert" : "check")}</div>`;
        return wire();
      }

      /* ---------- KPIs ---------- */
      const crafts = tot.crafts, perDay = crafts / p.days;
      const kpis = [
        ui.kpi({ label: `${icon("coin")} ${tot.net < 0 ? "Leveling pays you" : "Cost to max"}`, value: esc(tot.net < 0 ? silver(-tot.net, { sign: true }) : silver(tot.net)), range: `80% range: ${esc(rangeText(p.range.p10, p.range.p90))}`, title: "At today's typical prices; the range comes from the calibrated price ranges" }),
        ui.kpi({ label: `${icon("star")} Fame to earn`, value: esc(silver(p.fame.target)), range: `${int(crafts)} ${W.made}, about ${int(perDay)} a day` }),
        ui.kpi({ label: `${icon("clock")} ${esc(paceName(p.days))}`, value: tot.kept ? `${int(tot.kept)} unsold` : "All sold", range: tot.kept ? `${W.made} the markets can't take at this pace` : `every ${W.one} sells at this pace` }),
        ui.kpi({ label: `${icon("shield")} Confidence`, value: `${c.score} <small class="k-tier">${esc(c.tier.label)}</small>`, range: "how far to trust the cost" }),
      ].join("");

      /* ---------- the route, step by step ---------- */
      const sellText = (it) => it.sold.map((x) => `<span class="cm-nw">${x.city ? esc(x.city) : "kept unsold"} ${int(x.n)}</span>`).join(" · ");
      const mastery = (s) => (!isSpec ? "" : s.to.m - s.from.m >= 0.05 ? ` · ${esc(Lm.name)} ${lvl(s.from.m)} → ${lvl(s.to.m)}` : ` · ${esc(Lm.name)} ${lvl(s.to.m)}`);
      const cols = isRef ? 5 : 6;
      const stageHead = (s) => (isRef
        ? `<tr class="cm-stage"><th colspan="${cols}" scope="rowgroup">${refStage(s)} · ${silver(s.fame)} fame · ${s.short > 1 && !s.items.length ? "not priced" : esc(costText(s.cost.net))}</th></tr>`
        : `<tr class="cm-stage"><th colspan="6" scope="rowgroup"><b>${esc(tName)} ${lvl(s.from.t)} → ${lvl(s.to.t)}</b>${mastery(s)} · crafts up to T${s.tier} · ${silver(s.fame)} fame · ${esc(costText(s.cost.net))}</th></tr>`);
      /* on a phone the Sell column folds under the item (.cm-sell-sm), so the table fits without scrolling sideways */
      const craftCell = (id, sub, sell) => `<td>${ui.item(id, { sub })}${sell ? `<div class="cm-sell-sm">Sell: ${sell}</div>` : ""}</td>`;
      const itemRow = (it) => (isRef
        ? `<tr>${craftCell(it.id, esc(`Refine in ${RL.city}`), sellText(it))}<td class="r num">${int(it.n)}</td><td class="r num cm-wide">${it.nF ? int(it.nF) : "—"}</td><td class="cm-sell cm-wide">${sellText(it)}</td><td class="r num">${esc(costText(it.net))}</td></tr>`
        : `<tr>${craftCell(it.id, esc(it.op.city ? `Bonus city: ${it.op.city}` : "No bonus city"), sellText(it))}<td class="r num">${int(it.n)}</td><td class="r num cm-wide">${it.nF ? int(it.nF) : "—"}</td><td class="cm-sell cm-wide">${sellText(it)}</td><td class="r num cm-wide">${it.journals >= 0.5 ? int(it.journals) : "—"}</td><td class="r num">${esc(costText(it.net))}</td></tr>`);
      /* a refining stage the prices can't cover, in whole or in part */
      const shortRow = (s) => (s.short > 1 ? `<tr><td colspan="${cols}" class="small muted">${s.items.length ? `${silver(s.short)} fame of this stage` : "This stage"} isn't priced: ${M.live ? "there are no recent prices for" : "the snapshot has no prices for"} ${s.kind === "unlock" ? "the refines it may use" : `T${s.tier} refines or their inputs`}.</td></tr>` : "");
      let preRows = "";
      if (p.prelude) {
        const pr = p.prelude;
        const preSell = pr.op ? sellText({ sold: [...(pr.sold ? [{ city: pr.top.leg.city, n: pr.sold }] : []), ...(pr.n > pr.sold ? [{ city: null, n: pr.n - pr.sold }] : [])] }) : "";
        preRows = `<tr class="cm-stage"><th colspan="6" scope="rowgroup"><b>${esc(Lm.name)} 0 → 1</b> · tier-3 crafts · ${silver(pr.fame)} fame${pr.op ? ` · ${esc(costText(pr.cost))}` : ""}</th></tr>` + (pr.op
          ? `<tr>${craftCell(pr.op.id, "The first level only counts tier 3", preSell)}<td class="r num">${int(pr.n)}</td><td class="r num cm-wide">—</td><td class="cm-sell cm-wide">${preSell}</td><td class="r num cm-wide">—</td><td class="r num">${esc(costText(pr.cost))}</td></tr>`
          : `<tr><td colspan="6" class="small muted">Not priced: no tier-3 ${esc(Lm.name.replace(/ (Crafter|Tailor)$/, "").toLowerCase())} items have prices here.</td></tr>`);
      }
      const routeHead = isRef
        ? `<th scope="col">Refine</th><th class="r" scope="col">Refines</th><th class="r cm-wide" scope="col">With focus</th><th class="cm-wide" scope="col">Sell</th><th class="r" scope="col">Cost</th>`
        : `<th scope="col">Craft</th><th class="r" scope="col">Crafts</th><th class="r cm-wide" scope="col">With focus</th><th class="cm-wide" scope="col">Sell</th><th class="r cm-wide" scope="col">Journals</th><th class="r" scope="col">Cost</th>`;
      const routeTable = `<div class="table-wrap"><table class="t cm-steps"><thead><tr>${routeHead}</tr></thead><tbody>${preRows}${p.steps.map((s) => stageHead(s) + s.items.map(itemRow).join("") + (isRef ? shortRow(s) : "")).join("")}</tbody></table></div>`;

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
      const sellNote = `${cm.noCap ? "The safe daily sell limit is off, so the route sells up to a whole day of each market's sales, which will push prices down." : "The route sells at most a quarter of what each market sells a day, so it adds to a market instead of flooding it."} ${royal ? "It sells in the royal cities only." : isRef ? "It sells in any city." : "It sells in any city or the Black Market."} ${isRef ? "Refines" : "Crafts"} beyond that are kept, counted as worth nothing: selling them below the usual price would make the route cheaper.`;
      const focusNote = (how) => (useFocus ? `Focus: ${int(focusDay)} a day over ${esc(paceName(p.days).toLowerCase())}, spread evenly over the route. ${how}` : premium ? "Focus is off." : "Focus is off: without premium it doesn't refill.");
      const priceNote = `Prices are each market's typical price: the median sale of the last 7 days (the listing where sales are thin).`;
      const jm = RF.journeyman();
      const notes = isRef ? [
        `A refine's fame is its inputs' fame, the same for every resource: two T4 ore (7.5 each) and a T3 bar (7.5) make a T4 bar worth 22.5${premium ? ", and premium adds half again" : ""}. It counts for the node of its tier and, at the same time, for the first level of the next locked node, so maxing Adept unlocks Expert, Master and Grandmaster on the way.`,
        `Each node's first level unlocks refining its tier and takes refines of any tier (${RL.nodes.map((n) => `${RF.rank(n)} ${silver(n.tpl.fame[0] * n.fm)}`).join(", ")} fame); its other levels take its own tier only. The route assumes ${esc(jm.name)} (${int(jm.fame)} fame of tier-2 refining, which opens tier 3) is done.`,
        `${priceNote} Raw ${esc(RL.rawName.toLowerCase())} and the tier-below ${esc(RL.refinedName.toLowerCase())} are bought in the cheapest ${royal ? "royal city (Royal cities only is on)" : "royal city, Caerleon or Brecilien"}; refining happens in ${esc(RL.city)}, the ${esc(RL.refinedName.toLowerCase())} bonus city, where ${pct(cat.RETURN.refineBonus.none, 1)} of the inputs come back (${pct(cat.RETURN.refineBonus.focus, 1)} with focus).`,
        sellNote,
        focusNote(`The route picks its refines with focus in mind and spends it where it saves the most silver per point. Every ${esc(RL.name)} node's levels cut each refine's focus cost, and the refine's own tier's node cuts it most, so focus goes further as the route levels.`),
        cm.lp ? `Learning points: ${int(p.ql.used)} spent with Quick Learn where a point saves the most fame (the top levels${RT ? "" : " of the highest tiers"}), saving ${silver(p.fame.saved)} fame.` : "No learning points spent.",
        `The daily loop: a stage takes the route's days times its share of the fame (focus is spread the same way), so every day earns the same fame. A market takes at most its ${cm.noCap ? "whole day" : "quarter of a day"} of sales; the day's other refines are banked to sell on later days. Mounts carry their Excellent-quality load (albiononlinegrind's table, matching the ratios in Albion's spells.json) without your own gear and bag, so keep about 10% spare.`,
        "Not counted: your time, travel and its risk, and the markets' prices changing while you sell into them.",
      ] : [
        `Fame per craft comes from the resources in its recipe, times the item's artifact factor; artifacts themselves give none. A craft counts for ${esc(Lm.name)} and its specialization alike${premium ? ", and premium adds half again" : ""}.`,
        `${esc(Lm.name)} unlocks a tier at levels 1, 10, 30, 60 and 100 (T4 to T8), so the route stays on lower tiers until the mastery gets there. ${isSpec ? "" : "A mastery never reaches T8 before it's maxed. "}The first mastery level only counts tier-3 crafts.`,
        `${priceNote} Materials are bought in the cheapest ${royal ? "royal city (Royal cities only is on)" : "royal city, Caerleon or Brecilien"}; returns are ${Math.round(cat.RETURN.craftBonus.none * 1000) / 10}% in the item's bonus city (${Math.round(cat.RETURN.craftBonus.focus * 1000) / 10}% with focus).`,
        sellNote,
        focusNote("The route picks its crafts with focus in mind and spends it where it saves the most silver per point, at the levels it has reached by then."),
        cm.journals ? `Journals: a craft fills a journal of its tier with its fame (premium bonus left out); empty ones cost ${silver(S.data.jr.silver[0])} to ${silver(S.data.jr.silver[4])} from the NPC or less on the market, and full ones sell in the city that pays most, up to a quarter of its sales.` : "Journals are left out.",
        cm.lp ? `Learning points: ${int(p.ql.used)} spent with Quick Learn where a point saves the most fame, which is ${esc(tName)}'s top levels${p.ql.from != null ? ` (from level ${p.ql.from})` : ""}, saving ${silver(p.fame.saved)} fame.` : "No learning points spent.",
        `The daily loop: a stage takes the route's days times its share of the fame (focus is spread the same way), so every day earns the same fame. A market takes at most its ${cm.noCap ? "whole day" : "quarter of a day"} of sales; the day's other crafts are banked to sell on later days. Mounts carry their Excellent-quality load (albiononlinegrind's table, matching the ratios in Albion's spells.json) without your own gear and bag, so keep about 10% spare. The loop refines a material itself, without focus in its refining bonus city (${Math.round(cat.RETURN.refineBonus.none * 1000) / 10}% back), when that saves more than ${Math.round(AB.loop.REFINE_MIN * 100)}%.`,
        "Not counted: your time, travel and its risk, crafting tax beyond the station fee, item quality (crafts are priced as normal quality; better ones sell for more), and the Black Market's demand changing while you sell into it.",
        `Not in the lists: ${esc(S.lines().flatMap((L) => [L, ...S.specsOf(L.id)]).filter((n) => !S.craftable(n)).map(nameOf).join(", "))}. The app's item data has no recipes for their items yet.`,
      ];

      /* the comparison chart: every specialization in the crafting line, or every goal in the refining line */
      const others = isRef ? [RL, ...RL.nodes] : [Lm, ...specs];
      const otherName = (n) => (isRef ? (n.kind === "line" ? "All five tiers" : nameOf(n)) : `${nameOf(n)}${n.id === Lm.id ? " (mastery)" : ""}`);
      const curveTitle = isRef ? `Silver spent on the way to ${RT ? `${RT.name} 100` : "max"}` : `Silver spent on the way to ${tName} 100`;
      const axisName = isRef ? (RT ? `${RT.name} level` : `Levels across the five ${RL.name} nodes`) : `${tName} level`;
      root.innerHTML = `
        ${kit.head(H)}
        ${kit.modeBanner(M)}
        ${form}
        ${capBanner}
        ${gapBanner}
        <section class="card" style="margin-bottom:16px"><div class="kpis">${kpis}</div></section>
        <div class="grid">
          ${ui.chartCard({ id: "cm-curve", span: 8, title: curveTitle, sub: isRef ? `Running cost by ${RT ? "level" : "level, over all five nodes (0 to 500)"} at today's typical prices, with the 80% range from ${int(DRAWS)} price outcomes. Below zero, the route has paid you so far.${RT ? "" : " Lines mark where each tier's own levels start."}` : `Running cost by ${esc(tName)} level at today's typical prices, with the 80% range from ${int(DRAWS)} price outcomes. Below zero, the route has paid you so far. Lines mark where ${esc(Lm.name)} unlocks the next tier.`, height: 280 })}
          ${ui.card({ span: 4, title: "How sure is this?", body: `<div class="verdict">${kit.gauge(c.score)}<div class="verdict-text">${verdict}</div></div>${ui.factors(fl)}`, foot: `<a href="#/trust">How the score and the ranges are built</a>` })}
          ${ui.chartCard({ id: "cm-heat", span: 6, title: isRef ? "Silver per fame, every refine" : "Silver per fame, every item it can craft", sub: isRef ? `Each tier and enchantment sold at its best market. Red costs silver for each point of fame; blue pays you. A stage refines only its own tier, so the cheapest cell in each row is what counts.` : `Each tier and enchantment sold at its best market, journals in. Red costs silver for each point of fame; blue pays you.${isSpec ? "" : " Each cell shows the line's cheapest item."}`, height: 230 })}
          ${ui.chartCard({ id: "cm-pace", span: 6, title: "What time buys", sub: `The cheapest route at each pace. A shorter time sells less into each market, so more ${W.made} go unsold or pricier ones take their place. Below zero, the route pays you.`, height: 230 })}
          ${ui.card({ span: 12, title: "The route", sub: isRef ? `What to refine at each stage, from your levels to ${esc(goal)}, and where to sell it. Refine in ${esc(RL.city)}: its refining bonus returns the most.` : `What to craft at each stage, from your levels to ${esc(tName)} 100, and where to sell it. Crafting in the item's bonus city returns more materials.`, body: routeTable })}
          ${ui.card({ span: 12, id: "cm-loop", title: "The daily loop", sub: `A day of each stage as one ride, city by city, sized to your pack mount: where to buy, ${isRef ? "refine" : "refine, craft"}, sell and bank, in order. Do the stops in this order every day of the stage.`, body: `<div id="cm-loop-body"></div>` })}
          ${ui.chartCard({ id: "cm-specs", span: 7, title: isRef ? `Every goal in ${RL.name}` : `Every specialization in ${Lm.name}`, sub: "Cost to 100 from your levels with the same settings: at typical prices (dot) and the 80% range (bar). Tap one to plan it.", height: 60 + 30 * others.length })}
          ${ui.chartCard({ id: "cm-flow", span: 5, title: "Where the silver goes", sub: `Spent and earned over the whole route: ${esc(costText(tot.net))} net.`, height: 230 })}
          ${ui.card({ span: 12, title: "What this assumes", body: `<ul class="know">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>` })}
        </div>`;

      /* the running cost by level, with tier unlocks (or where each refining tier starts) and the Quick Learn mark */
      const vl = isRef ? p.marks.map((m) => ({ x: m.at, label: m.label })) : p.unlocks.map((u) => ({ x: u.at, label: `T${u.tier}` }));
      if (!isRef && p.ql.from != null && p.ql.from > p.curve[0].level) vl.push({ x: p.ql.from, label: "Quick Learn" });
      const xMax = isRef ? p.top : 100, every = xMax > 100 ? 25 : 5;
      const atLevel = (v) => (isRef && !RT ? `${Math.round(v)} of ${xMax} levels` : `${isRef ? RT.name : tName} level ${Math.round(v)}`);
      ui.plot("cm-curve", "line", {
        height: 280, label: `Running cost to ${goal}`,
        x: { type: "linear", min: p.curve[0].level, max: xMax, fmt: (v) => String(Math.round(v)), label: axisName },
        y: { fmt: (v) => silver(v) },
        series: [{ name: "At typical prices", color: "s1", data: p.curve.map((d) => [d.level, d.point]) }],
        bands: [{ name: "80% range", color: "s1", opacity: 0.16, data: p.curve.map((d) => [d.level, d.p10, d.p90]) }],
        vlines: vl,
        tooltip: { title: atLevel, fmt: costText, range: rangeText },
      }, {
        legend: [{ name: "At typical prices", color: "s1", kind: "line" }, { name: "80% range", color: "s1", kind: "band" }],
        table: { cols: ["Level", { label: "Cost so far", r: true }, { label: "10%", r: true }, { label: "90%", r: true }], rows: p.curve.filter((d, i) => d.level % every === 0 || i === 0 || d.level === xMax).map((d) => [String(d.level), costText(d.point), costText(d.p10), costText(d.p90)]) },
      });

      /* silver per fame by tier and enchantment, the best item in each cell: lower is better, so the scale is flipped
         (blue pays, red costs) */
      const tiers = [...new Set(p.table.map((r) => r.tier))].sort((a, b) => a - b);
      const best = tiers.map((t) => [0, 1, 2, 3, 4].map((e) => p.table.filter((r) => r.tier === t && r.ench === e).sort((a, b) => a.perFame - b.perFame)[0] || null));
      const perFameText = (v) => (v < 0 ? `pays ${silver(-v, { digits: 2 })}` : silver(v, { digits: 2 }));
      const unlockText = (r) => (isRef ? (r.unlockAt ? `${r.unlockAt.name} 1` : `${jm.name} (assumed done)`) : `${Lm.name} ${r.unlockAt}`);
      ui.plot("cm-heat", "heat", {
        rows: tiers.map((t) => `T${t}`), cols: [".0", ".1", ".2", ".3", ".4"], scale: "div", flip: true, gamma: 0.5, cellH: isRef && tiers.length > 5 ? 26 : 32,
        values: best.map((row) => row.map((r) => (r ? r.perFame : null))),
        fmt: (v) => silver(v, { digits: Math.abs(v) < 10 ? 1 : 0 }), valueName: "Silver per fame (below zero: it pays)",
        note: (i, j) => { const r = best[i][j]; if (!r) return `Not ${isRef ? "refinable" : "craftable"} here, or not priced.`; return `${cat.label(r.id)}: ${perFameText(r.perFame)} silver per fame, ${r.best ? `selling in ${r.best}` : "kept unsold"}.${r.locked ? ` Unlocks at ${unlockText(r)}.` : ""}`; },
      }, { table: { cols: [isRef ? "Refine" : "Item", { label: "Fame", r: true }, { label: "Silver per fame", r: true }, "Best market", "Unlocks at"], rows: best.flat().filter(Boolean).map((r) => [cat.label(r.id), int(r.fame), perFameText(r.perFame), r.best || "kept", unlockText(r)]) } });

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

      drawLoop();

      /* ---------- after the first paint: every pace, then every specialization (or refining goal) ---------- */
      const paces = [...new Set([...S.PACES, p.days])].sort((a, b) => a - b);
      const keyBase = JSON.stringify([B.seq, lineId, nodes.map((n) => lv(n.id)), premium, base.focusPerDay, !!base.journals, cm.fee, cm.lp, base.share, royal]);
      const paceKey = keyBase + nodeId + paces.join(",");
      const drawPace = (rows) => {
        const nets = rows.map((r) => (r.d === p.days ? tot.net : r.net));
        const allSold = rows.find((r) => !r.kept);
        const sub = root.querySelector("#cm-pace .sub");
        if (sub) sub.textContent = `The cheapest route at each pace. A shorter time sells less into each market, so more ${W.made} go unsold or pricier ones take their place.${allSold ? ` At ${paceName(allSold.d).toLowerCase()}, every ${W.one} sells.` : ` Some ${W.made} go unsold even at a year.`} Below zero, the route pays you.`;
        ui.plot("cm-pace", "bars", {
          categories: rows.map((r) => PACE_SHORT[r.d] || `${r.d} d`), label: "Cost to max by pace",
          series: [{ name: "Cost to max", color: "s1", values: nets }],
          colors: rows.map((r) => (r.d === p.days ? "s1" : "var(--deemph)")),
          fmt: (v) => silver(v), labelFmt: (v) => silver(Math.abs(v)), tipFmt: costText, valueLabels: true,
          notes: rows.map((r) => `${paceName(r.d)}${r.d === p.days ? " (your pace)" : ""}: ${r.kept ? `${int(r.kept)} of ${int(r.crafts)} ${W.made} kept unsold` : `all ${int(r.crafts)} ${W.made} sold`}.`),
        }, { table: { cols: ["Pace", { label: "Cost", r: true }, { label: isRef ? "Refines" : "Crafts", r: true }, { label: "Unsold", r: true }], rows: rows.map((r, i) => [paceName(r.d), costText(nets[i]), int(r.crafts), int(r.kept)]) } });
      };
      const specKey = keyBase + others.map((s) => s.id).join(",");
      const drawSpecs = (rows) => {
        /* a goal the prices only partly cover would look cheaper than it is, so only the one on screen is drawn */
        const ok = rows.filter((r) => r.range && (!r.part || r.id === nodeId));
        const skipped = rows.filter((r) => !r.range).map((r) => r.name);
        const part = rows.filter((r) => r.range && r.part && r.id !== nodeId).map((r) => r.name);
        const sub = root.querySelector("#cm-specs .sub");
        if (sub) sub.textContent = `Cost to 100 from your levels with the same settings: at typical prices (dot) and the 80% range (bar). Tap one to plan it.${skipped.length ? ` Not priced here: ${skipped.join(", ")}.` : ""}${part.length ? ` Only partly priced here, so left out: ${part.join(", ")}.` : ""}${rows.some((r) => r.part && r.id === nodeId) ? " This one is only partly priced too (see above)." : ""}`;
        ui.plot("cm-specs", "forest", {
          rows: ok.sort((a, b) => a.net - b.net).map((r) => ({ id: r.id, label: `${r.name}${r.id === nodeId ? " · this one" : ""}`, lo: r.range.p10, mid: r.net, hi: r.range.p90, tier: r.tier, sub: r.done ? "Already at 100" : `${int(r.crafts)} ${W.made}` })),
          fmt: (v) => silver(v), labelFmt: costText, tipFmt: costText, rangeFmt: rangeText, midName: "At typical prices",
          onClick: (r) => { if (r.id !== nodeId) location.hash = `#/costmax/${r.id}`; },
          empty: isRef ? "None of this line's goals can be priced here." : "None of this line's routes can be priced here.",
        }, { table: { cols: [isRef ? "Goal" : "Specialization", { label: "Cost", r: true }, { label: "10%", r: true }, { label: "90%", r: true }, { label: isRef ? "Refines" : "Crafts", r: true }], rows: ok.map((r) => [r.name, costText(r.net), costText(r.range.p10), costText(r.range.p90), int(r.crafts)]) } });
      };
      (async () => {
        if (paceMemo?.key !== paceKey) {
          const rows = [];
          for (const d of paces) {
            await sleep(0);
            if (!alive) return;
            const q = d === p.days ? p : planOf({ ...base, days: d, draws: 0 });
            rows.push({ d, net: q.totals.net, crafts: q.totals.crafts, kept: q.totals.kept });
          }
          paceMemo = { key: paceKey, rows };
        }
        drawPace(paceMemo.rows);
        if (specMemo?.key !== specKey) {
          const rows = [];
          for (const s of others) {
            await sleep(0);
            if (!alive) return;
            const q = s.id === nodeId ? p : planOf({ ...base, node: s.id, seed: 7, draws: SPEC_DRAWS });
            const done = !q.fame.target, priced = done || q.options > 0;
            rows.push({ id: s.id, name: otherName(s), net: done ? 0 : q.totals.net, crafts: q.totals.crafts, done, part: isRef && q.short > 1, range: !priced ? null : done ? { p10: 0, p90: 0 } : q.range, tier: done ? "high" : S.confidence(B, q).tier.key });
          }
          specMemo = { key: specKey, rows };
        }
        drawSpecs(specMemo.rows);
      })();

      return wire();

      /* ---------- the daily loop (v1's crafting loop, engine/loop.js) ----------
         Drawn on its own, so its stage, mount and Expand change without planning the route again. */
      /* a stage's segment label and its line above the loop */
      function stageLabel(s) { return isRef && s.kind === "unlock" ? `Open T${s.tier}` : `T${s.tier}`; }
      function stageLine(s) { return isRef ? (s.kind === "unlock" ? `<b>${esc(s.node.name)} 0 → 1</b>, ${upTo(s)}` : `<b>${esc(s.node.name)} ${lvl(s.from.t)} → 100</b>, refining T${s.tier}`) : `<b>${esc(tName)} ${lvl(s.from.t)} → ${lvl(s.to.t)}</b>${mastery(s)}, crafts up to T${s.tier}`; }
      function drawLoop() {
        const box = root.querySelector("#cm-loop-body");
        if (!box) return;
        const LP = AB.loop, cmNow = store.get("costMax"), auto = !!cmNow.mammoth;
        const mount = LP.MOUNTS.find((m) => m.id === cmNow.mount) || LP.MOUNTS[0];
        const use = auto ? LP.MAMMOTH : mount;
        const other = LP.MOUNTS.find((m) => m.id === (!auto && mount.id === "ox8" ? "bear8" : "ox8"));
        /* the stage chosen last, else the first with something to make */
        let k = p.steps.findIndex((s) => stageKey(s) === loopAt.get(nodeId));
        if (k < 0) k = Math.max(0, p.steps.findIndex((s) => s.items.length));
        const R = LP.stage(B, p, k, { mount: use.kg, mammoth: auto, expand: !!cmNow.expand, other: other.kg });
        const st = p.steps[k];
        const stageSeg = p.steps.length > 1 ? `<div class="field"><span>Stage</span>${ui.seg("cm-stage", p.steps.map((x) => [stageKey(x), stageLabel(x)]), stageKey(st), "Stage")}</div>` : "";
        const ctrl = `<div class="cm-loop-ctrl">${stageSeg}
          <label class="field"><span>Your pack mount</span><select class="select" id="cm-mount" ${auto ? "disabled" : ""}>${LP.MOUNTS.map((m) => `<option value="${m.id}"${m.id === mount.id ? " selected" : ""}>${esc(m.name)} (T${m.tier}), ${int(m.kg)} kg</option>`).join("")}</select></label>
          <label class="check"><input type="checkbox" data-k="mammoth" ${auto ? "checked" : ""}> I have a T8 Transport Mammoth</label></div>`;
        if (!R) {
          box.innerHTML = `${ctrl}<p class="small">${stageLine(st)}.</p>${ui.empty(`Nothing at this stage can be ${isRef ? "refined" : "crafted"} with these prices, so it has no loop.`, "info")}`;
          return;
        }
        box.innerHTML = ctrl + loopHTML(R, use, other, auto, stageLine(st));
      }
      /* the stops, in order, and what the loop comes to */
      function loopHTML(R, use, other, auto, stageLine) {
        const LP = AB.loop, L = R.loop, cap = L.cap, O = R.other;
        const nm = (id) => esc(cat.label(id));
        /* a journal by tier and kind: "T5 Blacksmith's Journal" (its own name carries the tier word and Empty or Full) */
        const jn = (id) => esc(`T${cat.parse(id).tier} ${cat.name(id).replace(/^(Beginner|Novice|Journeyman|Adept|Expert|Master|Grandmaster|Elder)\s+/, "").replace(/\s*\((Empty|Full)\)$/, "")}`);
        /* an amount a day: whole numbers, or how often for something made less than once a day */
        const qty = (x) => (x >= 0.95 ? int(x) : x > 0 ? `1 every ${int(Math.max(2, Math.round(1 / x)))} days` : "0");
        const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : a[0] || "");
        const daysText = (d) => (d < 1 ? "less than a day" : `about ${d < 10 ? d.toFixed(1) : int(d)} days`);
        const pos = (c) => L.order.indexOf(c);
        const load = L.order.length > 1 ? L.max.kg / cap : 0;

        /* what the day is, and whether it fits */
        const intro = [`${stageLine}: ${daysText(R.days)} at your pace${R.days < 1 ? ", so it's a single loop" : ""}, ${qty(L.crafts)} ${W.made}${R.days < 1 ? "" : " a day"}.`];
        if (L.order.length < 2) intro.push(`Everything happens in ${esc(L.main)}, so there's nothing to carry.`);
        else if (L.fits) intro.push(`It fits your ${esc(use.name)}: the heaviest leg is about ${int(L.max.kg)} kg, ${esc(L.max.from)} to ${esc(L.max.to)}, ${pct(load)} of its ${int(cap)} kg.`);
        else intro.push(`<strong class="cm-over">${icon("alert")}Even with every cut below, the heaviest leg is about ${int(L.max.kg)} kg (${esc(L.max.from)} to ${esc(L.max.to)}), over your mount's ${int(cap)} kg.</strong> Split that leg into two trips, or give the route more time so each day makes less.`);
        const partial = L.refinables.filter((f) => f.refined < f.qty - 1e-9);
        if (partial.length) {
          const kept = L.refinables.filter((f) => f.refined > 0).map((f) => `${qty(f.refined)} ${nm(f.m)}${f.refined < f.qty - 1e-9 ? ` of ${qty(f.qty)}` : ""}`);
          intro.push(`A full refining loop doesn't fit, so it refines what saves the most per kilo${kept.length ? `: ${and(kept)}` : " (nothing, here)"}, and buys the rest ready-made.`);
        }
        L.moved.forEach((x) => intro.push(`It buys ${nm(x.m)} in ${esc(x.to)} instead of carrying it from ${esc(x.from)}, which costs about ${silver(Math.max(0, x.extra))} more and keeps the legs light.`));
        if (L.banked > 0.05) intro.push(`Each market takes at most ${cm.noCap ? "a whole day" : "a quarter of a day"} of its sales, so ${qty(L.banked)} of the day's ${W.made} go to the bank (worth about ${silver(L.bankValue)}), to sell on later days.`);
        if (L.kept > 0.05) intro.push(`${qty(L.kept)} ${W.made} no market here takes stay in the bank, as the route keeps them.`);
        const offRing = L.off.length ? `<p class="small cm-risk">${L.off.map((x) => ui.riskTag(x.city === "Brecilien" ? "mists" : "red")).join(" ")} This loop goes to ${and(L.off.map((x) => `${esc(x.city)} (${esc(x.why)})`))}, because the route buys or sells there. Tick <b>Royal cities only</b> above for a route that stays in blue and yellow zones.</p>` : "";

        /* Expand this loop, or what it added */
        let expandHTML = "";
        if (R.expanded) {
          const by = new Map();
          for (const x of R.added) by.set(x.id, (by.get(x.id) || 0) + x.units);
          const g = [...by].sort((a, b) => b[1] - a[1]);
          const names = g.slice(0, 5).map(([id, u]) => `${qty(u)} ${nm(id)}`).concat(g.length > 5 ? [`${g.length - 5} more items`] : []);
          const B0 = R.base, day = R.days < 1 ? "" : " a day", the = R.days < 1 ? "the loop" : "the day";
          const faster = R.daysBase >= 1 && R.daysBase - R.daysNow >= 0.05 ? `, so this stage takes ${daysText(R.daysNow)} instead of ${daysText(R.daysBase)}` : "";
          const body = names.length
            ? `Added ${and(names)}${day}, each sold where the table says. The mount now carries ${pct(load)} of its limit${R.full ? `, leaving about ${pct(1 - LP.FILL)} spare for your gear and bags` : auto ? ". It stops there: anything more would sell past a market's share or add no profit" : "; anything more would sell past a market's share or add no profit"}. That's ${qty(L.crafts - B0.crafts)} more ${W.made}${day}${faster}; ${the} spends about ${silver(L.tot.spend - B0.tot.spend)} more and keeps about ${silver(L.tot.keep - B0.tot.keep)} more.`
            : "Nothing more pays at a volume the markets can take.";
          expandHTML = `<div class="banner info cm-expand">${icon("info")}<div class="b-body"><div class="b-title">${auto ? "Filled for the Mammoth" : "Expanded"}</div><div class="small">${body}</div>${auto ? "" : `<div class="row" style="margin-top:8px"><button class="btn ghost" type="button" data-cm-expand="0">Back to the normal loop</button></div>`}</div></div>`;
        } else if (L.fits && L.order.length > 1 && load < LP.FILL) {
          expandHTML = `<div class="row cm-expand"><button class="btn" type="button" data-cm-expand="1">Expand this loop</button><span class="small muted">It uses only ${pct(load)} of your mount. Expanding adds more of the ${W.made} this stage can make that pay, best silver per kilo first, until the mount is about ${pct(LP.FILL)} full.</span></div>`;
        }

        /* the stops: a header per city, its errands, the ride on, and the silver spent or earned there */
        /* one line per material or item: the day's buys of one material for several benches, or one item's sales in
           one market (the Black Market and Caerleon's market share a stop), add up */
        const merge = (arr, key) => { const m = new Map(); for (const b of arr) { const k = key(b), g = m.get(k); if (g) { g.qty += b.qty || 0; g.units += b.units || 0; } else m.set(k, { ...b, qty: b.qty || 0, units: b.units || 0 }); } return [...m.values()]; };
        const row = (doing, amount, price = "") => `<tr><td>${doing}${price ? `<div class="cm-sm">${price}</div>` : ""}</td><td class="r num">${amount}</td><td class="cm-wide">${price}</td></tr>`;
        const money = (x) => [x.spend >= 0.5 ? `spend ${silver(x.spend)}` : "", x.earn >= 0.5 ? `earn ${silver(x.earn)}` : "", x.fee >= 0.5 ? `station fee ${silver(x.fee)}` : ""].filter(Boolean).join(" · ") || "nothing to pay or earn";
        const body = L.order.map((city, n) => {
          const s = L.stops.get(city), list = [];
          const later = (b) => n > pos(b.bench);
          const tomorrow = isRef ? " for tomorrow's refining" : " for tomorrow's crafting";
          for (const b of merge(s.input, (x) => x.m)) list.push(row(`Buy ${nm(b.m)} for refining`, qty(b.qty), `about ${int(b.price)}`));
          const raws = merge(s.raw, (x) => x.m).map((b) => row(`Buy ${nm(b.m)} to refine`, qty(b.qty), `about ${int(b.price)}${b.max ? `, at most ${int(b.max)}` : ""}`));
          if (s.refine.length) list.push(...raws);
          for (const x of s.refine) list.push(row(`Refine ${nm(x.m)} from what you're carrying, no focus`, qty(x.qty), `costs about ${int(x.own)} each (${int(x.buy)} to buy)`));
          for (const b of s.ready) list.push(row(`Buy ${nm(b.m)} ready-made${later(b) ? tomorrow : ""}`, qty(b.qty), `about ${int(b.price)}`));
          for (const b of s.buy) list.push(row(`Buy ${nm(b.m)}${later(b) ? tomorrow : ""}`, qty(b.qty), `about ${int(b.price)}`));
          for (const j of s.jbuy) list.push(row(`Buy empty ${jn(j.id)}s${j.npc ? " from the NPC" : ""}`, qty(j.qty), `about ${int(j.price)}`));
          for (const c of merge(s.craft, (x) => x.id)) {
            const extra = s.craft.filter((x) => x.id === c.id && x.added).reduce((a, x) => a + x.units, 0);
            const focus = s.craft.filter((x) => x.id === c.id).reduce((a, x) => a + x.uF, 0);
            const note = [focus >= 0.5 ? `${qty(focus)} with focus` : "", extra >= c.units - 1e-9 ? "added" : extra > 0 ? `${qty(extra)} added` : ""].filter(Boolean).join(", ");
            list.push(row(`${W.Make} ${nm(c.id)}${note ? ` (${note})` : ""}`, qty(c.units)));
          }
          for (const b of merge(s.bank, (x) => `${x.id}|${x.kept ? "" : x.market}`)) list.push(row(b.kept ? `Keep ${nm(b.id)} in the bank: no market here takes it` : `Bank ${b.journal ? `full ${jn(b.id)}s` : nm(b.id)} to sell ${b.market === cat.BM ? "to the Black Market" : `in ${esc(b.market)}`} on later days`, qty(b.units), b.kept ? "" : `worth about ${int(b.net)} each`));
          for (const x of merge(s.sell, (v) => `${v.id}|${v.market}|${v.from}`)) list.push(row(`Sell ${nm(x.id)}${x.market === cat.BM ? " to the Black Market" : ""}${n < pos(x.from) ? `, ${isRef ? "refined" : "crafted"} on the last loop` : ""}`, qty(x.units), `about ${int(x.price)} each`));
          for (const j of s.jsell) list.push(row(`Sell full ${jn(j.id)}s`, qty(j.qty), `about ${int(j.price)} each`));
          if (!s.refine.length) list.push(...raws);
          if (L.order.length > 1) {
            const leg = L.legs[n];
            list.push(row(`Ride to ${esc(leg.to)}${leg.kg < 0.5 ? "" : " carrying"}`, leg.kg < 0.5 ? "—" : `${int(leg.kg)} kg`, leg.kg > cap + 1e-6 ? `<span class="cm-over">${icon("alert")}over the ${int(cap)} kg limit</span>` : leg.kg < 0.5 ? "nothing on board" : leg.kg < cap * 0.01 ? "under 1% of the mount" : `${pct(leg.kg / cap)} of the mount`));
          }
          const tag = LP.OFF_RING[city] ? ` ${ui.riskTag(city === "Brecilien" ? "mists" : "red")}` : "";
          return `<tr class="cm-stop"><th colspan="3" scope="rowgroup">${n + 1}. ${esc(city)}${tag}</th></tr>${list.join("") || `<tr><td colspan="3" class="muted">Ride through</td></tr>`}<tr class="cm-silver"><td colspan="3"><b>Silver:</b> ${money(s)}</td></tr>`;
        }).join("");
        const table = `<div class="table-wrap"><table class="t cm-loop cm-fold"><thead><tr><th scope="col">Do</th><th class="r" scope="col">Amount</th><th class="cm-wide" scope="col">Price</th></tr></thead><tbody>${body}</tbody></table></div>`;

        const t = L.tot;
        const whole = `<p class="cm-whole"><b>Whole loop:</b> spend about ${silver(t.spend)}, earn about ${silver(t.earn)}${t.fee >= 0.5 ? `, station fees ${silver(t.fee)}` : ""}, so you ${t.keep >= 0 ? `keep about <b>${silver(t.keep)}</b>` : `put in about <b>${silver(-t.keep)}</b>`}${R.days < 1 ? "" : " a day"}${L.banked > 0.05 ? `, and bank ${W.made} worth about ${silver(L.bankValue)} to sell later` : ""}.${O ? ` On the ${esc(other.name)} (${int(other.kg)} kg) this loop ${O.fits ? `${Math.abs(O.tot.keep - t.keep) <= Math.abs(t.keep) * 0.01 + 1 ? "comes to the same" : `${O.tot.keep >= 0 ? "keeps" : "puts in"} about ${silver(Math.abs(O.tot.keep))}`}${O.saved < L.saved - 1 ? ", refining less because it carries less" : ""}` : `doesn't fit: its heaviest leg would be ${int(O.max.kg)} kg`}.` : ""}</p>`;
        const benches = L.order.filter((c) => c !== L.main && L.stops.get(c).craft.length);
        const first = L.order.length > 1 ? `<p class="small muted cm-first"><b>First day:</b> nothing is on board yet, so start at stop 2, buy as you go, and ${W.make} when you're back in ${esc(L.main)}${benches.length ? ` (in ${and(benches.map(esc))}, from the next time you pass with its materials)` : ""}${L.dayOne.length ? `. That day, buy ${and(L.dayOne.map((b) => `${qty(b.qty)} ${nm(b.m)} in ${esc(b.city)}`))} ready-made: the ride reaches ${L.dayOne.length > 1 ? "their refining stops before their" : "its refining stop before its"} inputs are aboard` : ""}.</p>` : "";
        const refining = L.refinables.length ? `<details class="cm-more"><summary>${isRef ? "Refining the tier-below material yourself" : "Refining your own materials"}</summary><div class="table-wrap"><table class="t cm-fold"><thead><tr><th scope="col">Material</th><th class="cm-wide" scope="col">Refined in</th><th class="r" scope="col">To buy</th><th class="r" scope="col">To refine</th><th class="r" scope="col">Saving</th></tr></thead><tbody>${L.refinables.map((f) => `<tr><td>${nm(f.m)}<div class="cm-sm">Refined in ${esc(f.city)}</div></td><td class="cm-wide">${esc(f.city)}</td><td class="r num">${int(f.price)}</td><td class="r num">${int(f.own)}</td><td class="r num">${pct(f.saving / f.price)}</td></tr>`).join("")}</tbody></table></div><p class="small muted">Refined without focus in the refining bonus city, which returns ${pct(cat.RETURN.refineBonus.none, 1)} of the inputs, at your station fee. The loop refines only what saves more than ${pct(LP.REFINE_MIN)}. A raw material's "at most" is the price where refining stops beating buying ready-made.${isRef ? " These refines count for the Destiny Board too, which the route doesn't count on." : " Refining needs the matching refining nodes on your Destiny Board."}</p></details>` : "";
        const every = p.steps.length > 1 ? `<details class="cm-more" id="cm-loop-all"><summary>Every stage on your mount</summary><div class="cm-more-body"></div></details>` : "";
        return `<p class="small cm-loop-intro">${intro.join(" ")}</p>${offRing}${expandHTML}${table}${whole}${first}${refining}${every}`;
      }
      /* every stage's loop on the chosen mount and the other one, drawn when opened */
      function drawEvery(el) {
        const LP = AB.loop, cmNow = store.get("costMax"), auto = !!cmNow.mammoth;
        const mount = LP.MOUNTS.find((m) => m.id === cmNow.mount) || LP.MOUNTS[0];
        const use = auto ? LP.MAMMOTH : mount;
        const other = LP.MOUNTS.find((m) => m.id === (!auto && mount.id === "ox8" ? "bear8" : "ox8"));
        const keepText = (L) => (L.fits ? `${L.tot.keep >= 0 ? "keeps" : "puts in"} ${silver(Math.abs(L.tot.keep))}` : `<span class="cm-over">${icon("alert")}too heavy</span>`);
        const rows = p.steps.map((st, k) => {
          const R = LP.stage(B, p, k, { mount: use.kg, mammoth: auto, expand: !!cmNow.expand, other: other.kg });
          const span = st.kind === "unlock" ? "0 → 1" : `${lvl(st.from.t)} → ${lvl(st.to.t)}`;
          if (!R) return `<tr><td>${stageLabel(st)} <span class="muted">${span}</span></td><td colspan="4" class="muted">Nothing to ${W.make}</td></tr>`;
          const L = R.loop, O = R.other;
          const leg = L.order.length > 1 ? `${int(L.max.kg)} kg, ${esc(L.max.from)} to ${esc(L.max.to)}` : "no travel";
          return `<tr><td>${stageLabel(st)} <span class="muted">${span}</span><div class="cm-sm">${leg}</div></td><td class="cm-wide">${leg}</td><td class="r num">${keepText(L)}</td><td class="r num">${keepText(O)}</td><td class="r num">${L.saved >= 1 ? `${silver(L.saved)}${L.fullSave > L.saved + 1 ? ` of ${silver(L.fullSave)}` : ""}` : "—"}</td></tr>`;
        }).join("");
        const head = (m) => `<span class="cm-wide">${esc(m.name)}</span><span class="cm-sm">${esc(m.short)}</span>`;
        el.innerHTML = `<div class="table-wrap"><table class="t cm-fold"><thead><tr><th scope="col">Stage</th><th class="cm-wide" scope="col">Heaviest leg</th><th class="r" scope="col">${head(use)}</th><th class="r" scope="col">${head(other)}</th><th class="r" scope="col">Refining saves</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small muted">A day of each stage. "Keeps" is the day's silver after buying, selling and station fees, before what goes to the bank; "of" shows what refining would save if all of it fit.</p>`;
      }

      /* ---------- the form's controls ---------- */
      function wire() {
        const f = root.querySelector("#cm-form");
        f.addEventListener("submit", (e) => e.preventDefault());
        const set = (patch) => store.set("costMax", { ...store.get("costMax"), ...patch });
        /* crafting or refining: back to the last route of that kind */
        ui.onSeg(f, "cm-mode", (v) => { if (v !== mode) location.hash = `#/costmax/${v === "refine" ? refineId : craftId}`; });
        f.querySelector("#cm-line").addEventListener("change", (e) => {
          if (isRef) {
            /* another refining line keeps the goal: all five tiers, or the same tier */
            const L = RF.line(e.target.value);
            location.hash = `#/costmax/${RT ? L.nodes[RT.tier - 4].id : L.id}`;
            return;
          }
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
          } else if (["focus", "journals", "noCap"].includes(el.dataset.k)) set({ [el.dataset.k]: el.checked });
          else if (el.dataset.k === "royal") store.set("safeOnly", el.checked);
          else if (el.dataset.k === "fee" || el.dataset.k === "lp") {
            const v = +el.value;
            if (!(v >= 0) || el.value === "") { el.value = cm[el.dataset.k]; return; }
            set({ [el.dataset.k]: v });
          }
        });
        ui.onSeg(root, "pace", (v) => set({ days: +v }));
        /* the daily loop: its stage, mount, Mammoth and Expand redraw only the loop */
        const card = root.querySelector("#cm-loop");
        if (card) {
          ui.onSeg(card, "cm-stage", (v) => { loopAt.set(nodeId, v); drawLoop(); });
          card.addEventListener("change", (e) => {
            if (e.target.id === "cm-mount") set({ mount: e.target.value });
            else if (e.target.dataset.k === "mammoth") set({ mammoth: e.target.checked });
          });
          card.addEventListener("click", (e) => {
            const b = e.target.closest("[data-cm-expand]");
            if (!b) return;
            b.disabled = true;
            b.textContent = b.dataset.cmExpand === "1" ? "Packing the mount…" : "Restoring…";
            setTimeout(() => set({ expand: b.dataset.cmExpand === "1" }), 20);
          });
          card.addEventListener("toggle", (e) => { if (e.target.id === "cm-loop-all" && e.target.open) drawEvery(e.target.querySelector(".cm-more-body")); }, true);
        }
        let prev = store.get("costMax");
        const off = store.on("change", (k) => {
          if (k === "specLevels" || k === "safeOnly") return again();
          if (k !== "costMax") return;
          const now = store.get("costMax"), route = ROUTE_KEYS.some((x) => now[x] !== prev[x]);
          prev = now;
          if (route) again(); else drawLoop();
        });
        return () => { alive = false; off(); };
      }
    },
  };
})();
