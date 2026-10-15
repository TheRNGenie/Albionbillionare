/* Albion Billionaire: static game data, methods, profiles and wiki content.
   Numbers marked "estimate" are community ranges, not guarantees. Verify in-game
   after patches; the Market tab pulls live prices to replace guesses. */
window.ABP = window.ABP || {};

ABP.GOAL = 1_000_000_000;
ABP.DAYS = 365;

ABP.FEES = {
  salesTaxPremium: 0.04,
  salesTaxFree: 0.08,
  setupFee: 0.025,
};

ABP.SERVERS = [
  { id: "west", label: "Americas", host: "https://west.albion-online-data.com" },
  { id: "europe", label: "Europe", host: "https://europe.albion-online-data.com" },
  { id: "east", label: "Asia", host: "https://east.albion-online-data.com" },
];

ABP.CITIES = ["Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];
ABP.BM = "Black Market";

ABP.TIER_NAMES = { 1: "Beginner", 2: "Novice", 3: "Journeyman", 4: "Adept", 5: "Expert", 6: "Master", 7: "Grandmaster", 8: "Elder" };

ABP.RESOURCES = [
  { key: "wood", raw: "WOOD", refined: "PLANKS", rawName: "Logs", refinedName: "Planks", city: "Fort Sterling" },
  { key: "ore", raw: "ORE", refined: "METALBAR", rawName: "Ore", refinedName: "Metal Bars", city: "Thetford" },
  { key: "hide", raw: "HIDE", refined: "LEATHER", rawName: "Hide", refinedName: "Leather", city: "Martlock" },
  { key: "fiber", raw: "FIBER", refined: "CLOTH", rawName: "Fiber", refinedName: "Cloth", city: "Lymhurst" },
  { key: "rock", raw: "ROCK", refined: "STONEBLOCK", rawName: "Stone", refinedName: "Stone Blocks", city: "Bridgewatch" },
];

/* Raw resources needed per refined item, by tier. Each refine also takes 1 refined item of the tier below (T3+). */
ABP.REFINE_RAW = { 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 8: 5 };

/* Return rates by setup (production bonus / (1 + bonus)). */
ABP.RRR = [
  { setup: "Royal city, no focus", rate: 0.152 },
  { setup: "Royal city + focus", rate: 0.435 },
  { setup: "Bonus city, no focus", rate: 0.367 },
  { setup: "Bonus city + focus", rate: 0.539 },
];

ABP.CRAFT_BONUS = [
  { city: "Bridgewatch", items: "Crossbows, Daggers, Cursed Staffs, Plate Armor, Cloth Shoes" },
  { city: "Fort Sterling", items: "Hammers, Spears, Holy Staffs, Plate Helmets, Cloth Armor" },
  { city: "Lymhurst", items: "Swords, Bows, Arcane Staffs, Leather Helmets, Leather Shoes" },
  { city: "Martlock", items: "Axes, Quarterstaffs, Frost Staffs, Plate Shoes, Off-hands" },
  { city: "Thetford", items: "Maces, Nature Staffs, Fire Staffs, Leather Armor, Cloth Helmets" },
  { city: "Caerleon", items: "Gathering gear, Tools, War Gloves, Shapeshifter Staffs, Food" },
  { city: "Brecilien", items: "Capes, Bags, Potions" },
];

ABP.CROPS = [
  { tier: 1, crop: "T1_CARROT", seed: "T1_FARM_CARROT_SEED", name: "Carrots" },
  { tier: 2, crop: "T2_BEAN", seed: "T2_FARM_BEAN_SEED", name: "Beans" },
  { tier: 3, crop: "T3_WHEAT", seed: "T3_FARM_WHEAT_SEED", name: "Wheat" },
  { tier: 4, crop: "T4_TURNIP", seed: "T4_FARM_TURNIP_SEED", name: "Turnips" },
  { tier: 5, crop: "T5_CABBAGE", seed: "T5_FARM_CABBAGE_SEED", name: "Cabbage" },
  { tier: 6, crop: "T6_POTATO", seed: "T6_FARM_POTATO_SEED", name: "Potatoes" },
  { tier: 7, crop: "T7_CORN", seed: "T7_FARM_CORN_SEED", name: "Corn" },
  { tier: 8, crop: "T8_PUMPKIN", seed: "T8_FARM_PUMPKIN_SEED", name: "Pumpkins" },
];
ABP.HERBS = [
  { tier: 2, crop: "T2_AGARIC", seed: "T2_FARM_AGARIC_SEED", name: "Arcane Agaric" },
  { tier: 3, crop: "T3_COMFREY", seed: "T3_FARM_COMFREY_SEED", name: "Brightleaf Comfrey" },
  { tier: 4, crop: "T4_BURDOCK", seed: "T4_FARM_BURDOCK_SEED", name: "Crenellated Burdock" },
  { tier: 5, crop: "T5_TEASEL", seed: "T5_FARM_TEASEL_SEED", name: "Dragon Teasel" },
  { tier: 6, crop: "T6_FOXGLOVE", seed: "T6_FARM_FOXGLOVE_SEED", name: "Elusive Foxglove" },
  { tier: 7, crop: "T7_MULLEIN", seed: "T7_FARM_MULLEIN_SEED", name: "Firetouched Mullein" },
  { tier: 8, crop: "T8_YARROW", seed: "T8_FARM_YARROW_SEED", name: "Ghoul Yarrow" },
];

/* Gear commonly bought by the Black Market. Tier prefix and @enchant are added at query time. */
ABP.BM_GEAR = [
  ["MAIN_SWORD", "Broadsword"], ["2H_CLAYMORE", "Claymore"], ["2H_DUALSWORD", "Dual Swords"],
  ["MAIN_AXE", "Battleaxe"], ["2H_AXE", "Greataxe"], ["2H_HALBERD", "Halberd"],
  ["MAIN_MACE", "Mace"], ["2H_MACE", "Heavy Mace"], ["MAIN_HAMMER", "Hammer"], ["2H_HAMMER", "Great Hammer"],
  ["MAIN_SPEAR", "Spear"], ["2H_SPEAR", "Pike"], ["MAIN_DAGGER", "Dagger"], ["2H_DAGGERPAIR", "Dagger Pair"],
  ["2H_BOW", "Bow"], ["2H_LONGBOW", "Longbow"], ["2H_CROSSBOW", "Crossbow"], ["MAIN_1HCROSSBOW", "Light Crossbow"],
  ["MAIN_FIRESTAFF", "Fire Staff"], ["2H_FIRESTAFF", "Great Fire Staff"], ["MAIN_HOLYSTAFF", "Holy Staff"],
  ["2H_HOLYSTAFF", "Great Holy Staff"], ["MAIN_NATURESTAFF", "Nature Staff"], ["2H_NATURESTAFF", "Great Nature Staff"],
  ["MAIN_FROSTSTAFF", "Frost Staff"], ["2H_FROSTSTAFF", "Great Frost Staff"], ["MAIN_ARCANESTAFF", "Arcane Staff"],
  ["MAIN_CURSEDSTAFF", "Cursed Staff"], ["2H_QUARTERSTAFF", "Quarterstaff"],
  ["ARMOR_PLATE_SET1", "Soldier Armor"], ["HEAD_PLATE_SET1", "Soldier Helmet"], ["SHOES_PLATE_SET1", "Soldier Boots"],
  ["ARMOR_LEATHER_SET1", "Mercenary Jacket"], ["HEAD_LEATHER_SET1", "Mercenary Hood"], ["SHOES_LEATHER_SET1", "Mercenary Shoes"],
  ["ARMOR_CLOTH_SET1", "Scholar Robe"], ["HEAD_CLOTH_SET1", "Scholar Cowl"], ["SHOES_CLOTH_SET1", "Scholar Sandals"],
  ["OFF_SHIELD", "Shield"], ["OFF_BOOK", "Tome of Spells"], ["OFF_TORCH", "Torch"], ["BAG", "Bag"], ["CAPE", "Cape"],
];

/* ---------- Money-making methods ---------- */
ABP.METHODS = [
  {
    id: "island",
    name: "Island farming, herbs and animals",
    kind: "Island",
    rate: "0.3M to 1.5M per day, mostly passive (estimate)",
    capital: "Low: seeds and baby animals",
    risk: "None",
    time: "15 to 30 min a day",
    why: "Premium doubles crop yield and animal growth, and your fully upgraded island gives you every plot already. This is the steady base income that never stops.",
    steps: [
      "Open Best picks → Island. It ranks every crop and herb by profit per day across your plots after seed costs, and only counts what the market can absorb (half its daily sales). Plant the top pick your Farming spec allows. If its market is thin, plant your second pick on the leftover plots so you are not flooding one market.",
      "Harvest and replant every day (crops take about 22 hours). Missing a day costs a whole cycle, so set a fixed time.",
      "Use focus on your plots when you can spare it: it raises the seed-return chance so you buy fewer seeds. Spend the rest of your focus on refining (it is worth more there).",
      "Put pastures to work: raise animals on crops you grew, then sell grown animals, mounts, or butcher them for meat. Feed each animal its favourite food to speed growth, and raise them on the island whose biome they prefer.",
      "Turn herbs into potions and crops into food when the Market tab shows the finished product sells for more than the inputs. Potions and food sell every day because everyone consumes them.",
      "House labourers on spare plots. Fill their journals while you do that activity anyway (refining, crafting, gathering) and hand them in daily for free materials.",
      "Since the Wild Blood update you can own one personal island per city. Each extra island multiplies this income; buy more once the first one runs at full value.",
    ],
    tips: [
      "Best picks names the city that pays most for each crop. A 10% better price on 400 crops a day is worth the trip once a week.",
      "Buy seeds with a buy order one silver above the top order: it usually saves 10% or more versus instant-buy, and you need them only once a day.",
    ],
    pitfalls: ["Letting premium lapse halves your yield instantly.", "Planting a crop that sells well today but has no daily volume."],
  },
  {
    id: "refining",
    name: "Focus refining in bonus cities",
    kind: "Crafting",
    rate: "0.5M to 2M per day from focus alone, more with daily bonus days (estimate)",
    capital: "Medium: 5M to 50M of raw resources",
    risk: "Low (royal cities)",
    time: "30 to 60 min a day",
    why: "Premium gives you 10,000 focus a day. Refining in a resource's bonus city with focus returns about 53.9% of materials, which is the most reliable silver-per-focus in the game.",
    steps: [
      "Open Best picks → Refining. It ranks all five resources, T4 to T8 and .0 to .2, by profit margin with focus in their bonus cities (Planks in Fort Sterling, Metal Bars in Thetford, Leather in Martlock, Cloth in Lymhurst, Stone Blocks in Bridgewatch), and checks the output sells at least 200 a day. Commit to the resource that tops it most days, so your spec and focus efficiency grow in one line.",
      "Open the Refining calculator for that resource and type the focus cost per refine from the in-game window. Silver per focus tells you exactly which tier to put your 10,000 daily focus into; it often isn't the highest tier.",
      "Buy raw resources with buy orders a little above the top order, in the cities where they are gathered and cheapest. Buy the lower-tier refined input too, or refine it yourself.",
      "Carry everything to the bonus city. Refine with focus on, spending your whole daily focus. Refine the remaining material without focus only if the calculator still shows a profit.",
      "Check the Activities menu every day. On a silver or gold bonus day for your resource, refine your banked focus (it caps at 30,000) and extra stock.",
      "Sell the refined output with sell orders slightly under the cheapest listing, or to crafters with direct trades. Never dump it with instant-sell unless the spread is tiny.",
    ],
    tips: [
      "Let focus bank up to the 30,000 cap before a bonus day, but never waste it by sitting at the cap.",
      "Refining spec raises focus efficiency, not return rate. Return rate comes from city, focus and the daily bonus.",
    ],
    pitfalls: ["Refining without focus in a non-bonus city usually loses money after tax.", "Buying raw with instant-buy erases most of the margin."],
  },
  {
    id: "crafting",
    name: "Crafting gear for markets and the Black Market",
    kind: "Crafting",
    rate: "0.5M to 3M per hour with enough capital (estimate)",
    capital: "Medium to high: 20M to 200M of materials",
    risk: "Low in royal cities, medium if you haul to Caerleon",
    time: "1 to 3 hours a day",
    why: "Crafted gear is what every player loses in PvP and what the Black Market buys to stock mob loot. Crafters with spec and bonus-city return rates make money on volume.",
    steps: [
      "Open Best picks → Black Market. Items that keep ranking near the top over a week, with a steady number bought per day, are the families worth crafting. Prefer a family whose crafting bonus city is also where you refine, so materials don't travel.",
      "Craft in the city with the crafting bonus for that family (see the Wiki). Focus is best spent on refining unless the calculator shows your craft beats it per focus point.",
      "Level the item's Destiny Board spec. Each spec level lowers focus cost and raises item quality chances, and masterpiece-quality items sell for much more.",
      "Buy refined materials and artifacts with buy orders. Keep a stock of 1 to 2 days of crafting so a price spike does not stop you.",
      "Fill crafting journals as you craft and sell full journals; they are pure extra profit.",
      "Sell to the Black Market in Caerleon (instant, pays 4% tax with premium) or list on markets in the city with the highest price. Check Best picks each session: when your item drops out of the ranking, the Black Market is stocked, so switch tier or enchant until it returns.",
    ],
    tips: ["Enchanted gear (.1 to .3) is where the Black Market pays the most over material cost.", "Craft in batches during daily bonus days for your category."],
    pitfalls: ["Crafting items with no daily volume.", "Ignoring the station usage fee, which climbs on busy stations."],
  },
  {
    id: "flipping",
    name: "Market order flipping in one city",
    kind: "Trading",
    rate: "Scales with capital: about 0.5% to 2% of capital a day (estimate)",
    capital: "Any, works best from 10M upward",
    risk: "Very low",
    time: "20 min, two or three times a day",
    why: "You never leave town. Buy with orders under the market, sell with orders above it, and keep the spread after fees. This is the safest way to make big capital grow.",
    steps: [
      "Fees for a premium account: 2.5% setup fee on every order you place, plus 4% sales tax when a sell order fills. A buy order then sell order round trip costs about 9%, so only flip spreads above about 12%.",
      "In the Market tab, open an item and look at the 7-day volume. Pick items that sell at least dozens per day in your city so your orders fill.",
      "Open Best picks → Order flips. It ranks items by the gap between the top buy order and the cheapest listing in the same city after the 9% round-trip cost, weighted by how many sell per day. Place a buy order 1 silver above the top buy order on the top picks. When it fills, list a sell order 1 silver under the cheapest listing.",
      "Re-check two or three times a day and update orders that got undercut. Cancel and relist only when needed, because each relist costs the setup fee again.",
      "Spread your capital over 10 to 30 items so no single crash hurts. Keep a simple log in the Progress tab to see your real return per week.",
    ],
    tips: ["Resources, potions, food and mounts sell hundreds a day, so orders fill within hours. Gear often has wider gaps but fills slowly; the ranking weighs both.", "Weekend evenings have the most buyers."],
    pitfalls: ["Order wars with other flippers on thin items.", "Forgetting the 2.5% fee on cancelled and relisted orders."],
  },
  {
    id: "blackmarket",
    name: "Black Market flipping",
    kind: "Trading",
    rate: "1M to 6M per hour reported (estimate)",
    capital: "High: 30M to 500M in flight",
    risk: "Safe inside Caerleon, high when hauling through red zones",
    time: "1 to 4 hours a session",
    why: "The Black Market in Caerleon buys gear to stock loot for mobs. It often pays far more than city markets charge, and the price gap is the profit.",
    steps: [
      "Start with the zero-risk version: in Caerleon, buy gear on the Caerleon market and sell it to the Black Market in the same city. Use the Black Market preset with Caerleon as the buy city.",
      "Only flip when the Black Market buy price, minus 4% tax, beats your cost by at least 10%. Prefer items whose Black Market price was updated in the last few hours.",
      "Graduate to hauling: buy cheap gear in royal cities (they are in blue zones), carry it to Caerleon on a transport mount, and sell there. Caerleon is surrounded by red zones where you can be killed and looted.",
      "Reduce hauling risk: carry no more than you can afford to lose, travel at off-peak hours, use a fast mount, avoid main roads, and scout with the map's danger markers.",
      "Use buy orders in the royal cities to collect gear cheaply over a day, then make one large run.",
      "Track the Black Market's demand: when it pays well for a tier and enchant, it stops once it is stocked. Spread across many items.",
    ],
    tips: ["Gear with quality above Normal sells for more; check quality on the Market tab.", "Mammoths are slow targets; an ox or a fast horse on short hauls is often safer."],
    pitfalls: ["Hauling everything in one run and losing it.", "Trusting a Black Market price that is a day old."],
  },
  {
    id: "routes",
    name: "City-to-city trade routes",
    kind: "Trading",
    rate: "1M to 3M per hour on good spreads (estimate)",
    capital: "Medium: 10M to 100M",
    risk: "Low on blue and yellow routes, medium through Brecilien's mists",
    time: "1 to 2 hours a session",
    why: "Each royal city produces different refined goods and gear cheaply because of its bonuses. Buy where it is made, sell where it is used.",
    steps: [
      "On the Market tab, load a preset. Green marks the cheapest city and gold the best city per item; the haul profit column is profit per item after tax and listing fee. Click an item to check its 7-day sales in the city you will sell in before you load up.",
      "Pick routes that stay in blue and yellow zones between royal cities. Plan a round trip so you carry goods both ways.",
      "Weigh your load: your mount's capacity and your speed decide how much you can move per hour. Refined resources are heavy; gear is light and valuable.",
      "Sell with sell orders when you can wait, or instant-sell into buy orders when the spread is big enough to absorb it.",
      "Brecilien connects to every city through the Mists. It is faster but riskier; use it only with items you can afford to lose.",
    ],
    tips: ["Resources are cheapest in the city next to the zones where they are gathered."],
    pitfalls: ["Spreads that exist only because one stale listing has not updated."],
  },
  {
    id: "gathering",
    name: "High-tier gathering",
    kind: "Gathering",
    rate: "0.5M to 1M per hour in safe zones, 2M or more in black zones (estimate)",
    capital: "Low to medium: gatherer set, tools, mount",
    risk: "Low in blue and yellow, high in red and black",
    time: "1 to 3 hours a session",
    why: "Premium gives +50% gathering yield. Gathered resources feed your own refining, so you keep both margins.",
    steps: [
      "Pick the gathering profession that matches your refining line, so you keep both margins: check which resource tops Best picks → Refining and gather its raw form. Level it with the matching gatherer gear set and tools.",
      "Gather T4 and T5 in yellow zones first. Move to T6 to T8 and enchanted nodes in red and black zones once you can survive gankers.",
      "Bank often. Never carry more than one trip's value you are willing to lose.",
      "Refine your own resources in the bonus city with focus, or sell raw to refiners in that city.",
      "Use Roads of Avalon for rich enchanted nodes with fewer players, once you know the portals.",
    ],
    tips: ["Gathering is strongest during the first hours after a server reset, when nodes are full."],
    pitfalls: ["Wearing expensive gear while gathering in black zones."],
  },
  {
    id: "pve",
    name: "Dungeons, Mists and Roads of Avalon",
    kind: "PvE",
    rate: "0.5M to 3M per hour, high variance (estimate)",
    capital: "Medium: a combat build plus replacement sets",
    risk: "Medium to high (full loot outside blue zones)",
    time: "1 to 3 hours a session",
    why: "Premium gives +50% silver and loot from mobs. Chests in solo dungeons, Mists and Avalonian roads drop tomes, gear and artifacts that sell well.",
    steps: [
      "Gear a cheap, efficient clearing build (check the in-game builds menu or community builds for current meta).",
      "Run solo dungeons and Mists, opening every chest. Sell gear to the Black Market and artifacts to crafters.",
      "In Roads of Avalon, look for golden chests, high-tier nodes and portals to rich roads. Go in a small group when you can.",
      "Join a group for faster static or Avalonian dungeons when you have a reliable guild.",
      "Bank your loot after every run. Sell in Caerleon or Brecilien, where the buyers are.",
    ],
    tips: ["Treat losses as a cost line: keep three replacement sets so a death does not end your session."],
    pitfalls: ["Spending profit on ever-more-expensive gear."],
  },
  {
    id: "fishing",
    name: "Fishing",
    kind: "Gathering",
    rate: "0.2M to 0.8M per hour, higher in dangerous waters (estimate)",
    capital: "Very low",
    risk: "Low in safe zones",
    time: "Any",
    why: "A relaxed method for low-energy sessions. Rare fish and chopped fish feed your cooking and sell to other cooks.",
    steps: [
      "Level fishing with a rod and bait in blue and yellow zones.",
      "Move to higher-tier waters as your spec grows.",
      "Chop common fish for fish sauce, and sell rare fish to cooks or turn them into food on your island.",
    ],
    tips: ["Good for days when you only have 30 minutes."],
    pitfalls: ["It does not scale with capital, so it cannot carry the plan alone."],
  },
];

/* ---------- Playstyle profiles ----------
   Projection inputs per phase (P1 under 20M, P2 under 150M, P3 under 500M, P4 above):
   active: silver per active hour, roi: daily return on capital from orders/flips,
   cap: most capital that roi can work on per day (market depth), passive: island per day. */
ABP.PROFILES = [
  {
    id: "tycoon",
    name: "The Tycoon",
    tag: "Balanced, recommended",
    pitch: "Island and focus every day, crafting while capital is small, then trading takes over as capital grows. The most reliable path to a billion.",
    methods: ["island", "refining", "crafting", "flipping", "blackmarket"],
    hours: 2.5,
    phases: [
      { active: 0.35e6, roi: 0.003, cap: 40e6, passive: 0.21e6 },
      { active: 0.56e6, roi: 0.004, cap: 150e6, passive: 0.32e6 },
      { active: 0.77e6, roi: 0.0045, cap: 400e6, passive: 0.42e6 },
      { active: 0.98e6, roi: 0.004, cap: 700e6, passive: 0.53e6 },
    ],
    actions: [
      ["Plant every plot with the top crop or herb from Best picks → Island (ranked by profit per day after seeds, capped by what the market absorbs), and harvest daily.", "Refine the top pick from Best picks → Refining with all 10,000 focus a day in its bonus city.", "Gather or run dungeons for starting capital; do not buy expensive gear yet.", "Put spare silver into buy orders on the top 5 to 10 items from Best picks → Order flips."],
      ["Start crafting one Black Market item family in its bonus city.", "Grow flipping to 20 or more items across two cities.", "Do in-city Caerleon market to Black Market flips daily.", "Turn herbs into potions when they beat raw prices."],
      ["Run Black Market hauls from royal cities with capped cargo values.", "Keep 50% of capital in orders, 30% in crafting stock, 20% in reserve.", "Buy a second personal island in another city.", "Craft only enchanted tiers that clear the Black Market fast."],
      ["Run three income lines in parallel: crafting, flipping, Black Market hauling.", "Raise order sizes on proven items rather than adding risky new ones.", "Keep reinvesting; the last 500M comes from capital, not extra hours."],
    ],
  },
  {
    id: "merchant",
    name: "The Merchant",
    tag: "Trading, no combat",
    pitch: "You live in market windows. Order flipping and the Black Market do the work; your island pays the bills.",
    methods: ["flipping", "blackmarket", "routes", "island"],
    hours: 2,
    phases: [
      { active: 0.24e6, roi: 0.006, cap: 20e6, passive: 0.17e6 },
      { active: 0.42e6, roi: 0.006, cap: 150e6, passive: 0.28e6 },
      { active: 0.63e6, roi: 0.0055, cap: 450e6, passive: 0.35e6 },
      { active: 0.84e6, roi: 0.0045, cap: 800e6, passive: 0.42e6 },
    ],
    actions: [
      ["Farm the island daily and refine with focus to build the first 10M to 20M.", "Learn order flipping on the top items from Best picks → Order flips; start with ones that sell 100 or more a day.", "Write down every flip; your log is your edge."],
      ["Do Caerleon market to Black Market flips every session.", "Run blue and yellow trade routes between royal cities with round-trip cargo.", "Spread capital over 20 to 30 items."],
      ["Haul royal-city gear to the Black Market in capped runs.", "Collect gear with buy orders across all five royal cities.", "Use the 7-day volume to size every order."],
      ["Become the main buyer in a few markets you know deeply.", "Keep a 20% reserve to buy crashes after big patches or wars."],
    ],
  },
  {
    id: "artisan",
    name: "The Artisan",
    tag: "Refining and crafting",
    pitch: "Spec deep into one refining line and one gear line. You earn on return rates and on what the Black Market pays for finished gear.",
    methods: ["refining", "crafting", "island", "flipping"],
    hours: 2.5,
    phases: [
      { active: 0.35e6, roi: 0.002, cap: 30e6, passive: 0.21e6 },
      { active: 0.63e6, roi: 0.0025, cap: 120e6, passive: 0.28e6 },
      { active: 0.91e6, roi: 0.003, cap: 300e6, passive: 0.35e6 },
      { active: 1.12e6, roi: 0.003, cap: 500e6, passive: 0.42e6 },
    ],
    actions: [
      ["Refine one resource daily with all your focus in its bonus city.", "Level its refining spec and the matching crafting family.", "Sell refined output through sell orders."],
      ["Start crafting your family's T5 to T6 enchanted gear.", "Fill and sell crafting journals.", "Batch-craft on daily bonus days."],
      ["Add a second refining line and a second gear family.", "Sell gear to the Black Market and list the rest on markets.", "Keep 1 to 2 days of materials in stock bought by buy orders."],
      ["Push T7 and T8 enchanted crafts where your spec gives masterpiece chances.", "Reinvest into larger batches."],
    ],
  },
  {
    id: "homesteader",
    name: "The Homesteader",
    tag: "About 1 hour a day",
    pitch: "Short sessions. Island, focus and slow orders. Reaching a billion this way needs several islands and patient compounding.",
    methods: ["island", "refining", "flipping", "fishing"],
    hours: 1,
    phases: [
      { active: 0.28e6, roi: 0.003, cap: 25e6, passive: 0.28e6 },
      { active: 0.42e6, roi: 0.004, cap: 150e6, passive: 0.42e6 },
      { active: 0.53e6, roi: 0.004, cap: 400e6, passive: 0.63e6 },
      { active: 0.63e6, roi: 0.0035, cap: 600e6, passive: 0.84e6 },
    ],
    actions: [
      ["Harvest and replant every day at the same time.", "Spend all your focus refining in one bonus city.", "Leave long-running buy and sell orders before you log off."],
      ["Turn herbs into potions and crops into food or animals when it pays.", "Grow orders to 10 to 20 items you check once a day."],
      ["Buy a second and third personal island in other cities.", "Keep compounding orders."],
      ["Run every island at full value and keep orders filled.", "Expect to reach the goal late in the year; extra hours on weekends close the gap."],
    ],
  },
  {
    id: "gatherer",
    name: "The Gatherer",
    tag: "Out in the world",
    pitch: "You collect high-tier resources, refine them yourself, and keep both margins. More risk, more silver per hour early on.",
    methods: ["gathering", "refining", "island", "routes"],
    hours: 2.5,
    phases: [
      { active: 0.46e6, roi: 0.0015, cap: 20e6, passive: 0.17e6 },
      { active: 0.7e6, roi: 0.0025, cap: 100e6, passive: 0.28e6 },
      { active: 0.91e6, roi: 0.003, cap: 300e6, passive: 0.35e6 },
      { active: 1.05e6, roi: 0.003, cap: 500e6, passive: 0.42e6 },
    ],
    actions: [
      ["Level one gathering profession with its gear set in yellow zones.", "Refine what you gather with focus in the bonus city.", "Farm the island daily."],
      ["Move to T6 to T8 nodes in red zones and Roads of Avalon.", "Sell surplus raw to refiners in the bonus city."],
      ["Gather enchanted nodes in black zones with cheap gear.", "Start flipping the surplus capital."],
      ["Keep gathering for active income while capital works in orders."],
    ],
  },
  {
    id: "adventurer",
    name: "The Adventurer",
    tag: "PvE and loot",
    pitch: "Dungeons, Mists and Avalon chests fund you early. Loot goes to the Black Market; capital moves into trading as it grows.",
    methods: ["pve", "blackmarket", "island", "flipping"],
    hours: 3,
    phases: [
      { active: 0.42e6, roi: 0.0015, cap: 20e6, passive: 0.17e6 },
      { active: 0.63e6, roi: 0.003, cap: 120e6, passive: 0.28e6 },
      { active: 0.84e6, roi: 0.0035, cap: 350e6, passive: 0.35e6 },
      { active: 0.98e6, roi: 0.0035, cap: 600e6, passive: 0.42e6 },
    ],
    actions: [
      ["Pick one clearing build and farm solo dungeons and Mists.", "Sell loot to the Black Market and artifacts to crafters.", "Farm the island daily."],
      ["Join group Avalonian content for higher chest value.", "Start in-city Black Market flips with loot profits."],
      ["Move half your capital into flipping orders.", "Keep three replacement sets at all times."],
      ["Let trading carry the growth; play content for fun and loot."],
    ],
  },
];

ABP.PHASES = [
  { name: "Foundation", until: 20e6, label: "0 to 20M" },
  { name: "Engine", until: 150e6, label: "20M to 150M" },
  { name: "Scale", until: 500e6, label: "150M to 500M" },
  { name: "Empire", until: Infinity, label: "500M to 1B" },
];

ABP.DAILY = [
  "Harvest and replant every island plot (check Best picks → Island first)",
  "Spend focus on the top Best picks → Refining item (check the daily bonus in the Activities menu)",
  "Hand in labourer journals and refill them",
  "Update undercut buy and sell orders",
  "Check Best picks → Black Market and Order flips",
  "Log your silver balance in the Progress tab",
];

/* ---------- Wiki ---------- */
ABP.WIKI = [
  {
    id: "premium",
    title: "Premium",
    body: [
      "10,000 focus a day, banked up to a cap of 30,000.",
      "+50% fame, +50% silver and loot from mobs, +50% gathering yield.",
      "Double crop yield and double animal growth on islands.",
      "Market sales tax drops from 8% to 4%.",
      "30 learning points a day, and weekly and monthly Adventurer's Challenge rewards.",
      "Needed to buy a personal island, and to keep it producing at full rate.",
      "Premium can be bought with gold, and gold with silver. The Market tab shows the live gold price.",
    ],
    link: "https://wiki.albiononline.com/wiki/Premium",
  },
  {
    id: "island",
    title: "Personal islands",
    body: [
      "Islands are reached through the island ferry or travel planner in a city. Upgrading an island adds building plots.",
      "Farm plots grow crops, herb gardens grow herbs, and pastures raise animals. Crops and herbs take about 22 hours.",
      "Animals grow faster when fed their favourite food, and some yield more on the biome island they prefer.",
      "Since the Wild Blood update you can own one personal island per city, each with its own biome. Some crops grow better on certain islands.",
      "Labourers live in houses on your island. Give them full journals and they return resources or items each day.",
    ],
    link: "https://wiki.albiononline.com/wiki/Island",
  },
  {
    id: "focus",
    title: "Focus",
    body: [
      "Focus raises return rates when refining and crafting, and improves seed return on farms.",
      "Spec in a refining or crafting line lowers its focus cost, so the same 10,000 points do more work.",
      "Measure focus in silver per focus point. Spend it where that number is highest, which is usually refining in a bonus city.",
    ],
    link: "https://wiki.albiononline.com/wiki/Focus",
  },
  {
    id: "fees",
    title: "Market taxes and fees",
    body: [
      "Sales tax: 4% with premium, 8% without. It is paid when a sell order fills or when you instant-sell into a buy order (Black Market included).",
      "Setup fee: 2.5% of the order value, paid when you place a buy order or a sell order. Relisting pays it again.",
      "Instant-buying from sell orders pays no fee. Instant-selling into a buy order pays sales tax only.",
      "A full buy order then sell order flip costs about 2.5% + 2.5% + 4% = 9% of value.",
      "Crafting and refining stations charge a usage fee set by the station owner; check it before large batches.",
    ],
    link: "https://wiki.albiononline.com/wiki/Marketplace",
  },
  {
    id: "rrr",
    title: "Resource return rate",
    table: { head: ["Setup", "Return rate"], rows: ABP.RRR.map((r) => [r.setup, (r.rate * 100).toFixed(1) + "%"]) },
    body: [
      "The return rate is bonus divided by (1 + bonus). Bonus city adds about 0.40, focus about 0.59, the base station about 0.18.",
      "Daily bonus days add +0.10 (silver) or +0.20 (gold) for the highlighted category.",
      "Returned materials are a share of everything you put in, so they lower the real cost of each refine.",
    ],
    link: "https://wiki.albiononline.com/wiki/Refining",
  },
  {
    id: "refining",
    title: "Refining recipes and bonus cities",
    table: {
      head: ["Resource", "Refines into", "Bonus city"],
      rows: ABP.RESOURCES.map((r) => [r.rawName, r.refinedName, r.city]),
    },
    body: [
      "Each refined item takes raw resources of its tier plus 1 refined item of the tier below: T3 and T4 take 2 raw, T5 takes 3, T6 takes 4, T7 and T8 take 5. T2 takes 1 raw only.",
      "Enchanted refining (.1 to .4) uses enchanted raw of the same level plus refined of the tier below at the same enchant (T4 uses plain T3).",
    ],
    link: "https://wiki.albiononline.com/wiki/Refining",
  },
  {
    id: "crafting",
    title: "Crafting bonus cities",
    table: { head: ["City", "Crafting bonus"], rows: ABP.CRAFT_BONUS.map((c) => [c.city, c.items]) },
    body: [
      "Crafting in the bonus city raises the return rate for those item families, like refining.",
      "Sandbox Interactive rebalances these from time to time; check the crafting station tooltip in-game.",
    ],
    link: "https://wiki.albiononline.com/wiki/Crafting",
  },
  {
    id: "tiers",
    title: "Tiers, enchantments and quality",
    body: [
      "Tiers: T1 Beginner, T2 Novice, T3 Journeyman, T4 Adept, T5 Expert, T6 Master, T7 Grandmaster, T8 Elder.",
      "Enchantments .1 to .4 add item power. The game writes them as T6.2; the market data writes T6_MAIN_SWORD@2.",
      "Quality from crafting: Normal, Good, Outstanding, Excellent, Masterpiece. Higher quality adds item power and price.",
      "Item power, not tier alone, decides value. A T5.2 and a T7.0 can sit close in power and price.",
    ],
    link: "https://wiki.albiononline.com/wiki/Tier",
  },
  {
    id: "zones",
    title: "Zones and risk",
    body: [
      "Blue zones: no forced PvP. Yellow: PvP with a death that does not drop your gear. Red: full loot PvP with a reputation penalty for attackers. Black (Outlands): full loot, free-for-all.",
      "Royal cities sit in blue and yellow zones. Caerleon and its Black Market sit in the middle, surrounded by red zones.",
      "Brecilien sits in the Mists and links to every city through mist portals.",
      "Roads of Avalon are random portal networks with rich resources and chests; they are full loot.",
    ],
    link: "https://wiki.albiononline.com/wiki/Zones",
  },
  {
    id: "blackmarket",
    title: "The Black Market",
    body: [
      "Located in Caerleon. It buys gear and some items through buy orders, then uses them as loot for mobs and chests across the world.",
      "When players die or loot less, the Black Market runs short and raises prices. War weeks and big patches swing it hard.",
      "Selling to it is instant and pays the normal 4% sales tax with premium.",
      "Its buy prices change fast. Trust prices updated in the last few hours, and expect the top order to be filled once you sell into it.",
    ],
    link: "https://wiki.albiononline.com/wiki/Black_Market",
  },
  {
    id: "journals",
    title: "Journals and labourers",
    body: [
      "Journals fill with fame from one activity (a refining, crafting or gathering type). Full journals sell to other players or go to your labourers.",
      "Labourers need a house on your island. Better houses and furniture raise their output.",
      "Give each labourer a full journal of their type daily; they return resources or items when you come back.",
    ],
    link: "https://wiki.albiononline.com/wiki/Laborer",
  },
  {
    id: "data",
    title: "Where the prices come from",
    body: [
      "The Albion Online Data Project collects prices from players who run its free data client while they browse the market.",
      "Prices can be hours or days old for quiet items. The Market tab shows each price's age; treat old prices as hints.",
      "You can help keep your server's prices fresh by running the data client yourself.",
    ],
    link: "https://www.albion-online-data.com/",
  },
];

/* ---------- Specialization ----------
   Focus cost = base × 0.5^(efficiency / 10,000) (official wiki: halved per 10,000 points).
   Refining and crafting: every spec level under the same mastery adds 30 efficiency,
   and the spec for the exact item or tier you make adds another 250 per level. */
ABP.REFINE_FOCUS = {
  4: [48, 89, 143, 239], 5: [89, 160, 269, 461], 6: [160, 284, 487, 844],
  7: [284, 500, 866, 1508], 8: [500, 877, 1527, 2666],
};
ABP.focusCost = (base, efficiency) => base * Math.pow(0.5, efficiency / 10000);
ABP.refineEfficiency = (specs, tier) => specs.reduce((s, v) => s + (+v || 0), 0) * 30 + (+specs[tier - 4] || 0) * 250;

ABP.SPEC_DEFAULT = {
  refine: { wood: [0, 0, 0, 0, 0], ore: [0, 0, 0, 0, 0], hide: [0, 0, 0, 0, 0], fiber: [0, 0, 0, 0, 0], rock: [0, 0, 0, 0, 0] },
  craft: { mastery: 0, item: 0, others: 0, base: 1286 },
  farm: { crop: 8, herb: 8 },
  gather: 0,
};
ABP.spec = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem("abp.spec") || "null"); } catch (e) {}
  const d = JSON.parse(JSON.stringify(ABP.SPEC_DEFAULT));
  if (!s) return d;
  return { refine: Object.assign(d.refine, s.refine || {}), craft: Object.assign(d.craft, s.craft || {}), farm: Object.assign(d.farm, s.farm || {}), gather: s.gather ?? 0 };
})();
ABP.saveSpec = () => { try { localStorage.setItem("abp.spec", JSON.stringify(ABP.spec)); } catch (e) {} };

ABP.WIKI.splice(3, 0, {
  id: "spec",
  title: "Specialization",
  body: [
    "Focus cost is halved for every 10,000 focus cost efficiency. With every relevant node maxed it falls to 6.25% of the base cost.",
    "Refining: each spec level in any tier of that refining line adds 30 efficiency, and each level in the tier you are refining adds 250 more. Five tiers at 100 plus the refined tier at 100 is 40,000 efficiency, a 93.75% discount.",
    "Crafting: the family node (for example Sword Crafter) adds 30 per level, each other item spec in the family adds 30 per level, and the exact item's spec adds 280 per level (30 shared plus 250 specific).",
    "Spec does not change the resource return rate. Return rate comes only from the city, focus and the daily bonus.",
    "Higher crafting spec also raises your chance of better item quality, which sells for more.",
    "Gathering: each level adds +0.5% gathering yield and faster gathering for that resource and tier.",
    "Farming: crop, herb and animal tiers unlock in order on the Destiny Board, so your spec decides the highest tier you can plant or raise.",
  ],
  link: "https://wiki.albiononline.com/wiki/Specializations",
});
