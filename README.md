# Albion Billionaire

A one-page web app, styled after Albion Online (dark leather and brass, parchment in light mode, carved gold capitals), for reaching **1,000,000,000 silver in Albion Online within a year**, built for a player with premium and a fully upgraded personal island.

## What's inside

- **Plan**: six playstyle paths (Tycoon, Merchant, Artisan, Homesteader, Gatherer, Adventurer). Each path has a day-by-day compounding projection to 1B, four phases with concrete actions, and a daily routine checklist. A *What if* box runs a daily routine for a set number of days and shows the net worth change in silver and percent, plus spec levels gained on each refining, crafting and farming node.
- **Best picks**: ranks what to plant, what to refine with focus, what to flip on the Black Market, which items to order-flip, and which journals to fill, from live prices and last week's sales. Every pick says why: price and city, costs after fees, profit, how much the market buys per day, and the risk.
- **Methods**: step-by-step playbooks for island farming, focus refining, crafting, order flipping, Black Market flipping, trade routes, gathering, PvE and fishing.
- **Market**: live prices for every royal city, Brecilien and the Black Market from the free [Albion Online Data Project](https://www.albion-online-data.com/) API. Presets for refined and raw resources, crops and herbs, Black Market flips, plus a searchable watchlist. Click any item for 7-day volume. Shows the live gold price.
- **Calculators**: your spec (refining tiers, crafting nodes, farming tiers, gathering), refining profit across T4 to T8 with focus cost from your spec, crafting quality odds from your quality bonus (developer-posted quality table and roll rule), order flip profit and break-even, and island harvest profit. Focus cost follows the game rule: base × 0.5^(efficiency / 10,000), with 30 efficiency per level in a line and 250 more per level in the exact tier or item.
- **Wiki**: premium, islands, focus, taxes and fees, return rates, refining recipes, crafting bonus cities, tiers, zones, the Black Market and journals.
- **Wealth**: enter each bank's value by location (the estimate the game shows on every bank), plus items on sell orders and silver in buy orders, your silver and gold. Shows net worth, liquid vs solid, a stacked bar chart by location, and net worth over time (saved once a day). Optional item list priced at live market value.
- **Times**: everything in Vancouver time (DST handled). Daily maintenance for each server (10:00 UTC Americas and Europe, about 23:00 UTC Asia) with countdowns, a header clock, island harvest and focus-full timers, plan milestones and premium end. *Best hours to buy and sell* tests a week of hourly market history and only names an hour when its price gap beats day-to-day noise on most days.
- **Tools**: a haul planner (fits a load to your mount's carry limit and budget, prices both ends, rates the route risk and the share of runs you can lose and still profit), a crafting shopping list (every material, cheapest city, cost, with return rate), and backup and restore of everything you enter.
- **Profit ledger** (Progress tab): log each session's method, hours and silver to see what really pays you per hour.
- **Price alerts** (Market tab): get told when a listing drops to, or a buy order reaches, your price. Checked when the app opens and every 10 minutes while it is open; the Android app sends a phone notification.
- **Change of pace**: suggests a method outside your chosen path for a few hours or days, with why it's a change and a three-step starter plan.
- **Progress**: a character lookup from Albion's official game info API shows guild and lifetime crafting, gathering and farming fame, and the fame gained between lookups. Log your wealth over time and compare it with your plan. Gold converts to silver at the live gold price, or a rate you set. Data stays in your browser.
- **Spend real money? wheel**: 30 slices, 1 YES and 29 NO, picked with a fair random draw.
- **Welcome message**: a greeting shown when the app opens. Use the Edit message button to change it; placeholders like `{daily}` and `{progress}` fill in with your numbers. Turn it off there too, and reopen it with the Welcome button.

## Run it

It is a static site with no build step.

- **GitHub Pages**: in the repository's Settings → Pages, set *Source* to *Deploy from a branch*, branch `main`, folder `/ (root)`. The app is then served at `https://<user>.github.io/<repo>/`.
- **Locally**: open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit `http://localhost:8000`.

Live prices are fetched by your browser directly from the Albion Online Data Project. If a host blocks that request, the Market tab offers a link to open the price data and a box to paste it in.

## Notes

- Income figures are community estimates. Prices and patches change, so check the Market tab before committing silver.
- Price freshness depends on players running the Albion Data client. Faded cells in the Market table are more than a day old.
- Not affiliated with Sandbox Interactive.

## Android app

The same app is packaged for Android with [Capacitor](https://capacitorjs.com/). Every push to `main` or the app branch runs `.github/workflows/android.yml`, which builds `albion-billionaire.apk` and publishes it as a GitHub release.

- **Install**: open the repository's *Releases* page on your phone, download `albion-billionaire.apk` from the newest release and open it. Allow installs from your browser or files app when Android asks.
- **Updates**: every build is signed with the same key (`tools/android-debug.keystore`), so a new APK installs over the old one and keeps your data.
- In the app, live prices and the character lookup go through Android's own network stack, so nothing is blocked the way a browser can block it. Price alerts arrive as phone notifications.
- Recipes, base focus costs and item weights come from Albion's item data (`assets/data/recipes.json`). Rebuild it after a game patch with `python3 tools/build_recipes.py items.json`, using `items.json` from [ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps).
- Build it yourself: `npm ci`, `npm run android:sync`, then open `android/` in Android Studio.

## Safe daily amounts and hidden gems

- **Safe daily amount** (Tools, and under each Best pick): how many you can add to a market each day before moving its price. It uses up to 28 days of daily sales: the normal and slow-day volume, a fitted price-vs-volume effect (used only when it beats twice its standard error), and a share of a slow day otherwise. The cap is halved when prices are falling more than 5% a week.
- **Hidden gems** (Best picks): margins of 25% or more on things that sell under 5 a day, each proven by at least 3 sales last week near the price used.

- **Safe Options** (Best picks toggle): only royal cities, linked by blue and yellow zones. Black Market flips are swapped for safe royal-city hauls so the page keeps the same number of picks.

## Island, focus, laborers and losses

- **Focus budget planner** (Tools): spends your focus on the refines and crafts that add the most silver per point, each capped at what its market takes in a day.
- **Island timers and checklist** (Times): harvest, laborer and focus timers with reminders (scheduled phone notifications in the Android app; desktop notifications while the Windows app runs) and a daily island checklist.
- **Laborer optimizer** (Tools): what each full journal returns, from `assets/data/laborers.json` (built by `tools/build_laborers.py` from Albion's item data), at your laborers' happiness (100 per tier for full yield, +0.5% per point above, up to +50%, per the official wiki).
- **Return rate by city** (Tools → Crafting shopping list): every city's return rate for the recipe, its bonus city, and the materials cost in each.
- **Loss budget** (Tools): log losses and count risky runs; risky Best picks then show your real average loss per run.

## Crafting plans

The Crafting tab builds a full plan for one category the player picks (swords, leather jackets, potions and so on); it never shows a single overall best. Every item in the category, up to the highest tier the player can craft and at every enchant, is priced from the last 28 days of Albion Data Project daily history (normal quality, royal cities, plus Caerleon and the Black Market when that toggle is on). Each item is crafted in its bonus city at the wiki's return rates, after 6.5% market fees and a 2% station-fee allowance.

Each stage (spec 0 to 30, 30 to 75, 75 to 100) runs the same day: 10,000 focus on the crafts focus helps most, then the material budget on no-focus crafts with the best return, never more than the safe daily amount per city, and at most 8 different items. The report covers the pick, every item ranked, the route by stage with crafting fame, return rates and focus by spec, a city-by-city loop, the shopping list, refining your own materials, a price sheet with targets and break-even limits, and the risks. The same crafts are re-priced with each of the four weeks to give a worst week. Logic lives in `assets/js/crafting.js`.

## Windows app

The same app runs as a Windows desktop program, built with Electron by `.github/workflows/windows.yml` on every push.
Each build is attached to a `windows-build-N` release:

- `Albion-Billionaire-Setup.exe` installs it with Start menu and desktop shortcuts.
- `Albion-Billionaire-portable.exe` runs without installing.

**Albion Data Client link:** Tools → Albion Data Client link starts the official client with `-p http://127.0.0.1:47811`, so it keeps uploading to the public project and also sends this app every market order you view. Those prices replace the public ones whenever they're newer. You can instead add that flag to the client's own shortcut.

Item names and recipes ship inside the app. It only contacts GitHub when you press **Check for updates** under Tools: it compares your build number with the newest `windows-build-N` release, and the installed app downloads that Setup.exe and runs it (it upgrades in place and keeps your data). The portable copy opens the release page instead. Other network calls are the Albion Online Data Project prices, Albion's player lookup and Google Fonts.
Your data lives in the app on that PC; use **Tools → Backup** to move it between your phone and PC.
Windows may warn that the app is unsigned: choose **More info → Run anyway**.

Run it locally with `npm install && npm run desktop`; build the Windows files with `npm run desktop:win`.
