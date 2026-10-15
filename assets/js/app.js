/* Albion Billionaire app: tabs, plan projection, methods, live market, calculators, wiki, progress. */
(() => {
  const { FEES } = ABP;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("abp." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("abp." + k, JSON.stringify(v)); } catch (e) {} },
  };

  function fmt(n, digits = 2) {
    if (n == null || !isFinite(n)) return "–";
    const a = Math.abs(n), s = n < 0 ? "-" : "";
    if (a >= 1e9) return s + (a / 1e9).toFixed(digits) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : digits) + "M";
    if (a >= 1e4) return s + (a / 1e3).toFixed(0) + "k";
    return s + Math.round(a).toLocaleString("en-US");
  }
  const full = (n) => (n == null || !isFinite(n) ? "–" : Math.round(n).toLocaleString("en-US"));
  const pct = (n, d = 1) => (n == null || !isFinite(n) ? "–" : (n * 100).toFixed(d) + "%");
  function ago(iso) {
    if (!iso) return null;
    const h = (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 36e5;
    return h;
  }
  const agoText = (h) => (h == null ? "no data" : h < 1 ? Math.max(1, Math.round(h * 60)) + " min ago" : h < 48 ? Math.round(h) + " h ago" : Math.round(h / 24) + " days ago");
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dateText = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  /* ---------- Tabs ---------- */
  const TABS = ["plan", "methods", "market", "calc", "wiki", "progress"];
  const rendered = {};
  function show(tab) {
    if (!TABS.includes(tab)) tab = "plan";
    for (const t of TABS) {
      $("#panel-" + t).hidden = t !== tab;
      $("#tab-" + t).setAttribute("aria-selected", String(t === tab));
    }
    if (!rendered[tab]) { RENDER[tab](); rendered[tab] = true; }
    if (tab === "plan") drawPlanChart();
    if (tab === "progress") renderProgress();
    store.set("tab", tab);
  }
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => {
    history.replaceState(null, "", "#" + b.dataset.tab);
    show(b.dataset.tab);
  }));

  /* ---------- Chart ---------- */
  function lineChart(canvas, series, { yMax, goal, xLabels } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 52, r: 12, t: 14, b: 26 };
    const xMax = Math.max(...series.map((s) => s.data.length ? s.data[s.data.length - 1].x : 0), 1);
    const top = yMax || Math.max(goal || 0, ...series.flatMap((s) => s.data.map((p) => p.y))) * 1.08 || 1;
    const X = (x) => pad.l + (x / xMax) * (w - pad.l - pad.r);
    const Y = (y) => h - pad.b - (Math.min(y, top) / top) * (h - pad.t - pad.b);
    ctx.font = "11px " + css("--font-mono");
    ctx.fillStyle = css("--muted");
    ctx.strokeStyle = css("--chart-grid");
    ctx.lineWidth = 1;
    const step = top > 1.2e9 ? 5e8 : top > 6e8 ? 2.5e8 : top > 2e8 ? 1e8 : top > 5e7 ? 2.5e7 : top > 1e7 ? 5e6 : 1e6;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let v = 0; v <= top; v += step) {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke();
      ctx.fillText(fmt(v, 1), pad.l - 6, Y(v));
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    (xLabels || []).forEach((l) => { if (l.x <= xMax) ctx.fillText(l.text, X(l.x), h - pad.b + 8); });
    if (goal) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = css("--gold");
      ctx.beginPath(); ctx.moveTo(pad.l, Y(goal)); ctx.lineTo(w - pad.r, Y(goal)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css("--gold"); ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText("1B goal", pad.l + 4, Y(goal) - 3);
    }
    for (const s of series) {
      if (!s.data.length) continue;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []);
      if (s.fill) {
        ctx.beginPath(); ctx.moveTo(X(s.data[0].x), Y(0));
        s.data.forEach((p) => ctx.lineTo(X(p.x), Y(p.y)));
        ctx.lineTo(X(s.data[s.data.length - 1].x), Y(0)); ctx.closePath();
        ctx.globalAlpha = 0.12; ctx.fillStyle = s.color; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      s.data.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.stroke(); ctx.setLineDash([]);
      if (s.dots) s.data.forEach((p) => { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3, 0, 7); ctx.fillStyle = s.color; ctx.fill(); });
      const last = s.data[s.data.length - 1];
      ctx.beginPath(); ctx.arc(X(last.x), Y(last.y), 4, 0, 7); ctx.fillStyle = s.color; ctx.fill();
    }
  }
  const monthLabels = (start) => Array.from({ length: 13 }, (_, i) => {
    const d = new Date(start); d.setMonth(d.getMonth() + i);
    return { x: Math.round((d - new Date(start)) / 864e5), text: i % 2 ? "" : d.toLocaleDateString("en-US", { month: "short" }) };
  });

  /* ---------- Plan ---------- */
  const SKILL = [
    { id: 0.6, label: "Still learning the economy" },
    { id: 1, label: "Experienced player" },
    { id: 1.3, label: "Veteran trader or crafter" },
  ];
  const plan = Object.assign({ profile: "tycoon", start: 2_000_000, hours: null, skill: 1, date: todayISO() }, store.get("plan", {}));
  const profileOf = (id) => ABP.PROFILES.find((p) => p.id === id) || ABP.PROFILES[0];
  const phaseIdx = (cap) => ABP.PHASES.findIndex((p) => cap < p.until);

  function simulate(prof, start, hours, skill, days = ABP.DAYS) {
    let cap = start;
    const pts = [{ x: 0, y: cap }];
    const phaseDays = [0, null, null, null];
    let hit = null;
    for (let d = 1; d <= days; d++) {
      const P = prof.phases[phaseIdx(cap)];
      cap += hours * P.active * skill + Math.min(cap, P.cap) * P.roi * skill + P.passive;
      const pi = phaseIdx(cap);
      if (pi > 0 && phaseDays[pi] == null) for (let i = 1; i <= pi; i++) if (phaseDays[i] == null) phaseDays[i] = d;
      if (hit == null && cap >= ABP.GOAL) hit = d;
      pts.push({ x: d, y: cap });
    }
    return { pts, phaseDays, hit, end: cap };
  }

  function renderPlan() {
    const p = $("#panel-plan");
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Your year</span>
        <h2>Pick how you like to play</h2>
        <p>Every path below uses your premium focus and your island every day. They differ in what you do with the rest of your time. The projection compounds your silver day by day; change the inputs to match your schedule.</p>
      </div>
      <div class="grid-3" id="profiles"></div>
      <div class="box stack">
        <div class="controls">
          <label class="field"><span>Silver you have now</span><input type="number" id="pl-start" min="0" step="100000"></label>
          <label class="field"><span>Active hours a day</span><input type="number" id="pl-hours" min="0.5" max="12" step="0.5"></label>
          <label class="field"><span>Your experience</span><select id="pl-skill">${SKILL.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select></label>
          <label class="field"><span>Start date</span><input type="date" id="pl-date"></label>
        </div>
        <div class="stats" id="pl-stats"></div>
        <canvas class="chart" id="pl-chart" aria-label="Projected silver over the year"></canvas>
        <p class="small muted" id="pl-note"></p>
      </div>
      <div class="stack">
        <h3>Your four phases</h3>
        <div class="phases" id="pl-phases"></div>
      </div>
      <div class="grid-2">
        <div class="box stack">
          <h3>Methods in this path</h3>
          <ul class="plain" id="pl-methods"></ul>
        </div>
        <div class="box stack">
          <div class="row spread"><h3>Today's routine</h3><span class="small muted" id="pl-day"></span></div>
          <ul class="checklist" id="pl-daily"></ul>
        </div>
      </div>`;
    $("#profiles").innerHTML = ABP.PROFILES.map((pr) => `
      <button class="profile" data-id="${pr.id}" aria-pressed="false">
        <span class="tag">${esc(pr.tag)}</span>
        <h3>${esc(pr.name)}</h3>
        <p>${esc(pr.pitch)}</p>
      </button>`).join("");
    $$("#profiles .profile").forEach((b) => b.addEventListener("click", () => {
      plan.profile = b.dataset.id; plan.hours = null; savePlan(); updatePlan();
    }));
    $("#pl-start").value = plan.start;
    $("#pl-skill").value = plan.skill;
    $("#pl-date").value = plan.date;
    $("#pl-start").addEventListener("input", (e) => { plan.start = Math.max(0, +e.target.value || 0); savePlan(); updatePlan(); });
    $("#pl-hours").addEventListener("input", (e) => { plan.hours = Math.max(0, +e.target.value || 0); savePlan(); updatePlan(); });
    $("#pl-skill").addEventListener("change", (e) => { plan.skill = +e.target.value; savePlan(); updatePlan(); });
    $("#pl-date").addEventListener("change", (e) => { plan.date = e.target.value || todayISO(); savePlan(); updatePlan(); });
    renderDaily();
    updatePlan();
  }
  function savePlan() { store.set("plan", plan); }

  let lastSim = null;
  function updatePlan() {
    const prof = profileOf(plan.profile);
    const hours = plan.hours ?? prof.hours;
    $("#pl-hours").value = hours;
    $$("#profiles .profile").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === prof.id)));
    const sim = simulate(prof, plan.start, hours, plan.skill);
    lastSim = sim;
    const start = new Date(plan.date + "T12:00:00");
    const perDay = (ABP.GOAL - plan.start) / ABP.DAYS;
    $("#pl-stats").innerHTML = `
      <div class="stat key"><span class="label">Billion reached</span><span class="v">${sim.hit ? dateText(addDays(start, sim.hit)) : "Not this year"}</span><span class="small muted">${sim.hit ? "day " + sim.hit + " of 365" : "add hours or pick another path"}</span></div>
      <div class="stat"><span class="label">Silver after 365 days</span><span class="v money">${fmt(sim.end)}</span></div>
      <div class="stat"><span class="label">Average needed a day</span><span class="v">${fmt(perDay)}</span><span class="small muted">${fmt(perDay * 7)} a week</span></div>
      <div class="stat"><span class="label">Day 30 target</span><span class="v">${fmt(sim.pts[30].y)}</span><span class="small muted">day 90: ${fmt(sim.pts[90].y)}</span></div>`;
    $("#pl-note").textContent = `${prof.name}: ${hours} active hours a day plus daily island and focus income. The projection counts the silver you actually keep per hour after travel, order setup, quiet markets and losses, which runs well below the peak per-hour figures quoted on each method. A strong week can beat it and a bad patch can miss it.`;
    $("#pl-phases").innerHTML = ABP.PHASES.map((ph, i) => {
      const d = sim.phaseDays[i];
      const when = d == null ? "after this year" : i === 0 ? "from " + dateText(start) : "from " + dateText(addDays(start, d)) + " (day " + d + ")";
      const cur = phaseIdx(plan.start) === i;
      return `<div class="phase ${cur ? "on" : ""}">
        <span class="label">Phase ${i + 1} · ${ph.label}</span>
        <h4>${ph.name}</h4>
        <span class="when">${when}</span>
        <ul>${prof.actions[i].map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      </div>`;
    }).join("");
    $("#pl-methods").innerHTML = prof.methods.map((id) => {
      const m = ABP.METHODS.find((x) => x.id === id);
      return `<li><a href="#methods" data-method="${m.id}">${esc(m.name)}</a> <span class="muted small">· ${esc(m.rate)}</span></li>`;
    }).join("");
    $$("#pl-methods a").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault(); history.replaceState(null, "", "#methods"); show("methods");
      const t = $("#m-" + a.dataset.method); if (t) { t.open = true; t.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }));
    drawPlanChart();
  }
  function drawPlanChart() {
    const c = $("#pl-chart"); if (!c || !lastSim) return;
    const straight = [{ x: 0, y: plan.start }, { x: ABP.DAYS, y: ABP.GOAL }];
    lineChart(c, [
      { data: straight, color: css("--muted"), dash: [2, 4], width: 1 },
      { data: lastSim.pts, color: css("--accent"), fill: true },
    ], { goal: ABP.GOAL, xLabels: monthLabels(plan.date + "T12:00:00") });
  }
  function renderDaily() {
    const key = "daily." + todayISO();
    const done = store.get(key, []);
    $("#pl-day").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    $("#pl-daily").innerHTML = ABP.DAILY.map((t, i) => `<li><label><input type="checkbox" id="daily-${i}" ${done.includes(i) ? "checked" : ""}><span>${esc(t)}</span></label></li>`).join("");
    $$("#pl-daily input").forEach((inp, i) => inp.addEventListener("change", () => {
      const cur = new Set(store.get(key, []));
      inp.checked ? cur.add(i) : cur.delete(i);
      store.set(key, [...cur]);
    }));
  }

  /* ---------- Methods ---------- */
  function renderMethods() {
    const kinds = ["All", ...new Set(ABP.METHODS.map((m) => m.kind))];
    const p = $("#panel-methods");
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Playbook</span>
        <h2>Money-making methods</h2>
        <p>Each method lists what it needs, what it earns, and the exact steps. Silver-per-hour figures are community estimates; use the Market and Calculators tabs to check today's numbers before you commit.</p>
      </div>
      <div class="chips" id="m-filter">${kinds.map((k, i) => `<button class="chip" aria-pressed="${i === 0}" data-k="${k}">${k}</button>`).join("")}</div>
      <div class="stack" id="m-list"></div>`;
    $("#m-list").innerHTML = ABP.METHODS.map((m) => `
      <details class="box method" id="m-${m.id}" data-kind="${m.kind}">
        <summary>
          <span class="method-head" style="display:inline-flex;width:calc(100% - 24px)">
            <span><h3 style="display:inline">${esc(m.name)}</h3></span>
            <span class="kind">${esc(m.kind)}</span>
          </span>
        </summary>
        <div class="stack">
          <p>${esc(m.why)}</p>
          <dl class="facts">
            <div><dt>Income</dt><dd style="font-weight:600;color:var(--gold)">${esc(m.rate)}</dd></div>
            <div><dt>Capital</dt><dd>${esc(m.capital)}</dd></div>
            <div><dt>Risk</dt><dd>${esc(m.risk)}</dd></div>
            <div><dt>Time</dt><dd>${esc(m.time)}</dd></div>
          </dl>
          <h4>Steps</h4>
          <ol class="steps">${m.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
          <div class="grid-2">
            <div><h4>Tips</h4><ul class="plain">${m.tips.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
            <div><h4>Avoid</h4><ul class="plain">${m.pitfalls.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
          </div>
        </div>
      </details>`).join("");
    $("#m-list details").open = true;
    $$("#m-filter .chip").forEach((c) => c.addEventListener("click", () => {
      $$("#m-filter .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
      $$("#m-list details").forEach((d) => (d.hidden = c.dataset.k !== "All" && d.dataset.kind !== c.dataset.k));
    }));
  }

  /* ---------- Market ---------- */
  const labels = {};
  ABP.RESOURCES.forEach((r) => { labels[r.raw] = r.rawName; labels[r.refined] = r.refinedName; });
  ABP.CROPS.concat(ABP.HERBS).forEach((c) => { labels[c.crop] = c.name; labels[c.seed] = c.name + " Seeds"; });
  ABP.BM_GEAR.forEach(([id, n]) => { labels[id] = n; });

  function parseId(id) {
    const m = id.match(/^T(\d)_(.+?)(?:_LEVEL\d)?(?:@(\d))?$/);
    if (!m) return { tier: null, base: id, ench: 0 };
    return { tier: +m[1], base: m[2], ench: +(m[3] || 0) };
  }
  function itemLabel(id) {
    const fromNames = ABP.api.nameOf(id);
    const p = parseId(id);
    const base = labels[p.base];
    const tierText = p.tier ? `T${p.tier}${p.ench ? "." + p.ench : ""}` : "";
    if (base) return `${tierText} ${base}`.trim();
    return fromNames ? `${tierText} ${fromNames}`.trim() : id;
  }
  const resId = (t, base, e) => (e ? `T${t}_${base}_LEVEL${e}@${e}` : `T${t}_${base}`);
  const gearId = (t, base, e) => `T${t}_${base}${e ? "@" + e : ""}`;

  const mk = Object.assign({ preset: "refined", tier: "all", ench: 0, quality: 1, from: "cheapest", custom: ["T4_BAG", "T5_PLANKS", "T6_CAPE"] }, store.get("market", {}));
  const PRESETS = {
    refined: { label: "Refined resources", ids: () => tiers().flatMap((t) => ABP.RESOURCES.map((r) => resId(t, r.refined, mk.ench))) },
    raw: { label: "Raw resources", ids: () => tiers().flatMap((t) => ABP.RESOURCES.map((r) => resId(t, r.raw, mk.ench))) },
    crops: { label: "Crops and herbs", ids: () => ABP.CROPS.concat(ABP.HERBS).map((c) => c.crop) },
    bm: { label: "Black Market flips", ids: () => (mk.tier === "all" ? [6] : [+mk.tier]).flatMap((t) => ABP.BM_GEAR.map(([b]) => gearId(t, b, mk.ench))) },
    custom: { label: "My watchlist", ids: () => mk.custom },
  };
  const tiers = () => (mk.tier === "all" ? [4, 5, 6, 7, 8] : [+mk.tier]);
  const saveMk = () => store.set("market", mk);

  function renderMarket() {
    const p = $("#panel-market");
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Live prices</span>
        <h2>Market</h2>
        <p>Prices come straight from the Albion Online Data Project for your server. Green is the cheapest city to buy, gold the best city to sell. Faded prices are more than a day old. Click an item for its 7-day volume.</p>
      </div>
      <div class="box stack">
        <div class="controls">
          <label class="field"><span>Server</span><select id="mk-server">${ABP.SERVERS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select></label>
          <label class="field"><span>List</span><select id="mk-preset">${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label>
          <label class="field"><span>Tier</span><select id="mk-tier"><option value="all">T4 to T8</option>${[4, 5, 6, 7, 8].map((t) => `<option value="${t}">T${t} ${ABP.TIER_NAMES[t]}</option>`).join("")}</select></label>
          <label class="field"><span>Enchantment</span><select id="mk-ench">${[0, 1, 2, 3, 4].map((e) => `<option value="${e}">.${e}</option>`).join("")}</select></label>
          <label class="field"><span>Quality</span><select id="mk-quality">${["Normal", "Good", "Outstanding", "Excellent", "Masterpiece"].map((q, i) => `<option value="${i + 1}">${q}</option>`).join("")}</select></label>
          <label class="field" id="mk-from-f"><span>Buy gear in</span><select id="mk-from"><option value="cheapest">Cheapest city</option>${ABP.CITIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
          <button class="btn" id="mk-load">Load prices</button>
        </div>
        <div class="search" id="mk-search-wrap">
          <label class="field"><span>Add any item to your watchlist</span><input type="search" id="mk-search" placeholder="Type an item name, for example Elder's Bag" autocomplete="off"></label>
          <div class="results" id="mk-results" hidden></div>
        </div>
        <div class="row small muted" id="mk-gold"></div>
      </div>
      <div id="mk-out" class="stack"></div>
      <div id="mk-detail"></div>`;
    $("#mk-server").value = ABP.api.server;
    $("#mk-preset").value = mk.preset;
    $("#mk-tier").value = mk.tier;
    $("#mk-ench").value = mk.ench;
    $("#mk-quality").value = mk.quality;
    $("#mk-from").value = mk.from;
    const sync = () => { $("#mk-from-f").hidden = mk.preset !== "bm"; };
    sync();
    $("#mk-server").addEventListener("change", (e) => { ABP.api.server = e.target.value; loadGold(); loadMarket(); });
    [["preset", "mk-preset"], ["tier", "mk-tier"], ["ench", "mk-ench"], ["quality", "mk-quality"], ["from", "mk-from"]].forEach(([k, id]) =>
      $("#" + id).addEventListener("change", (e) => { mk[k] = ["ench", "quality"].includes(k) ? +e.target.value : e.target.value; saveMk(); sync(); loadMarket(); }));
    $("#mk-load").addEventListener("click", loadMarket);
    setupSearch();
    loadGold();
    loadMarket();
  }

  async function loadGold() {
    const g = $("#mk-gold");
    try {
      const rows = await ABP.api.gold();
      if (!rows.length) return;
      const last = rows[rows.length - 1].price, first = rows[0].price;
      const ch = (last - first) / first;
      g.innerHTML = `<span>Gold price now: <span class="money">${full(last)}</span> silver per gold</span><span class="${ch >= 0 ? "good" : "bad"}">${ch >= 0 ? "+" : ""}${pct(ch)} over 24 hours</span>`;
    } catch (e) { g.textContent = ""; }
  }

  function setupSearch() {
    const input = $("#mk-search"), box = $("#mk-results");
    let list = null;
    input.addEventListener("focus", async () => {
      if (list) return;
      input.placeholder = "Loading item names…";
      try { list = await ABP.api.itemNames(); input.placeholder = "Type an item name, for example Elder's Bag"; }
      catch (e) { input.placeholder = "Item names could not load here. Type an item id such as T6_BAG and press Enter."; list = []; }
    });
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2 || !list) { box.hidden = true; return; }
      const hits = list.filter((n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).slice(0, 30);
      box.innerHTML = hits.map((h) => `<button data-id="${esc(h.id)}"><span>${esc(h.name)}</span><small>${esc(h.id)}</small></button>`).join("") || `<p class="small muted" style="padding:8px">No items match.</p>`;
      box.hidden = false;
      $$("button", box).forEach((b) => b.addEventListener("click", () => addCustom(b.dataset.id)));
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && /^T\d_[A-Z0-9_@]+$/i.test(input.value.trim())) addCustom(input.value.trim().toUpperCase());
      if (e.key === "Escape") box.hidden = true;
    });
    document.addEventListener("click", (e) => { if (!$("#mk-search-wrap").contains(e.target)) box.hidden = true; });
    function addCustom(id) {
      if (!mk.custom.includes(id)) mk.custom.push(id);
      mk.preset = "custom"; $("#mk-preset").value = "custom"; $("#mk-from-f").hidden = true;
      saveMk(); input.value = ""; box.hidden = true; loadMarket();
    }
  }

  let mkRows = null;
  async function loadMarket() {
    const out = $("#mk-out");
    const ids = PRESETS[mk.preset].ids();
    if (!ids.length) { out.innerHTML = `<p class="muted">Your watchlist is empty. Search for an item above to add it.</p>`; return; }
    out.innerHTML = `<p class="muted">Loading ${ids.length} items from the ${ABP.SERVERS.find((s) => s.id === ABP.api.server).label} server…</p>`;
    const locs = mk.preset === "bm" ? [...ABP.CITIES, ABP.BM] : ABP.CITIES;
    try {
      const rows = await ABP.api.prices(ids, locs, [mk.quality]);
      mkRows = rows;
      drawMarket(ids, rows);
    } catch (e) {
      out.innerHTML = fallbackNotice(e, `${ABP.api.host()}/api/v2/stats/prices/${ids.join(",")}.json?locations=${encodeURIComponent(locs.join(","))}&qualities=${mk.quality}`);
      $("#fb-apply")?.addEventListener("click", () => {
        try {
          const raw = JSON.parse($("#fb-json").value);
          const rows = raw.map((r) => ({ id: r.item_id, city: r.city, quality: r.quality, sell: r.sell_price_min || 0, sellDate: r.sell_price_min_date?.startsWith("0001") ? null : r.sell_price_min_date, buy: r.buy_price_max || 0, buyDate: r.buy_price_max_date?.startsWith("0001") ? null : r.buy_price_max_date }));
          drawMarket(ids, rows);
        } catch (err) { $("#fb-msg").textContent = "That text is not the price JSON. Copy the whole page the link opens and paste it again."; }
      });
    }
  }

  function fallbackNotice(e, url) {
    return `<div class="notice ${e.code === "blocked" ? "" : "err"}">
      <strong>${esc(e.message)}</strong>
      ${e.code === "blocked" ? `<p class="small">You can still use this page: open the link below in a new tab, copy everything it shows, and paste it here.</p>
      <a class="url-box mono small" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
      <textarea id="fb-json" placeholder="Paste the price data here"></textarea>
      <div class="row"><button class="btn" id="fb-apply">Show prices</button><span class="small bad" id="fb-msg"></span></div>` : ""}
    </div>`;
  }

  function drawMarket(ids, rows) {
    const out = $("#mk-out");
    const idx = ABP.api.index(rows);
    const sellTax = FEES.salesTaxPremium;
    const stale = (r) => { const h = ago(r?.sellDate); return h == null || h > 24; };
    if (mk.preset === "bm") {
      const list = ids.map((id) => {
        const c = idx[id] || {};
        const bm = c[ABP.BM];
        let src = null;
        if (mk.from === "cheapest") {
          for (const city of ABP.CITIES) { const r = c[city]; if (r?.sell && (!src || r.sell < src.sell)) src = r; }
        } else src = c[mk.from];
        const net = bm?.buy ? bm.buy * (1 - sellTax) : null;
        const profit = net != null && src?.sell ? net - src.sell : null;
        return { id, src, bm, net, profit, roi: profit != null ? profit / src.sell : null };
      }).sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
      const good = list.filter((x) => x.roi > 0.1).length;
      out.innerHTML = `
        <p class="small">${good ? `<strong>${good}</strong> items clear a 10% margin after the 4% tax.` : "No item clears a 10% margin right now. Try another tier or enchantment."} Black Market prices move fast; trust the ones updated in the last few hours.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Item</th><th>Buy in</th><th>Cost</th><th>Black Market pays</th><th>BM price age</th><th>After 4% tax</th><th>Profit each</th><th>Margin</th></tr></thead>
          <tbody>${list.map((x) => `<tr data-id="${esc(x.id)}">
            <td><span class="item-name">${esc(itemLabel(x.id))}<small>${esc(x.id)}</small></span></td>
            <td>${x.src ? esc(x.src.city) : "–"}</td>
            <td class="num ${stale(x.src) ? "stale" : ""}">${x.src?.sell ? full(x.src.sell) : "–"}</td>
            <td class="num hi">${x.bm?.buy ? full(x.bm.buy) : "–"}</td>
            <td class="small muted">${agoText(ago(x.bm?.buyDate))}</td>
            <td class="num">${x.net ? full(x.net) : "–"}</td>
            <td class="num ${x.profit > 0 ? "good" : x.profit < 0 ? "bad" : ""}">${x.profit != null ? full(x.profit) : "–"}</td>
            <td>${x.roi != null ? `<span class="pill ${x.roi > 0.1 ? "good" : x.roi < 0 ? "bad" : ""}">${pct(x.roi)}</span>` : "–"}</td>
          </tr>`).join("")}</tbody></table></div>`;
    } else {
      const list = ids.map((id) => {
        const c = idx[id] || {};
        let lo = null, hi = null;
        for (const city of ABP.CITIES) {
          const r = c[city]; if (!r?.sell || stale(r)) continue;
          if (!lo || r.sell < lo.sell) lo = r;
          if (!hi || r.sell > hi.sell) hi = r;
        }
        const profit = lo && hi ? hi.sell * (1 - sellTax - FEES.setupFee) - lo.sell : null;
        return { id, c, lo, hi, profit, roi: profit != null ? profit / lo.sell : null };
      });
      out.innerHTML = `
        <p class="small muted">The last column assumes you instant-buy in the cheapest city and list a sell order in the best city (4% tax and 2.5% setup fee). It ignores travel risk, so check the route.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Item</th>${ABP.CITIES.map((c) => `<th>${c}</th>`).join("")}<th>Haul profit</th><th>Margin</th></tr></thead>
          <tbody>${list.map((x) => `<tr data-id="${esc(x.id)}">
            <td><span class="item-name">${esc(itemLabel(x.id))}<small>${esc(x.id)}</small></span></td>
            ${ABP.CITIES.map((city) => {
              const r = x.c[city];
              if (!r?.sell) return `<td class="num empty">–</td>`;
              const h = ago(r.sellDate);
              const cls = stale(r) ? "stale" : r === x.lo ? "lo" : r === x.hi ? "hi" : "";
              return `<td class="num ${cls}" title="Updated ${agoText(h)}${r.buy ? " · top buy order " + full(r.buy) : ""}">${full(r.sell)}</td>`;
            }).join("")}
            <td class="num ${x.profit > 0 ? "good" : x.profit < 0 ? "bad" : ""}">${x.profit != null ? full(x.profit) : "–"}</td>
            <td>${x.roi != null ? `<span class="pill ${x.roi > 0.1 ? "good" : x.roi < 0 ? "bad" : ""}">${pct(x.roi)}</span>` : "–"}</td>
          </tr>`).join("")}</tbody></table></div>
        ${mk.preset === "custom" ? `<div class="row"><button class="btn ghost" id="mk-clear">Clear watchlist</button></div>` : ""}`;
      $("#mk-clear")?.addEventListener("click", () => { mk.custom = []; saveMk(); loadMarket(); });
    }
    $$("#mk-out tbody tr").forEach((tr) => tr.addEventListener("click", () => showDetail(tr.dataset.id)));
  }

  async function showDetail(id) {
    const d = $("#mk-detail");
    d.innerHTML = `<div class="box"><p class="muted">Loading 7-day history for ${esc(itemLabel(id))}…</p></div>`;
    d.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const locs = [...ABP.CITIES, ABP.BM];
    try {
      const hist = await ABP.api.history(id, locs, mk.quality);
      const rows = locs.map((city) => {
        const h = hist.find((x) => x.city === city);
        const data = h?.data || [];
        const sold = data.reduce((s, p) => s + p.item_count, 0);
        const avg = sold ? data.reduce((s, p) => s + p.avg_price * p.item_count, 0) / sold : null;
        return { city, sold, avg, perDay: data.length ? sold / data.length : 0 };
      });
      d.innerHTML = `<div class="box detail">
        <div class="row spread"><h3>${esc(itemLabel(id))}</h3><button class="btn ghost" id="dt-close">Close</button></div>
        <p class="small muted">Sales recorded over the last 7 days. Low volume means your orders may take days to fill.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Market</th><th>Average price</th><th>Sold in 7 days</th><th>Per day</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td>${esc(r.city)}</td><td class="num">${r.avg ? full(r.avg) : "–"}</td><td class="num">${full(r.sold)}</td><td class="num">${r.perDay.toFixed(1)}</td></tr>`).join("")}</tbody>
        </table></div></div>`;
      $("#dt-close").addEventListener("click", () => (d.innerHTML = ""));
    } catch (e) {
      d.innerHTML = `<div class="notice err"><strong>${esc(e.message)}</strong></div>`;
    }
  }

  /* ---------- Calculators ---------- */
  const rateOf = (bonusCity, focus, daily) => { const b = 0.18 + (bonusCity ? 0.4 : 0) + (focus ? 0.59 : 0) + daily; return b / (1 + b); };

  function renderCalc() {
    const p = $("#panel-calc");
    const rf = Object.assign({ res: "wood", ench: 0, buyCity: "Fort Sterling", refineCity: "Fort Sterling", sellCity: "Fort Sterling", buyMode: "order", sellMode: "order", daily: 0, fee: 0, focus: {} }, store.get("calc.refine", {}));
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Do the math</span>
        <h2>Calculators</h2>
        <p>Every calculator uses premium fees: 4% sales tax and a 2.5% setup fee per order. Live prices fill in automatically and you can overwrite any of them.</p>
      </div>
      <div class="box stack">
        <h3>Refining profit, T4 to T8</h3>
        <div class="controls">
          <label class="field"><span>Resource</span><select id="rf-res">${ABP.RESOURCES.map((r) => `<option value="${r.key}">${r.refinedName}</option>`).join("")}</select></label>
          <label class="field"><span>Enchantment</span><select id="rf-ench">${[0, 1, 2, 3, 4].map((e) => `<option value="${e}">.${e}</option>`).join("")}</select></label>
          <label class="field"><span>Buy raw in</span><select id="rf-buyCity">${ABP.CITIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
          <label class="field"><span>Refine in</span><select id="rf-refineCity">${ABP.CITIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
          <label class="field"><span>Sell in</span><select id="rf-sellCity">${ABP.CITIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
          <label class="field"><span>Buy materials by</span><select id="rf-buyMode"><option value="order">Buy order</option><option value="instant">Instant buy</option></select></label>
          <label class="field"><span>Sell output by</span><select id="rf-sellMode"><option value="order">Sell order</option><option value="instant">Instant sell</option></select></label>
          <label class="field"><span>Daily bonus</span><select id="rf-daily"><option value="0">None</option><option value="0.1">Silver day (+10%)</option><option value="0.2">Gold day (+20%)</option></select></label>
          <label class="field"><span>Station fee per refine</span><input type="number" id="rf-fee" min="0" step="10"></label>
        </div>
        <p class="small muted" id="rf-rates"></p>
        <div id="rf-out"></div>
        <p class="small muted">Focus cost per refine depends on your spec. Read it from the refining window and type it in to see silver per focus point and the value of your 10,000 daily focus.</p>
      </div>
      <div class="grid-2">
        <div class="box stack">
          <h3>Order flip</h3>
          <div class="controls">
            <label class="field"><span>Buy price</span><input type="number" id="fl-buy" value="10000" min="0"></label>
            <label class="field"><span>Sell price</span><input type="number" id="fl-sell" value="12500" min="0"></label>
            <label class="field"><span>Quantity</span><input type="number" id="fl-qty" value="100" min="1"></label>
            <label class="field"><span>Buy by</span><select id="fl-bm"><option value="order">Buy order</option><option value="instant">Instant buy</option></select></label>
            <label class="field"><span>Sell by</span><select id="fl-sm"><option value="order">Sell order</option><option value="instant">Instant sell</option></select></label>
            <label class="field"><span>Account</span><select id="fl-prem"><option value="1">Premium (4% tax)</option><option value="0">No premium (8% tax)</option></select></label>
          </div>
          <div class="out" id="fl-out"></div>
        </div>
        <div class="box stack">
          <h3>Island harvest</h3>
          <div class="controls">
            <label class="field"><span>Crop or herb</span><select id="is-crop">${ABP.CROPS.concat(ABP.HERBS).map((c) => `<option value="${c.crop}">T${c.tier} ${c.name}</option>`).join("")}</select></label>
            <label class="field"><span>Plots planted</span><input type="number" id="is-plots" value="8" min="1"></label>
            <label class="field"><span>Plants per plot</span><input type="number" id="is-slots" value="9" min="1"></label>
            <label class="field"><span>Harvest per plant</span><input type="number" id="is-yield" value="6" min="0" step="0.5"></label>
            <label class="field"><span>Seeds returned</span><input type="number" id="is-seedret" value="70" min="0" max="100"></label>
            <label class="field"><span>Sell in</span><select id="is-city">${ABP.CITIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
            <label class="field"><span>Crop price</span><input type="number" id="is-price" min="0"></label>
            <label class="field"><span>Seed price</span><input type="number" id="is-seed" min="0"></label>
          </div>
          <p class="small muted">Harvest per plant and seed return are starting guesses for a premium account. Replace them with what your last harvest gave.</p>
          <div class="out" id="is-out"></div>
        </div>
      </div>`;

    /* Refining */
    for (const k of ["res", "ench", "buyCity", "refineCity", "sellCity", "buyMode", "sellMode", "daily", "fee"]) {
      const elx = $("#rf-" + k); elx.value = rf[k];
      elx.addEventListener("change", () => {
        rf[k] = ["ench", "daily", "fee"].includes(k) ? +elx.value : elx.value;
        if (k === "res") { const city = ABP.RESOURCES.find((r) => r.key === rf.res).city; rf.refineCity = city; rf.sellCity = city; $("#rf-refineCity").value = city; $("#rf-sellCity").value = city; }
        store.set("calc.refine", rf); loadRefine();
      });
    }
    let rfPrices = null;
    async function loadRefine() {
      const res = ABP.RESOURCES.find((r) => r.key === rf.res);
      const bonus = rf.refineCity === res.city;
      const rNo = rateOf(bonus, false, rf.daily), rF = rateOf(bonus, true, rf.daily);
      $("#rf-rates").innerHTML = `Return rate in ${esc(rf.refineCity)}: <strong>${pct(rNo)}</strong> without focus, <strong>${pct(rF)}</strong> with focus.${bonus ? "" : ` ${esc(res.city)} is the bonus city for ${esc(res.refinedName)}.`}`;
      const out = $("#rf-out");
      const ids = [];
      for (let t = 3; t <= 8; t++) { ids.push(resId(t, res.refined, t === 3 ? 0 : rf.ench)); if (t >= 4) ids.push(resId(t, res.raw, rf.ench)); }
      out.innerHTML = `<p class="muted">Loading prices…</p>`;
      try {
        const rows = await ABP.api.prices(ids, [...new Set([rf.buyCity, rf.sellCity])]);
        rfPrices = ABP.api.index(rows);
      } catch (e) {
        rfPrices = {};
        out.innerHTML = `<div class="notice"><strong>${esc(e.message)}</strong><p class="small">Type prices into the table below by hand.</p></div>`;
      }
      drawRefine(res, rNo, rF);
    }
    const manual = {};
    function priceFor(id, city, mode) {
      if (manual[id + "|" + mode] != null) return manual[id + "|" + mode];
      const r = rfPrices?.[id]?.[city];
      if (!r) return 0;
      return mode === "buyOrder" ? r.buy || r.sell : mode === "instantBuy" ? r.sell : mode === "sellOrder" ? r.sell : r.buy;
    }
    function drawRefine(res, rNo, rF) {
      const out = $("#rf-out");
      const keep = out.querySelector(".notice")?.outerHTML || "";
      const bMode = rf.buyMode === "order" ? "buyOrder" : "instantBuy";
      const sMode = rf.sellMode === "order" ? "sellOrder" : "instantSell";
      const buyMult = rf.buyMode === "order" ? 1 + FEES.setupFee : 1;
      const sellMult = rf.sellMode === "order" ? 1 - FEES.salesTaxPremium - FEES.setupFee : 1 - FEES.salesTaxPremium;
      const rows = [4, 5, 6, 7, 8].map((t) => {
        const rawId = resId(t, res.raw, rf.ench), prevId = resId(t - 1, res.refined, t === 4 ? 0 : rf.ench), outId = resId(t, res.refined, rf.ench);
        const n = ABP.REFINE_RAW[t];
        const rawP = priceFor(rawId, rf.buyCity, bMode), prevP = priceFor(prevId, rf.buyCity, bMode), outP = priceFor(outId, rf.sellCity, sMode);
        const input = (n * rawP + prevP) * buyMult;
        const rev = outP * sellMult;
        const pNo = rev - input * (1 - rNo) - rf.fee, pF = rev - input * (1 - rF) - rf.fee;
        const fc = +(rf.focus[t] || 0);
        const spf = fc ? pF / fc : null;
        return { t, rawId, prevId, outId, n, rawP, prevP, outP, pNo, pF, fc, spf, ok: rawP && prevP && outP };
      });
      out.innerHTML = keep + `<div class="table-wrap"><table>
        <thead><tr><th>Tier</th><th>${esc(res.rawName)} ×n</th><th>Raw price</th><th>Lower tier</th><th>Output price</th><th>Profit, no focus</th><th>Profit, focus</th><th>Focus cost</th><th>Silver per focus</th><th>10k focus a day</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>T${r.t}${rf.ench ? "." + rf.ench : ""}</td>
          <td class="num">${r.n}</td>
          <td><input type="number" class="num" data-id="${r.rawId}|${bMode}" value="${Math.round(r.rawP) || ""}" style="width:90px"></td>
          <td><input type="number" class="num" data-id="${r.prevId}|${bMode}" value="${Math.round(r.prevP) || ""}" style="width:90px"></td>
          <td><input type="number" class="num" data-id="${r.outId}|${sMode}" value="${Math.round(r.outP) || ""}" style="width:90px"></td>
          <td class="num ${r.ok ? (r.pNo > 0 ? "good" : "bad") : "empty"}">${r.ok ? full(r.pNo) : "–"}</td>
          <td class="num ${r.ok ? (r.pF > 0 ? "good" : "bad") : "empty"}">${r.ok ? full(r.pF) : "–"}</td>
          <td><input type="number" class="num" data-focus="${r.t}" value="${r.fc || ""}" placeholder="from game" style="width:96px"></td>
          <td class="num">${r.ok && r.spf != null ? r.spf.toFixed(1) : "–"}</td>
          <td class="num money">${r.ok && r.spf != null ? fmt(r.spf * 10000) : "–"}</td>
        </tr>`).join("")}</tbody></table></div>`;
      $$("#rf-out input[data-id]").forEach((inp) => inp.addEventListener("change", () => { manual[inp.dataset.id] = +inp.value || 0; drawRefine(res, rNo, rF); }));
      $$("#rf-out input[data-focus]").forEach((inp) => inp.addEventListener("change", () => { rf.focus[inp.dataset.focus] = +inp.value || 0; store.set("calc.refine", rf); drawRefine(res, rNo, rF); }));
    }
    loadRefine();

    /* Flip */
    const flip = () => {
      const buy = +$("#fl-buy").value || 0, sell = +$("#fl-sell").value || 0, q = +$("#fl-qty").value || 0;
      const tax = $("#fl-prem").value === "1" ? FEES.salesTaxPremium : FEES.salesTaxFree;
      const bOrder = $("#fl-bm").value === "order", sOrder = $("#fl-sm").value === "order";
      const cost = buy * (1 + (bOrder ? FEES.setupFee : 0));
      const keep = 1 - tax - (sOrder ? FEES.setupFee : 0);
      const net = sell * keep;
      const profit = (net - cost) * q;
      $("#fl-out").innerHTML = `
        <div class="stat"><span class="label">Total cost</span><span class="v">${fmt(cost * q)}</span></div>
        <div class="stat key"><span class="label">Profit</span><span class="v ${profit >= 0 ? "good" : "bad"}">${fmt(profit)}</span></div>
        <div class="stat"><span class="label">Return</span><span class="v">${pct(cost ? (net - cost) / cost : 0)}</span></div>
        <div class="stat"><span class="label">Break-even sell</span><span class="v">${full(cost / keep)}</span></div>`;
    };
    $$("#fl-buy,#fl-sell,#fl-qty,#fl-bm,#fl-sm,#fl-prem").forEach((x) => x.addEventListener("input", flip));
    flip();

    /* Island */
    const island = () => {
      const plants = (+$("#is-plots").value || 0) * (+$("#is-slots").value || 0);
      const harvest = plants * (+$("#is-yield").value || 0);
      const price = +$("#is-price").value || 0, seed = +$("#is-seed").value || 0;
      const seedsBought = plants * (1 - (+$("#is-seedret").value || 0) / 100);
      const revenue = harvest * price * (1 - FEES.salesTaxPremium - FEES.setupFee);
      const daily = revenue - seedsBought * seed;
      $("#is-out").innerHTML = `
        <div class="stat"><span class="label">Harvest a day</span><span class="v">${full(harvest)}</span></div>
        <div class="stat"><span class="label">Seeds to buy</span><span class="v">${full(seedsBought)}</span></div>
        <div class="stat key"><span class="label">Profit a day</span><span class="v ${daily >= 0 ? "good" : "bad"}">${fmt(daily)}</span></div>
        <div class="stat"><span class="label">Profit a month</span><span class="v money">${fmt(daily * 30)}</span></div>`;
    };
    async function islandPrices() {
      const c = ABP.CROPS.concat(ABP.HERBS).find((x) => x.crop === $("#is-crop").value);
      const city = $("#is-city").value;
      try {
        const idx = ABP.api.index(await ABP.api.prices([c.crop, c.seed], [city]));
        $("#is-price").value = idx[c.crop]?.[city]?.sell || "";
        $("#is-seed").value = idx[c.seed]?.[city]?.sell || "";
      } catch (e) { /* keep manual values */ }
      island();
    }
    $$("#is-plots,#is-slots,#is-yield,#is-seedret,#is-price,#is-seed").forEach((x) => x.addEventListener("input", island));
    $("#is-crop").addEventListener("change", islandPrices);
    $("#is-city").addEventListener("change", islandPrices);
    $("#is-crop").value = "T4_BURDOCK";
    islandPrices();
  }

  /* ---------- Wiki ---------- */
  function renderWiki() {
    $("#panel-wiki").innerHTML = `
      <div class="panel-head">
        <span class="label">Reference</span>
        <h2>Wiki essentials</h2>
        <p>The rules that decide your profit, gathered in one place. Each section links to the official Albion Online wiki for the full article.</p>
      </div>
      <div class="wiki">
        <nav class="toc" aria-label="Wiki sections">${ABP.WIKI.map((w) => `<a href="#wiki" data-to="w-${w.id}">${esc(w.title)}</a>`).join("")}</nav>
        <div class="wiki-list">${ABP.WIKI.map((w) => `
          <article id="w-${w.id}">
            <h3>${esc(w.title)}</h3>
            ${w.table ? `<div class="table-wrap"><table><thead><tr>${w.table.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${w.table.rows.map((r) => `<tr>${r.map((c, i) => `<td style="${i ? "white-space:normal;text-align:left" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
            <ul>${w.body.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
            <a class="small" href="${w.link}" target="_blank" rel="noopener">Read more on the wiki</a>
          </article>`).join("")}</div>
      </div>`;
    $$(".toc a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); $("#" + a.dataset.to).scrollIntoView({ behavior: "smooth" }); }));
  }

  /* ---------- Progress ---------- */
  let log = store.get("log", []);
  function renderProgress() {
    const p = $("#panel-progress");
    if (!p.dataset.ready) {
      p.dataset.ready = "1";
      p.innerHTML = `
        <div class="panel-head">
          <span class="label">Ledger</span>
          <h2>Progress</h2>
          <p>Log your total silver (bank plus orders plus stock value) once a day or once a week. The chart compares you with the plan you picked. Your log stays in this browser.</p>
        </div>
        <div class="box stack">
          <form class="controls" id="lg-form">
            <label class="field"><span>Date</span><input type="date" id="lg-date" required></label>
            <label class="field"><span>Total silver</span><input type="number" id="lg-silver" min="0" step="1000" required placeholder="e.g. 25000000"></label>
            <label class="field"><span>Note</span><input type="text" id="lg-note" placeholder="optional"></label>
            <button class="btn" type="submit">Add entry</button>
          </form>
          <div class="stats" id="lg-stats"></div>
          <canvas class="chart" id="lg-chart" aria-label="Your silver compared with the plan"></canvas>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Silver</th><th>Change</th><th>Plan for that day</th><th>Note</th><th></th></tr></thead><tbody id="lg-rows"></tbody></table></div>
        <details class="box"><summary>Back up or restore your log</summary>
          <div class="stack"><textarea id="lg-json" aria-label="Log data"></textarea>
          <div class="row"><button class="btn ghost" id="lg-copy" type="button">Copy log</button><button class="btn ghost" id="lg-restore" type="button">Restore from text</button><span class="small muted" id="lg-msg"></span></div></div>
        </details>`;
      $("#lg-date").value = todayISO();
      $("#lg-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const date = $("#lg-date").value, silver = +$("#lg-silver").value;
        if (!date || !(silver >= 0)) return;
        log = log.filter((x) => x.date !== date).concat({ date, silver, note: $("#lg-note").value.trim() }).sort((a, b) => a.date.localeCompare(b.date));
        store.set("log", log); $("#lg-silver").value = ""; $("#lg-note").value = "";
        renderProgress(); goalMeter();
      });
      $("#lg-copy").addEventListener("click", async () => {
        const txt = JSON.stringify(log); $("#lg-json").value = txt;
        try { await navigator.clipboard.writeText(txt); $("#lg-msg").textContent = "Copied."; } catch (e) { $("#lg-json").select(); $("#lg-msg").textContent = "Select the text above and copy it."; }
      });
      $("#lg-restore").addEventListener("click", () => {
        try { const v = JSON.parse($("#lg-json").value); if (!Array.isArray(v)) throw 0; log = v; store.set("log", log); renderProgress(); goalMeter(); $("#lg-msg").textContent = "Restored."; }
        catch (e) { $("#lg-msg").textContent = "That text is not a saved log."; }
      });
    }
    const prof = profileOf(plan.profile);
    const sim = simulate(prof, plan.start, plan.hours ?? prof.hours, plan.skill);
    const start = new Date(plan.date + "T12:00:00");
    const dayOf = (d) => Math.round((new Date(d + "T12:00:00") - start) / 864e5);
    const planAt = (d) => sim.pts[Math.max(0, Math.min(ABP.DAYS, dayOf(d)))].y;
    const last = log[log.length - 1];
    const daysLeft = Math.max(1, ABP.DAYS - dayOf(todayISO()));
    $("#lg-stats").innerHTML = last ? `
      <div class="stat key"><span class="label">Latest</span><span class="v money">${fmt(last.silver)}</span><span class="small muted">${dateText(new Date(last.date + "T12:00:00"))}</span></div>
      <div class="stat"><span class="label">Plan for that day</span><span class="v">${fmt(planAt(last.date))}</span><span class="small ${last.silver >= planAt(last.date) ? "good" : "bad"}">${last.silver >= planAt(last.date) ? "ahead by " : "behind by "}${fmt(Math.abs(last.silver - planAt(last.date)))}</span></div>
      <div class="stat"><span class="label">Needed a day from now</span><span class="v">${fmt(Math.max(0, ABP.GOAL - last.silver) / daysLeft)}</span><span class="small muted">${daysLeft} days left in the plan year</span></div>
      <div class="stat"><span class="label">Goal reached</span><span class="v">${pct(last.silver / ABP.GOAL)}</span></div>`
      : `<p class="muted">No entries yet. Add today's total silver to start your ledger. The chart shows the ${esc(prof.name)} plan until then.</p>`;
    $("#lg-rows").innerHTML = log.length ? log.slice().reverse().map((x, i, arr) => {
      const prev = arr[i + 1];
      const ch = prev ? x.silver - prev.silver : null;
      return `<tr><td>${esc(x.date)}</td><td class="num money">${full(x.silver)}</td><td class="num ${ch > 0 ? "good" : ch < 0 ? "bad" : ""}">${ch == null ? "–" : (ch > 0 ? "+" : "") + fmt(ch)}</td><td class="num">${fmt(planAt(x.date))}</td><td style="text-align:left">${esc(x.note || "")}</td><td><button class="btn ghost small" data-del="${esc(x.date)}" aria-label="Delete entry">Delete</button></td></tr>`;
    }).join("") : `<tr><td colspan="6" class="muted">Your entries will appear here.</td></tr>`;
    $$("#lg-rows [data-del]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); log = log.filter((x) => x.date !== b.dataset.del); store.set("log", log); renderProgress(); goalMeter(); }));
    const actual = log.map((x) => ({ x: Math.max(0, dayOf(x.date)), y: x.silver }));
    lineChart($("#lg-chart"), [
      { data: sim.pts, color: css("--muted"), dash: [3, 4], width: 1.5 },
      { data: actual, color: css("--gold"), dots: true, width: 2.5 },
    ], { goal: ABP.GOAL, xLabels: monthLabels(start) });
  }

  function goalMeter() {
    const last = log[log.length - 1];
    const v = last ? last.silver : plan.start;
    const share = Math.min(1, v / ABP.GOAL);
    $("#goalMeter").innerHTML = `
      <div class="goal-row"><span class="money">${fmt(v)}</span><span class="muted">${pct(share)} of 1,000,000,000</span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${(share * 100).toFixed(1)}"><div class="fill" style="width:${(share * 100).toFixed(2)}%"></div></div>`;
  }

  const RENDER = { plan: renderPlan, methods: renderMethods, market: renderMarket, calc: renderCalc, wiki: renderWiki, progress: renderProgress };

  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { drawPlanChart(); if (!$("#panel-progress").hidden) renderProgress(); }, 150); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { drawPlanChart(); });

  goalMeter();
  const initial = (location.hash || "").slice(1) || store.get("tab", "plan");
  show(initial);
  ABP.api.itemNames().catch(() => {});
})();
