"""Reproduce and persist the root-cause classifier from ml_predictive_analytics.

WHY: src/root_cause.py::run() trains this model in memory and never saves it, so new
complaints cannot be scored. The project owner approved (2026-11-23) re-running the
ORIGINAL training code once, unchanged, and saving the result as "root-cause v1-reproduced".

WHAT IS IDENTICAL TO THE ORIGINAL: text builder (`_text`), label filter (`CONF`, >=20 per class),
feature columns, ColumnTransformer/TfidfVectorizer/OneHotEncoder/LogisticRegression hyper-parameters,
random_state (SEED=42), 80/20 stratified split. These lines are copied verbatim from
root_cause.run(); the association table (needs the missing 03_Investigations CSV) is skipped.

VERIFICATION (the artifact is only written if all pass):
  1. top-1 / top-3 / macro-F1 equal the published results.json values.
  2. top-3 predicted causes + probabilities equal outputs/predictions/root_cause_predictions_unconfirmed.csv.

Usage:  backend/.venv/Scripts/python scripts/reproduce_root_cause_model.py
"""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
ML = ROOT / "ml_predictive_analytics (1)" / "ml_predictive_analytics"
CSV = ROOT / "AI_COMPLAINT_INTELLIGENCE" / "HACKATHON_MEMBER2_NLP_HANDOVER" / "data" / "01_ABT_CPD_Complaints_18000.csv"
OUT_DIR = ROOT / "ml_project" / "reproduced" / "root_cause_v1"

sys.path.insert(0, str(ML))
from src import root_cause as rc  # noqa: E402  (original module, unmodified)
from src.preprocessing import SEED  # noqa: E402

from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.feature_extraction.text import TfidfVectorizer  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import accuracy_score, f1_score  # noqa: E402
from sklearn.model_selection import train_test_split  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder  # noqa: E402


def load_complaints():
    # identical to src/preprocessing.py::load
    df = pd.read_csv(CSV, encoding="utf-8-sig", low_memory=False)
    for c in df.columns:
        if c.endswith("_date") or c == "kpi_month":
            df[c] = pd.to_datetime(df[c], errors="coerce")
    return df


def main():
    published = json.loads((ML / "outputs" / "reports" / "results.json").read_text())["root_cause"]
    complaints = load_complaints()

    # ---- verbatim from root_cause.run() ----
    c = complaints.copy()
    c["text"] = rc._text(c)
    lab = c[c.root_cause_status.isin(rc.CONF) & c.root_cause_category.notna()]
    cls = lab.root_cause_category.value_counts(); keep = cls[cls >= 20].index
    lab = lab[lab.root_cause_category.isin(keep)]
    cols = ["text", "complaint_category", "food_family"]
    tr, te = train_test_split(lab, test_size=0.2, stratify=lab.root_cause_category, random_state=SEED)
    pipe = Pipeline([("f", ColumnTransformer([("t", TfidfVectorizer(ngram_range=(1, 2), min_df=3, sublinear_tf=True), "text"),
                                              ("c", OneHotEncoder(handle_unknown="ignore"), ["complaint_category", "food_family"])])),
                     ("m", LogisticRegression(max_iter=2000, C=2.0))]).fit(tr[cols], tr.root_cause_category)
    P = pipe.predict_proba(te[cols]); classes = pipe.classes_
    top3 = np.mean([y in classes[np.argsort(-p)[:3]] for y, p in zip(te.root_cause_category, P)])
    # ---------------------------------------

    got = {"train_rows": len(tr), "test_rows": len(te), "n_classes": len(classes),
           "top1_accuracy": round(accuracy_score(te.root_cause_category, classes[P.argmax(1)]), 4),
           "top3_accuracy": round(float(top3), 4),
           "macro_f1": round(f1_score(te.root_cause_category, classes[P.argmax(1)], average="macro"), 4)}
    print("reproduced:", got)
    mismatches = {k: (v, published[k]) for k, v in got.items() if published.get(k) != v}
    if mismatches:
        sys.exit(f"ABORT: metrics differ from published results.json: {mismatches}")

    # check 2: predictions for unconfirmed complaints equal the published CSV
    ref = pd.read_csv(ML / "outputs" / "predictions" / "root_cause_predictions_unconfirmed.csv")
    todo = c[~c.root_cause_status.isin(rc.CONF)].copy()
    Q = pipe.predict_proba(todo[cols]); idx = np.argsort(-Q, axis=1)[:, :3]
    for k in range(3):
        todo[f"predicted_cause_{k+1}"] = classes[idx[:, k]]
        todo[f"predicted_prob_{k+1}"] = np.take_along_axis(Q, idx[:, [k]], 1).ravel().round(3)
    m = ref.merge(todo, on="complaint_id", suffixes=("_ref", ""))
    if len(m) != len(ref):
        sys.exit(f"ABORT: row alignment failed ({len(m)} vs {len(ref)})")
    cause_eq = all((m[f"predicted_cause_{k}_ref"] == m[f"predicted_cause_{k}"]).mean() for k in (1, 2, 3))
    cause_rate = min((m[f"predicted_cause_{k}_ref"] == m[f"predicted_cause_{k}"]).mean() for k in (1, 2, 3))
    prob_err = max((m[f"predicted_prob_{k}_ref"] - m[f"predicted_prob_{k}"]).abs().max() for k in (1, 2, 3))
    print(f"prediction match vs published CSV: rows={len(m)} min cause agreement={cause_rate:.4%} max prob diff={prob_err:.4f}")
    if cause_rate < 0.999 or prob_err > 0.0011:
        sys.exit("ABORT: predictions differ from the published CSV")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model_path = OUT_DIR / "root_cause_model.joblib"
    joblib.dump({"pipeline": pipe, "classes": list(classes), "feature_columns": cols,
                 "text_builder": "src/root_cause.py::_text (summary + description + defect_subcategory, lowercased)"}, model_path)
    sha = hashlib.sha256(model_path.read_bytes()).hexdigest()
    import sklearn
    (OUT_DIR / "provenance.json").write_text(json.dumps({
        "model_id": "root-cause", "version": "1.0.0-reproduced",
        "created_at": datetime.now(timezone.utc).isoformat(), "sklearn_version": sklearn.__version__,
        "source_code": "ml_predictive_analytics/src/root_cause.py::run (classifier block, verbatim)",
        "training_data": str(CSV.relative_to(ROOT)), "seed": SEED,
        "metrics": got, "published_metrics_match": True,
        "published_predictions_match": {"rows": int(len(m)), "min_cause_agreement": float(cause_rate), "max_prob_diff": float(prob_err)},
        "sha256": sha, "approved_by": "project owner, 2026-11-23",
        "caveat": published["caveat"],
    }, indent=2))
    print("saved", model_path, sha)


if __name__ == "__main__":
    main()
