"""Build assets/data/laborers.json (what a laborer returns for each full journal) from ao-bin-dumps items.json.

Usage: python3 tools/build_laborers.py path/to/items.json
Each journal lists @baselootamount (how many items a laborer brings back at 100% yield) and a weighted
loot list; Mercenaries bring back silver instead.
Output: {journal_id: {"t": tier, "n": base_amount, "loot": [[market_id, amount, weight]], "silver": amount_or_0}}
"""
import json
import sys


def as_list(x):
    return x if isinstance(x, list) else [x] if x else []


def main(path):
    items = json.load(open(path, encoding="utf-8"))["items"]
    out = {}
    for arr in items.values():
        if not isinstance(arr, list):
            continue
        for it in arr:
            uid = it.get("@uniquename", "")
            if "_JOURNAL_" not in uid or "TROPHY" in uid or not it.get("lootlist"):
                continue
            loot, silver = [], 0
            for l in as_list(it["lootlist"].get("loot")):
                if l.get("@silveramount"):
                    silver = float(l["@silveramount"])
                    continue
                name, lvl = l["@itemname"], int(l.get("@itemenchantmentlevel", "0") or 0)
                loot.append([f"{name}@{lvl}" if lvl else name, float(l.get("@itemamount", "1")), float(l.get("@weight", "1"))])
            out[uid] = {"t": int(it["@tier"]), "n": float(it.get("@baselootamount", "1")), "loot": loot, "silver": silver}
    json.dump(out, open("assets/data/laborers.json", "w"), separators=(",", ":"))
    print(len(out), "journals written to assets/data/laborers.json")


if __name__ == "__main__":
    main(sys.argv[1])
