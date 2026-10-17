"""Download daily price/volume history from the Albion Online Data Project for every T4-T8
crafted item made only from refined resources (planks, bars, leather, cloth), plus those resources.

Usage: python3 tools/fetch_history.py [start YYYY-MM-DD] [server]
Writes data/history/daily.csv.gz: item,location,date,count,avg_price (all qualities summed,
price weighted by count). Used for the craft-profit study, not by the app itself.
"""
import csv, gzip, json, re, sys, time, urllib.request, urllib.error, urllib.parse, datetime, os

START = sys.argv[1] if len(sys.argv) > 1 else "2025-10-01"
SERVER = sys.argv[2] if len(sys.argv) > 2 else "west"
END = datetime.date.today().isoformat()
HOST = f"https://{SERVER}.albion-online-data.com"
LOCS = "Martlock,Bridgewatch,Lymhurst,Fort Sterling,Thetford,Caerleon,Brecilien,Black Market"

d = json.load(open("assets/data/recipes.json"))
STD = re.compile(r"^T[4-8]_(PLANKS|METALBAR|LEATHER|CLOTH)(_LEVEL\d)?(@\d)?$")
ids = [k for k, (f, a, m) in d["r"].items() if k[:2] in ("T4", "T5", "T6", "T7", "T8") and all(STD.match(x[0]) for x in m)]
mats = sorted({x[0] for k in ids for x in d["r"][k][2]})
ids = mats + sorted(ids)
OUT = "data/history/daily.csv.gz"
if len(sys.argv) > 3:  # explicit id list, e.g. raw hides for the refining study
    ids = sys.argv[3].split(",")
    OUT = sys.argv[4]
print(len(ids), "ids", flush=True)

agg = {}
def get(url, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "albion-billionaire-study", "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            wait = 20 if e.code == 429 else 5 * (i + 1)
            print("HTTP", e.code, "wait", wait, flush=True); time.sleep(wait)
        except Exception as e:
            print("err", e, flush=True); time.sleep(5 * (i + 1))
    print("GAVE UP", url, flush=True)
    return []

B = 10
for i in range(0, len(ids), B):
    chunk = ids[i:i + B]
    url = f"{HOST}/api/v2/stats/history/{','.join(chunk)}.json?time-scale=24&date={START}&end_date={END}&locations={urllib.parse.quote(LOCS)}"
    for s in get(url):
        for p in s.get("data", []):
            c = p.get("item_count") or 0
            pr = p.get("avg_price") or 0
            if c <= 0 or pr <= 0:
                continue
            key = (s["item_id"], s["location"], p["timestamp"][:10])
            a = agg.setdefault(key, [0, 0.0])
            a[0] += c; a[1] += c * pr
    if (i // B) % 20 == 0:
        print(i, "/", len(ids), len(agg), "rows", flush=True)
    time.sleep(0.7)

os.makedirs("data/history", exist_ok=True)
with gzip.open(OUT, "wt", newline="") as f:
    w = csv.writer(f); w.writerow(["item", "location", "date", "count", "avg_price"])
    for (it, loc, day), (c, s) in sorted(agg.items()):
        w.writerow([it, loc, day, c, round(s / c)])
print("done", len(agg), "rows", START, END, flush=True)
