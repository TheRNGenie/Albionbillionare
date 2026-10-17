import json, sys, statistics as st, collections
res = json.load(open(sys.argv[1])); mode = sys.argv[2] if len(sys.argv) > 2 else "all"
UNSAFE = ("Black Market", "Caerleon", "Brecilien")
best = {}
for r in res:
    if mode == "safe" and (r["loc"] in UNSAFE or r["city"] in UNSAFE): continue
    m = [x for x in r["months"] if x]
    pfs = [(net - raw * 0.521) / r["focus"] for net, raw in m]
    pns = [net - raw * 0.752 for net, raw in m]
    need100 = 10000 / (r["focus"] * 0.5 ** 3.1)
    e = dict(r, spf_lo=min(pfs), spf_med=st.median(pfs), pn_lo=min(pns), pn_med=st.median(pns), need100=need100,
             pf_med=st.median([net - raw * 0.521 for net, raw in m]), price=st.median([x[0] for x in m]))
    k = r["item"]
    if k not in best or e["spf_lo"] > best[k]["spf_lo"]: best[k] = e
rows = sorted(best.values(), key=lambda e: -e["spf_lo"])
print("by silver per focus point (worst month), item must absorb >= 1/3 of a spec-100 day's focus crafts")
n = 0
for e in rows:
    if e["safe"] < e["need100"] / 3: continue
    print(f'{e["item"]:26} {e["cat"][:12]:12} craft@{e["city"][:9]:9} sell@{e["loc"][:12]:12} silver/focus lo {e["spf_lo"]:5.2f} med {e["spf_med"]:5.2f} | focus-craft profit {e["pf_med"]:8.0f} | nofocus {e["pn_med"]:7.0f} (worst {e["pn_lo"]:7.0f}) | safe/d {e["safe"]:6.0f} need@100 {e["need100"]:5.0f}')
    n += 1
    if n > 30: break
