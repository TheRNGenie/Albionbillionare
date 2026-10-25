/* Albion Billionaire v2 — what the app knows about items and places: names, recipes, weights, upgrades, item power,
   bonus cities and return rates. Item data comes from Albion's own files (ao-bin-dumps), built by tools/. */
window.AB = window.AB || {};

AB.cat = (() => {
  const { loadJSON } = AB.util;
  const ROYAL = ["Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford"];
  const BM = "Black Market";
  const CITIES = [...ROYAL, "Caerleon", "Brecilien"];
  const MARKETS = [...CITIES, BM];
  /* The royal ring: each city borders the next through blue and yellow zones only. */
  const RING = ["Thetford", "Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock"];

  const SERVERS = [
    { id: "west", label: "Americas", host: "https://west.albion-online-data.com" },
    { id: "europe", label: "Europe", host: "https://europe.albion-online-data.com" },
    { id: "east", label: "Asia", host: "https://east.albion-online-data.com" },
  ];

  const RESOURCES = [
    { key: "wood", raw: "WOOD", refined: "PLANKS", rawName: "Logs", refinedName: "Planks", city: "Fort Sterling" },
    { key: "ore", raw: "ORE", refined: "METALBAR", rawName: "Ore", refinedName: "Metal bars", city: "Thetford" },
    { key: "hide", raw: "HIDE", refined: "LEATHER", rawName: "Hide", refinedName: "Leather", city: "Martlock" },
    { key: "fiber", raw: "FIBER", refined: "CLOTH", rawName: "Fiber", refinedName: "Cloth", city: "Lymhurst" },
    { key: "rock", raw: "ROCK", refined: "STONEBLOCK", rawName: "Stone", refinedName: "Stone blocks", city: "Bridgewatch" },
  ];
  /* Resource return rate (official wiki): production bonus / (1 + bonus). */
  const RETURN = {
    city: { none: 0.152, focus: 0.435 },
    refineBonus: { none: 0.367, focus: 0.539 },
    craftBonus: { none: 0.248, focus: 0.479 },
  };
  const focusCost = (base, eff) => base * Math.pow(0.5, eff / 10000);
  /* Crafting bonus city by Albion's shop subcategory. */
  const CRAFT_CITY = {
    crossbow: "Bridgewatch", dagger: "Bridgewatch", cursestaff: "Bridgewatch", plate_armor: "Bridgewatch", cloth_shoes: "Bridgewatch",
    hammer: "Fort Sterling", spear: "Fort Sterling", holystaff: "Fort Sterling", plate_helmet: "Fort Sterling", cloth_armor: "Fort Sterling",
    sword: "Lymhurst", bow: "Lymhurst", arcanestaff: "Lymhurst", leather_helmet: "Lymhurst", leather_shoes: "Lymhurst",
    axe: "Martlock", quarterstaff: "Martlock", froststaff: "Martlock", plate_shoes: "Martlock", booktype: "Martlock", shieldtype: "Martlock", torchtype: "Martlock",
    mace: "Thetford", naturestaff: "Thetford", firestaff: "Thetford", leather_armor: "Thetford", cloth_helmet: "Thetford",
    knuckles: "Caerleon", shapeshifterstaff: "Caerleon", food: "Caerleon", tracking: "Caerleon",
    bags: "Brecilien", satchels: "Brecilien", potions: "Brecilien",
  };
  const TIER_WORD = /^(Beginner's|Novice's|Journeyman's|Adept's|Expert's|Master's|Grandmaster's|Elder's)\s+/;

  let names = new Map(), R = null, I = null;
  let pNames = null, pRecipes = null, pItems = null;
  const loadNames = () => pNames || (pNames = loadJSON("assets/data/names.json").then((rows) => { names = new Map(rows); return names; }).catch((e) => { pNames = null; throw e; }));
  const loadRecipes = () => pRecipes || (pRecipes = loadJSON("assets/data/recipes.json").then((r) => (R = r)).catch((e) => { pRecipes = null; throw e; }));
  const loadItems = () => pItems || (pItems = loadJSON("assets/data/v2/items.json").then((r) => (I = r)).catch((e) => { pItems = null; throw e; }));
  const ready = () => Promise.all([loadNames(), loadRecipes(), loadItems()]);

  /* ---------- ids ---------- */
  function parse(id) {
    const m = /^T(\d)_(.+?)(?:@(\d))?$/.exec(id || "");
    if (!m) return { id, tier: 0, ench: 0, base: id, fam: id, kind: "other" };
    const tier = +m[1], ench = m[3] ? +m[3] : 0;
    const rest = m[2];
    const fam = rest.replace(/_LEVEL\d$/, "");
    const base = id.split("@")[0];
    /* the scanners only meet gear, resources and enchanting materials (the universe comes from tools/v2) */
    let kind = "gear";
    if (RESOURCES.some((r) => r.refined === fam)) kind = "refined";
    else if (RESOURCES.some((r) => r.raw === fam)) kind = "raw";
    else if (/^(RUNE|SOUL|RELIC)$/.test(fam)) kind = "enchant";
    return { id, tier, ench, base, fam, kind, res: RESOURCES.find((r) => r.refined === fam || r.raw === fam) || null };
  }
  const tierLabel = (id) => { const p = parse(id); return p.tier ? `${p.tier}.${p.ench}` : ""; };
  function name(id) {
    const n = names.get(id) || names.get(id.split("@")[0]);
    if (n) return n;
    const p = parse(id);
    return p.fam.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  /* Name without the tier adjective (the tier badge carries it): "Master's Broadsword" -> "Broadsword". */
  const shortName = (id) => name(id).replace(TIER_WORD, "");
  const label = (id) => { const t = tierLabel(id); return (t ? "T" + t + " " : "") + shortName(id); };
  const icon = (id, q = 1, size = 64) => `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?quality=${q}&size=${size}`;
  function search(q, limit = 30) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    const tierQ = /^t?([4-8])(?:\.(\d))?$/;
    let tier = null, ench = null;
    const rest = words.filter((w) => { const m = tierQ.exec(w); if (m) { tier = +m[1]; ench = m[2] != null ? +m[2] : null; return false; } return true; });
    const out = [];
    for (const [id, n] of names) {
      const ln = n.toLowerCase();
      if (!rest.every((w) => ln.includes(w) || id.toLowerCase().includes(w))) continue;
      const p = parse(id);
      if (tier != null && p.tier !== tier) continue;
      if (ench != null && p.ench !== ench) continue;
      if (/UNIQUE|SKIN|VANITY|TOKEN|QUESTITEM|_TROPHY|KILLTROPHY/.test(id)) continue;
      out.push({ id, name: n, score: (ln.startsWith(rest[0] || "") ? 0 : 1) + p.ench * 0.01 + (p.tier ? Math.abs(p.tier - 6) * 0.001 : 0.5) });
      if (out.length > 400) break;
    }
    return out.sort((a, b) => a.score - b.score).slice(0, limit);
  }

  /* ---------- crafting data ---------- */
  function recipe(id) {
    const r = R?.r?.[id];
    if (!r) return null;
    return { focus: r[0], amount: r[1], mats: r[2].map(([m, n, noRet]) => ({ id: m, n, noReturn: !!noRet })) };
  }
  function weight(id) {
    if (!R) return null;
    const b = id.split("@")[0];
    return R.w[b] ?? R.w[b.replace(/_LEVEL\d$/, "")] ?? null;
  }
  const category = (id) => R?.c?.[id.split("@")[0]] || null;
  const craftCity = (id) => CRAFT_CITY[category(id)] || null;
  /* Enchanting X@k-1 to X@k at the item's crafting station: runes (.0 -> .1), souls (.1 -> .2), relics (.2 -> .3). */
  function upgrade(id) {
    const p = parse(id);
    if (!I || p.kind !== "gear" || p.ench < 1 || p.ench > 3) return null;
    const counts = I.up[p.base];
    if (!counts || !counts[p.ench - 1]) return null;
    return { from: p.ench === 1 ? p.base : `${p.base}@${p.ench - 1}`, mat: `T${p.tier}_${["RUNE", "SOUL", "RELIC"][p.ench - 1]}`, count: counts[p.ench - 1] };
  }
  function ip(id) {
    if (!I) return null;
    if (I.ipx[id] != null) return I.ipx[id];
    const p = parse(id), b = I.ip[p.base];
    return b == null ? null : b + 100 * p.ench;
  }

  return {
    ROYAL, BM, CITIES, MARKETS, RING, SERVERS, RESOURCES, RETURN, focusCost,
    ready, parse, name, shortName, label, icon, search, recipe, weight, craftCity, upgrade, ip,
  };
})();
