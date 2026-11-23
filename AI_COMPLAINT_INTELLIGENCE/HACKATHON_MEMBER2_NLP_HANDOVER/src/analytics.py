"""Pareto analysis, monthly trends, recurring + emerging defect detection."""
from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd

from .config import DATE_COL, REPORTS_DIR, TARGET_PRIMARY, TARGET_SECONDARY


def pareto(df: pd.DataFrame, column: str = TARGET_PRIMARY) -> pd.DataFrame:
    counts = df[column].dropna().astype(str).value_counts()
    out = counts.to_frame("count")
    total = out["count"].sum()
    out["pct"] = out["count"] / total * 100
    out["cum_pct"] = out["pct"].cumsum()
    out["is_vital_few"] = out["cum_pct"] <= 80.0
    out = out.reset_index().rename(columns={"index": column})
    return out


def monthly_trends(df: pd.DataFrame, group: str | None = TARGET_PRIMARY) -> pd.DataFrame:
    if DATE_COL not in df.columns:
        return pd.DataFrame()
    d = df.dropna(subset=[DATE_COL]).copy()
    d["month"] = d[DATE_COL].dt.to_period("M").astype(str)
    if group and group in d.columns:
        out = d.groupby(["month", group]).size().reset_index(name="count")
    else:
        out = d.groupby("month").size().reset_index(name="count")
    return out.sort_values("month")


def recurring_defects(
    df: pd.DataFrame,
    column: str = TARGET_SECONDARY,
    min_count: int = 20,
    recurrence_col: str = "recurrence_after_prior_capa",
) -> pd.DataFrame:
    if column not in df.columns:
        return pd.DataFrame()
    d = df.copy()
    base = d.groupby(column).size().rename("total")
    frame = base.to_frame()
    if recurrence_col in d.columns:
        flag = (
            d[recurrence_col].astype(str).str.lower()
            .isin(["1", "true", "yes", "y", "t"])
        )
        frame["recurrences"] = (
            d.assign(_r=flag).groupby(column)["_r"].sum().astype(int)
        )
        frame["recurrence_rate"] = frame["recurrences"] / frame["total"]
    else:
        frame["recurrences"] = 0
        frame["recurrence_rate"] = 0.0
    frame = frame[frame["total"] >= min_count]
    return (
        frame.sort_values(["recurrence_rate", "total"], ascending=[False, False])
        .reset_index()
    )


def emerging_defects(
    df: pd.DataFrame,
    column: str = TARGET_SECONDARY,
    lookback_recent_months: int = 3,
    baseline_months: int = 6,
    min_recent: int = 5,
) -> pd.DataFrame:
    """Categories whose recent-window share is significantly higher than baseline."""
    if column not in df.columns or DATE_COL not in df.columns:
        return pd.DataFrame()
    d = df.dropna(subset=[DATE_COL, column]).copy()
    if d.empty:
        return pd.DataFrame()
    d["month"] = d[DATE_COL].dt.to_period("M")
    max_month = d["month"].max()
    recent_start = max_month - (lookback_recent_months - 1)
    base_start = recent_start - baseline_months
    base_end = recent_start - 1

    recent = d[d["month"] >= recent_start]
    base = d[(d["month"] >= base_start) & (d["month"] <= base_end)]

    r_counts = recent[column].astype(str).value_counts()
    b_counts = base[column].astype(str).value_counts()

    r_total = max(int(r_counts.sum()), 1)
    b_total = max(int(b_counts.sum()), 1)

    rows = []
    for cat in set(r_counts.index) | set(b_counts.index):
        r = int(r_counts.get(cat, 0))
        b = int(b_counts.get(cat, 0))
        if r < min_recent:
            continue
        r_share = r / r_total
        b_share = b / b_total if b_total else 0.0
        lift = (r_share / b_share) if b_share > 0 else float("inf")
        rows.append({
            "category": cat,
            "recent_count": r,
            "baseline_count": b,
            "recent_share": r_share,
            "baseline_share": b_share,
            "lift": lift,
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    return out.sort_values(["lift", "recent_count"], ascending=[False, False])


def save_pareto_chart(df: pd.DataFrame, column: str = TARGET_PRIMARY) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    p = pareto(df, column)
    fig, ax1 = plt.subplots(figsize=(10, 5))
    ax1.bar(p[column].astype(str), p["count"])
    ax1.set_xticklabels(p[column].astype(str), rotation=45, ha="right")
    ax1.set_ylabel("Count")
    ax2 = ax1.twinx()
    ax2.plot(p[column].astype(str), p["cum_pct"], color="red", marker="o")
    ax2.axhline(80, color="gray", linestyle="--", linewidth=1)
    ax2.set_ylabel("Cumulative %")
    ax1.set_title(f"Pareto of {column}")
    fig.tight_layout()
    out = REPORTS_DIR / f"pareto_{column}.png"
    fig.savefig(out, dpi=120)
    plt.close(fig)
    return str(out)


if __name__ == "__main__":
    from .data_loader import load_complaints
    df = load_complaints()
    p = pareto(df)
    p.to_csv(REPORTS_DIR / "pareto_complaint_category.csv", index=False)
    monthly_trends(df).to_csv(REPORTS_DIR / "monthly_trends.csv", index=False)
    rec = recurring_defects(df)
    if not rec.empty:
        rec.to_csv(REPORTS_DIR / "recurring_defects.csv", index=False)
    em = emerging_defects(df)
    if not em.empty:
        em.to_csv(REPORTS_DIR / "emerging_defects.csv", index=False)
    save_pareto_chart(df)
    print(f"Analytics written to {REPORTS_DIR}")
