import sys, json, statistics as st, collections, gzip, csv
sys.argv = ["x", "res.json", "safe", "2e7"]
exec(open("family.py").read().split('if __name__')[0])
W = {"4": (0.51, 3.4), "5": (0.76, 5.1), "6": (1.14, 7.6)}
items = best_by_item("safe")["leather_armor"]
for r in items: r["fame"] = fame_of(r)
byid = {r["item"]: r for r in items}
def run(S, B, mi):
    global BUDGET; BUDGET = B
    main = "ARMOR_LEATHER_SET3"
    cand = []
    # replicate sim but record focus vs nofocus split
    left = 10000; budget = B; plan = []
    rows = []
    for r in items:
        m = r["months"][mi]
        if not m: continue
        net, raw = m
        eff = 310 * S if base(r["item"]) == main else 60 * S
        f = r["focus"] * 0.5 ** (eff / 10000)
        rows.append(dict(r=r, f=f, pf=net - raw*.521, pn=net - raw*.752, cf=raw*.521, cn=raw*.752))
    used = collections.Counter()
    for c in sorted(rows, key=lambda c: -c["pf"]/c["f"]):
        if c["pf"] <= 0 or left <= 0 or budget <= 0: break
        n = int(min(left / c["f"], c["r"]["safe"], budget / c["cf"]))
        if n < 1: continue
        left -= n*c["f"]; budget -= n*c["cf"]; used[c["r"]["item"]] += n; plan.append((c, n, "focus"))
    for c in sorted(rows, key=lambda c: -c["pn"]/c["cn"]):
        if c["pn"] <= 0 or budget <= 0: break
        n = int(min(c["r"]["safe"] - used[c["r"]["item"]], budget / c["cn"]))
        if n < 1: continue
        budget -= n*c["cn"]; used[c["r"]["item"]] += n; plan.append((c, n, "no focus"))
    return plan
for label, S, B in (("Stage1", 15, 5e6), ("Stage2", 50, 2e7), ("Stage3", 90, 2e7)):
    plan = run(S, B, 5)
    print("==", label)
    leather = collections.Counter(); wt_in = 0; wt_out = collections.Counter(); spend = 0; prof = 0
    for c, n, mode in plan:
        r = c["r"]; mat, cnt, _ = R_ = r["mats"][0]
        rr = 0.479 if mode == "focus" else 0.248
        buy = round(n * cnt * (1 - rr))
        leather[mat] += buy
        t = r["item"][1]
        wt_in += buy * W[t][0]; wt_out[r["loc"]] += n * W[t][1]
        cost = c["cf"] if mode == "focus" else c["cn"]; p = c["pf"] if mode == "focus" else c["pn"]
        spend += n * cost; prof += n * p
        print(f'  {r["item"]:26} {mode:8} x{n:4} sell {r["loc"]:13} leather {mat} buy {buy}  profit/craft {p:7.0f}')
    print("  leather to buy:", dict(leather), "kg in", round(wt_in), "kg out", {k: round(v) for k, v in wt_out.items()}, "spend", round(spend/1e6,2), "profit", round(prof/1e6,2))
# leather prices by city (Sep) and Thetford volume
rows = collections.defaultdict(list)
for r in csv.DictReader(gzip.open("/home/claude/albionbillionare/data/history/daily.csv.gz", "rt")):
    if "LEATHER" in r["item"] and "ARMOR" not in r["item"] and r["date"].startswith("2026-09"):
        rows[(r["item"], r["location"])].append((int(r["count"]), int(r["avg_price"])))
for it in ["T4_LEATHER_LEVEL1@1","T4_LEATHER_LEVEL2@2","T4_LEATHER_LEVEL3@3","T5_LEATHER","T5_LEATHER_LEVEL1@1","T5_LEATHER_LEVEL2@2","T6_LEATHER_LEVEL1@1","T6_LEATHER_LEVEL2@2"]:
    out = []
    for c in ["Thetford","Martlock","Fort Sterling","Lymhurst","Bridgewatch"]:
        v = rows.get((it, c))
        if v: out.append(f"{c[:5]} {sum(x[0]*x[1] for x in v)/sum(x[0] for x in v):6.0f} ({sum(x[0] for x in v)/30:6.0f}/d)")
    print(it, " | ".join(out))
