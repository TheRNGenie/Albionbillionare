# Craft-profit study

Ranks every T4-T8 item made from planks, bars, leather or cloth on monthly profit, using
`data/history/daily.csv.gz` (Albion Online Data Project daily history, Americas, from tools/fetch_history.py).

    python3 tools/craft_study/analyze.py data/history/daily.csv.gz /tmp/res.json   # per item x sell city x month
    cd /tmp && python3 <repo>/tools/craft_study/compare.py                       # lines compared (expects res.json in cwd)
    python3 <repo>/tools/craft_study/leather.py                                  # leather armor detail

Assumptions: craft in the item's bonus city (24.8% return, 47.9% with focus), 6.5% market fees,
2% station-fee allowance, sales capped at the app's safe daily amount, 10,000 focus a day.
