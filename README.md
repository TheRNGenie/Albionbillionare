# Albion Billionaire

A one-page web app, styled after Albion Online (dark leather and brass, parchment in light mode, carved gold capitals), for reaching **1,000,000,000 silver in Albion Online within a year**, built for a player with premium and a fully upgraded personal island.

## What's inside

- **Plan**: six playstyle paths (Tycoon, Merchant, Artisan, Homesteader, Gatherer, Adventurer). Each path has a day-by-day compounding projection to 1B, four phases with concrete actions, and a daily routine checklist. A *What if* box runs a daily routine for a set number of days and shows the net worth change in silver and percent, plus spec levels gained on each refining, crafting and farming node.
- **Best picks**: ranks what to plant, what to refine with focus, what to flip on the Black Market, which items to order-flip, and which journals to fill, from live prices and last week's sales. Every pick says why: price and city, costs after fees, profit, how much the market buys per day, and the risk.
- **Methods**: step-by-step playbooks for island farming, focus refining, crafting, order flipping, Black Market flipping, trade routes, gathering, PvE and fishing.
- **Market**: live prices for every royal city, Brecilien and the Black Market from the free [Albion Online Data Project](https://www.albion-online-data.com/) API. Presets for refined and raw resources, crops and herbs, Black Market flips, plus a searchable watchlist. Click any item for 7-day volume. Shows the live gold price.
- **Calculators**: your spec (refining tiers, crafting nodes, farming tiers, gathering), refining profit across T4 to T8 with focus cost from your spec, crafting quality odds from your quality bonus (developer-posted quality table and roll rule), order flip profit and break-even, and island harvest profit. Focus cost follows the game rule: base × 0.5^(efficiency / 10,000), with 30 efficiency per level in a line and 250 more per level in the exact tier or item.
- **Wiki**: premium, islands, focus, taxes and fees, return rates, refining recipes, crafting bonus cities, tiers, zones, the Black Market and journals.
- **Progress**: a wealth sheet that splits liquid wealth (bank silver, buy orders, gold) from solid wealth (items valued at live market prices or your own), sortable by value. A character lookup from Albion's official game info API shows guild and lifetime crafting, gathering and farming fame, and the fame gained between lookups. Log your wealth over time and compare it with your plan. Gold converts to silver at the live gold price, or a rate you set. Data stays in your browser.
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
