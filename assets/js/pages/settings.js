/* Albion Billionaire v2 — Settings: server and premium, your silver, your gear, data source, display and backups. */
window.AB = window.AB || {};
AB.pages = AB.pages || {};

AB.pages.settings = {
  title: "Settings",
  render(root) {
    const { esc, icon, silver, int, toast, ago } = AB.util;
    const ui = AB.ui, kit = AB.kit, store = AB.store, cat = AB.cat;
    const g = (k) => store.get(k);
    const MONEY = new Set(["netWorth", "capital", "goal"]);
    const num = (label, k, step, hint = "", min = 0) => `<label class="field"><span>${esc(label)}</span><input class="input num" type="number" min="${min}" step="${step}" data-k="${k}" value="${esc(g(k))}">${MONEY.has(k) ? `<span class="hint num" data-echo="${k}">= ${esc(silver(g(k)))}</span>` : ""}${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
    const spec = g("refineSpec") || {};
    const desk = !!window.albionDesktop;

    root.innerHTML = `
      ${kit.head({ eyebrow: "Settings", title: "Settings", sub: "Everything here stays in this browser. Changes re-score every play at once." })}
      <div class="grid">
        ${ui.card({ span: 6, cls: "set-group", title: "Game", body: `<div class="form-grid">
          <label class="field"><span>Server</span><select class="select" data-k="server">${cat.SERVERS.map((s) => `<option value="${s.id}" ${g("server") === s.id ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select><span class="hint">Prices and the snapshot are per server; the snapshot and research are from the Americas.</span></label>
          <label class="field"><span>Premium</span><span class="check"><input type="checkbox" data-k="premium" ${g("premium") ? "checked" : ""}> I have premium (4% sales tax instead of 8%)</span></label>
        </div>` })}
        ${ui.card({ span: 6, cls: "set-group", title: "Your silver", body: `<div class="form-grid">
          ${num("Net worth", "netWorth", 1e6)}${num("Trading capital", "capital", 1e6, "Silver you'll put into plays. Batch sizes use up to 35% of it per play.")}
          ${num("Goal", "goal", 1e8)}
          <label class="field"><span>Deadline</span><input class="input" type="date" data-k="deadline" value="${esc(g("deadline"))}"></label>
          ${num("Hours a day", "hours", 0.5, "", 0.5)}
        </div>` })}
        ${ui.card({ span: 6, cls: "set-group", title: "Your gear and focus", body: `<div class="form-grid">
          ${num("Mount carry weight (kg)", "mountKg", 50, "Caps haul batch sizes.")}
          ${num("Focus a day", "focus", 500, "Premium gives 10,000. Caps refining batches.")}
        </div><hr><p class="small">Refining focus efficiency from your Destiny Board (each 10,000 halves the focus a refine costs):</p><div class="form-grid">${cat.RESOURCES.map((r) => `<label class="field"><span>${esc(r.refinedName)}</span><input class="input num" type="number" min="0" max="60000" step="250" data-spec="${r.key}" value="${esc(spec[r.key] || 0)}"></label>`).join("")}</div>` })}
        ${ui.card({ span: 6, cls: "set-group", title: "Data and display", body: `
          <div class="field"><span>Prices</span>${ui.seg("dataMode", [["auto", "Automatic"], ["live", "Live only"], ["snapshot", "Snapshot only"]], g("dataMode"), "Data source")}<span class="hint">Automatic uses live prices when the server answers and the saved snapshot when it doesn't.</span></div>
          <div class="field" style="margin-top:12px"><span>Theme</span>${ui.seg("theme", [["auto", "Match device"], ["light", "Light"], ["dark", "Dark"]], g("theme"), "Theme")}</div>
          <div class="row" style="margin-top:14px"><button class="btn" type="button" id="s-clear">${icon("refresh")}Clear cached prices</button><span class="small muted">${AB.api.calls} price requests this session.</span></div>` })}
        ${desk ? ui.card({ span: 12, cls: "set-group", title: "Windows app", body: `<div id="s-desk" class="stack"><p class="small">Loading the Albion Data Client link…</p></div>` }) : ""}
        ${ui.card({ span: 12, cls: "set-group", title: "Backup and reset", body: `<div class="row"><button class="btn" type="button" id="s-export">${icon("download")}Save a backup</button><label class="btn">${icon("upload")}Restore a backup<input type="file" accept="application/json,.json" id="s-import" hidden></label><button class="btn ghost" type="button" id="s-reset">${icon("trash")}Reset settings</button></div><p class="small muted" style="margin-top:10px">Albion Billionaire v2 keeps its own settings and ledger, separate from the original app.</p>` })}
        ${ui.card({ span: 12, cls: "set-group", title: "About", body: `<p class="small">Albion Billionaire v2. Prices from the <a href="https://www.albion-online-data.com/" target="_blank" rel="noopener">Albion Online Data Project</a>; item data from <a href="https://github.com/ao-data/ao-bin-dumps" target="_blank" rel="noopener">ao-bin-dumps</a>. Profit ranges and odds are estimates calibrated on past prices; check the order book in game before you commit silver. Not affiliated with Sandbox Interactive.</p>` })}
      </div>`;

    root.addEventListener("input", (e) => {
      const echo = e.target.dataset.k && root.querySelector(`[data-echo="${e.target.dataset.k}"]`);
      if (echo) echo.textContent = `= ${silver(+e.target.value || 0)}`;
    });
    root.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.spec) { store.set("refineSpec", { ...(store.get("refineSpec") || {}), [el.dataset.spec]: Math.max(0, +el.value || 0) }); return; }
      const k = el.dataset.k;
      if (!k) return;
      if (el.type === "checkbox") return store.set(k, el.checked);
      if (el.type === "number") { const v = +el.value; if (v > 0 || (v === 0 && k === "netWorth")) store.set(k, v); return; }
      if (k === "deadline" && !/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return;
      store.set(k, el.value);
    });
    ui.onSeg(root, "dataMode", (v) => store.set("dataMode", v));
    ui.onSeg(root, "theme", (v) => store.set("theme", v));
    root.querySelector("#s-clear").addEventListener("click", async () => { await AB.api.clear(); toast("Cached prices cleared."); });
    root.querySelector("#s-export").addEventListener("click", () => AB.util.saveFile(`albion-billionaire-v2-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportAll()).catch((e) => toast(e.message || "The backup couldn't be saved.")));
    root.querySelector("#s-import").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try { store.importAll(await f.text()); toast("Backup restored."); AB.app.rerender(); } catch (err) { toast(err.message || "That file couldn't be read."); }
    });
    root.querySelector("#s-reset").addEventListener("click", () => {
      ui.ask({
        title: "Reset settings?", ok: "Reset", html: `<p>Server, premium, your silver, gear and display go back to their defaults, and the deadline moves to a year from today. Your ledger and watchlist stay.</p>`,
        onOk: () => { store.reset(); toast("Settings reset."); AB.app.rerender(); },
      });
    });

    if (desk) {
      const box = root.querySelector("#s-desk");
      const draw = async () => {
        let s;
        try { s = await window.albionDesktop.status(); } catch (e) { box.innerHTML = `<p class="small">The Data Client link isn't available: ${esc(e.message)}</p>`; return; }
        box.innerHTML = `<p class="small">Run the official Albion Data Client through this app and its market scans reach you first: prices you see in game become the freshest prices here.</p>
          <dl class="kv"><dt>Listening</dt><dd>${s.listening ? "yes" : "no"}${s.error ? ` (${esc(s.error)})` : ""}</dd><dt>Data Client</dt><dd>${s.running ? "running" : s.clientPath ? "found, not running" : "not found"}</dd><dt>Prices captured</dt><dd>${int(s.count)}${s.lastAt ? `, last ${esc(ago(Date.now() - s.lastAt))}` : ""}</dd></dl>
          <div class="row"><button class="btn" type="button" id="s-dc">${icon("bolt")}${s.running ? "Running" : "Start the Data Client"}</button><button class="btn ghost" type="button" id="s-upd">${icon("download")}Check for updates</button></div>`;
        box.querySelector("#s-dc").addEventListener("click", async () => { try { const r = await window.albionDesktop.startClient(!s.clientPath); if (r && r.error) toast(r.error); } catch (e) { toast(e.message); } setTimeout(draw, 1200); });
        box.querySelector("#s-upd").addEventListener("click", async () => {
          try {
            const u = await window.albionDesktop.checkUpdate();
            if (!u.latest) toast("No v2 builds published yet.");
            else if (!u.newer) toast(`You have the newest build (${u.current}).`);
            else if (u.portable || !u.url) { toast(`Build ${u.latest} is out. Opening its page.`); window.albionDesktop.openPage(u.page); }
            else {
              const btn = box.querySelector("#s-upd");
              window.albionDesktop.onUpdateProgress?.((p) => { btn.textContent = p.total ? `Downloading… ${Math.floor((p.got / p.total) * 100)}%` : `Downloading… ${(p.got / 1e6).toFixed(1)} MB`; });
              toast(`Downloading build ${u.latest}…`);
              await window.albionDesktop.installUpdate(u.url);
            }
          } catch (e) { toast(e.message); }
        });
      };
      draw();
    }
  },
};
