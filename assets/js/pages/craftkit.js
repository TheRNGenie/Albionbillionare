/* Albion Billionaire v2 — what the two crafting pages share (Cost to Max and Crafting): a crafting or refining line's
   market model, loaded once and kept, and the daily loop (engine/loop.js) drawn as a ride of stops with its controls. */
window.AB = window.AB || {};

AB.craftKit = (() => {
  const { esc, icon, silver, int, pct } = AB.util;

  /* ---------- a line's prices ----------
     The app's prices plus everything a line may price (AB.market.extend): a crafting line's items, materials and
     journals, or a refining line's refines. The last few lines opened are kept, for both pages. When the app has newer
     prices, a page keeps showing the line's model it has and a newer one is built for the next time it draws, so
     nothing moves under the player. */
  const KEEP_LINES = 3;
  const models = new Map(), pending = new Map(), failed = new Map();
  const needsOf = (lineId) => (AB.refine.has(lineId) ? AB.refine.needs(lineId) : AB.spec.needs(lineId));
  /* the line's model for the prices on screen (or the one before them, of the same kind), loading it if needed;
     onReady runs once a model the page lacks has loaded (or failed) */
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
  /* why the line's prices didn't load for the prices on screen (null: they did, or are loading), and trying again */
  const failure = (lineId, M) => { const f = failed.get(lineId); return f && f.seq === M.seq ? f.e : null; };
  const retry = (lineId) => failed.delete(lineId);

  /* ---------- the daily loop ---------- */
  /* the mount a page's settings name ({mount, mammoth}), what the loop is sized to, and the mount to compare with */
  function mounts(st) {
    const LP = AB.loop, auto = !!st.mammoth;
    const mount = LP.MOUNTS.find((m) => m.id === st.mount) || LP.MOUNTS[0];
    return { mount, auto, use: auto ? LP.MAMMOTH : mount, other: LP.MOUNTS.find((m) => m.id === (!auto && mount.id === "ox8" ? "bear8" : "ox8")) };
  }
  /* the loop's controls: a stage picker (Cost to Max), the pack mount and the Transport Mammoth */
  function loopCtrl({ seg = "", mount, auto }) {
    return `<div class="cm-loop-ctrl">${seg}
      <label class="field"><span>Your pack mount</span><select class="select" id="cm-mount" ${auto ? "disabled" : ""}>${AB.loop.MOUNTS.map((m) => `<option value="${m.id}"${m.id === mount.id ? " selected" : ""}>${esc(m.name)} (T${m.tier}), ${int(m.kg)} kg</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" data-k="mammoth" ${auto ? "checked" : ""}> I have a T8 Transport Mammoth</label></div>`;
  }
  /* The stops, in order, and what the loop comes to.
     R: a day's loop (loop.stage, or crafting.loop); o: { use, other (mounts), auto (a Mammoth), intro (what the day is),
     words ({make, Make, made, one}), isRef (refining: the "crafts" are refines), noCap (the sell limit is off), who
     (what buys and sells: "the route", "the plan"), scope (what Expand adds to: "this stage", "this plan"), heavy (what
     to do when a leg is over the mount), every (add "Every stage on your mount", drawn when opened) } */
  function loopHTML(R, o) {
    const LP = AB.loop, ui = AB.ui, cat = AB.cat, W = o.words;
    const L = R.loop, cap = L.cap, O = R.other, use = o.use, other = o.other, auto = o.auto;
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
    const intro = [o.intro];
    if (L.order.length < 2) intro.push(`Everything happens in ${esc(L.main)}, so there's nothing to carry.`);
    else if (L.fits) intro.push(`It fits your ${esc(use.name)}: the heaviest leg is about ${int(L.max.kg)} kg, ${esc(L.max.from)} to ${esc(L.max.to)}, ${pct(load)} of its ${int(cap)} kg.`);
    else intro.push(`<strong class="cm-over">${icon("alert")}Even with every cut below, the heaviest leg is about ${int(L.max.kg)} kg (${esc(L.max.from)} to ${esc(L.max.to)}), over your mount's ${int(cap)} kg.</strong> ${o.heavy}`);
    const partial = L.refinables.filter((f) => f.refined < f.qty - 1e-9);
    if (partial.length) {
      const kept = L.refinables.filter((f) => f.refined > 0).map((f) => `${qty(f.refined)} ${nm(f.m)}${f.refined < f.qty - 1e-9 ? ` of ${qty(f.qty)}` : ""}`);
      intro.push(`A full refining loop doesn't fit, so it refines what saves the most per kilo${kept.length ? `: ${and(kept)}` : " (nothing, here)"}, and buys the rest ready-made.`);
    }
    /* one or two materials bought at the bench read best one by one; more read as one list */
    if (L.moved.length > 2) intro.push(`To keep the legs light, it buys ${L.moved.length} materials where they're used instead of carrying them, for about ${silver(L.moved.reduce((a, x) => a + Math.max(0, x.extra), 0))} more in all: ${and(L.moved.map((x) => `${nm(x.m)} in ${esc(x.to)} (not ${esc(x.from)})`))}.`);
    else L.moved.forEach((x) => intro.push(`It buys ${nm(x.m)} in ${esc(x.to)} instead of carrying it from ${esc(x.from)}, which costs about ${silver(Math.max(0, x.extra))} more and keeps the legs light.`));
    if (L.banked > 0.05) intro.push(`Each market takes at most ${o.noCap ? "a whole day" : "a quarter of a day"} of its sales, so ${qty(L.banked)} of the day's ${W.made} go to the bank (worth about ${silver(L.bankValue)}), to sell on later days.`);
    if (L.kept > 0.05) intro.push(`${qty(L.kept)} ${W.made} no market here takes stay in the bank, as ${o.who} keeps them.`);
    const offRing = L.off.length ? `<p class="small cm-risk">${L.off.map((x) => ui.riskTag(x.city === "Brecilien" ? "mists" : "red")).join(" ")} This loop goes to ${and(L.off.map((x) => `${esc(x.city)} (${esc(x.why)})`))}, because ${o.who} buys or sells there. Tick <b>Royal cities only</b> above for one that stays in blue and yellow zones.</p>` : "";

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
      expandHTML = `<div class="row cm-expand"><button class="btn" type="button" data-cm-expand="1">Expand this loop</button><span class="small muted">It uses only ${pct(load)} of your mount. Expanding adds more of the ${W.made} ${o.scope} can make that pay, best silver per kilo first, until the mount is about ${pct(LP.FILL)} full.</span></div>`;
    }

    /* the stops: a header per city, its errands, the ride on, and the silver spent or earned there */
    /* one line per material or item: the day's buys of one material for several benches, or one item's sales in one
       market (the Black Market and Caerleon's market share a stop), add up */
    const merge = (arr, key) => { const m = new Map(); for (const b of arr) { const k = key(b), g = m.get(k); if (g) { g.qty += b.qty || 0; g.units += b.units || 0; } else m.set(k, { ...b, qty: b.qty || 0, units: b.units || 0 }); } return [...m.values()]; };
    const row = (doing, amount, price = "") => `<tr><td>${doing}${price ? `<div class="cm-sm">${price}</div>` : ""}</td><td class="r num">${amount}</td><td class="cm-wide">${price}</td></tr>`;
    const money = (x) => [x.spend >= 0.5 ? `spend ${silver(x.spend)}` : "", x.earn >= 0.5 ? `earn ${silver(x.earn)}` : "", x.fee >= 0.5 ? `station fee ${silver(x.fee)}` : ""].filter(Boolean).join(" · ") || "nothing to pay or earn";
    const body = L.order.map((city, n) => {
      const s = L.stops.get(city), list = [];
      const later = (b) => n > pos(b.bench);
      const tomorrow = o.isRef ? " for tomorrow's refining" : " for tomorrow's crafting";
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
      for (const x of merge(s.sell, (v) => `${v.id}|${v.market}|${v.from}`)) list.push(row(`Sell ${nm(x.id)}${x.market === cat.BM ? " to the Black Market" : ""}${n < pos(x.from) ? `, ${o.isRef ? "refined" : "crafted"} on the last loop` : ""}`, qty(x.units), `about ${int(x.price)} each`));
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
    const refining = L.refinables.length ? `<details class="cm-more"><summary>${o.isRef ? "Refining the tier-below material yourself" : "Refining your own materials"}</summary><div class="table-wrap"><table class="t cm-fold"><thead><tr><th scope="col">Material</th><th class="cm-wide" scope="col">Refined in</th><th class="r" scope="col">To buy</th><th class="r" scope="col">To refine</th><th class="r" scope="col">Saving</th></tr></thead><tbody>${L.refinables.map((f) => `<tr><td>${nm(f.m)}<div class="cm-sm">Refined in ${esc(f.city)}</div></td><td class="cm-wide">${esc(f.city)}</td><td class="r num">${int(f.price)}</td><td class="r num">${int(f.own)}</td><td class="r num">${pct(f.saving / f.price)}</td></tr>`).join("")}</tbody></table></div><p class="small muted">Refined without focus in the refining bonus city, which returns ${pct(cat.RETURN.refineBonus.none, 1)} of the inputs, at your station fee. The loop refines only what saves more than ${pct(LP.REFINE_MIN)}. A raw material's "at most" is the price where refining stops beating buying ready-made.${o.isRef ? " These refines count for the Destiny Board too, which the route doesn't count on." : " Refining needs the matching refining nodes on your Destiny Board."}</p></details>` : "";
    const every = o.every ? `<details class="cm-more" id="cm-loop-all"><summary>Every stage on your mount</summary><div class="cm-more-body"></div></details>` : "";
    return `<p class="small cm-loop-intro">${intro.join(" ")}</p>${offRing}${expandHTML}${table}${whole}${first}${refining}${every}`;
  }
  /* The loop card's own controls: the mount, the Mammoth and Expand change only the page's settings (set(patch)). */
  function wireLoop(card, set) {
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
  }

  return { marketFor, failure, retry, mounts, loopCtrl, loopHTML, wireLoop };
})();
