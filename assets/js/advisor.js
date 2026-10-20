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
  /* Safe Options: only royal cities, reached through blue and yellow zones, so a trip can't cost you the load. */
  const UNSAFE = ["Caerleon", "Brecilien", "Black Market"];
  let safeOnly = false;
  const CITIES = () => (safeOnly ? ABP.CITIES.filter((c) => !UNSAFE.includes(c)) : ABP.CITIES);
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
  /* Orders often sit unfilled, so a selling price is only trusted up to what the item actually sold for on
     average over the last week in that market. Without sales history the order price stands, flagged. */
  const real = (price, avg) => (avg && avg < price ? avg : price);
  const soldNote = (price, avg, where, what = "listing") => avg == null
    ? `No sales came back for ${where} last week, so the ${n(price)} ${what} is unproven. Sell one first.`
    : avg < price
      ? `Last week it actually sold for ${n(avg)} on average in ${where}, below the ${n(price)} ${what}, so the numbers here use ${n(avg)}.`
      : `Last week it actually sold for ${n(avg)} on average in ${where}, at or above the ${n(price)} ${what}, so that price is realistic.`;

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
    const idx = ABP.api.index(await ABP.api.prices(list.flatMap((c) => [c.crop, c.seed]), CITIES()));
    const plants = plots * plantsPerPlot;
    const harvest = plants * perPlant;
    let rows = list.map((c) => {
      const sell = dearest(idx[c.crop], CITIES());
      const seed = cheapest(idx[c.seed], CITIES());
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
      r.avg = v?.avg ?? null;
      r.net = real(r.sell.sell, r.avg) * keepOrder();
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
        `${r.name} is listed at ${n(r.sell.sell)} in ${r.sell.city} (${age(r.sell.sellDate)}). ${soldNote(r.sell.sell, r.avg, r.sell.city)} After the 4% tax and 2.5% listing fee you keep ${n(r.net)} each.`,
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
    const idx = ABP.api.index(await ABP.api.prices(ids, CITIES()));
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
      top.forEach((x) => {
        const v = vol[x.outId]?.[x.city];
        x.perDay = v?.perDay ?? null;
        x.avg = v?.avg ?? null;
        x.net = real(x.out.p, x.avg) * keepOrder();
        x.pF = x.net - x.input * (1 - rF); x.pNo = x.net - x.input * (1 - rNo);
        x.spf = (x.pF - Math.max(0, x.pNo)) / x.fc; x.margin = x.pF / (x.input * (1 - rF));
      });
    } catch (e) { /* no volume */ }
    /* only the 40 best had their sales checked; the rest have no proof they sell */
    rows.splice(40);
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
        `With focus ${pct(rF)} of that comes back, so a refine really costs ${n(x.input * (1 - rF))}. ${label} is listed at ${n(x.out.p)} (${age(x.out.date)}). ${soldNote(x.out.p, x.avg, x.city)} You keep ${n(x.net)}, a profit of ${n(x.pF)} (${pct(x.margin)} on cost).`,
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
    const idx = ABP.api.index(await ABP.api.prices(ids, [...CITIES(), ABP.BM], [quality]));
    const names = Object.fromEntries(ABP.BM_GEAR);
    let rows = [];
    for (const id of ids) {
      const bm = idx[id]?.[ABP.BM];
      if (!bm?.buy || !fresh(bm, "buyDate") || ageH(bm.buyDate) > 12) continue;
      const src = cheapest(idx[id], CITIES());
      if (!src) continue;
      const keep = bm.buy * (1 - F().salesTaxPremium);
      const profit = keep - src.sell;
      if (profit <= 0) continue;
      const m = id.match(/^T(\d)_(.+?)(?:@(\d))?$/);
      rows.push({ id, label: `T${m[1]}${m[3] ? "." + m[3] : ""} ${names[m[2]] || m[2]}`, bm, src, keep, profit, margin: profit / src.sell });
    }
    rows.sort((a, b) => b.profit - a.profit);
    rows = rows.slice(0, 40);
    try {
      const vol = await ABP.api.volumes(rows.map((r) => r.id), [ABP.BM], quality);
      rows.forEach((r) => { const v = vol[r.id]?.[ABP.BM]; r.perDay = v?.perDay ?? null; r.avg = v?.avg ?? null; });
    } catch (e) { /* no volume */ }
    rows.forEach((r) => { r.keep = real(r.bm.buy, r.avg) * (1 - F().salesTaxPremium); r.profit = r.keep - r.src.sell; r.margin = r.profit / r.src.sell; });
    rows = rows.filter((r) => r.profit > 0).slice(0, 20);
    rows.forEach((r) => { r.daily = r.profit * Math.min(r.perDay ?? 1, 10); });
    rows.sort((a, b) => b.daily - a.daily);
    rows.forEach((r) => {
      r.reasons = [
        `The Black Market buy order is ${n(r.bm.buy)} (${age(r.bm.buyDate)}). ${soldNote(r.bm.buy, r.avg, "the Black Market", "order")} After the 4% tax you keep ${n(r.keep)}.`,
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
    const idx = ABP.api.index(await ABP.api.prices(ids, CITIES()));
    let rows = [];
    for (const j of ABP.JOURNALS) for (let t = 3; t <= 8; t++) {
      const empty = cheapest(idx[`T${t}_JOURNAL_${j.key}_EMPTY`], CITIES());
      const full = dearest(idx[`T${t}_JOURNAL_${j.key}_FULL`], CITIES());
      if (!empty || !full) continue;
      const keep = full.sell * keepOrder();
      const profit = keep - empty.sell;
      rows.push({ j, t, id: `T${t}_JOURNAL_${j.key}_FULL`, label: `T${t} ${j.labourer} journal`, empty, full, keep, profit });
    }
    rows.sort((a, b) => b.profit - a.profit);
    rows = rows.slice(0, 30);
    try {
      const byCity = {};
      rows.forEach((r) => (byCity[r.full.city] = byCity[r.full.city] || []).push(r.id));
      const vols = await Promise.all(Object.entries(byCity).map(([c, list]) => ABP.api.volumes(list, [c])));
      const vol = Object.assign({}, ...vols);
      rows.forEach((r) => { const v = vol[r.id]?.[r.full.city]; r.perDay = v?.perDay ?? null; r.avg = v?.avg ?? null; });
    } catch (e) { /* no volume */ }
    rows.forEach((r) => { r.keep = real(r.full.sell, r.avg) * keepOrder(); r.profit = r.keep - r.empty.sell; });
    rows = rows.filter((r) => r.profit > 0);
    rows.forEach((r) => { r.score = r.profit * Math.min(1, (r.perDay ?? 3) / 3); });
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r) => {
      r.reasons = [
        `An empty one costs ${n(r.empty.sell)} in ${r.empty.city}. A full one is listed at ${n(r.full.sell)} in ${r.full.city} (${age(r.full.sellDate)}). ${soldNote(r.full.sell, r.avg, r.full.city)} You keep ${n(r.profit)} per journal after fees.`,
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
    const rows0 = await ABP.api.prices(ids, CITIES());
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
    rows = rows.slice(0, 150);
    try {
      const byCity = {};
      rows.forEach((r) => (byCity[r.city] = byCity[r.city] || []).push(r.id));
      const vols = await Promise.all(Object.entries(byCity).map(([c, list]) => ABP.api.volumes(list, [c]).then((v) => [c, v])));
      const vol = Object.fromEntries(vols);
      rows.forEach((r) => { const v = vol[r.city]?.[r.id]?.[r.city]; r.perDay = v?.perDay ?? null; r.avg = v?.avg ?? null; });
    } catch (e) { /* no volume */ }
    /* Trades happen between the buy order and the listing. When the average sale sits below the listing, relisting
       only fills near that average; when it sits below the buy order, sellers aren't reaching the order either. */
    rows.forEach((r) => {
      r.keep = real(r.sell, r.avg) * keepOrder();
      r.profit = r.keep - r.cost; r.margin = r.profit / r.cost;
      r.dead = r.avg != null && r.avg < r.buy;
    });
    rows = rows.filter((r) => r.profit > 0 && !r.dead && (r.perDay == null || r.perDay >= 5));
    rows.forEach((r) => { r.daily = r.profit * Math.max(1, (r.perDay ?? 5) * 0.2); });
    rows.sort((a, b) => b.daily - a.daily);
    rows.forEach((r) => {
      r.label = itemName(r.id);
      r.reasons = [
        `In ${r.city} the top buy order is ${n(r.buy)} and the cheapest listing is ${n(r.sell)} (${age(r.date)}).`,
        soldNote(r.sell, r.avg, r.city),
        `Buying through an order costs ${n(r.cost)} with the 2.5% fee; relisting keeps ${n(r.keep)} after tax and fee. That is ${n(r.profit)} per item (${pct(r.margin)}).`,
        r.perDay == null ? `No sales history came back; start with a small order.` : `About ${n(r.perDay)} sell per day there. If you take a fifth of that, it is worth about ${short(r.daily)} a day.`,
        `Your orders sit in one city, so there is no travel and no risk beyond being undercut. Re-check them two or three times a day.`,
      ];
    });
    return { rows };
  }
  /* ---- Safe daily amount: how much more you can buy or sell a day before you move the price ----
     Uses up to four weeks of daily sales for one item in one market.
     1. Normal and slow days: the median and the 25th-percentile daily volume.
     2. Price sensitivity: on days when more than usual sold, how far did the price sit from its own
        7-day trend? A log-log fit gives "1% more volume moves the price b%". When that is clearly
        negative (beyond twice its standard error) we solve for the extra volume that would cost you
        the allowed drop (3%, or half your margin if smaller).
     3. Without a clear measured effect we fall back to a share of a slow day, smaller when daily
        volume swings a lot, because a jumpy market has less room to absorb you. */
  function safeDaily(points, { margin = null, maxDrop = 0.03 } = {}) {
    const days = points.filter((p) => p.count > 0 && p.price > 0);
    if (days.length < 5) return { ok: false, days: days.length };
    const vols = days.map((d) => d.count).sort((a, b) => a - b);
    const q = (f) => vols[Math.min(vols.length - 1, Math.floor(f * (vols.length - 1) + 0.5))];
    const med = q(0.5), low = q(0.25);
    const mean = vols.reduce((a, v) => a + v, 0) / vols.length;
    const cv = Math.sqrt(vols.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, vols.length - 1)) / mean;
    /* price vs its own centred 7-day median, so a market drifting up or down doesn't count as a volume effect */
    const xs = [], ys = [];
    days.forEach((d, i) => {
      const win = days.slice(Math.max(0, i - 3), i + 4).map((x) => x.price).sort((a, b) => a - b);
      const ref = win[Math.floor(win.length / 2)];
      xs.push(Math.log(d.count / med)); ys.push(Math.log(d.price / ref));
    });
    const n = xs.length, mx = xs.reduce((a, x) => a + x, 0) / n, my = ys.reduce((a, y) => a + y, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    let beta = null, se = null;
    if (sxx > 1e-9 && n >= 7) {
      beta = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
      const resid = ys.reduce((a, y, i) => a + (y - my - beta * (xs[i] - mx)) ** 2, 0);
      se = Math.sqrt(resid / (n - 2) / sxx);
    }
    const drop = Math.max(0.005, Math.min(maxDrop, margin != null && margin > 0 ? margin / 2 : maxDrop));
    const measured = beta != null && beta < 0 && -beta > 2 * se;
    const share = cv < 0.35 ? 0.25 : cv < 0.7 ? 0.15 : 0.1;
    const shareCap = share * low;
    let safe, method;
    if (measured) {
      const extra = med * (Math.exp(Math.log(1 - drop) / beta) - 1);
      safe = Math.min(extra, 0.5 * med); method = "measured";
    } else { safe = shareCap; method = "share"; }
    /* falling prices over the period mean supply already outruns demand: halve the room */
    const first = days.slice(0, Math.min(7, days.length)), last = days.slice(-Math.min(7, days.length));
    const avgP = (arr) => arr.reduce((a, d) => a + d.price * d.count, 0) / arr.reduce((a, d) => a + d.count, 0);
    const trend = avgP(last) / avgP(first) - 1;
    const weeks = Math.max(1, (days[days.length - 1].t - days[0].t) / (7 * 864e5));
    const weekly = trend / weeks;
    if (weekly < -0.05) safe /= 2;
    return { ok: true, days: n, med, low, mean, cv, beta, se, measured, drop, share, safe: Math.max(med >= 1 ? 1 : 0, Math.floor(safe)), method, weekly, price: avgP(last) };
  }
  function safeReasons(s, where) {
    if (!s.ok) return [`Only ${s.days} days with sales in ${where}, which is too little to judge. Sell one or two and watch.`];
    const r = [`Over ${s.days} days with sales in ${where}, a normal day sells ${n(s.med)} and a slow day ${n(s.low)}.`];
    if (s.measured) r.push(`Measured price pressure: on days 10% busier than usual the price sat ${(-(Math.pow(1.1, s.beta) - 1) * 100).toFixed(1)}% lower. Keeping your extra amount under ${n(s.safe)} a day holds that drop to at most ${(s.drop * 100).toFixed(1)}%.`);
    else r.push(`Busier days didn't clearly move the price${s.beta != null ? " (the effect stayed inside the noise)" : ""}, so the cap is ${Math.round(s.share * 100)}% of a slow day: daily volume ${s.cv < 0.35 ? "is steady" : s.cv < 0.7 ? "swings a fair bit" : "swings a lot"}, so ${s.cv < 0.35 ? "the market has room" : "leave more room"}.`);
    if (s.weekly < -0.05) r.push(`The price fell about ${Math.round(-s.weekly * 100)}% a week over this period, so supply already outruns demand; the cap is halved.`);
    else if (s.weekly > 0.05) r.push(`The price rose about ${Math.round(s.weekly * 100)}% a week, so demand is growing; the cap is still kept cautious.`);
    return r;
  }

  /* ---- Hidden gems: big margins on things that sell only a few a day ----
     They won't scale, but each one pays. Every gem must have sold at least 3 in the last week at or
     near the price used (so it is not a fantasy listing) and use prices under 24 hours old. */
  async function gems() {
    const gearIds = [];
    for (const t of [4, 5, 6, 7, 8]) for (const e of [0, 1, 2]) for (const [b] of ABP.BM_GEAR) gearIds.push(`T${t}_${b}${e ? "@" + e : ""}`);
    const resIds = [];
    for (const r of ABP.RESOURCES) for (let t = 4; t <= 8; t++) for (const e of [0, 1, 2]) resIds.push(`T${t}_${r.refined}${e ? `_LEVEL${e}@${e}` : ""}`);
    ABP.CROPS.concat(ABP.HERBS).forEach((c) => resIds.push(c.crop));
    const ids = gearIds.concat(resIds);
    const idx = ABP.api.index(await ABP.api.prices(ids, [...CITIES(), ABP.BM]));
    const young = (iso) => iso && ageH(iso) <= 24;
    const cand = [];
    for (const id of ids) {
      const by = idx[id]; if (!by) continue;
      /* same-city order flip */
      for (const c of CITIES()) {
        const x = by[c]; if (!x?.sell || !x.buy || !young(x.sellDate) || !young(x.buyDate) || x.sell > x.buy * 3) continue;
        const cost = x.buy * (1 + F().setupFee), keep = x.sell * keepOrder(), profit = keep - cost;
        if (profit / cost >= 0.15) cand.push({ kind: "Order flip", id, buyCity: c, sellCity: c, buyHow: "a buy order", sellHow: "a sell order", cost, keep, ref: x.sell, profit, margin: profit / cost, date: x.sellDate });
      }
      /* Black Market: instant buy in a city, sell into the BM order */
      const bm = by[ABP.BM];
      if (!safeOnly && bm?.buy && young(bm.buyDate)) {
        const src = cheapest(by, CITIES());
        if (src && young(src.sellDate)) {
          const keep = bm.buy * (1 - F().salesTaxPremium), profit = keep - src.sell;
          if (profit / src.sell >= 0.15 && bm.buy < src.sell * 3) cand.push({ kind: "Black Market", id, buyCity: src.city, sellCity: ABP.BM, buyHow: "instant buy", sellHow: "the Black Market order", cost: src.sell, keep, ref: bm.buy, profit, margin: profit / src.sell, date: bm.buyDate });
        }
      }
      /* city to city: instant buy where cheapest, list where dearest */
      const lo = cheapest(by, CITIES()), hi = dearest(by, CITIES());
      if (lo && hi && lo.city !== hi.city && young(lo.sellDate) && young(hi.sellDate) && hi.sell < lo.sell * 3) {
        const keep = hi.sell * keepOrder(), profit = keep - lo.sell;
        if (profit / lo.sell >= 0.2) cand.push({ kind: "City to city", id, buyCity: lo.city, sellCity: hi.city, buyHow: "instant buy", sellHow: "a sell order", cost: lo.sell, keep, ref: hi.sell, profit, margin: profit / lo.sell, date: hi.sellDate });
      }
    }
    cand.sort((a, b) => b.profit - a.profit);
    let rows = cand.slice(0, 150);
    const byCity = {};
    rows.forEach((r) => (byCity[r.sellCity] = byCity[r.sellCity] || new Set()).add(r.id));
    const vols = Object.fromEntries(await Promise.all(Object.entries(byCity).map(([c, set]) => ABP.api.volumes([...set], [c]).then((v) => [c, v]).catch(() => [c, {}]))));
    rows.forEach((r) => { const v = vols[r.sellCity]?.[r.id]?.[r.sellCity]; r.sold = v?.sold ?? 0; r.perDay = v?.perDay ?? 0; r.avg = v?.avg ?? null; });
    /* keep only the low-volume, proven ones: sold 3+ last week, under 5 a day, average sale at least 85% of the price used */
    rows = rows.filter((r) => r.sold >= 3 && r.perDay < 5 && r.avg && r.avg >= r.ref * 0.85);
    /* price the sale at the average it really sold for when that is below the order or listing */
    rows.forEach((r) => {
      r.keep = real(r.ref, r.avg) * (r.sellCity === ABP.BM ? 1 - F().salesTaxPremium : keepOrder());
      r.profit = r.keep - r.cost; r.margin = r.profit / r.cost;
    });
    rows = rows.filter((r) => r.margin >= 0.15);
    const seen = new Set();
    rows = rows.filter((r) => { const k = r.id + r.kind; if (seen.has(k)) return false; seen.add(k); return true; });
    rows.forEach((r) => { r.take = Math.max(1, Math.floor(r.perDay * 0.3)); r.daily = r.profit * r.take; r.label = itemName(r.id); r.strong = r.margin >= (r.kind === "City to city" ? 0.3 : 0.25); });
    /* full-size gems first; smaller-margin ones (15% or 20% between cities) only fill the list up */
    rows.sort((a, b) => (b.strong - a.strong) || (b.daily - a.daily));
    rows = rows.slice(0, 20);
    rows.forEach((r) => {
      r.reasons = [
        `${r.kind === "Order flip" ? `In ${r.buyCity}, buy with ${r.buyHow} at ${n(r.cost)} (fee included) and relist` : `Instant-buy it in ${r.buyCity} for ${n(r.cost)} and ${r.sellCity === ABP.BM ? "sell it into the Black Market order" : `list it in ${r.sellCity}`}`}: you keep ${n(r.keep)}, so ${n(r.profit)} each (${pct(r.margin)}).`,
        `Proof it works: ${n(r.sold)} sold in ${r.sellCity} over the last week, at an average of ${n(r.avg)}, against the ${n(r.ref)} ${r.sellCity === ABP.BM ? "order" : "listing"} (${age(r.date)}). The profit uses ${n(real(r.ref, r.avg))}, whichever is lower.`,
        `Only about ${r.perDay.toFixed(1)} sell a day, so this doesn't scale: plan on ${r.take} a day${r.take === 1 ? " at most" : ""}, worth about ${short(r.daily)}. Do more and you become the market.`,
        ...(r.strong ? [] : [`Its margin is under the usual gem bar, shown to fill the list; it still has proven sales.`]),
        r.buyCity !== r.sellCity && [r.buyCity, r.sellCity].some((c) => c === "Caerleon" || c === ABP.BM || c === "Brecilien") ? `The trip crosses red or black zones. Carry only what you can lose.` : r.buyCity !== r.sellCity ? `${r.buyCity} to ${r.sellCity} is through safe zones.` : `No travel: both orders sit in ${r.buyCity}.`,
      ];
    });
    return { rows };
  }

  /* ---- Safe hauls between royal cities: the Safe Options stand-in for Black Market flips ---- */
  async function royalHauls() {
    const ids = [];
    for (const t of [4, 5, 6, 7, 8]) for (const e of [0, 1, 2]) for (const [b] of ABP.BM_GEAR) ids.push(`T${t}_${b}${e ? "@" + e : ""}`);
    for (const r of ABP.RESOURCES) for (let t = 4; t <= 8; t++) for (const e of [0, 1, 2]) ids.push(`T${t}_${r.refined}${e ? `_LEVEL${e}@${e}` : ""}`);
    const cities = ABP.CITIES.filter((c) => !UNSAFE.includes(c));
    const idx = ABP.api.index(await ABP.api.prices(ids, cities));
    let rows = [];
    for (const id of ids) {
      const lo = cheapest(idx[id], cities), hi = dearest(idx[id], cities);
      if (!lo || !hi || lo.city === hi.city || hi.sell > lo.sell * 3) continue;
      const keep = hi.sell * keepOrder(), profit = keep - lo.sell;
      if (profit / lo.sell < 0.08) continue;
      rows.push({ id, src: lo, dst: hi, keep, profit, margin: profit / lo.sell });
    }
    rows.sort((a, b) => b.profit - a.profit);
    rows = rows.slice(0, 80);
    try {
      const byCity = {};
      rows.forEach((r) => (byCity[r.dst.city] = byCity[r.dst.city] || new Set()).add(r.id));
      const vols = Object.fromEntries(await Promise.all(Object.entries(byCity).map(([c, set]) => ABP.api.volumes([...set], [c]).then((v) => [c, v]))));
      rows.forEach((r) => { const v = vols[r.dst.city]?.[r.id]?.[r.dst.city]; r.perDay = v?.perDay ?? null; r.avg = v?.avg ?? null; });
    } catch (e) { /* no volume */ }
    rows.forEach((r) => { r.keep = real(r.dst.sell, r.avg) * keepOrder(); r.profit = r.keep - r.src.sell; r.margin = r.profit / r.src.sell; });
    rows = rows.filter((r) => r.margin >= 0.08 && (r.perDay == null || r.perDay >= 1));
    rows.forEach((r) => { r.take = Math.max(1, Math.floor((r.perDay ?? 2) * 0.2)); r.daily = r.profit * r.take; r.label = itemName(r.id); });
    rows.sort((a, b) => b.daily - a.daily);
    rows.forEach((r) => {
      r.reasons = [
        `Instant-buy it in ${r.src.city} for ${n(r.src.sell)} (${age(r.src.sellDate)}) and list it in ${r.dst.city}, where the cheapest listing is ${n(r.dst.sell)} (${age(r.dst.sellDate)}). ${soldNote(r.dst.sell, r.avg, r.dst.city)} After tax and listing fee you keep ${n(r.keep)}: ${n(r.profit)} each (${pct(r.margin)}).`,
        r.perDay == null ? `No sales history came back for ${r.dst.city}; list one before you carry more.` : `About ${r.perDay.toFixed(1)} sell a day in ${r.dst.city}; taking a fifth of that is about ${r.take} a day, worth ${short(r.daily)}.`,
        `${r.src.city} to ${r.dst.city} runs through blue and yellow zones only, so you can't lose the load on the way.`,
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

  return { crops, refining, blackMarket, journals, flips, gems, royalHauls, safeDaily, safeReasons, itemName, short, n, age, UNSAFE,
    get safeOnly() { return safeOnly; }, set safeOnly(v) { safeOnly = !!v; } };
})();
