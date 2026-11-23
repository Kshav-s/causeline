"""Exploratory data analysis."""
import json
import pandas as pd
import plotly.express as px
from .preprocessing import OUT, TARGET

VIZ = OUT / "visualizations"


def run(complaints, batches, capa, kpi):
    res = {}
    res["complaints_rows"] = len(complaints)
    res["date_range"] = [str(complaints.complaint_received_date.min().date()), str(complaints.complaint_received_date.max().date())]
    res["severity_share"] = complaints.complaint_severity.value_counts(normalize=True).round(4).to_dict()
    res["food_safety_share"] = round(float(complaints.food_safety_related_flag.mean()), 4)
    res["root_cause_status_share"] = complaints.root_cause_status.value_counts(normalize=True).round(4).to_dict()
    res["closure_days_median"] = float(complaints.days_to_complaint_closure.median())
    res["missing_pct_top"] = (complaints.isna().mean() * 100).round(1).sort_values(ascending=False).head(12).to_dict()
    el = batches[(batches.target_eligible_flag == 1) & batches[TARGET].notna()]
    res["batch_rows"] = len(batches); res["batch_eligible"] = len(el)
    res["batch_complaint_rate"] = round(float(el[TARGET].mean()), 4)
    res["batch_rate_by_split"] = el.groupby("model_split")[TARGET].mean().round(4).to_dict()
    res["batch_rate_by_food_family"] = el.groupby("food_family")[TARGET].mean().round(4).sort_values(ascending=False).to_dict()
    res["capa_status"] = capa.capa_status.value_counts().to_dict()

    yr = complaints.groupby(["complaint_year", "complaint_severity"]).size().reset_index(name="n")
    px.bar(yr, x="complaint_year", y="n", color="complaint_severity", title="Complaints per year by severity").write_html(VIZ / "eda_complaints_by_year.html", include_plotlyjs="cdn")
    px.bar(complaints.complaint_category.value_counts().reset_index(), x="count", y="complaint_category", orientation="h",
           title="Complaints by category").write_html(VIZ / "eda_category.html", include_plotlyjs="cdn")
    px.histogram(complaints, x="days_to_complaint_closure", nbins=50, title="Days to complaint closure").write_html(VIZ / "eda_closure_days.html", include_plotlyjs="cdn")
    px.line(kpi, x="kpi_month", y=["complaints_per_1000_tonnes", "repeat_complaint_rate_pct"], title="Monthly KPI trend").write_html(VIZ / "eda_kpi_trend.html", include_plotlyjs="cdn")
    r = el.groupby("food_family")[TARGET].mean().reset_index()
    px.bar(r, x="food_family", y=TARGET, title="30-day complaint rate by food family (batch table)").write_html(VIZ / "eda_batch_rate_family.html", include_plotlyjs="cdn")
    miss = (complaints.isna().mean() * 100).sort_values(ascending=False).head(15).reset_index()
    miss.columns = ["column", "missing_pct"]
    px.bar(miss, x="missing_pct", y="column", orientation="h", title="Top missing columns (complaints)").write_html(VIZ / "eda_missing.html", include_plotlyjs="cdn")
    (OUT / "reports" / "eda_summary.json").write_text(json.dumps(res, indent=2, default=str))
    return res
