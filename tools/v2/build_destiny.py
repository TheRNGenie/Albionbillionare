"""Build assets/data/v2/destiny.json: the crafting half of Albion's Destiny Board, for the Cost to Max page.

Usage: python3 tools/v2/build_destiny.py path/to/ao-bin-dumps
The folder needs three files from https://github.com/ao-data/ao-bin-dumps (master, repository root):
achievements.json (the Destiny Board), items.json (recipes, fame and item values) and localization.json (English names).

Everything here is read from Albion's own files; nothing is typed in by hand:
  "tpl"   the two crafting level tables. "base" is a crafter mastery (Sword Crafter), "spec" an item specialization
          (Claymore Crafting Specialist). Per level: fame to finish it, its learning-point cost, the lowest item tier whose
          crafts count toward it, and (masteries) the item tier that reaching it unlocks. A node's real numbers are the
          template's times its own fame and LP multipliers ("fm", "lpm").
  "res"   per crafting material (market id): [fame per unit, item value per unit]. Refined resources carry fame (the sum
          of their raw resources' fame through the refining recipe, unless the file states it). Materials with neither
          are left out.
  "av"    artifacts, which give no fame: item value per unit by family, T4 to T8 (T4_ARTEFACT_2H_CLAYMORE_AVALON is
          family ARTEFACT_2H_CLAYMORE_AVALON at T4). Item values set the crafting station's fee.
  "ff"    item families whose crafts count extra on the board and in journals (artifact weapons: 1.1 to 1.4).
  "jr"    crafting journals: fame to fill one, the silver an empty one costs and a journal's weight in kg, T4 to T8, and
          their types.
  "pat"   lists of item patterns ("T?" is any tier, "*" anything), shared by the focus bonuses below.
  "lines" the 39 crafter masteries, each with its item families, focus bonuses and specializations.
          "fc": [[bonus per level, index into "pat"], ...]. Focus cost efficiency = 100 x level x bonus, summed over
          every node with a pattern matching the item; focus cost = base cost x 0.5 ^ (efficiency / 10,000).
"""
import datetime
import json
import os
import re
import sys

CATS = {"WARRIOR": "warrior", "HUNTER": "hunter", "MAGE": "mage", "TOOL": "toolmaker"}
# crafting journals by type (T4_JOURNAL_WARRIOR ...); the market sells them as ..._EMPTY and ..._FULL
JOURNALS = ["WARRIOR", "HUNTER", "MAGE", "TOOLMAKER"]
TIERS = range(4, 9)


def as_list(x):
    return x if isinstance(x, list) else [x] if x else []


def market_id(uid, lvl):
    return f"{uid}@{lvl}" if lvl else uid


def first(cr):
    """The standard recipe (some items list alternatives, e.g. faction-token variants)."""
    return as_list(cr)[0] if cr else None


def load(folder):
    def read(name):
        with open(os.path.join(folder, name), encoding="utf-8") as f:
            return json.load(f)
    return read("achievements.json")["achievements"], read("items.json")["items"], read("localization.json")


def english(loc):
    en = {}
    for tu in loc["tmx"]["body"]["tu"]:
        for tuv in as_list(tu.get("tuv")):
            if tuv.get("@xml:lang") == "EN-US":
                en[tu["@tuid"]] = tuv.get("seg")
    return en


def template(t):
    """A level table: Fame;LP;MissionTargetMinTier;MissionTargetMaxTier;MissionItemMinTier;MissionItemMaxTier;UnlockTier;..."""
    cols = t["baselevels"]["@structure"].split(";")
    rows = [dict(zip(cols, r.strip().split(";"))) for r in t["baselevels"]["#text"].strip().split("\n") if r.strip()]
    out = {"fame": [int(r["Fame"]) for r in rows], "lp": [int(r["LP"]) for r in rows], "min": [int(r["MissionItemMinTier"]) for r in rows]}
    unlock = {r["UnlockTier"]: i + 1 for i, r in enumerate(rows) if r.get("UnlockTier")}
    if unlock:
        out["unlock"] = unlock
    return out


def main(folder, out="assets/data/v2/destiny.json"):
    A, I, loc = load(folder)
    en = english(loc)
    T = {t["@name"]: t for t in A["template"]}
    tpl = {"base": template(T["CRAFT_BASE"]), "spec": template(T["CRAFT_SPEC"])}
    assert len(tpl["base"]["fame"]) == 100 and len(tpl["spec"]["fame"]) == 100

    # ---------- items: every unique name, its recipe, fame and value ----------
    items = {}
    for group, arr in I.items():
        if isinstance(arr, list):
            for it in arr:
                if isinstance(it, dict) and it.get("@uniquename"):
                    items[it["@uniquename"]] = (group, it)

    def recipe_of(uid, lvl):
        _, it = items[uid]
        if lvl == 0:
            return first(it.get("craftingrequirements"))
        for en_ in as_list((it.get("enchantments") or {}).get("enchantment")):
            if int(en_["@enchantmentlevel"]) == lvl:
                return first(en_.get("craftingrequirements"))
        return None

    fame_memo = {}

    def res_fame(uid):
        """Fame of one unit of a crafting material: stated, else the sum through its refining recipe; raw resources
        give their stated fame, anything else (artifacts, tokens) none."""
        if uid in fame_memo:
            return fame_memo[uid]
        _, it = items.get(uid, (None, {}))
        if it.get("@famevalue") is not None:
            v = float(it["@famevalue"])
        elif it.get("@shopsubcategory1") == "refinedresources":
            r = first(it.get("craftingrequirements"))
            v = sum(int(c["@count"]) * res_fame(c["@uniquename"]) for c in as_list((r or {}).get("craftresource")))
        else:
            v = 0.0
        fame_memo[uid] = v
        return v

    def value_of(uid):
        _, it = items.get(uid, (None, {}))
        return float(it.get("@itemvalue") or 0)

    # Enchanted resources are their own items (T5_METALBAR_LEVEL1); the market calls them T5_METALBAR_LEVEL1@1.
    res, av = {}, {}

    def add_res(uid):
        art = re.match(r"^T(\d)_(ARTEFACT_.+)$", uid)
        if art:
            assert res_fame(uid) == 0, uid
            av.setdefault(art.group(2), [0] * 5)[int(art.group(1)) - 4] = value_of(uid)
            return
        m = re.match(r"^(T\d_[A-Z]+)_LEVEL(\d)$", uid)
        mid = f"{uid}@{m.group(2)}" if m else uid
        if mid not in res and (res_fame(uid) or value_of(uid)):
            res[mid] = [round(res_fame(uid), 4), value_of(uid)]

    def craft_fame(uid, lvl):
        r = recipe_of(uid, lvl)
        if not r:
            return None
        total = 0.0
        for c in as_list(r.get("craftresource")):
            add_res(c["@uniquename"])
            total += int(c["@count"]) * res_fame(c["@uniquename"])
        return total

    # ---------- item families and the patterns that name them ----------
    craftable = {}  # family -> {tier: [enchant levels with a recipe]}
    ff = {}
    for uid, (group, it) in items.items():
        m = re.match(r"^T(\d)_(.+)$", uid)
        if not m or group in ("journalitem", "furnitureitem", "mountskin", "labourercontract", "killtrophy", "rewardtoken"):
            continue
        fam, tier = m.group(2), int(m.group(1))
        levels = [lvl for lvl in range(5) if recipe_of(uid, lvl)]
        if levels:
            craftable.setdefault(fam, {})[tier] = levels
            f = float(it.get("@destinyandjournalcraftfamefactor") or 1)
            if f != 1:
                ff[fam] = f

    def families(patterns):
        out = set()
        for p in patterns:
            rx = re.compile("^" + re.escape(p).replace(r"T\?", r"T\d").replace(r"\*", ".*") + "$")
            for fam, tiers in craftable.items():
                if any(rx.match(f"T{t}_{fam}") for t in tiers):
                    out.add(fam)
        return sorted(out)

    def pats(node):
        return [p["@pattern"] for p in as_list((node.get("itemlist") or {}).get("itempattern"))]

    pat = []

    def focus(node):
        out = []
        for b in as_list((node.get("baserewards") or {}).get("bonus")):
            if b["@type"] != "craftingfocuscostreduction":
                continue
            assert b.get("@mintier", "4") == "4" and b.get("@maxtier", "8") == "8", b
            ps = [p["@pattern"] for p in as_list(b.get("itempattern"))]
            if ps not in pat:
                pat.append(ps)
            out.append([float(b["@bonus"]), pat.index(ps)])
        return out

    # ---------- journals ----------
    jfill, jr = {}, {"fame": [], "silver": [], "kg": [], "types": JOURNALS}
    for j in JOURNALS:
        for t in TIERS:
            _, it = items[f"T{t}_JOURNAL_{j}"]
            mission = it["famefillingmissions"]["craftitemfame"]
            for v in as_list(mission.get("validitem")):
                m = re.match(r"^T\d_(.+)$", v["@id"])
                if m:
                    jfill.setdefault(m.group(1), set()).add(j)
            row = [int(it["@maxfame"]), int(it["craftingrequirements"]["@silver"]), float(it["@weight"])]
            if j == JOURNALS[0]:
                for k, v in zip(("fame", "silver", "kg"), row):
                    jr[k].append(v)
            else:
                assert row == [jr["fame"][t - 4], jr["silver"][t - 4], jr["kg"][t - 4]], j

    # ---------- the crafter masteries and their specializations ----------
    nodes = [t for t in A["templateachievement"] if t.get("@category") == "crafting"]
    specs_of = {}
    for s in nodes:
        if s["@usetemplate"] == "CRAFT_SPEC":
            parent = [p["@id"] for p in as_list((s.get("parentachievements") or {}).get("achievement"))]
            assert len(parent) == 1, s["@id"]
            specs_of.setdefault(parent[0], []).append(s)
    lines = []
    for m in sorted((n for n in nodes if n["@usetemplate"] == "CRAFT_BASE"), key=lambda n: n["@id"]):
        cat = m["@subcategorylocatag"].rsplit("_", 1)[-1]
        specs = []
        for s in sorted(specs_of.get(m["@id"], []), key=lambda n: n["@id"]):
            fams = families(pats(s))
            js = sorted(set().union(*(jfill.get(f, set()) for f in fams))) if fams else []
            assert len(js) <= 1, (s["@id"], js)
            specs.append({
                "id": s["@id"], "name": en[s["title"]["@tag"]], "fm": float(s["@famemultiplier"]), "lpm": float(s["@lpmultiplier"]),
                "fam": fams, "j": js[0] if js else None, "fc": focus(s),
            })
        lines.append({
            "id": m["@id"], "name": en[m["title"]["@tag"]], "cat": CATS[cat], "fm": float(m["@famemultiplier"]), "lpm": float(m["@lpmultiplier"]),
            "fam": families(pats(m)), "fc": focus(m), "specs": specs,
        })

    # every material any of these families uses, at every tier and enchantment, and the families' fame (for the checks)
    for line in lines:
        for fam in line["fam"]:
            for t, levels in craftable[fam].items():
                for lvl in levels:
                    craft_fame(f"T{t}_{fam}", lvl)

    cat_names = {CATS[k]: en[f"@ACHIEVEMENT_SUBCATEGORY_CRAFT_{k}"].replace(" Crafter", "") for k in CATS}
    used = {f for line in lines for f in line["fam"]}
    data = {
        "v": datetime.date.today().isoformat(),
        "tpl": tpl, "cats": cat_names, "res": dict(sorted(res.items())), "av": dict(sorted(av.items())),
        "ff": {f: v for f, v in sorted(ff.items()) if f in used}, "jr": jr, "pat": pat, "lines": lines,
    }

    # Checks against a published crafting fame table (albiononlinegrind.com): a two-handed T8.0 weapon gives 44,640
    # fame, a one-handed T6.2 25,920 and a T4.0 helmet 180.
    checks = [("T8_2H_CLAYMORE", 0, 44640), ("T6_MAIN_SWORD", 2, 25920), ("T4_HEAD_PLATE_SET1", 0, 180)]
    for uid, lvl, want in checks:
        got = craft_fame(uid, lvl)
        assert abs(got - want) < 1e-6, (uid, lvl, got, want)

    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    n_specs = sum(len(l["specs"]) for l in lines)
    print(f"{len(lines)} masteries, {n_specs} specializations, {len(res)} materials, {len(av)} artifacts, {len(data['ff'])} families with extra fame -> {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main(sys.argv[1], *(sys.argv[2:3]))
