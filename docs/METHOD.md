# How Albion Billionaire v2 works

This is the method behind every number the app shows: where the data comes from, how each model was fitted and tested, how a play is scored, how the road to a billion is simulated, and what the app cannot know. Every figure quoted here is read from `assets/data/v2/insights.json`, which `tools/v2/build_insights.py` computes from the saved history; nothing is typed in by hand.

The app keeps two kinds of numbers apart:

1. **Calibrated probabilities**: price and profit ranges, the chance a play pays, the odds that a gap between markets lasts, the chance of reaching your goal. These were tested on months the models never saw.
2. **A confidence score** from 0 to 100 that blends six checks into one number. It ranks and colours plays; it is a guide, not a probability.

## 1. Data

**Daily history.** `data/history/*.csv.gz` holds the Albion Online Data Project's daily history (`/api/v2/stats/history`, `time-scale=24`) for the Americas server and eight markets: the five royal cities, Caerleon, Brecilien and the Black Market. Each row is item, market, date, number sold and average price, with all qualities summed and the price weighted by count. After cleaning there are 1,736,374 daily records for 2,507 items from 2026-03-31 to 2026-10-17. The requests asked for history from October 2025; the server returned nothing earlier than these dates.

The files were collected by `tools/fetch_history.py` on GitHub Actions (branch `claude/project-thread-wzqm2p`, workflow `price-history.yml`); the copies here are byte-identical. To rebuild them:

```sh
# gear and refined resources (T4-T8 items made only from planks, bars, leather or cloth, and those resources)
python3 tools/fetch_history.py 2025-10-01 west
# raw and refined resources at every tier and enchantment
python3 tools/fetch_history.py 2025-10-01 west T3_ORE,T4_ORE,...,T8_LEATHER_LEVEL3@3 data/history/raw.csv.gz
# enchanting materials (FETCH_BATCH=1: the server returns nothing for some batches of these)
FETCH_BATCH=1 python3 tools/fetch_history.py 2025-10-01 west T4_RUNE,T4_SOUL,T4_RELIC,T5_RUNE,T5_SOUL,T5_RELIC,T6_RUNE,T6_SOUL,T6_RELIC data/history/enchant_t4_t6.csv.gz
python3 tools/fetch_history.py 2025-10-01 west T4_RUNE,...,T8_RELIC data/history/enchant.csv.gz
```

The full id lists are in that branch's `.github/workflows/price-history.yml`. `hides.csv.gz` (raw and refined hides) came from the same script with an explicit list.

**Item data.** Names, recipes, focus costs and weights come from Albion's own item files via [ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps) (`assets/data/names.json` and `recipes.json`, shared with the original app's tools). `tools/v2/build_items.py` adds the enchanting costs (runes for .0 to .1, souls for .1 to .2, relics for .2 to .3) and item power (`assets/data/v2/items.json`).

**Snapshot.** `assets/data/v2/snapshot.json` is the last 28 days of the history (2026-09-20 to 2026-10-17) for the 1,838 items the scanners check. The app uses it when the live server can't be reached, and says so on every page.

**Live data.** From the player's own device the app reads current orders (`/api/v2/stats/prices`, normal quality) and daily history (`/api/v2/stats/history`, normal quality, 28 days) from the server the player picks. Requests are split to stay under the URL length limit, run six at a time, and are cached in IndexedDB (orders for 5 minutes, daily history for 3 hours; copies older than a day are dropped once a session). History is fetched only for items that could be part of a play, and kept per item, so an item that newly matters fetches only its own.

**Request budget.** The server allows 100 requests a minute and 300 every 5 minutes from one internet connection (`/api/v2/`, fixed windows counted from 1970), answers HTTP 429 past that, and blocks a connection for 5 minutes if it keeps going after a 429. The app holds itself to 60 requests in any minute and 200 in any 5 minutes, so the player's other devices and tools on the same connection keep room; a request that would go over waits its turn. After a 429 nothing is sent until the server's window resets. The reset time comes from the `RateLimit-Reset` header when the page can read it; a page on another origin usually can't, so the app reads the period from the message ("…100 per 60 seconds…") and waits for the next whole period plus a second. A load waits out a reset up to about a minute away and tries that request once more; a later reset ends the load with a message saying when prices can load again.

**Automatic reloads.** While the app is open on live prices, current orders reload by themselves every minute (or every 5 minutes, or only with the reload button: Settings). A reload asks only for current orders, about 7 requests for the 870 items the scanners read, and keeps the four-week histories it already has, so one reload is about 12% of the server's per-minute allowance. A minute is as often as is useful: the server keeps prices in 5-minute steps and only learns new ones when players open markets with the Albion Data Client, so reloading faster would mostly fetch the same numbers, and every few seconds would crowd out the item pages, alerts and other devices that share the limit. The new prices are scored one strategy at a time (so the page stays responsive) and wait for a calm moment: not while the player types in a field, has a play, menu or chart tooltip open, has text selected, or within two seconds of a tap, key or scroll. Pages that show current prices then redraw in place, keeping filters, scroll position and keyboard focus. Reloads pause while the app is hidden and catch up when it is back. A reload that fails keeps the prices on screen and tries again after twice the interval, then four times, up to 10 minutes, never before the server allows; a reload never switches to the snapshot. If live prices stop loading partway through, the app finishes on the saved snapshot and says why until the next reload, rather than mixing the two. In the Windows app, prices the player's own Albion Data Client captured replace public prices whenever they are newer, and they arrive between reloads too (below).

**Prices from the player's own Data Client (Windows app).** The Windows app listens on this PC for the official Albion Data Client, started with the app as an extra destination (`-p`, on top of its normal upload to the public project). It keeps the newest price per item, market and quality: for each upload, the cheapest sell offer and the best buy order. Opening one market in game makes several uploads, so the markets that changed are gathered for 0.8 seconds and pushed to the page together. The page keeps the ones the scanners use (normal quality, the nine markets), merges them into the model on screen (a captured price replaces the row's when it was seen later, and a market with no row gets one), checks the alerts the model covers, and scores every play again, one strategy at a time; the result reaches the page at the same calm moment a reload's does. None of this asks the price server anything: the four-week histories and the time prices were last checked stay as they were, and an item a capture makes worth a look gets its history at the next reload. Scoring every play takes about a third of a second, so while the player clicks through markets the plays are scored again at most every 2 seconds, with everything that arrived in between; while the app is hidden the captures wait, so scoring never takes processor time from the game. Every model built afterwards merges the captures too, so a reload never undoes a newer capture, and a capture still being scored when a reload ends is dropped rather than shown over the reload's newer prices. In a measured run in Chromium, a capture reached the item page 0.3 seconds after the push, and a capture listing an item in Caerleon at 55% of the Black Market's buy order put a new Black Market flip on the list in the same 0.3 seconds, with no request either time.

## 2. Calibrated price ranges

*Code: `price_model` in `tools/v2/build_insights.py`; `seriesStats`, `priceAt` and `sampler` in `assets/js/core/confidence.js`.*

For each item in each market, on each day:

- **Forecast** = the median log price of the last 7 days (at least 4 days with sales).
- **Scale** σ = 1.4826 × the median absolute deviation of log prices over the last 14 days (at least 7 days with sales), floored at 0.01. For normal data this estimates the standard deviation, but it isn't thrown by one stray sale.
- **Error** z = (log price h days later − forecast) / σ, for h = 1, 3 and 7 days.

The error's quantiles (21 levels from 2.5% to 97.5%) are measured separately for each horizon × market size (median daily sales over 14 days: under 5, 5 to 20, 20 to 100, 100 and up) × volatility level (σ under 0.04, 0.04 to 0.08, 0.08 to 0.15, 0.15 to 0.3, 0.3 and up). A cell with fewer than 400 training cases uses its market-size table. Splitting by volatility matters: in units of their own scale, steady markets have fat tails and wild markets thin ones, so one shared table is too narrow for the first and far too wide for the second.

**Train and test.** The data is split by date at 2026-07-09. Training uses forecasts made before the split whose outcome is also before it (an embargo of h days), so no test-month price reaches the tables. Testing uses every forecast made from the split on: 2,001,387 cases, against 2,235,492 for training.

**Results on the test months** (share of real prices inside the range):

| Promised | 10% | 30% | 50% | 70% | 80% | 90% | 95% |
|---|---|---|---|---|---|---|---|
| This app | 10.1% | 30.1% | 50.1% | 70.0% | 79.9% | 89.9% | 94.9% |
| Plain bell curve, same σ | 8.5% | 23.5% | 38.0% | 52.5% | 60.1% | 68.8% | 74.3% |

| 80% range held, by volatility | Very steady | Steady | Normal | Jumpy | Wild |
|---|---|---|---|---|---|
| This app (per-level tables) | 80.4% | 80.1% | 79.5% | 79.4% | 79.5% |
| One table per market size | 65.7% | 80.3% | 86.5% | 91.3% | 95.1% |
| Plain bell curve | 45.6% | 58.1% | 65.9% | 73.7% | 81.9% |

Honest ranges are not narrow ones: the median 80% range spans 32% of the price one day out, 38% three days out and 49% a week out.

**In the app.** Between 1, 3 and 7 days the z-values are interpolated; beyond 7 days they widen with the square root of time. A series without enough history to calibrate gets a wide normal band (1.6 × its whole-history scale, also widening with time) and a lower "Enough history" check. In snapshot mode every range is taken as many days ahead as the snapshot is old.

## 3. Do gaps between markets last?

*Code: `survival` in the build script; `conf.survival` in the app.*

A gap is a day when an item's average price in one market is more than 12.4% above a royal city's (a log gap of 0.117: the 6.5% fees plus a 0.05 margin). For every such day the study records whether the gap still beat fees one and two days later, by destination (another royal city, Caerleon, the Black Market), the destination's market size and the gap size (12 to 20%, 20 to 30%, 30 to 50%, 50 to 100%, over 100%). The odds come from 911,112 training gaps resolved before the split; tested on 715,189 later gaps grouped by their predicted chance, predicted and observed shares agree within 0.7 points in every group (for example 85.6% predicted, 84.9% observed). Black Market gaps last longest: a 30 to 50% gap into the Black Market in a busy market still beat fees the next day 98.6% of the time; the same gap between two royal cities, 83%.

## 4. Crashes and spikes

*Code: `rebound` in the build script.*

Each day's price is compared with the item's trailing 14-day median (excluding that day). The study then averages the next seven days' prices and asks whether that average beat today's price plus fees (for a drop) or fell below it minus fees (for a spike), by the size of the move and the market size. In markets selling 20 or more a day, after a 25 to 40% crash the next week averaged 12.7% above the crash price, and beat it plus fees 60% of the time (28,280 crashes). After a 25 to 40% spike the next week averaged 10.4% lower (30,910 spikes). Moves under 8% are noise. The Panic buy strategy draws its resale price from the measured quantiles of that next-week change, for the play's crash size and market size.

## 5. Enchanting for the Black Market

*Code: `enchant` in the build script.*

For every gear item, enchantment step and buying city (the royal cities, Caerleon and Brecilien), each day: buy the item one level down and the runes, souls or relics in that city at the day's average prices, and sell the upgrade either into the Black Market (4% tax) or in the same city (4% tax plus the 2.5% listing fee). A day "wins" when it clears a 5% margin. For the median item-city pair, results vary hugely by material: T5 relics won on every day tested (527 pairs), T7 souls on 98.6%, T4 runes on 93.9%, but T8 souls on 17% and T8 relics never, because the T8 materials cost more than the Black Market adds. Selling in the same city instead of the Black Market wins far less often for every material. In the app, a forge play's evidence is its material's win rate, pulled toward a coin flip by 30 imaginary cases so a thin backtest can't look certain.

## 6. The other studies

- **Black Market premium.** For the same item and day, the Black Market's average price over the median royal-city price: a median of +41%, positive 87% of the time (1,881 items). It is sticky: an item's premium today correlates 0.52 with tomorrow's (the median across items).
- **Weekday myth (busted).** Each market's average weekday price shape, measured on the first half of the data, against the second half. In hindsight the gap between the cheapest and dearest weekday averages 9.7%; out of sample it is 0.2%, and the median correlation between the two halves is 0.03, across 7,048 item-markets. Volume does follow the week (Saturday and Sunday sell more), so weekends are about speed, not price.
- **Raw-to-refined lead (busted).** Correlations between three-day moves in raw and refined prices, with refined shifted from 6 days before to 6 days after: all within a few hundredths of zero (45 pairs). Raw prices don't tell you where refined prices go.
- **Price index.** Each item-market's monthly average price against April, the first full month, summarised per kind (gear, refined, raw) as a median weighted by how many each sold in April. A fixed base means no drift from chaining months.

## 7. Scoring a play

*Code: `assets/js/engine/scanners.js` (`finish` and one scanner per strategy) and `assets/js/core/confidence.js`.*

**Legs.** A play is a list of legs (buy, material, sell), each a price in one market. When the simulation draws an outcome, a listed price still holds with a chance equal to its freshness; otherwise the price is a draw from that market's calibrated range for the day you act. Prices you set yourself (a sell order you list after a haul) are always model draws. Hauls never buy from live listings older than 48 hours.

**Profit range.** 400 draws per play, with a seed taken from the play's key, so the same market always gives the same numbers. The batch size is the smallest of the play's limits: 35% of your trading capital, a share of what the destination sells a day, what the source can supply, what your mount can carry, and your daily focus for refining. The batch's range is the per-unit range times the batch (one market moves every unit the same way).

**Confidence score.** Six checks, each from 0 to 1:

| Check | Weight | How it's measured |
|---|---|---|
| Fresh prices | 20% | Live listings lose half their weight every 18 hours (the oldest listing the play uses counts); snapshot days every 3 days. |
| Busy market | 20% | 1 − e^(−sales a day / 8), from the 14-day median: 5 a day scores 0.46, 20 a day 0.92. |
| Enough history | 10% | 0.25 + 0.75 × (days with sales in the last 14) / 14 for the thinnest leg, × 0.6 when its range can't be calibrated (fewer than 4 sale days in the last 7, or 7 in the last 14). |
| Listing matches sales | 15% | e^(−\|log(listing / 7-day sale median)\| / 0.15), a geometric mean over the listed legs: 15% above scores 0.39. Panic buys compare the listing with the last day's sales instead, to tell a real crash from one stray listing. |
| Chance it pays | 20% | The share of the 400 draws that made a profit. |
| Backtest evidence | 15% | The play's backtest: gap survival for hauls, the rebound rate for panic buys, the enchanting win rate for forges. Untested plays get 0.4 (order flips 0.35, because whether your orders fill at all is a guess). |

The score is the weighted geometric mean, × 100, with each check floored at 0.02. A geometric mean means one weak check pulls the whole score down: a play is only as trustworthy as its weakest link. Tiers: High 70+, Medium 50+, Low 30+, Very low below 30.

**Ranking.** Plays are ranked by expected profit per hour × (score / 100)², so a confident play beats a slightly richer doubtful one.

## 8. The road to a billion

*Code: `assets/js/engine/sim.js`.*

- **The menu.** Plays with a score of at least 35 (adjustable in the Planner) and a positive expected profit, each sized as a batch the market could absorb every day, best profit per hour first, at most 40.
- **A day.** Fill your hours with the best plays your capital can fund, keeping 15% of it in reserve (a play that ties silver up for several days needs that many days' worth); a batch squeezed below a quarter of its size by capital is skipped. Each batch is charged the hours its own size takes: a batch cut short by capital takes less time, the last play of the day shrinks to the biggest batch that fits the hours left, and a trip of fixed length that doesn't fit is skipped for a play that does. Your whole net worth counts toward the goal, but only the trading capital is traded, and profits are reinvested. The day's limit (capital, hours or market size) is recorded, which gives "What holds you back, month by month".
- **Competition.** Today's gaps are yours; later days keep only part of the edge: losses in full, gains times the share you keep (35%, 50% or 70%: cautious, balanced or bold). Later days rank plays by what you keep an hour and drop the ones that stop paying.
- **Uncertainty.** Each path draws its own edge share (a lognormal around the chosen one, about ±50%) and a market mood each week (about ±25%), on top of each play's calibrated outcome every day. Without those two the fan would be far too narrow to be honest.
- **Shared luck.** Path p's outcome for menu play i on day d is a fixed hash of (seed, p, d, i), and its edge share and moods come from its own stream, so two runs that differ only in capital or hours live through the same luck. That is why the Planner's grid moves the right way cell to cell, and why its ringed cell matches the headline odds exactly.
- **Outputs.** 400 paths over the days to your deadline (at least a week, at most two years; day d of the road falls on today + d days, so the last day is the deadline). The chance of the goal comes with a 95% Wilson interval for the simulation's own sampling error; arrival dates are the days by which 10%, 50% and 90% of all paths have reached the goal.

Command and Planner share one memoized forecast, so both pages always show the same odds.

## 9. Alerts and timers

*Code: `assets/js/engine/alerts.js`, `assets/js/core/clock.js`, `assets/js/core/notify.js`.* Unlike the rest of this page, the numbers here are game rules, published times and the app's own choices (48 hours, 6 hours, 10 minutes), not research results.

- **A price alert** is an item, a market, a rule and a price. "The cheapest listing drops to" reads the lowest sell order (time to buy); "the best buy order reaches" reads the highest buy order (time to sell into it). The Black Market has no listings to buy from, so its alerts can only watch buy orders. Prices are for normal quality, like the rest of the app.
- **When it fires.** Alerts are checked against live prices whenever they load, so with every automatic reload, and every 10 minutes while the app is open, never against the snapshot. Alerts on items the scanners read take the reload's own prices; only the others ask the server, in one request alongside it. In the Windows app, prices the Data Client captures are checked against the alerts on items the scanners read as they arrive, with no request. One fires when a price seen in the last 48 hours is at or past its line (an older price is shown, marked too old to count). While it stays met it fires at most once every 6 hours, so a price that sits at the line can't fire it over and over. A "met" from a check over 48 hours old leaves the badge and shows as waiting. An alert added while prices were loading waits for the next check rather than reading as "no price".
- **A starting price.** Picking an item and market shows its usual 80% range for today from four weeks of daily sales (the same calibrated range as Markets) and offers its low end for a buy alert or its middle for a sell alert.
- **Timers.** Crops and herbs grow in 22 hours and laborers come back 22 hours after they're handed full journals (Albion Online wiki). Focus refills by the "Focus a day" setting (10,000 with premium) up to 30,000, counted from what the player last typed in; the focus reminder comes at 95%, before the refill starts going to waste.
- **Maintenance.** Each server goes down once a day: the Americas and Europe at about 10:00 UTC, Asia at about 23:00 UTC, usually back within 15 minutes. Those times, and the length (about 10 minutes on the Americas, 6 to 8 on Europe and 5 to 7 on Asia in October 2026, now and then about 25), come from the [AlbionZVZ downtime monitor](https://www.albionzvz.com/albion-downtime). The optional reminder comes 30 minutes before.
- **Where reminders show.** The Android app hands each reminder (and a week of maintenance reminders) to the system, so they arrive with the app closed; they're refreshed when a timer, the server or the focus refill changes and whenever the app comes back on screen. Each asks for an inexact alarm, which Android may hold a few minutes, because asking for an exact one would open Android's "Alarms & reminders" settings every time. The Windows app and browsers show reminders while the app runs (minimised included). Without notification permission they show as messages inside the app while it's open. Alerts and timers are kept by "Reset settings" and saved in backups.

## 10. What is tested

`npm test` runs 114 tests with Node's built-in runner, loading the real app scripts with small browser stubs, or the whole app in jsdom for the page tests:

- **Statistics** (`stats.test.mjs`): quantiles match numpy, the seeded generator repeats, MAD estimates σ, Wilson intervals stay in [0, 1], quantile sampling and interpolation.
- **Confidence** (`confidence.test.mjs`): series statistics on hand-made markets, every model cell resolves to an increasing table, ranges widen with time, the sampler draws exactly the range `priceAt` describes, the score's bounds, weights and monotonicity, and the calibration claims the Trust page makes hold in the shipped model.
- **Data** (`data.test.mjs`): the snapshot's dates, markets and coverage of the scanning universe, the train and test months, and sane item data.
- **Engine** (`engine.test.mjs`): snapshot mode, every strategy present, every play internally consistent, every batch limit respected, determinism, and settings flowing through.
- **Live mode** (`live.test.mjs`): against a fake price server: URL limits, nothing sent after a 429 until the server's window resets, history only for candidates, order flips priced one silver inside the spread, freshness from listing ages, Windows-captured prices winning when newer, an automatic reload asking only for current prices (one request per chunk) and giving the same plays, a failed reload leaving the model alone, scoring one strategy at a time matching scoring in one go, an alert check reading a load's prices for scanned items, and Data Client captures: a captured price replacing an older one only (merging it again changes nothing), going into the model with no request while the model before keeps its own prices, kept by the next reload while it's newer, and an alert check on them asking nothing.
- **Windows app link** (`desktop.test.mjs`): the Electron main process with a stand-in for Electron, fed the uploads the Data Client makes: a burst of uploads reaches the window as one push within a second, with the cheapest offer and best buy order, enchantment levels, Caerleon's second market house, and markets the app doesn't read left out; the page's own lookups return the same prices; a post from a web page (which always carries an Origin) is refused; an upload with nothing usable pushes nothing.
- **Request budget** (`api.test.mjs`): a cached copy of current prices reused for 5 minutes unless fresh ones are asked for, histories kept per item, never more requests in a window than the budget allows, a rate limit without a readable header lasting to the end of the period the server names, and a long one stopping the load with a time to retry and nothing sent until then.
- **Simulator** (`sim.test.mjs`): the menu, the competition rule, a day never overspending capital or hours, each batch charged the hours its size takes, day ranges, the fan's shape and odds, the direction of every setting, shared luck across runs, the deadline, and Command and Planner agreeing.
- **Alerts** (`alerts.test.mjs`): each rule reads the right side of the book with the line itself included, a price over 48 hours old or missing never meets an alert, a met alert fires once and not again for 6 hours, an alert added mid-check is left alone, the message wording, and checks never run without live prices.
- **Clock** (`clock.test.mjs`): maintenance before, during and after its window on each server and across a year end, the focus refill and its cap, which reminders are due and in what order (a week of maintenance for the phone), and the countdown text.
- **Formatting and events** (`util.test.mjs`): silver amounts, percentages, ages, HTML escaping, item ids, and the event rule that a listener added during an event waits for the next one.
- **Settings and ledger** (`store.test.mjs`): each setting takes only values it can hold, numbers stay in range, a check-in needs a real amount and date, a backup comes back as saved, a doctored backup keeps only what it may and leaves your ledger alone if its own is broken, and alerts and timers keep only what they can use (at most 50 alerts), survive "Reset settings" and travel in backups.
- **Pages** (`pages.test.mjs`): the whole app in jsdom, clicked through: a play opens once however many pages came before, one delete removes one trade, Opportunities and Planner keep their own filters, a Planner edit draws once, a restored backup can't put markup into any page, a link with a broken escape still loads, Reload goes back to live prices once the server answers, a live load that fails partway finishes on the snapshot, choosing Snapshot only mid-load wins, a trade logged with 0 silver records 0, a play that buys and sells in one market shows that market's chart once, an alert set from an item page fires once when its price is met (a notification, the badge, Met in the list, no second notification on the next check), the alert form refuses an alert with no item, no price, a twin or a listing rule on the Black Market, the timers count down and drive the reminders, and automatic reloads: new prices wait while the player types or has a play open, keep filters and table views, update an item page without grey placeholders, show "retrying" after a failure and recover, are due a minute after the last but not while hidden or switched off, act on a link once per visit, never double up when one runs early, and check alerts with no request of their own; an alert that the reloads keep checking without it firing never stalls the app; and Data Client captures reach the page within a second, scored, with no request, fire an alert they meet, are kept when they land during a reload, wait while the app is hidden, never cut short a failed reload's wait, never put older prices back when their scoring ends after a reload's, and arrive together, at most one scoring every 2 seconds, when they come in bursts.

## 11. What the app can't know

- **Order sizes.** The price server reports the cheapest sell order and the best buy order, not how many items sit behind them, so batch sizes come from how much sells a day.
- **Competition.** The planner assumes you keep only part of each edge; the backtested odds already include gaps closing, but not other players reacting to you.
- **Red-zone danger.** The odds cover prices, not ganks.
- **Quality.** The research sums all qualities; live prices are normal quality, and better quality sells higher at the Black Market.
- **Station fees** for crafting, refining and enchanting are not deducted.
- **Fill risk for orders you place.** Order flips assume both orders fill; their evidence check is set lower for that reason.
- **Prices change faster than the server hears about them.** Live prices come from players running the Albion Data Client, so quiet markets update less often, however often the app reloads; the freshness check is how the app accounts for that.
