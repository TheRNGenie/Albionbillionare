import json, sys, statistics as st, collections
res = json.load(open(sys.argv[1]))
UNSAFE = ("Black Market", "Caerleon", "Brecilien")
BUDGET = float(sys.argv[3]) if len(sys.argv) > 3 else 2e7
NOFOC_CAP = BUDGET
FOCUS = 10000
def best_by_item(mode):
    best = {}
    for r in res:
        if mode == "safe" and r["loc"] in UNSAFE: continue
        m = [x for x in r["months"] if x]
        score = st.median([net - raw * 0.521 for net, raw in m]) * min(r["safe"], 50)
        if r["item"] not in best or score > best[r["item"]][0]: best[r["item"]] = (score, r)
    fam = collections.defaultdict(list)
    for s, r in best.values(): fam[r["cat"]].append(r)
    return fam

def base(it): return it.split("@")[0].split("_", 1)[1]  # item type without tier

def sim(items, S, mi, main):
    """daily profit in month index mi, spec S on family node + the 'main' item type; craft city bonus RRR"""
    cand = []
    for r in items:
        m = r["months"][mi]
        if not m: continue
        net, raw = m
        eff = 310 * S if base(r["item"]) == main else 60 * S
        f = r["focus"] * 0.5 ** (eff / 10000)
        cand.append(dict(r=r, f=f, pf=net - raw * 0.521, pn=net - raw * 0.752, cf=raw * 0.521, cn=raw * 0.752, cap=r["safe"], fame=r["fame"]))
    left = FOCUS; prof = 0; fame = 0; used = collections.Counter(); budget = BUDGET
    for c in sorted(cand, key=lambda c: -c["pf"] / c["f"]):
        if c["pf"] <= 0 or left <= 0 or budget <= 0: break
        n = min(left / c["f"], c["cap"], budget / c["cf"]); left -= n * c["f"]; budget -= n * c["cf"]; prof += n * c["pf"]; used[c["r"]["item"]] += n; fame += n * c["fame"]
    for c in sorted(cand, key=lambda c: -c["pn"] / c["cn"]):
        if c["pn"] <= 0 or budget <= 0: break
        n = min(c["cap"] - used[c["r"]["item"]], budget / c["cn"])
        if n <= 0: continue
        budget -= n * c["cn"]; prof += n * c["pn"]; used[c["r"]["item"]] += n; fame += n * c["fame"]
    return prof, fame, used

FPR = {4: 22.5, 5: 90, 6: 270, 7: 645, 8: 1395}
def fame_of(r):
    t = int(r["item"][1]); return sum(c for _, c, _ in r["mats"]) * FPR[t] * 1.5

if __name__ == "__main__":
    mode = sys.argv[2]
    fam = best_by_item(mode)
    out = []
    for cat, items in fam.items():
        for r in items: r["fame"] = fame_of(r)
        mains = {base(r["item"]) for r in items}
        bestmain = None
        for main in mains:
            v = [sim(items, 100, mi, main)[0] for mi in range(7)]
            if not bestmain or st.median(v) > bestmain[1]: bestmain = (main, st.median(v), min(v))
        main = bestmain[0]
        row = [cat, main]
        for S in (0, 50, 100):
            v = [sim(items, S, mi, main)[0] for mi in range(7)]
            row += [st.median(v), min(v)]
        out.append(row)
    out.sort(key=lambda x: -x[7])
    print(f"mode={mode} material budget={BUDGET/1e6:.0f}M/day   daily profit (median month / worst month) at spec 0, 50, 100")
    for r in out[:20]:
        print(f"{r[0][:14]:14} main={r[1][:22]:22} S0 {r[2]/1e6:5.2f}/{r[3]/1e6:5.2f}M  S50 {r[4]/1e6:5.2f}/{r[5]/1e6:5.2f}M  S100 {r[6]/1e6:5.2f}/{r[7]/1e6:5.2f}M")
