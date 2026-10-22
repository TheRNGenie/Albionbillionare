"""Build assets/data/v2/items.json from ao-bin-dumps items.json (Albion's own item data).

Usage: python3 tools/v2/build_items.py path/to/items.json
Source: https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json

Output (compact JSON):
  "v":   build date
  "up":  {base_id: [runes for .0->.1, souls for .1->.2, relics for .2->.3]}   (material is T<tier>_RUNE/SOUL/RELIC)
  "ip":  {base_id: item power at .0}; enchanted items add 100 per level unless listed in "ipx"
  "ipx": {market_id: item power} for the few items that break the +100 rule
"""
import datetime
import json
import re
import sys


def as_list(x):
    return x if isinstance(x, list) else [x] if x else []


def main(path, out="assets/data/v2/items.json"):
    with open(path, encoding="utf-8") as f:
        items = json.load(f)["items"]
    up, ip, ipx = {}, {}, {}
    MAT = {1: "RUNE", 2: "SOUL", 3: "RELIC"}
    for group, arr in items.items():
        if not isinstance(arr, list):
            continue
        for it in arr:
            uid = it.get("@uniquename")
            if not uid:
                continue
            tier = re.match(r"^T(\d)_", uid)
            base_ip = it.get("@itempower")
            if base_ip:
                ip[uid] = int(float(base_ip))
            counts = [0, 0, 0]
            for en in as_list((it.get("enchantments") or {}).get("enchantment")):
                lvl = int(en["@enchantmentlevel"])
                if en.get("@itempower") and base_ip:
                    v = int(float(en["@itempower"]))
                    if v != int(float(base_ip)) + 100 * lvl:
                        ipx[f"{uid}@{lvl}"] = v
                ur = en.get("upgraderequirements")
                if not ur or lvl not in MAT or not tier:
                    continue
                r = as_list(ur.get("upgraderesource"))[0]
                if r["@uniquename"] == f"T{tier.group(1)}_{MAT[lvl]}":
                    counts[lvl - 1] = int(r["@count"])
            if any(counts):
                up[uid] = counts
    data = {"v": datetime.date.today().isoformat(), "up": up, "ip": ip, "ipx": ipx}
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(len(up), "upgradeable items,", len(ip), "with item power,", len(ipx), "exceptions")


if __name__ == "__main__":
    main(sys.argv[1], *(sys.argv[2:3]))
