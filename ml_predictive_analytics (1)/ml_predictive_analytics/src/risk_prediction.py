"""Complaint risk prediction (batch-level, 30-day customer complaint) with temporal train/val/test split."""
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier
from . import model_evaluation as ev
from .preprocessing import OUT, ROOT, SEED, LEAKAGE_EXCLUDED, batch_dataset, make_preprocessor


def candidates(pos_weight):
    return {
        "logistic_regression": LogisticRegression(max_iter=3000, C=0.5, class_weight="balanced"),
        "hist_gradient_boosting": HistGradientBoostingClassifier(max_depth=4, learning_rate=0.05, max_iter=300, l2_regularization=1.0,
                                                                  early_stopping=True, random_state=SEED),
        "xgboost": XGBClassifier(n_estimators=400, max_depth=4, learning_rate=0.04, subsample=0.8, colsample_bytree=0.8,
                                 scale_pos_weight=pos_weight ** 0.5, eval_metric="aucpr", random_state=SEED, n_jobs=2),
    }


def run(batches):
    X, y, split, meta = batch_dataset(batches)
    tr, va, te = (split == "train").values, (split == "validation").values, (split == "test").values
    pos_w = (y[tr] == 0).sum() / max((y[tr] == 1).sum(), 1)
    comp, fitted = [], {}
    for name, clf in candidates(pos_w).items():
        pipe = Pipeline([("prep", make_preprocessor()), ("clf", clf)]).fit(X[tr], y[tr])
        pv = pipe.predict_proba(X[va])[:, 1]
        comp.append({"model": name, "val_roc_auc": round(roc_auc_score(y[va], pv), 4), "val_pr_auc": round(average_precision_score(y[va], pv), 4)})
        fitted[name] = pipe
    comp_df = pd.DataFrame(comp).sort_values("val_pr_auc", ascending=False)
    best = comp_df.iloc[0].model
    pipe = fitted[best]
    p_val, p_te = pipe.predict_proba(X[va])[:, 1], pipe.predict_proba(X[te])[:, 1]
    thr = ev.best_f1_threshold(y[va], p_val)          # threshold chosen on validation only
    tiers_th = ev.tier_thresholds(p_val)
    tiers_te = ev.assign_tier(p_te, tiers_th)
    # naive baselines on test for context
    base = {"majority_class_pr_auc(=prevalence)": round(float(y[te].mean()), 4)}
    for n, p in [(n, f.predict_proba(X[te])[:, 1]) for n, f in fitted.items()]:
        base[f"{n}_test_roc_auc"] = round(roc_auc_score(y[te], p), 4)
    res = {"selected_model": best, "model_comparison_validation": comp,
           "test_metrics_at_f1_threshold": ev.metrics(y[te].values, p_te, thr),
           "test_roc_auc_95ci_bootstrap": ev.bootstrap_auc(y[te].values, p_te),
           "tier_thresholds_from_validation": tiers_th, "tier_performance_test": ev.tier_table(y[te].values, tiers_te),
           "all_model_test_auc": base,
           "split_dates": meta.groupby("model_split").production_date.agg(["min", "max"]).astype(str).to_dict("index"),
           "class_balance_train": {"positives": int(y[tr].sum()), "negatives": int((y[tr] == 0).sum())},
           "leakage_controls": f"Excluded: {LEAKAGE_EXCLUDED}. Temporal split; threshold/tier cut-offs set on validation only."}
    ev.plots(y[te].values, p_te, thr, best)
    # per-segment AUC on test
    seg = []
    for fam, idx in X[te].groupby("food_family").groups.items():
        ii = X[te].index.get_indexer(idx)
        yy, pp = y[te].values[ii], p_te[ii]
        if yy.min() != yy.max(): seg.append({"food_family": fam, "n": len(yy), "roc_auc": round(roc_auc_score(yy, pp), 4)})
    res["test_auc_by_food_family"] = seg
    joblib.dump({"pipeline": pipe, "threshold": thr, "tier_thresholds": tiers_th, "features": list(X.columns), "model": best},
                ROOT / "models" / "batch_risk_model.joblib")
    ctx = dict(X=X, y=y, meta=meta, tr=tr, va=va, te=te, pipe=pipe, p_val=p_val, p_te=p_te, thr=thr, tiers_th=tiers_th, tiers_te=tiers_te)
    (OUT / "reports" / "model_evaluation.json").write_text(json.dumps(res, indent=2, default=str))
    return res, ctx


def predict(batches_df, model_path=None):
    """Score new batches with the saved model (raw batch-table columns in)."""
    from .preprocessing import build_features
    m = joblib.load(model_path or ROOT / "models" / "batch_risk_model.joblib")
    p = m["pipeline"].predict_proba(build_features(batches_df))[:, 1]
    return pd.DataFrame({"risk_score": p, "risk_tier": ev.assign_tier(p, m["tier_thresholds"])}, index=batches_df.index)
