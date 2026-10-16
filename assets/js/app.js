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
  const TABS = ["plan", "picks", "methods", "market", "calc", "wiki", "wealth", "progress", "tools", "times"];
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
    if (tab === "wealth") drawHistory();
    store.set("tab", tab);
  }
  $$(".tabs button[role=tab]").forEach((b) => b.addEventListener("click", () => {
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
  if (plan.silver == null) { plan.silver = plan.start; plan.gold = 0; }

  /* Gold converts to silver at the live gold price unless the player sets their own rate. */
  const goldRate = Object.assign({ rate: 4500, live: null, liveAt: null, manual: false }, store.get("gold", {}));
  const toSilver = (silver, gold) => (+silver || 0) + (+gold || 0) * goldRate.rate;
  function setRate(v, manual) {
    goldRate.rate = Math.max(1, Math.round(v)); goldRate.manual = manual; store.set("gold", goldRate);
    plan.start = toSilver(plan.silver, plan.gold); savePlan();
    $$(".gold-rate").forEach((i) => { if (document.activeElement !== i) i.value = goldRate.rate; });
    $$(".rate-note").forEach((n) => (n.innerHTML = rateNote()));
    if (rendered.plan) updatePlan();
    $("#lg-total") && lgTotal();
    goalMeter();
  }
  function rateNote() {
    if (goldRate.manual) return `Your own rate.${goldRate.live ? ` Live price is ${full(goldRate.live)}. <button type="button" class="linkish use-live">Use live</button>` : ""}`;
    return goldRate.live ? `Live price from the market, ${agoText(ago(goldRate.liveAt))}.` : "Typical price. Live price loads with market data.";
  }
  function bindRate(root) {
    $$(".gold-rate", root).forEach((i) => { i.value = goldRate.rate; i.addEventListener("input", () => { if (+i.value > 0) setRate(+i.value, true); }); });
    root.addEventListener("click", (e) => { if (e.target.classList.contains("use-live") && goldRate.live) setRate(goldRate.live, false); });
    $$(".rate-note", root).forEach((n) => (n.innerHTML = rateNote()));
  }
  const refreshGold = () => ABP.api.gold().then((rows) => {
    if (!rows?.length) return;
    const last = rows[rows.length - 1];
    goldRate.live = last.price; goldRate.liveAt = last.timestamp; store.set("gold", goldRate);
    setRate(goldRate.manual ? goldRate.rate : last.price, goldRate.manual);
  }).catch(() => {});
  refreshGold();
  const profileOf = (id) => ABP.PROFILES.find((p) => p.id === id) || ABP.PROFILES[0];
  const phaseIdx = (cap) => ABP.PHASES.findIndex((p) => cap < p.until);

  /* Focus income scales with refining spec. Rates assume about 10,000 focus efficiency at T6
     (focus cost halved); an empty spec is treated as that baseline until the player enters theirs. */
  function focusFactor() {
    const effs = Object.values(ABP.spec.refine).map((sp) => ABP.refineEfficiency(sp, 6));
    const best = Math.max(...effs);
    if (best === 0) return { factor: 1, set: false, eff: 0 };
    return { factor: Math.max(0.5, Math.min(2, Math.pow(2, (best - 10000) / 10000))), set: true, eff: best };
  }
  const ffFromEff = (eff) => Math.max(0.5, Math.min(2, Math.pow(2, (eff - 10000) / 10000)));
  function simulate(prof, start, hours, skill, days = ABP.DAYS, ffDay = null) {
    const ff0 = focusFactor().factor;
    let cap = start;
    const pts = [{ x: 0, y: cap }];
    const phaseDays = [0, null, null, null];
    let hit = null;
    for (let d = 1; d <= days; d++) {
      const P = prof.phases[phaseIdx(cap)];
      const ff = ffDay ? ffDay(d) : ff0;
      cap += hours * P.active * skill + Math.min(cap, P.cap) * P.roi * skill + P.passive * (0.5 + 0.5 * ff);
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
          <label class="field"><span>Silver you have now</span><input type="number" id="pl-start" min="0" step="any"></label>
          <label class="field"><span>Gold you have</span><input type="number" id="pl-gold" min="0" step="any"></label>
          <label class="field"><span>Gold price (silver per gold)</span><input type="number" class="gold-rate" id="pl-rate" min="1" step="any"></label>
          <label class="field"><span>Active hours a day</span><input type="number" id="pl-hours" min="0.5" max="12" step="0.5"></label>
          <label class="field"><span>Your experience</span><select id="pl-skill">${SKILL.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select></label>
          <label class="field"><span>Start date</span><input type="date" id="pl-date"></label>
        </div>
        <p class="small muted"><span id="pl-total"></span> <span class="rate-note"></span></p>
        <div class="stats" id="pl-stats"></div>
        <canvas class="chart" id="pl-chart" aria-label="Projected silver over the year"></canvas>
        <p class="small muted" id="pl-note"></p>
      </div>
      <div class="box stack" id="whatif">
        <div class="row spread"><h3>What if: your routine for a set number of days</h3><span class="small muted">Starts from your spec under Calculators</span></div>
        <p class="small muted">Set a daily routine and a number of days. The app adds up the fame you earn, turns it into spec levels on each Destiny Board node, lowers your focus cost as you level, and runs your net worth with that rising spec day by day.</p>
        <div class="controls">
          <label class="field"><span>Days</span><input type="number" id="wi-days" min="1" max="365" step="1"></label>
          <label class="field"><span>Refining line</span><select id="wi-res">${ABP.RESOURCES.map((r) => `<option value="${r.key}">${r.refinedName}</option>`).join("")}</select></label>
          <label class="field"><span>Refine tier</span><select id="wi-tier">${[4, 5, 6, 7, 8].map((t) => `<option value="${t}">T${t}</option>`).join("")}</select></label>
          <label class="field"><span>Enchantment</span><select id="wi-ench">${[0, 1, 2, 3].map((e) => `<option value="${e}">.${e}</option>`).join("")}</select></label>
          <label class="field"><span>Focus a day on refining</span><input type="number" id="wi-frefine" min="0" step="100"></label>
          <label class="field"><span>Fame per refine (estimate)</span><input type="number" id="wi-fame-r" min="0" step="any"></label>
          <label class="field"><span>Focus a day on crafting</span><input type="number" id="wi-fcraft" min="0" step="100"></label>
          <label class="field"><span>Crafts a day without focus</span><input type="number" id="wi-crafts" min="0" step="1"></label>
          <label class="field"><span>Fame per craft (estimate)</span><input type="number" id="wi-fame-c" min="0" step="any"></label>
          <label class="field"><span>Plants harvested a day</span><input type="number" id="wi-plants" min="0" step="1"></label>
          <label class="field"><span>Crop you farm</span><select id="wi-crop">${ABP.CROPS.concat(ABP.HERBS).map((c, i) => `<option value="${i}">T${c.tier} ${c.name}</option>`).join("")}</select></label>
          <label class="field"><span>Current level of that farmer node</span><input type="number" id="wi-farmlvl" min="0" max="100" step="1"></label>
        </div>
        <p class="small muted">Fame per refine and per craft are base values before premium; the app adds premium's +50%. The game shows the exact fame for each item in the crafting window, so swap in that number. Plants harvested give 150 fame each with premium. Premium gives 10,000 focus a day.</p>
        <div class="stats" id="wi-stats"></div>
        <div id="wi-table"></div>
        <p class="small muted" id="wi-note"></p>
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
    $("#pl-start").value = plan.silver;
    $("#pl-gold").value = plan.gold || "";
    bindRate(p);
    $("#pl-skill").value = plan.skill;
    $("#pl-date").value = plan.date;
    $("#pl-start").addEventListener("input", (e) => { plan.silver = Math.max(0, +e.target.value || 0); plan.start = toSilver(plan.silver, plan.gold); savePlan(); updatePlan(); goalMeter(); });
    $("#pl-gold").addEventListener("input", (e) => { plan.gold = Math.max(0, +e.target.value || 0); plan.start = toSilver(plan.silver, plan.gold); savePlan(); updatePlan(); goalMeter(); });
    $("#pl-hours").addEventListener("input", (e) => { plan.hours = Math.max(0, +e.target.value || 0); savePlan(); updatePlan(); });
    $("#pl-skill").addEventListener("change", (e) => { plan.skill = +e.target.value; savePlan(); updatePlan(); });
    $("#pl-date").addEventListener("change", (e) => { plan.date = e.target.value || todayISO(); savePlan(); updatePlan(); });
    bindWhatIf();
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
    $("#pl-total").textContent = plan.gold ? `Starting total: ${full(plan.start)} silver (${full(plan.silver)} silver + ${full(plan.gold)} gold × ${full(goldRate.rate)}).` : `Starting total: ${full(plan.start)} silver.`;
    const start = new Date(plan.date + "T12:00:00");
    const perDay = (ABP.GOAL - plan.start) / ABP.DAYS;
    $("#pl-stats").innerHTML = `
      <div class="stat key"><span class="label">Billion reached</span><span class="v">${sim.hit ? dateText(addDays(start, sim.hit)) : "Not this year"}</span><span class="small muted">${sim.hit ? "day " + sim.hit + " of 365" : "add hours or pick another path"}</span></div>
      <div class="stat"><span class="label">Silver after 365 days</span><span class="v money">${fmt(sim.end)}</span></div>
      <div class="stat"><span class="label">Average needed a day</span><span class="v">${fmt(perDay)}</span><span class="small muted">${fmt(perDay * 7)} a week</span></div>
      <div class="stat"><span class="label">Day 30 target</span><span class="v">${fmt(sim.pts[30].y)}</span><span class="small muted">day 90: ${fmt(sim.pts[90].y)}</span></div>`;
    $("#pl-note").textContent = `${prof.name}: ${hours} active hours a day plus daily island and focus income. The projection counts the silver you actually keep per hour after travel, order setup, quiet markets and losses, which runs well below the peak per-hour figures quoted on each method. A strong week can beat it and a bad patch can miss it. ${(() => { const f = focusFactor(); return f.set ? `Your best refining spec (${full(f.eff)} efficiency at T6) makes your daily focus worth ${f.factor >= 1 ? "" : "only "}${f.factor.toFixed(2)}× the baseline, which the projection includes.` : "Enter your refining spec under Calculators → Your spec to adjust focus income to your character."; })()}`;
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
    renderWhatIf();
  }

  /* ---------- What if: spec growth over Y days ---------- */
  const wi = Object.assign({ days: 30, res: null, tier: 6, ench: 0, frefine: 10000, fameR: null, fcraft: 0, crafts: 0, fameC: 1500, plants: 72, crop: 4, farmlvl: 0 }, store.get("whatif", {}));
  if (!wi.res) {
    const best = Object.entries(ABP.spec.refine).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))[0];
    wi.res = best[1].some((v) => v) ? best[0] : "wood";
  }
  const defFameR = (t) => ABP.FAME.perResource[t] * ABP.REFINE_RAW[t];
  function bindWhatIf() {
    const fields = { days: [1, 365], res: null, tier: null, ench: null, frefine: [0, 30000], fameR: [0, 1e7], fcraft: [0, 30000], crafts: [0, 10000], fameC: [0, 1e7], plants: [0, 10000], crop: null, farmlvl: [0, 100] };
    const idOf = (k) => "#wi-" + ({ fameR: "fame-r", fameC: "fame-c" }[k] || k);
    for (const [k, lim] of Object.entries(fields)) {
      const elx = $(idOf(k));
      elx.value = k === "fameR" ? (wi.fameR ?? defFameR(wi.tier)) : wi[k];
      elx.addEventListener("change", () => {
        if (k === "res") wi.res = elx.value;
        else if (k === "fameR") wi.fameR = elx.value === "" ? null : Math.max(lim[0], Math.min(lim[1], +elx.value || 0));
        else if (lim) { wi[k] = Math.max(lim[0], Math.min(lim[1], +elx.value || 0)); elx.value = wi[k]; }
        else wi[k] = +elx.value;
        if (k === "tier" && wi.fameR == null) $("#wi-fame-r").value = defFameR(wi.tier);
        store.set("whatif", wi); renderWhatIf();
      });
    }
  }
  function growSpec() {
    const F = ABP.FAME, SP = ABP.spec, prem = F.premium;
    const line = SP.refine[wi.res].slice();
    const t = wi.tier, ti = t - 4;
    const fameR = (wi.fameR ?? defFameR(t)) * prem, fameC = wi.fameC * prem;
    let rFame = ABP.fameAt(line[ti], F.totals.refineTier);
    let iFame = ABP.fameAt(SP.craft.item, F.totals.craftItem), mFame = ABP.fameAt(SP.craft.mastery, F.totals.craftMastery);
    const crops = ABP.CROPS.concat(ABP.HERBS);
    let cropI = Math.min(wi.crop, crops.length - 1), farmFame = ABP.fameAt(wi.farmlvl, F.totals.farm);
    const start = { refine: line[ti], item: SP.craft.item, mastery: SP.craft.mastery, farm: wi.farmlvl, crop: cropI };
    const effs = [], refines = [], crafts = [];
    const otherBest = Math.max(0, ...Object.entries(SP.refine).filter(([k]) => k !== wi.res).map(([, sp]) => ABP.refineEfficiency(sp, 6)));
    const ffs = [];
    let craftLvl = { item: SP.craft.item, mastery: SP.craft.mastery };
    for (let d = 1; d <= wi.days; d++) {
      const eff = ABP.refineEfficiency(line, t);
      const fc = ABP.focusCost(ABP.REFINE_FOCUS[t][wi.ench], eff);
      const nR = wi.frefine / fc;
      const ce = craftLvl.mastery * 30 + SP.craft.others * 30 + craftLvl.item * 280;
      const cfc = ABP.focusCost(SP.craft.base || 1, ce);
      const nC = wi.fcraft / cfc + wi.crafts;
      refines.push(nR); crafts.push(nC); effs.push(eff);
      rFame += nR * fameR;
      line[ti] = Math.floor(ABP.levelAt(rFame, F.totals.refineTier));
      iFame += nC * fameC; mFame += nC * fameC;
      craftLvl = { item: Math.floor(ABP.levelAt(iFame, F.totals.craftItem)), mastery: Math.floor(ABP.levelAt(mFame, F.totals.craftMastery)) };
      farmFame += wi.plants * F.perHarvest;
      while (farmFame >= F.totals.farm && cropI < crops.length - 1 && (cropI + 1 < ABP.CROPS.length) === (cropI < ABP.CROPS.length)) { farmFame -= F.totals.farm; cropI++; }
      ffs.push(ffFromEff(Math.max(otherBest, ABP.refineEfficiency(line, 6))));
    }
    const endEff = ABP.refineEfficiency(line, t);
    return {
      start, crops, line,
      end: { refine: line[ti], item: craftLvl.item, mastery: craftLvl.mastery, farm: ABP.levelAt(farmFame, F.totals.farm), crop: cropI },
      eff0: effs[0], eff1: endEff,
      fc0: ABP.focusCost(ABP.REFINE_FOCUS[t][wi.ench], effs[0]), fc1: ABP.focusCost(ABP.REFINE_FOCUS[t][wi.ench], endEff),
      refines: refines.reduce((a, x) => a + x, 0), crafts: crafts.reduce((a, x) => a + x, 0),
      ffStart: ffFromEff(Math.max(otherBest, ABP.refineEfficiency(ABP.spec.refine[wi.res], 6))), ffs,
    };
  }
  function renderWhatIf() {
    if (!$("#wi-stats")) return;
    const g = growSpec();
    const prof = profileOf(plan.profile), hours = plan.hours ?? prof.hours;
    const flat = simulate(prof, plan.start, hours, plan.skill, wi.days, () => g.ffStart);
    const grow = simulate(prof, plan.start, hours, plan.skill, wi.days, (d) => g.ffs[d - 1]);
    const gain = grow.end - plan.start;
    const res = ABP.RESOURCES.find((r) => r.key === wi.res);
    const lv = (x) => Math.floor(x);
    const rowsHtml = [
      [`${res.refinedName} T${wi.tier} refiner`, g.start.refine, g.end.refine, `${full(g.refines)} refines; focus per T${wi.tier}.${wi.ench} refine ${g.fc0.toFixed(1)} → ${g.fc1.toFixed(1)}`],
      ["Crafting item spec", g.start.item, g.end.item, `${full(g.crafts)} crafts`],
      ["Crafting family node", g.start.mastery, g.end.mastery, "same craft fame"],
      [`T${g.crops[g.start.crop].tier} ${g.crops[g.start.crop].name} farmer`, g.start.farm, g.end.crop === g.start.crop ? g.end.farm : 100, g.end.crop !== g.start.crop ? `maxed; now leveling T${g.crops[g.end.crop].tier} ${g.crops[g.end.crop].name} (level ${lv(g.end.farm)})` : `${full(wi.plants * wi.days)} plants`],
    ];
    $("#wi-stats").innerHTML = `
      <div class="stat key"><span class="label">Net worth after ${wi.days} days</span><span class="v money">${fmt(grow.end)}</span><span class="small muted">${plan.start > 0 ? `+${pct(gain / plan.start, 0)} from ${fmt(plan.start)}` : `+${fmt(gain)} from zero`}</span></div>
      <div class="stat"><span class="label">Silver gained</span><span class="v">${fmt(gain)}</span><span class="small muted">${fmt(gain / wi.days)} a day on average</span></div>
      <div class="stat"><span class="label">Extra from rising spec</span><span class="v">${fmt(grow.end - flat.end)}</span><span class="small muted">vs keeping today's spec</span></div>
      <div class="stat"><span class="label">Refining efficiency</span><span class="v">${full(g.eff0)} → ${full(g.eff1)}</span><span class="small muted">focus worth ${g.ffStart.toFixed(2)}× → ${g.ffs[g.ffs.length - 1].toFixed(2)}×</span></div>`;
    $("#wi-table").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Node</th><th>Level now</th><th>After ${wi.days} days</th><th>Gain</th><th>From</th></tr></thead><tbody>${rowsHtml.map(([n, a, b, why]) => `<tr><td>${esc(n)}</td><td class="num">${lv(a)}</td><td class="num">${lv(b)}</td><td class="num">+${Math.max(0, lv(b) - lv(a))}</td><td class="small">${esc(why)}</td></tr>`).join("")}</tbody></table></div>`;
    $("#wi-note").textContent = `Net worth uses your ${prof.name} plan at ${hours} active hours a day, with daily focus income scaled by your refining efficiency as it rises. Levels convert fame with the Destiny Board curve: about ${fmt(ABP.FAME.totals.refineTier)} fame takes a refining tier node from 0 to 100, ${fmt(ABP.FAME.totals.craftMastery)} for a crafting family node. Fame figures for items and higher tiers are estimates, so treat levels as a guide and correct the fame inputs from the game.`;
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
      <div id="mk-detail"></div>
      ${alertsBox()}`;
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
    $("#mk-load").addEventListener("click", () => { ABP.api.clearCache(); loadMarket(); });
    setupSearch();
    setupAlerts();
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

  /* Quality odds from Korn's (Sandbox Interactive) forum posts: best of the rolls a quality bonus grants. */
  function qualityTable(bonus) {
    const q = ABP.qualityOdds(bonus), q0 = ABP.qualityOdds(0);
    return `<div class="table-wrap"><table><thead><tr><th>Quality</th><th>At ${esc(String(+bonus))}% bonus</th><th>With no bonus</th></tr></thead><tbody>${ABP.QUALITY.names.map((n, i) => `<tr><td>${n}</td><td class="num">${pct(q[i], 2)}</td><td class="num">${pct(q0[i], 2)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">Odds use the quality table and roll rule posted by Korn of Sandbox Interactive on the <a href="${ABP.QUALITY.source}" target="_blank" rel="noopener">official forum</a>: an X% bonus is an X% chance of a second roll, and the best roll counts. His posts do not say how many bonus points each spec level gives, so enter the quality bonus your crafting window shows.</p>`;
  }

  function renderCalc() {
    const p = $("#panel-calc");
    const rf = Object.assign({ res: "wood", ench: 0, buyCity: "Fort Sterling", refineCity: "Fort Sterling", sellCity: "Fort Sterling", buyMode: "order", sellMode: "order", daily: 0, fee: 0, focus: {} }, store.get("calc.refine", {}));
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Do the math</span>
        <h2>Calculators</h2>
        <p>Every calculator uses premium fees: 4% sales tax and a 2.5% setup fee per order. Live prices fill in automatically and you can overwrite any of them.</p>
      </div>
      <div class="box stack" id="spec-box">
        <div class="row spread"><h3>Your spec</h3><span class="small muted">Saved in this browser. Best picks and your plan use it too.</span></div>
        <p class="small muted">Copy the levels from your Destiny Board. Focus cost halves for every 10,000 focus cost efficiency: each level in a refining line adds 30, and each level in the tier you refine adds 250 more.</p>
        <div class="grid-2">
          <div class="stack" style="grid-column: 1 / -1">
            <h4>Refining</h4>
            <div class="controls">
              <label class="field"><span>Refining line</span><select id="sp-res">${ABP.RESOURCES.map((r) => `<option value="${r.key}">${r.refinedName}</option>`).join("")}</select></label>
              ${[4, 5, 6, 7, 8].map((t) => `<label class="field"><span>T${t} spec</span><input type="number" min="0" max="100" step="1" id="sp-r${t}"></label>`).join("")}
            </div>
            <div id="sp-refine-out" class="small"></div>
          </div>
          <div class="stack">
            <h4>Crafting one item</h4>
            <div class="controls">
              <label class="field"><span>Family node (e.g. Sword Crafter)</span><input type="number" min="0" max="100" step="1" id="sp-cm"></label>
              <label class="field"><span>This item's spec</span><input type="number" min="0" max="100" step="1" id="sp-ci"></label>
              <label class="field"><span>Other item specs in family, added up</span><input type="number" min="0" step="1" id="sp-co"></label>
              <label class="field"><span>Base focus cost (from game)</span><input type="number" min="1" step="any" id="sp-cb"></label>
              <label class="field"><span>Quality bonus % (from game)</span><input type="number" min="0" max="1000" step="any" id="sp-cq"></label>
            </div>
            <div id="sp-craft-out" class="small"></div>
          </div>
          <div class="stack">
            <h4>Farming and gathering</h4>
            <div class="controls">
              <label class="field"><span>Highest crop tier you can plant</span><select id="sp-fc">${[1, 2, 3, 4, 5, 6, 7, 8].map((t) => `<option value="${t}">T${t}</option>`).join("")}</select></label>
              <label class="field"><span>Highest herb tier you can plant</span><select id="sp-fh">${[2, 3, 4, 5, 6, 7, 8].map((t) => `<option value="${t}">T${t}</option>`).join("")}</select></label>
              <label class="field"><span>Gathering spec (your main tier)</span><input type="number" min="0" max="100" step="1" id="sp-g"></label>
            </div>
            <div id="sp-farm-out" class="small"></div>
          </div>
        </div>
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
        <p class="small muted">Focus cost per refine comes from your refining spec above for this resource. If the game shows a different number, your spec entries are off.</p>
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
            <label class="field"><span>Harvest per plant</span><input type="number" id="is-yield" value="9" min="0" step="0.5"></label>
            <label class="field"><span>Seeds returned</span><input type="number" id="is-seedret" value="70" min="0" max="100"></label>
            <label class="field"><span>Sell in</span><select id="is-city">${ABP.CITIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
            <label class="field"><span>Crop price</span><input type="number" id="is-price" min="0"></label>
            <label class="field"><span>Seed price</span><input type="number" id="is-seed" min="0"></label>
          </div>
          <p class="small muted">Harvest per plant defaults to 9, the premium average (3 to 6 per seed, doubled). Seed return is a starting guess. Replace them with what your last harvest gave.</p>
          <div class="out" id="is-out"></div>
        </div>
      </div>`;

    /* Spec */
    const SP = ABP.spec;
    const spRes = $("#sp-res");
    spRes.value = rf.res;
    const fillRefine = () => [4, 5, 6, 7, 8].forEach((t) => ($("#sp-r" + t).value = SP.refine[spRes.value][t - 4]));
    fillRefine();
    $("#sp-cm").value = SP.craft.mastery; $("#sp-ci").value = SP.craft.item; $("#sp-co").value = SP.craft.others; $("#sp-cb").value = SP.craft.base; $("#sp-cq").value = SP.craft.quality || 0;
    $("#sp-fc").value = SP.farm.crop; $("#sp-fh").value = SP.farm.herb; $("#sp-g").value = SP.gather;
    const clamp = (v, max = 100) => Math.max(0, Math.min(max, Math.round(+v || 0)));
    function specOut() {
      const res = ABP.RESOURCES.find((r) => r.key === spRes.value);
      const sp = SP.refine[res.key];
      $("#sp-refine-out").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Tier</th><th>Efficiency</th><th>Focus .0</th><th>.1</th><th>.2</th><th>.3</th><th>.0 refines per 10k</th></tr></thead><tbody>${[4, 5, 6, 7, 8].map((t) => {
        const eff = ABP.refineEfficiency(sp, t);
        const c = ABP.REFINE_FOCUS[t].map((b) => ABP.focusCost(b, eff));
        return `<tr><td>T${t}</td><td class="num">${full(eff)}</td>${c.map((x) => `<td class="num">${x.toFixed(1)}</td>`).join("")}<td class="num">${full(10000 / c[0])}</td></tr>`;
      }).join("")}</tbody></table></div>`;
      const ce = SP.craft.mastery * 30 + SP.craft.others * 30 + SP.craft.item * 280;
      const cf = ABP.focusCost(SP.craft.base || 0, ce);
      $("#sp-craft-out").innerHTML = `Efficiency <strong>${full(ce)}</strong>: each craft costs <strong>${cf.toFixed(1)}</strong> focus instead of ${full(SP.craft.base)}, so 10,000 focus covers <strong>${full(10000 / (cf || 1))}</strong> crafts.${qualityTable(SP.craft.quality || 0)}`;
      $("#sp-farm-out").innerHTML = `Best picks only recommends crops up to T${SP.farm.crop} and herbs up to T${SP.farm.herb}. Your gathering spec adds <strong>+${(SP.gather * 0.5).toFixed(1)}%</strong> yield on top of premium's +50%.`;
    }
    function specChanged() {
      ABP.saveSpec(); specOut();
      rendered.picks = false;
      if (rendered.plan) updatePlan();
      if (rf.res === spRes.value) loadRefine();
    }
    spRes.addEventListener("change", () => { fillRefine(); specOut(); });
    [4, 5, 6, 7, 8].forEach((t) => $("#sp-r" + t).addEventListener("change", (e) => { SP.refine[spRes.value][t - 4] = clamp(e.target.value); e.target.value = SP.refine[spRes.value][t - 4]; specChanged(); }));
    [["sp-cm", "mastery", 100], ["sp-ci", "item", 100], ["sp-co", "others", 10000], ["sp-cb", "base", 1e7]].forEach(([id, k, max]) => $("#" + id).addEventListener("change", (e) => { SP.craft[k] = k === "base" ? Math.max(1, +e.target.value || 1) : clamp(e.target.value, max); specChanged(); }));
    $("#sp-cq").addEventListener("change", (e) => { SP.craft.quality = Math.max(0, Math.min(1000, +e.target.value || 0)); specChanged(); });
    $("#sp-fc").addEventListener("change", (e) => { SP.farm.crop = +e.target.value; specChanged(); });
    $("#sp-fh").addEventListener("change", (e) => { SP.farm.herb = +e.target.value; specChanged(); });
    $("#sp-g").addEventListener("change", (e) => { SP.gather = clamp(e.target.value); specChanged(); });
    specOut();

    /* Refining */
    for (const k of ["res", "ench", "buyCity", "refineCity", "sellCity", "buyMode", "sellMode", "daily", "fee"]) {
      const elx = $("#rf-" + k); elx.value = rf[k];
      elx.addEventListener("change", () => {
        rf[k] = ["ench", "daily", "fee"].includes(k) ? +elx.value : elx.value;
        if (k === "res") { $("#sp-res").value = rf.res; [4, 5, 6, 7, 8].forEach((t) => ($("#sp-r" + t).value = ABP.spec.refine[rf.res][t - 4])); specOut(); const city = ABP.RESOURCES.find((r) => r.key === rf.res).city; rf.refineCity = city; rf.sellCity = city; $("#rf-refineCity").value = city; $("#rf-sellCity").value = city; }
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
        const fc = rf.ench <= 3 ? ABP.focusCost(ABP.REFINE_FOCUS[t][rf.ench], ABP.refineEfficiency(ABP.spec.refine[res.key], t)) : 0;
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
          <td class="num">${r.fc ? r.fc.toFixed(1) : "–"}</td>
          <td class="num">${r.ok && r.spf != null ? r.spf.toFixed(1) : "–"}</td>
          <td class="num money">${r.ok && r.spf != null ? fmt(r.spf * 10000) : "–"}</td>
        </tr>`).join("")}</tbody></table></div>`;
      $$("#rf-out input[data-id]").forEach((inp) => inp.addEventListener("change", () => { manual[inp.dataset.id] = +inp.value || 0; drawRefine(res, rNo, rF); }));

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
  /* ---------- Wealth: banks by location, liquid vs solid, charts ----------
     Liquid = silver on hand, gold at the gold price, silver locked in buy orders.
     Solid = bank contents (the estimated value each bank shows), items on sell orders, and items tracked at market price. */
  const LOCATIONS = ABP.CITIES.concat(["Island", "Guild hall", "Hideout", "Rest area (Roads of Avalon)", "Smuggler's den"]);
  const SERIES = [
    { key: "items", label: "Items in bank", color: "--s1" },
    { key: "sell", label: "On sell orders", color: "--s2" },
    { key: "buy", label: "In buy orders", color: "--s3" },
  ];
  const wealth = Object.assign({ silver: 0, gold: 0, banks: null, city: "Caerleon", mode: "sell", sort: "value", filter: "all", items: [], snaps: [], locSort: "value" }, store.get("wealth", {}));
  if (!wealth.banks) {
    wealth.banks = [{ loc: "Caerleon", items: 0, sell: 0, buy: +wealth.orders || 0 }];
    delete wealth.orders;
  }
  wealth.items.forEach((it) => { if (it.loc == null) it.loc = wealth.banks[0]?.loc || "Caerleon"; });
  const QUAL = ["Normal", "Good", "Outstanding", "Excellent", "Masterpiece"];
  const itemUnit = (it) => (it.price != null ? it.price : it.live || 0);
  function byLocation() {
    const map = new Map();
    const get = (loc) => { if (!map.has(loc)) map.set(loc, { loc, items: 0, sell: 0, buy: 0, tracked: 0 }); return map.get(loc); };
    wealth.banks.forEach((b) => { const r = get(b.loc); r.items += +b.items || 0; r.sell += +b.sell || 0; r.buy += +b.buy || 0; });
    wealth.items.forEach((it) => { get(it.loc).tracked += itemUnit(it) * it.qty; });
    return [...map.values()].map((r) => Object.assign(r, { total: r.items + r.sell + r.buy + r.tracked }));
  }
  function wealthTotals() {
    const locs = byLocation();
    const sum = (k) => locs.reduce((a, r) => a + r[k], 0);
    const goldS = wealth.gold * goldRate.rate;
    const liquid = wealth.silver + goldS + sum("buy");
    const solid = sum("items") + sum("sell") + sum("tracked");
    return { locs, liquid, solid, total: liquid + solid, goldS, buy: sum("buy"), bank: sum("items"), sell: sum("sell"), tracked: sum("tracked") };
  }
  /* One snapshot per day, updated as the numbers change, so the history chart fills itself in. */
  function saveWealth() {
    const t = wealthTotals();
    const d = todayISO();
    const snap = { date: d, liquid: Math.round(t.liquid), solid: Math.round(t.solid) };
    const i = wealth.snaps.findIndex((x) => x.date === d);
    if (t.total > 0) { if (i >= 0) wealth.snaps[i] = snap; else wealth.snaps.push(snap); }
    wealth.snaps.sort((a, b) => a.date.localeCompare(b.date));
    store.set("wealth", wealth);
  }

  function renderWealth() {
    const p = $("#panel-wealth");
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Your vault</span>
        <h2>Wealth</h2>
        <p>Enter what each bank holds, location by location. The game shows an estimated value at the top of every bank; copy that number in, plus what you have on the market there. Liquid wealth is silver you can spend now; solid wealth is everything you would have to sell first.</p>
      </div>
      <div class="box stack">
        <div class="stats" id="wv-stats"></div>
        <div class="stack" style="gap:6px">
          <div class="row spread"><span class="small">Liquid share of your wealth</span><span class="small" id="wv-liq-pct"></span></div>
          <div class="meter" role="img" id="wv-meter"><div></div></div>
        </div>
      </div>
      <div class="box stack">
        <div class="row spread"><h3>Wealth by location</h3>
          <label class="field" style="max-width:220px"><span>Order</span><select id="wv-locsort"><option value="value">Largest first</option><option value="name">By name</option></select></label></div>
        <div class="legend" id="wv-legend"></div>
        <div class="hbars" id="wv-bars"></div>
      </div>
      <div class="box stack">
        <div class="row spread"><h3>Your banks</h3><button class="btn ghost" type="button" id="wv-add">Add a location</button></div>
        <p class="small muted">Silver is shared across all banks in Albion, so it goes in once below. Each row here is one location. Buy orders count as liquid because you can cancel them for silver.</p>
        <div id="wv-banks"></div>
        <div class="controls">
          <label class="field"><span>Silver (shown in any bank)</span><input type="number" id="wv-silver" min="0" step="any"></label>
          <label class="field"><span>Gold</span><input type="number" id="wv-gold" min="0" step="any"></label>
          <label class="field"><span>Gold price (silver per gold)</span><input type="number" class="gold-rate" id="wv-rate" min="1" step="any"></label>
        </div>
        <p class="small muted"><span class="rate-note"></span></p>
        <div class="row"><button class="btn ghost" type="button" id="wl-to-log">Copy into today's Progress entry</button><button class="btn ghost" type="button" id="wl-to-plan">Use as plan starting wealth</button></div>
        <p class="small muted" id="wv-msg"></p>
      </div>
      <div class="box stack">
        <div class="row spread"><h3>Net worth over time</h3><span class="small muted">Saved once a day as you update this page</span></div>
        <canvas class="chart" id="wv-chart" aria-label="Net worth over time"></canvas>
        <div id="wv-history"></div>
      </div>
      <details class="box" id="wealth">
        <summary>Price individual items at market value</summary>
        <div class="stack">
          <p class="small muted">Use this for items you want valued at today's market price instead of the bank's estimate, such as a stack you plan to sell. List only items you left out of the bank values above, or they count twice.</p>
          <div class="controls">
            <label class="field"><span>Value items in</span><select id="wl-city">${ABP.CITIES.concat(ABP.BM).map((c) => `<option>${c}</option>`).join("")}</select></label>
            <label class="field"><span>Value items at</span><select id="wl-mode"><option value="sell">Cheapest sell listing</option><option value="buy">Best buy order (sell now)</option></select></label>
            <label class="field"><span>Sort by</span><select id="wl-sort"><option value="value">Total value, high to low</option><option value="unit">Value per item, high to low</option><option value="loc">Location</option><option value="name">Name</option></select></label>
            <div class="search" id="wl-search-wrap" style="grid-column: span 2">
              <label class="field"><span>Add an item</span><input type="search" id="wl-search" placeholder="Type an item name, for example Elder's Bag" autocomplete="off"></label>
              <div class="results" id="wl-results" hidden></div>
            </div>
          </div>
          <div id="wl-table"></div>
          <div class="row"><button class="btn ghost" type="button" id="wl-refresh">Refresh prices</button><span class="small muted" id="wl-msg"></span></div>
        </div>
      </details>`;
    bindRate(p);
    const num = (id, k) => { const x = $(id); x.value = wealth[k] || ""; x.addEventListener("input", () => { wealth[k] = Math.max(0, +x.value || 0); saveWealth(); drawWealth(); }); };
    num("#wv-silver", "silver"); num("#wv-gold", "gold");
    $("#wv-locsort").value = wealth.locSort;
    $("#wv-locsort").addEventListener("change", (e) => { wealth.locSort = e.target.value; saveWealth(); drawWealth(); });
    $("#wv-add").addEventListener("click", () => {
      const used = new Set(wealth.banks.map((b) => b.loc));
      wealth.banks.push({ loc: LOCATIONS.find((l) => !used.has(l)) || "Other", items: 0, sell: 0, buy: 0 });
      saveWealth(); drawBanks(); drawWealth();
      $$("#wv-banks [data-k='items']").pop()?.focus();
    });
    for (const k of ["city", "mode", "sort"]) {
      const x = $("#wl-" + k); x.value = wealth[k];
      x.addEventListener("change", () => { wealth[k] = x.value; saveWealth(); k === "sort" ? drawItems() : priceWealth(); });
    }
    $("#wl-refresh").addEventListener("click", () => { ABP.api.clearCache(); priceWealth(); });
    const merged = () => { const t = wealthTotals(); return { coin: t.total - t.goldS, gold: wealth.gold, t }; };
    $("#wl-to-log").addEventListener("click", () => {
      const m = merged();
      store.set("wealth.pending", { silver: Math.round(m.coin), gold: m.gold, note: `liquid ${fmt(m.t.liquid)}, solid ${fmt(m.t.solid)}` });
      history.replaceState(null, "", "#progress"); show("progress");
    });
    $("#wl-to-plan").addEventListener("click", () => {
      const m = merged();
      plan.silver = Math.round(m.coin); plan.gold = m.gold; plan.start = toSilver(plan.silver, plan.gold); savePlan();
      rendered.plan = false; goalMeter();
      $("#wv-msg").textContent = `Your plan now starts from ${full(plan.start)} silver.`;
    });
    setupItemSearch();
    drawBanks();
    priceWealth();
    window.addEventListener("resize", () => { if (!$("#panel-wealth").hidden) drawHistory(); });
  }

  function drawBanks() {
    const opts = (cur) => [...new Set(LOCATIONS.concat(wealth.banks.map((b) => b.loc)))].map((l) => `<option ${l === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
    $("#wv-banks").innerHTML = `<datalist id="wv-locs">${LOCATIONS.map((l) => `<option value="${esc(l)}">`).join("")}</datalist>
      <div class="stack">${wealth.banks.map((b, i) => `
        <div class="controls bank-row">
          <label class="field"><span>Location</span><input type="text" list="wv-locs" data-i="${i}" data-k="loc" value="${esc(b.loc)}"></label>
          ${[["items", "Bank value (items)"], ["sell", "Items on sell orders"], ["buy", "Silver in buy orders"]].map(([k, l]) => `<label class="field"><span>${l}</span><input type="number" min="0" step="any" data-i="${i}" data-k="${k}" value="${b[k] || ""}" placeholder="0"></label>`).join("")}
          <div class="field"><span>&nbsp;</span><button class="btn ghost" type="button" data-rm="${i}" aria-label="Remove ${esc(b.loc)}">Remove</button></div>
        </div>`).join("")}</div>`;
    $$("#wv-banks input[data-k]").forEach((x) => x.addEventListener(x.dataset.k === "loc" ? "change" : "input", () => {
      const b = wealth.banks[+x.dataset.i];
      if (x.dataset.k === "loc") { const old = b.loc; b.loc = x.value.trim() || old; wealth.items.forEach((it) => { if (it.loc === old) it.loc = b.loc; }); }
      else b[x.dataset.k] = Math.max(0, +x.value || 0);
      saveWealth(); drawWealth();
    }));
    $$("#wv-banks [data-rm]").forEach((x) => x.addEventListener("click", () => { wealth.banks.splice(+x.dataset.rm, 1); saveWealth(); drawBanks(); drawWealth(); }));
  }

  function drawWealth() {
    const t = wealthTotals();
    const prev = wealth.snaps.filter((s) => s.date < todayISO()).pop();
    const change = prev ? t.total - (prev.liquid + prev.solid) : null;
    $("#wv-stats").innerHTML = `
      <div class="stat key"><span class="label">Net worth</span><span class="v money">${fmt(t.total)}</span><span class="small muted">${full(t.total)} silver</span></div>
      <div class="stat"><span class="label">Liquid</span><span class="v">${fmt(t.liquid)}</span><span class="small muted">silver ${fmt(wealth.silver)} · gold ${fmt(t.goldS)} · buy orders ${fmt(t.buy)}</span></div>
      <div class="stat"><span class="label">Solid</span><span class="v">${fmt(t.solid)}</span><span class="small muted">banks ${fmt(t.bank)} · sell orders ${fmt(t.sell)}${t.tracked ? " · priced items " + fmt(t.tracked) : ""}</span></div>
      <div class="stat"><span class="label">Since last snapshot</span><span class="v ${change == null ? "" : change >= 0 ? "good" : "bad"}">${change == null ? "–" : (change >= 0 ? "+" : "") + fmt(change)}</span><span class="small muted">${prev ? "vs " + dateText(new Date(prev.date + "T12:00:00")) : "comes in from tomorrow"}</span></div>`;
    const lp = t.total ? t.liquid / t.total : 0;
    $("#wv-liq-pct").textContent = t.total ? `${pct(lp, 0)} liquid · ${pct(1 - lp, 0)} solid` : "";
    $("#wv-meter > div").style.width = (lp * 100).toFixed(1) + "%";
    $("#wv-meter").setAttribute("aria-label", `${pct(lp, 0)} of your wealth is liquid`);

    /* Location bars: bank items and priced items share slot 1 (both are goods sitting in that bank). */
    const locs = t.locs.filter((r) => r.total > 0).sort(wealth.locSort === "name" ? (a, b) => a.loc.localeCompare(b.loc) : (a, b) => b.total - a.total);
    const max = Math.max(1, ...locs.map((r) => r.total));
    const val = (r, k) => (k === "items" ? r.items + r.tracked : r[k]);
    $("#wv-legend").innerHTML = SERIES.map((s) => `<span><i style="background:var(${s.color})"></i>${s.label}</span>`).join("");
    $("#wv-bars").innerHTML = locs.length ? locs.map((r, i) => `
      <div class="hbar" tabindex="0" data-i="${i}" aria-label="${esc(r.loc)}: ${full(r.total)} silver. ${SERIES.map((s) => `${s.label} ${full(val(r, s.key))}`).join(", ")}">
        <span class="name">${esc(r.loc)}</span>
        <span class="track" style="width:${((r.total / max) * 100).toFixed(2)}%">${SERIES.filter((s) => val(r, s.key) > 0).map((s) => `<span class="seg" style="flex:${val(r, s.key)} 1 0;background:var(${s.color})"></span>`).join("")}</span>
        <span class="val">${fmt(r.total)}</span>
      </div>`).join("") + `<div class="tip" id="wv-tip" hidden></div>` : `<p class="small muted">Add your banks below and the chart fills in.</p>`;
    const tip = $("#wv-tip");
    $$("#wv-bars .hbar").forEach((row) => {
      const r = locs[+row.dataset.i];
      const showTip = () => {
        tip.innerHTML = `<strong>${esc(r.loc)}</strong>${SERIES.map((s) => `<div class="r"><span><i style="background:var(${s.color})"></i>${s.label}</span><span>${full(val(r, s.key))}</span></div>`).join("")}<div class="r"><span>Total</span><strong>${full(r.total)}</strong></div><div class="r muted"><span>Share of net worth</span><span>${pct(r.total / (t.total || 1), 1)}</span></div>`;
        tip.hidden = false;
        const box = $("#wv-bars").getBoundingClientRect(), rb = row.getBoundingClientRect();
        tip.style.top = (rb.bottom - box.top + 6) + "px";
        tip.style.left = Math.max(0, Math.min(box.width - tip.offsetWidth, rb.left - box.left + 40)) + "px";
      };
      row.addEventListener("mouseenter", showTip); row.addEventListener("focus", showTip);
      row.addEventListener("mouseleave", () => (tip.hidden = true)); row.addEventListener("blur", () => (tip.hidden = true));
    });
    drawHistory();
    drawItems();
  }

  function drawHistory() {
    const snaps = wealth.snaps;
    const c = $("#wv-chart");
    if (!c) return;
    c.hidden = snaps.length < 2;
    if (snaps.length >= 2) {
      const d0 = new Date(snaps[0].date + "T12:00:00");
      const pts = snaps.map((s) => ({ x: Math.round((new Date(s.date + "T12:00:00") - d0) / 864e5), y: s.liquid + s.solid }));
      const span = pts[pts.length - 1].x || 1;
      const labels = [0, Math.round(span / 2), span].map((x) => ({ x, text: addDays(d0, x).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }));
      lineChart(c, [{ data: pts, color: css("--accent"), fill: true, dots: pts.length <= 40 }], { xLabels: labels });
    }
    const rows = snaps.slice(-10).reverse();
    $("#wv-history").innerHTML = snaps.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Liquid</th><th>Solid</th><th>Net worth</th><th>Change</th></tr></thead><tbody>${rows.map((s) => {
      const i = snaps.indexOf(s), before = snaps[i - 1];
      const tot = s.liquid + s.solid, ch = before ? tot - before.liquid - before.solid : null;
      return `<tr><td>${dateText(new Date(s.date + "T12:00:00"))}</td><td class="num">${full(s.liquid)}</td><td class="num">${full(s.solid)}</td><td class="num money">${full(tot)}</td><td class="num ${ch == null ? "" : ch >= 0 ? "good" : "bad"}">${ch == null ? "–" : (ch >= 0 ? "+" : "") + full(ch)}</td></tr>`;
    }).join("")}</tbody></table></div>${snaps.length < 2 ? `<p class="small muted">The chart appears once you have two days of entries.</p>` : ""}` : `<p class="small muted">Nothing saved yet. Your first entry today starts the history.</p>`;
  }

  /* Redrawing removes a focused input, which fires its change event mid-redraw; queue that instead. */
  let wlDrawing = false, wlAgain = false;
  function drawItems() {
    if (wlDrawing) { wlAgain = true; return; }
    wlDrawing = true;
    try { drawItemsNow(); } finally { wlDrawing = false; }
    if (wlAgain) { wlAgain = false; setTimeout(drawWealth); }
  }
  function drawItemsNow() {
    const total = wealthTotals().total || 1;
    const rows = wealth.items.map((it, i) => ({ it, i, name: itemLabel(it.id), unit: itemUnit(it), total: itemUnit(it) * it.qty }));
    rows.sort({ value: (a, b) => b.total - a.total, unit: (a, b) => b.unit - a.unit, loc: (a, b) => a.it.loc.localeCompare(b.it.loc) || b.total - a.total, name: (a, b) => a.name.localeCompare(b.name) }[wealth.sort] || ((a, b) => b.total - a.total));
    const locOpts = (cur) => [...new Set(wealth.banks.map((b) => b.loc).concat(cur))].map((l) => `<option ${l === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
    $("#wl-table").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Location</th><th>Quality</th><th>Qty</th><th>Each</th><th>Total</th><th>Share</th><th></th></tr></thead><tbody>${rows.map((r) => `
      <tr><td>${esc(r.name)}<br><small class="muted">${esc(r.it.id)}</small></td>
        <td><select data-loc="${r.i}" aria-label="Location">${locOpts(r.it.loc)}</select></td>
        <td><select data-q="${r.i}" aria-label="Quality">${QUAL.map((q, k) => `<option value="${k + 1}" ${r.it.quality === k + 1 ? "selected" : ""}>${q}</option>`).join("")}</select></td>
        <td><input type="number" class="num" data-qty="${r.i}" value="${r.it.qty}" min="0" step="1" style="width:80px" aria-label="Quantity"></td>
        <td><input type="number" class="num" data-price="${r.i}" value="${r.unit ? Math.round(r.unit) : ""}" placeholder="no price" min="0" step="any" style="width:100px" aria-label="Value each"><br><small class="muted">${r.it.price != null ? `your price${r.it.live ? " · market " + full(r.it.live) : ""}` : r.it.live ? "market" : "no market price"}</small></td>
        <td class="num money">${full(r.total)}</td><td class="num">${pct(r.total / total, 1)}</td>
        <td><button class="btn ghost" type="button" data-del="${r.i}" aria-label="Remove">Remove</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted">No items priced yet.</p>`;
    const upd = () => { saveWealth(); drawWealth(); };
    $$("#wl-table [data-qty]").forEach((x) => x.addEventListener("change", () => { wealth.items[+x.dataset.qty].qty = Math.max(0, +x.value || 0); upd(); }));
    $$("#wl-table [data-price]").forEach((x) => x.addEventListener("change", () => { const it = wealth.items[+x.dataset.price]; it.price = x.value === "" ? null : Math.max(0, +x.value || 0); upd(); }));
    $$("#wl-table [data-loc]").forEach((x) => x.addEventListener("change", () => { wealth.items[+x.dataset.loc].loc = x.value; upd(); }));
    $$("#wl-table [data-q]").forEach((x) => x.addEventListener("change", () => { wealth.items[+x.dataset.q].quality = +x.value; saveWealth(); priceWealth(); }));
    $$("#wl-table [data-del]").forEach((x) => x.addEventListener("click", () => { wealth.items.splice(+x.dataset.del, 1); upd(); }));
  }
  async function priceWealth() {
    drawWealth();
    if (!wealth.items.length) return;
    const ids = [...new Set(wealth.items.map((it) => it.id))];
    try {
      const rows = await ABP.api.prices(ids, [wealth.city], [1, 2, 3, 4, 5]);
      for (const it of wealth.items) {
        const r = rows.find((x) => x.id === it.id && x.city === wealth.city && x.quality === (it.quality || 1));
        it.live = r ? (wealth.mode === "buy" ? r.buy : r.sell) || null : null;
      }
      $("#wl-msg").textContent = `Market values: ${wealth.mode === "buy" ? "best buy order" : "cheapest sell listing"} in ${wealth.city}, before the 4% tax and setup fee.`;
      saveWealth();
    } catch (e) {
      $("#wl-msg").textContent = e.message + " Type a value for each item meanwhile.";
    }
    drawWealth();
  }
  function setupItemSearch() {
    const input = $("#wl-search"), box = $("#wl-results");
    let list = null;
    input.addEventListener("focus", async () => {
      if (list) return;
      input.placeholder = "Loading item names…";
      try { list = await ABP.api.itemNames(); input.placeholder = "Type an item name, for example Elder's Bag"; }
      catch (e) { input.placeholder = "Item names could not load here. Type an item id such as T6_BAG and press Enter."; list = []; }
    });
    const add = (id) => {
      const loc = wealth.banks[0]?.loc || "Caerleon";
      const have = wealth.items.find((it) => it.id === id && (it.quality || 1) === 1 && it.loc === loc);
      if (have) have.qty += 1; else wealth.items.push({ id, qty: 1, quality: 1, price: null, live: null, loc });
      saveWealth(); input.value = ""; box.hidden = true; priceWealth();
    };
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2 || !list) { box.hidden = true; return; }
      const hits = list.filter((n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).slice(0, 30);
      box.innerHTML = hits.map((h) => `<button type="button" data-id="${esc(h.id)}"><span>${esc(h.name)}</span><small>${esc(h.id)}</small></button>`).join("") || `<p class="small muted" style="padding:8px">No items match.</p>`;
      box.hidden = false;
      $$("button", box).forEach((b) => b.addEventListener("click", () => add(b.dataset.id)));
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && /^T\d_[A-Z0-9_@]+$/i.test(input.value.trim())) add(input.value.trim().toUpperCase());
      if (e.key === "Escape") box.hidden = true;
    });
    document.addEventListener("click", (e) => { if (!$("#wl-search-wrap")?.contains(e.target)) box.hidden = true; });
  }

  /* ---------- Character lookup (Albion game info API) ---------- */
  const charState = Object.assign({ name: "", server: null, id: null, snaps: [] }, store.get("char", {}));
  function fameOf(p) {
    const L = p.LifetimeStatistics || {};
    const g = L.Gathering || {};
    return {
      t: Date.now(), kill: p.KillFame || 0, death: p.DeathFame || 0, pve: L.PvE?.Total || 0,
      gather: g.All?.Total || 0, fiber: g.Fiber?.Total || 0, hide: g.Hide?.Total || 0, ore: g.Ore?.Total || 0, rock: g.Rock?.Total || 0, wood: g.Wood?.Total || 0,
      craft: L.Crafting?.Total || 0, farm: L.FarmingFame || 0, fish: L.FishingFame || 0, crystal: L.CrystalLeague || 0,
    };
  }
  function showPlayer(p) {
    const now = fameOf(p);
    const same = charState.id === p.Id;
    const prev = same ? charState.snaps[charState.snaps.length - 1] : null;
    charState.snaps = same ? charState.snaps.concat(now).slice(-60) : [now];
    Object.assign(charState, { id: p.Id, name: p.Name });
    store.set("char", charState);
    const rows = [["Crafting", "craft"], ["Farming", "farm"], ["Gathering, all", "gather"], ["Fiber", "fiber"], ["Hide", "hide"], ["Ore", "ore"], ["Stone", "rock"], ["Wood", "wood"], ["Fishing", "fish"], ["PvE", "pve"], ["Kill fame", "kill"], ["Death fame", "death"], ["Crystal League", "crystal"]];
    const since = prev ? new Date(prev.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
    $("#ch-out").innerHTML = `
      <div class="stats">
        <div class="stat key"><span class="label">Character</span><span class="v">${esc(p.Name)}</span><span class="small muted">${p.GuildName ? esc(p.GuildName) : "No guild"}${p.AllianceName ? " · " + esc(p.AllianceName) : ""}</span></div>
        <div class="stat"><span class="label">Crafting fame</span><span class="v">${fmt(now.craft)}</span>${prev ? `<span class="small muted">+${fmt(now.craft - prev.craft)} since ${since}</span>` : ""}</div>
        <div class="stat"><span class="label">Farming fame</span><span class="v">${fmt(now.farm)}</span>${prev ? `<span class="small muted">+${fmt(now.farm - prev.farm)} since ${since}</span>` : ""}</div>
        <div class="stat"><span class="label">Gathering fame</span><span class="v">${fmt(now.gather)}</span>${prev ? `<span class="small muted">+${fmt(now.gather - prev.gather)} since ${since}</span>` : ""}</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Lifetime fame</th><th>Total</th><th>${prev ? "Since " + esc(since) : "Change"}</th></tr></thead><tbody>${rows.map(([n, k]) => `<tr><td>${n}</td><td class="num">${full(now[k])}</td><td class="num">${prev ? (now[k] - prev[k] ? "+" + full(now[k] - prev[k]) : "0") : "–"}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">${prev ? "" : "Look up again later to see what you earned in between. "}Crafting fame includes refining. The game info server can lag the game by a few hours.</p>`;
  }
  function chooseFrom(players) {
    if (!players.length) { $("#ch-out").innerHTML = `<p class="small">No character by that name on this server. Check the spelling and the server.</p>`; return; }
    const exact = players.find((x) => x.Name.toLowerCase() === $("#ch-name").value.trim().toLowerCase());
    if (exact || players.length === 1) return loadPlayer((exact || players[0]).Id);
    $("#ch-out").innerHTML = `<p class="small">Several characters match. Pick yours:</p><div class="chips">${players.slice(0, 12).map((x) => `<button type="button" class="chip" data-pid="${esc(x.Id)}">${esc(x.Name)}${x.GuildName ? " · " + esc(x.GuildName) : ""}</button>`).join("")}</div>`;
    $$("#ch-out [data-pid]").forEach((b) => b.addEventListener("click", () => loadPlayer(b.dataset.pid)));
  }
  function charFallback(e) {
    $("#ch-out").innerHTML = `<div class="notice stack"><p class="small">${esc(e.message)} You can still load it by hand: open <a href="${esc(e.url)}" target="_blank" rel="noopener">this link</a>, copy everything it shows, and paste it here.</p>
      <textarea id="ch-paste" aria-label="Pasted character data"></textarea><div class="row"><button class="btn ghost" type="button" id="ch-paste-go">Read pasted data</button></div></div>`;
    $("#ch-paste-go").addEventListener("click", () => {
      let j; try { j = JSON.parse($("#ch-paste").value); } catch (x) { return alert("That text is not the data from the link. Copy the whole page and try again."); }
      if (Array.isArray(j.players)) chooseFrom(j.players); else if (j.Id && j.Name) showPlayer(j); else alert("That data has no character in it.");
    });
  }
  async function loadPlayer(id) {
    $("#ch-out").innerHTML = `<p class="small muted">Loading character…</p>`;
    try { showPlayer(await ABP.api.character.player(id)); } catch (e) { charFallback(e); }
  }
  function setupCharacter() {
    $("#ch-name").value = charState.name || "";
    $("#ch-server").value = charState.server || ABP.api.server;
    $("#ch-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#ch-name").value.trim(); if (!name) return;
      const srv = $("#ch-server").value;
      if (srv !== ABP.api.server) ABP.api.server = srv;
      charState.server = srv; charState.name = name; store.set("char", charState);
      $("#ch-out").innerHTML = `<p class="small muted">Searching…</p>`;
      try { chooseFrom(await ABP.api.character.search(name)); } catch (err) { charFallback(err); }
    });
  }

  function renderProgress() {
    const p = $("#panel-progress");
    if (!p.dataset.ready) {
      p.dataset.ready = "1";
      p.innerHTML = `
        <div class="panel-head">
          <span class="label">Ledger</span>
          <h2>Progress</h2>
          <p>Log your wealth once a day or once a week: silver in the bank, in orders and in stock, plus any gold. Gold is converted to silver at the gold price. The chart compares you with the plan you picked. Your log stays in this browser.</p>
        </div>
        ${ledgerBox()}
        <div class="box stack" id="char">
          <div class="row spread"><h3>Your character</h3><span class="small muted">From Albion's official game info server</span></div>
          <p class="small muted">Look up a character to see their guild and lifetime fame. Each lookup is saved, so the next one shows how much crafting, gathering and farming fame you earned in between. The game does not share bank contents or spec levels, so enter those yourself.</p>
          <form class="controls" id="ch-form">
            <label class="field"><span>Character name</span><input type="text" id="ch-name" autocomplete="off" required></label>
            <label class="field"><span>Server</span><select id="ch-server">${ABP.SERVERS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select></label>
            <button class="btn" type="submit">Look up</button>
          </form>
          <div id="ch-out"></div>
        </div>
        <div class="box stack">
          <form class="controls" id="lg-form">
            <label class="field"><span>Date</span><input type="date" id="lg-date" required></label>
            <label class="field"><span>Silver (bank, orders, stock)</span><input type="number" id="lg-silver" min="0" step="any" placeholder="e.g. 25000000"></label>
            <label class="field"><span>Gold</span><input type="number" id="lg-gold" min="0" step="any" placeholder="optional"></label>
            <label class="field"><span>Gold price (silver per gold)</span><input type="number" class="gold-rate" id="lg-rate" min="1" step="any"></label>
            <label class="field"><span>Note</span><input type="text" id="lg-note" placeholder="optional"></label>
            <button class="btn" type="submit">Add entry</button>
          </form>
          <p class="small muted"><span id="lg-total"></span> <span class="rate-note"></span></p>
          <div class="stats" id="lg-stats"></div>
          <canvas class="chart" id="lg-chart" aria-label="Your silver compared with the plan"></canvas>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Silver</th><th>Change</th><th>Plan for that day</th><th>Note</th><th></th></tr></thead><tbody id="lg-rows"></tbody></table></div>
        <details class="box"><summary>Back up or restore your log</summary>
          <div class="stack"><textarea id="lg-json" aria-label="Log data"></textarea>
          <div class="row"><button class="btn ghost" id="lg-copy" type="button">Copy log</button><button class="btn ghost" id="lg-restore" type="button">Restore from text</button><span class="small muted" id="lg-msg"></span></div></div>
        </details>`;
      $("#lg-date").value = todayISO();
      bindRate(p);
      $("#lg-silver").addEventListener("input", lgTotal);
      $("#lg-gold").addEventListener("input", lgTotal);
      lgTotal();
      setupCharacter();
      setupLedger();
      $("#lg-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const date = $("#lg-date").value, coin = +$("#lg-silver").value || 0, gold = +$("#lg-gold").value || 0;
        if (!date || (!coin && !gold)) { $("#lg-total").textContent = "Enter your silver, your gold, or both."; return; }
        const entry = { date, silver: toSilver(coin, gold), note: $("#lg-note").value.trim() };
        if (gold) Object.assign(entry, { coin, gold, rate: goldRate.rate });
        log = log.filter((x) => x.date !== date).concat(entry).sort((a, b) => a.date.localeCompare(b.date));
        store.set("log", log); $("#lg-silver").value = ""; $("#lg-gold").value = ""; $("#lg-note").value = ""; lgTotal();
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
    const pend = store.get("wealth.pending", null);
    if (pend) {
      store.set("wealth.pending", null);
      $("#lg-date").value = todayISO(); $("#lg-silver").value = pend.silver; $("#lg-gold").value = pend.gold || ""; $("#lg-note").value = pend.note || "";
      lgTotal(); setTimeout(() => $("#lg-form").scrollIntoView({ block: "center" }));
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
      return `<tr><td>${esc(x.date)}</td><td class="num money">${full(x.silver)}${x.gold ? `<br><small class="muted">incl. ${full(x.gold)} gold at ${full(x.rate)}</small>` : ""}</td><td class="num ${ch > 0 ? "good" : ch < 0 ? "bad" : ""}">${ch == null ? "–" : (ch > 0 ? "+" : "") + fmt(ch)}</td><td class="num">${fmt(planAt(x.date))}</td><td style="text-align:left">${esc(x.note || "")}</td><td><button class="btn ghost small" data-del="${esc(x.date)}" aria-label="Delete entry">Delete</button></td></tr>`;
    }).join("") : `<tr><td colspan="6" class="muted">Your entries will appear here.</td></tr>`;
    $$("#lg-rows [data-del]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); log = log.filter((x) => x.date !== b.dataset.del); store.set("log", log); renderProgress(); goalMeter(); }));
    const actual = log.map((x) => ({ x: Math.max(0, dayOf(x.date)), y: x.silver }));
    lineChart($("#lg-chart"), [
      { data: sim.pts, color: css("--muted"), dash: [3, 4], width: 1.5 },
      { data: actual, color: css("--gold"), dots: true, width: 2.5 },
    ], { goal: ABP.GOAL, xLabels: monthLabels(start) });
  }

  function lgTotal() {
    const el = $("#lg-total"); if (!el) return;
    const coin = +$("#lg-silver").value || 0, gold = +$("#lg-gold").value || 0;
    el.textContent = gold ? `This entry: ${full(toSilver(coin, gold))} silver (${full(gold)} gold = ${full(gold * goldRate.rate)} silver).` : "";
  }

  function goalMeter() {
    const last = log[log.length - 1];
    const v = last ? last.silver : plan.start;
    const share = Math.min(1, v / ABP.GOAL);
    $("#goalMeter").innerHTML = `
      <div class="goal-row"><span class="money">${fmt(v)}</span><span class="muted">${pct(share)} of 1,000,000,000</span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${(share * 100).toFixed(1)}"><div class="fill" style="width:${(share * 100).toFixed(2)}%"></div></div>`;
  }



  /* ---------- Best time of day for a trade: same test as Times → Best hours, run on each leg of a strategy ---------- */
  async function timeLegs(legs) {
    return Promise.all(legs.map(async (l) => {
      try { return { ...l, eff: hourEffect(await ABP.api.hourly(l.id, l.city)) }; }
      catch (e) { return { ...l, err: e.message }; }
    }));
  }
  function legVerdict(l) {
    const e = l.eff, d = (m) => ((m - 1) * 100).toFixed(1) + "%";
    if (l.err) return { ok: false, text: `hourly sales didn't load (${l.err})` };
    if (!e || e.days < 3) return { ok: false, text: `not enough hourly sales in ${l.city} to tell` };
    if (l.role === "sell" && e.highSig) return { ok: true, h: e.high.h, text: `around ${hourLabel(e.high.h)} (${d(e.high.mean)} vs the day's average, higher on ${Math.round(e.high.aboveShare * 100)}% of ${e.days} days)` };
    if (l.role === "buy" && e.lowSig) return { ok: true, h: e.low.h, text: `around ${hourLabel(e.low.h)} (${d(e.low.mean)} vs the day's average, lower on ${Math.round((1 - e.low.aboveShare) * 100)}% of ${e.days} days)` };
    return { ok: false, text: `any time: over ${e.days} days no hour beats normal noise` };
  }
  function busiestHours(legs) {
    const sell = legs.find((l) => l.role === "sell" && l.eff?.totalVol);
    if (!sell) return "";
    const avg = sell.eff.totalVol / 24;
    const top = sell.eff.stats.filter((s) => s.vol >= avg * 1.5).sort((a, b) => b.vol - a.vol).slice(0, 3).sort((a, b) => a.h - b.h);
    return top.length ? `Most sales in ${sell.city} happen around ${top.map((s) => hourLabel(s.h)).join(", ")}, so have sell orders up before then.` : "";
  }
  function timeHtml(legs) {
    const lines = legs.map((l) => { const v = legVerdict(l); return `<li><strong>${l.role === "sell" ? "Sell" : "Buy"} ${esc(l.what)}:</strong> ${v.ok ? "" : '<span class="muted">'}${esc(v.text)}${v.ok ? "" : "</span>"}</li>`; });
    const busy = busiestHours(legs);
    return `<span class="label">Best time (Vancouver)</span><ul class="why">${lines.join("")}</ul>${busy ? `<p class="muted">${esc(busy)}</p>` : ""}`;
  }

  /* ---------- Best picks ---------- */
  const assume = Object.assign({ plots: 8, perPlant: 9, seedReturn: 70 }, store.get("assume", {}));
  const PICKS = [
    { key: "crops", title: "Island: what to plant", how: "Ranked by profit per day across all your plots after seed costs, using the best city to sell in. A crop only counts as much as the market can absorb (half its daily sales), so a pricey crop nobody buys does not win.",
      run: () => ABP.advisor.crops({ plots: assume.plots, perPlant: assume.perPlant, seedReturn: assume.seedReturn / 100 }),
      legs: (r) => [{ role: "sell", id: r.crop, city: r.sell.city, what: "your crop" }, { role: "buy", id: r.seed, city: r.seed.city, what: "seeds" }],
      line: (r) => `${fmt(r.daily)} a day · sells ${full(r.sell.sell)} in ${r.sell.city}`, name: (r) => `T${r.tier} ${r.name}`, link: ["market", "crops"] },
    { key: "refining", title: "Refining: what to spend focus on", how: "Every resource from T4 to T8 at .0 to .2 enchant, refined with focus in its bonus city. Focus cost comes from your refining spec (Calculators → Your spec). Ranked by what your 10,000 daily focus earns: the extra profit focus adds per refine, times how many refines your focus covers, capped at half of what the market sells per day.",
      run: () => ABP.advisor.refining(),
      legs: (r) => [{ role: "sell", id: r.outId, city: r.city, what: "the refined output" }, { role: "buy", id: r.rawId, city: r.city, what: "raw resources" }], line: (r) => `${fmt(r.score)} a day from focus · ${r.spf.toFixed(1)} silver per focus · ${r.city}`, name: (r) => r.label, link: ["calc"] },
    { key: "bm", title: "Black Market: what to flip", how: "All Black Market gear from T4 to T8 at .0 to .2. Only Black Market prices from the last 12 hours count. Ranked by profit per flip times how many the Black Market actually bought per day (up to 10).",
      run: () => ABP.advisor.blackMarket(),
      legs: (r) => [{ role: "buy", id: r.id, city: r.src.city, what: "the item" }, { role: "sell", id: r.id, city: ABP.BM, what: "into Black Market orders" }], line: (r) => `${full(r.profit)} each · buy in ${r.src.city}`, name: (r) => r.label, link: ["market", "bm"] },
    { key: "flips", title: "Order flips: what to buy and relist", how: "Refined and raw resources (T4 to T8, .0 to .2), crops, herbs and common T4 to T6 gear in every city. Profit is the cheapest listing minus the top buy order after the 2.5% fee on both orders and the 4% tax. Ranked by that profit times a fifth of the daily sales, the share you can realistically fill. Items selling fewer than 5 a day are dropped.",
      run: () => ABP.advisor.flips(),
      legs: (r) => [{ role: "buy", id: r.id, city: r.city, what: "via buy orders" }, { role: "sell", id: r.id, city: r.city, what: "your relist" }], line: (r) => `${full(r.profit)} each · ${pct(r.margin, 0)} · in ${r.city}`, name: (r) => r.label },
    { key: "journals", title: "Journals: which to fill", how: "Full journal sell price minus empty journal cost, after fees, in the best cities. Weighed down when fewer than 3 full journals sell per day.",
      run: () => ABP.advisor.journals(),
      legs: (r) => [{ role: "sell", id: r.id, city: r.full.city, what: "full journals" }, { role: "buy", id: r.id.replace(/_FULL$/, "_EMPTY"), city: r.empty.city, what: "empty journals" }], line: (r) => `${full(r.profit)} per journal`, name: (r) => r.label },
  ];
  const STATIC_WHY = {
    crops: "Without live prices: higher tiers sell for more per plant but need more Farming spec, and herbs feed potion makers so their demand is steadier than most crops. Plant the highest tier you can farm whose daily sales are at least twice your harvest.",
    refining: "Without live prices: refine in the resource's bonus city with focus (53.9% return). Mid tiers (T5 and T6) at .1 or .2 usually have the best mix of margin and sales volume; T8 margins can be large but sell slowly.",
    bm: "Without live prices: start with items you can buy in Caerleon itself, because there is no hauling risk. Look for Black Market orders updated in the last few hours with at least 10% margin after the 4% tax.",
    flips: "Without live prices: flip items that sell hundreds a day (refined resources, potions, food) where the gap between the top buy order and the cheapest listing is above 12%, which leaves profit after the 9% round-trip cost.",
    journals: "Without live prices: fill the journal for whatever you already do all day. Crafting journals for your crafting line and gathering journals for your gathering line are free extra silver.",
  };
  function renderPicks() {
    const p = $("#panel-picks");
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Live recommendations</span>
        <h2>Best picks today</h2>
        <p>Instead of "plant the best crop", this page works out which one it is from today's prices, last week's sales and your spec, and says why. Set your spec under Calculators → Your spec. Rankings use the ${esc(ABP.SERVERS.find((s) => s.id === ABP.api.server).label)} server; change it on the Market tab.</p>
        <div class="row"><button class="btn" id="pk-refresh">Refresh picks</button><span class="small muted" id="pk-time"></span></div>
      </div>
      <div class="stack" id="pk-list">${PICKS.map((k) => `
        <section class="box pick" id="pk-${k.key}">
          <div class="row spread"><h3>${k.title}</h3>${k.link ? `<a href="#${k.link[0]}" class="small" data-go="${k.link.join(",")}">See the full table</a>` : ""}</div>
          ${k.key === "crops" ? `<div class="controls">
            <label class="field"><span>Plots you plant</span><input type="number" id="as-plots" min="1" value="${assume.plots}"></label>
            <label class="field"><span>Harvest per plant</span><input type="number" id="as-per" min="0" step="0.5" value="${assume.perPlant}"></label>
            <label class="field"><span>Seeds returned (%)</span><input type="number" id="as-seed" min="0" max="100" value="${assume.seedReturn}"></label>
          </div>` : ""}
          <details class="how"><summary>How this is ranked</summary><p class="small">${k.how}</p></details>
          <div class="pick-body"><p class="muted">Waiting to load…</p></div>
        </section>`).join("")}</div>`;
    $("#pk-refresh").addEventListener("click", () => { ABP.api.clearCache(); loadPicks(); });
    $$("#pk-list [data-go]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const [tab, preset] = a.dataset.go.split(",");
      if (preset) { mk.preset = preset; if (preset === "bm") mk.tier = "6"; saveMk(); rendered.market = false; }
      history.replaceState(null, "", "#" + tab); show(tab);
    }));
    [["as-plots", "plots"], ["as-per", "perPlant"], ["as-seed", "seedReturn"]].forEach(([id, k]) => $("#" + id).addEventListener("change", (e) => {
      assume[k] = +e.target.value || 0; store.set("assume", assume); loadPick(PICKS[0]);
    }));
    loadPicks();
  }
  /* Each pick remembers which load it belongs to, so a slow answer from an earlier load can't overwrite a newer one. */
  const pickGen = {};
  async function loadPicks() {
    const btn = $("#pk-refresh"), time = $("#pk-time");
    btn.disabled = true; time.textContent = "Loading fresh prices…";
    await Promise.all(PICKS.map(loadPick));
    if (!btn.isConnected) return;
    btn.disabled = false;
    time.textContent = `Updated ${vanTime(new Date())} Vancouver time`;
  }
  async function loadPick(k) {
    const body = $(`#pk-${k.key} .pick-body`);
    const gen = pickGen[k.key] = (pickGen[k.key] || 0) + 1;
    body.innerHTML = `<p class="muted">Checking prices and sales…</p>`;
    try {
      const { rows } = await k.run();
      if (gen !== pickGen[k.key] || !body.isConnected) return;
      if (!rows.length) { body.innerHTML = `<p class="muted">Nothing clears a profit with fresh prices right now. ${esc(STATIC_WHY[k.key])}</p>`; return; }
      const [top, ...rest] = rows;
      body.innerHTML = `
        <div class="pick-top">
          <span class="label">Best pick</span>
          <h4>${esc(k.name(top))}</h4>
          <p class="pick-line">${esc(k.line(top))}</p>
          <ul class="why">${top.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <div class="pick-time small"><span class="muted">Checking the best time of day…</span></div>
        </div>
        <ol class="runners" start="2">${rest.slice(0, 4).map((r) => `<li><details><summary><strong>${esc(k.name(r))}</strong> <span class="muted small">${esc(k.line(r))}</span></summary><ul class="why">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details></li>`).join("")}</ol>`;
      const legs = await timeLegs(k.legs(top));
      if (gen !== pickGen[k.key] || !body.isConnected) return;
      body.querySelector(".pick-time").innerHTML = timeHtml(legs);
    } catch (e) {
      if (gen !== pickGen[k.key] || !body.isConnected) return;
      body.innerHTML = `<div class="notice"><strong>${esc(e.message)}</strong><p class="small">${esc(STATIC_WHY[k.key])}</p></div>`;
    }
  }

  /* ---------- Welcome message ---------- */
  const WELCOME_DEFAULT = {
    title: "Welcome back, adventurer",
    message: "Island first, focus second, then the market.\nYou need {daily} today to stay on pace for your first billion.",
    show: true,
  };
  let welcome = Object.assign({}, WELCOME_DEFAULT, store.get("welcome", {}));
  function welcomeValues() {
    const last = log[log.length - 1];
    const silver = last ? last.silver : plan.start;
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(plan.date + "T00:00:00")) / 864e5));
    const daysLeft = Math.max(1, ABP.DAYS - elapsed);
    return {
      silver: fmt(silver), progress: pct(silver / ABP.GOAL), daily: fmt(Math.max(0, ABP.GOAL - silver) / daysLeft),
      daysLeft: String(daysLeft), path: profileOf(plan.profile).name,
      date: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    };
  }
  const fillIn = (text, v) => text.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  let welcomeReturn = null;
  function openWelcome(edit = false) {
    const box = $("#welcome");
    if (box.hidden) welcomeReturn = document.activeElement;
    const v = welcomeValues();
    box.innerHTML = edit ? `
      <div class="welcome">
        <h2 id="wl-title">Edit your welcome</h2>
        <form id="wl-form">
          <label class="field"><span>Heading</span><input type="text" id="wl-head" maxlength="80"></label>
          <label class="field"><span>Message</span><textarea id="wl-msg" rows="5" maxlength="600"></textarea></label>
          <p class="hint">You can use {silver}, {progress}, {daily}, {daysLeft}, {path} and {date}. They fill in with your numbers each time the app opens.</p>
          <label class="check"><input type="checkbox" id="wl-show"> Show this every time the app opens</label>
          <div class="row"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" id="wl-reset">Reset to default</button><button class="btn ghost" type="button" id="wl-cancel">Cancel</button></div>
        </form>
      </div>` : `
      <div class="welcome">
        <span class="crest" aria-hidden="true"></span>
        <span class="label">${esc(v.date)}</span>
        <h2 id="wl-title"></h2>
        <p class="msg" id="wl-text"></p>
        <div class="facts-row">
          <span>Silver<strong>${esc(v.silver)}</strong></span>
          <span>Toward 1B<strong>${esc(v.progress)}</strong></span>
          <span>Needed today<strong>${esc(v.daily)}</strong></span>
        </div>
        <div class="row"><button class="btn" type="button" id="wl-enter">Enter</button><button class="btn ghost" type="button" id="wl-edit">Edit message</button></div>
      </div>`;
    box.hidden = false;
    if (edit) {
      $("#wl-head").value = welcome.title; $("#wl-msg").value = welcome.message; $("#wl-show").checked = welcome.show;
      $("#wl-form").addEventListener("submit", (e) => {
        e.preventDefault();
        welcome = { title: $("#wl-head").value.trim() || WELCOME_DEFAULT.title, message: $("#wl-msg").value.trim(), show: $("#wl-show").checked };
        store.set("welcome", welcome); openWelcome(false);
      });
      $("#wl-reset").addEventListener("click", () => { $("#wl-head").value = WELCOME_DEFAULT.title; $("#wl-msg").value = WELCOME_DEFAULT.message; $("#wl-show").checked = true; });
      $("#wl-cancel").addEventListener("click", () => openWelcome(false));
      $("#wl-head").focus();
    } else {
      $("#wl-title").textContent = fillIn(welcome.title, v);
      $("#wl-text").textContent = fillIn(welcome.message, v);
      $("#wl-enter").addEventListener("click", closeWelcome);
      $("#wl-edit").addEventListener("click", () => openWelcome(true));
      $("#wl-enter").focus();
    }
  }
  function closeWelcome() {
    $("#welcome").hidden = true; $("#welcome").innerHTML = "";
    welcomeReturn?.focus?.();
  }
  $("#welcome").addEventListener("click", (e) => { if (e.target.id === "welcome") closeWelcome(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#welcome").hidden) closeWelcome(); });
  $("#welcomeOpen").addEventListener("click", () => openWelcome(false));


  /* ---------- Spend real money wheel ---------- */
  const WHEEL_SLICES = 30;
  const NO_LINES = [
    "NO. Farm it in silver.", "NO. Buy premium with gold instead.", "NO. Your island says hi.",
    "NO. Go refine something.", "NO. That money is a T8 bag in disguise.", "NO. The Black Market will provide.",
  ];
  const WHEEL_COOLDOWN = 4 * 3600 * 1000; /* one spin every 4 hours */
  const wheel = { rot: 0, spinning: false, timer: null, tally: Object.assign({ yes: 0, no: 0, last: 0, said: "" }, store.get("wheel", {})) };
  function wheelWait() { return Math.max(0, (wheel.tally.last || 0) + WHEEL_COOLDOWN - Date.now()); }
  function wheelCooldown() {
    const wait = wheelWait(), btn = $("#wh-spin"), note = $("#wh-wait");
    if (wheel.spinning) return;
    btn.disabled = wait > 0;
    if (!wait) { note.textContent = ""; return; }
    const mins = Math.ceil(wait / 60000), h = Math.floor(mins / 60), m = mins % 60;
    note.textContent = `The wheel needs ${[h && h + "h", m && m + "m"].filter(Boolean).join(" ")} to rest. Next spin at ${vanTime(new Date(Date.now() + wait))} Vancouver time.`;
  }
  function drawWheel() {
    const c = $("#wh-canvas"); const dpr = window.devicePixelRatio || 1;
    const size = c.clientWidth || 300;
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
    const r = size / 2, step = (Math.PI * 2) / WHEEL_SLICES;
    ctx.translate(r, r); ctx.rotate(wheel.rot);
    for (let i = 0; i < WHEEL_SLICES; i++) {
      const a0 = -Math.PI / 2 - step / 2 + i * step;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0, a0 + step); ctx.closePath();
      ctx.fillStyle = i === 0 ? "#e0b04f" : i % 2 ? "#3a2a1a" : "#5a3f24"; ctx.fill();
      ctx.strokeStyle = "#a8844a"; ctx.lineWidth = 1; ctx.stroke();
      const mid = a0 + step / 2, flip = Math.cos(mid + wheel.rot) < 0;
      ctx.save(); ctx.rotate(mid); ctx.textBaseline = "middle";
      ctx.fillStyle = i === 0 ? "#2e2114" : "#ecdfc4";
      ctx.font = `700 ${i === 0 ? 13 : 10}px ${css("--font-display") || "serif"}`;
      if (flip) { ctx.translate(r - 8, 0); ctx.rotate(Math.PI); ctx.textAlign = "left"; ctx.fillText(i === 0 ? "YES" : "NO", 0, 0); }
      else { ctx.textAlign = "right"; ctx.fillText(i === 0 ? "YES" : "NO", r - 8, 0); }
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2); ctx.fillStyle = "#c3ccd3"; ctx.fill();
    ctx.strokeStyle = "#a8844a"; ctx.lineWidth = 3; ctx.stroke();
  }
  function wheelTally() {
    const t = wheel.tally;
    $("#wh-tally").textContent = t.yes + t.no ? `Your spins so far: ${t.yes} yes, ${t.no} no.` : "";
  }
  function spinWheel() {
    if (wheel.spinning || wheelWait() > 0) return;
    /* Pick the slice first with a fair random draw: slice 0 is YES (1 in 30), the other 29 are NO. */
    const buf = new Uint32Array(1); let pick;
    do { crypto.getRandomValues(buf); } while (buf[0] >= Math.floor(2 ** 32 / WHEEL_SLICES) * WHEEL_SLICES);
    pick = buf[0] % WHEEL_SLICES;
    const yes = pick === 0;
    const step = (Math.PI * 2) / WHEEL_SLICES;
    const jitter = (Math.random() - 0.5) * step * 0.7;
    const current = ((wheel.rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const target = ((Math.PI * 2 - pick * step + jitter) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const delta = (target - current + Math.PI * 2) % (Math.PI * 2) + Math.PI * 2 * 6;
    const from = wheel.rot, dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 4200, t0 = performance.now();
    const out = $("#wh-result");
    out.className = "wheel-result"; out.innerHTML = "&nbsp;";
    wheel.spinning = true; $("#wh-spin").disabled = true;
    wheel.tally.last = Date.now(); store.set("wheel", wheel.tally); /* the cooldown starts at the spin, so closing mid-spin can't skip it */
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      wheel.rot = from + delta * (1 - Math.pow(1 - k, 4));
      drawWheel();
      if (k < 1) return requestAnimationFrame(tick);
      wheel.spinning = false;
      const said = yes ? "YES. The wheel has spoken." : NO_LINES[Math.floor(Math.random() * NO_LINES.length)];
      wheel.tally[yes ? "yes" : "no"]++; wheel.tally.said = said; store.set("wheel", wheel.tally); wheelTally();
      out.className = "wheel-result " + (yes ? "yes" : "no");
      out.textContent = said;
      wheelCooldown();
    };
    requestAnimationFrame(tick);
  }
  let wheelReturn = null;
  function openWheel() {
    wheelReturn = document.activeElement;
    $("#wheel").hidden = false; drawWheel(); wheelTally();
    const out = $("#wh-result");
    if (wheelWait() > 0 && wheel.tally.said) { out.className = "wheel-result " + (wheel.tally.said.startsWith("YES") ? "yes" : "no"); out.textContent = wheel.tally.said; }
    wheelCooldown(); clearInterval(wheel.timer); wheel.timer = setInterval(wheelCooldown, 30000);
    ($("#wh-spin").disabled ? $("#wh-close") : $("#wh-spin")).focus();
  }
  function closeWheel() { if (wheel.spinning) return; clearInterval(wheel.timer); $("#wheel").hidden = true; wheelReturn?.focus?.(); }
  $("#wheelOpen").addEventListener("click", openWheel);
  $("#wh-spin").addEventListener("click", spinWheel);
  $("#wh-close").addEventListener("click", closeWheel);
  $("#wheel").addEventListener("click", (e) => { if (e.target.id === "wheel") closeWheel(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#wheel").hidden) closeWheel(); });

  /* ---------- Times: everything shown in Vancouver time ---------- */
  const TZ = ABP.TZ;
  const van = (d, o) => d.toLocaleString("en-US", Object.assign({ timeZone: TZ }, o));
  const vanTime = (d) => van(d, { hour: "numeric", minute: "2-digit" });
  const vanDay = (d) => van(d, { weekday: "short", month: "short", day: "numeric" });
  const vanDate = (d) => van(d, { month: "short", day: "numeric", year: "numeric" });
  const vanKey = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const vanHour = (d) => +d.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }) % 24;
  const tzName = (d = new Date()) => (d.toLocaleString("en-US", { timeZone: TZ, timeZoneName: "short" }).split(" ").pop());
  const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  function until(ms) {
    if (ms <= 0) return "now";
    const m = Math.round(ms / 6e4), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${String(mm).padStart(2, "0")}m` : `${mm}m`;
  }
  /* Next daily maintenance for a server; "down" while inside the maintenance window. */
  function resetInfo(srv, now = new Date()) {
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), srv.resetUTC));
    const win = ABP.TIMES.maintenanceMinutes * 6e4;
    if (now >= t && now < t.getTime() + win) return { down: true, at: t, back: new Date(t.getTime() + win) };
    if (now >= t) t.setUTCDate(t.getUTCDate() + 1);
    return { down: false, at: t, back: new Date(t.getTime() + win) };
  }
  const serverNow = () => ABP.SERVERS.find((s) => s.id === ABP.api.server) || ABP.SERVERS[0];
  function tickClock() {
    const now = new Date(), srv = serverNow(), r = resetInfo(srv, now);
    const el = $("#clock");
    if (el) el.textContent = `Vancouver ${vanTime(now)} ${tzName(now)} · ${srv.label} ${r.down ? "in daily maintenance, back about " + vanTime(r.back) : "reset in " + until(r.at - now)}`;
    if (!$("#panel-times")?.hidden) drawTimes(false);
  }
  setInterval(tickClock, 30000);

  const timers = Object.assign({ planted: null, focus: null, focusAt: null, premiumStart: null }, store.get("timers", {}));
  const saveTimers = () => store.set("timers", timers);
  const bh = Object.assign({ preset: "crop", custom: "", city: "Caerleon" }, store.get("besthours", {}));

  function renderTimes() {
    const p = $("#panel-times");
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Clock</span>
        <h2>Times</h2>
        <p>Server resets, your timers and your plan's milestones, all in Vancouver time (${tzName()}). Daylight saving is handled for you.</p>
      </div>
      <div class="box stack">
        <div class="row spread"><h3>Server resets</h3><span class="small muted" id="tm-now"></span></div>
        <p class="small muted">Each server goes down once a day for maintenance, for about an hour. The server day rolls over then: daily challenges and the daily production bonus reset, and you get disconnected, so don't start a long transport or a dungeon in the half hour before.</p>
        <div id="tm-resets"></div>
        <p class="small muted">Sources: ${ABP.TIMES.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join("; ")}.</p>
      </div>
      <div class="grid-2">
        <div class="box stack">
          <h3>Your timers</h3>
          <div class="controls">
            <label class="field"><span>Island planted (hours ago)</span><input type="number" id="tm-planted" min="0" max="72" step="0.25" placeholder="0 = just now"></label>
            <div class="field"><span>&nbsp;</span><button class="btn ghost" type="button" id="tm-plant-now">Planted just now</button></div>
            <label class="field"><span>Focus you have now</span><input type="number" id="tm-focus" min="0" max="30000" step="100"></label>
          </div>
          <div class="stats" id="tm-timers"></div>
          <p class="small muted">Crops and herbs are ready about ${ABP.TIMES.cropHours} hours after planting. Premium refills ${full(ABP.TIMES.focusPerDay)} focus a day up to ${full(ABP.TIMES.focusMax)}; focus that would go past the cap is wasted, so spend it before it fills.</p>
        </div>
        <div class="box stack">
          <h3>Milestones</h3>
          <div class="controls">
            <label class="field"><span>Premium started</span><input type="date" id="tm-prem"></label>
          </div>
          <div id="tm-miles"></div>
        </div>
      </div>
      <div class="box stack" id="strattimes">
        <div class="row spread"><h3>Best times by strategy</h3><button class="btn" type="button" id="st-go">Check every strategy</button></div>
        <p class="small muted">Takes today's top pick for each strategy from Best picks and runs the test below on every buy and sell step. An hour only shows when it beat the day's average by more than the noise on most of the last week's days; otherwise it says any time is fine.</p>
        <div id="st-out"></div>
      </div>
      <div class="box stack" id="besthours">
        <h3>Best hours to buy and sell</h3>
        <p class="small muted">This checks whether the time of day really changes the price. It takes the last week of hourly sales, compares each hour with that day's average so a rising or falling market doesn't skew it, and only calls an hour better when the gap is bigger than the day-to-day noise and shows up on most days.</p>
        <div class="controls">
          <label class="field"><span>Strategy</span><select id="bh-preset">
            <option value="crop">Island: selling your crop</option>
            <option value="refine">Refining: selling refined output</option>
            <option value="bm">Black Market: selling into BM orders</option>
            <option value="gold">Buying or selling gold</option>
            <option value="custom">Any item (type its id)</option>
          </select></label>
          <label class="field" id="bh-custom-f"><span>Item id</span><input type="text" id="bh-custom" placeholder="e.g. T6_BAG"></label>
          <label class="field" id="bh-city-f"><span>Market</span><select id="bh-city">${ABP.CITIES.concat(ABP.BM).map((c) => `<option>${c}</option>`).join("")}</select></label>
          <div class="field"><span>&nbsp;</span><button class="btn" type="button" id="bh-go">Check</button></div>
        </div>
        <div id="bh-out"></div>
      </div>`;
    $("#tm-planted").value = timers.planted ? +((Date.now() - timers.planted) / 36e5).toFixed(2) : "";
    $("#tm-planted").addEventListener("change", (e) => { timers.planted = e.target.value === "" ? null : Date.now() - (+e.target.value || 0) * 36e5; saveTimers(); drawTimes(); });
    $("#tm-plant-now").addEventListener("click", () => { timers.planted = Date.now(); $("#tm-planted").value = 0; saveTimers(); drawTimes(); });
    $("#tm-focus").value = timers.focus != null ? Math.round(focusNow()) : "";
    $("#tm-focus").addEventListener("change", (e) => { timers.focus = e.target.value === "" ? null : Math.max(0, Math.min(ABP.TIMES.focusMax, +e.target.value || 0)); timers.focusAt = Date.now(); saveTimers(); drawTimes(); });
    $("#tm-prem").value = timers.premiumStart || plan.date;
    $("#tm-prem").addEventListener("change", (e) => { timers.premiumStart = e.target.value || null; saveTimers(); drawTimes(); });
    $("#bh-preset").value = bh.preset; $("#bh-custom").value = bh.custom; $("#bh-city").value = bh.city;
    const syncBh = () => {
      $("#bh-custom-f").hidden = bh.preset !== "custom";
      $("#bh-city-f").hidden = bh.preset === "gold";
    };
    $("#bh-preset").addEventListener("change", (e) => {
      bh.preset = e.target.value;
      const def = bhTarget();
      if (def.city) { bh.city = def.city; $("#bh-city").value = def.city; }
      store.set("besthours", bh); syncBh();
    });
    $("#bh-custom").addEventListener("change", (e) => { bh.custom = e.target.value.trim().toUpperCase(); store.set("besthours", bh); });
    $("#bh-city").addEventListener("change", (e) => { bh.city = e.target.value; store.set("besthours", bh); });
    $("#bh-go").addEventListener("click", bestHours);
    $("#st-go").addEventListener("click", strategyTimes);
    syncBh();
    drawTimes();
  }
  function focusNow() {
    if (timers.focus == null) return null;
    return Math.min(ABP.TIMES.focusMax, timers.focus + ((Date.now() - timers.focusAt) / 864e5) * ABP.TIMES.focusPerDay);
  }
  function drawTimes() {
    const now = new Date();
    if (!$("#tm-resets")) return;
    $("#tm-now").textContent = `${van(now, { weekday: "long", month: "short", day: "numeric" })}, ${vanTime(now)} ${tzName(now)}`;
    const cur = serverNow().id;
    $("#tm-resets").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Server</th><th>Next maintenance (Vancouver)</th><th>Starts in</th><th>Back about</th></tr></thead><tbody>${ABP.SERVERS.map((s) => {
      const r = resetInfo(s, now);
      return `<tr${s.id === cur ? ' class="on"' : ""}><td>${esc(s.label)}${s.id === cur ? " <small class=\"muted\">(your market server)</small>" : ""}</td><td>${r.down ? "Down now" : `${vanDay(r.at)}, ${vanTime(r.at)}`}</td><td class="num">${r.down ? "–" : until(r.at - now)}</td><td>${vanTime(r.back)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
    const cards = [];
    if (timers.planted) {
      const ready = new Date(timers.planted + ABP.TIMES.cropHours * 36e5);
      cards.push(`<div class="stat ${ready <= now ? "key" : ""}"><span class="label">Island harvest</span><span class="v">${ready <= now ? "Ready" : until(ready - now)}</span><span class="small muted">${ready <= now ? "since " : ""}${vanDay(ready)}, ${vanTime(ready)}</span></div>`);
    }
    const f = focusNow();
    if (f != null) {
      const full_ = new Date(Date.now() + ((ABP.TIMES.focusMax - f) / ABP.TIMES.focusPerDay) * 864e5);
      cards.push(`<div class="stat ${f >= ABP.TIMES.focusMax ? "key" : ""}"><span class="label">Focus now</span><span class="v">${full(f)}</span><span class="small muted">${f >= ABP.TIMES.focusMax ? "Full: you are wasting regen" : `full ${vanDay(full_)}, ${vanTime(full_)}`}</span></div>`);
    }
    $("#tm-timers").innerHTML = cards.join("") || `<p class="small muted">Enter when you planted or how much focus you have and the countdowns appear here.</p>`;
    const prof = profileOf(plan.profile);
    const sim = simulate(prof, plan.start, plan.hours ?? prof.hours, plan.skill);
    const start = new Date(plan.date + "T12:00:00");
    const premStart = new Date((timers.premiumStart || plan.date) + "T12:00:00");
    const premEnd = addDays(premStart, 365);
    const dayNo = Math.floor((now - new Date(plan.date + "T00:00:00")) / 864e5) + 1;
    const rows = [
      ["Plan day", dayNo >= 1 ? `Day ${Math.min(dayNo, 365)} of 365` : `Starts ${vanDate(start)}`, ""],
      ...ABP.PHASES.slice(1).map((ph, i) => { const d = sim.phaseDays[i + 1]; return [`Phase ${i + 2}: ${ph.name}`, d == null ? "Not this year" : vanDate(addDays(start, d)), d == null ? "" : until(addDays(start, d) - now)]; }),
      ["1 billion silver (projected)", sim.hit ? vanDate(addDays(start, sim.hit)) : "Not this year", sim.hit ? until(addDays(start, sim.hit) - now) : ""],
      ["Plan year ends", vanDate(addDays(start, 365)), until(addDays(start, 365) - now)],
      ["Premium runs out", vanDate(premEnd), until(premEnd - now)],
    ];
    $("#tm-miles").innerHTML = `<div class="table-wrap"><table><tbody>${rows.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td class="num muted">${c && c !== "now" ? "in " + c : c === "now" ? "reached" : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">Phase and billion dates come from your plan's projection on the Plan tab.</p>`;
  }

  function bhTarget() {
    const rfc = store.get("calc.refine", {});
    if (bh.preset === "crop") { const c = ABP.CROPS.concat(ABP.HERBS)[wi.crop] || ABP.CROPS[4]; return { id: c.crop, name: `T${c.tier} ${c.name}`, city: null }; }
    if (bh.preset === "refine") { const r = ABP.RESOURCES.find((x) => x.key === (rfc.res || wi.res)) || ABP.RESOURCES[0]; return { id: `T${wi.tier}_${r.refined}`, name: `T${wi.tier} ${r.refinedName}`, city: r.city }; }
    if (bh.preset === "bm") return { id: `T6_${ABP.BM_GEAR[0][0]}`, name: `T6 ${ABP.BM_GEAR[0][1]}`, city: ABP.BM };
    if (bh.preset === "gold") return { gold: true, name: "Gold" };
    return { id: bh.custom, name: bh.custom, city: null };
  }
  /* Hour-of-day effect: each sale price divided by its own day's average, grouped by Vancouver hour. */
  function hourEffect(points) {
    const byDay = new Map();
    for (const p of points) { if (!(p.price > 0)) continue; const k = vanKey(p.t); (byDay.get(k) || byDay.set(k, []).get(k)).push(p); }
    const hours = Array.from({ length: 24 }, () => ({ r: [], vol: 0, above: 0, days: 0 }));
    let days = 0, totalVol = 0;
    for (const pts of byDay.values()) {
      if (pts.length < 6) continue;
      days++;
      const w = pts.reduce((a, p) => a + (p.count || 1), 0);
      const mean = pts.reduce((a, p) => a + p.price * (p.count || 1), 0) / w;
      for (const p of pts) {
        const h = hours[vanHour(p.t)], r = p.price / mean;
        h.r.push(r); h.vol += p.count || 0; h.days++; if (r > 1) h.above++;
        totalVol += p.count || 0;
      }
    }
    const stats = hours.map((h, i) => {
      const n = h.r.length;
      if (n < 3) return { h: i, n, mean: null, vol: h.vol };
      const m = h.r.reduce((a, x) => a + x, 0) / n;
      const sd = Math.sqrt(h.r.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
      return { h: i, n, mean: m, se: sd / Math.sqrt(n), vol: h.vol, aboveShare: h.above / n };
    });
    const ok = stats.filter((s) => s.mean != null);
    const sig = (s, dir) => s && (dir > 0 ? s.mean - 1 > 2 * s.se && s.aboveShare >= 0.6 : 1 - s.mean > 2 * s.se && s.aboveShare <= 0.4);
    const high = ok.slice().sort((a, b) => b.mean - a.mean)[0], low = ok.slice().sort((a, b) => a.mean - b.mean)[0];
    return { stats, days, totalVol, high, low, highSig: sig(high, 1) && high.mean - 1 >= 0.01, lowSig: sig(low, -1) && 1 - low.mean >= 0.01 };
  }
  async function strategyTimes() {
    const out = $("#st-out"), btn = $("#st-go");
    btn.disabled = true; out.innerHTML = `<p class="small muted">Finding today's top picks and a week of hourly sales for each…</p>`;
    const goldLegs = async () => {
      try {
        const pts = (await ABP.api.gold(24 * 14)).map((r) => ({ t: new Date(r.timestamp + (r.timestamp.endsWith("Z") ? "" : "Z")), price: r.price, count: 1 }));
        const eff = hourEffect(pts);
        return [{ role: "buy", what: "gold", city: "the gold market", eff }, { role: "sell", what: "gold", city: "the gold market", eff }];
      } catch (e) { return [{ role: "buy", what: "gold", err: e.message }, { role: "sell", what: "gold", err: e.message }]; }
    };
    const rows = await Promise.all([...PICKS.map(async (k) => {
      try {
        const { rows } = await k.run();
        if (!rows.length) return { title: k.title, name: "Nothing profitable right now", legs: [] };
        return { title: k.title, name: k.name(rows[0]), legs: await timeLegs(k.legs(rows[0])) };
      } catch (e) { return { title: k.title, name: e.message, legs: [] }; }
    }), goldLegs().then((legs) => ({ title: "Gold: buying or selling", name: "Gold", legs }))]);
    if (!out.isConnected) return;
    btn.disabled = false;
    const cell = (l) => { if (!l) return "–"; const v = legVerdict(l); return v.ok ? `<strong>${esc(hourLabel(v.h))}</strong><br><span class="small muted">${esc(v.text.replace(/^around \S+ \S+ /, ""))}</span>` : `<span class="small muted">${esc(v.text)}</span>`; };
    out.innerHTML = `<div class="table-wrap"><table class="st-table"><thead><tr><th>Strategy</th><th>Today's pick</th><th>Best time to buy</th><th>Best time to sell</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.title.split(":")[0])}</td><td>${esc(r.name)}</td><td>${cell(r.legs.find((l) => l.role === "buy"))}</td><td>${cell(r.legs.find((l) => l.role === "sell"))}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">Checked ${vanTime(new Date())} Vancouver time. Hours are in Vancouver time. Busy items give clearer answers; thin markets usually say any time.</p>`;
  }
  async function bestHours() {
    const t = bhTarget(), out = $("#bh-out");
    if (!t.gold && !/^T\d_[A-Z0-9_@]+$/i.test(t.id || "")) { out.innerHTML = `<p class="small">Type an item id such as T6_BAG. The Market tab's search shows ids.</p>`; return; }
    out.innerHTML = `<p class="small muted">Loading a week of hourly sales for ${esc(t.name)}…</p>`;
    let pts;
    try {
      pts = t.gold ? (await ABP.api.gold(24 * 14)).map((r) => ({ t: new Date(r.timestamp + (r.timestamp.endsWith("Z") ? "" : "Z")), price: r.price, count: 1 }))
                   : await ABP.api.hourly(t.id, bh.city);
    } catch (e) { out.innerHTML = `<p class="small">${esc(e.message)}</p>`; return; }
    const eff = hourEffect(pts);
    if (eff.days < 3) { out.innerHTML = `<p class="small">Not enough hourly sales for ${esc(t.name)}${t.gold ? "" : " in " + esc(bh.city)} (${eff.days} usable days). Pick a busier item or market; with this little data no time of day can be shown to help.</p>`; return; }
    const pctOf = (m) => ((m - 1) * 100).toFixed(1) + "%";
    const verdict = [];
    if (eff.highSig) verdict.push(`<strong>Sell around ${hourLabel(eff.high.h)}:</strong> prices then average ${pctOf(eff.high.mean)} versus the day's average, above average on ${Math.round(eff.high.aboveShare * 100)}% of days.`);
    if (eff.lowSig) verdict.push(`<strong>Buy around ${hourLabel(eff.low.h)}:</strong> prices then average ${pctOf(eff.low.mean)} versus the day's average, below average on ${Math.round((1 - eff.low.aboveShare) * 100)}% of days.`);
    const busiest = eff.stats.slice().sort((a, b) => b.vol - a.vol).slice(0, 3).filter((s) => s.vol > 0).sort((a, b) => a.h - b.h);
    const max = Math.max(0.005, ...eff.stats.filter((s) => s.mean != null).map((s) => Math.abs(s.mean - 1)));
    out.innerHTML = `
      <div class="notice"><p>${verdict.length ? verdict.join("<br>") : `<strong>No reliable best time for ${esc(t.name)}.</strong> Over ${eff.days} days the hour-to-hour differences stay inside normal day-to-day noise, so timing your trades here would not reliably earn more. Trade whenever suits you.`}</p></div>
      ${!t.gold && busiest.length ? `<p class="small">Most sales happen around ${busiest.map((s) => hourLabel(s.h)).join(", ")}${eff.totalVol ? "" : ""}. Sell orders fill fastest when they are already up before then.</p>` : ""}
      <div class="legend"><span><i style="background:var(--s2)"></i>Above the day's average</span><span><i style="background:var(--s1)"></i>Below the day's average</span><span class="muted">Hours in Vancouver time · ${eff.days} days of data</span></div>
      <div class="hourbars" role="img" aria-label="Price by hour compared with each day's average">${eff.stats.map((s) => {
        if (s.mean == null) return `<div class="hb" title="${hourLabel(s.h)}: too few sales"><span class="bar none"></span><span class="hl">${s.h % 3 ? "" : hourLabel(s.h)}</span></div>`;
        const d = s.mean - 1, hgt = Math.max(2, (Math.abs(d) / max) * 50);
        return `<div class="hb" tabindex="0" title="${hourLabel(s.h)}: ${pctOf(s.mean)} vs day average (${s.n} samples${t.gold ? "" : ", " + full(s.vol) + " sold"})"><span class="bar ${d >= 0 ? "up" : "down"}" style="height:${hgt.toFixed(1)}%"></span><span class="hl">${s.h % 3 ? "" : hourLabel(s.h)}</span></div>`;
      }).join("")}</div>
      <details><summary class="small">Table view</summary><div class="table-wrap"><table><thead><tr><th>Hour</th><th>Vs day average</th><th>± noise</th><th>Days above</th><th>Samples</th>${t.gold ? "" : "<th>Sold</th>"}</tr></thead><tbody>${eff.stats.filter((s) => s.mean != null).map((s) => `<tr><td>${hourLabel(s.h)}</td><td class="num">${pctOf(s.mean)}</td><td class="num">${(2 * s.se * 100).toFixed(1)}%</td><td class="num">${Math.round(s.aboveShare * 100)}%</td><td class="num">${s.n}</td>${t.gold ? "" : `<td class="num">${full(s.vol)}</td>`}</tr>`).join("")}</tbody></table></div></details>`;
  }

  /* ---------- Native helpers: the Android app (Capacitor) gets real notifications and file sharing ---------- */
  const isNative = () => !!window.Capacitor?.isNativePlatform?.();
  const plugin = (n) => (isNative() ? window.Capacitor.Plugins?.[n] || window.Capacitor.registerPlugin?.(n) : null);
  async function notify(title, body) {
    try {
      if (isNative() && plugin("LocalNotifications")) {
        const LN = plugin("LocalNotifications");
        const perm = await LN.requestPermissions();
        if (perm.display !== "granted") return false;
        await LN.schedule({ notifications: [{ id: Math.floor(Math.random() * 2e9), title, body }] });
        return true;
      }
      if ("Notification" in window) {
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission === "granted") { new Notification(title, { body }); return true; }
      }
    } catch (e) { /* fall back to the in-app banner */ }
    return false;
  }
  async function saveFile(name, text) {
    if (isNative() && plugin("Filesystem") && plugin("Share")) {
      const res = await plugin("Filesystem").writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
      await plugin("Share").share({ title: name, url: res.uri, dialogTitle: "Save your backup" });
      return "shared";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return "downloaded";
  }

  /* Albion's own item data (recipes, base focus, weights), built by tools/build_recipes.py. */
  let recipesP = null;
  function recipes() {
    if (window.ABP_RECIPES) return Promise.resolve(window.ABP_RECIPES);
    if (!recipesP) recipesP = fetch("assets/data/recipes.json").then((r) => { if (!r.ok) throw new Error("Recipe data did not load."); return r.json(); }).catch((e) => { recipesP = null; throw e; });
    return recipesP;
  }
  const weightOf = (R, id) => R.w[id.split("@")[0]] ?? null;

  /* Item picker shared by the tools: name search with an id fallback. */
  function itemPicker(inputSel, boxSel, wrapSel, onPick) {
    const input = $(inputSel), box = $(boxSel);
    let list = null;
    input.addEventListener("focus", async () => {
      if (list) return;
      try { list = await ABP.api.itemNames(); } catch (e) { list = []; input.placeholder = "Names could not load. Type an item id such as T6_BAG and press Enter."; }
    });
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2 || !list) { box.hidden = true; return; }
      const hits = list.filter((n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).slice(0, 30);
      box.innerHTML = hits.map((h) => `<button type="button" data-id="${esc(h.id)}"><span>${esc(h.name)}</span><small>${esc(h.id)}</small></button>`).join("") || `<p class="small muted" style="padding:8px">No items match.</p>`;
      box.hidden = false;
      $$("button", box).forEach((b) => b.addEventListener("click", () => { box.hidden = true; input.value = b.dataset.id; onPick(b.dataset.id); }));
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && /^T\d_[A-Z0-9_@]+$/i.test(input.value.trim())) { e.preventDefault(); box.hidden = true; onPick(input.value.trim().toUpperCase()); }
      if (e.key === "Escape") box.hidden = true;
    });
    document.addEventListener("click", (e) => { if (!$(wrapSel)?.contains(e.target)) box.hidden = true; });
  }

  /* ---------- Tools tab: haul planner, crafting shopping list, backup ---------- */
  const haul = Object.assign({ id: "T5_PLANKS", from: "Fort Sterling", to: "Caerleon", buyMode: "instant", sellMode: "order", cap: 1000, budget: 10000000, quality: 1 }, store.get("haul", {}));
  const shop = Object.assign({ id: "T6_MAIN_SWORD", ench: 0, qty: 10, rr: 0, craftCity: "Lymhurst" }, store.get("shop", {}));
  const cityOpts = (cur, withBM) => ABP.CITIES.concat(withBM ? [ABP.BM] : []).map((c) => `<option ${c === cur ? "selected" : ""}>${c}</option>`).join("");
  function routeRisk(a, b) {
    const s = [a, b];
    if (s.includes(ABP.BM) || s.includes("Caerleon")) return { level: "High", text: "Caerleon sits behind red zones. You can be attacked and lose the whole load, so only carry what you can afford to lose." };
    if (s.includes("Brecilien")) return { level: "High", text: "Brecilien is reached through the Mists, which are full-loot. Expect to lose the load if you are caught." };
    return { level: "Low", text: "Royal cities link through blue and yellow zones. Taking that path, you cannot lose your cargo." };
  }

  function renderTools() {
    const p = $("#panel-tools");
    p.innerHTML = `
      <div class="panel-head">
        <span class="label">Workshop</span>
        <h2>Tools</h2>
        <p>Plan a trade run, get a shopping list for a craft, and back up everything you have entered. Weights, recipes and focus costs come from Albion's own item data.</p>
      </div>
      <div class="box stack" id="haul">
        <h3>Haul planner</h3>
        <p class="small muted">Fits a load to your mount's carry limit and your budget, prices it at both ends, and tells you how risky the route is.</p>
        <div class="controls">
          <div class="search" id="hl-wrap" style="grid-column: span 2"><label class="field"><span>Item</span><input type="search" id="hl-item" autocomplete="off" placeholder="Type an item name"></label><div class="results" id="hl-results" hidden></div></div>
          <label class="field"><span>Buy in</span><select id="hl-from">${cityOpts(haul.from)}</select></label>
          <label class="field"><span>Sell in</span><select id="hl-to">${cityOpts(haul.to, true)}</select></label>
          <label class="field"><span>Buy by</span><select id="hl-buyMode"><option value="instant">Instant buy</option><option value="order">Buy order</option></select></label>
          <label class="field"><span>Sell by</span><select id="hl-sellMode"><option value="order">Sell order</option><option value="instant">Instant sell</option></select></label>
          <label class="field"><span>Mount carry limit (kg)</span><input type="number" id="hl-cap" min="1" step="any"></label>
          <label class="field"><span>Silver to spend</span><input type="number" id="hl-budget" min="0" step="any"></label>
          <div class="field"><span>&nbsp;</span><button class="btn" type="button" id="hl-go">Plan the run</button></div>
        </div>
        <p class="small muted">Use the carry limit your mount's tooltip shows, plus any bag or food bonus, minus what you already carry.</p>
        <div id="hl-out"></div>
      </div>
      <div class="box stack" id="shopping">
        <h3>Crafting shopping list</h3>
        <p class="small muted">Pick what you want to craft. You get every material, the cheapest city to buy each one, and the total cost, with your return rate taken off.</p>
        <div class="controls">
          <div class="search" id="sh-wrap" style="grid-column: span 2"><label class="field"><span>Item to craft</span><input type="search" id="sh-item" autocomplete="off" placeholder="Type an item name"></label><div class="results" id="sh-results" hidden></div></div>
          <label class="field"><span>Enchantment</span><select id="sh-ench">${[0, 1, 2, 3, 4].map((e) => `<option value="${e}">.${e}</option>`).join("")}</select></label>
          <label class="field"><span>How many</span><input type="number" id="sh-qty" min="1" step="1"></label>
          <label class="field"><span>Return rate</span><select id="sh-rr"><option value="0">None (count everything)</option>${ABP.RRR.map((r, i) => `<option value="${i + 1}">${r.setup} (${pct(r.rate)})</option>`).join("")}</select></label>
          <label class="field"><span>Sell the item in</span><select id="sh-city">${cityOpts(shop.craftCity, true)}</select></label>
          <div class="field"><span>&nbsp;</span><button class="btn" type="button" id="sh-go">Make the list</button></div>
        </div>
        <div id="sh-out"></div>
      </div>
      <div class="box stack" id="backup">
        <h3>Backup and restore</h3>
        <p class="small muted">Everything you enter lives on this device: your plan, spec, wealth, logs, ledger, alerts and timers. Save a backup file now and then, and restore it on a new phone or after reinstalling.</p>
        <div class="row"><button class="btn" type="button" id="bk-save">Save backup file</button>
          <label class="btn ghost" for="bk-file" style="cursor:pointer">Restore from file</label><input type="file" id="bk-file" accept="application/json,.json" hidden></div>
        <p class="small" id="bk-msg"></p>
      </div>`;

    /* Haul */
    $("#hl-item").value = haul.id;
    for (const k of ["from", "to", "buyMode", "sellMode", "cap", "budget"]) {
      const x = $("#hl-" + k); x.value = haul[k];
      x.addEventListener("change", () => { haul[k] = ["cap", "budget"].includes(k) ? Math.max(0, +x.value || 0) : x.value; store.set("haul", haul); });
    }
    itemPicker("#hl-item", "#hl-results", "#hl-wrap", (id) => { haul.id = id; store.set("haul", haul); planHaul(); });
    $("#hl-go").addEventListener("click", () => { const v = $("#hl-item").value.trim().toUpperCase(); if (/^T\d_/.test(v)) haul.id = v; store.set("haul", haul); planHaul(); });

    /* Shopping list */
    $("#sh-item").value = shop.id; $("#sh-ench").value = shop.ench; $("#sh-qty").value = shop.qty; $("#sh-rr").value = shop.rr;
    [["ench", "#sh-ench"], ["qty", "#sh-qty"], ["rr", "#sh-rr"], ["craftCity", "#sh-city"]].forEach(([k, sel]) => $(sel).addEventListener("change", (e) => { shop[k] = k === "craftCity" ? e.target.value : Math.max(k === "qty" ? 1 : 0, +e.target.value || 0); store.set("shop", shop); }));
    itemPicker("#sh-item", "#sh-results", "#sh-wrap", (id) => { shop.id = id.split("@")[0]; if (id.includes("@")) { shop.ench = +id.split("@")[1]; $("#sh-ench").value = shop.ench; } store.set("shop", shop); shoppingList(); });
    $("#sh-go").addEventListener("click", () => { const v = $("#sh-item").value.trim().toUpperCase(); if (/^T\d_/.test(v)) shop.id = v.split("@")[0]; store.set("shop", shop); shoppingList(); });

    /* Backup */
    $("#bk-save").addEventListener("click", async () => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("abp.")) data[k] = localStorage.getItem(k); }
      const txt = JSON.stringify({ app: "albion-billionaire", version: 1, exported: new Date().toISOString(), data }, null, 1);
      const name = `albion-billionaire-backup-${todayISO()}.json`;
      try { const how = await saveFile(name, txt); $("#bk-msg").textContent = how === "shared" ? "Backup ready. Save it to Drive or your files from the share menu." : `Saved ${name} to your downloads.`; }
      catch (e) { $("#bk-msg").textContent = "Could not save the file: " + e.message; }
    });
    $("#bk-file").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.app !== "albion-billionaire" || !j.data) throw new Error("This is not an Albion Billionaire backup.");
        if (!confirm(`Replace everything in the app with the backup from ${new Date(j.exported).toLocaleString()}?`)) return;
        Object.keys(localStorage).filter((k) => k.startsWith("abp.")).forEach((k) => localStorage.removeItem(k));
        Object.entries(j.data).forEach(([k, v]) => k.startsWith("abp.") && localStorage.setItem(k, v));
        $("#bk-msg").textContent = "Restored. Reloading…";
        setTimeout(() => location.reload(), 600);
      } catch (err) { $("#bk-msg").textContent = err.message; }
      e.target.value = "";
    });
  }

  async function planHaul() {
    const out = $("#hl-out");
    out.innerHTML = `<p class="small muted">Pricing ${esc(itemLabel(haul.id))}…</p>`;
    let R, rows;
    try { R = await recipes(); rows = await ABP.api.prices([haul.id], [haul.from, haul.to], [1]); }
    catch (e) { out.innerHTML = `<p class="small">${esc(e.message)}</p>`; return; }
    const idx = ABP.api.index(rows)[haul.id] || {};
    const src = idx[haul.from] || {}, dst = idx[haul.to] || {};
    const buyEach = haul.buyMode === "instant" ? src.sell : src.buy ? (src.buy + 1) * (1 + FEES.setupFee) : null;
    const sellGross = haul.to === ABP.BM || haul.sellMode === "instant" ? dst.buy : dst.sell ? dst.sell - 1 : null;
    const sellEach = sellGross ? sellGross * (1 - FEES.salesTaxPremium - (haul.to !== ABP.BM && haul.sellMode === "order" ? FEES.setupFee : 0)) : null;
    const w = weightOf(R, haul.id);
    if (!buyEach || !sellEach) { out.innerHTML = `<p class="small">No ${!buyEach ? "buy price in " + esc(haul.from) : "sell price in " + esc(haul.to)} for this item right now. Try another city or type a different item.</p>`; return; }
    if (!w) { out.innerHTML = `<p class="small">Albion's item data has no weight for ${esc(haul.id)}.</p>`; return; }
    let vol = null; try { vol = (await ABP.api.volumes([haul.id], [haul.to]))[haul.id]?.[haul.to]?.perDay ?? null; } catch (e) {}
    const byWeight = Math.floor(haul.cap / w), byBudget = Math.floor(haul.budget / buyEach);
    const units = Math.max(0, Math.min(byWeight, byBudget));
    const cost = units * buyEach, revenue = units * sellEach, profit = revenue - cost;
    const risk = routeRisk(haul.from, haul.to);
    const breakEven = revenue > 0 ? profit / revenue : 0;
    const limit = byWeight <= byBudget ? `your mount (${full(byWeight)} × ${w} kg)` : `your budget`;
    out.innerHTML = `
      <div class="stats">
        <div class="stat key"><span class="label">Profit per trip</span><span class="v ${profit >= 0 ? "good" : "bad"}">${fmt(profit)}</span><span class="small muted">${full(units)} items, limited by ${limit}</span></div>
        <div class="stat"><span class="label">You spend</span><span class="v">${fmt(cost)}</span><span class="small muted">${full(buyEach)} each in ${esc(haul.from)}</span></div>
        <div class="stat"><span class="label">You get back</span><span class="v">${fmt(revenue)}</span><span class="small muted">${full(sellEach)} each after fees in ${esc(haul.to)}</span></div>
        <div class="stat"><span class="label">Margin</span><span class="v">${cost ? pct(profit / cost) : "–"}</span><span class="small muted">load weighs ${full(units * w)} kg</span></div>
      </div>
      <div class="notice"><p><strong>Risk: ${risk.level}.</strong> ${risk.text}${risk.level === "High" && profit > 0 ? ` This run still pays if you lose fewer than <strong>${pct(breakEven, 0)}</strong> of trips; lose more and you are better off not going.` : ""}</p></div>
      ${vol != null ? `<p class="small ${units > vol * 3 ? "bad" : "muted"}">${esc(haul.to)} sells about ${full(vol)} a day of this item.${units > vol * 3 ? " Your load is more than three days of sales, so expect to cut your price or wait." : ""}</p>` : ""}`;
  }

  async function shoppingList() {
    const out = $("#sh-out");
    const key = shop.ench ? `${shop.id}@${shop.ench}` : shop.id;
    out.innerHTML = `<p class="small muted">Loading the recipe for ${esc(itemLabel(key))}…</p>`;
    let R;
    try { R = await recipes(); } catch (e) { out.innerHTML = `<p class="small">${esc(e.message)}</p>`; return; }
    const rec = R.r[key];
    if (!rec) { out.innerHTML = `<p class="small">Albion's item data has no recipe for ${esc(key)}. Check the enchantment, or pick the item from the search list.</p>`; return; }
    const [focus, made, mats] = rec;
    const crafts = Math.ceil(shop.qty / made);
    const rr = shop.rr ? ABP.RRR[shop.rr - 1].rate : 0;
    const ids = mats.map((m) => m[0]);
    let idx = {};
    try { idx = ABP.api.index(await ABP.api.prices(ids.concat(key), ABP.CITIES.concat(ABP.BM), [1])); } catch (e) { out.innerHTML = `<p class="small">${esc(e.message)} The list below has no prices.</p>`; }
    const lines = mats.map(([id, count, noRet]) => {
      const need = count * crafts;
      const buy = noRet || !rr ? need : Math.ceil(need * (1 - rr));
      let best = null;
      for (const c of ABP.CITIES) { const r = idx[id]?.[c]; if (r?.sell && (!best || r.sell < best.sell)) best = { city: c, sell: r.sell }; }
      return { id, count, need, buy, noRet, best, cost: best ? best.sell * buy : null };
    });
    const total = lines.reduce((a, l) => a + (l.cost || 0), 0);
    const missing = lines.filter((l) => !l.best).length;
    const sellRow = idx[key]?.[shop.craftCity];
    const sellEach = shop.craftCity === ABP.BM ? sellRow?.buy : sellRow?.sell;
    const revenue = sellEach ? sellEach * shop.qty * (1 - FEES.salesTaxPremium - (shop.craftCity === ABP.BM ? 0 : FEES.setupFee)) : null;
    const efc = ABP.focusCost(focus, ABP.spec.craft.mastery * 30 + ABP.spec.craft.others * 30 + ABP.spec.craft.item * 280);
    out.innerHTML = `
      <p class="small">${crafts} craft${crafts === 1 ? "" : "s"} make ${full(crafts * made)} × ${esc(itemLabel(key))}. Base focus ${full(focus)} per craft, ${full(efc)} with your crafting spec.</p>
      <div class="table-wrap"><table><thead><tr><th>Material</th><th>Per craft</th><th>Needed</th><th>Buy${rr ? " after returns" : ""}</th><th>Cheapest in</th><th>Each</th><th>Cost</th></tr></thead><tbody>${lines.map((l) => `
        <tr><td><span class="item-name">${esc(itemLabel(l.id))}<small>${esc(l.id)}</small></span>${l.noRet ? `<br><small class="muted">never returned</small>` : ""}</td><td class="num">${l.count}</td><td class="num">${full(l.need)}</td><td class="num"><strong>${full(l.buy)}</strong></td>
          <td>${l.best ? esc(l.best.city) : "–"}</td><td class="num">${l.best ? full(l.best.sell) : "–"}</td><td class="num money">${l.cost != null ? full(l.cost) : "–"}</td></tr>`).join("")}</tbody></table></div>
      <div class="stats">
        <div class="stat key"><span class="label">Materials cost</span><span class="v money">${fmt(total)}</span><span class="small muted">${missing ? missing + " material" + (missing > 1 ? "s" : "") + " without a price" : "cheapest sell listings, instant buy"}</span></div>
        <div class="stat"><span class="label">Sells for</span><span class="v">${revenue != null ? fmt(revenue) : "–"}</span><span class="small muted">${sellEach ? `${full(sellEach)} each in ${esc(shop.craftCity)}, after fees` : "no price in " + esc(shop.craftCity)}</span></div>
        <div class="stat"><span class="label">Profit</span><span class="v ${revenue != null && revenue - total >= 0 ? "good" : "bad"}">${revenue != null && !missing ? fmt(revenue - total) : "–"}</span><span class="small muted">before station fees</span></div>
      </div>
      ${rr ? `<p class="small muted">Returns are an average: with ${pct(rr)} back you buy less in total, but you need the full amount for the first crafts. Materials marked "never returned" (artifacts, tokens) always count in full.</p>` : ""}`;
  }

  /* ---------- Profit ledger: what each method really pays you ---------- */
  let ledger = store.get("ledger", []);
  function ledgerBox() {
    return `<div class="box stack" id="ledger">
      <div class="row spread"><h3>Profit ledger by method</h3><span class="small muted">Your real silver per hour, method by method</span></div>
      <p class="small muted">After each session, log what you did, for how long, and the silver you came out with after costs. The app compares your real results with the estimates it plans with.</p>
      <form class="controls" id="ld-form">
        <label class="field"><span>Date</span><input type="date" id="ld-date" required></label>
        <label class="field"><span>Method</span><select id="ld-method">${ABP.METHODS.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Hours</span><input type="number" id="ld-hours" min="0.1" step="0.1" required></label>
        <label class="field"><span>Silver made (after costs)</span><input type="number" id="ld-silver" step="any" required placeholder="negative for a loss"></label>
        <label class="field"><span>Note</span><input type="text" id="ld-note" placeholder="optional"></label>
        <button class="btn" type="submit">Log session</button>
      </form>
      <div id="ld-summary"></div>
      <div id="ld-rows"></div>
    </div>`;
  }
  function setupLedger() {
    $("#ld-date").value = todayISO();
    $("#ld-form").addEventListener("submit", (e) => {
      e.preventDefault();
      ledger.push({ date: $("#ld-date").value, method: $("#ld-method").value, hours: +$("#ld-hours").value || 0, silver: +$("#ld-silver").value || 0, note: $("#ld-note").value.trim() });
      ledger.sort((a, b) => a.date.localeCompare(b.date));
      store.set("ledger", ledger);
      $("#ld-hours").value = ""; $("#ld-silver").value = ""; $("#ld-note").value = "";
      drawLedger();
    });
    drawLedger();
  }
  function drawLedger() {
    const by = new Map();
    for (const s of ledger) { const r = by.get(s.method) || { method: s.method, n: 0, hours: 0, silver: 0 }; r.n++; r.hours += s.hours; r.silver += s.silver; by.set(s.method, r); }
    const rows = [...by.values()].map((r) => Object.assign(r, { rate: r.hours ? r.silver / r.hours : 0 })).sort((a, b) => b.rate - a.rate);
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.rate)));
    const name = (id) => ABP.METHODS.find((m) => m.id === id)?.name || id;
    $("#ld-summary").innerHTML = rows.length ? `
      <div class="hbars">${rows.map((r) => `<div class="hbar" tabindex="0" title="${esc(name(r.method))}: ${full(r.rate)} silver an hour over ${r.n} session${r.n > 1 ? "s" : ""}">
        <span class="name">${esc(name(r.method))}</span>
        <span class="track" style="width:${((Math.abs(r.rate) / max) * 100).toFixed(1)}%"><span class="seg" style="flex:1;background:${r.rate >= 0 ? "var(--accent)" : "var(--bad)"}"></span></span>
        <span class="val">${fmt(r.rate)}/h</span></div>`).join("")}</div>
      <div class="table-wrap"><table><thead><tr><th>Method</th><th>Sessions</th><th>Hours</th><th>Silver</th><th>Your silver/hour</th><th>App estimate</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(name(r.method))}</td><td class="num">${r.n}</td><td class="num">${r.hours.toFixed(1)}</td><td class="num money">${full(r.silver)}</td><td class="num"><strong>${full(r.rate)}</strong></td><td class="small">${esc(ABP.METHODS.find((m) => m.id === r.method)?.rate || "")}</td></tr>`).join("")}</tbody></table></div>
      ${rows[0]?.rate > 0 ? `<p class="small"><strong>${esc(name(rows[0].method))}</strong> pays you the most per hour so far${rows[0].n < 3 ? ", but log a few more sessions before trusting it" : ""}.</p>` : ""}` : `<p class="small muted">No sessions yet.</p>`;
    $("#ld-rows").innerHTML = ledger.length ? `<details><summary class="small">All sessions (${ledger.length})</summary><div class="table-wrap"><table><thead><tr><th>Date</th><th>Method</th><th>Hours</th><th>Silver</th><th>Note</th><th></th></tr></thead><tbody>${ledger.slice().reverse().map((s, i) => `<tr><td>${esc(s.date)}</td><td>${esc(name(s.method))}</td><td class="num">${s.hours}</td><td class="num ${s.silver >= 0 ? "" : "bad"}">${full(s.silver)}</td><td>${esc(s.note)}</td><td><button class="btn ghost" type="button" data-ldel="${ledger.length - 1 - i}">Delete</button></td></tr>`).join("")}</tbody></table></div></details>` : "";
    $$("#ld-rows [data-ldel]").forEach((b) => b.addEventListener("click", () => { ledger.splice(+b.dataset.ldel, 1); store.set("ledger", ledger); drawLedger(); }));
  }

  /* ---------- Price alerts ---------- */
  let alerts = store.get("alerts", []);
  function alertsBox() {
    return `<div class="box stack" id="alerts">
      <div class="row spread"><h3>Price alerts</h3><span class="small muted" id="al-status"></span></div>
      <p class="small muted">Get told when an item gets cheap enough to buy or when buyers pay enough to sell. The app checks when you open it and every 10 minutes while it is open${isNative() ? ", and sends a phone notification" : ""}.</p>
      <div class="controls">
        <div class="search" id="al-wrap" style="grid-column: span 2"><label class="field"><span>Item</span><input type="search" id="al-item" autocomplete="off" placeholder="Type an item name"></label><div class="results" id="al-results" hidden></div></div>
        <label class="field"><span>Market</span><select id="al-city">${cityOpts("Caerleon", true)}</select></label>
        <label class="field"><span>Alert when</span><select id="al-kind"><option value="below">Cheapest listing drops to</option><option value="above">Best buy order reaches</option></select></label>
        <label class="field"><span>Price</span><input type="number" id="al-price" min="1" step="any"></label>
        <div class="field"><span>&nbsp;</span><button class="btn" type="button" id="al-add">Add alert</button></div>
      </div>
      <div id="al-list"></div>
      <div class="row"><button class="btn ghost" type="button" id="al-check">Check now</button></div>
    </div>`;
  }
  function setupAlerts() {
    let picked = null;
    itemPicker("#al-item", "#al-results", "#al-wrap", (id) => { picked = id; });
    $("#al-add").addEventListener("click", () => {
      const id = picked || $("#al-item").value.trim().toUpperCase(), price = +$("#al-price").value;
      if (!/^T\d_[A-Z0-9_@]+$/.test(id) || !(price > 0)) { $("#al-status").textContent = "Pick an item and set a price."; return; }
      alerts.push({ id, city: $("#al-city").value, kind: $("#al-kind").value, price, hit: null, firedAt: 0, last: null });
      store.set("alerts", alerts); picked = null; $("#al-item").value = ""; $("#al-price").value = "";
      drawAlerts(); checkAlerts(true);
    });
    $("#al-check").addEventListener("click", () => checkAlerts(true));
    drawAlerts();
  }
  function drawAlerts() {
    const el = $("#al-list"); if (!el) return;
    el.innerHTML = alerts.length ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Market</th><th>Rule</th><th>Now</th><th></th></tr></thead><tbody>${alerts.map((a, i) => `
      <tr class="${a.hit ? "on" : ""}"><td><span class="item-name">${esc(itemLabel(a.id))}<small>${esc(a.id)}</small></span></td><td>${esc(a.city)}</td>
        <td>${a.kind === "below" ? "Listing at or under" : "Buy order at or over"} ${full(a.price)}</td>
        <td class="num">${a.last != null ? full(a.last) : "–"}${a.hit ? `<br><strong class="good">Triggered</strong>` : ""}</td>
        <td><button class="btn ghost" type="button" data-adel="${i}">Remove</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted">No alerts yet.</p>`;
    $$("#al-list [data-adel]").forEach((b) => b.addEventListener("click", () => { alerts.splice(+b.dataset.adel, 1); store.set("alerts", alerts); drawAlerts(); }));
  }
  async function checkAlerts(manual = false) {
    if (!alerts.length) return;
    const status = $("#al-status");
    const byCity = {};
    alerts.forEach((a) => (byCity[a.city] = byCity[a.city] || new Set()).add(a.id));
    try {
      const rows = (await Promise.all(Object.entries(byCity).map(([c, ids]) => ABP.api.prices([...ids], [c], [1])))).flat();
      const idx = ABP.api.index(rows);
      const fired = [];
      for (const a of alerts) {
        const r = idx[a.id]?.[a.city];
        a.last = a.kind === "below" ? r?.sell || null : r?.buy || null;
        const hit = a.last != null && (a.kind === "below" ? a.last <= a.price : a.last >= a.price);
        if (hit && Date.now() - a.firedAt > 6 * 36e5) { fired.push(a); a.firedAt = Date.now(); }
        a.hit = hit;
      }
      store.set("alerts", alerts);
      for (const a of fired) await notify(`${itemLabel(a.id)} in ${a.city}`, `${a.kind === "below" ? "Listed at" : "Buy order at"} ${full(a.last)} silver (your alert: ${full(a.price)}).`);
      if (status) status.textContent = `Checked ${vanTime(new Date())}${fired.length ? ` · ${fired.length} triggered` : ""}`;
      const n = alerts.filter((a) => a.hit).length;
      const tab = $("#tab-market"); if (tab) tab.dataset.badge = n ? String(n) : "";
    } catch (e) { if (status && manual) status.textContent = e.message; }
    drawAlerts();
  }
  setTimeout(() => checkAlerts(false), 3000);
  setInterval(() => checkAlerts(false), 10 * 6e4);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkAlerts(false); });

  /* ---------- Change of pace: a method outside your path, for a short stint ---------- */
  let paceLast = null, paceReturn = null;
  function pickPace() {
    const prof = profileOf(plan.profile);
    let pool = ABP.METHODS.filter((m) => ABP.PACE[m.id] && !prof.methods.includes(m.id) && m.id !== paceLast);
    if (!pool.length) pool = ABP.METHODS.filter((m) => ABP.PACE[m.id] && m.id !== paceLast);
    const buf = new Uint32Array(1); crypto.getRandomValues(buf);
    return pool[buf[0] % pool.length];
  }
  function showPace() {
    const m = pickPace(); paceLast = m.id;
    const pc = ABP.PACE[m.id], prof = profileOf(plan.profile);
    const usual = [...new Set(prof.methods.map((id) => ABP.METHODS.find((x) => x.id === id)?.kind).filter(Boolean))];
    $("#pc-card").innerHTML = `
      <span class="label">Change of pace · ${esc(pc.length)}</span>
      <h2 id="pc-title">${esc(m.name)}</h2>
      <p>${esc(pc.hook)}</p>
      <p class="small muted">Your path (${esc(prof.name)}) is mostly ${esc(usual.join(", ").toLowerCase())}. This is ${esc(m.kind.toLowerCase())}, so it works different muscles while your island and focus keep earning.</p>
      <h4>Try it like this</h4>
      <ol class="pace-steps">${pc.plan.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      <div class="stats">
        <div class="stat"><span class="label">Typical income</span><span class="small">${esc(m.rate)}</span></div>
        <div class="stat"><span class="label">Money needed</span><span class="small">${esc(m.capital)}</span></div>
        <div class="stat"><span class="label">Risk</span><span class="small">${esc(m.risk || "–")}</span></div>
      </div>
      <div class="row"><button class="btn" type="button" id="pc-next">Another idea</button><button class="btn ghost" type="button" id="pc-open">Full playbook</button><button class="btn ghost" type="button" id="pc-close">Close</button></div>`;
    $("#pc-next").addEventListener("click", showPace);
    $("#pc-close").addEventListener("click", closePace);
    $("#pc-open").addEventListener("click", () => {
      closePace(); history.replaceState(null, "", "#methods"); show("methods");
      const t = $("#m-" + m.id); if (t) { t.open = true; t.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    $("#pc-next").focus();
  }
  function openPace() { paceReturn = document.activeElement; $("#pace").hidden = false; showPace(); }
  function closePace() { $("#pace").hidden = true; paceReturn?.focus?.(); }
  $("#paceOpen").addEventListener("click", openPace);
  $("#pace").addEventListener("click", (e) => { if (e.target.id === "pace") closePace(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#pace").hidden) closePace(); });

  /* ---------- Refresh everything: header button and pull down at the top of the page ---------- */
  let refreshing = false, lastRefresh = Date.now();
  async function refreshAll() {
    if (refreshing) return;
    refreshing = true; lastRefresh = Date.now();
    const btn = $("#refreshAll"); btn.disabled = true; btn.textContent = "Refreshing…";
    ABP.api.clearCache();
    const cur = TABS.find((t) => !$("#panel-" + t).hidden) || "plan";
    for (const t of TABS) rendered[t] = false;
    $("#panel-progress").dataset.ready = "";
    await refreshGold();
    show(cur);
    await checkAlerts(false);
    tickClock(); goalMeter();
    btn.disabled = false; btn.textContent = "Refresh";
    toast(`Updated ${vanTime(new Date())}`);
    refreshing = false;
  }
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200);
  }
  $("#refreshAll").addEventListener("click", refreshAll);
  /* Coming back to the app after 15 minutes or more refreshes everything, so what's on screen is never old prices. */
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastRefresh > 15 * 60 * 1000) refreshAll(); });
  (() => {
    let y0 = null, x0 = 0, dy = 0;
    const pull = document.createElement("div"); pull.className = "pull"; pull.textContent = "Pull to refresh"; document.body.appendChild(pull);
    const modalOpen = () => $$(".welcome-back").some((m) => !m.hidden);
    window.addEventListener("touchstart", (e) => { if (window.scrollY <= 0 && !modalOpen() && e.touches.length === 1) { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; } }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (Math.abs(e.touches[0].clientX - x0) > Math.abs(dy) || window.scrollY > 0) { y0 = null; pull.classList.remove("on"); return; }
      pull.classList.toggle("on", dy > 30);
      pull.textContent = dy > 90 ? "Release to refresh" : "Pull to refresh";
    }, { passive: true });
    window.addEventListener("touchend", () => { if (y0 != null && dy > 90) refreshAll(); y0 = null; pull.classList.remove("on"); }, { passive: true });
  })();

  const RENDER = { plan: renderPlan, picks: renderPicks, methods: renderMethods, market: renderMarket, calc: renderCalc, wiki: renderWiki, wealth: renderWealth, progress: renderProgress, tools: renderTools, times: renderTimes };
  tickClock();

  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { drawPlanChart(); if (!$("#panel-progress").hidden) renderProgress(); }, 150); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { drawPlanChart(); });

  goalMeter();
  const initial = (location.hash || "").slice(1) || store.get("tab", "plan");
  show(initial);
  if (welcome.show) openWelcome(false);
  ABP.api.itemNames().catch(() => {});
})();
