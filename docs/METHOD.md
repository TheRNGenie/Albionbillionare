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

**Live data.** From the player's own device the app reads current orders (`/api/v2/stats/prices`, normal quality) and daily history (`/api/v2/stats/history`, normal quality, 28 days) from the server the player picks. Requests are split to stay under the URL length limit, run six at a time, are retried once after a rate limit, and are cached in IndexedDB (orders for 5 minutes, daily history for 3 hours). History is fetched only for items that could be part of a play. In the Windows app, prices the player's own Albion Data Client captured replace public prices whenever they are newer.

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
- **A day.** Fill your hours with the best plays your capital can fund, keeping 15% of it in reserve (a play that ties silver up for several days needs that many days' worth); a batch squeezed below a quarter of its size by capital is skipped. Your whole net worth counts toward the goal, but only the trading capital is traded, and profits are reinvested. The day's limit (capital, hours or market size) is recorded, which gives "What holds you back, month by month".
- **Competition.** Today's gaps are yours; later days keep only part of the edge: losses in full, gains times the share you keep (35%, 50% or 70%: cautious, balanced or bold). Later days rank plays by what you keep an hour and drop the ones that stop paying.
- **Uncertainty.** Each path draws its own edge share (a lognormal around the chosen one, about ±50%) and a market mood each week (about ±25%), on top of each play's calibrated outcome every day. Without those two the fan would be far too narrow to be honest.
- **Shared luck.** Path p's outcome for menu play i on day d is a fixed hash of (seed, p, d, i), and its edge share and moods come from its own stream, so two runs that differ only in capital or hours live through the same luck. That is why the Planner's grid moves the right way cell to cell, and why its ringed cell matches the headline odds exactly.
- **Outputs.** 400 paths over the days to your deadline (at least a week, at most two years; day d of the road falls on today + d days, so the last day is the deadline). The chance of the goal comes with a 95% Wilson interval for the simulation's own sampling error; arrival dates are the days by which 10%, 50% and 90% of all paths have reached the goal.

Command and Planner share one memoized forecast, so both pages always show the same odds.

## 9. What is tested

`npm test` runs 49 tests with Node's built-in runner, loading the real app scripts with small browser stubs:

- **Statistics** (`stats.test.mjs`): quantiles match numpy, the seeded generator repeats, MAD estimates σ, Wilson intervals stay in [0, 1], quantile sampling and interpolation.
- **Confidence** (`confidence.test.mjs`): series statistics on hand-made markets, every model cell resolves to an increasing table, ranges widen with time, the sampler draws exactly the range `priceAt` describes, the score's bounds, weights and monotonicity, and the calibration claims the Trust page makes hold in the shipped model.
- **Data** (`data.test.mjs`): the snapshot's dates, markets and coverage of the scanning universe, the train and test months, and sane item data.
- **Engine** (`engine.test.mjs`): snapshot mode, every strategy present, every play internally consistent, every batch limit respected, determinism, and settings flowing through.
- **Live mode** (`live.test.mjs`): against a fake price server: URL limits, a rate-limited retry, history only for candidates, order flips priced one silver inside the spread, freshness from listing ages, and Windows-captured prices winning when newer.
- **Simulator** (`sim.test.mjs`): the menu, the competition rule, a day never overspending capital or hours, day ranges, the fan's shape and odds, the direction of every setting, shared luck across runs, the deadline, and Command and Planner agreeing.
- **Formatting** (`util.test.mjs`): silver amounts, percentages, ages and HTML escaping.

## 10. What the app can't know

- **Order sizes.** The price server reports the cheapest sell order and the best buy order, not how many items sit behind them, so batch sizes come from how much sells a day.
- **Competition.** The planner assumes you keep only part of each edge; the backtested odds already include gaps closing, but not other players reacting to you.
- **Red-zone danger.** The odds cover prices, not ganks.
- **Quality.** The research sums all qualities; live prices are normal quality, and better quality sells higher at the Black Market.
- **Station fees** for crafting, refining and enchanting are not deducted.
- **Fill risk for orders you place.** Order flips assume both orders fill; their evidence check is set lower for that reason.
- **Prices change faster than the server hears about them.** Live prices come from players running the Albion Data Client, so quiet markets update less often; the freshness check is how the app accounts for that.
