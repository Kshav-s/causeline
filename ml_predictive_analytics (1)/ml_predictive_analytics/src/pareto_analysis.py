"""Pareto (80/20) analytics."""
import pandas as pd
import plotly.graph_objects as go
from .preprocessing import OUT, severity_weight


def pareto_table(df, col, weight=None, threshold=0.8):
    d = df[df[col].notna()]
    s = (d.groupby(col)[weight].sum() if weight else d.groupby(col).size()).sort_values(ascending=False)
    t = s.rename("value").reset_index()
    t["pct"] = 100 * t["value"] / t["value"].sum()
    t["cum_pct"] = t["pct"].cumsum()
    prev = t["cum_pct"].shift(fill_value=0)
    t["vital_few"] = prev < threshold * 100   # items needed to reach the threshold
    return t


def plot(t, col, title, path):
    top = t.head(25)
    fig = go.Figure()
    fig.add_bar(x=top[col].astype(str).str.slice(0, 40), y=top["value"], name="Value")
    fig.add_scatter(x=top[col].astype(str).str.slice(0, 40), y=top["cum_pct"], name="Cumulative %", yaxis="y2", mode="lines+markers")
    fig.update_layout(title=title, yaxis2=dict(overlaying="y", side="right", range=[0, 105]), xaxis_tickangle=-40)
    fig.add_hline(y=80, line_dash="dot", yref="y2")
    fig.write_html(path, include_plotlyjs="cdn")


def run(complaints):
    c = complaints.copy()
    c["sev_weight"] = severity_weight(c.complaint_severity)
    dims = ["complaint_category", "defect_subcategory", "product_name", "food_family",
            "customer_name", "root_cause_category", "haccp_process_step"]
    res = {}
    for col in dims:
        for w in (None, "sev_weight"):
            t = pareto_table(c, col, w)
            tag = f"{col}_{'severity' if w else 'count'}"
            t.to_csv(OUT / "reports" / f"pareto_{tag}.csv", index=False)
            plot(t, col, f"Pareto: {col} ({'severity-weighted' if w else 'count'})", OUT / "visualizations" / f"pareto_{tag}.html")
            res[tag] = {"n_items": len(t), "n_vital_few": int(t.vital_few.sum()),
                        "top5": [[str(a), round(float(b), 1)] for a, b in t.head(5)[[col, "pct"]].values]}
    return res
