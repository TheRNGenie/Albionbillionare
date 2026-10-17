import csv, gzip, json, re, sys, collections, statistics as st, math
REPO = "/home/claude/albionbillionare"
d = json.load(open(f"{REPO}/assets/data/recipes.json")); R = d["r"]; CAT = d["c"]
ROYAL = ["Martlock", "Bridgewatch", "Lymhurst", "Fort Sterling", "Thetford"]
CRAFT_CITY = {}
for line in open(f"{REPO}/assets/js/data.js"):
    pass
src = open(f"{REPO}/assets/js/data.js").read()
blk = src[src.index("ABP.CRAFT_CITY = {"):]; blk = blk[:blk.index("};")]
for k, v in re.findall(r'(\w+): "([^"]+)"', blk): CRAFT_CITY[k] = v
TAX = 0.065; STATION = 0.02  # station fee allowance: estimate
RRR = {"bonus": (0.248, 0.479), "royal": (0.152, 0.435), "island": (0.0, 0.371)}

rows = collections.defaultdict(list)  # (item, loc) -> [(date, count, price)]
for r in csv.DictReader(gzip.open(sys.argv[1], "rt")):
    rows[(r["item"], r["location"])].append((r["date"], int(r["count"]), int(r["avg_price"])))
dates = sorted({x[0] for v in rows.values() for x in v})
print("dates", dates[0], dates[-1], len(dates), "series", len(rows))
month = lambda s: s[:7]
MONTHS = sorted({month(x) for x in dates})
def monthly(item, loc):
    out = {}
    for m in MONTHS:
        pts = [x for x in rows.get((item, loc), []) if month(x[0]) == m]
        c = sum(p[1] for p in pts)
        if c: out[m] = (sum(p[1] * p[2] for p in pts) / c, c / max(1, len({p[0] for p in pts})), len(pts), pts)
    return out

# ---- per-month price per (item, loc) ----
mp = {}  # (item, loc, month) -> (wavg price, units/day over days with trades, trade-days)
dayvol = collections.defaultdict(dict)  # (item, loc) -> {date: count}
for (it, loc), pts in rows.items():
    by = collections.defaultdict(list)
    for dt, c, p in pts:
        by[month(dt)].append((c, p)); dayvol[(it, loc)][dt] = c
    for m, v in by.items():
        c = sum(x[0] for x in v)
        mp[(it, loc, m)] = (sum(x[0] * x[1] for x in v) / c, c, len(v))

FULL = [m for m in MONTHS if sum(1 for x in dates if month(x) == m) >= 14]
print("full months", FULL)

def matcost(mat, m, city):
    """monthly price of a material: craft city's price, else cheapest royal city (+3% haul allowance)"""
    if (mat, city, m) in mp: return mp[(mat, city, m)][0]
    c = [mp[(mat, x, m)][0] for x in ROYAL if (mat, x, m) in mp]
    return min(c) * 1.03 if c else None

def safe_daily(it, loc):
    """app-style share rule on daily volume over the whole period (days with no trades count as 0)"""
    dv = dayvol.get((it, loc), {})
    span = [x for x in dates if x >= FULL[0] + "-01"]
    vols = sorted(dv.get(x, 0) for x in span)
    if not vols or sum(vols) == 0: return 0, 0, 0
    q = lambda f: vols[min(len(vols) - 1, int(f * (len(vols) - 1) + 0.5))]
    med, low = q(0.5), q(0.25); mean = sum(vols) / len(vols)
    cv = (sum((v - mean) ** 2 for v in vols) / max(1, len(vols) - 1)) ** 0.5 / mean
    share = 0.25 if cv < 0.35 else 0.15 if cv < 0.7 else 0.1
    return share * low, med, mean

SELL = ROYAL + ["Caerleon", "Brecilien", "Black Market"]
res = []
for it, (focus, amt, mats) in R.items():
    if not any((it, l, FULL[0]) in mp or (it, l, FULL[-1]) in mp for l in SELL): continue
    base = it.split("@")[0]; cat = CAT.get(base, "?")
    if not all(re.match(r"^T[4-8]_(PLANKS|METALBAR|LEATHER|CLOTH)", x[0]) for x in mats): continue
    city = CRAFT_CITY.get(cat)
    if not city: continue
    for loc in SELL:
        months = []
        for m in FULL:
            if (it, loc, m) not in mp: months.append(None); continue
            price = mp[(it, loc, m)][0]
            raw = 0; okm = True
            for mat, cnt, noret in mats:
                p = matcost(mat, m, city if city in ROYAL else "Martlock")
                if p is None: okm = False; break
                raw += cnt * p
            if not okm: months.append(None); continue
            net = price * (1 - TAX - STATION) / amt
            months.append((net, raw))
        good = [x for x in months if x]
        if len(good) < len(FULL) - 1: continue
        safe, med, mean = safe_daily(it, loc)
        res.append(dict(item=it, cat=cat, city=city, loc=loc, focus=focus, months=months, safe=safe, med=med, mean=mean))
json.dump(res, open(sys.argv[2], "w"))
print(len(res), "item x sell-location series kept")

# material supply: median daily units sold across royal cities (days without trades count as 0)
span = [x for x in dates if x >= FULL[0] + "-01"]
matvol = {}
for mat in {m[0] for it in R.values() for m in it[2]}:
    tot = [sum(dayvol.get((mat, c), {}).get(x, 0) for c in ROYAL) for x in span]
    if any(tot): matvol[mat] = sorted(tot)[len(tot) // 2]
for r in res:
    caps = [0.15 * matvol.get(m[0], 0) / m[1] for m in R[r["item"]][2]]
    r["matcap"] = min(caps)
    r["mats"] = R[r["item"]][2]
json.dump(res, open(sys.argv[2], "w"))
json.dump(matvol, open(sys.argv[2].replace("res", "matvol"), "w"))
