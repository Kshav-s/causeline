"""Global (permutation) and local (what-if occlusion) explanations - model agnostic."""
import numpy as np
import pandas as pd
import plotly.express as px
from sklearn.inspection import permutation_importance
from .preprocessing import OUT, SEED, feature_lists


def global_importance(pipe, X_val, y_val):
    r = permutation_importance(pipe, X_val, y_val, scoring="average_precision", n_repeats=5, random_state=SEED, n_jobs=1)
    df = pd.DataFrame({"feature": X_val.columns, "importance": r.importances_mean, "std": r.importances_std}).sort_values("importance", ascending=False)
    df.to_csv(OUT / "reports" / "global_feature_importance.csv", index=False)
    px.bar(df.head(15), x="importance", y="feature", orientation="h", error_x="std",
           title="Permutation importance (drop in PR-AUC, validation)").update_layout(yaxis=dict(autorange="reversed")).write_html(
        OUT / "visualizations" / "feature_importance.html", include_plotlyjs="cdn")
    return df


def local_drivers(pipe, X_rows, X_train, top_k=3):
    """For each row: probability drop when a feature is replaced by its training baseline (median/mode)."""
    num, cat = feature_lists()
    base = {c: X_train[c].median() for c in num}; base.update({c: X_train[c].mode().iloc[0] for c in cat})
    p0 = pipe.predict_proba(X_rows)[:, 1]
    delta = {}
    for c in X_rows.columns:
        Xc = X_rows.copy(); Xc[c] = base[c]
        delta[c] = p0 - pipe.predict_proba(Xc)[:, 1]
    D = pd.DataFrame(delta, index=X_rows.index)
    out = []
    for i in range(len(X_rows)):
        top = D.iloc[i].sort_values(ascending=False).head(top_k)
        out.append("; ".join(f"{f}={X_rows.iloc[i][f]} (+{v:.3f})" for f, v in top.items() if v > 0))
    return pd.DataFrame({"top_risk_drivers": out, "top_feature_1": [D.iloc[i].idxmax() for i in range(len(D))]}, index=X_rows.index)
