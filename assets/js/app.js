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
  const TABS = ["plan", "picks", "methods", "market", "calc", "wiki", "progress"];
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
  ABP.api.gold().then((rows) => {
    if (!rows?.length) return;
    const last = rows[rows.length - 1];
    goldRate.live = last.price; goldRate.liveAt = last.timestamp; store.set("gold", goldRate);
    setRate(goldRate.manual ? goldRate.rate : last.price, goldRate.manual);
  }).catch(() => {});
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



  /* ---------- Best picks ---------- */
  const assume = Object.assign({ plots: 8, perPlant: 9, seedReturn: 70 }, store.get("assume", {}));
  const PICKS = [
    { key: "crops", title: "Island: what to plant", how: "Ranked by profit per day across all your plots after seed costs, using the best city to sell in. A crop only counts as much as the market can absorb (half its daily sales), so a pricey crop nobody buys does not win.",
      run: () => ABP.advisor.crops({ plots: assume.plots, perPlant: assume.perPlant, seedReturn: assume.seedReturn / 100 }),
      line: (r) => `${fmt(r.daily)} a day · sells ${full(r.sell.sell)} in ${r.sell.city}`, name: (r) => `T${r.tier} ${r.name}`, link: ["market", "crops"] },
    { key: "refining", title: "Refining: what to spend focus on", how: "Every resource from T4 to T8 at .0 to .2 enchant, refined with focus in its bonus city. Focus cost comes from your refining spec (Calculators → Your spec). Ranked by what your 10,000 daily focus earns: the extra profit focus adds per refine, times how many refines your focus covers, capped at half of what the market sells per day.",
      run: () => ABP.advisor.refining(), line: (r) => `${fmt(r.score)} a day from focus · ${r.spf.toFixed(1)} silver per focus · ${r.city}`, name: (r) => r.label, link: ["calc"] },
    { key: "bm", title: "Black Market: what to flip", how: "All Black Market gear from T4 to T8 at .0 to .2. Only Black Market prices from the last 12 hours count. Ranked by profit per flip times how many the Black Market actually bought per day (up to 10).",
      run: () => ABP.advisor.blackMarket(), line: (r) => `${full(r.profit)} each · buy in ${r.src.city}`, name: (r) => r.label, link: ["market", "bm"] },
    { key: "flips", title: "Order flips: what to buy and relist", how: "Refined and raw resources (T4 to T8, .0 to .2), crops, herbs and common T4 to T6 gear in every city. Profit is the cheapest listing minus the top buy order after the 2.5% fee on both orders and the 4% tax. Ranked by that profit times a fifth of the daily sales, the share you can realistically fill. Items selling fewer than 5 a day are dropped.",
      run: () => ABP.advisor.flips(), line: (r) => `${full(r.profit)} each · ${pct(r.margin, 0)} · in ${r.city}`, name: (r) => r.label },
    { key: "journals", title: "Journals: which to fill", how: "Full journal sell price minus empty journal cost, after fees, in the best cities. Weighed down when fewer than 3 full journals sell per day.",
      run: () => ABP.advisor.journals(), line: (r) => `${full(r.profit)} per journal`, name: (r) => r.label },
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
    $("#pk-refresh").addEventListener("click", loadPicks);
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
  function loadPicks() {
    $("#pk-time").textContent = "Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    PICKS.forEach(loadPick);
  }
  async function loadPick(k) {
    const body = $(`#pk-${k.key} .pick-body`);
    body.innerHTML = `<p class="muted">Checking prices and sales…</p>`;
    try {
      const { rows } = await k.run();
      if (!rows.length) { body.innerHTML = `<p class="muted">Nothing clears a profit with fresh prices right now. ${esc(STATIC_WHY[k.key])}</p>`; return; }
      const [top, ...rest] = rows;
      body.innerHTML = `
        <div class="pick-top">
          <span class="label">Best pick</span>
          <h4>${esc(k.name(top))}</h4>
          <p class="pick-line">${esc(k.line(top))}</p>
          <ul class="why">${top.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>
        <ol class="runners" start="2">${rest.slice(0, 4).map((r) => `<li><details><summary><strong>${esc(k.name(r))}</strong> <span class="muted small">${esc(k.line(r))}</span></summary><ul class="why">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details></li>`).join("")}</ol>`;
    } catch (e) {
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
  const wheel = { rot: 0, spinning: false, tally: Object.assign({ yes: 0, no: 0 }, store.get("wheel", {})) };
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
    if (wheel.spinning) return;
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
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      wheel.rot = from + delta * (1 - Math.pow(1 - k, 4));
      drawWheel();
      if (k < 1) return requestAnimationFrame(tick);
      wheel.spinning = false; $("#wh-spin").disabled = false;
      wheel.tally[yes ? "yes" : "no"]++; store.set("wheel", wheel.tally); wheelTally();
      out.className = "wheel-result " + (yes ? "yes" : "no");
      out.textContent = yes ? "YES. The wheel has spoken." : NO_LINES[Math.floor(Math.random() * NO_LINES.length)];
    };
    requestAnimationFrame(tick);
  }
  let wheelReturn = null;
  function openWheel() {
    wheelReturn = document.activeElement;
    $("#wheel").hidden = false; drawWheel(); wheelTally(); $("#wh-spin").focus();
  }
  function closeWheel() { if (wheel.spinning) return; $("#wheel").hidden = true; wheelReturn?.focus?.(); }
  $("#wheelOpen").addEventListener("click", openWheel);
  $("#wh-spin").addEventListener("click", spinWheel);
  $("#wh-close").addEventListener("click", closeWheel);
  $("#wheel").addEventListener("click", (e) => { if (e.target.id === "wheel") closeWheel(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#wheel").hidden) closeWheel(); });

  const RENDER = { plan: renderPlan, picks: renderPicks, methods: renderMethods, market: renderMarket, calc: renderCalc, wiki: renderWiki, progress: renderProgress };

  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { drawPlanChart(); if (!$("#panel-progress").hidden) renderProgress(); }, 150); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { drawPlanChart(); });

  goalMeter();
  const initial = (location.hash || "").slice(1) || store.get("tab", "plan");
  show(initial);
  if (welcome.show) openWelcome(false);
  ABP.api.itemNames().catch(() => {});
})();
