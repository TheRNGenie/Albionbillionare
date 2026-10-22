/* Albion Billionaire v2 — Alerts: price alerts on any item in any market, the player's island, laborer and focus
   timers with reminders, and each server's daily maintenance. The rules live in engine/alerts.js (when an alert
   fires) and core/clock.js (the timers and maintenance); this page sets them up and shows where each one stands. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.alerts = {
  title: "Alerts",
  render(root, { q = {} } = {}) {
    const { esc, icon, int, silver, toast, ago, bus } = AB.util;
    const ui = AB.ui, kit = AB.kit, store = AB.store, cat = AB.cat, clock = AB.clock, alerts = AB.alerts;
    const MAX = 50; // the most alerts the app keeps (store.js holds the same limit)
    const mode = AB.api.mode, live = mode === "live";
    /* a link from an item page (#/alerts?item=T6_BAG&city=Lymhurst) fills the form in */
    let picked = AB.util.isItem(q.item) ? q.item : null;
    const city0 = cat.MARKETS.includes(q.city) ? q.city : "Caerleon";
    const T = () => store.get("timers");
    const setT = (patch) => store.set("timers", { ...T(), ...patch });
    const remind = T().remind;
    const desk = !!window.albionDesktop;
    let alive = true, perm = null;

    const checkSub = live
      ? "Checked against live prices when they load and every 10 minutes while the app is open. An alert fires when a price seen in the last 48 hours meets it, then at most once every 6 hours while it stays met."
      : store.get("dataMode") === "snapshot"
        ? "Alerts need live prices, and Settings has prices on Snapshot only. Switch to Automatic there to have them checked."
        : mode === "loading"
          ? "Alerts are checked as soon as live prices load."
          : "Alerts need live prices. The price server isn't answering right now, so they're checked as soon as it does.";
    const timerField = (k, label, now, hint) => `<div class="field al-timer">
        <span>${label}</span>
        <div class="row"><button class="btn sm" type="button" data-now="${k}">${icon("check")}${now}</button><button class="link-btn small" type="button" data-clear="${k}">Clear</button></div>
        <label class="al-ago"><span>or</span><input class="input num" type="number" min="0" max="72" step="0.5" inputmode="decimal" data-ago="${k}" aria-label="${esc(label)}: hours ago"><span>hours ago</span></label>
        <span class="hint">${hint}</span>
      </div>`;
    const box = (k, label) => `<label class="check"><input type="checkbox" data-remind="${k}" ${remind[k] ? "checked" : ""}> ${label}</label>`;

    root.innerHTML = `
      ${kit.head({ eyebrow: "Alerts", title: "Alerts and timers", sub: "Hear when a price crosses your line, when your island and laborers are ready, when focus is about to overflow, and before the server goes down for maintenance.", right: '<span id="al-perm" class="al-perm"></span>' })}
      <div class="grid">
        ${ui.card({ span: 12, title: "Price alerts", sub: esc(checkSub), actions: `<button class="btn sm" type="button" id="al-check">${icon("refresh")}Check now</button>`, body: `
          <form class="al-form" id="al-form" novalidate>
            <div class="field al-f-item">
              <span id="al-item-l">Item</span>
              <div class="search wide">${icon("search")}<input id="al-item" type="search" placeholder="Search: t6 bag, claymore, relic…" autocomplete="off" spellcheck="false" role="combobox" aria-labelledby="al-item-l" aria-describedby="al-picked" aria-controls="al-results" aria-expanded="false" aria-autocomplete="list" value="${picked ? esc(cat.label(picked)) : ""}"><div class="search-list" id="al-results" role="listbox" aria-label="Matching items" hidden></div></div>
              <span class="hint num" id="al-picked"></span>
            </div>
            <label class="field"><span>Market</span><select class="select" id="al-city">${cat.MARKETS.map((c) => `<option ${c === city0 ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><span class="hint" id="al-city-h"></span></label>
            <label class="field"><span>Tell me when</span><select class="select" id="al-kind"><option value="below">the cheapest listing drops to</option><option value="above">the best buy order reaches</option></select><span class="hint"></span></label>
            <label class="field"><span>Price</span><input class="input num" id="al-price" type="number" min="1" step="1" inputmode="numeric" placeholder="silver"><span class="hint num" id="al-echo"></span></label>
            <div class="field al-f-add"><span aria-hidden="true">&nbsp;</span><button class="btn primary" type="submit">${icon("plus")}Add alert</button></div>
          </form>
          <p class="small muted al-usual" id="al-usual" aria-live="polite"></p>
          <div id="al-list"></div>` })}
        ${ui.card({ span: 7, title: "Your timers", sub: "Tell the app when you plant and send laborers out, and what your focus is. It counts down and reminds you.", body: `
          <div class="kpis three" id="al-clock"></div>
          <hr>
          <div class="form-grid al-timers">
            ${timerField("planted", "Island crops and herbs", "Planted just now", "They grow in 22 hours. Type how long ago if you planted earlier.")}
            ${timerField("laborers", "Laborers", "Sent out just now", "They come back 22 hours after you hand in full journals.")}
            <label class="field"><span>Focus now</span><input class="input num" type="number" min="0" max="${clock.FOCUS_MAX}" step="1" inputmode="numeric" id="al-focus" placeholder="e.g. 21000"><span class="hint">It refills ${esc(int(store.get("focus")))} a day (Focus a day in <a href="#/settings">Settings</a>), up to ${esc(int(clock.FOCUS_MAX))}. Update it after you spend some.</span></label>
          </div>
          <fieldset class="al-remind"><legend>Remind me</legend>
            ${box("harvest", "when the crops are ready")}
            ${box("laborers", "when the laborers are back")}
            ${box("focus", "when focus is nearly full (95%)")}
            ${box("reset", "30 minutes before maintenance on my server")}
          </fieldset>
          <p class="small al-next" id="al-next"></p>` })}
        ${ui.card({ span: 5, title: "Server maintenance", sub: "Each server goes down once a day. The server day, daily bonuses and challenges roll over then.", body: '<div id="al-maint"></div>', foot: `Times from the <a href="${esc(clock.SOURCE.url)}" target="_blank" rel="noopener">${esc(clock.SOURCE.label)}</a> (October 2026): usually 5 to 15 minutes, now and then about 25. Maintenance is at a fixed time in UTC, so on your own clock it moves by an hour when daylight saving starts or ends.` })}
      </div>`;

    const $ = (s) => root.querySelector(s);
    const form = $("#al-form"), itemIn = $("#al-item"), citySel = $("#al-city"), kindSel = $("#al-kind"), priceIn = $("#al-price");

    /* ---------- notifications on or off ---------- */
    async function drawPerm() {
      perm = await AB.notify.permission();
      if (!alive) return;
      $("#al-perm").innerHTML = perm === "granted" ? ui.tag("Notifications on", "bell")
        : perm === "default" ? `<button class="btn" type="button" id="al-ask">${icon("bell")}Turn on notifications</button>`
          : ui.tag(perm === "denied" ? "Notifications blocked" : "No notifications here", "bell", "tag-off");
      drawNext();
    }
    async function askPerm() {
      const ok = await AB.notify.ask();
      if (ok) { AB.app.reschedule(); toast("Notifications on."); }
      else toast("Notifications stay off. You can allow them later in your browser or phone settings.");
      drawPerm();
      return ok;
    }

    /* ---------- the alert form ---------- */
    const kind = () => (citySel.value === cat.BM ? "above" : kindSel.value);
    function drawPicked() {
      $("#al-picked").textContent = picked ? `${picked} · normal quality` : "Type a name, then pick from the list.";
    }
    /* The Black Market has no listings to buy from, only buy orders: its alerts can only watch those. */
    function drawKind() {
      const bm = citySel.value === cat.BM;
      kindSel.querySelector('[value="below"]').disabled = bm;
      if (bm) kindSel.value = "above";
      $("#al-city-h").textContent = bm ? "Only its buy orders can be watched." : "";
    }
    let usualSeq = 0, usual = null;
    async function lookUsual() {
      const seq = ++usualSeq;
      usual = null;
      if (!picked || !AB.state.M) return drawUsual(); // without market data yet, the page draws again once it loads
      $("#al-usual").textContent = "Looking up the usual price…";
      let r = null;
      try { r = await alerts.usual(picked, citySel.value); } catch (e) { r = null; }
      if (!alive || seq !== usualSeq) return;
      usual = r;
      drawUsual();
    }
    function drawUsual() {
      const el = $("#al-usual"), city = citySel.value, bm = city === cat.BM;
      if (!picked) { el.textContent = ""; return; }
      if (!usual) { el.textContent = AB.state.M ? `No recent sales of this item ${bm ? "at the Black Market" : `in ${city}`} to suggest a price from.` : ""; return; }
      const above = kind() === "above";
      const v = Math.round(above ? usual.mid : usual.lo);
      const range = `${esc(silver(usual.lo))}–${esc(silver(usual.hi))}`;
      el.innerHTML = `${bm ? `The Black Market usually pays ${range}` : `Usually sells for ${range} in ${esc(city)}`} (the 80% range for today, from four weeks of sales). <button class="link-btn" type="button" data-use="${v}">Use ${esc(int(v))}</button>, ${above ? "the middle, to hear when a buy order pays the going rate." : "the low end, to hear of a bargain."}`;
    }
    const picker = ui.picker(itemIn, $("#al-results"), (id) => {
      picked = id;
      itemIn.value = cat.label(id);
      drawPicked();
      lookUsual();
      priceIn.focus();
    });
    /* typing over a picked item un-picks it, so the alert can't go to an item the box no longer shows */
    itemIn.addEventListener("input", () => { if (picked && itemIn.value !== cat.label(picked)) { picked = null; drawPicked(); drawUsual(); } });
    citySel.addEventListener("change", () => { drawKind(); lookUsual(); });
    kindSel.addEventListener("change", drawUsual);
    priceIn.addEventListener("input", () => { const v = +priceIn.value; $("#al-echo").textContent = v > 0 ? `= ${silver(v)} silver` : ""; });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const city = citySel.value, k = kind(), price = Math.round(+priceIn.value);
      if (!picked) { toast("Pick an item from the list first."); itemIn.focus(); return; }
      if (!(price > 0)) { toast("Type the price to watch for."); priceIn.focus(); return; }
      const list = store.get("alerts");
      if (list.some((a) => a.id === picked && a.city === city && a.kind === k && a.price === price)) { toast("You already have that alert."); return; }
      if (list.length >= MAX) { toast(`That's ${MAX} alerts, the most the app keeps. Delete one first.`); return; }
      store.set("alerts", [...list, { id: picked, city, kind: k, price, t: Date.now(), firedAt: 0, last: null, seen: null, checked: null, hit: false }]);
      priceIn.value = "";
      $("#al-echo").textContent = "";
      drawList();
      if (live) { toast("Alert added. Checking it now."); runCheck(false); }
      else toast("Alert added. It's checked when live prices load.");
      if (perm === "default") askPerm();
    });

    /* ---------- the list ---------- */
    function drawList() {
      const list = store.get("alerts"), now = Date.now();
      $("#al-check").disabled = !live || !list.length;
      $("#al-check").title = live ? "" : "Alerts need live prices";
      $("#al-list").innerHTML = list.length ? `<div class="table-wrap"><table class="t al-table"><thead><tr><th>Alert</th><th>Status</th><th><span class="sr-only">Delete</span></th></tr></thead><tbody>${list.map((a, i) => {
        const above = a.kind === "above", hit = alerts.met(a, now);
        const stale = a.seen != null && now - a.seen > alerts.FRESH_H * 36e5;
        const seen = a.checked == null ? "not checked yet"
          : a.last == null ? (above ? "no buy order" : "no listing")
            : `${hit ? "at" : "last"} ${int(a.last)}, ${ago(now - a.seen)}${stale ? ", too old to count" : ""}`;
        return `<tr${hit ? ' class="al-hit"' : ""}>
          <td><a class="al-link" href="#/markets/${encodeURIComponent(a.id)}">${ui.item(a.id, { sub: `${esc(a.city)} · ${above ? "buy order ≥" : "listing ≤"} <span class="num">${esc(int(a.price))}</span>`, small: true })}</a></td>
          <td>${hit ? `<span class="pill-hit">${icon("check")}Met</span>` : `<span class="al-wait">Waiting</span>`}<div class="small muted num">${esc(seen)}</div></td>
          <td class="r"><button class="icon-btn sm" type="button" data-del-alert="${i}" aria-label="Delete the alert on ${esc(cat.label(a.id))} in ${esc(a.city)}">${icon("trash")}</button></td></tr>`;
      }).join("")}</tbody></table></div>` : ui.empty("No price alerts yet. Pick an item above, or press Alert on any item in Markets.", "bell");
    }
    async function runCheck(say) {
      const b = $("#al-check");
      b.disabled = true;
      try {
        const r = await alerts.check({ force: true });
        if (!say) return;
        if (!r) toast("No alerts to check.");
        else if (r.live === false) toast("Alerts need live prices, and the app is on the saved snapshot.");
        else if (!r.fired) toast(`Checked ${r.checked} alert${r.checked === 1 ? "" : "s"}. ${r.met ? `${r.met} met, already told.` : "None met yet."}`);
      } catch (e) { toast(`Couldn't check: ${e.message || "the price server didn't answer"}`); }
      finally { if (alive) drawList(); }
    }
    $("#al-check").addEventListener("click", () => runCheck(true));

    /* ---------- timers ---------- */
    function drawClock() {
      const t = T(), now = Date.now(), perDay = store.get("focus");
      const unsetV = '<span class="al-unset">Not set</span>';
      const tile = (label, at, done, unset) => at == null ? ui.kpi({ label, value: unsetV, range: unset })
        : at <= now ? ui.kpi({ label, value: done, range: `since ${esc(clock.local(at, now))}` })
          : ui.kpi({ label, value: esc(clock.until(at - now)), range: `${done.toLowerCase()} ${esc(clock.local(at, now))}` });
      const f = clock.focusNow(t, perDay, now), full = clock.focusAt(t, perDay, now);
      $("#al-clock").innerHTML = tile("Island harvest", clock.harvestAt(t), "Ready", "Press Planted just now when you plant.")
        + tile("Laborers", clock.laborersAt(t), "Back", "Press Sent out just now when they go.")
        + ui.kpi({
          label: "Focus", value: f == null ? unsetV : esc(int(f)),
          range: f == null ? "Type what you have below." : f >= clock.FOCUS_MAX ? "Full: the refill is going to waste." : full != null ? `full ${esc(clock.local(full, now))}, in ${esc(clock.until(full - now))}` : "Doesn't refill: Focus a day is 0 in Settings.",
        });
    }
    function drawNext() {
      const now = Date.now();
      const n = clock.reminders(T(), { server: store.get("server"), perDay: store.get("focus"), now })[0];
      const where = perm === "granted" ? (AB.notify.native ? "Your phone shows reminders even when the app is closed." : desk ? "The Windows app shows reminders while it runs, minimised too; closing it stops them." : "This tab shows reminders while it's open; closing it stops them.")
        : perm === "default" ? "Turn on notifications (top of the page) to get reminders outside the app."
          : perm === "denied" ? "Notifications are blocked for this app, so reminders show only as messages while it's open. You can allow them in your browser or phone settings."
            : perm === "unsupported" ? "This browser can't show notifications, so reminders show as messages while the app is open." : "";
      $("#al-next").innerHTML = `${n ? `Next reminder: <b>${esc(n.title)}</b>, ${esc(clock.local(n.at, now))} (in ${esc(clock.until(n.at - now))}).` : "No reminder coming up. Set a timer and tick what you want to hear about."} <span class="muted">${esc(where)}</span>`;
    }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !root.contains(b)) return;
      if (b.id === "al-ask") askPerm();
      else if (b.dataset.use) { priceIn.value = b.dataset.use; priceIn.dispatchEvent(new Event("input")); priceIn.focus(); }
      else if (b.dataset.delAlert != null) {
        const i = +b.dataset.delAlert, a = store.get("alerts")[i];
        if (!a) return;
        store.set("alerts", store.get("alerts").filter((_, j) => j !== i));
        toast(`Alert on ${cat.label(a.id)} deleted.`);
        drawList();
        $("#al-list").querySelector("button[data-del-alert]")?.focus();
      } else if (b.dataset.now) { setT({ [b.dataset.now]: Date.now() }); clearAgo(b.dataset.now); drawTimers(); toast(b.dataset.now === "planted" ? "Crops planted. Ready in 22 hours." : "Laborers out. Back in 22 hours."); }
      else if (b.dataset.clear) { setT({ [b.dataset.clear]: null }); clearAgo(b.dataset.clear); drawTimers(); }
    });
    const clearAgo = (k) => { const el = root.querySelector(`[data-ago="${k}"]`); if (el) el.value = ""; };
    root.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.ago) {
        const h = +el.value;
        if (el.value === "" || !(h >= 0)) return;
        setT({ [el.dataset.ago]: Date.now() - Math.min(72, h) * 36e5 });
        drawTimers();
      } else if (el.id === "al-focus") {
        const v = +el.value;
        if (el.value === "" || !(v >= 0)) return;
        setT({ focus: Math.min(clock.FOCUS_MAX, Math.round(v)), focusAt: Date.now() });
        drawTimers();
      } else if (el.dataset.remind) {
        setT({ remind: { ...T().remind, [el.dataset.remind]: el.checked } });
        drawNext();
        if (el.checked && perm === "default") askPerm();
      }
    });
    const drawTimers = () => { drawClock(); drawNext(); };

    /* ---------- maintenance ---------- */
    function drawMaint() {
      const now = Date.now(), mine = store.get("server");
      $("#al-maint").innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th>Server</th><th>Starts</th><th class="r">In</th></tr></thead><tbody>${cat.SERVERS.map((s) => {
        const r = clock.nextReset(s.id, now), me = s.id === mine;
        return `<tr${me ? ' class="al-mine"' : ""}><td><b>${esc(s.label)}</b>${me ? ` ${ui.tag("yours")}` : ""}</td>
          <td class="num">${esc(clock.utc(r.at))}<div class="small muted">${esc(clock.local(r.at, now))} your time</div></td>
          <td class="r num">${r.down ? `<b>Down now</b><div class="small muted">back about ${esc(clock.utc(r.back))}</div>` : esc(clock.until(r.at - now))}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    }

    drawPicked();
    drawKind();
    drawList();
    drawTimers();
    drawMaint();
    drawPerm();
    if (picked) lookUsual();
    const offTick = bus.on("tick", () => { drawTimers(); drawMaint(); });
    const offAlerts = bus.on("alerts", drawList);
    return () => { alive = false; offTick(); offAlerts(); picker.off(); };
  },
};
