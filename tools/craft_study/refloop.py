"""Most profitable refine-and-sell loop: buy raw resources in the royal cities, refine in the
family's bonus city, sell the refined resource in the royal cities. One mount (load cap), safe
daily caps on both the buy and sell side, monthly prices Apr-Oct 2026.
Usage: python3 tools/craft_study/refloop.py [cap_kg] [budget]"""
import csv, gzip, json, sys, collections, statistics as st
CAP = float(sys.argv[1]) if len(sys.argv) > 1 else 3300
BUDGET = float(sys.argv[2]) if len(sys.argv) > 2 else 2e7
EXTRA = ["METALBAR+LEATHER", "METALBAR+LEATHER+CLOTH"]
TRIPS = int(sys.argv[3]) if len(sys.argv) > 3 else 1
ROYAL = ["Martlock", "Bridgewatch", "Lymhurst", "Fort Sterling", "Thetford"]
BONUS = {"METALBAR": "Thetford", "PLANKS": "Fort Sterling", "CLOTH": "Lymhurst", "LEATHER": "Martlock", "STONEBLOCK": "Bridgewatch"}
RRR_N, RRR_F, FEE, SELLFEE = 0.367, 0.539, 1.01, 0.935
d = json.load(open("assets/data/recipes.json"))
daily = collections.defaultdict(list)  # (item, city, month) -> [(count, price)]
for f in ("data/history/daily.csv.gz", "data/history/hides.csv.gz", "data/history/raw.csv.gz"):
    try: rows = csv.DictReader(gzip.open(f, "rt"))
    except FileNotFoundError: continue
    for r in rows:
        if r["location"] in ROYAL and r["date"] >= "2026-04":
            daily[(r["item"], r["location"], r["date"][:7])].append((int(r["count"]), int(r["avg_price"]), r["date"]))
M = sorted({k[2] for k in daily})
def stat(it, c, m):
    v = daily.get((it, c, m))
    if not v or len(v) < 8: return None
    n = sum(x[0] for x in v); p = sum(x[0] * x[1] for x in v) / n
    per = sorted(x[0] for x in v); q25 = per[len(per) // 4]
    mean = n / len(v); cv = st.pstdev(per) / mean if mean else 9
    pct = 0.25 if cv < 0.5 else 0.15 if cv < 1 else 0.10
    return p, q25 * pct
def w(it): return d["w"].get(it.split("@")[0], 0)
outs = [k for k, (f, a, m) in d["r"].items() if any(k.split("@")[0].startswith(f"T{t}_{fam}") for t in range(4, 9) for fam in BONUS)
        and all(x[0].split("_")[1] in ("ORE", "WOOD", "FIBER", "HIDE", "ROCK") or x[0].split("_")[1].split("@")[0] in BONUS for x in m)]
def fam(it): return it.split("_")[1].split("@")[0]
def month_rows(m):
    rows = []
    for o in outs:
        (raw, n, _), (low, k, _) = d["r"][o][2][0], d["r"][o][2][1]
        sells = [(stat(o, c, m), c) for c in ROYAL]; sells = [(s[0], s[1], c) for s, c in sells if s]
        raws = [(stat(raw, c, m), c) for c in ROYAL]; raws = [(s[0], s[1], c) for s, c in raws if s]
        lows = [(stat(low, c, m), c) for c in ROYAL]; lows = [(s[0], s[1], c) for s, c in lows if s]
        if not sells or not raws or not lows: continue
        rp, _, rc = min(raws); lp, _, lc = min(lows)
        rcap = sum(x[1] for x in raws) / (n * (1 - RRR_N))
        cost = (n * rp + k * lp) * (1 - RRR_N) * FEE
        kg_in = (n * w(raw) + k * w(low)) * (1 - RRR_N)
        for sp, scap, sc in sells:  # every royal city is its own market, each with its own safe cap
            rows.append(dict(o=o, fam=fam(o), prof=sp * SELLFEE - cost, cost=cost, cap=scap, rcap=rcap, kg=max(kg_in, w(o)), sell=sc, sp=sp, raw=raw, rc=rc, rp=rp, low=low, lc=lc, lp=lp, n=n, focus=d["r"][o][0],
                             proff=sp * SELLFEE - (n * rp + k * lp) * (1 - RRR_F) * FEE))
    return rows
def plan(rows, f):
    kg = 0; bud = BUDGET; tot = 0; pick = []; rawused = collections.Counter()
    for r in sorted([r for r in rows if r["fam"] in f.split("+") and r["prof"] > 0], key=lambda r: -r["prof"] / r["kg"]):
        q = int(min(r["cap"], r["rcap"] - rawused[r["o"]], (CAP * TRIPS - kg) / r["kg"], bud / r["cost"]))
        if q < 1: continue
        kg += q * r["kg"]; bud -= q * r["cost"]; tot += q * r["prof"]; pick.append((r, q)); rawused[r["o"]] += q
    return tot, pick
res = collections.defaultdict(list)
allrows = {m: month_rows(m) for m in M}
for m in M:
    for f in list(BONUS) + EXTRA: res[f].append(plan(allrows[m], f)[0])
for f in list(BONUS) + EXTRA:
    v = res[f]; print(f"{f:10} in {BONUS.get(f, 'several'):13} median {st.median(v)/1e6:5.2f}M  worst {min(v)/1e6:5.2f}M  months {[round(x/1e6,2) for x in v]}")
best = sys.argv[4] if len(sys.argv) > 4 else max(BONUS, key=lambda f: st.median(res[f]))
print("\nBEST", best)
# per-item medians over months for the best family
items = collections.defaultdict(list)
for m in M:
    tot, pick = plan(allrows[m], best)
    print(m, f"profit {tot/1e6:.2f}M spend {sum(q*r['cost'] for r,q in pick)/1e6:.1f}M kg {sum(q*r['kg'] for r,q in pick):.0f}")
    for r, q in pick: items[(r["o"], r["sell"])].append((q, r))
for o, v in sorted(items.items(), key=lambda kv: -sum(q * r["prof"] for q, r in kv[1])):
    qs = [q for q, r in v]; rs = [r for q, r in v]
    print(f"{o[0]:24} {o[1][:6]} months {len(v)} qty {st.median(qs):6.0f} profit/unit {st.median([r['prof'] for r in rs]):7.0f} focus-profit/unit {st.median([r['proff'] for r in rs]):7.0f} base focus {rs[0]['focus']} kg/unit {rs[0]['kg']:.2f} sell {collections.Counter(r['sell'] for r in rs).most_common(1)[0][0]} @ {st.median([r['sp'] for r in rs]):.0f} raw {rs[0]['raw']} from {collections.Counter(r['rc'] for r in rs).most_common(2)} @ {st.median([r['rp'] for r in rs]):.0f} low {rs[0]['low']} from {collections.Counter(r['lc'] for r in rs).most_common(1)[0][0]} @ {st.median([r['lp'] for r in rs]):.0f}")
if len(sys.argv) > 5:  # print one month's full plan
    tot, pick = plan(allrows[sys.argv[5]], best)
    for r, q in sorted(pick, key=lambda x: (x[0]["o"], x[0]["sell"])):
        print(f"PLAN {r['o']:22} sell {r['sell']:13} qty {q:5} @ {r['sp']:6.0f}  profit/u {r['prof']:5.0f}  raw {r['raw']} x{r['n']} from {r['rc']} @ {r['rp']:.0f}  low {r['low']} from {r['lc']} @ {r['lp']:.0f}  kg {q*r['kg']:.0f} cost {q*r['cost']/1e6:.2f}M")
    print(f"PLAN total profit {tot/1e6:.2f}M")
