"""Albion Billionaire v2: turn the saved daily price history into the study results the app ships with.

Usage:  python3 tools/v2/build_insights.py [data/history] [assets/data/v2]

Reads data/history/*.csv.gz (item, location, date, count, avg_price: the Albion Online Data Project's daily
history for the Americas server, collected by tools/fetch_history.py) and writes:

  insights.json  what the app's Lab and Trust pages show, and the calibrated models its confidence engine uses:
                 price-range model (quantiles of the forecast error, tested on held-out months), haul survival odds,
                 dip and spike rebounds, weekday effects (with the out-of-sample test that shows which are noise),
                 the Black Market premium, a fixed-base price index, the enchant-and-sell backtest, raw->refined lead/lag.
  snapshot.json  the last 28 days of daily prices and sales for the items the strategy scanners use, so the app
                 still works (clearly marked as a snapshot) when the live price server can't be reached.

Every number is computed from the files; nothing is typed in by hand. Runs in about a minute.
"""
import datetime
import glob
import json
import os
import re
import sys
import warnings
from statistics import NormalDist

import numpy as np
import pandas as pd

SRC = sys.argv[1] if len(sys.argv) > 1 else "data/history"
OUT = sys.argv[2] if len(sys.argv) > 2 else "assets/data/v2"
ROYAL = ["Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford"]
FEE = 0.065                      # 4% premium sales tax + 2.5% listing fee
LFEE = float(np.log(1 / (1 - FEE)))
LIQ_EDGES = [5, 20, 100]         # median daily sales over 14 days: <5, 5-20, 20-100, 100+
LIQ = ["<5", "5-20", "20-100", "100+"]
REFINED = ("LEATHER", "CLOTH", "METALBAR", "PLANKS", "STONEBLOCK")
RAW = ("HIDE", "ORE", "WOOD", "FIBER", "ROCK")
ENCH = ("RUNE", "SOUL", "RELIC")
QS = [0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.975]
VOL_EDGES = [0.04, 0.08, 0.15, 0.3]  # the 14-day scale of log prices: very steady, steady, normal, jumpy, wild
VOL = ["<0.04", "0.04-0.08", "0.08-0.15", "0.15-0.3", "0.3+"]
MIN_CELL = 400                   # training errors a (horizon, liquidity, volatility) cell needs for its own quantiles


def family(item):
    f = re.sub(r"^T\d_", "", item)
    f = re.sub(r"@\d$", "", f)
    return re.sub(r"_LEVEL\d$", "", f)


def kind_of(item):
    f = family(item)
    if f in REFINED:
        return "refined"
    if f in RAW:
        return "raw"
    if f in ENCH:
        return "enchant"
    return "gear"


def rnd(x, d=4):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return None
    return round(float(x), d)


def liq_bucket(v):
    return np.digitize(v, LIQ_EDGES)  # 0..3, NaN -> 4 (filtered by callers)


def sliding(a, w):
    """Trailing windows along the day axis: out[..., t, :] covers days t-w+1..t (padded with NaN at the start)."""
    pad = np.full(a.shape[:-1] + (w - 1,), np.nan)
    return np.lib.stride_tricks.sliding_window_view(np.concatenate([pad, a], axis=-1), w, axis=-1)


def nanmedian_w(a, w, min_n):
    win = sliding(a, w)
    n = np.sum(~np.isnan(win), axis=-1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # all-NaN windows
        m = np.nanmedian(win, axis=-1)
    m[n < min_n] = np.nan
    return m, n


def load():
    frames = []
    for f in sorted(glob.glob(os.path.join(SRC, "*.csv.gz"))):
        df = pd.read_csv(f)
        df["src"] = os.path.basename(f)
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    # the same item can appear in two files; keep one row per item, market and day
    df = df.sort_values("src").drop_duplicates(["item", "location", "date"], keep="first")
    df = df[(df["count"] > 0) & (df["avg_price"] > 0)].copy()
    df["date"] = pd.to_datetime(df["date"])
    return df


def dense(df):
    """Series x day matrices of log price and sales count (NaN when nothing sold)."""
    days = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    keys = df[["item", "location"]].drop_duplicates().sort_values(["item", "location"]).reset_index(drop=True)
    key_idx = {(a, b): i for i, (a, b) in enumerate(zip(keys["item"], keys["location"]))}
    S, D = len(keys), len(days)
    lp = np.full((S, D), np.nan)
    cnt = np.full((S, D), np.nan)
    si = np.array([key_idx[(a, b)] for a, b in zip(df["item"], df["location"])])
    di = ((df["date"] - days[0]).dt.days).to_numpy()
    lp[si, di] = np.log(df["avg_price"].to_numpy())
    cnt[si, di] = df["count"].to_numpy()
    keys["kind"] = keys["item"].map(kind_of)
    return keys, days, lp, cnt


# ---------------------------------------------------------------- price-range model (the confidence engine's core)
def price_model(keys, days, lp, cnt):
    """Forecast = median log price of the last 7 days; scale = 1.4826 x median absolute deviation over the last
    14 days. The error, in units of that scale, is collected for 1, 3 and 7 days ahead, split by liquidity and by
    the scale itself: steady series have fat tails in scale units and wild ones thin tails, so a single table would
    be too narrow for the first and far too wide for the second. Quantiles come from the first months (train) and
    are tested on the later months (test), overall, per volatility level, and against two baselines: one table per
    horizon and liquidity only (pooled), and a plain normal curve with the same scale (naive). A training case must
    also see its outcome before the split, so no test-month price leaks into the tables."""
    pred, n7 = nanmedian_w(lp, 7, 4)
    m14, n14 = nanmedian_w(lp, 14, 7)
    win = sliding(lp, 14)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        mad = np.nanmedian(np.abs(win - m14[..., None]), axis=-1) * 1.4826
    mad[n14 < 7] = np.nan
    v14, _ = nanmedian_w(np.nan_to_num(cnt, nan=0.0), 14, 1)
    sig = np.maximum(mad, 0.01)
    vb = np.digitize(np.nan_to_num(sig, nan=0.0), VOL_EDGES)  # rows with no scale are dropped below (z is NaN)
    lb = liq_bucket(v14)
    mid = int(len(days) * 0.5)
    out = {"quantiles": QS, "table": {}, "horizons": [1, 3, 7], "liq": LIQ, "liqEdges": LIQ_EDGES, "vol": VOL, "volEdges": VOL_EDGES}
    rel_levels = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
    L = len(rel_levels)
    cov = {"calibrated": np.zeros(L), "pooled": np.zeros(L), "naive": np.zeros(L)}
    vol = {k: np.zeros(len(VOL)) for k in ("n", "calibrated", "pooled", "naive")}
    width = {}
    tot = 0
    zn = {Lv: NormalDist().inv_cdf(1 - (1 - Lv) / 2) for Lv in rel_levels}
    sample_counts = {"train": 0, "test": 0}
    inside = lambda z, q, lo, hi: np.sum((z >= np.interp(lo, QS, q)) & (z <= np.interp(hi, QS, q)))
    for h in (1, 3, 7):
        fut = np.full_like(lp, np.nan)
        fut[:, :-h] = lp[:, h:]
        z = (fut - pred) / sig
        ok = np.isfinite(z) & np.isfinite(pred) & (n14 >= 7)
        widths = []
        for b in range(4):
            sel = ok & (lb == b)
            tr = sel.copy(); tr[:, mid - h:] = False  # forecast made and resolved before the split
            te = sel.copy(); te[:, :mid] = False
            pooled = np.quantile(z[tr], QS)
            out["table"][f"{h}|{LIQ[b]}"] = [rnd(x, 3) for x in pooled]
            for v in range(len(VOL)):
                ztr, zte = z[tr & (vb == v)], z[te & (vb == v)]
                sample_counts["train"] += ztr.size; sample_counts["test"] += zte.size
                q = pooled
                if ztr.size >= MIN_CELL:
                    q = np.quantile(ztr, QS)
                    out["table"][f"{h}|{LIQ[b]}|{VOL[v]}"] = [rnd(x, 3) for x in q]
                for i, Lv in enumerate(rel_levels):
                    lo, hi = (1 - Lv) / 2, 1 - (1 - Lv) / 2
                    cov["calibrated"][i] += inside(zte, q, lo, hi)
                    cov["pooled"][i] += inside(zte, pooled, lo, hi)
                    cov["naive"][i] += np.sum(np.abs(zte) <= zn[Lv])
                vol["n"][v] += zte.size
                vol["calibrated"][v] += inside(zte, q, 0.1, 0.9)
                vol["pooled"][v] += inside(zte, pooled, 0.1, 0.9)
                vol["naive"][v] += np.sum(np.abs(zte) <= zn[0.8])
                if zte.size:
                    s_te = sig[te & (vb == v)]
                    widths.append(np.exp(s_te * (np.interp(0.9, QS, q) - np.interp(0.1, QS, q))) - 1)
                tot += zte.size
        width[str(h)] = rnd(np.median(np.concatenate(widths)), 3) if widths else None
    out["reliability"] = {"level": rel_levels, **{k: [rnd(x / tot) for x in c] for k, c in cov.items()}}
    out["byVol"] = {"labels": VOL, "n": [int(x) for x in vol["n"]], **{k: [rnd(vol[k][i] / max(1, vol["n"][i])) for i in range(len(VOL))] for k in ("calibrated", "pooled", "naive")}}
    out["width80"] = width   # median width of an 80% range, as a share of the price, per horizon in days
    out["nTrain"], out["nTest"] = sample_counts["train"], sample_counts["test"]
    out["split"] = days[mid].strftime("%Y-%m-%d")
    return out, pred, sig, v14


# ---------------------------------------------------------------- haul survival: does a gap between markets last?
def survival(keys, days, lp, cnt, v14):
    item_rows = {}
    for i, (it, loc) in enumerate(zip(keys["item"], keys["location"])):
        item_rows.setdefault(it, {})[loc] = i
    edges = [LFEE + 0.05, 0.2, 0.3, 0.5, 1.0]
    bands = ["12-20%", "20-30%", "30-50%", "50-100%", "100%+"]
    mid = int(len(days) * 0.5)
    recs = []  # dest, liq, band, ok1, ok2, curve(1..5), test
    for it, locs in item_rows.items():
        for a in ROYAL:
            ia = locs.get(a)
            if ia is None:
                continue
            for b in ROYAL + ["Caerleon", "Black Market"]:
                ib = locs.get(b)
                if ib is None or a == b:
                    continue
                sp = lp[ib] - lp[ia]
                if np.sum(np.isfinite(sp)) < 40:
                    continue
                t = np.where(np.isfinite(sp) & (sp > edges[0]))[0]
                t = t[t < len(days) - 1]
                if not len(t):
                    continue
                dest = "bm" if b == "Black Market" else "caerleon" if b == "Caerleon" else "royal"
                for tt in t:
                    n1 = sp[tt + 1]
                    if not np.isfinite(n1) or not np.isfinite(v14[ib, tt]):
                        continue
                    curve = [sp[tt + k] > LFEE if tt + k < len(days) and np.isfinite(sp[tt + k]) else np.nan for k in range(1, 6)]
                    recs.append((dest, int(liq_bucket(v14[ib, tt])), int(np.digitize(sp[tt], edges[1:])), *curve, tt))
    r = pd.DataFrame(recs, columns=["dest", "liq", "band", "k1", "k2", "k3", "k4", "k5", "t"])
    tr, te = r[r.t < mid - 2], r[r.t >= mid]  # the odds use one and two days ahead: train cases resolve before the split
    s1 = tr.groupby(["dest", "liq", "band"])["k1"].mean()
    s2 = tr.groupby(["dest", "liq", "band"])["k2"].mean()
    n1 = tr.groupby(["dest", "liq", "band"]).size()
    te = te.join(s1.rename("pred"), on=["dest", "liq", "band"]).dropna(subset=["pred", "k1"])
    te["pb"] = pd.cut(te.pred, [0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0])
    rel = te.groupby("pb", observed=True).agg(pred=("pred", "mean"), obs=("k1", "mean"), n=("k1", "size"))
    key = lambda d, l, b: f"{d}|{LIQ[l]}|{bands[b]}"
    curves = {}
    for d in ("royal", "caerleon", "bm"):
        sub = r[(r.dest == d) & (r.liq >= 2)]
        curves[d] = {bands[b]: [rnd(sub[sub.band == b][f"k{k}"].mean(), 3) for k in range(1, 6)] for b in range(5)}
    return {
        "edges": [rnd(e) for e in edges], "bands": bands, "liq": LIQ,
        "s1": {key(d, l, b): rnd(v, 3) for (d, l, b), v in s1.items()},
        "s2": {key(d, l, b): rnd(v, 3) for (d, l, b), v in s2.items()},
        "n": {key(d, l, b): int(v) for (d, l, b), v in n1.items()},
        "curves": curves,
        "reliability": {"pred": [rnd(x) for x in rel.pred], "obs": [rnd(x) for x in rel.obs], "n": [int(x) for x in rel.n]},
        "nTest": int(len(te)), "nTrain": int(len(tr)),
    }


# ---------------------------------------------------------------- dips and spikes: how much comes back?
def rebound(keys, days, lp, cnt, v14):
    base, nb = nanmedian_w(lp, 14, 8)
    base = np.concatenate([np.full((lp.shape[0], 1), np.nan), base[:, :-1]], axis=1)  # trailing, excludes today
    vb = np.concatenate([np.full((lp.shape[0], 1), np.nan), v14[:, :-1]], axis=1)
    dev = lp - base
    H = 10
    fut = np.stack([np.concatenate([lp[:, k:], np.full((lp.shape[0], k), np.nan)], axis=1) for k in range(1, 8)], axis=-1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        f7 = np.nanmean(fut, axis=-1) - lp
        f1 = fut[..., 0] - lp
        b7 = np.nanmean(fut, axis=-1) - base
    ok = np.isfinite(dev) & np.isfinite(vb)
    lb = liq_bucket(vb)
    edges = [-5, -0.4, -0.25, -0.15, -0.08, -0.03, 0.03, 0.08, 0.15, 0.25, 0.4, 5]
    labels = ["<-40%", "-40 to -25%", "-25 to -15%", "-15 to -8%", "-8 to -3%", "flat", "+3 to 8%", "+8 to 15%", "+15 to 25%", "+25 to 40%", ">+40%"]
    db = np.digitize(dev, edges[1:-1])
    table = []
    for b in range(len(labels)):
        row = {"bucket": labels[b], "byLiq": []}
        for l in range(4):
            sel = ok & (db == b) & (lb == l) & np.isfinite(f7)
            n = int(sel.sum())
            if n < 50:
                row["byLiq"].append(None)
                continue
            dv, a1, a7, bb = dev[sel], f1[sel], f7[sel], b7[sel]
            win = float(np.mean(a7 > LFEE)) if b < 5 else float(np.mean(a7 < -LFEE))
            row["byLiq"].append({"n": n, "dev": rnd(np.mean(dv)), "f1": rnd(np.nanmean(a1)), "f7": rnd(np.mean(a7)), "b7": rnd(np.mean(bb)), "beatFees": rnd(win, 3),
                                 "f7q": [rnd(x) for x in np.quantile(a7, [0.1, 0.25, 0.5, 0.75, 0.9])]})
        table.append(row)
    # event study: average path around dips and spikes in liquid markets (20+ a day), k = -5 .. +10 days
    paths = {}
    for name, cond in (("dip", (dev < -0.15) & (dev > -0.4)), ("spike", (dev > 0.15) & (dev < 0.4))):
        sel = ok & cond & (lb >= 2)
        si, ti = np.where(sel)
        ks = list(range(-5, H + 1))
        mean, q25, q75 = [], [], []
        for k in ks:
            tt = ti + k
            valid = (tt >= 0) & (tt < lp.shape[1])
            v = lp[si[valid], tt[valid]] - base[si[valid], ti[valid]]
            v = v[np.isfinite(v)]
            mean.append(rnd(np.mean(v))); q25.append(rnd(np.quantile(v, 0.25))); q75.append(rnd(np.quantile(v, 0.75)))
        paths[name] = {"k": ks, "mean": mean, "q25": q25, "q75": q75, "n": int(len(si))}
    return {"edges": edges[1:-1], "labels": labels, "liq": LIQ, "table": table, "paths": paths, "fee": rnd(LFEE)}


# ---------------------------------------------------------------- weekday effects, and which of them are real
def weekday(keys, days, lp, cnt):
    # deviation from a centred 7-day mean: removes the trend and leaves the day-of-week shape (it sums to ~0)
    out = {"price": {}, "volume": {}, "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
    lv = np.log(cnt)
    def centred(a):
        win = np.lib.stride_tricks.sliding_window_view(np.concatenate([np.full((a.shape[0], 3), np.nan), a, np.full((a.shape[0], 3), np.nan)], axis=1), 7, axis=1)
        n = np.sum(~np.isnan(win), axis=-1)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m = np.nanmean(win, axis=-1)
        m[n < 7] = np.nan
        return a - m
    dp, dv = centred(lp), centred(lv)
    wd = np.array([d.dayofweek for d in days])
    mk = np.where(keys["location"] == "Black Market", "bm", np.where(keys["location"].isin(ROYAL), "royal", "other"))
    for kind in ("gear", "refined", "raw"):
        for m in ("royal", "bm"):
            rows = ((keys["kind"] == kind) & (mk == m)).to_numpy()
            if rows.sum() < 20:
                continue
            P, V = dp[rows], dv[rows]
            out["price"][f"{kind}|{m}"] = [rnd(np.nanmean(P[:, wd == d]) * 100, 2) for d in range(7)]
            out["volume"][f"{kind}|{m}"] = [rnd((np.exp(np.nanmean(V[:, wd == d])) - 1) * 100, 2) for d in range(7)]
    # out-of-sample test: pick each series' cheapest and dearest weekday on the first half, trade them on the second
    mid = int(len(days) * 0.5)
    amp_in, amp_out, corr = [], [], []
    for s in range(lp.shape[0]):
        a, b = dp[s, :mid], dp[s, mid:]
        if np.sum(np.isfinite(a)) < 35 or np.sum(np.isfinite(b)) < 35:
            continue
        ma = np.array([np.nanmean(a[wd[:mid] == d]) if np.any(np.isfinite(a[wd[:mid] == d])) else np.nan for d in range(7)])
        mb = np.array([np.nanmean(b[wd[mid:] == d]) if np.any(np.isfinite(b[wd[mid:] == d])) else np.nan for d in range(7)])
        if np.any(~np.isfinite(ma)) or np.any(~np.isfinite(mb)):
            continue
        lo, hi = int(np.argmin(ma)), int(np.argmax(ma))
        amp_in.append(ma[hi] - ma[lo]); amp_out.append(mb[hi] - mb[lo])
        corr.append(np.corrcoef(ma, mb)[0, 1])
    amp_in, amp_out = np.array(amp_in), np.array(amp_out)
    deciles = []
    qs = np.quantile(amp_in, np.linspace(0, 1, 11))
    for i in range(10):
        sel = (amp_in >= qs[i]) & (amp_in <= qs[i + 1])
        deciles.append({"inSample": rnd(np.mean(amp_in[sel])), "outOfSample": rnd(np.mean(amp_out[sel]))})
    out["oos"] = {"series": int(len(amp_in)), "inSample": rnd(np.mean(amp_in)), "outOfSample": rnd(np.mean(amp_out)),
                  "positive": rnd(np.mean(amp_out > 0), 3), "corr": rnd(np.median(corr), 3), "deciles": deciles, "split": days[mid].strftime("%Y-%m-%d")}
    return out


# ---------------------------------------------------------------- the Black Market premium over royal-city prices
def bm_premium(keys, days, lp, cnt):
    gear = keys[keys["kind"] == "gear"]
    by_item = {}
    for i, (it, loc) in zip(gear.index, zip(gear["item"], gear["location"])):
        by_item.setdefault(it, {})[loc] = i
    prem, vol = [], []
    for it, locs in by_item.items():
        if "Black Market" not in locs:
            continue
        roy = [locs[c] for c in ROYAL if c in locs]
        if len(roy) < 2:
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            rm = np.nanmedian(lp[roy], axis=0)
        prem.append(lp[locs["Black Market"]] - rm)
        vol.append(cnt[locs["Black Market"]])
    P, V = np.array(prem), np.array(vol)
    weeks = []
    for w0 in range(0, len(days) - 6, 7):
        sl = P[:, w0:w0 + 7]
        v = sl[np.isfinite(sl)]
        vv = np.nansum(V[:, w0:w0 + 7]) / 7
        if v.size < 200:
            continue
        weeks.append([days[w0].strftime("%Y-%m-%d"), rnd(np.median(v)), rnd(np.quantile(v, 0.25)), rnd(np.quantile(v, 0.75)), int(vv)])
    allv = P[np.isfinite(P)]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ac = [pd.Series(p).autocorr(1) for p in P if np.sum(np.isfinite(p)) >= 60]
    hist_edges = np.linspace(-1, 1.5, 26)
    h, _ = np.histogram(np.clip(allv, -1, 1.5), bins=hist_edges)
    return {"weekly": weeks, "median": rnd(np.median(allv)), "share": rnd(np.mean(allv > 0), 3), "lag1": rnd(np.nanmedian(ac), 3),
            "hist": {"edges": [rnd(x, 2) for x in hist_edges], "counts": [int(x) for x in h]}, "items": int(P.shape[0])}


# ---------------------------------------------------------------- fixed-base price index by month (no chain drift)
def index_by_month(df):
    df = df.copy()
    df["kind"] = df["item"].map(kind_of)
    df["month"] = df["date"].dt.to_period("M")
    df["pv"] = df["avg_price"] * df["count"]
    g = df.groupby(["item", "location", "kind", "month"]).agg(pv=("pv", "sum"), c=("count", "sum")).reset_index()
    g["p"] = g.pv / g.c
    months = sorted(g.month.unique())
    full = [m for m in months if (df[df.month == m].date.dt.day.nunique() >= 20)]
    base = full[0]
    piv = g.pivot_table(index=["item", "location", "kind"], columns="month", values="p")
    w = g[g.month == base].set_index(["item", "location", "kind"])["c"]
    out = {"base": str(base), "months": [str(m) for m in full], "kinds": {}}
    for kind in ("gear", "refined", "raw", "enchant"):
        series = []
        for m in full:
            r = np.log(piv[m] / piv[base])
            ok = r.notna() & w.reindex(r.index).notna()
            rr = r[ok]
            sel = rr.index.get_level_values("kind") == kind
            a = rr[sel].to_numpy(); b = w.reindex(rr.index)[sel].to_numpy()
            if not len(a):
                series.append(None); continue
            o = np.argsort(a); cs = np.cumsum(b[o])
            med = a[o][np.searchsorted(cs, cs[-1] / 2)]
            series.append({"wmed": rnd(np.exp(med) - 1), "med": rnd(np.exp(np.median(a)) - 1), "n": int(len(a))})
        out["kinds"][kind] = series
    return out


# ---------------------------------------------------------------- enchant and sell: buy .k, upgrade, sell .k+1
def enchant(df, items_json):
    with open(items_json) as f:
        up = json.load(f)["up"]
    S = {}
    for (it, loc), g in df.groupby(["item", "location"]):
        S[(it, loc)] = g.set_index("date")[["avg_price", "count"]]
    have = {k[0] for k in S if family(k[0]) in ENCH}
    places = ROYAL + ["Caerleon", "Brecilien"]
    rows = []
    for base, counts in up.items():
        tier = base[1]
        for lvl in (1, 2, 3):
            mat = f"T{tier}_{('RUNE', 'SOUL', 'RELIC')[lvl - 1]}"
            n = counts[lvl - 1]
            if not n or mat not in have:
                continue
            lo = base if lvl == 1 else f"{base}@{lvl - 1}"
            hi = f"{base}@{lvl}"
            for buy in places:
                a, m = S.get((lo, buy)), S.get((mat, buy))
                if a is None or m is None:
                    continue
                for sell in [buy, "Black Market"]:
                    b = S.get((hi, sell))
                    if b is None:
                        continue
                    fee = 0.04 if sell == "Black Market" else FEE
                    d = pd.DataFrame({"lo": a.avg_price, "hi": b.avg_price, "m": m.avg_price, "c": b["count"]}).dropna()
                    if len(d) < 20:
                        continue
                    cost = d.lo + n * d.m
                    net = d.hi * (1 - fee)
                    mg = net / cost - 1
                    rows.append({"item": hi, "mat": mat, "lvl": lvl, "n": n, "buy": buy, "sell": "bm" if sell == "Black Market" else "same",
                                 "days": len(d), "margin": float(mg.median()), "win": float((mg > 0.05).mean()), "profit": float((net - cost).median()),
                                 "vol": float(d.c.median()), "month": {str(k): float(v) for k, v in (mg > 0.05).groupby(d.index.to_period("M")).mean().items()}})
    r = pd.DataFrame(rows)
    out = {"byMat": {}, "top": [], "combos": int(len(r))}
    for (mat, sell), g in r.groupby(["mat", "sell"]):
        months = sorted({m for x in g.month for m in x})
        out["byMat"][f"{mat}|{sell}"] = {"n": int(len(g)), "margin": rnd(g.margin.median()), "win": rnd(g.win.median(), 3),
                                         "profit": int(g.profit.median()), "winByMonth": [[m, rnd(np.mean([x[m] for x in g.month if m in x]), 3)] for m in months]}
    top = r[(r.sell == "bm") & (r.vol >= 3) & (r.win >= 0.8)].sort_values("profit", ascending=False).head(25)
    out["top"] = [{k: (rnd(v) if isinstance(v, float) else v) for k, v in row.items() if k != "month"} for row in top.to_dict(orient="records")]
    return out


# ---------------------------------------------------------------- does raw lead refined?
def lead_lag(keys, days, lp):
    pairs = [("HIDE", "LEATHER", "Martlock"), ("ORE", "METALBAR", "Thetford"), ("WOOD", "PLANKS", "Fort Sterling"), ("FIBER", "CLOTH", "Lymhurst"), ("ROCK", "STONEBLOCK", "Bridgewatch")]
    idx = {(a, b): i for i, (a, b) in enumerate(zip(keys["item"], keys["location"]))}
    lags = [-6, -3, 0, 3, 6]
    acc = {l: [] for l in lags}
    n = 0
    for raw, ref, city in pairs:
        for t in range(4, 9):
            for e in range(4):
                ri = f"T{t}_{raw}" + (f"_LEVEL{e}@{e}" if e else "")
                fi = f"T{t}_{ref}" + (f"_LEVEL{e}@{e}" if e else "")
                a, b = idx.get((ri, city)), idx.get((fi, city))
                if a is None or b is None or np.sum(np.isfinite(lp[a])) < 80 or np.sum(np.isfinite(lp[b])) < 80:
                    continue
                da = pd.Series(lp[a]).diff(3); db = pd.Series(lp[b]).diff(3)
                for l in lags:
                    acc[l].append(da.corr(db.shift(-l)))
                n += 1
    return {"lags": lags, "corr": [rnd(np.nanmean(acc[l]), 3) for l in lags], "pairs": n}


# ---------------------------------------------------------------- what the live scanners price first
def universe(df, days_back=28, top=160):
    """Gear the scanners check live: the tier+item pairs (all enchants together) with the most silver traded in the
    last four weeks, at the Black Market and in the royal cities. Fewer ids means fewer calls to the price server."""
    end = df["date"].max()
    recent = df[(df["date"] > end - pd.Timedelta(days=days_back)) & (df["item"].map(kind_of) == "gear")].copy()
    recent["base"] = recent["item"].str.replace(r"@\d$", "", regex=True)
    recent["value"] = recent["avg_price"] * recent["count"]
    bm = recent[recent["location"] == "Black Market"].groupby("base")["value"].sum()
    roy = recent[recent["location"].isin(ROYAL)].groupby("base")["value"].sum()
    score = (bm.rank(pct=True).reindex(roy.index.union(bm.index)).fillna(0) + roy.rank(pct=True).reindex(roy.index.union(bm.index)).fillna(0))
    bases = score.sort_values(ascending=False).head(top).index.tolist()
    return {"bases": bases, "days": days_back}


# ---------------------------------------------------------------- the offline snapshot
def snapshot(df, days_back=28):
    end = df["date"].max()
    start = end - pd.Timedelta(days=days_back - 1)
    recent = df[df["date"] >= start].copy()
    recent["kind"] = recent["item"].map(kind_of)
    vol = recent.groupby("item")["count"].sum()
    keep_gear = vol[(vol >= 20) & vol.index.map(lambda i: kind_of(i) == "gear")].index
    keep = set(keep_gear) | set(recent[recent["kind"] != "gear"]["item"])
    recent = recent[recent["item"].isin(keep)]
    markets = sorted(recent["location"].unique())
    mi = {m: i for i, m in enumerate(markets)}
    out = {"start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d"), "days": days_back, "markets": markets, "s": {}}
    for (it, loc), g in recent.groupby(["item", "location"]):
        arr = [0] * (2 * days_back)
        d = (g["date"] - start).dt.days.to_numpy()
        for k, p, c in zip(d, g["avg_price"].to_numpy(), g["count"].to_numpy()):
            arr[k] = int(p); arr[days_back + k] = int(c)
        out["s"].setdefault(it, {})[str(mi[loc])] = arr
    return out


def main():
    t0 = datetime.datetime.now()
    df = load()
    print("rows", len(df), "items", df["item"].nunique(), flush=True)
    keys, days, lp, cnt = dense(df)
    print("series", len(keys), "days", len(days), flush=True)
    pm, pred, sig, v14 = price_model(keys, days, lp, cnt)
    print("price model", pm["reliability"]["calibrated"], "by volatility", pm["byVol"], "width80", pm["width80"], flush=True)
    sv = survival(keys, days, lp, cnt, v14)
    print("survival", sv["reliability"], flush=True)
    rb = rebound(keys, days, lp, cnt, v14)
    wd = weekday(keys, days, lp, cnt)
    print("weekday oos", wd["oos"]["corr"], flush=True)
    bm = bm_premium(keys, days, lp, cnt)
    ix = index_by_month(df)
    en = enchant(df, os.path.join(OUT, "items.json"))
    ll = lead_lag(keys, days, lp)
    insights = {
        "v": datetime.date.today().isoformat(),
        "source": {"server": "Americas", "from": days[0].strftime("%Y-%m-%d"), "to": days[-1].strftime("%Y-%m-%d"), "rows": int(len(df)),
                   "items": int(df["item"].nunique()), "series": int(len(keys)), "markets": sorted(df["location"].unique().tolist())},
        "fee": FEE, "universe": universe(df), "priceModel": pm, "survival": sv, "rebound": rb, "weekday": wd, "bmPremium": bm, "index": ix, "enchant": en, "leadLag": ll,
    }
    with open(os.path.join(OUT, "insights.json"), "w") as f:
        json.dump(insights, f, separators=(",", ":"))
    snap = snapshot(df)
    with open(os.path.join(OUT, "snapshot.json"), "w") as f:
        json.dump(snap, f, separators=(",", ":"))
    print("done in", (datetime.datetime.now() - t0).seconds, "s;", len(snap["s"]), "items in snapshot", flush=True)


if __name__ == "__main__":
    main()
