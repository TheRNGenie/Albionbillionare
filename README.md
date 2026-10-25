# Albion Billionaire v2

Every money-making play in Albion Online, scored twice: once for what it could earn, as an 80% range from simulation, and once for how far to believe it, as a confidence score from 0 to 100. Built from scratch on 200 days of market history.

> **Where it lives.** v2 is developed on the branch `claude/project-thread-m3rrj0`. The original app on `claude/albion-billionaire-app` is untouched, and v2 installs next to it: its own Android app id, its own Windows app, its own browser storage (`ab2.` keys) and its own release tags (`v2-…`).

## What's new

- **Ranges that hold.** Every price and profit comes with a range calibrated on months the model never saw. Across 2,001,387 held-out forecasts, the app's 80% ranges held 79.9% of real outcomes; a plain bell curve built from the same daily swing held 60%. They stay on target in calm and wild markets alike (79.4% to 80.4% across five volatility levels).
- **A confidence score on every play.** Six checks (fresh prices, a busy market, enough history, the listing matching recent sales, the chance it pays, backtest evidence) blended so that one weak check pulls the whole score down. Every play shows its six bars and why each scored what it did.
- **Eight strategies, including ones few players run.** Enchanting gear one level up for the Black Market, buying panic crashes in busy markets, Caerleon runs ranked by how long their gap lasts, crafting for the Black Market, alongside safe hauls, Black Market flips, focus refining and order flips.
- **A road to a billion with odds.** A Monte Carlo of your silver: 400 paths of a year of trading with today's plays, each path keeping a different share of the edge and living through different market weeks. It answers "what's my chance of 1B by my deadline", and what holds you back (capital, hours or market size), month by month.
- **An Edge Lab.** What 200 days of trades say: which edges are real, and which popular ideas ("buy midweek, sell on Sunday", "raw prices lead refined prices") fail out of sample.
- **A Trust page and a Ledger.** The app shows its own calibration (promised against delivered), and the Ledger checks its ranges against the trades you actually make.
- **Prices that keep themselves fresh.** While the app is open, live prices reload by themselves every minute, as often as the free price server comfortably allows, and reach the page at a calm moment: never while you type, read a play or scroll, and with your filters, place and focus kept.
- **Cost to Max.** The cheapest route from your Destiny Board levels to 100 in any crafting specialization or crafter mastery, or in a refining line (Ore Smelter, Wood Planer, Fiber Weaver, Hide Tanner, Stone Cutter: all five tiers or one), at today's prices: what to craft at each stage as the mastery unlocks tiers, where to sell it without flooding a market, where focus, journals and learning points pay most, what it costs with an 80% range, and how far to trust it. Each stage also comes as the original app's daily loop: one ride, city by city, sized to your pack mount (or a Transport Mammoth), with where to buy, refine your own materials, craft, sell and bank in order, and Expand this loop to fill a mount the route leaves half empty. Royal cities only keeps it out of red zones and the mists. For refining it plans each tier's first level, which unlocks refining that tier, and the rest of its levels from refines of that tier in the resource's bonus city, and counts how one refine fills several first levels at once. The fame and level rules come from Albion's own game files.
- **Crafting, with Show me the money.** The original app's crafting plans on v2's prices: pick a crafting line (Sword Crafter, Bag Tailor, any of the 38 with recipes) and the app prices every item it can craft, T4 to T8 at every enchantment, then plans a day: focus first where it adds the most silver a point, the materials budget on the crafts that return the most, at most eight different items, never more than a market's safe share. It shows the day's crafts and where to sell them, every item in the line with an 80% range, profit each by tier and enchantment, how the same day did over each of the last four weeks, every craft ranked, a price sheet with break-evens and the most to pay for each material, and the day as a daily loop around the cities for your pack mount. **Show me the money** picks the single item in the line whose day earns the most, and plans it.
- **Alerts and timers.** A price alert on any item in any market (when the cheapest listing drops to your price, or the best buy order reaches it), checked against every price reload (and in the Windows app, every price your Data Client captures), with the item's usual range as a starting price. Island, laborer and focus timers, and a countdown to each server's daily maintenance. The Android app's reminders arrive even with the app closed.

## Pages

| Page | What it answers |
|---|---|
| **Command** | Your chance of the goal by the deadline, today's plan for your hours and capital, the confidence ladder of the top plays, where the money moves, crashes worth buying and spikes to sell into. |
| **Opportunities** | Every play (about 1,200 on the snapshot) on a risk-and-reward map and in a ranked table. Filter by strategy, confidence and zone; sort by best bet, per hour, profit, confidence or return. Open any play for its confidence breakdown, outcome histogram, step-by-step instructions, the price behind each leg and its backtest. |
| **Edge Lab** | The research: crash rebounds, the Black Market premium, which enchanting materials pay, how long gaps between markets last, weekend volume, and the two myths that failed. |
| **Markets** | Any item in all eight markets: four weeks of sales, a calibrated forecast with its 80% and 50% bands, where to buy and where to sell, and the plays that use it. |
| **Planner** | The road to a billion in detail: the fan of paths, the odds for other hours and capital (with your own spot ringed), what holds you back month by month, and today's routine. |
| **Cost to Max** | The cheapest way to level a crafting specialization or mastery, or a refining line, to 100 from your levels: the running cost by level with its range, silver per fame for every tier and enchantment, what more time buys, each stage's crafts or refines and where to sell them, each stage's daily loop around the cities for your mount, every specialization in the line compared, and where the silver goes. |
| **Crafting** | What to craft for profit in one crafting line, and the daily loop that makes it pay: the best mix of the line's top items or one item, the day's crafts and where to sell them, every item compared with its range, profit each by tier and enchantment, the last four weeks, every craft ranked, the price sheet, and Show me the money for the single item that earns the most. |
| **Trust** | How far to believe every number: calibration charts, how the score works, today's plays by confidence, price freshness, and what the app can't know. |
| **Ledger** | Net worth check-ins against the straight pace to your goal, logged trades, and your own calibration. |
| **Alerts** | Price alerts on any item in any market, your island, laborer and focus timers with reminders, and each server's daily maintenance. Any item page has an Alert button that fills the form in. |
| **Settings** | Server, premium, your silver, gear and focus, data source, how often prices reload, theme, backup and reset. |

## The strategies

| Strategy | What you do | Evidence behind the odds |
|---|---|---|
| Black Market flip | Buy from a Caerleon sell order, sell straight into a Black Market buy order. | Held-out odds that a gap into the Black Market still beats fees the next day. |
| Enchant forge | Buy the item one enchantment level down, enchant it with runes, souls or relics, sell the upgrade to the Black Market. | Backtest of enchant-and-sell by material (win rate shrunk toward a coin flip when thin). |
| Safe haul | Buy in one royal city, carry it through blue and yellow zones, list it in another. | Held-out odds that a gap of that size still beats fees the next day (715,189 test gaps). |
| Caerleon run | Buy in a royal city, sell to the Black Market through red zones. | The same gap odds for Black Market gaps. Gank risk is not in the odds. |
| Panic buy | Buy what just crashed in a busy market and relist it over the week. | How often crashes of that size and market size came back past fees within a week. |
| Focus refining | Refine at the bonus city with focus (53.9% return) and sell the result. | Calibrated ranges; not backtested as a whole play, so its evidence check stays neutral. |
| Craft for the Black Market | Craft gear at its bonus city from the cheapest materials, sell to a Black Market buy order. | Calibrated ranges; neutral evidence. |
| Order flip | Buy order one silver above the best, relist one silver under the cheapest sell order. | Live order books only; whether your orders fill is a guess, so the evidence check is lower. |

## Reading the numbers

- **Profit range.** "+1.56M, 80%: 663k to 2.79M" means that in 80% of simulated outcomes the batch made between 663k and 2.79M. Each outcome draws every price the play rests on: a listing still holds with a chance equal to its freshness, otherwise the price comes from the calibrated range for the day you act.
- **Confidence score.** A guide, not a probability: High is 70 and up, Medium 50, Low 30, Very low below 30. It ranks plays together with profit per hour (`rank = expected profit per hour × (score / 100)²`).
- **Odds.** "Chance it pays", the haul odds and the chance of reaching your goal are probabilities. The goal odds come with a 95% interval for the simulation's own sampling error.

[docs/METHOD.md](docs/METHOD.md) explains every model, its data, its tests and its limits.

## Prices: live or snapshot

With internet, the app reads live order prices and daily sales from the free [Albion Online Data Project](https://www.albion-online-data.com/) (Americas, Europe or Asia server). When that server can't be reached it says so, and uses the saved snapshot in `assets/data/v2/snapshot.json`: 28 days of daily sales for the items the scanners use (Americas, to 2026-10-17). In snapshot mode every range is widened for the snapshot's age and every confidence score is lowered for it. Settings can force either source.

**How often prices reload.** While the app is open on live prices, current prices reload by themselves **every minute** (Settings: every minute, every 5 minutes, or only with the reload button). That is as often as is useful without risking the server's limits:

- The server allows 100 requests a minute and 300 every 5 minutes from one internet connection, and blocks a connection for 5 minutes if it keeps asking after being told to slow down. A reload asks only for current orders (about 7 requests; the four-week histories are kept), and the app holds itself to two thirds of each limit, so your other devices and tools on the same Wi-Fi keep room. If the server does say slow down, nothing is sent until its window resets.
- The server keeps prices in 5-minute steps and only learns new ones when players open markets with the Albion Data Client, so asking more often would mostly fetch the same numbers again.
- New prices wait for a calm moment: not while you type in a field, have a play, menu or chart tooltip open, have text selected, or within two seconds of a tap, key or scroll. Pages that show current prices redraw in place, keeping filters, scroll position and keyboard focus. Reloads pause while the app is hidden and catch up when it comes back. A reload that fails keeps the prices on screen and tries again later.

For prices within seconds of the markets you open yourself, run the Data Client from the Windows app (below).

In the Windows app, **Settings → Windows app → Start the Data Client** runs the official Albion Data Client with this app as an extra destination (its normal upload to the public project carries on). Every market you open in game then reaches the app **within about a second**: the prices go straight into the plays and your alerts, replacing older public prices, without a single request to the price server, so they don't count against its limits. While you click through markets the plays are scored again at most every 2 seconds, and while the app is minimised the captures wait, so scoring never takes processor time from the game. Captured prices show as "just now" on item pages, and the Trust page says how many of the prices on screen came from your Data Client.

## Run it

It is a static site: no build step for the browser.

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

Or open `index.html` from any static host (GitHub Pages works as is).

### Tests and lint

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci   # once: the page tests need jsdom, a simulated browser
npm test         # 181 tests with Node's built-in runner (Node 22)
npm run lint     # ESLint's correctness rules (fetches a pinned ESLint on first run)
```

The tests load the real app scripts in Node and check the statistics, the calibration claims the Trust page makes, the scanners, the simulator, the shipped data files, the settings and ledger against doctored backups, live mode against a fake price server (URL limits, the request budget, waiting out a rate limit, order flips, listing freshness, prices captured by the Windows app, a reload that asks only for current prices), the Windows app's Data Client link (uploads gathered into one push within a second, the page's own lookups, web pages turned away), the rules behind alerts and timers (which prices meet an alert, how old a price may be, how often one may fire, maintenance across the day line, the focus refill), and Cost to Max (fame and levels matching the game, the stage-by-stage choice against an exhaustive search, markets never taking more than their share, totals that add up, more time never costing more, journals counted only as far as they sell, Royal cities only and the sell limit doing what they say; for refining, the game's fame per refine, first levels that unlock tiers and fill together, and each stage refining only the tiers it may), Crafting (each market's share, the budget, the focus, the margin and the eight-item limit held, totals that add up, focus never earning less than the same day without it, each week's prices, the price sheet's break-evens and most-to-pay, and Show me the money picking the item whose own day earns most), and the daily loop (every craft sold, banked or kept once, each leg carrying what its stops send, the lightest ride around the ring, a small mount giving up weight, Expand adding only what pays within 90% of the mount, refining your own only past 5%). The page tests boot the whole app in jsdom and use it as a player would: a play opens once however many pages came before, one delete removes one trade, each page keeps its own filters, a Planner edit draws the page once, a restored backup can't put markup into a page, a broken link still loads, the price source ends where the player last asked for it, an alert set from an item page fires once with a notification and a badge, the alert form refuses what can't work, the timers drive the reminders, and reloaded prices wait while the player types or reads a play, keep filters and table views, update an item page in place, retry after a failure, pause while the app is hidden, never double up, and check alerts without a request of their own, an alert that keeps not firing never stalls the app, and Data Client captures reach the page and fire alerts with no request, survive a reload that's running, wait while the app is hidden, never cut short a failed reload's wait, never put older prices back, and arrive together when they come in bursts; and Cost to Max draws a route, switches between crafting and refining, saves the levels typed in, opens routes from links, says when a route can't be priced or is done, keeps a line's prices once loaded and retries a failed load when asked, and redraws only the daily loop when its stage, mount, Mammoth or Expand changes; and Crafting plans a line's best mix, plans the item Show me the money picks and says what it earns, switches lines and items, re-plans once for a new budget or tier, redraws only the loop for a new mount, says when nothing pays or nothing can be priced, and shares a line's prices with Cost to Max. `.github/workflows/tests.yml` runs the tests and lint on every push to the v2 branch and on pull requests.

### Android and Windows

```sh
npm ci
npm run android:sync     # copies the app into www/ and syncs the Capacitor Android project
npm run desktop          # runs the Windows/Electron app locally
npm run desktop:win      # builds Albion-Billionaire-v2-Setup.exe and -portable.exe into dist/
```

Reminders and price alerts use `@capacitor/local-notifications` on Android, which hands them to the system so they arrive with the app closed (the status-bar icon is `resources/android/drawable/ic_stat_crown.xml`). The Windows app and browsers show them while the app runs, minimised included.

`.github/workflows/android.yml` and `windows.yml` build v2 and publish releases tagged `v2-android-build-N` and `v2-windows-build-N`, never marked "latest", so the original app's download links and update check never see them. They run only when started by hand; see the comment at the top of each file for building from this branch.

## Refreshing the research

The research and the snapshot are computed from saved daily history; nothing in them is typed in by hand.

```sh
python3 tools/fetch_history.py 2025-10-01 west       # daily history -> data/history/daily.csv.gz
python3 tools/v2/build_items.py path/to/items.json  # enchant costs and item power -> assets/data/v2/items.json
python3 tools/v2/build_destiny.py path/to/ao-bin-dumps  # Destiny Board crafting rules -> assets/data/v2/destiny.json
pip install numpy pandas
python3 tools/v2/build_insights.py                   # -> assets/data/v2/insights.json and snapshot.json (about a minute)
npm test                                             # the data tests check the rebuilt files
```

`items.json` and the files `build_destiny.py` reads (achievements.json, items.json, localization.json) come from [ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps). The other files in `data/history` (raw resources, hides, enchanting materials) come from the same script with an explicit item list; the exact commands are in [docs/METHOD.md](docs/METHOD.md#1-data).

## Code map

```
index.html                 the shell: sidebar, top bar, bottom nav on phones
assets/css/                app.css (tokens, light and dark, components), pages.css (page layouts)
assets/js/core/            util (formatting, UTC dates), stats, store (settings and ledger),
                           clock (maintenance and timers), catalog (items, recipes, cities),
                           api (price server, cache, snapshot), confidence (calibrated ranges, odds, the score),
                           notify (notifications on Android, Windows and in browsers)
assets/js/engine/          market (the market model), scanners (the eight strategies), sim (the road to a billion),
                           alerts (price alerts), spec (Cost to Max: Destiny Board rules and the cheapest route),
                           refine (Cost to Max for refining: the refining nodes and their route),
                           loop (the daily loop: a day of crafting or refining as a ride around the cities),
                           crafting (the Crafting page: a day of crafting for profit in one line)
assets/js/charts/charts.js dependency-free SVG charts: line and fan, bars, scatter, heatmap, forest, network map
assets/js/ui.js            shared pieces: cards, the play drawer, tables, tooltips
assets/js/pages/           one file per page, plus detail.js (the play drawer) and craftkit.js (what Cost to Max
                           and Crafting share: a line's prices and the daily loop drawn as stops)
assets/data/v2/            insights.json (research), snapshot.json (offline prices), items.json (item data),
                           destiny.json (the Destiny Board's crafting and refining rules)
tools/v2/                  build_insights.py, build_items.py and build_destiny.py
tests/                     the Node test suite
desktop/                   the Electron shell (Windows)
```

## Not carried over from the original app

v2 is a fresh start focused on market plays and how far to trust them. These parts of the original app are not in v2: the playstyle plans and method playbooks, the wiki, the spec calculator (Cost to Max now plans crafting specializations and refining), the quality and island calculators, wealth by bank location, the character lookup, the laborer optimizer and focus budget planner, the loss budget, the Matchups tab, and the "Spend real money?" wheel. Any of them can come back.

## Notes

- Profit ranges and odds are estimates calibrated on past prices. Check the order book in game before you commit silver.
- Not affiliated with Sandbox Interactive. Prices from the Albion Online Data Project; item data from ao-bin-dumps.
