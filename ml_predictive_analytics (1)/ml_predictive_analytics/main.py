"""Run the full ML & predictive analytics pipeline: python main.py"""
import json, sys, time
import numpy as np
import pandas as pd
from src import preprocessing as pp, eda, pareto_analysis, recurrence_detection, risk_prediction, explainability, capa_analysis, root_cause, recommendations


def main():
    np.random.seed(pp.SEED); t0 = time.time(); R = {}
    comp, bat, inv, capa, kpi = (pp.load(n) for n in ("complaints", "batches", "investigations", "capa", "kpi"))
    R["eda"] = eda.run(comp, bat, capa, kpi)
    R["pareto"] = pareto_analysis.run(comp)
    R["recurrence"] = recurrence_detection.run(comp, kpi)
    R["risk"], ctx = risk_prediction.run(bat)
    X, y = ctx["X"], ctx["y"]
    imp = explainability.global_importance(ctx["pipe"], X[ctx["va"]], y[ctx["va"]])
    R["top_features"] = imp.feature.head(6).tolist()
    # score validation+test (out-of-sample) batches with drivers and actions
    oos = ctx["va"] | ctx["te"]
    Xo = X[oos]; po = ctx["pipe"].predict_proba(Xo)[:, 1]
    out = ctx["meta"][oos].copy(); out["risk_score"] = po.round(4)
    out["risk_tier"] = np.where(po >= ctx["tiers_th"]["high"], "High", np.where(po >= ctx["tiers_th"]["medium"], "Medium", "Low"))
    out["actual_complaint_30d"] = y[oos].values
    hi = out[out.risk_tier == "High"].sort_values("risk_score", ascending=False).head(500).index
    d = explainability.local_drivers(ctx["pipe"], X.loc[hi], X[ctx["tr"]])
    d["recommended_action"] = recommendations.batch_actions(d)
    out = out.join(d)
    out["recommended_action"] = out.recommended_action.fillna(out.risk_tier.map(recommendations.TIER_ACTION))
    out.sort_values("risk_score", ascending=False).to_csv(pp.OUT / "predictions" / "batch_risk_predictions_oos.csv", index=False)
    R["capa"] = capa_analysis.run(capa)
    R["root_cause"] = root_cause.run(comp, inv)
    recommendations.run(R)
    (pp.OUT / "reports" / "results.json").write_text(json.dumps(R, indent=2, default=str))
    print(f"Pipeline OK in {time.time()-t0:.0f}s | model={R['risk']['selected_model']} | test AUC={R['risk']['test_metrics_at_f1_threshold']['roc_auc']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("PIPELINE ERROR:", repr(e)); raise
