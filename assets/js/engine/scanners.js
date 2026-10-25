/* Albion Billionaire v2 — strategy scanners. Each scanner turns the market model into plays: what to buy, where, what
   to do with it and where to sell. Every play gets a Monte Carlo profit range built from the calibrated price model,
   the backtested odds for that kind of play, and a confidence score that says how much of it to believe. */
window.AB = window.AB || {};

AB.scan = (() => {
  const cat = AB.cat, conf = AB.conf, store = AB.store, S = AB.stats;
  const { silver, pct, ageText, int, dateFull } = AB.util;
  const BM = cat.BM, CAER = "Caerleon";
  const F = conf.F;

  /* Fixed colour per strategy (the entity), in the validated categorical order. */
  const KINDS = {
    bm: { name: "Black Market flip", short: "BM flip", color: "s1", icon: "coin", blurb: "Buy from a sell order in Caerleon and sell straight into a Black Market buy order. No hauling, minutes per batch." },
    forge: { name: "Enchant forge", short: "Forge", color: "s2", icon: "anvil", blurb: "Buy the item one enchantment level down, enchant it with runes, souls or relics, and sell the upgrade to the Black Market." },
    haul: { name: "Safe haul", short: "Safe haul", color: "s3", icon: "route", blurb: "Buy in one royal city, carry it through blue and yellow zones only, and list it in another." },
    redhaul: { name: "Caerleon run", short: "Red run", color: "s4", icon: "skull", blurb: "Buy in a royal city and sell to the Black Market. The gaps are bigger because the road is red." },
    dip: { name: "Panic buy", short: "Panic buy", color: "s5", icon: "wave", blurb: "Buy what just crashed in a busy market and relist it. Crashes like these mostly came back within a week in 200 days of history." },
    refine: { name: "Focus refining", short: "Refine", color: "s6", icon: "hammer", blurb: "Refine at the city with the refining bonus, using focus for the 53.9% return rate, and sell the result." },
    craft: { name: "Craft for the Black Market", short: "Craft→BM", color: "s7", icon: "anvil", blurb: "Craft gear at its bonus city from the cheapest materials and sell it to a Black Market buy order." },
    flip: { name: "Order flip", short: "Order flip", color: "s8", icon: "scale", blurb: "Place a buy order just above the best one and relist just under the cheapest sell order in the same city. Live data only." },
  };
  const ORDER = Object.keys(KINDS);

  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const ringSteps = (a, b) => { const R = cat.RING, i = R.indexOf(a), j = R.indexOf(b); if (i < 0 || j < 0) return 2; const d = Math.abs(i - j); return Math.min(d, R.length - d); };
  const QS = [0.1, 0.25, 0.5, 0.75, 0.9];
  /* Evidence for plays no backtest covers: a neutral 0.4; order flips a little less, because whether your orders
     fill at all is a guess. */
  const NO_TEST = 0.4, NO_TEST_FLIP = 0.35;
  const histSpan = () => { const src = conf.insights.source; return `${AB.util.month(Date.parse(src.from))}–${AB.util.month(Date.parse(src.to))}`; };

  /* What a price turns out to be when you act. A listing still holds with a chance equal to its freshness; otherwise
     the price is a draw from the calibrated range for that day. Sell orders you place yourself, and orders the sale
     check found out of line with sales, are pure model draws; a sell order with a set price (`cap`) sells at that
     price, or at the day's price when that's lower. */
  function legDraw(lg, r) {
    if (lg.fixed != null) return lg.fixed;
    if (lg.custom) return lg.custom(r);
    if (lg.mode !== "model" && lg.l && r() < lg.l.fresh) return lg.l.price;
    if (lg.sample === undefined) lg.sample = conf.sampler(lg.st, lg.h);
    if (lg.sample) return lg.cap != null ? Math.min(lg.cap, lg.sample(r)) : lg.sample(r);
    /* no recent sales to calibrate against: the listing with a wide, uncalibrated spread */
    return lg.l ? lg.l.price * Math.exp(0.35 * S.normal(r) * Math.sqrt(Math.max(1, lg.h || 1))) : null;
  }
  const pointOf = (lg) => lg.fixed ?? lg.point ?? (lg.mode === "model" ? lg.st?.pred ?? lg.l?.price : lg.l?.price ?? lg.st?.pred) ?? null;

  /* A leg's price fields from an order the sale check has seen (market.js `checked`): the order as it is, or, when
     it was out of line with what the item sold for, the edge of the sale range for the plan and the calibrated sale
     model for the simulation. */
  const fromOrder = (l) => (l.off ? { l, mode: "model", point: l.price } : { l });
  /* Does a leg's price come from an order on the book (so its age counts as the play's freshness)? Orders out of line
     with sales and sell orders you list at the going rate don't; your own orders in an order flip set their price
     from the book and say so (`book`). */
  const booked = (lg) => !!lg.l && (lg.book ?? (lg.mode !== "model" && lg.fixed == null && !lg.custom));
  /* What the sale check changed about a leg's order, in words, or null when the order counted as it is. */
  function checkNote(lg) {
    const l = lg.l;
    if (!l?.off) return null;
    const bm = l.city === BM, under = l.off < 0;
    const order = l.side === "buy" ? (bm ? "The Black Market's buy order" : "The best buy order") : "The cheapest sell order";
    const why = l.side === "buy"
      ? (under ? "an order that low mostly waits for someone selling in a hurry, so few sell to it" : "it has most likely been filled already")
      : (under ? "it has most likely been bought already, or was a mistake" : "an order that high mostly waits for someone buying in a hurry, so few buy from it");
    const range = `the range it ${bm ? "has been bought at there" : "sells in"} (${silver(l.sale.lo)} to ${silver(l.sale.hi)}; about ${silver(l.sale.S)} on a typical day)`;
    const at = `${lg.own ? "Your order is planned" : "Planned"} at ${silver(l.price)}.`;
    /* the snapshot has no orders: its "listing" is the last day's average sale, so an odd one is one odd day */
    if (l.src === "snapshot") return `In the saved snapshot, the last day's average sale for ${cat.label(l.id)}${bm ? " at the Black Market" : ` in ${l.city}`}, ${silver(l.raw)}, is ${under ? "below" : "above"} ${range}: one odd day isn't a price to count on. ${at}`;
    return `${order} for ${cat.label(l.id)}${bm ? "" : ` in ${l.city}`}, ${silver(l.raw)}, is ${under ? "below" : "above"} ${range}: ${why}. ${at}`;
  }

  /* Run the simulation, size the batch, score the confidence. */
  function finish(M, o) {
    const point = o.value(o.legs.map(pointOf));
    if (point == null || !isFinite(point)) return null;
    const mc = conf.simulate((r) => {
      const d = o.legs.map((lg) => legDraw(lg, r));
      for (const x of d) if (x == null || !isFinite(x)) return null;
      return o.value(d, r);
    }, 400, hash(o.key));
    if (!mc) return null;
    const unitCost = Math.max(1, o.unitCost);
    const caps = { capital: Math.floor((store.get("capital") * 0.35) / unitCost), ...o.caps };
    let qty = Infinity, limit = "capital";
    for (const [k, v] of Object.entries(caps)) if (v != null && isFinite(v) && v < qty) { qty = v; limit = k; }
    qty = Math.max(1, Math.floor(qty));
    const hours = typeof o.hours === "function" ? o.hours(qty) : o.hours;
    const total = { p10: mc.p10 * qty, p25: mc.p25 * qty, p50: mc.p50 * qty, p75: mc.p75 * qty, p90: mc.p90 * qty, mean: mc.mean * qty };
    const listed = o.legs.filter(booked);
    const oldest = listed.reduce((a, lg) => (lg.l.ageH != null && (a == null || lg.l.ageH > a.l.ageH) ? lg : a), null);
    const fresh = listed.length ? Math.min(...listed.map((lg) => lg.l.fresh)) : M.fresh(M.medianAgeH);
    const withSt = o.legs.filter((lg) => lg.st && !lg.custom);
    const thin = withSt.reduce((a, lg) => (!a || (lg.st.n || 0) < (a.st.n || 0) ? lg : a), null);
    const hist = withSt.length ? Math.min(...withSt.map((lg) => F.history(lg.st))) : 0.15;
    /* listings against recent sales, at the order's own price (an order the sale check moved counts as it was) */
    const ag = o.legs.filter((lg) => lg.st?.pred && (listed.includes(lg) || lg.l?.off));
    const raw = (lg) => lg.l.raw ?? lg.l.price;
    const worst = ag.reduce((a, lg) => { const d = Math.abs(Math.log(raw(lg) / lg.st.pred)); return !a || d > a.d ? { lg, d } : a; }, null);
    const agree = o.agree !== undefined ? o.agree : ag.length ? Math.exp(ag.reduce((a, lg) => a + Math.log(Math.max(0.02, F.agree(raw(lg), lg.st.pred))), 0) / ag.length) : null;
    const f = { fresh, liquidity: F.liquidity(o.vol), history: hist, agree, odds: mc.pWin, evidence: o.evidence?.f ?? NO_TEST };
    const score = conf.score(f);
    const notes = {
      fresh: M.live
        ? oldest ? `Oldest price this play rests on: ${ageText(oldest.l.ageH * 36e5)} (${AB.cat.shortName(oldest.id)}, ${oldest.city}).` : "Prices from the live server."
        : `Saved snapshot; its last day is ${dateFull(M.asOf)}.`,
      liquidity: o.vol != null ? `${o.vol < 10 ? o.vol.toFixed(1) : int(o.vol)} sold a day at ${o.volAt || o.to} (14-day median).` : "No sales count for this market.",
      history: thin ? `${thin.st.n || 0} of the last 14 days have sales for ${AB.cat.shortName(thin.id)} in ${thin.city}.` : "",
      agree: o.agreeNote || (worst ? `The furthest listing is ${pct(Math.exp(worst.d) - 1)} ${raw(worst.lg) > worst.lg.st.pred ? "above" : "below"} its 7-day sale median (${worst.lg.city})${worst.lg.l.off ? ", so the plan prices it from sales instead" : ""}.` : ""),
      odds: `${pct(mc.pWin)} of 400 simulated outcomes made a profit.`,
      evidence: o.evidence?.text || "No backtest covers this kind of play yet.",
    };
    return {
      ...o, meta: KINDS[o.kind], point, mc, qty, limit, caps, hours, hoursFn: o.hours, total, unitCost,
      perHour: total.mean / hours, capital: unitCost * qty, roi: mc.mean / unitCost,
      factors: f, score, tier: conf.tier(score), factorList: conf.factorList(f, notes), rank: (Math.max(0, total.mean) / hours) * (score / 100) ** 2,
      checks: o.legs.map(checkNote).filter(Boolean),
    };
  }

  const volCap = (st, share) => Math.max(1, Math.round((st?.v14 || 0) * share));
  const weightCap = (id) => { const w = cat.weight(id); return w ? Math.max(1, Math.floor(store.get("mountKg") / w)) : null; };

  /* ---------------------------------------------------------------- 1. Caerleon market -> Black Market */
  function scanBM(M, out) {
    const tx = store.tax();
    for (const id of M.U.gear) {
      const sell = M.checked(M.listing(id, BM, "buy"), "get"), buy = M.checked(M.listing(id, CAER, "sell"), "pay");
      if (!sell || !buy) continue;
      const net = sell.price * (1 - tx) - buy.price;
      if (net <= 0 || net / buy.price < 0.03) continue;
      const stB = M.stat(id, BM), stC = M.stat(id, CAER);
      if ((stB.n || 0) < 4 || (stC.n || 0) < 4) continue;
      const spread = Math.log(sell.price / buy.price);
      const sv = conf.survival("bm", stB.v14, spread);
      const o = finish(M, {
        key: `bm|${id}`, kind: "bm", item: id, from: CAER, to: BM, zone: "city",
        title: `Flip ${cat.label(id)} to the Black Market`,
        legs: [
          { role: "buy", id, city: CAER, ...fromOrder(buy), st: stC, h: M.h0, label: "Buy in Caerleon" },
          { role: "sell", id, city: BM, ...fromOrder(sell), st: stB, h: M.h0, label: "Black Market buy order" },
        ],
        value: (d) => d[1] * (1 - tx) - d[0],
        unitCost: buy.price, vol: stB.v14, volAt: "the Black Market",
        caps: { market: volCap(stB, 0.25), supply: volCap(stC, 0.5) },
        hours: (q) => 0.2 + 0.004 * q, lockDays: 0.05,
        odds: sv, evidence: sv ? { f: sv.p, text: `Gaps of ${sv.band} into the Black Market still beat fees the next day ${pct(sv.p)} of the time (${int(sv.n)} cases, tested on held-out months).` } : null,
        steps: [
          `In Caerleon, buy ${cat.label(id)} from the cheapest sell order, about ${silver(buy.price)} each.`,
          `Walk to the Black Market and sell into the buy order at about ${silver(sell.price)} (${pct(tx)} tax).`,
          `Check the Black Market order first: if it dropped below ${silver(buy.price / (1 - tx))}, skip the batch.`,
        ],
      });
      if (o) out.push(o);
    }
  }

  /* ---------------------------------------------------------------- 2. Enchant forge: X@k-1 + materials -> X@k -> BM */
  function scanForge(M, out) {
    const tx = store.tax();
    const places = [...cat.ROYAL, CAER, "Brecilien"];
    for (const id of M.U.gear) {
      const up = cat.upgrade(id);
      if (!up) continue;
      const sell = M.checked(M.listing(id, BM, "buy"), "get");
      if (!sell) continue;
      const base = M.cheapest(up.from, places), mat = M.cheapest(up.mat, places);
      if (!base || !mat) continue;
      const cost = base.price + up.count * mat.price;
      const net = sell.price * (1 - tx) - cost;
      if (net <= 0 || net / cost < 0.03) continue;
      const stB = M.stat(id, BM);
      if ((stB.n || 0) < 4) continue;
      const ev = conf.enchantEvidence(up.mat, "bm");
      /* the backtest win rate, pulled toward a coin flip by 30 imaginary cases so a thin backtest can't look certain */
      const evF = ev ? (ev.win * ev.n + 0.5 * 30) / (ev.n + 30) : NO_TEST;
      const zone = base.city === CAER && mat.city === CAER ? "city" : "red";
      const matName = { RUNE: "runes", SOUL: "souls", RELIC: "relics" }[up.mat.split("_")[1]];
      const { tier, ench: lvl } = cat.parse(id);
      const o = finish(M, {
        key: `forge|${id}`, kind: "forge", item: id, from: base.city, to: BM, zone,
        title: `Forge ${cat.label(id)} from T${tier}.${lvl - 1} with ${up.count} ${matName}`,
        legs: [
          { role: "buy", id: up.from, city: base.city, ...fromOrder(base), st: M.stat(up.from, base.city), h: M.h0, label: `Buy the T${tier}.${lvl - 1} item` },
          { role: "mat", id: up.mat, city: mat.city, ...fromOrder(mat), st: M.stat(up.mat, mat.city), h: M.h0, n: up.count, label: `${up.count} × T${tier} ${matName}` },
          { role: "sell", id, city: BM, ...fromOrder(sell), st: stB, h: M.h0 + (zone === "red" ? 1 : 0), label: "Black Market buy order" },
        ],
        value: (d) => d[2] * (1 - tx) - d[0] - up.count * d[1],
        unitCost: cost, vol: stB.v14, volAt: "the Black Market",
        caps: { market: volCap(stB, 0.25), supply: volCap(M.stat(up.from, base.city), 0.5) },
        hours: (q) => (zone === "red" ? 0.8 : 0.35) + 0.01 * q, lockDays: zone === "red" ? 0.5 : 0.1,
        evidence: ev ? { f: evF, text: `Backtest: enchanting with T${tier} ${matName} and selling to the Black Market cleared a 5% margin on ${pct(ev.win)} of days (median margin ${pct(ev.margin)}, ${ev.n} item-city pairs, ${histSpan()}).` } : { f: NO_TEST, text: `No backtest for enchanting with T${tier} ${matName}: the saved history doesn't cover that material.` },
        steps: [
          `Buy ${cat.label(up.from)} in ${base.city} for about ${silver(base.price)}.`,
          `Buy ${up.count} ${cat.name(up.mat)} in ${mat.city} for about ${silver(mat.price)} each (${silver(up.count * mat.price)}).`,
          `Enchant it to .${lvl} at the crafting station that makes it.`,
          zone === "red" ? `Carry it to Caerleon (red zones) and sell into the Black Market buy order at about ${silver(sell.price)}.` : `Sell into the Black Market buy order at about ${silver(sell.price)}.`,
        ],
        extra: { up, matName },
      });
      if (o) out.push(o);
    }
  }

  /* ---------------------------------------------------------------- 3 and 4. Hauls: royal -> royal (safe), royal -> BM (red) */
  function scanHauls(M, out) {
    const tx = store.tax(), fee = tx + store.setupFee;
    const ids = [...M.U.gear, ...M.U.res.filter((id) => cat.parse(id).kind === "refined" && cat.parse(id).tier >= 4)];
    for (const id of ids) {
      /* safe: best royal pair by gap between the source listing and the destination's typical sale price */
      let best = null;
      for (const a of cat.ROYAL) {
        const l = M.checked(M.listing(id, a, "sell"), "pay");
        if (!l || (M.live && l.ageH > 48)) continue;
        for (const b of cat.ROYAL) {
          if (a === b) continue;
          const st = M.stat(id, b);
          if (!st.pred || (st.n || 0) < 4 || (st.v14 || 0) < 1) continue;
          const g = Math.log(st.pred / l.price);
          if (!best || g > best.g) best = { a, b, l, st, g };
        }
      }
      if (best && best.g > conf.insights.survival.edges[0]) {
        const { a, b, l, st } = best;
        const sv = conf.survival("royal", st.v14, best.g);
        const steps = ringSteps(a, b);
        const o = finish(M, {
          key: `haul|${id}|${a}|${b}`, kind: "haul", item: id, from: a, to: b, zone: "safe",
          title: `Haul ${cat.label(id)} from ${a} to ${b}`,
          legs: [
            { role: "buy", id, city: a, ...fromOrder(l), st: M.stat(id, a), h: M.h0, label: `Buy in ${a}` },
            { role: "sell", id, city: b, mode: "model", st, h: M.h0 + 2, label: `List in ${b}` },
          ],
          value: (d) => d[1] * (1 - fee) - d[0],
          unitCost: l.price, vol: st.v14, volAt: b,
          caps: { market: volCap(st, 0.5), supply: volCap(M.stat(id, a), 0.5), weight: weightCap(id) },
          hours: 0.35 + 0.35 * steps, lockDays: 2,
          odds: sv, evidence: sv ? { f: sv.p, text: `Royal-city gaps of ${sv.band} still beat fees the next day ${pct(sv.p)} of the time (${int(sv.n)} cases, held-out test).` } : null,
          steps: [
            `Buy ${cat.label(id)} in ${a} for about ${silver(l.price)}.`,
            `Ride to ${b} through blue and yellow zones (${steps === 1 ? "next city on the ring" : "two cities around the ring"}).`,
            `List it just under the cheapest sell order; it has been selling near ${silver(st.pred)} (${pct(fee, 1)} tax and listing fee).`,
          ],
        });
        if (o) out.push(o);
      }
      /* red: cheapest royal listing -> Black Market buy order */
      if (cat.parse(id).kind !== "gear") continue;
      const sell = M.checked(M.listing(id, BM, "buy"), "get");
      if (!sell) continue;
      const src = M.cheapest(id, cat.ROYAL, M.live ? 48 : 1e9);
      if (!src) continue;
      const g = Math.log(sell.price / src.price);
      const caerBuy = M.checked(M.listing(id, CAER, "sell"), "pay");
      if (g <= conf.insights.survival.edges[0] || (caerBuy && caerBuy.price <= src.price * 1.05)) continue;
      const stB = M.stat(id, BM);
      if ((stB.n || 0) < 4) continue;
      const sv = conf.survival("bm", stB.v14, g);
      const o = finish(M, {
        key: `redhaul|${id}|${src.city}`, kind: "redhaul", item: id, from: src.city, to: BM, zone: "red",
        title: `Run ${cat.label(id)} from ${src.city} to the Black Market`,
        legs: [
          { role: "buy", id, city: src.city, ...fromOrder(src), st: M.stat(id, src.city), h: M.h0, label: `Buy in ${src.city}` },
          { role: "sell", id, city: BM, ...fromOrder(sell), st: stB, h: M.h0 + 1, label: "Black Market buy order" },
        ],
        value: (d) => d[1] * (1 - tx) - d[0],
        unitCost: src.price, vol: stB.v14, volAt: "the Black Market",
        caps: { market: volCap(stB, 0.25), supply: volCap(M.stat(id, src.city), 0.5), weight: weightCap(id) },
        hours: 0.9, lockDays: 0.5,
        odds: sv, evidence: sv ? { f: sv.p, text: `Royal-to-Black-Market gaps of ${sv.band} still beat fees the next day ${pct(sv.p)} of the time (${int(sv.n)} cases, held-out test). Gank risk is not in these odds.` } : null,
        steps: [
          `Buy ${cat.label(id)} in ${src.city} for about ${silver(src.price)}.`,
          `Carry it to Caerleon. The road crosses red zones: only carry what you can afford to lose.`,
          `Sell into the Black Market buy order at about ${silver(sell.price)} (${pct(tx)} tax).`,
        ],
      });
      if (o) out.push(o);
    }
  }

  /* ---------------------------------------------------------------- 5. Panic buys (and spike alerts) */
  function scanDips(M, out, alerts) {
    const tx = store.tax(), fee = tx + store.setupFee;
    const ids = [...M.U.gear, ...M.U.res, ...M.U.ench];
    for (const id of ids) {
      for (const city of [...cat.ROYAL, CAER, "Brecilien"]) {
        const st = M.stat(id, city);
        if (!st.calibrated || (st.v14 || 0) < 5 || !st.lm14) continue;
        const l = M.listing(id, city, "sell");
        if (!l) continue;
        const dev = Math.log(l.price) - st.lm14;
        if (dev >= 0.25) {
          /* A spike counts only as far as sales confirm it: a sell order far over the price is often one nobody buys
             from (set high for a careless buyer), so the spike is the lower of the listing and the last day's average
             sale, when the item sold that day or the day before. Worth acting on: a busy market, a price that matters,
             and not so far out that it's likely a typo. */
          const sold = st.ageDays <= 1 ? Math.min(l.price, st.lastPrice) : null;
          const sdev = sold ? Math.log(sold) - st.lm14 : 0;
          const row = sdev >= 0.25 ? conf.rebound(sdev, st.v14) : null;
          if (row && row.n && sdev <= Math.log(3) && st.v14 >= 10 && st.m14 >= 500) alerts.push({ id, city, dev: sdev, price: sold, listing: l.price, typical: st.m14, row, ageH: l.ageH, v14: st.v14 });
          continue;
        }
        if (dev > -0.15) continue;
        const row = conf.rebound(dev, st.v14);
        if (!row || !row.n || !row.f7q) continue;
        const o = finish(M, {
          key: `dip|${id}|${city}`, kind: "dip", item: id, from: city, to: city, zone: city === CAER ? "city" : city === "Brecilien" ? "mists" : "safe",
          title: `Buy the dip: ${cat.label(id)} in ${city}`,
          legs: [
            { role: "buy", id, city, l, st, h: M.h0, label: `Buy in ${city}` },
            { role: "sell", id, city, custom: (r) => l.price * Math.exp(S.fromQuantiles(QS, row.f7q, r())), point: l.price * Math.exp(row.f7q[2]), label: "Relist over the next week" },
          ],
          value: (d) => d[1] * (1 - fee) - d[0],
          unitCost: l.price, vol: st.v14, volAt: city,
          caps: { market: volCap(st, 0.3) },
          hours: 0.3, lockDays: 7,
          agree: st.lastPrice ? F.agree(l.price, st.lastPrice) : null,
          agreeNote: !st.lastPrice ? "" : !M.live ? "In the saved snapshot this price is the last day's average sale, so the crash is in real sales, not one stray listing."
            : `The listing is ${pct(Math.abs(l.price / st.lastPrice - 1))} ${l.price > st.lastPrice ? "above" : "below"} the last day's average sale, so the crash ${Math.abs(Math.log(l.price / st.lastPrice)) < 0.1 ? "shows up in real sales too" : "may be one stray listing"}.`,
          evidence: { f: row.beatFees, text: `Drops of ${row.label} in markets selling ${conf.LIQ_LABEL[conf.liqIndex(st.v14)]} a day: the next week's average price beat today's price plus fees ${pct(row.beatFees)} of the time (${int(row.n)} cases); typical rebound ${pct(Math.exp(row.f7) - 1, 1)}.` },
          extra: { dev, row, typical: st.m14 },
          steps: [
            `Buy ${cat.label(id)} in ${city} at about ${silver(l.price)}: ${pct(-(Math.exp(dev) - 1))} under its two-week median of ${silver(st.m14)}.`,
            `Relist it over the next few days near ${silver(st.m14 * 0.97)}; don't chase the old high.`,
            `If it hasn't recovered in 7 days, sell at the market price; the edge is mostly gone by then.`,
          ],
        });
        if (o) out.push(o);
      }
    }
  }

  /* ---------------------------------------------------------------- 6. Focus refining */
  function scanRefine(M, out) {
    const tx = store.tax(), fee = tx + store.setupFee;
    const RR = cat.RETURN.refineBonus.focus, RR0 = cat.RETURN.refineBonus.none;
    for (const r of cat.RESOURCES) {
      for (let t = 4; t <= 8; t++) for (let e = 0; e <= 3; e++) {
        const id = `T${t}_${r.refined}` + (e ? `_LEVEL${e}@${e}` : "");
        const rec = cat.recipe(id);
        if (!rec) continue;
        const buys = rec.mats.map((m) => ({ m, l: M.cheapest(m.id, cat.ROYAL) }));
        if (buys.some((b) => !b.l)) continue;
        let dest = null;
        for (const c of cat.ROYAL) { const st = M.stat(id, c); if (st.pred && (!dest || st.pred > dest.st.pred)) dest = { c, st }; }
        if (!dest) continue;
        const matCost = buys.reduce((a, b) => a + b.l.price * b.m.n, 0);
        const unitCost = matCost * (1 - RR);
        const net = dest.st.pred * (1 - fee) - unitCost;
        if (net <= 0) continue;
        const eff = store.get("refineSpec")?.[r.key] || 0;
        const focus = cat.focusCost(rec.focus, eff);
        const perDay = Math.floor(store.get("focus") / Math.max(1, focus));
        if (perDay < 1) continue;
        const legs = buys.map((b) => ({ role: "mat", id: b.m.id, city: b.l.city, ...fromOrder(b.l), st: M.stat(b.m.id, b.l.city), h: M.h0, n: b.m.n, label: `${b.m.n} × ${cat.label(b.m.id)}` }));
        legs.push({ role: "sell", id, city: dest.c, mode: "model", st: dest.st, h: M.h0 + 2, label: `List in ${dest.c}` });
        const k = legs.length - 1;
        const value = (d) => d[k] * (1 - fee) - (1 - RR) * legs.slice(0, k).reduce((a, lg, i) => a + d[i] * lg.n, 0);
        const noFocus = dest.st.pred * (1 - fee) - matCost * (1 - RR0);
        const o = finish(M, {
          key: `refine|${id}`, kind: "refine", item: id, from: r.city, to: dest.c, zone: "safe",
          title: `Refine ${cat.label(id)} in ${r.city} with focus`,
          legs, value, unitCost, vol: dest.st.v14, volAt: dest.c,
          caps: { focus: perDay, market: volCap(dest.st, 0.5) },
          hours: (q) => 0.5 + 0.0008 * q, lockDays: 2,
          evidence: { f: NO_TEST, text: "Not backtested as a whole play. The price legs use the calibrated ranges; raw prices don't lead refined ones (tested), so there is nothing to time." },
          extra: { focus, perDay, silverPerFocus: net / focus, noFocus, rr: RR, city: r.city },
          steps: [
            ...buys.map((b) => `Buy ${b.m.n} × ${cat.label(b.m.id)} per refine in ${b.l.city} (about ${silver(b.l.price)} each).`),
            `Refine in ${r.city} with focus (${int(focus)} focus each, ${perDay} a day on ${int(store.get("focus"))} focus; ${pct(RR, 1)} of materials come back).`,
            `List the ${r.refinedName.toLowerCase()} in ${dest.c}; it has been selling near ${silver(dest.st.pred)}.`,
          ],
        });
        if (o) out.push(o);
      }
    }
  }

  /* ---------------------------------------------------------------- 7. Craft for the Black Market */
  function scanCraft(M, out) {
    const tx = store.tax();
    for (const id of M.U.gear) {
      const rec = cat.recipe(id);
      if (!rec || rec.amount !== 1) continue;
      const sell = M.checked(M.listing(id, BM, "buy"), "get");
      if (!sell) continue;
      const city = cat.craftCity(id) || "Martlock";
      const rr = cat.craftCity(id) ? cat.RETURN.craftBonus.none : cat.RETURN.city.none;
      const buys = rec.mats.map((m) => ({ m, l: M.cheapest(m.id, [...cat.ROYAL, CAER]) }));
      if (buys.some((b) => !b.l)) continue;
      const cost = buys.reduce((a, b) => a + b.l.price * b.m.n * (b.m.noReturn ? 1 : 1 - rr), 0);
      const net = sell.price * (1 - tx) - cost;
      if (net <= 0 || net / cost < 0.05) continue;
      const stB = M.stat(id, BM);
      if ((stB.n || 0) < 4) continue;
      const legs = buys.map((b) => ({ role: "mat", id: b.m.id, city: b.l.city, ...fromOrder(b.l), st: M.stat(b.m.id, b.l.city), h: M.h0, n: b.m.n, noReturn: b.m.noReturn, label: `${b.m.n} × ${cat.label(b.m.id)}` }));
      legs.push({ role: "sell", id, city: BM, ...fromOrder(sell), st: stB, h: M.h0 + 1, label: "Black Market buy order" });
      const k = legs.length - 1;
      const value = (d) => d[k] * (1 - tx) - legs.slice(0, k).reduce((a, lg, i) => a + d[i] * lg.n * (lg.noReturn ? 1 : 1 - rr), 0);
      const zone = city === CAER ? "city" : "red";
      const o = finish(M, {
        key: `craft|${id}`, kind: "craft", item: id, from: city, to: BM, zone,
        title: `Craft ${cat.label(id)} for the Black Market`,
        legs, value, unitCost: cost, vol: stB.v14, volAt: "the Black Market",
        caps: { market: volCap(stB, 0.25) },
        hours: (q) => 0.9 + 0.02 * q, lockDays: 1,
        evidence: { f: NO_TEST, text: "Not backtested as a whole play. Each price leg uses the calibrated ranges." },
        extra: { city, rr, focus: rec.focus },
        steps: [
          ...buys.map((b) => `Buy ${b.m.n} × ${cat.label(b.m.id)} in ${b.l.city} (about ${silver(b.l.price)} each).`),
          `Craft in ${city}${cat.craftCity(id) ? " (bonus city)" : ""}: about ${pct(rr, 1)} of the returnable materials come back without focus.`,
          zone === "red" ? `Carry it to Caerleon (red zones) and sell into the Black Market buy order near ${silver(sell.price)}.` : `Sell into the Black Market buy order near ${silver(sell.price)}.`,
        ],
      });
      if (o) out.push(o);
    }
  }

  /* ---------------------------------------------------------------- 8. Same-city order flips (live only) */
  /* A flip earns the gap between your buy order and your sell order, but only when someone sells to the one and
     someone buys from the other. The best buy order and the cheapest sell order show where the order book is, not
     always where trades happen (a buy order far under the price waits for a careless seller, a sell order far over it
     for a careless buyer), so both are checked against what the item sold for there (market.js `checked`): your buy
     order goes in at least at the low end of that range, and your sell order at most at its high end. In the
     simulation your sell order sells at its price, or at the day's price when that's lower. */
  function scanFlips(M, out) {
    if (!M.live) return;
    const tx = store.tax(), sf = store.setupFee;
    const ids = [...M.U.gear, ...M.U.res];
    for (const id of ids) for (const city of [...cat.ROYAL, CAER]) {
      const bl = M.listing(id, city, "buy"), sl = M.listing(id, city, "sell");
      if (!bl || !sl || bl.ageH > 6 || sl.ageH > 6) continue;
      const st = M.stat(id, city);
      if ((st.v14 || 0) < 3) continue;
      const bid = M.checked(bl, "pay", 1), ask = M.checked(sl, "get", -1), sale = bid.sale;
      /* nothing to check the book against: no flip; nor with a buy order at or over what the item sells for, which
         leaves nothing once fees are paid (a quick skip: the simulation would drop it too) */
      if (!sale || bid.price >= sale.S) continue;
      const net = ask.price * (1 - tx - sf) - bid.price * (1 + sf);
      if (net <= 0 || net / bid.price < 0.06) continue;
      /* how far the book sits from the sales: the order further outside the range sets the "listing matches sales" check */
      const fit = [F.inRange(bl.price, sale.lo, sale.hi), F.inRange(sl.price, sale.lo, sale.hi)];
      const worse = fit[0] <= fit[1] ? bl : sl;
      const outBy = Math.max(sale.lo / worse.price, worse.price / sale.hi) - 1;
      const o = finish(M, {
        key: `flip|${id}|${city}`, kind: "flip", item: id, from: city, to: city, zone: city === CAER ? "city" : "safe",
        title: `Order-flip ${cat.label(id)} in ${city}`,
        legs: [
          { role: "buy", id, city, fixed: bid.price, l: bid, st, book: true, own: true, label: "Your buy order" },
          { role: "sell", id, city, l: ask, st, h: M.h0 + 2, mode: "model", cap: ask.price, point: ask.price, book: true, own: true, label: "Your sell order" },
        ],
        value: (d) => d[1] * (1 - tx - sf) - d[0] * (1 + sf),
        unitCost: bid.price * (1 + sf), vol: st.v14, volAt: city,
        caps: { market: volCap(st, 0.3) },
        hours: 0.3, lockDays: 2,
        agree: Math.min(...fit),
        agreeNote: outBy > 0 ? `The ${worse.side === "buy" ? "best buy order" : "cheapest sell order"} is ${pct(outBy)} ${worse.side === "buy" ? "under" : "over"} the range it sold in this week (${silver(sale.lo)} to ${silver(sale.hi)}).`
          : `Both orders sit inside the range it sold in this week (${silver(sale.lo)} to ${silver(sale.hi)}).`,
        evidence: { f: NO_TEST_FLIP, text: "Not backtested: the history has daily averages, not order books, so fill odds are a guess from how much sells a day." },
        steps: [
          `Place a buy order for ${cat.label(id)} in ${city} at ${silver(bid.price)} (2.5% fee)${bid.off ? `, not just over the best one (${silver(bl.price)}): that one is below the range it sells in, so few sell to it` : ""}.`,
          ask.off ? `When it fills, list it at ${silver(ask.price)}. The cheapest sell order (${silver(sl.price)}) is above the range it sells in, so it isn't the price to match.`
            : `When it fills, list it at ${silver(ask.price)}, just under the cheapest sell order.`,
          `Re-check both orders every few hours; someone outbidding you by 1 silver ends the edge.`,
        ],
      });
      if (o) out.push(o);
    }
  }

  /* ---------------------------------------------------------------- market pulse: the Black Market premium right now */
  function pulse(M) {
    const xs = [];
    for (const id of M.U.gear) {
      const b = M.stat(id, BM);
      if (!b.pred) continue;
      const roy = cat.ROYAL.map((c) => M.stat(id, c).pred).filter(Boolean);
      if (roy.length < 2) continue;
      xs.push(Math.log(b.pred / S.median(roy)));
    }
    const I = conf.insights.bmPremium;
    return { now: S.median(xs), q25: S.quantile(xs, 0.25), q75: S.quantile(xs, 0.75), n: xs.length, usual: I.median, weekly: I.weekly };
  }

  /* Raw simulated outcomes for one play (for the outcome histogram). */
  function samples(o, n = 2000) {
    const r = S.rng(hash(o.key) ^ 0x9e3779b9), xs = [];
    for (let i = 0; i < n; i++) {
      const d = o.legs.map((lg) => legDraw(lg, r));
      if (d.some((x) => x == null || !isFinite(x))) continue;
      xs.push(o.value(d, r) * o.qty);
    }
    return xs;
  }

  let last = null;
  const STEPS = [scanBM, scanForge, scanHauls, scanDips, scanRefine, scanCraft, scanFlips];
  function done(M, out, alerts, ms) {
    const opps = out.filter((o) => o && o.mc.mean > 0).sort((a, b) => b.rank - a.rank);
    opps.forEach((o, i) => (o.n = i + 1));
    alerts.sort((a, b) => b.dev * Math.log(1 + b.v14) - a.dev * Math.log(1 + a.v14));
    const byKind = Object.fromEntries(ORDER.map((k) => [k, opps.filter((o) => o.kind === k)]));
    last = { opps, alerts: alerts.slice(0, 40), byKind, pulse: pulse(M), at: Date.now(), ms: Math.round(ms), mode: M.mode };
    return last;
  }
  function run(M) {
    const t0 = performance.now();
    const out = [], alerts = [];
    for (const step of STEPS) step(M, out, alerts);
    return done(M, out, alerts, performance.now() - t0);
  }
  /* The same scan one strategy at a time, letting the page answer taps and scrolls in between. The automatic
     reload uses it, since it runs while the player is using the app. `ms` counts the scanning, not the pauses. */
  async function runSoon(M) {
    const out = [], alerts = [];
    let ms = 0;
    for (const step of STEPS) {
      const t = performance.now();
      step(M, out, alerts);
      ms += performance.now() - t;
      await new Promise((r) => setTimeout(r, 0));
    }
    return done(M, out, alerts, ms);
  }

  return { KINDS, ORDER, NO_TEST, NO_TEST_FLIP, run, runSoon, finish, legDraw, samples, get last() { return last; } };
})();
