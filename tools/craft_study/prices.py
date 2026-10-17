import csv, gzip, collections, statistics as st
d = collections.defaultdict(list)
for f in ("data/history/daily.csv.gz", "data/history/hides.csv.gz"):
    for r in csv.DictReader(gzip.open(f, "rt")):
        d[(r["item"], r["location"])].append((r["date"], int(r["count"]), int(r["avg_price"])))
def wavg(pts): c = sum(p[1] for p in pts); return sum(p[1]*p[2] for p in pts)/c if c else None
def stats(it, loc):
    pts = sorted(d.get((it, loc), []))
    last = [p for p in pts if p[0] >= "2026-10-10"]
    months = collections.defaultdict(list)
    for p in pts:
        if p[0] >= "2026-04": months[p[0][:7]].append(p)
    mm = [wavg(v) for v in months.values()]
    return wavg(last), st.median(mm), min(mm), max(mm)
J = [("T4_ARMOR_LEATHER_SET3@1","Assassin T4.1","Lymhurst","T4_LEATHER_LEVEL1@1"),("T4_ARMOR_LEATHER_SET3@2","Assassin T4.2","Fort Sterling","T4_LEATHER_LEVEL2@2"),
     ("T4_ARMOR_LEATHER_SET3@3","Assassin T4.3","Lymhurst","T4_LEATHER_LEVEL3@3"),("T4_ARMOR_LEATHER_SET1@1","Mercenary T4.1","Bridgewatch","T4_LEATHER_LEVEL1@1"),
     ("T4_ARMOR_LEATHER_SET1@2","Mercenary T4.2","Lymhurst","T4_LEATHER_LEVEL2@2"),("T4_ARMOR_LEATHER_SET1@3","Mercenary T4.3","Lymhurst","T4_LEATHER_LEVEL3@3"),
     ("T5_ARMOR_LEATHER_SET1@1","Mercenary T5.1","Bridgewatch","T5_LEATHER_LEVEL1@1"),("T5_ARMOR_LEATHER_SET3@1","Assassin T5.1","Bridgewatch","T5_LEATHER_LEVEL1@1")]
print("JACKETS: item | city | last7 | median | low-high | break-even (no focus, at last7 leather Martlock/Thetford)")
for it, name, city, lea in J:
    l7, med, lo, hi = stats(it, city)
    lp = stats(lea, "Martlock" if "T5" not in lea else "Thetford")[0]
    be = 16 * lp * 0.752 / (1 - 0.085)
    bef = 16 * lp * 0.521 / (1 - 0.085)
    print(f"{name:15} {city:13} {l7:8.0f} {med:8.0f} {lo:7.0f}-{hi:7.0f}  BE {be:7.0f}  BEfocus {bef:7.0f}  leather {lp:.0f}")
print("MATERIALS: item | city | last7 | median | low-high")
for it, city in [("T4_LEATHER_LEVEL1@1","Martlock"),("T4_LEATHER_LEVEL2@2","Martlock"),("T4_LEATHER_LEVEL3@3","Martlock"),("T5_LEATHER_LEVEL1@1","Thetford"),("T5_LEATHER_LEVEL1@1","Martlock"),
                 ("T3_LEATHER","Martlock"),("T4_HIDE_LEVEL1@1","Fort Sterling"),("T4_HIDE_LEVEL1@1","Lymhurst"),("T4_HIDE_LEVEL2@2","Fort Sterling"),("T4_HIDE_LEVEL2@2","Lymhurst"),("T5_HIDE_LEVEL1@1","Fort Sterling"),("T5_HIDE_LEVEL1@1","Lymhurst")]:
    l7, med, lo, hi = stats(it, city)
    print(f"{it:22} {city:13} {l7:7.0f} {med:7.0f} {lo:6.0f}-{hi:6.0f}")
