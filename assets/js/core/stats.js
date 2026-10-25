/* Albion Billionaire v2 — small statistics kit: quantiles, robust scale, intervals, seeded random draws. */
window.AB = window.AB || {};

AB.stats = (() => {
  const finite = (a) => a.filter((x) => x != null && isFinite(x));
  const mean = (a) => { a = finite(a); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  function quantile(a, q) {
    a = finite(a).sort((x, y) => x - y);
    if (!a.length) return null;
    const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }
  /* The plain median (middle value, average of the two middles), matching numpy and pandas. */
  const median = (a) => quantile(a, 0.5);
  function sd(a) {
    a = finite(a);
    if (a.length < 2) return null;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
  }
  /* Median absolute deviation scaled to match a normal sd. */
  function mad(a) {
    a = finite(a);
    if (!a.length) return null;
    const m = median(a);
    return 1.4826 * median(a.map((x) => Math.abs(x - m)));
  }
  /* Linear interpolation of y at x over sorted xs. */
  function interp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let i = 1;
    while (xs[i] < x) i++;
    const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[i - 1] + t * (ys[i] - ys[i - 1]);
  }
  /* Wilson 95% interval for a share w/n. */
  function wilson(w, n, z = 1.96) {
    if (!n) return [0, 1];
    const p = w / n, d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n), s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    /* clamp: rounding can push the bounds a hair outside [0, 1] at 0 or n wins */
    return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
  }
  /* Seeded generator so a page shows the same simulation every time it renders. */
  function rng(seed = 1) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(r) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /* Draw from a distribution given by its quantiles (qs ascending in (0,1), zs the values), with linear tails. */
  function fromQuantiles(qs, zs, u) {
    if (u <= qs[0]) { const k = (zs[1] - zs[0]) / (qs[1] - qs[0]); return zs[0] - k * (qs[0] - u) * 1.5; }
    const n = qs.length - 1;
    if (u >= qs[n]) { const k = (zs[n] - zs[n - 1]) / (qs[n] - qs[n - 1]); return zs[n] + k * (u - qs[n]) * 1.5; }
    return interp(qs, zs, u);
  }
  /* Least squares slope and its standard error. */
  function slope(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = mean(xs), my = mean(ys);
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
    if (sxx < 1e-12) return null;
    const b = sxy / sxx;
    let r = 0;
    for (let i = 0; i < n; i++) r += (ys[i] - my - b * (xs[i] - mx)) ** 2;
    return { b, se: Math.sqrt(r / (n - 2) / sxx), a: my - b * mx };
  }
  return { finite, mean, median, quantile, sd, mad, interp, wilson, rng, normal, fromQuantiles, slope };
})();
