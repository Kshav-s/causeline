"""Rule-based analytics computed from stored complaint records (never from fabricated data).

Logic for Pareto, recurrence hotspots and Wilson intervals is ported from
ml_predictive_analytics/src/{pareto_analysis,recurrence_detection,capa_analysis}.py so CauseLine's
numbers are consistent with the supplied analysis; differences are documented inline.
"""
from __future__ import annotations

import threading
from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Complaint

COLS = ["id", "complaint_id", "complaint_received_date", "complaint_closed_date", "product_id", "product_name", "food_family",
        "customer_name", "batch_id", "complaint_category", "defect_subcategory", "complaint_severity", "complaint_status",
        "food_safety_related_flag", "root_cause_category", "root_cause_status", "capa_id", "prior_capa_id",
        "recurrence_after_prior_capa", "capa_effectiveness_status", "haccp_process_step", "is_synthetic", "investigation_status",
        "investigation_id", "capa_follow_up_days", "haccp_control_id", "potential_haccp_gap_flag"]
SEV_W = {"Routine": 1, "Major": 3, "Critical": 5}  # same weights as preprocessing.severity_weight
OPEN_STATUSES = ["Open", "Under investigation", "Awaiting customer information"]
CONF = ["Confirmed", "Probable"]

_cache: dict = {"key": None, "df": None}
_lock = threading.Lock()


def frame(db: Session) -> pd.DataFrame:
    """All complaints as a DataFrame, cached until the table changes (count + latest update)."""
    key = tuple(db.execute(select(func.count(Complaint.id), func.max(Complaint.updated_at))).one())
    with _lock:
        if _cache["key"] == key and _cache["df"] is not None:
            return _cache["df"]
    rows = db.execute(select(*[getattr(Complaint, c) for c in COLS])).all()
    df = pd.DataFrame(rows, columns=COLS)
    for c in ("complaint_received_date", "complaint_closed_date"):
        df[c] = pd.to_datetime(df[c])
    df["sev_w"] = df.complaint_severity.map(SEV_W).fillna(1)
    df["month"] = df.complaint_received_date.dt.to_period("M").astype(str)
    df["eff"] = df.capa_effectiveness_status.fillna("").str.split(" ").str[0]  # Effective|Ineffective|Pending|Not
    with _lock:
        _cache.update(key=key, df=df)
    return df


def synthetic_ids(db: Session) -> set[str]:
    """Complaint IDs flagged synthetic in the database (cached with the frame). C2: used to label similar-complaint
    results at read time, so stored predictions are labelled without being rewritten."""
    df = frame(db)
    return set(df.loc[df.is_synthetic.fillna(False).astype(bool), "complaint_id"])


def invalidate_cache() -> None:
    with _lock:
        _cache.update(key=None, df=None)


def apply_filters(df: pd.DataFrame, date_from: date | None = None, date_to: date | None = None, product: list[str] | None = None,
                  category: list[str] | None = None, severity: list[str] | None = None, food_family: list[str] | None = None) -> pd.DataFrame:
    m = pd.Series(True, index=df.index)
    if date_from:
        m &= df.complaint_received_date >= pd.Timestamp(date_from)
    if date_to:
        m &= df.complaint_received_date <= pd.Timestamp(date_to)
    for col, vals in (("product_name", product), ("complaint_category", category), ("complaint_severity", severity), ("food_family", food_family)):
        if vals:
            m &= df[col].isin(vals)
    return df[m]


def _capa_frame(df: pd.DataFrame) -> pd.DataFrame:
    """One row per CAPA (identified by capa_id on originating complaints)."""
    c = df[df.capa_id.notna()]
    if c.empty:
        return pd.DataFrame(columns=["capa_id", "status_label", "eff", "consistent"])
    g = c.groupby("capa_id")
    out = g.agg(first_complaint=("complaint_received_date", "min"), last_complaint=("complaint_received_date", "max"),
                linked=("complaint_id", "count"), product_name=("product_name", "first"), complaint_category=("complaint_category", "first"),
                food_family=("food_family", "first"), root_cause_category=("root_cause_category", "first"),
                root_cause_status=("root_cause_status", "first"),
                status_label=("capa_effectiveness_status", lambda s: s.mode().iloc[0] if not s.mode().empty else None),
                n_status=("capa_effectiveness_status", "nunique")).reset_index()
    out["consistent"] = out.n_status <= 1
    out["eff"] = out.status_label.fillna("").str.split(" ").str[0]
    rec = df[df.prior_capa_id.notna()].groupby("prior_capa_id").agg(recurrences=("complaint_id", "count"),
                                                                     last_recurrence=("complaint_received_date", "max"))
    out = out.join(rec, on="capa_id")
    out["recurrences"] = out.recurrences.fillna(0).astype(int)
    return out


# ---------------------------------------------------------------- dashboard
def kpis(df: pd.DataFrame) -> dict:
    capa = _capa_frame(df)
    assess = capa[capa.eff.isin(["Effective", "Ineffective"])]
    return {
        "total_complaints": int(len(df)),
        "open_complaints": int(df.complaint_status.isin(OPEN_STATUSES).sum()),
        "critical_complaints": int((df.complaint_severity == "Critical").sum()),
        "food_safety_related": int(df.food_safety_related_flag.fillna(False).astype(bool).sum()),
        "recurred_after_prior_capa": int(df.recurrence_after_prior_capa.fillna(False).astype(bool).sum()),
        "capas_total": int(len(capa)),
        "capas_pending": int((capa.eff == "Pending").sum()),
        "capa_ineffective_rate": round(float((assess.eff == "Ineffective").mean()), 4) if len(assess) else None,
        "capa_assessable": int(len(assess)),
        "synthetic_share": round(float(df.is_synthetic.mean()), 4) if len(df) else None,
        "date_min": df.complaint_received_date.min().date().isoformat() if len(df) else None,
        "date_max": df.complaint_received_date.max().date().isoformat() if len(df) else None,
    }


def monthly(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    t = df.groupby("month").agg(total=("id", "count"), critical=("complaint_severity", lambda s: int((s == "Critical").sum()))).reset_index()
    t["ma3"] = t.total.rolling(3, min_periods=1).mean().round(1)
    return t.to_dict(orient="records")


def yearly_severity(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    y = df.assign(year=df.complaint_received_date.dt.year).pivot_table(index="year", columns="complaint_severity", values="id", aggfunc="count", fill_value=0)
    return [{"year": int(i), **{k: int(v) for k, v in r.items()}} for i, r in y.iterrows()]


def top(df: pd.DataFrame, col: str, n: int = 10) -> list[dict]:
    s = df[col].dropna().value_counts().head(n)
    return [{"label": str(k), "count": int(v)} for k, v in s.items()]


def pareto(df: pd.DataFrame, col: str, weighted: bool = False, threshold: float = 0.8, limit: int = 30) -> dict:
    """Port of pareto_analysis.pareto_table."""
    d = df[df[col].notna()]
    s = (d.groupby(col)["sev_w"].sum() if weighted else d.groupby(col).size()).sort_values(ascending=False)
    if s.empty:
        return {"rows": [], "n_items": 0, "n_vital_few": 0, "total": 0}
    t = s.rename("value").reset_index()
    t["pct"] = 100 * t["value"] / t["value"].sum()
    t["cum_pct"] = t["pct"].cumsum()
    t["vital_few"] = t["cum_pct"].shift(fill_value=0) < threshold * 100
    rows = [{"label": str(r[col]), "value": float(r["value"]), "pct": round(float(r["pct"]), 2), "cum_pct": round(float(r["cum_pct"]), 2),
             "vital_few": bool(r["vital_few"])} for r in t.to_dict(orient="records")]
    return {"rows": rows[:limit], "n_items": len(t), "n_vital_few": int(t.vital_few.sum()), "total": float(t.value.sum()),
            "truncated": len(rows) > limit}


def reference_date(df: pd.DataFrame, months: int = 24) -> tuple[pd.Timestamp, str | None]:
    """Anchor for 'last N months' comparisons. Normally the latest complaint date. If the months before it contain no
    complaints at all (e.g. a historical import ending 2025-12 followed by a single live submission in 2026-11), windows
    anchored there would compare almost-empty periods and show every product as falling. Then the anchor moves back to
    the end of the latest month whose preceding `months` months all contain complaints, and the reason is returned."""
    end = df.complaint_received_date.max()
    counts = df.complaint_received_date.dt.to_period("M").value_counts()
    first = counts.index.min()
    m = end.to_period("M")
    while m - (months - 1) >= first:
        window = pd.period_range(m - (months - 1), m, freq="M")
        if all(counts.get(p, 0) > 0 for p in window):
            if m == end.to_period("M"):
                return end, None
            ref = min(end, m.to_timestamp(how="end").normalize())
            empty = [str(p) for p in pd.period_range(m + 1, end.to_period("M"), freq="M") if counts.get(p, 0) == 0]
            return ref, (f"Windows end {ref.date().isoformat()}, the last month with complete coverage: {len(empty)} of the following months have no "
                         f"complaints ({empty[0]} to {empty[-1]}), so the latest record ({end.date().isoformat()}) would make every trend look like a fall.")
        m -= 1
    return end, None


def _max_window_count(dates: pd.Series, days: int = 90) -> int:
    d = np.sort(pd.to_datetime(dates).values.astype("datetime64[D]").astype(np.int64))
    j = np.searchsorted(d, d + days, side="left")
    return int((j - np.arange(len(d))).max())


def recurrence_hotspots(df: pd.DataFrame, min_total: int = 4, min_window: int = 3, limit: int = 50) -> dict:
    """Port of recurrence_detection.run (product x category hotspots)."""
    if df.empty:
        return {"rows": [], "recurring_groups": 0, "emerging_groups": 0, "reference_date": None}
    end, note = reference_date(df)
    rec, prior = end - pd.Timedelta(days=365), end - pd.Timedelta(days=730)
    rows = []
    for (pid, pname, cat), g in df.groupby(["product_id", "product_name", "complaint_category"], dropna=True):
        dts = g.complaint_received_date
        rows.append(dict(product_id=pid, product_name=pname, complaint_category=cat, total=len(g), max_in_90d=_max_window_count(dts),
                         last_12m=int(((dts > rec) & (dts <= end)).sum()), prior_12m=int(((dts > prior) & (dts <= rec)).sum()),
                         severity_weighted=int(g.sev_w.sum()), critical=int((g.complaint_severity == "Critical").sum()),
                         post_capa_recurrences=int(g.recurrence_after_prior_capa.fillna(False).astype(bool).sum()),
                         last_complaint=dts.max().date().isoformat()))
    h = pd.DataFrame(rows)
    if h.empty:
        return {"rows": [], "recurring_groups": 0, "emerging_groups": 0, "reference_date": end.date().isoformat(), "reference_note": note}
    h["recurring_flag"] = (h.total >= min_total) & (h.max_in_90d >= min_window)
    h["emerging_flag"] = h.recurring_flag & (h.last_12m >= 2) & (h.last_12m > h.prior_12m)
    h["priority_score"] = h.severity_weighted + 3 * h.max_in_90d + 2 * h.post_capa_recurrences + 3 * h.last_12m
    h = h.sort_values("priority_score", ascending=False)
    return {"rows": h.head(limit).to_dict(orient="records"), "recurring_groups": int(h.recurring_flag.sum()),
            "emerging_groups": int(h.emerging_flag.sum()), "groups": int(len(h)), "reference_date": end.date().isoformat(), "reference_note": note,
            "rule": f"Recurring = >= {min_total} complaints and >= {min_window} within any 90 days. Emerging = recurring and last-12-month count >= 2 and above the prior 12 months (relative to the latest complaint date)."}


# ---------------------------------------------------------------- CAPA
def wilson(k: int, n: int, z: float = 1.96):
    if n == 0:
        return (None, None)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(float(c - h), 4), round(float(c + h), 4))


def capa_list(df: pd.DataFrame) -> pd.DataFrame:
    return _capa_frame(df)


def capa_effectiveness_by(df: pd.DataFrame, dim: str) -> dict:
    """Ineffective rate per dimension with 95% Wilson CI. Uses the recorded (rule-based) effectiveness label;
    pending CAPAs excluded. Differs from capa_analysis.py, which used the unsupplied CAPA history table
    (follow_up_matured_flag); figures may therefore differ slightly from the published report."""
    capa = _capa_frame(df)
    m = capa[capa.eff.isin(["Effective", "Ineffective"])].copy()
    if m.empty or dim not in m.columns:
        return {"rows": [], "overall_ineffective_rate": None, "n": 0}
    m["ineffective"] = (m.eff == "Ineffective").astype(int)
    overall = float(m.ineffective.mean())
    rows = []
    for k, g in m.groupby(dim):
        lo, hi = wilson(int(g.ineffective.sum()), len(g))
        rows.append({"label": str(k), "n": int(len(g)), "ineffective": int(g.ineffective.sum()),
                     "ineffective_rate": round(float(g.ineffective.mean()), 4), "ci_low": lo, "ci_high": hi,
                     "significantly_worse": bool(lo is not None and lo > overall)})
    rows.sort(key=lambda r: -r["ineffective_rate"])
    return {"rows": rows, "overall_ineffective_rate": round(overall, 4), "n": int(len(m))}


# ---------------------------------------------------------------- Zombie CAPA detector
CAPA_NOT_CLOSED = "CAPA not closed"


def zombie_capas(df: pd.DataFrame, open_capas: set[str] | frozenset = frozenset()) -> tuple[pd.DataFrame, dict]:
    """CAPAs recorded as CLOSED whose problem came back: at least one later complaint names the CAPA as its prior CAPA
    (prior_capa_id, recurrence_after_prior_capa = 1). Identifier-linked only - no text matching, no inferred links.

    Closed = the recorded effectiveness label is not "Pending - CAPA not closed" and the CAPA is not open in the supplied
    watchlist. Closure DATES are not in the supplied data (needs 04); recurrence timing is the recorded capa_follow_up_days
    on the recurring complaint."""
    capa = _capa_frame(df)
    empty = {"closed_capas": 0, "zombies": 0, "zombie_share": None, "recurrences": 0, "same_cause": 0, "different_cause": 0, "unknown_cause": 0,
             "median_days_to_first": None, "first_within_30_days": 0, "recurred_during_follow_up": 0, "labelled_ineffective_without_link": 0}
    if capa.empty:
        return capa, empty
    closed = ~capa.status_label.fillna("").str.contains(CAPA_NOT_CLOSED, regex=False) & ~capa.capa_id.isin(open_capas)
    r = df[df.prior_capa_id.notna() & df.recurrence_after_prior_capa.fillna(False).astype(bool)].copy()
    if r.empty:
        return capa.iloc[0:0], {**empty, "closed_capas": int(closed.sum())}
    orig_rc = capa.set_index("capa_id").root_cause_category
    r["orig_rc"] = r.prior_capa_id.map(orig_rc)
    r["same_cause"] = r.root_cause_category.notna() & (r.root_cause_category == r.orig_rc)
    r["diff_cause"] = r.root_cause_category.notna() & r.orig_rc.notna() & (r.root_cause_category != r.orig_rc)
    g = r.groupby("prior_capa_id").agg(recurrences=("id", "count"), first_recurrence=("complaint_received_date", "min"),
                                       last_recurrence=("complaint_received_date", "max"), days_to_first=("capa_follow_up_days", "min"),
                                       critical=("complaint_severity", lambda s: int((s == "Critical").sum())),
                                       same_cause=("same_cause", "sum"), different_cause=("diff_cause", "sum"),
                                       open_recurrences=("complaint_status", lambda s: int(s.isin(OPEN_STATUSES).sum())))
    z = capa[closed].drop(columns=["recurrences", "last_recurrence"]).merge(g, left_on="capa_id", right_index=True)
    inv = df[df.capa_id.notna() & df.investigation_id.notna()].groupby("capa_id").investigation_id.agg(lambda s: sorted(set(s)))
    z["investigations"] = z.capa_id.map(inv).apply(lambda v: v if isinstance(v, list) else [])
    z["unknown_cause"] = z.recurrences - z.same_cause - z.different_cause
    z["during_follow_up"] = z.status_label.fillna("").str.startswith("Pending")
    z = z.sort_values(["recurrences", "critical", "capa_id"], ascending=[False, False, True])
    n_closed = int(closed.sum())
    summary = {"closed_capas": n_closed, "zombies": int(len(z)), "zombie_share": round(len(z) / n_closed, 4) if n_closed else None,
               "recurrences": int(z.recurrences.sum()), "same_cause": int(z.same_cause.sum()), "different_cause": int(z.different_cause.sum()),
               "unknown_cause": int(z.unknown_cause.sum()),
               "median_days_to_first": float(z.days_to_first.median()) if z.days_to_first.notna().any() else None,
               "first_within_30_days": int((z.days_to_first <= 30).sum()), "recurred_during_follow_up": int(z.during_follow_up.sum()),
               "labelled_ineffective_without_link": int(((capa.eff == "Ineffective") & ~capa.capa_id.isin(g.index)).sum())}
    return z, summary


# ---------------------------------------------------------------- Zero Complaint Path Simulator
SIM_MIN_ASSESSED = 10
SIM_ASSUMPTIONS = [
    "Future complaints for each root cause continue at the rate of the selected baseline window.",
    "A new CAPA on a root cause is as effective as past CAPAs on that cause, judged by the recorded rule-based effectiveness label.",
    "An effective CAPA prevents complaints of that cause; an ineffective one prevents none.",
    "Only complaints with a Confirmed or Probable recorded root cause can be attributed; all other complaints are left unchanged.",
    "Causes with fewer than 10 assessed CAPAs have no reliable effectiveness rate and are not estimated.",
    "Historical association on synthetic data - not a forecast and not evidence that a CAPA causes the reduction.",
]


def zero_complaint_path(df: pd.DataFrame, months: int = 12, selected: list[str] | None = None) -> dict:
    """ESTIMATE of how far CAPAs on each recorded root cause could move complaints towards zero, using the historical
    cause distribution and the verified (recorded) CAPA effectiveness per cause. Point value plus a range from the
    95% Wilson interval of the effectiveness rate."""
    if df.empty:
        return {"rows": [], "path": [], "baseline": 0, "assumptions": SIM_ASSUMPTIONS}
    end, note = reference_date(df, max(months, 12))
    start = end - pd.DateOffset(months=months)
    w = df[(df.complaint_received_date > start) & (df.complaint_received_date <= end)]
    attributable = w[w.root_cause_status.isin(CONF) & w.root_cause_category.notna()]
    eff = {r["label"]: r for r in capa_effectiveness_by(df, "root_cause_category")["rows"]}
    rows = []
    for cause, n in attributable.root_cause_category.value_counts().items():
        e = eff.get(cause)
        ok = bool(e and e["n"] >= SIM_MIN_ASSESSED)
        rate = 1 - e["ineffective_rate"] if ok else None
        lo, hi = (1 - e["ci_high"], 1 - e["ci_low"]) if ok else (None, None)
        rows.append({"root_cause_category": cause, "baseline_complaints": int(n), "assessed_capas": int(e["n"]) if e else 0,
                     "effectiveness_rate": round(rate, 4) if ok else None, "effectiveness_ci": [round(lo, 4), round(hi, 4)] if ok else None,
                     "estimable": ok, "avoidable_estimate": round(n * rate, 1) if ok else None,
                     "avoidable_range": [round(n * lo, 1), round(n * hi, 1)] if ok else None})
    estimable = [r for r in rows if r["estimable"]]
    chosen = {r["root_cause_category"] for r in estimable} if selected is None else set(selected)
    for r in rows:
        r["selected"] = r["estimable"] and r["root_cause_category"] in chosen
    base = int(len(w))
    path, rem, rem_lo, rem_hi = [], float(base), float(base), float(base)
    path.append({"step": 0, "label": "Baseline", "remaining": base, "remaining_low": base, "remaining_high": base})
    for i, r in enumerate(sorted([r for r in rows if r["selected"]], key=lambda r: -r["avoidable_estimate"]), start=1):
        rem -= r["avoidable_estimate"]
        rem_lo -= r["avoidable_range"][1]
        rem_hi -= r["avoidable_range"][0]
        path.append({"step": i, "label": r["root_cause_category"], "remaining": round(rem, 1), "remaining_low": round(rem_lo, 1), "remaining_high": round(rem_hi, 1)})
    sel = [r for r in rows if r["selected"]]
    avoid = sum(r["avoidable_estimate"] for r in sel)
    return {
        "window": {"months": months, "from": (start + pd.Timedelta(days=1)).date().isoformat(), "to": end.date().isoformat(), "reference_note": note},
        "baseline": base, "attributable": int(len(attributable)), "unattributed": base - int(len(attributable)),
        "not_estimable": int(sum(r["baseline_complaints"] for r in rows if not r["estimable"])),
        "selected_causes": len(sel), "avoidable_estimate": round(avoid, 1),
        "avoidable_range": [round(sum(r["avoidable_range"][0] for r in sel), 1), round(sum(r["avoidable_range"][1] for r in sel), 1)],
        "remaining_estimate": round(base - avoid, 1),
        "remaining_range": [round(base - sum(r["avoidable_range"][1] for r in sel), 1), round(base - sum(r["avoidable_range"][0] for r in sel), 1)],
        "floor_without_attribution": base - int(len(attributable)),
        "rows": sorted(rows, key=lambda r: (-(r["avoidable_estimate"] or -1), -r["baseline_complaints"])),
        "path": path, "assumptions": SIM_ASSUMPTIONS, "label": "ESTIMATE",
        "method": "avoidable = baseline complaints with that recorded cause x historical CAPA effectiveness for that cause (Effective / assessed, "
                  "pending excluded); range from the 95% Wilson interval of the effectiveness rate.",
    }


# ---------------------------------------------------------------- root cause
def root_cause_stats(df: pd.DataFrame) -> dict:
    has = df.root_cause_category.notna()
    conf = df.root_cause_status.isin(CONF)
    status = df.root_cause_status.fillna("Not recorded").value_counts().to_dict()
    causes = []
    for k, g in df[has].groupby("root_cause_category"):
        causes.append({"root_cause_category": k, "complaints": int(len(g)),
                       "confirmed": int((g.root_cause_status == "Confirmed").sum()), "probable": int((g.root_cause_status == "Probable").sum()),
                       "hypothesis": int((g.root_cause_status == "Hypothesis").sum()), "unknown": int((g.root_cause_status == "Unknown").sum()),
                       "top_category": g.complaint_category.mode().iloc[0] if not g.complaint_category.mode().empty else None,
                       "first_seen": g.complaint_received_date.min().date().isoformat(), "last_seen": g.complaint_received_date.max().date().isoformat()})
    causes.sort(key=lambda r: -r["complaints"])
    return {"total": int(len(df)), "with_recorded_cause": int(has.sum()), "confirmed_or_probable": int((has & conf).sum()),
            "distinct_causes": int(df.root_cause_category.nunique()), "status_counts": {str(k): int(v) for k, v in status.items()},
            "causes": causes}


def root_cause_associations(df: pd.DataFrame, category: str | None = None, top_n: int = 5) -> list[dict]:
    """Historical association: share of Confirmed/Probable causes within each complaint category (rule-based)."""
    k = df[df.root_cause_status.isin(CONF) & df.root_cause_category.notna()]
    if category:
        k = k[k.complaint_category == category]
    if k.empty:
        return []
    t = k.groupby(["complaint_category", "root_cause_category"]).agg(n=("id", "count"), confirmed=("root_cause_status", lambda s: int((s == "Confirmed").sum()))).reset_index()
    t["share_within_category"] = (t.n / t.groupby("complaint_category").n.transform("sum")).round(4)
    t = t.sort_values(["complaint_category", "share_within_category"], ascending=[True, False])
    if category:
        t = t.head(top_n)
    return t.to_dict(orient="records")


# ---------------------------------------------------------------- recurring batches
def recurring_batches(df: pd.DataFrame, min_complaints: int = 2) -> tuple[pd.DataFrame, dict]:
    """Port of recurrence_detection.py (batch part): complaints grouped by recorded batch_id + product; recurring = >= 2.
    Batch level is supported only for complaints that carry a batch_id; production attributes need dataset 02."""
    c = df[df.batch_id.notna()]
    if c.empty:
        return c.iloc[0:0], {"batches_with_complaints": 0, "recurring_batches": 0, "complaints_with_batch": 0, "complaints_total": int(len(df)),
                             "max_complaints_single_batch": 0}
    b = c.groupby(["batch_id", "product_id", "product_name"], dropna=False).agg(
        complaints=("id", "count"), categories=("complaint_category", "nunique"), severity_weighted=("sev_w", "sum"),
        critical=("complaint_severity", lambda s: int((s == "Critical").sum())),
        food_safety=("food_safety_related_flag", lambda s: int(s.fillna(False).astype(bool).sum())),
        top_category=("complaint_category", lambda s: s.mode().iloc[0] if not s.mode().empty else None),
        first=("complaint_received_date", "min"), last=("complaint_received_date", "max")).reset_index()
    b["recurring_batch_flag"] = b.complaints >= min_complaints
    b["span_days"] = (b["last"] - b["first"]).dt.days
    b = b.sort_values(["complaints", "severity_weighted", "batch_id"], ascending=[False, False, True])
    return b, {"batches_with_complaints": int(len(b)), "recurring_batches": int(b.recurring_batch_flag.sum()),
               "complaints_with_batch": int(len(c)), "complaints_total": int(len(df)),
               "max_complaints_single_batch": int(b.complaints.max())}


# ---------------------------------------------------------------- HACCP control points
HACCP_PLAN_NOTE = ("No HACCP plan was supplied (critical limits, monitoring frequency, verification and corrective-action procedures). "
                   "Control-point monitoring against limits is therefore not possible. Shown instead: complaints that reference each recorded "
                   "control point and the source data's potential_haccp_gap_flag - prompts for qualified HACCP review, not evidence that a control failed.")


def haccp_controls(df: pd.DataFrame) -> list[dict]:
    h = df[df.haccp_control_id.notna()]
    rows = []
    for (cid, step), g in h.groupby(["haccp_control_id", "haccp_process_step"], dropna=False):
        gap = g.potential_haccp_gap_flag.fillna(False).astype(bool)
        rows.append({"control_id": cid, "process_step": step if isinstance(step, str) else None, "complaints": int(len(g)),
                     "potential_gap_flags": int(gap.sum()), "flag_rate": round(float(gap.mean()), 4),
                     "critical": int((g.complaint_severity == "Critical").sum()),
                     "food_safety_related": int(g.food_safety_related_flag.fillna(False).astype(bool).sum()),
                     "products": int(g.product_name.nunique()), "last_complaint": g.complaint_received_date.max().date().isoformat(),
                     "last_flagged": g.loc[gap, "complaint_received_date"].max().date().isoformat() if gap.any() else None})
    rows.sort(key=lambda r: (-r["potential_gap_flags"], -r["complaints"], r["control_id"]))
    return rows


# ---------------------------------------------------------------- product monitoring
def product_monitoring(df: pd.DataFrame) -> dict:
    """Rule-based product-level monitoring: last 12 months vs prior 12 months relative to the latest complaint date."""
    if df.empty:
        return {"rows": [], "reference_date": None}
    end, note = reference_date(df)
    rec, prior = end - pd.Timedelta(days=365), end - pd.Timedelta(days=730)
    start24 = (end - pd.DateOffset(months=23)).to_period("M")
    months = [str(p) for p in pd.period_range(start24, end.to_period("M"), freq="M")]
    rows = []
    for (pid, pname), g in df.groupby(["product_id", "product_name"], dropna=True):
        dts = g.complaint_received_date
        l12, p12 = int(((dts > rec) & (dts <= end)).sum()), int(((dts > prior) & (dts <= rec)).sum())
        spark = g[g.month.isin(months)].groupby("month").size().reindex(months, fill_value=0).astype(int).tolist()
        recent = g[(dts > rec) & (dts <= end)]
        rows.append({"product_id": pid, "product_name": pname, "food_family": g.food_family.mode().iloc[0] if not g.food_family.mode().empty else None,
                     "total": int(len(g)), "last_12m": l12, "prior_12m": p12,
                     "change_pct": round(100 * (l12 - p12) / p12, 1) if p12 else None,
                     "critical_last_12m": int((recent.complaint_severity == "Critical").sum()),
                     "top_category_last_12m": recent.complaint_category.mode().iloc[0] if len(recent) and not recent.complaint_category.mode().empty else None,
                     "monthly_24m": spark,
                     "indicator": "Rising" if (p12 and l12 > p12 * 1.25 and l12 >= 5) else ("Falling" if (p12 and l12 < p12 * 0.75) else "Stable")})
    rows.sort(key=lambda r: (-r["last_12m"], r["product_name"]))
    return {"rows": rows, "reference_date": end.date().isoformat(), "reference_note": note, "months": months,
            "rule": "Rising = last-12-month complaints > 125% of the prior 12 months and >= 5; Falling = < 75%; otherwise Stable."}
