"""Root-cause investigation support. Outputs are PREDICTED candidates, never confirmed root causes."""
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from .preprocessing import OUT, SEED

CONF = ["Confirmed", "Probable"]


def _text(df):
    return (df.complaint_summary.fillna("") + " " + df.complaint_description.fillna("") + " " + df.defect_subcategory.fillna("")).str.lower()


def association_table(inv):
    k = inv[inv.root_cause_status.isin(CONF) & inv.root_cause_category.notna()]
    t = k.groupby(["complaint_category", "root_cause_category"]).agg(n=("investigation_id", "count"), mean_conf=("root_cause_confidence", "mean"),
                                                                 confirmed=("root_cause_status", lambda s: (s == "Confirmed").sum())).reset_index()
    t["share_within_category"] = t.n / t.groupby("complaint_category").n.transform("sum")
    t.sort_values(["complaint_category", "share_within_category"], ascending=[True, False]).to_csv(OUT / "reports" / "root_cause_associations.csv", index=False)
    return t


def suggest_causes(assoc, complaint_category, top=3):
    """Quick lookup for an investigator: historical root causes for this complaint category."""
    t = assoc[assoc.complaint_category == complaint_category].sort_values("share_within_category", ascending=False).head(top)
    return [(r.root_cause_category, round(r.share_within_category, 3), "historical association - NOT confirmed") for r in t.itertuples()]


def run(complaints, inv):
    assoc = association_table(inv)
    c = complaints.copy()
    c["text"] = _text(c)
    lab = c[c.root_cause_status.isin(CONF) & c.root_cause_category.notna()]
    cls = lab.root_cause_category.value_counts(); keep = cls[cls >= 20].index
    lab = lab[lab.root_cause_category.isin(keep)]
    cols = ["text", "complaint_category", "food_family"]
    tr, te = train_test_split(lab, test_size=0.2, stratify=lab.root_cause_category, random_state=SEED)
    pipe = Pipeline([("f", ColumnTransformer([("t", TfidfVectorizer(ngram_range=(1, 2), min_df=3, sublinear_tf=True), "text"),
                                              ("c", OneHotEncoder(handle_unknown="ignore"), ["complaint_category", "food_family"])])),
                     ("m", LogisticRegression(max_iter=2000, C=2.0))]).fit(tr[cols], tr.root_cause_category)
    P = pipe.predict_proba(te[cols]); classes = pipe.classes_
    top3 = np.mean([y in classes[np.argsort(-p)[:3]] for y, p in zip(te.root_cause_category, P)])
    # baseline: most common cause within the complaint category
    bmap = tr.groupby("complaint_category").root_cause_category.agg(lambda s: s.value_counts().index[0])
    bacc = accuracy_score(te.root_cause_category, te.complaint_category.map(bmap).fillna(cls.index[0]))
    res = {"train_rows": len(tr), "test_rows": len(te), "n_classes": len(classes),
           "top1_accuracy": round(accuracy_score(te.root_cause_category, classes[P.argmax(1)]), 4), "top3_accuracy": round(float(top3), 4),
           "macro_f1": round(f1_score(te.root_cause_category, classes[P.argmax(1)], average="macro"), 4),
           "baseline_top1_by_complaint_category": round(bacc, 4), "random_top1": round(1 / len(classes), 4),
           "caveat": "Trained on Confirmed/Probable labels (random 80/20 split). Predictions are hypotheses for investigators, not confirmed causes."}
    # predictions for complaints without an established cause
    todo = c[~c.root_cause_status.isin(CONF)].copy()
    Q = pipe.predict_proba(todo[cols]); idx = np.argsort(-Q, axis=1)[:, :3]
    for k in range(3):
        todo[f"predicted_cause_{k+1}"] = classes[idx[:, k]]; todo[f"predicted_prob_{k+1}"] = np.take_along_axis(Q, idx[:, [k]], 1).ravel().round(3)
    todo["cause_basis"] = "PREDICTED (model hypothesis) - not a confirmed root cause"
    todo[["complaint_id", "product_name", "complaint_category", "root_cause_status", "predicted_cause_1", "predicted_prob_1",
          "predicted_cause_2", "predicted_prob_2", "predicted_cause_3", "predicted_prob_3", "cause_basis"]].to_csv(
        OUT / "predictions" / "root_cause_predictions_unconfirmed.csv", index=False)
    res["complaints_scored_without_confirmed_cause"] = len(todo)
    # high-risk-feature enrichment per cause: severity / food safety
    return res
