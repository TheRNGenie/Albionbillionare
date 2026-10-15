"""Build assets/data/recipes.json from ao-bin-dumps items.json (Albion's own item data).

Usage: python3 tools/build_recipes.py path/to/items.json
Source: https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json

Output: {"v": <date>, "w": {base_id: weight_kg}, "r": {market_id: [focus, amount_crafted, [[market_id, count, no_return], ...]]}}
Market ids follow the Albion Data Project form: T6_MAIN_SWORD@1, T5_PLANKS_LEVEL2@2.
"""
import datetime
import json
import sys


def as_list(x):
    return x if isinstance(x, list) else [x] if x else []


def market_id(res):
    uid = res["@uniquename"]
    lvl = int(res.get("@enchantmentlevel", "0") or 0)
    return f"{uid}@{lvl}" if lvl else uid


def recipe(cr):
    # Several alternative recipes exist for some items (e.g. faction-token refining); the first is the standard one.
    cr = as_list(cr)[0]
    mats = [[market_id(r), int(r["@count"]), 1 if r.get("@maxreturnamount") == "0" else 0] for r in as_list(cr.get("craftresource"))]
    if not mats:
        return None
    return [int(float(cr.get("@craftingfocus", 0) or 0)), int(cr.get("@amountcrafted", 1) or 1), mats]


def main(path):
    items = json.load(open(path, encoding="utf-8"))["items"]
    weights, recipes = {}, {}
    for group, arr in items.items():
        if not isinstance(arr, list):
            continue
        for it in arr:
            uid = it.get("@uniquename")
            if not uid:
                continue
            if it.get("@weight"):
                weights[uid] = float(it["@weight"])
            if group in ("furnitureitem", "mountskin", "journalitem", "labourercontract", "trackingitem", "rewardtoken", "killtrophy", "siegebanner", "crystalleagueitem"):
                continue
            cr = it.get("craftingrequirements")
            lvl0 = int(it.get("@enchantmentlevel", "0") or 0)
            if cr:
                r = recipe(cr)
                # Skip transmutation (raw resource tier-up) recipes; they cost silver, not crafting.
                if r and r[0] == 0 and len(r[2]) == 1 and r[2][0][0].split("@")[0].split("_", 1)[-1] == uid.split("_", 1)[-1]:
                    r = None
                if r:
                    recipes[f"{uid}@{lvl0}" if lvl0 else uid] = r
            for en in as_list((it.get("enchantments") or {}).get("enchantment")):
                lvl = int(en["@enchantmentlevel"])
                if en.get("craftingrequirements"):
                    r = recipe(en["craftingrequirements"])
                    if r:
                        # Resources carry the level in the id (T5_PLANKS_LEVEL1@1); gear does not (T6_MAIN_SWORD@1).
                        key = f"{uid}_LEVEL{lvl}@{lvl}" if group == "simpleitem" else f"{uid}@{lvl}"
                        recipes[key] = r
    out = {"v": datetime.date.today().isoformat(), "w": weights, "r": recipes}
    json.dump(out, open("assets/data/recipes.json", "w"), separators=(",", ":"))
    print(len(weights), "weights,", len(recipes), "recipes")


if __name__ == "__main__":
    main(sys.argv[1])
