"""Build assets/data/names.json (English item names) from ao-bin-dumps formatted/items.txt.

Usage: python3 tools/build_names.py path/to/items.txt
Source: https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.txt

The names ship inside the app so it never has to reach GitHub at run time.
Output: [[market_id, name], ...]
"""
import json
import re
import sys

LINE = re.compile(r"^\s*\d+:\s*(\S+)\s*:\s*(.+?)\s*$")


def main(path):
    out = []
    for line in open(path, encoding="utf-8"):
        m = LINE.match(line)
        if m:
            out.append([m.group(1), m.group(2)])
    with open("assets/data/names.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} names written to assets/data/names.json")


if __name__ == "__main__":
    main(sys.argv[1])
