import sys, json, statistics as st
sys.argv = ["x", "res.json", "safe", "2e7"]
exec(open("family.py").read().split('if __name__')[0])
BUDGET = 2e7
cats = ["leather_armor","cloth_armor","plate_armor","plate_helmet","knuckles","naturestaff","bags","mace","cloth_shoes","ore"]
res_ = {}
for mode in ("safe","all"):
    fam = best_by_item(mode)
    for c in cats:
        items = fam.get(c, [])
        for r in items: r["fame"] = fame_of(r)
        if not items: continue
        main = "ARMOR_LEATHER_SET3" if c == "leather_armor" else max({base(r["item"]) for r in items}, key=lambda m: st.median([sim(items, 50, mi, m)[0] for mi in range(7)]))
        v = [sim(items, 50, mi, main)[0] for mi in range(7)]
        res_[(c, mode)] = (st.median(v), min(v), sum(v)/7, v)
for c in cats:
    s = res_.get((c,"safe")); a = res_.get((c,"all"))
    print(f"{c:14} safe med {s[0]/1e6:.2f} worst {s[1]/1e6:.2f} | all med {a[0]/1e6:.2f} worst {a[1]/1e6:.2f}")
json.dump({f"{c}|{m}": v[3] for (c, m), v in res_.items()}, open("cmp.json","w"))
