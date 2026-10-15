/* Best picks: ranks crops, refines, Black Market flips and journals from live prices and 7-day sales,
   and writes a plain-language reason for every pick. */
window.ABP = window.ABP || {};

ABP.JOURNALS = [
  { key: "WOOD", labourer: "Lumberjack", activity: "gathering wood" },
  { key: "ORE", labourer: "Prospector", activity: "gathering ore" },
  { key: "STONE", labourer: "Stonecutter", activity: "quarrying stone" },
  { key: "FIBER", labourer: "Cropper", activity: "harvesting fiber" },
  { key: "HIDE", labourer: "Gamekeeper", activity: "skinning hide" },
  { key: "FISHING", labourer: "Fisherman", activity: "fishing" },
  { key: "MERCENARY", labourer: "Mercenary", activity: "killing mobs" },
  { key: "WARRIOR", labourer: "Blacksmith", activity: "crafting plate gear and warrior weapons" },
  { key: "HUNTER", labourer: "Fletcher", activity: "crafting leather gear and hunter weapons" },
  { key: "MAGE", labourer: "Imbuer", activity: "crafting cloth gear and mage weapons" },
  { key: "TOOLMAKER", labourer: "Tinker", activity: "crafting tools, bags and off-hands" },
];

ABP.advisor = (() => {
  const F = () => ABP.FEES;
  const MAX_AGE_H = 48;
  const ageH = (iso) => (iso ? (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 36e5 : null);
  const fresh = (r, field = "sellDate") => r && ageH(r[field]) != null && ageH(r[field]) <= MAX_AGE_H;
  const n = (v) => Math.round(v).toLocaleString("en-US");
  const short = (v) => {
    const a = Math.abs(v), s = v < 0 ? "-" : "";
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return s + Math.round(a / 1e3) + "k";
    return s + n(a);
  };
  const pct = (v) => (v * 100).toFixed(0) + "%";
  const age = (iso) => { const h = ageH(iso); return h == null ? "no date" : h < 1 ? "under an hour old" : h < 48 ? Math.round(h) + " h old" : Math.round(h / 24) + " days old"; };
  const keepOrder = () => 1 - F().salesTaxPremium - F().setupFee;

  function cheapest(byCity, cities, field = "sell") {
    let best = null;
    for (const c of cities) { const r = byCity?.[c]; if (r?.[field] && fresh(r, field === "sell" ? "sellDate" : "buyDate") && (!best || r[field] < best[field])) best = r; }
    return best;
  }
  function dearest(byCity, cities, field = "sell") {
    let best = null;
    for (const c of cities) { const r = byCity?.[c]; if (r?.[field] && fresh(r, field === "sell" ? "sellDate" : "buyDate") && (!best || r[field] > best[field])) best = r; }
    return best;
  }

  /* ---- Crops and herbs ---- */
  async function crops({ plots = 8, perPlant = 9, seedReturn = 0.7, plantsPerPlot = 9 } = {}) {
    const all = ABP.CROPS.map((c) => ({ ...c, kind: "crop" })).concat(ABP.HERBS.map((h) => ({ ...h, kind: "herb" })));
    const can = (c) => c.tier <= (c.kind === "herb" ? ABP.spec.farm.herb : ABP.spec.farm.crop);
    const list = all;
    const idx = ABP.api.index(await ABP.api.prices(list.flatMap((c) => [c.crop, c.seed]), ABP.CITIES));
    const plants = plots * plantsPerPlot;
    const harvest = plants * perPlant;
    let rows = list.map((c) => {
      const sell = dearest(idx[c.crop], ABP.CITIES);
      const seed = cheapest(idx[c.seed], ABP.CITIES);
      if (!sell || !seed) return { ...c, missing: true };
      const net = sell.sell * keepOrder();
      const seedsBought = plants * (1 - seedReturn);
      const seedCost = seedsBought * seed.sell;
      return { ...c, sell, seed, net, seedsBought, seedCost, gross: harvest * net - seedCost };
    }).filter((r) => !r.missing);
    rows.sort((a, b) => b.gross - a.gross);
    let vol = {};
    try {
      vol = await ABP.api.volumes(rows.map((r) => r.crop), [...new Set(rows.map((r) => r.sell.city))]);
    } catch (e) { /* rank on price alone */ }
    for (const r of rows) {
      const v = vol[r.crop]?.[r.sell.city];
      r.perDay = v ? v.perDay : null;
      const sellable = r.perDay == null ? harvest : Math.min(harvest, r.perDay * 0.5);
      r.sellable = sellable;
      r.daily = sellable * r.net - r.seedCost;
    }
    rows.sort((a, b) => b.daily - a.daily);
    const locked = rows.filter((r) => !can(r));
    const bestLocked = locked[0];
    rows = rows.filter(can);
    rows.forEach((r, i) => {
      const next = rows[i + 1];
      r.reasons = [
        `${r.name} sells for ${n(r.sell.sell)} in ${r.sell.city} (${age(r.sell.sellDate)}). After the 4% tax and 2.5% listing fee you keep ${n(r.net)} each.`,
        `You harvest about ${n(harvest)} a day from ${plots} plots. With ${pct(seedReturn)} of seeds coming back you rebuy ${n(r.seedsBought)} seeds at ${n(r.seed.sell)} in ${r.seed.city}, which costs ${short(r.seedCost)} a day.`,
        r.perDay == null
          ? `No sales history came back for ${r.city || r.sell.city}, so check the market depth before you plant every plot with it.`
          : r.perDay * 0.5 >= harvest
            ? `${n(r.perDay)} sell per day in ${r.sell.city}, so your whole harvest fits in under half the market.`
            : `Only ${n(r.perDay)} sell per day in ${r.sell.city}. Selling more than about half of that crashes the price, so the ranking counts ${n(r.sellable)} a day. Plant the rest with your second pick or turn it into ${r.kind === "herb" ? "potions" : "food or animal feed"}.`,
      ];
      if (i === 0 && next) r.reasons.push(`It beats ${next.name} (next best) by ${short(r.daily - next.daily)} a day.`);
      if (i === 0 && bestLocked && bestLocked.daily > r.daily) r.reasons.push(`Your spec reaches T${ABP.spec.farm.crop} crops and T${ABP.spec.farm.herb} herbs. Unlocking T${bestLocked.tier} ${bestLocked.name} would pay about ${short(bestLocked.daily)} a day, ${short(bestLocked.daily - r.daily)} more, so that is the farming node to level next.`);
      else if (i === 0) r.reasons.push(`Nothing above your current farming spec (T${ABP.spec.farm.crop} crops, T${ABP.spec.farm.herb} herbs) pays more, so there is no need to rush the next farming tier.`);
    });
    return { rows, harvest, plots };
  }

  /* ---- Refining ---- */
  async function refining({ enchants = [0, 1, 2], daily = 0 } = {}) {
    const ids = [];
    for (const r of ABP.RESOURCES) for (let t = 4; t <= 8; t++) for (const e of enchants) {
      ids.push(`T${t}_${r.raw}${e ? `_LEVEL${e}@${e}` : ""}`, `T${t}_${r.refined}${e ? `_LEVEL${e}@${e}` : ""}`);
      ids.push(`T${t - 1}_${r.refined}${e && t > 4 ? `_LEVEL${e}@${e}` : ""}`);
    }
    const idx = ABP.api.index(await ABP.api.prices(ids, ABP.CITIES));
    const b = (bonus, focus) => { const x = 0.18 + (bonus ? 0.4 : 0) + (focus ? 0.59 : 0) + daily; return x / (1 + x); };
    const rF = b(true, true), rNo = b(true, false);
    const rows = [];
    for (const r of ABP.RESOURCES) for (let t = 4; t <= 8; t++) for (const e of enchants) {
      const city = r.city;
      const rawId = `T${t}_${r.raw}${e ? `_LEVEL${e}@${e}` : ""}`;
      const outId = `T${t}_${r.refined}${e ? `_LEVEL${e}@${e}` : ""}`;
      const prevId = `T${t - 1}_${r.refined}${e && t > 4 ? `_LEVEL${e}@${e}` : ""}`;
      const pick = (id, mode) => {
        const x = idx[id]?.[city];
        if (mode === "buy") return x && fresh(x, "buyDate") && x.buy ? { p: x.buy * (1 + F().setupFee), how: "a buy order", date: x.buyDate } : x && fresh(x) && x.sell ? { p: x.sell, how: "instant buy", date: x.sellDate } : null;
        return x && fresh(x) && x.sell ? { p: x.sell, date: x.sellDate } : null;
      };
      const raw = pick(rawId, "buy"), prev = pick(prevId, "buy"), out = pick(outId, "sell");
      if (!raw || !prev || !out) continue;
      const k = ABP.REFINE_RAW[t];
      const input = k * raw.p + prev.p;
      const net = out.p * keepOrder();
      const pF = net - input * (1 - rF), pNo = net - input * (1 - rNo);
      const eff = ABP.refineEfficiency(ABP.spec.refine[r.key], t);
      const fc = ABP.focusCost(ABP.REFINE_FOCUS[t][e], eff);
      rows.push({ res: r, t, e, city, k, rawId, outId, prevId, raw, prev, out, input, net, pF, pNo, eff, fc, spf: (pF - Math.max(0, pNo)) / fc, margin: pF / (input * (1 - rF)) });
    }
    rows.sort((a, b) => b.spf - a.spf);
    const top = rows.slice(0, 40);
    try {
      const byCity = {};
      top.forEach((x) => (byCity[x.city] = byCity[x.city] || []).push(x.outId));
      const vols = await Promise.all(Object.entries(byCity).map(([c, list]) => ABP.api.volumes(list, [c])));
      const vol = Object.assign({}, ...vols);
      top.forEach((x) => { x.perDay = vol[x.outId]?.[x.city]?.perDay ?? null; });
    } catch (e) { /* no volume */ }
    const scored = rows.map((x) => {
      const perFocus = 10000 / x.fc;
      const cap = x.perDay == null ? perFocus * 0.3 : Math.min(perFocus, x.perDay * 0.5);
      return { ...x, perFocus, refines: cap, score: cap * (x.pF - Math.max(0, x.pNo)) };
    }).filter((x) => x.pF > 0);
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((x) => {
      const label = `T${x.t}${x.e ? "." + x.e : ""} ${x.res.refinedName}`;
      x.label = label;
      x.reasons = [
        `In ${x.city} (the ${x.res.refinedName} bonus city) each refine takes ${x.k} T${x.t}${x.e ? "." + x.e : ""} ${x.res.rawName} at ${n(x.raw.p)} by ${x.raw.how} and 1 T${x.t - 1}${x.e && x.t > 4 ? "." + x.e : ""} ${x.res.refinedName} at ${n(x.prev.p)}, so ${n(x.input)} of material.`,
        `With focus ${pct(rF)} of that comes back, so a refine really costs ${n(x.input * (1 - rF))}. ${label} sells for ${n(x.out.p)} (${age(x.out.date)}); you keep ${n(x.net)}, a profit of ${n(x.pF)} (${pct(x.margin)} on cost).`,
        `Your ${x.res.refinedName} spec gives ${n(x.eff)} focus efficiency at T${x.t}, so one refine costs ${x.fc.toFixed(1)} focus and 10,000 focus covers ${n(x.perFocus)} refines.`,
        x.pNo > 0 ? `It makes ${n(x.pNo)} per refine even without focus, so focus only adds ${n(x.pF - x.pNo)} each: ${x.spf.toFixed(1)} silver per focus point. Keep refining it after your focus runs out.` : `Without focus it loses ${n(-x.pNo)} per refine, so focus is what makes it pay: ${x.spf.toFixed(1)} silver per focus point. Refine only as much as your focus covers.`,
        x.perDay == null ? `No sales history came back, so the ranking assumes you can sell ${n(x.refines)} a day. Check the market before you buy big.` : x.perDay * 0.5 < x.perFocus ? `Only ${n(x.perDay)} sell per day in ${x.city}, so the ranking counts ${n(x.refines)} refines a day (half the market), worth ${short(x.score)} of focus value.` : `${n(x.perDay)} sell per day in ${x.city}, enough for all ${n(x.perFocus)} refines. Your daily focus is worth about ${short(x.score)} here.`,
        x.t >= 6 && x.eff < 5000 ? `Your T${x.t} spec is low, so focus is expensive here. Each 10 levels in T${x.t} cuts its focus cost by about 18%.` : `Leveling T${x.t} further keeps cutting the focus cost: every 40 levels in this tier halves it.`,
      ];
    });
    return { rows: scored, rF, rNo };
  }

  /* ---- Black Market ---- */
  async function blackMarket({ tiers = [4, 5, 6, 7, 8], enchants = [0, 1, 2], quality = 1 } = {}) {
    const ids = [];
    for (const t of tiers) for (const e of enchants) for (const [b] of ABP.BM_GEAR) ids.push(`T${t}_${b}${e ? "@" + e : ""}`);
    const idx = ABP.api.index(await ABP.api.prices(ids, [...ABP.CITIES, ABP.BM], [quality]));
    const names = Object.fromEntries(ABP.BM_GEAR);
    let rows = [];
    for (const id of ids) {
      const bm = idx[id]?.[ABP.BM];
      if (!bm?.buy || !fresh(bm, "buyDate") || ageH(bm.buyDate) > 12) continue;
      const src = cheapest(idx[id], ABP.CITIES);
      if (!src) continue;
      const keep = bm.buy * (1 - F().salesTaxPremium);
      const profit = keep - src.sell;
      if (profit <= 0) continue;
      const m = id.match(/^T(\d)_(.+?)(?:@(\d))?$/);
      rows.push({ id, label: `T${m[1]}${m[3] ? "." + m[3] : ""} ${names[m[2]] || m[2]}`, bm, src, keep, profit, margin: profit / src.sell });
    }
    rows.sort((a, b) => b.profit - a.profit);
    rows = rows.slice(0, 20);
    try {
      const vol = await ABP.api.volumes(rows.map((r) => r.id), [ABP.BM], quality);
      rows.forEach((r) => { r.perDay = vol[r.id]?.[ABP.BM]?.perDay ?? null; });
    } catch (e) { /* no volume */ }
    rows.forEach((r) => { r.daily = r.profit * Math.min(r.perDay ?? 1, 10); });
    rows.sort((a, b) => b.daily - a.daily);
    rows.forEach((r) => {
      r.reasons = [
        `The Black Market buy order is ${n(r.bm.buy)} (${age(r.bm.buyDate)}). After the 4% tax you keep ${n(r.keep)}.`,
        `The cheapest listing is ${n(r.src.sell)} in ${r.src.city} (${age(r.src.sellDate)}), so each flip makes ${n(r.profit)} (${pct(r.margin)}).`,
        r.perDay == null ? `No Black Market sales history came back; sell one first to confirm the order fills.` : r.perDay >= 5 ? `The Black Market bought about ${n(r.perDay)} a day this week, so it is a steady buyer.` : `The Black Market bought only about ${r.perDay.toFixed(1)} a day this week. Take a few at a time; its order disappears once it is stocked.`,
        r.src.city === "Caerleon" ? `Both ends are in Caerleon, so there is no hauling risk.` : `${r.src.city} to Caerleon crosses red zones. Carry only what you can afford to lose, or wait for a Caerleon listing.`,
      ];
    });
    return { rows };
  }

  /* ---- Journals ---- */
  async function journals() {
    const ids = [];
    for (const j of ABP.JOURNALS) for (let t = 3; t <= 8; t++) ids.push(`T${t}_JOURNAL_${j.key}_EMPTY`, `T${t}_JOURNAL_${j.key}_FULL`);
    const idx = ABP.api.index(await ABP.api.prices(ids, ABP.CITIES));
    let rows = [];
    for (const j of ABP.JOURNALS) for (let t = 3; t <= 8; t++) {
      const empty = cheapest(idx[`T${t}_JOURNAL_${j.key}_EMPTY`], ABP.CITIES);
      const full = dearest(idx[`T${t}_JOURNAL_${j.key}_FULL`], ABP.CITIES);
      if (!empty || !full) continue;
      const keep = full.sell * keepOrder();
      const profit = keep - empty.sell;
      rows.push({ j, t, id: `T${t}_JOURNAL_${j.key}_FULL`, label: `T${t} ${j.labourer} journal`, empty, full, keep, profit });
    }
    rows.sort((a, b) => b.profit - a.profit);
    rows = rows.slice(0, 15);
    try {
      const byCity = {};
      rows.forEach((r) => (byCity[r.full.city] = byCity[r.full.city] || []).push(r.id));
      const vols = await Promise.all(Object.entries(byCity).map(([c, list]) => ABP.api.volumes(list, [c])));
      const vol = Object.assign({}, ...vols);
      rows.forEach((r) => { r.perDay = vol[r.id]?.[r.full.city]?.perDay ?? null; });
    } catch (e) { /* no volume */ }
    rows.forEach((r) => { r.score = r.profit * Math.min(1, (r.perDay ?? 3) / 3); });
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r) => {
      r.reasons = [
        `An empty one costs ${n(r.empty.sell)} in ${r.empty.city}. A full one sells for ${n(r.full.sell)} in ${r.full.city} (${age(r.full.sellDate)}), so you keep ${n(r.profit)} per journal after fees.`,
        `It fills while you are ${r.j.activity}, so carry it whenever you do that anyway: the profit is on top of your normal income.`,
        r.perDay == null ? `No sales history came back; list one before filling many.` : `About ${r.perDay.toFixed(1)} full ones sell per day in ${r.full.city}.`,
        `Or hand it to a ${r.j.labourer} on your island, who returns materials worth more than the journal when your house and furniture keep them happy.`,
      ];
    });
    return { rows };
  }


  /* ---- Order flips in one city ---- */
  async function flips() {
    const ids = [];
    for (const r of ABP.RESOURCES) for (let t = 4; t <= 8; t++) for (const e of [0, 1, 2]) {
      ids.push(`T${t}_${r.refined}${e ? `_LEVEL${e}@${e}` : ""}`, `T${t}_${r.raw}${e ? `_LEVEL${e}@${e}` : ""}`);
    }
    ABP.CROPS.concat(ABP.HERBS).forEach((c) => ids.push(c.crop));
    for (const t of [4, 5, 6]) for (const [b] of ABP.BM_GEAR) ids.push(`T${t}_${b}`);
    const rows0 = await ABP.api.prices(ids, ABP.CITIES);
    let rows = [];
    for (const x of rows0) {
      if (!x.sell || !x.buy || !fresh(x) || !fresh(x, "buyDate")) continue;
      const cost = x.buy * (1 + F().setupFee);
      const keep = x.sell * keepOrder();
      const profit = keep - cost;
      if (profit <= 0 || x.sell > x.buy * 3) continue; /* a 3x gap is almost always a stale or troll listing */
      rows.push({ id: x.id, city: x.city, buy: x.buy, sell: x.sell, cost, keep, profit, margin: profit / cost, date: x.sellDate });
    }
    rows.sort((a, b) => b.margin - a.margin);
    rows = rows.slice(0, 40);
    try {
      const byCity = {};
      rows.forEach((r) => (byCity[r.city] = byCity[r.city] || []).push(r.id));
      const vols = await Promise.all(Object.entries(byCity).map(([c, list]) => ABP.api.volumes(list, [c]).then((v) => [c, v])));
      const vol = Object.fromEntries(vols);
      rows.forEach((r) => { r.perDay = vol[r.city]?.[r.id]?.[r.city]?.perDay ?? null; });
    } catch (e) { /* no volume */ }
    rows = rows.filter((r) => r.perDay == null || r.perDay >= 5);
    rows.forEach((r) => { r.daily = r.profit * Math.max(1, (r.perDay ?? 5) * 0.2); });
    rows.sort((a, b) => b.daily - a.daily);
    rows.forEach((r) => {
      r.label = itemName(r.id);
      r.reasons = [
        `In ${r.city} the top buy order is ${n(r.buy)} and the cheapest listing is ${n(r.sell)} (${age(r.date)}).`,
        `Buying through an order costs ${n(r.cost)} with the 2.5% fee; selling through an order keeps ${n(r.keep)} after tax and fee. That is ${n(r.profit)} per item (${pct(r.margin)}).`,
        r.perDay == null ? `No sales history came back; start with a small order.` : `About ${n(r.perDay)} sell per day there. If you take a fifth of that, it is worth about ${short(r.daily)} a day.`,
        `Your orders sit in one city, so there is no travel and no risk beyond being undercut. Re-check them two or three times a day.`,
      ];
    });
    return { rows };
  }
  function itemName(id) {
    const m = id.match(/^T(\d)_(.+?)(?:_LEVEL\d)?(?:@(\d))?$/);
    if (!m) return id;
    const res = ABP.RESOURCES.find((r) => r.raw === m[2] || r.refined === m[2]);
    const crop = ABP.CROPS.concat(ABP.HERBS).find((c) => c.crop === id);
    const gear = ABP.BM_GEAR.find(([b]) => b === m[2]);
    const name = crop ? crop.name : res ? (res.raw === m[2] ? res.rawName : res.refinedName) : gear ? gear[1] : m[2];
    return `T${m[1]}${m[3] ? "." + m[3] : ""} ${name}`;
  }

  return { crops, refining, blackMarket, journals, flips, short, n, age };
})();
