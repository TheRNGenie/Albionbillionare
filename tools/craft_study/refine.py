import csv, gzip, collections, statistics as st
ROYAL = ["Martlock","Bridgewatch","Lymhurst","Fort Sterling","Thetford"]
p = collections.defaultdict(lambda: [0, 0.0]); days = collections.defaultdict(set)
for f in ("data/history/daily.csv.gz", "data/history/hides.csv.gz"):
    for r in csv.DictReader(gzip.open(f, "rt")):
        if r["location"] not in ROYAL: continue
        if not any(x in r["item"] for x in ("HIDE", "_LEATHER")) or "ARMOR" in r["item"]: continue
        m = r["date"][:7]
        if m < "2026-04": continue
        k = (r["item"], r["location"], m); c = int(r["count"])
        p[k][0] += c; p[k][1] += c * int(r["avg_price"]); days[k].add(r["date"])
M = sorted({k[2] for k in p})
price = lambda it, c, m: (p[(it, c, m)][1] / p[(it, c, m)][0]) if p[(it, c, m)][0] else None
vol = lambda it, c, m: p[(it, c, m)][0] / max(1, len(days[(it, c, m)]))
def show(it):
    out = []
    for c in ROYAL:
        ps = [price(it, c, m) for m in M if price(it, c, m)]
        vs = [vol(it, c, m) for m in M if price(it, c, m)]
        if ps: out.append(f"{c[:6]} {st.median(ps):7.0f} ({st.median(vs):6.0f}/d)")
    print(f"{it:22}", " | ".join(out))
for it in ["T3_HIDE","T2_LEATHER","T3_LEATHER","T4_HIDE_LEVEL1@1","T4_HIDE_LEVEL2@2","T4_HIDE_LEVEL3@3","T5_HIDE_LEVEL1@1","T4_LEATHER_LEVEL1@1","T4_LEATHER_LEVEL2@2","T4_LEATHER_LEVEL3@3","T5_LEATHER_LEVEL1@1"]: show(it)
# refine economics, Martlock no focus 36.7% / focus 53.9%; hides bought in cheapest royal city that month
RRR = {"none": 0.367, "focus": 0.539}
REC = {"T4_LEATHER_LEVEL1@1": [("T4_HIDE_LEVEL1@1", 2), ("T3_LEATHER", 1)],
       "T4_LEATHER_LEVEL2@2": [("T4_HIDE_LEVEL2@2", 2), ("T3_LEATHER", 1)],
       "T4_LEATHER_LEVEL3@3": [("T4_HIDE_LEVEL3@3", 2), ("T3_LEATHER", 1)],
       "T5_LEATHER_LEVEL1@1": [("T5_HIDE_LEVEL1@1", 3), ("T4_LEATHER_LEVEL1@1", 1)]}
NEED = {"T4_LEATHER_LEVEL1@1": 2090, "T4_LEATHER_LEVEL2@2": 2730, "T4_LEATHER_LEVEL3@3": 145, "T5_LEATHER_LEVEL1@1": 2070}
print()
for mode in ("none", "focus"):
    tot_buy = tot_ref = 0
    for out, rec in REC.items():
        savs = []; where = collections.Counter()
        for m in M:
            buy = price(out, "Martlock", m)
            if not buy: continue
            cost = 0
            for it, n in rec:
                if it == "T4_LEATHER_LEVEL1@1":  # refined yourself too
                    sub = sum(min(price(x, c, m) for c in ROYAL if price(x, c, m)) * k for x, k in REC[it]) * (1 - RRR[mode])
                    cost += n * sub
                else:
                    cands = [(price(it, c, m) * (1.0 if c == "Martlock" else 1.02), c) for c in ROYAL if price(it, c, m)]
                    pr, c = min(cands); where[c] += 1; cost += n * pr
            cost *= (1 - RRR[mode]); cost *= 1.01  # station fee allowance
            savs.append((buy, cost))
        b = st.median([x[0] for x in savs]); c = st.median([x[1] for x in savs])
        pos = sum(1 for x in savs if x[1] < x[0])
        tot_buy += NEED[out] * b; tot_ref += NEED[out] * c
        print(f"{mode:5} {out:22} buy {b:6.0f} refine {c:6.0f} saving {100*(1-c/b):5.1f}%  cheaper in {pos}/{len(savs)} months  hides from {dict(where)}")
    print(f"{mode:5} Stage-2 day: buy {tot_buy/1e6:.2f}M vs refine {tot_ref/1e6:.2f}M -> save {(tot_buy-tot_ref)/1e6:.2f}M ({100*(1-tot_ref/tot_buy):.1f}%)")
