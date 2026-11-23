"""Inference engines. Each returns an EngineResult and never invents output:
missing/invalid input -> status 'insufficient_data'; model unavailable -> 'error' with reason."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd

from app.ml.preprocessing import CAT, NUM, build_features, clean_text, root_cause_text
from app.ml.registry import registry
from app.ml.safety import safety_flag


@dataclass
class EngineResult:
    model_key: str
    status: str  # completed | insufficient_data | error
    output: dict | None = None
    top_label: str | None = None
    top_score: float | None = None
    low_confidence: bool = False
    message: str | None = None
    warnings: list[str] = field(default_factory=list)


def _unavailable(key: str) -> EngineResult:
    lm = registry.get(key)
    return EngineResult(key, "error", message=f"Model '{key}' is not available ({lm.status}): {lm.reason}")


def _validate_proba(p: np.ndarray, n: int) -> None:
    if p.shape != (n,) or not np.all(np.isfinite(p)) or np.any(p < -1e-9) or not np.isclose(p.sum(), 1.0, atol=1e-6):
        raise ValueError("Model returned an invalid probability vector")


def _topk(p, classes, k):
    idx = np.argsort(-p)[:k]
    return [{"label": classes[i], "probability": round(float(p[i]), 4)} for i in idx]


# ---------------------------------------------------------------- NLP classification
MIN_CLEAN_CHARS = 3


def classify(key: str, text: str, top_k: int = 3) -> EngineResult:
    if not registry.usable(key):
        return _unavailable(key)
    cleaned = clean_text(text)
    if len(cleaned) < MIN_CLEAN_CHARS:
        return EngineResult(key, "insufficient_data", message="Complaint text is empty or too short after cleaning (letters/digits only).")
    lm = registry.get(key)
    model, classes = lm.obj["model"], lm.obj["classes"]
    try:
        p = model.predict_proba([cleaned])[0]
        _validate_proba(p, len(classes))
    except Exception as e:  # noqa: BLE001
        return EngineResult(key, "error", message=f"Inference failed: {type(e).__name__}")
    preds = _topk(p, classes, top_k)
    vocab = model.named_steps["tfidf"].vocabulary_
    tokens = cleaned.split()
    known = [t for t in tokens if t in vocab]
    coverage = round(len(known) / max(len(tokens), 1), 3)
    thr = lm.spec.low_confidence_threshold
    res = EngineResult(key, "completed", top_label=preds[0]["label"], top_score=preds[0]["probability"],
                       low_confidence=preds[0]["probability"] < thr,
                       output={"predictions": preds, "vocabulary_coverage": coverage, "cleaned_text": cleaned,
                               "confidence_note": "Uncalibrated logistic-regression probability; treat as a ranking."})
    if coverage < 0.5:
        res.warnings.append(f"Only {coverage:.0%} of words are in the model's vocabulary; the prediction is weakly supported.")
    return res


def food_safety(text: str, top_category: str | None) -> EngineResult:
    if not (text or "").strip():
        return EngineResult("food-safety-flag", "insufficient_data", message="No text supplied.")
    out = safety_flag(text, top_category)
    return EngineResult("food-safety-flag", "completed", output=out,
                        top_label="Escalate for food-safety review" if out["escalate_for_food_safety_review"] else "No escalation trigger")


# ---------------------------------------------------------------- similarity
def similar(text: str, top_k: int = 5, exclude_complaint_id: str | None = None) -> EngineResult:
    key = "nlp-similarity"
    if not registry.usable(key):
        return _unavailable(key)
    if len(clean_text(text)) < MIN_CLEAN_CHARS:
        return EngineResult(key, "insufficient_data", message="Complaint text is empty or too short.")
    obj = registry.get(key).obj
    try:
        q = obj["encoder"].encode([text], convert_to_numpy=True, normalize_embeddings=True).astype(np.float32)
        if q.shape[1] != obj["emb"].shape[1]:
            raise ValueError("dimension mismatch")
        sims = (obj["emb"] @ q.T).ravel()
    except Exception as e:  # noqa: BLE001
        return EngineResult(key, "error", message=f"Similarity search failed: {type(e).__name__}")
    order = np.argsort(-sims)
    meta = obj["meta"]
    results = []
    for i in order:
        row = meta.iloc[int(i)]
        if exclude_complaint_id and str(row["complaint_id"]) == str(exclude_complaint_id):
            continue
        rd = row.get("complaint_received_date")
        results.append({"complaint_id": str(row["complaint_id"]),
                        "complaint_received_date": rd.date().isoformat() if hasattr(rd, "date") else (str(rd) if rd is not None else None),
                        "complaint_category": row.get("complaint_category"), "defect_subcategory": row.get("defect_subcategory"),
                        "product_name": row.get("product_name"), "complaint_summary": row.get("complaint_summary"),
                        "similarity": round(float(sims[int(i)]), 4)})
        if len(results) >= top_k:
            break
    return EngineResult(key, "completed", output={"results": results, "metric": "cosine similarity (not a probability)"},
                        top_label=results[0]["complaint_id"] if results else None,
                        top_score=results[0]["similarity"] if results else None)


# ---------------------------------------------------------------- root cause
def root_cause(complaint_summary: str | None, complaint_description: str | None, defect_subcategory: str | None,
               complaint_category: str | None, food_family: str | None) -> EngineResult:
    key = "root-cause"
    if not registry.usable(key):
        return _unavailable(key)
    missing = [n for n, v in (("complaint_description", complaint_description), ("complaint_category", complaint_category),
                              ("food_family", food_family)) if not (v or "").strip()]
    if missing:
        return EngineResult(key, "insufficient_data", message="Required for root-cause hypotheses: " + ", ".join(missing) +
                            ". The complaint category must be recorded or human-verified first.")
    bundle = registry.get(key).obj
    pipe = bundle["pipeline"]
    df = pd.DataFrame([{"complaint_summary": complaint_summary, "complaint_description": complaint_description,
                        "defect_subcategory": defect_subcategory, "complaint_category": complaint_category, "food_family": food_family}])
    df["text"] = root_cause_text(df)
    warns = []
    ohe = pipe.named_steps["f"].named_transformers_["c"]
    for col, cats in zip(["complaint_category", "food_family"], ohe.categories_):
        if df.at[0, col] not in set(cats):
            warns.append(f"'{df.at[0, col]}' is not a {col.replace('_', ' ')} the model was trained on; it is ignored by the model.")
    try:
        p = pipe.predict_proba(df[["text", "complaint_category", "food_family"]])[0]
        classes = [str(c) for c in pipe.classes_]
        _validate_proba(p, len(classes))
    except Exception as e:  # noqa: BLE001
        return EngineResult(key, "error", message=f"Inference failed: {type(e).__name__}")
    top = [{"cause": d["label"], "probability": d["probability"]} for d in _topk(p, classes, 3)]
    thr = registry.get(key).spec.low_confidence_threshold
    return EngineResult(key, "completed", top_label=top[0]["cause"], top_score=top[0]["probability"],
                        low_confidence=top[0]["probability"] < thr, warnings=warns,
                        output={"hypotheses": top, "basis": "PREDICTED (model hypothesis) - not a confirmed root cause"})


# ---------------------------------------------------------------- batch risk
def batch_risk(record: dict) -> EngineResult:
    key = "batch-risk"
    if not registry.usable(key):
        return _unavailable(key)
    b = registry.get(key).obj
    levels = b["category_levels"]
    required = NUM + CAT + ["production_date", "dispatch_date"]
    missing = [f for f in required if record.get(f) in (None, "")]
    if missing:
        return EngineResult(key, "insufficient_data", message="Missing required batch fields: " + ", ".join(missing))
    warns = []
    for c in CAT:
        if str(record[c]) not in levels[c]:
            warns.append(f"{c}='{record[c]}' was not seen in training; the model ignores it.")
    pd_, dd_ = record["production_date"], record["dispatch_date"]
    if isinstance(pd_, date) and isinstance(dd_, date) and dd_ < pd_:
        return EngineResult(key, "insufficient_data", message="dispatch_date is before production_date.")
    df = pd.DataFrame([record])
    df["production_date"] = pd.to_datetime(df["production_date"])
    df["dispatch_date"] = pd.to_datetime(df["dispatch_date"])
    try:
        X = build_features(df)
        pipe = b["pipeline"]
        p = float(pipe.predict_proba(X)[:, 1][0])
        if not 0.0 <= p <= 1.0:
            raise ValueError("score out of range")
        th = b["tier_thresholds"]
        tier = "High" if p >= th["high"] else "Medium" if p >= th["medium"] else "Low"
        factors = _linear_factors(pipe, X)
    except Exception as e:  # noqa: BLE001
        return EngineResult(key, "error", message=f"Inference failed: {type(e).__name__}: {e}")
    return EngineResult(key, "completed", top_label=tier, top_score=round(p, 4), warnings=warns,
                        output={"risk_score": round(p, 4), "risk_tier": tier, "tier_thresholds": th,
                                "derived_features": {k: (None if pd.isna(v) else round(float(v), 3)) for k, v in X.iloc[0][["shelf_life_used_pct", "dispatch_lag_days", "prod_month", "storage_temp_range_c"]].items()},
                                "factors": factors,
                                "score_note": "Uncalibrated score; use the tier for ranking only. Model test ROC-AUC 0.55 (weak)."})


def _linear_factors(pipe, X, top=5) -> list[dict]:
    """Exact log-odds decomposition of the logistic regression.
    Numeric: coef x standardised value (relative to the training mean).
    Categorical: coef of the active level minus the mean coef of that feature's levels (unweighted)."""
    pre, clf = pipe.named_steps["prep"], pipe.named_steps["clf"]
    xt = np.asarray(pre.transform(X))[0]
    names = pre.get_feature_names_out()
    coef = clf.coef_[0]
    out = []
    for i, n in enumerate(names):
        if n.startswith("num__"):
            f = n[5:]
            out.append({"feature": f, "value": None if pd.isna(X.iloc[0][f]) else float(X.iloc[0][f]),
                        "contribution": float(coef[i] * xt[i]), "basis": "relative to training mean"})
    for c in CAT:
        idx = [i for i, n in enumerate(names) if n.startswith(f"cat__{c}_")]
        if not idx:
            continue
        active = [i for i in idx if xt[i] > 0.5]
        mean_c = float(np.mean(coef[idx]))
        contrib = float(coef[active[0]] - mean_c) if active else 0.0
        out.append({"feature": c, "value": str(X.iloc[0][c]), "contribution": contrib, "basis": "relative to average level"})
    out.sort(key=lambda d: -abs(d["contribution"]))
    return [{**d, "contribution": round(d["contribution"], 4), "direction": "raises risk" if d["contribution"] > 0 else "lowers risk"}
            for d in out[:top]]
