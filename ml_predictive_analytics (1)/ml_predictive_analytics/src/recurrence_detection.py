"""Recurring product / batch defect detection."""
import numpy as np
import pandas as pd
import plotly.express as px
from .preprocessing import OUT, severity_weight


def max_window_count(dates, days=90):
    d = np.sort(pd.to_datetime(dates).values.astype("datetime64[D]").astype(np.int64))
    j = np.searchsorted(d, d + days, side="left")
    return int((j - np.arange(len(d))).max())


def run(complaints, kpi=None, min_total=4, min_window=3):
    c = complaints.copy()
    c["sev_w"] = severity_weight(c.complaint_severity)
    end = c.complaint_received_date.max()
    rec, prior = end - pd.Timedelta(days=365), end - pd.Timedelta(days=730)
    rows = []
    for (pid, pname, cat), g in c.groupby(["product_id", "product_name", "complaint_category"]):
        dts = g.complaint_received_date
        rows.append(dict(product_id=pid, product_name=pname, complaint_category=cat, total=len(g),
                         max_in_90d=max_window_count(dts), last_12m=int((dts > rec).sum()),
                         prior_12m=int(((dts > prior) & (dts <= rec)).sum()),
                         severity_weighted=int(g.sev_w.sum()), critical=int((g.complaint_severity == "Critical").sum()),
                         post_capa_recurrences=int(g.recurrence_after_prior_capa.sum()),
                         last_complaint=dts.max().date()))
    h = pd.DataFrame(rows)
    h["recurring_flag"] = (h.total >= min_total) & (h.max_in_90d >= min_window)
    h["emerging_flag"] = h.recurring_flag & (h.last_12m >= 2) & (h.last_12m > h.prior_12m)
    h["priority_score"] = h.severity_weighted + 3 * h.max_in_90d + 2 * h.post_capa_recurrences + 3 * h.last_12m
    h = h.sort_values("priority_score", ascending=False).reset_index(drop=True)
    h.to_csv(OUT / "reports" / "recurring_product_defects.csv", index=False)

    b = c[c.batch_id.notna()].groupby(["batch_id", "product_id", "product_name"]).agg(
        complaints=("complaint_id", "count"), categories=("complaint_category", "nunique"),
        severity_weighted=("sev_w", "sum"), first=("complaint_received_date", "min"),
        last=("complaint_received_date", "max")).reset_index()
    b["recurring_batch_flag"] = b.complaints >= 2
    b = b.sort_values(["complaints", "severity_weighted"], ascending=False)
    b.to_csv(OUT / "reports" / "recurring_batches.csv", index=False)

    pc = c.groupby("complaint_year").agg(n=("complaint_id", "count"), post_capa=("recurrence_after_prior_capa", "sum")).reset_index()
    pc["post_capa_recurrence_pct"] = 100 * pc.post_capa / pc.n
    px.line(pc, x="complaint_year", y="post_capa_recurrence_pct", title="% complaints recurring after a prior CAPA").write_html(
        OUT / "visualizations" / "recurrence_post_capa_trend.html", include_plotlyjs="cdn")
    t20 = h.head(20).copy(); t20["label"] = t20.product_name + " | " + t20.complaint_category
    px.bar(t20, x="priority_score", y="label", orientation="h", title="Top 20 recurring product-defect hotspots").write_html(
        OUT / "visualizations" / "recurrence_hotspots.html", include_plotlyjs="cdn")
    return {"hotspot_groups": len(h), "recurring_groups": int(h.recurring_flag.sum()), "emerging_groups": int(h.emerging_flag.sum()),
            "batches_with_complaints": len(b), "recurring_batches": int(b.recurring_batch_flag.sum()),
            "max_complaints_single_batch": int(b.complaints.max()),
            "post_capa_recurrence_pct_overall": round(float(100 * c.recurrence_after_prior_capa.mean()), 2),
            "top_hotspots": [[str(x) for x in r] for r in h.head(5)[["product_name", "complaint_category", "total", "max_in_90d"]].values]}
