# Albion Billionaire

A one-page web app, styled after Albion Online (dark leather and brass, parchment in light mode, carved gold capitals), for reaching **1,000,000,000 silver in Albion Online within a year**, built for a player with premium and a fully upgraded personal island.

## What's inside

- **Plan**: six playstyle paths (Tycoon, Merchant, Artisan, Homesteader, Gatherer, Adventurer). Each path has a day-by-day compounding projection to 1B, four phases with concrete actions, and a daily routine checklist.
- **Methods**: step-by-step playbooks for island farming, focus refining, crafting, order flipping, Black Market flipping, trade routes, gathering, PvE and fishing.
- **Market**: live prices for every royal city, Brecilien and the Black Market from the free [Albion Online Data Project](https://www.albion-online-data.com/) API. Presets for refined and raw resources, crops and herbs, Black Market flips, plus a searchable watchlist. Click any item for 7-day volume. Shows the live gold price.
- **Calculators**: refining profit across T4 to T8 (return rates, focus, daily bonus, fees), order flip profit and break-even, and island harvest profit.
- **Wiki**: premium, islands, focus, taxes and fees, return rates, refining recipes, crafting bonus cities, tiers, zones, the Black Market and journals.
- **Progress**: log your silver over time and compare it with your plan. Data stays in your browser.
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
