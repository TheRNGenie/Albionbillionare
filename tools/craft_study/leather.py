import sys, json, statistics as st, collections
sys.argv = ["x", "res.json", "safe", "2e7"]
exec(open("family.py").read().split('if __name__')[0])
main = "ARMOR_LEATHER_SET3"
for mode in ("safe", "all"):
    items = best_by_item(mode)["leather_armor"]
    for r in items: r["fame"] = fame_of(r)
    for B in (2e6, 5e6, 2e7):
        BUDGET = B
        line = []
        for S in (0, 25, 50, 75, 100):
            v = [sim(items, S, mi, main) for mi in range(7)]
            p = [x[0] for x in v]; f = [x[1] for x in v]
            line.append(f"S{S}: {st.median(p)/1e6:.2f}/{min(p)/1e6:.2f}M fame {st.median(f)/1e3:.0f}k")
        print(mode, f"{B/1e6:.0f}M", " | ".join(line))
# per item detail (safe + BM) for T4-T6
print()
allr = [r for r in res if r["cat"] == "leather_armor" and r["loc"] in ("Lymhurst","Fort Sterling","Bridgewatch","Martlock","Thetford","Black Market")]
by = collections.defaultdict(list)
for r in allr: by[r["item"]].append(r)
names = {"SET1": "Mercenary", "SET2": "Hunter", "SET3": "Assassin"}
for it in sorted(by):
    if "SET" not in it: continue
    rs = by[it]
    def stats(r):
        m = [x for x in r["months"] if x]
        return dict(loc=r["loc"], safe=r["safe"], pf=st.median([a - b*.521 for a, b in m]), pn=st.median([a - b*.752 for a, b in m]),
                    pnpos=sum(1 for a, b in m if a - b*.752 > 0), pfpos=sum(1 for a, b in m if a - b*.521 > 0), n=len(m), price=st.median([a for a, b in m]), cost=st.median([b for a,b in m]), focus=r["focus"])
    royal = [stats(r) for r in rs if r["loc"] != "Black Market"]
    bm = [stats(r) for r in rs if r["loc"] == "Black Market"]
    br = max(royal, key=lambda s: s["pf"] * min(s["safe"], 30)) if royal else None
    b = bm[0] if bm else None
    f = lambda s: f'{s["loc"][:10]:10} cap {s["safe"]:5.0f}/d focusP {s["pf"]:7.0f} ({s["pfpos"]}/{s["n"]}) nofocP {s["pn"]:7.0f} ({s["pnpos"]}/{s["n"]}) mats {s["cost"]:7.0f} spf {s["pf"]/s["focus"]:.1f}' if s else "-"
    if int(it[1]) <= 6: print(f"{it:26}", f(br), "||", f(b))
