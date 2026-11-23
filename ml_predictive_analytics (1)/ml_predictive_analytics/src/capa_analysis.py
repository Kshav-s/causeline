"""CAPA effectiveness analysis. NOTE: effectiveness is a RULE-BASED label in the source data (synthetic)."""
import numpy as np
import pandas as pd
import plotly.express as px
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, average_precision_score
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from .preprocessing import OUT, SEED


def wilson(k, n, z=1.96):
    if n == 0: return (np.nan, np.nan)
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d; h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def rate_table(d, col):
    g = d.groupby(col).agg(n=("ineffective", "size"), ineffective=("ineffective", "sum"),
                           avg_post_capa_complaints=("post_capa_similar_complaints_180d", "mean")).reset_index()
    g["ineffective_rate"] = g.ineffective / g.n
    ci = g.apply(lambda r: wilson(r.ineffective, r.n), axis=1)
    g["ci_low"] = [c[0] for c in ci]; g["ci_high"] = [c[1] for c in ci]
    return g.sort_values("ineffective_rate", ascending=False)


def run(capa):
    d = capa.copy()
    d["effective"] = d.effectiveness_status.str.startswith("Effective")
    d["ineffective"] = d.effectiveness_status.str.startswith("Ineffective")
    m = d[(d.effective | d.ineffective) & (d.follow_up_matured_flag == 1)].copy()
    m["ineffective"] = m.ineffective.astype(int)
    overall = float(m.ineffective.mean())
    res = {"capa_total": len(d), "assessable_matured": len(m), "overall_ineffective_rate": round(overall, 4),
           "pending_not_assessable": int(len(d) - len(m)), "by_dimension": {}}
    for col in ["root_cause_category", "root_cause_status", "responsible_function", "complaint_category", "food_family", "corrective_action"]:
        t = rate_table(m, col); t.to_csv(OUT / "reports" / f"capa_effectiveness_by_{col}.csv", index=False)
        t["significantly_worse_than_overall"] = t.ci_low > overall
        res["by_dimension"][col] = t.head(4)[[col, "n", "ineffective_rate", "significantly_worse_than_overall"]].round(3).values.tolist()
        if col in ("root_cause_category", "responsible_function", "root_cause_status"):
            px.bar(t, x="ineffective_rate", y=col, orientation="h", error_x=t.ci_high - t.ineffective_rate, error_x_minus=t.ineffective_rate - t.ci_low,
                   title=f"CAPA ineffective rate by {col} (95% Wilson CI)").write_html(OUT / "visualizations" / f"capa_{col}.html", include_plotlyjs="cdn")
    m["year"] = m.capa_open_date.dt.year
    yr = m.groupby("year").ineffective.agg(["mean", "size"]).reset_index()
    px.line(yr, x="year", y="mean", title="CAPA ineffective rate by open year").write_html(OUT / "visualizations" / "capa_trend.html", include_plotlyjs="cdn")
    res["ineffective_rate_by_year"] = yr.round(3).values.tolist()
    # Predictor of ineffectiveness using ONLY design-time attributes (no post-CAPA outcome fields).
    cat = ["root_cause_category", "root_cause_status", "responsible_function", "complaint_category", "food_family", "corrective_action", "preventive_action"]
    cat = [c for c in cat if m[c].nunique() <= 60]
    pipe = Pipeline([("p", ColumnTransformer([("c", OneHotEncoder(handle_unknown="ignore", min_frequency=10, sparse_output=False), cat)])),
                     ("m", HistGradientBoostingClassifier(max_depth=3, max_iter=150, learning_rate=0.05, random_state=SEED))])
    p = cross_val_predict(pipe, m[cat], m.ineffective, cv=StratifiedKFold(5, shuffle=True, random_state=SEED), method="predict_proba")[:, 1]
    res["design_time_predictor_cv"] = {"features": cat, "roc_auc": round(roc_auc_score(m.ineffective, p), 4),
                                       "pr_auc": round(average_precision_score(m.ineffective, p), 4), "base_rate": round(overall, 4),
                                       "interpretation": ("Design-time attributes carry only modest signal (mainly root-cause category); not reliable for individual CAPAs."
                                          if roc_auc_score(m.ineffective, p) < 0.7 else "Design-time attributes are informative.")}
    # CAPAs at risk: open, not yet assessable, with historically weak category
    t = rate_table(m, "root_cause_category").set_index("root_cause_category").ineffective_rate
    op = d[~(d.effective | d.ineffective)].copy()
    op["historical_ineffective_rate_for_root_cause"] = op.root_cause_category.map(t)
    op.sort_values("historical_ineffective_rate_for_root_cause", ascending=False)[
        ["capa_id", "product_name", "complaint_category", "root_cause_category", "root_cause_status", "capa_status", "historical_ineffective_rate_for_root_cause"]
    ].to_csv(OUT / "predictions" / "open_capas_watchlist.csv", index=False)
    return res
