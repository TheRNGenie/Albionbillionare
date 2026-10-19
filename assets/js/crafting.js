/* Albion Billionaire: the Crafting tab's category report.
   The player picks a category (swords, leather jackets, ...). Every item in it, T4 to T8 at every enchant,
   is priced from the last four weeks of daily market history, crafted in its bonus city, and run through
   the same daily routine as the leather jacket study: 10,000 focus on the crafts focus helps most, then the
   material budget on no-focus crafts with the best return, never selling more than the safe daily amount. */
window.ABP = window.ABP || {};

ABP.crafting = (() => {
  const ROYAL = ["Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford"];
  const RISKY = ["Caerleon", "Brecilien", "Black Market"];
  /* The royal cities in ring order: each one borders the next through blue and yellow zones. */
  const RING = ["Thetford", "Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock"];
  /* Pack mounts at Excellent quality (albiononlinegrind's table; the ratios match maxload in Albion's spells.json).
     No Transport Mammoth: the plans are sized for one ox or Direbear. */
  const MOUNTS = [
    { id: "ox8", name: "Elder's Transport Ox (T8)", kg: 3657 },
    { id: "bear8", name: "Saddled Direbear (T8)", kg: 3090 },
    { id: "ox7", name: "Grandmaster's Transport Ox (T7)", kg: 3058 },
    { id: "ox6", name: "Master's Transport Ox (T6)", kg: 2577 },
    { id: "ox5", name: "Expert's Transport Ox (T5)", kg: 2204 },
  ];
  /* Elder's Transport Mammoth: spells.json gives it maxload 113.86 against the Elder's ox's 16.18, so at the same
     Excellent-quality scale it carries 113.86 / 16.18 × 3,657 ≈ 25,730 kg. Chosen with its own checkbox. */
  const MAMMOTH = { id: "mammoth8", name: "Elder's Transport Mammoth (T8)", kg: Math.round(113.86 / 16.18 * 3657) };
  const STATION = 0.02; /* station fee allowance on crafts, as a share of the sale price */
  const REFINE_STATION = 0.01;
  const DAYS = 28;
  const MIN_MARGIN = 0.03; /* skip crafts whose margin is inside the noise */
  const MAX_ITEMS = 8; /* different items in one day's plan, so the loop stays doable */
  const notArtifact = (b) => !/ARTEFACT|WEAPONMASTER|PROTOTYPE|_TOKEN/.test(b);

  const cat = (key, label, group) => ({ key, label, group, test: (b, c) => c === key && notArtifact(b) });
  const CATS = [
    cat("sword", "Swords", "Weapons"), cat("axe", "Axes", "Weapons"), cat("mace", "Maces", "Weapons"), cat("hammer", "Hammers", "Weapons"),
    cat("spear", "Spears", "Weapons"), cat("quarterstaff", "Quarterstaffs", "Weapons"), cat("dagger", "Daggers", "Weapons"),
    cat("knuckles", "War gloves", "Weapons"), cat("bow", "Bows", "Weapons"), cat("crossbow", "Crossbows", "Weapons"),
    cat("firestaff", "Fire staffs", "Weapons"), cat("froststaff", "Frost staffs", "Weapons"), cat("arcanestaff", "Arcane staffs", "Weapons"),
    cat("holystaff", "Holy staffs", "Weapons"), cat("naturestaff", "Nature staffs", "Weapons"), cat("cursestaff", "Cursed staffs", "Weapons"),
    cat("shapeshifterstaff", "Shapeshifter staffs", "Weapons"),
    cat("plate_armor", "Plate armor", "Armor"), cat("leather_armor", "Leather jackets", "Armor"), cat("cloth_armor", "Cloth robes", "Armor"),
    cat("plate_helmet", "Plate helmets", "Armor"), cat("leather_helmet", "Leather hoods", "Armor"), cat("cloth_helmet", "Cloth cowls", "Armor"),
    cat("plate_shoes", "Plate boots", "Armor"), cat("leather_shoes", "Leather shoes", "Armor"), cat("cloth_shoes", "Cloth sandals", "Armor"),
    cat("shieldtype", "Shields", "Off-hands"), cat("booktype", "Tomes", "Off-hands"), cat("torchtype", "Torches", "Off-hands"),
    { key: "bags", label: "Bags", group: "Accessories", test: (b, c) => c === "bags" || c === "satchels" },
    { key: "capes", label: "Capes", group: "Accessories", test: (b, c) => String(c).startsWith("accessoires_capes_") && notArtifact(b) },
    { key: "tools", label: "Gathering tools", group: "Gathering", test: (b) => /_2H_TOOL_/.test(b) && !/TRACKING/.test(b) },
    { key: "gatherer", label: "Gatherer gear", group: "Gathering", test: (b) => /_GATHERER_/.test(b) },
    { key: "potions", label: "Potions", group: "Consumables", test: (b, c) => c === "potions" && notArtifact(b) },
    { key: "food", label: "Food", group: "Consumables", test: (b, c) => c === "food" },
  ];
  const consumable = (k) => k === "potions" || k === "food";
  const tierOf = (id) => +(id.match(/^T(\d)/)?.[1] || 0);
  const enchOf = (id) => +(id.split("@")[1] || 0);
  const baseOf = (id) => id.split("@")[0];
  const refinedRes = (id) => ABP.RESOURCES.find((r) => new RegExp(`^T\\d_${r.refined}(_LEVEL\\d)?(@\\d)?$`).test(id));
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  function items(R, catKey) {
    const C = CATS.find((c) => c.key === catKey);
    if (!C) return [];
    return Object.keys(R.r).filter((id) => {
      const b = baseOf(id), t = tierOf(id), e = enchOf(id);
      if (!C.test(b, R.c[b])) return false;
      return consumable(catKey) ? t >= 2 && e <= 3 : t >= 4 && t <= 8 && e <= 4;
    });
  }

  /* Everything the report needs prices for: the items, their materials, and the raw inputs of any refined material. */
  function idsFor(R, keys) {
    const mats = new Set();
    for (const k of keys) for (const [m] of R.r[k][2]) {
      mats.add(m);
      if (refinedRes(m) && R.r[m]) for (const [x] of R.r[m][2]) mats.add(x);
    }
    return { items: keys, mats: [...mats] };
  }

  function analyse({ R, keys, hist, catKey, budgets = [5e6, 20e6], tiers = [8, 8, 8], focus = 10000, risky = false, now = Date.now() }) {
    const F = ABP.FEES, RET = ABP.RETURN;
    const stats = new Map();
    function stat(id, city) {
      const k = id + "|" + city;
      if (stats.has(k)) return stats.get(k);
      const pts = (hist[id]?.[city] || []).filter((p) => p.count > 0 && p.price > 0 && now - p.t <= DAYS * 864e5);
      let s = null;
      if (pts.length) {
        const w = [0, 1, 2, 3].map((i) => {
          const sl = pts.filter((p) => now - p.t > i * 7 * 864e5 && now - p.t <= (i + 1) * 7 * 864e5);
          const c = sum(sl, (p) => p.count);
          return c ? { price: sum(sl, (p) => p.price * p.count) / c, count: c } : null;
        });
        const wp = w.filter(Boolean).map((x) => x.price);
        const all = sum(pts, (p) => p.count);
        s = { pts, w, avg: sum(pts, (p) => p.price * p.count) / all, med: median(pts.map((p) => p.price)), lo: wp.length ? Math.min(...wp) : null, hi: wp.length ? Math.max(...wp) : null, perDay: all / DAYS };
      }
      stats.set(k, s);
      return s;
    }
    /* Cheapest royal city to buy a material in a given week (0 = last week), by average traded price. */
    const mp = new Map();
    function matPrice(id, wk = 0) {
      const k = id + "|" + wk;
      if (mp.has(k)) return mp.get(k);
      let best = null;
      for (const c of ROYAL) {
        const s = stat(id, c);
        const p = s?.w[wk]?.price;
        if (p && (!best || p < best.price)) best = { price: p, city: c };
      }
      /* no sales that week: fall back to last week, then to the four-week average */
      if (!best && wk) best = matPrice(id, 0);
      if (!best) for (const c of ROYAL) { const s = stat(id, c); if (s && (!best || s.avg < best.price)) best = { price: s.avg, city: c, old: true }; }
      mp.set(k, best);
      return best;
    }
    const craftPlace = (key, safe) => {
      const city = ABP.CRAFT_CITY[R.c[baseOf(key)]] || null;
      if (city && (!safe || !RISKY.includes(city))) return { city, rates: RET.craftBonus, bonus: true };
      return { city: null, rates: RET.city, bonus: false, skipped: city };
    };
    function econ(key, wk, safe, override) {
      const [fb, amt, mats] = R.r[key];
      const place = craftPlace(key, safe);
      const lines = mats.map(([m, n, noRet]) => ({ m, n, noRet, p: override?.[m] ? { price: override[m], city: "refined" } : matPrice(m, wk) }));
      if (lines.some((l) => !l.p)) return null;
      const cost = (rate) => sum(lines, (l) => l.p.price * l.n * (l.noRet ? 1 : 1 - rate)) / amt;
      return { place, lines, amt, fb, cost0: cost(place.rates.none), costF: cost(place.rates.focus), focusUnit: (spec) => ABP.focusCost(fb, spec * 310) / amt };
    }
    const feeOf = (city) => (city === "Black Market" ? F.salesTaxPremium : F.salesTaxPremium + F.setupFee) + STATION;
    const netOf = (price, city) => price * (1 - feeOf(city));

    function slots(safe) {
      const cities = safe ? ROYAL : ROYAL.concat(RISKY);
      const out = [];
      for (const key of keys) {
        const e = econ(key, 0, safe);
        if (!e) continue;
        for (const city of cities) {
          const st = stat(key, city);
          if (!st || !st.w[0]) continue;
          const price = st.w[0].price;
          const profitNo = netOf(price, city) - e.cost0, profitF = e.fb > 0 ? netOf(price, city) - e.costF : profitNo;
          const sd = ABP.advisor.safeDaily(st.pts, { margin: profitNo / price });
          const cap = sd.ok ? sd.safe : 0;
          if (cap < 1) continue;
          out.push({ key, city, price, cap, profitNo, profitF, e, st, sd });
        }
      }
      return out;
    }

    function plan(sl, spec, budget, safe, maxTier = 8) {
      /* only the tiers this stage has unlocked */
      sl = sl.filter((s) => tierOf(s.key) <= maxTier);
      const left = new Map(sl.map((s) => [s, s.cap]));
      let fLeft = focus, bLeft = budget;
      const rows = [];
      /* recipes with no focus cost (royal upgrades) gain nothing from focus */
      const focusC = sl.filter((s) => s.e.fb > 0 && s.profitF > 0 && s.profitF / s.price >= MIN_MARGIN)
        .map((s) => ({ s, fu: s.e.focusUnit(spec), gain: s.profitF - Math.max(0, s.profitNo) }))
        .map((x) => ({ ...x, per: x.gain / x.fu })).sort((a, b) => b.per - a.per);
      /* choose the day's items first: what each could add, given the caps, the focus and the budget */
      const pot = new Map();
      for (const s of sl) {
        const p = pot.get(s.key) || { no: 0, roi: 0, f: 0 };
        if (s.profitNo / s.price >= MIN_MARGIN && s.profitNo > 0) { p.no += s.profitNo * s.cap; p.roi = Math.max(p.roi, s.profitNo / s.e.cost0); }
        const fu = s.e.focusUnit(spec);
        if (s.e.fb > 0 && s.profitF > 0) p.f = Math.max(p.f, s.profitF * Math.min(s.cap, focus / fu, budget / s.e.costF));
        pot.set(s.key, p);
      }
      const picked = new Set([...pot].map(([k, p]) => [k, Math.max(Math.min(p.no, budget * p.roi), p.f)]).filter((x) => x[1] > 0)
        .sort((a, b) => b[1] - a[1]).slice(0, MAX_ITEMS).map((x) => x[0]));
      const room = (key) => picked.has(key);
      for (const { s, fu } of focusC) {
        const u = Math.floor(Math.min(left.get(s), fLeft / fu, bLeft / s.e.costF));
        if (u < 1 || !room(s.key)) continue;
        rows.push({ s, units: u, focus: true, each: s.profitF, cost: s.e.costF, fu });
        left.set(s, left.get(s) - u); fLeft -= u * fu; bLeft -= u * s.e.costF;
      }
      const noC = sl.filter((s) => s.profitNo > 0 && s.profitNo / s.price >= MIN_MARGIN).sort((a, b) => b.profitNo / b.e.cost0 - a.profitNo / a.e.cost0);
      /* fill the item list with the biggest earners first, then spend what's left of the budget on them by return */
      for (const s of noC) {
        const u = Math.floor(Math.min(left.get(s), bLeft / s.e.cost0));
        if (u < 1 || !picked.has(s.key)) continue;
        rows.push({ s, units: u, focus: false, each: s.profitNo, cost: s.e.cost0, fu: 0 });
        left.set(s, left.get(s) - u); bLeft -= u * s.e.cost0;
      }
      /* the same crafts, priced with each of the last four weeks */
      const weeks = [0, 1, 2, 3].map((wk) => {
        let tot = 0, seen = 0;
        for (const r of rows) {
          const e = econ(r.s.key, wk, safe);
          const pw = r.s.st.w[wk]?.price;
          if (!e || !pw) { tot += r.units * r.each; continue; }
          seen++;
          tot += r.units * (netOf(pw, r.s.city) - (r.focus ? e.costF : e.cost0));
        }
        return { tot, seen };
      });
      const profit = sum(rows, (r) => r.units * r.each);
      const fame = sum(rows, (r) => (r.units / r.s.e.amt) * sum(r.s.e.lines.filter((l) => !l.noRet), (l) => l.n) * (ABP.FAME.perResource[tierOf(r.s.key)] || 0) * ABP.FAME.premium);
      return { rows, profit, spent: budget - bLeft, focusUsed: focus - fLeft, weeks: weeks.map((w) => w.tot), worst: Math.min(...weeks.map((w) => w.tot)), med: median(weeks.map((w) => w.tot)), fame, spec, budget };
    }

    const STAGES = [
      { name: "Stage 1", range: "spec 0 to 30", spec: 15, budget: budgets[0], maxTier: tiers[0] },
      { name: "Stage 2", range: "spec 30 to 75", spec: 50, budget: budgets[1], maxTier: tiers[1] },
      { name: "Stage 3", range: "spec 75 to 100", spec: 90, budget: budgets[1], maxTier: tiers[2] },
    ];
    const royalSlots = slots(true);
    const riskySlots = risky ? slots(false) : null;
    const stages = STAGES.map((st) => ({ ...st, royal: plan(royalSlots, st.spec, st.budget, true, st.maxTier), risky: riskySlots ? plan(riskySlots, st.spec, st.budget, false, st.maxTier) : null }));

    /* Every item ranked by what it could add to a day, in its best royal city. */
    const byKey = {};
    for (const s of royalSlots) {
      const fu = s.e.focusUnit(50);
      const pot = Math.max(Math.max(0, s.profitNo) * s.cap, fu > 0 ? Math.max(0, s.profitF) * Math.min(s.cap, focus / fu) : 0);
      const weeksUp = [0, 1, 2, 3].filter((wk) => { const e = econ(s.key, wk, true), p = s.st.w[wk]?.price; return e && p && netOf(p, s.city) - e.cost0 > 0; }).length;
      const weeksSeen = [0, 1, 2, 3].filter((wk) => s.st.w[wk]).length;
      if (!byKey[s.key] || pot > byKey[s.key].pot) byKey[s.key] = { ...s, pot, perFocus: fu > 0 ? s.profitF / fu : null, weeksUp, weeksSeen };
    }
    const ranked = Object.values(byKey).sort((a, b) => b.pot - a.pot);
    const priced = keys.filter((k) => econ(k, 0, true));
    const noSales = priced.filter((k) => !ROYAL.some((c) => stat(k, c)?.w[0]));

    /* Tiers where nothing in the category paid without focus last week. */
    const seenTiers = [...new Set(royalSlots.map((s) => tierOf(s.key)))].sort();
    const focusOnlyTiers = seenTiers.filter((t) => royalSlots.filter((s) => tierOf(s.key) === t).every((s) => s.profitNo <= 0));

    /* Refining your own material: inputs bought in the cheapest royal city, refined without focus in the refining bonus city. */
    const usedMats = new Set();
    for (const st of stages) for (const r of st.royal.rows) for (const l of r.s.e.lines) usedMats.add(l.m);
    const refine = [];
    for (const m of usedMats) {
      const res = refinedRes(m);
      if (!res || !R.r[m]) continue;
      const own = (wk) => {
        const ins = R.r[m][2].map(([x, n]) => ({ x, n, p: matPrice(x, wk) }));
        if (ins.some((i) => !i.p)) return null;
        return { cost: sum(ins, (i) => i.p.price * i.n) * (1 - RET.refineBonus.none) * (1 + REFINE_STATION) / R.r[m][1], ins };
      };
      const o = own(0), b = matPrice(m, 0);
      if (!o || !b) continue;
      const wkUp = [0, 1, 2, 3].filter((wk) => { const ow = own(wk), bw = matPrice(m, wk); return ow && bw && ow.cost < bw.price; }).length;
      refine.push({ m, res, own: o.cost, ins: o.ins, buy: b.price, buyCity: b.city, saving: 1 - o.cost / b.price, wkUp });
    }
    refine.sort((a, b) => b.saving - a.saving);
    const ownPrice = Object.fromEntries(refine.filter((r) => r.saving > 0.05).map((r) => [r.m, r.own]));

    /* What a stage's crafts take: materials to buy, where, and their share of that market's sales. */
    function shopping(p) {
      const need = new Map();
      for (const r of p.rows) {
        const rate = r.focus ? r.s.e.place.rates.focus : r.s.e.place.rates.none;
        for (const l of r.s.e.lines) need.set(l.m, (need.get(l.m) || 0) + r.units * l.n * (l.noRet ? 1 : 1 - rate) / r.s.e.amt);
      }
      return [...need].map(([m, q]) => {
        const b = matPrice(m, 0), st = stat(m, b.city);
        const w = R.w[baseOf(m)] ?? R.w[baseOf(m).replace(/_LEVEL\d$/, "")] ?? 0;
        const ref = refine.find((x) => x.m === m && x.saving > 0.05);
        return { m, qty: Math.ceil(q), city: b.city, price: b.price, cost: q * b.price, share: st?.perDay ? q / st.perDay : null, kg: q * w, refine: ref ? { ...ref, inputs: ref.ins.map((i) => ({ x: i.x, qty: Math.ceil(q * i.n * (1 - RET.refineBonus.none) / R.r[m][1]), city: i.p.city, price: i.p.price })) } : null };
      }).sort((a, b) => b.cost - a.cost);
    }
    const kgOf = (key) => R.w[baseOf(key)] ?? 0;
    const wOf = (m) => R.w[baseOf(m)] ?? R.w[baseOf(m).replace(/_LEVEL\d$/, "")] ?? 0;
    const priceIn = (m, city) => stat(m, city)?.w[0]?.price || null;

    /* One stage's daily loop around the royal ring, sized to one mount.
       Everything on board is tracked leg by leg: jackets until they are sold, materials from where they are
       bought to where they are used, raw inputs to the refining city, refined output on to the crafting city.
       When the heaviest leg is over the mount's capacity, the loop gives up the cheapest weight first: buy a
       material in the crafting city instead of carrying it, or refine less of what saves the least per kilo and
       buy that ready-made. */
    function loop(P, cap = Infinity) {
      if (!P?.rows.length) return null;
      const shop = shopping(P);
      const craftCity = craftPlace(P.rows[0].s.key, true).city || (shop[0] && shop[0].city) || ROYAL[0];
      const perUnitIn = (m) => R.r[m][2].map(([x, n]) => {
        const q = n * (1 - RET.refineBonus.none) / R.r[m][1];
        const cheap = matPrice(x, 0);
        return { x, q, cheap };
      });
      const refinables = shop.filter((x) => x.refine).map((x) => {
        const city = x.refine.res.city;
        const ins = perUnitIn(x.m).map((i) => {
          /* refined inputs (the tier-below material) are bought in the refining city when it's within 5% of the cheapest */
          const here = priceIn(i.x, city);
          const at = refinedRes(i.x) && here && i.cheap && here <= i.cheap.price * 1.05 ? { city, price: here } : i.cheap;
          return { ...i, city: at.city, price: at.price };
        });
        /* bought ready-made instead: in the crafting or refining city, whichever is cheaper, so it adds no extra trip */
        const opts = [craftCity, city].map((c) => ({ city: c, price: priceIn(x.m, c) })).filter((o) => o.price);
        const ready = opts.sort((a, b) => a.price - b.price)[0] || { city: x.city, price: x.price };
        const own = sum(ins, (i) => i.q * i.price) * (1 + REFINE_STATION);
        return { m: x.m, qty: x.qty, city, ins, ready, own, saving: ready.price - own, share: x.share };
      });
      const plain = shop.filter((x) => !x.refine);

      /* sales: where each crafted item is sold */
      const sales = P.rows.map((r) => {
        /* break-even: what the craft cost, grossed up for market fees and the station fee */
        const floor = (r.focus ? r.s.e.costF : r.s.e.cost0) / (1 - feeOf(r.s.city));
        return { key: r.s.key, city: r.s.city, units: r.units, focus: r.focus, target: r.s.price, floor, kg: r.units * kgOf(r.s.key) };
      });
      const crafts = new Map();
      const valueOf = new Map();
      for (const r of P.rows) { const k = r.s.key + (r.focus ? "|f" : ""); crafts.set(k, { key: r.s.key, focus: r.focus, units: (crafts.get(k)?.units || 0) + r.units }); valueOf.set(r.s.key, Math.max(valueOf.get(r.s.key) || 0, r.s.price)); }

      function build(st, dir) {
        const need = new Set([craftCity]);
        for (const x of plain) need.add(st.atCraft.has(x.m) ? craftCity : x.city);
        for (const f of refinables) {
          const q = st.refine.get(f.m);
          if (q > 0) { need.add(f.city); f.ins.forEach((i) => need.add(i.city)); }
          if (q < f.qty) need.add(f.ready.city);
        }
        for (const s of sales) need.add(s.city);
        let ring = RING.filter((c) => need.has(c));
        const extra = [...need].filter((c) => !RING.includes(c));
        ring = ring.concat(extra);
        const i0 = ring.indexOf(craftCity);
        let order = ring.slice(i0).concat(ring.slice(0, i0));
        if (dir < 0) order = [order[0]].concat(order.slice(1).reverse());
        const k = order.length, pos = (c) => order.indexOf(c);
        const legs = order.map((c, i) => ({ from: c, to: order[(i + 1) % k], kg: 0 }));
        const carry = (from, to, kg) => { if (k < 2 || from === to || !kg) return; for (let i = pos(from); i !== pos(to); i = (i + 1) % k) legs[i].kg += kg; };
        const stops = new Map(order.map((c) => [c, { city: c, buy: [], input: [], refine: [], ready: [], craft: [], sell: [], raw: [], spend: 0, earn: 0, fee: 0 }]));
        const S = (c) => stops.get(c);
        for (const x of plain) {
          const city = st.atCraft.has(x.m) ? craftCity : x.city;
          const price = st.atCraft.has(x.m) ? priceIn(x.m, craftCity) : x.price;
          S(city).buy.push({ m: x.m, qty: x.qty, price, share: city === x.city ? x.share : null, max: buys.find((b) => b.m === x.m)?.max, forCraft: city === craftCity });
          carry(city, craftCity, x.qty * wOf(x.m));
        }
        for (const f of refinables) {
          const q = st.refine.get(f.m);
          if (q > 0) {
            S(f.city).refine.push({ m: f.m, qty: q, own: f.own, buy: f.ready.price });
            for (const i of f.ins) {
              const qty = Math.ceil(q * i.q);
              const raw = !refinedRes(i.x);
              const max = raw ? i.price + f.saving / i.q : null;
              (i.city === f.city && !raw ? S(f.city).input : S(i.city).raw).push({ m: i.x, qty, price: i.price, max, for: f.m });
              carry(i.city, f.city, qty * wOf(i.x));
            }
            carry(f.city, craftCity, q * wOf(f.m));
          }
          if (q < f.qty) {
            S(f.ready.city).ready.push({ m: f.m, qty: f.qty - q, price: f.ready.price, max: buys.find((b) => b.m === f.m)?.max });
            carry(f.ready.city, craftCity, (f.qty - q) * wOf(f.m));
          }
        }
        S(craftCity).craft.push(...[...crafts.values()].sort((a, b) => b.focus - a.focus));
        for (const s of sales) { S(s.city).sell.push(s); carry(craftCity, s.city, s.kg); }
        for (const s of stops.values()) {
          s.spend = sum(s.buy, (b) => b.qty * b.price) + sum(s.input, (b) => b.qty * b.price) + sum(s.raw, (b) => b.qty * b.price) + sum(s.ready, (b) => b.qty * b.price);
          s.earn = sum(s.sell, (x) => x.units * x.target * (1 - feeOf(x.city) + STATION));
          s.fee = sum(s.craft, (c) => c.units * (valueOf.get(c.key) || 0) * STATION) + sum(s.refine, (x) => x.qty * x.buy * REFINE_STATION);
        }
        const max = legs.reduce((a, l) => (l.kg > a.kg ? l : a), { kg: 0 });
        return { order, legs, stops, max };
      }
      const best = (st) => { const a = build(st, 1), b = build(st, -1); return b.max.kg < a.max.kg - 1 ? { ...b, dir: -1 } : { ...a, dir: 1 }; };

      const st = { refine: new Map(refinables.map((f) => [f.m, f.qty])), atCraft: new Set() };
      let L = best(st);
      const moved = [], cut = [];
      for (let it = 0; it < 80 && L.max.kg > cap; it++) {
        const li = L.legs.indexOf(L.max), over = L.max.kg - cap;
        let pick = null;
        /* option A: buy a carried material in the crafting city instead */
        for (const x of plain) {
          if (st.atCraft.has(x.m) || x.city === craftCity) continue;
          const pc = priceIn(x.m, craftCity);
          if (!pc) continue;
          const t = { refine: st.refine, atCraft: new Set([...st.atCraft, x.m]) };
          const drop = L.max.kg - build(t, L.dir).legs[li].kg;
          if (drop <= 0) continue;
          const c = Math.max(0, (pc - x.price) * x.qty) / drop;
          if (!pick || c < pick.c) pick = { c, apply: () => { st.atCraft.add(x.m); moved.push({ m: x.m, from: x.city, to: craftCity, extra: (pc - x.price) * x.qty }); } };
        }
        /* option B: refine less of something, cheapest saving per kilo first */
        for (const f of refinables) {
          const q = st.refine.get(f.m);
          if (q <= 0) continue;
          const step = Math.min(q, 100);
          const t = { refine: new Map(st.refine).set(f.m, q - step), atCraft: st.atCraft };
          const drop = (L.max.kg - build(t, L.dir).legs[li].kg) / step;
          if (drop <= 0) continue;
          const c = Math.max(0, f.saving) / drop;
          if (!pick || c < pick.c) pick = { c, apply: () => { const n = Math.min(q, Math.ceil(over / drop)); st.refine.set(f.m, q - n); cut.push(f.m); } };
        }
        if (!pick) break;
        pick.apply();
        L = best(st);
      }
      const tot = [...L.stops.values()].reduce((t, s) => ({ spend: t.spend + s.spend, earn: t.earn + s.earn, fee: t.fee + s.fee }), { spend: 0, earn: 0, fee: 0 });
      tot.keep = tot.earn - tot.spend - tot.fee;
      /* day one: nothing refined yet, so the refined material is bought ready-made and the refining city's inputs are skipped */
      const refined = refinables.map((f) => ({ f, qty: st.refine.get(f.m) })).filter((x) => x.qty > 0);
      const skipped = [...L.stops.values()].flatMap((s) => s.input);
      const dayOne = { buy: refined.map(({ f, qty }) => ({ m: f.m, qty, city: f.ready.city, price: f.ready.price, max: buys.find((b) => b.m === f.m)?.max })), skip: skipped };
      dayOne.spend = tot.spend - sum(skipped, (b) => b.qty * b.price) + sum(dayOne.buy, (b) => b.qty * b.price);
      const saved = sum(refined, ({ f, qty }) => qty * f.saving);
      const fullSave = sum(refinables, (f) => f.qty * Math.max(0, f.saving));
      /* show the loop from the refining city when there is exactly one, as the leather plan does */
      const rc = [...new Set(refined.map((x) => x.f.city))];
      let order = L.order, legs = L.legs;
      /* ...unless jackets are sold there too, which would put selling ahead of crafting */
      if (rc.length === 1 && rc[0] !== craftCity && !L.stops.get(rc[0]).sell.length) { const i = order.indexOf(rc[0]); order = order.slice(i).concat(order.slice(0, i)); legs = legs.slice(i).concat(legs.slice(0, i)); }
      return { craftCity, order, legs, stops: L.stops, max: L.max, cap, fits: L.max.kg <= cap, tot, dayOne, saved, fullSave, moved, cut: [...new Set(cut)], refinables, refined: st.refine };
    }

    /* "Expand this loop": add more no-focus crafts to a stage's plan until the mount is about 90% full.
       Candidates are every item in the category the stage has unlocked, best silver per kilo first, each still
       capped at its safe daily amount in its city. An addition is kept only when the whole loop keeps more silver
       (after any refining it pushes out), so a heavy, thin-margin item never displaces a better one. The material
       budget is not a limit here: the result says how much more it spends. */
    function expand(P, stageIdx, cap, target = 0.9) {
      const S = STAGES[stageIdx];
      if (!P?.rows.length) return null;
      const rows = P.rows.slice();
      const used = new Map(), id = (s) => s.key + "|" + s.city;
      for (const r of rows) used.set(id(r.s), (used.get(id(r.s)) || 0) + r.units);
      const kgEach = (s) => kgOf(s.key) + sum(s.e.lines, (l) => l.n * (l.noRet ? 1 : 1 - s.e.place.rates.none) * wOf(l.m)) / s.e.amt;
      const pool = royalSlots.filter((s) => tierOf(s.key) <= S.maxTier && s.profitNo > 0 && s.profitNo / s.price >= MIN_MARGIN)
        .map((s) => ({ s, perKg: s.profitNo / Math.max(0.1, kgEach(s)) })).sort((a, b) => b.perKg - a.perKg).slice(0, cap > 10000 ? 250 : 60);
      let L = loop({ ...P, rows }, cap);
      const added = [];
      for (const { s } of pool) {
        if (L.max.kg >= cap * target) break;
        const left = Math.floor(s.cap - (used.get(id(s)) || 0));
        if (left < 1) continue;
        for (const n of [left, Math.ceil(left / 2), Math.ceil(left / 4), Math.ceil(left / 8)]) {
          if (n < 1) continue;
          const tryRows = rows.concat([{ s, units: n, focus: false, each: s.profitNo, cost: s.e.cost0, fu: 0 }]);
          const T = loop({ ...P, rows: tryRows }, cap);
          if (T.fits && T.tot.keep > L.tot.keep) {
            rows.push(tryRows[tryRows.length - 1]); used.set(id(s), (used.get(id(s)) || 0) + n);
            const a = added.find((x) => x.key === s.key && x.city === s.city);
            if (a) a.units += n; else added.push({ key: s.key, city: s.city, units: n });
            L = T; break;
          }
        }
      }
      const profit = sum(rows, (r) => r.units * r.each), spent = sum(rows, (r) => r.units * r.cost);
      return { P: { ...P, rows, profit, spent }, added, before: P, full: L.max.kg >= cap * target };
    }

    /* Price sheet: targets and hard limits for everything the plan makes and buys. */
    const sheetKeys = new Map();
    for (const st of stages) for (const r of st.royal.rows) if (!sheetKeys.has(r.s.key + r.s.city)) sheetKeys.set(r.s.key + r.s.city, r.s);
    const sells = [...sheetKeys.values()].map((s) => {
      const k = 1 - feeOf(s.city);
      const er = Object.keys(ownPrice).length ? econ(s.key, 0, true, ownPrice) : null;
      return { s, last: s.price, med: s.st.med, lo: s.st.lo, hi: s.st.hi, beBought: s.e.cost0 / k, beRefined: er && er.cost0 < s.e.cost0 - 1 ? er.cost0 / k : null, beFocus: s.e.costF / k };
    });
    const buys = [...usedMats].map((m) => {
      const b = matPrice(m, 0);
      if (!b) return null;
      const st = stat(m, b.city);
      let max = null;
      for (const x of sheetKeys.values()) {
        const l = x.e.lines.find((y) => y.m === m);
        if (!l) continue;
        const per = l.n * (l.noRet ? 1 : 1 - x.e.place.rates.none) / x.e.amt;
        const lim = b.price + (netOf(x.price, x.city) - x.e.cost0) / per;
        if (max == null || lim < max) max = lim;
      }
      return { m, city: b.city, last: b.price, med: st?.med, lo: st?.lo, hi: st?.hi, max, noRet: [...sheetKeys.values()].some((x) => x.e.lines.find((y) => y.m === m)?.noRet) };
    }).filter(Boolean).sort((a, b) => (b.last || 0) - (a.last || 0));

    return { catKey, label: CATS.find((c) => c.key === catKey)?.label, keys, priced, noSales, ranked, stages, focusOnlyTiers, refine, ownPrice, shopping, loop, expand, sells, buys, kgOf, craftPlace, risky, focus, feeOf, now };
  }

  return { CATS, ROYAL, RISKY, RING, MOUNTS, MAMMOTH, STATION, DAYS, MAX_ITEMS, items, idsFor, analyse, tierOf, enchOf, baseOf, refinedRes };
})();
