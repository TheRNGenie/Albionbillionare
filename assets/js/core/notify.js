/* Albion Billionaire v2 — notifications. The Android app schedules real notifications with the system, so timer
   reminders arrive even when the app is closed. The Windows app and browsers show them while the app is open (the
   Windows app keeps running when minimised). Where notifications are off or missing, an in-app message stands in. */
window.AB = window.AB || {};

AB.notify = (() => {
  const LN = () => AB.util.nativePlugin("LocalNotifications");
  const web = () => (typeof window.Notification === "function" ? window.Notification : null);
  /* Android notification ids: one per timer, a week of maintenance reminders, and one per price alert. */
  const IDS = { harvest: 7101, laborers: 7102, focus: 7103 };
  const RESET_ID = 7110, ALERT_ID = 7200;
  const idOf = (key) => IDS[key] ?? (key.startsWith("reset") ? RESET_ID + (+key.slice(5) || 0) : null);
  const ALL = [...Object.values(IDS), ...Array.from({ length: 7 }, (_, i) => RESET_ID + i)];
  /* Android: a notification asks for an exact alarm unless told not to, and without that permission (the default
     since Android 14) every schedule call would open the system's "Alarms & reminders" screen. A reminder that lands
     a few minutes late is fine, so none of them ask. */
  const note = (n) => ({ ...n, isExactNotification: false });

  /* "granted", "denied", "default" (not asked yet) or "unsupported". */
  async function permission() {
    try {
      const ln = LN();
      if (ln) { const p = await ln.checkPermissions(); return p.display === "granted" ? "granted" : p.display === "denied" ? "denied" : "default"; }
      const N = web();
      return N ? N.permission : "unsupported";
    } catch (e) { return "unsupported"; }
  }
  /* Ask once; true when notifications may be shown. */
  async function ask() {
    try {
      const ln = LN();
      if (ln) return (await ln.requestPermissions()).display === "granted";
      const N = web();
      if (!N) return false;
      if (N.permission === "default") await N.requestPermission();
      return N.permission === "granted";
    } catch (e) { return false; }
  }
  /* Show one now. Returns true when the system showed it; the app shows a toast too while it's on screen. Clicking it
     (browsers and the Windows app) brings the app forward on the Alerts page. */
  async function send(title, body, { id = ALERT_ID } = {}) {
    if (typeof document !== "undefined" && document.visibilityState === "visible") AB.util.toast(`${title}: ${body}`, 6000);
    try {
      const ln = LN();
      if (ln) {
        if ((await ln.checkPermissions()).display !== "granted") return false;
        await ln.schedule({ notifications: [note({ id, title, body })] });
        return true;
      }
      const N = web();
      if (N && N.permission === "granted") {
        const n = new N(title, { body, tag: String(id) });
        n.onclick = () => { window.focus(); location.hash = "#/alerts"; n.close?.(); };
        return true;
      }
    } catch (e) { /* the toast above is the fallback */ }
    return false;
  }

  /* Replace every scheduled reminder with `list` ([{ key, at, title, body }]). On Android the system holds them; here
     they wait in timers while the app is open (a timer can't wait longer than about 24 days, so later ones wait for
     the next reschedule). */
  const pending = [];
  async function schedule(list) {
    pending.splice(0).forEach(clearTimeout);
    const ln = LN();
    if (ln) {
      try {
        await ln.cancel({ notifications: ALL.map((id) => ({ id })) });
        const items = list.map((r) => note({ id: idOf(r.key), title: r.title, body: r.body, schedule: { at: new Date(r.at), allowWhileIdle: true } })).filter((n) => n.id != null);
        if (items.length && (await ln.checkPermissions()).display === "granted") await ln.schedule({ notifications: items });
      } catch (e) { /* notifications are off */ }
      return;
    }
    for (const r of list) {
      const wait = r.at - Date.now();
      if (wait > 0 && wait < 2 ** 31 - 1) pending.push(setTimeout(() => send(r.title, r.body, { id: idOf(r.key) ?? ALERT_ID }), wait));
    }
  }

  return { permission, ask, send, schedule, ALERT_ID, get native() { return !!LN(); } };
})();
