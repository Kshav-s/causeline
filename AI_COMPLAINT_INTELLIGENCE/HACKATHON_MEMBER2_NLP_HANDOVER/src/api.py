"""FastAPI service for Module 02 — AI Complaint Intelligence.

Loads pre-trained artifacts; never retrains. Semantic endpoints degrade
gracefully (503) when sentence-transformers is unavailable instead of
breaking the whole service.
"""
from __future__ import annotations

from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .analytics import (
    emerging_defects,
    monthly_trends,
    pareto,
    recurring_defects,
)
from .config import (
    EMBEDDINGS_PATH,
    EMB_META_PATH,
    LABEL_ENCODER_PATH,
    SBERT_MODEL_NAME,
    SUBCAT_ENCODER_PATH,
    SUBCAT_MODEL_PATH,
    SYNTHETIC_DISCLAIMER,
    TFIDF_MODEL_PATH,
)
from .data_loader import load_complaints
from .preprocess import clean_text

# --- food-safety escalation keywords (text heuristic, NOT a safety determination)
SAFETY_KEYWORDS = {
    "metal", "glass", "plastic", "needle", "blood", "sick", "ill", "nausea",
    "vomit", "allergen", "allergic", "mold", "mould", "contamination",
    "contaminated", "insect", "pest", "rodent", "foreign", "sharp",
    "microbial", "spoil", "spoiled", "spoilage", "unsafe", "hospital",
    "poisoning", "salmonella", "listeria", "ecoli", "e. coli",
}
SAFETY_CATEGORIES = {
    "Contamination / microbiological",
    "Infestation / pest",
    "Labelling / allergen issue",
    "Physical defect / foreign matter",
}


app = FastAPI(
    title="Food Quality Complaint Intelligence (Module 02)",
    version="0.1.0",
    description=SYNTHETIC_DISCLAIMER,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- lazy state ----------
_state: dict = {}


def _load_primary():
    if "model" not in _state:
        if not TFIDF_MODEL_PATH.exists():
            raise HTTPException(503, "Primary model artifact missing.")
        _state["model"] = joblib.load(TFIDF_MODEL_PATH)
        _state["enc"] = joblib.load(LABEL_ENCODER_PATH)
    return _state["model"], _state["enc"]


def _load_subcat():
    if "sub_model" not in _state:
        if not SUBCAT_MODEL_PATH.exists():
            return None, None
        _state["sub_model"] = joblib.load(SUBCAT_MODEL_PATH)
        _state["sub_enc"] = joblib.load(SUBCAT_ENCODER_PATH)
    return _state.get("sub_model"), _state.get("sub_enc")


def _load_embeddings():
    if "emb" not in _state:
        if not EMBEDDINGS_PATH.exists() or not EMB_META_PATH.exists():
            raise HTTPException(503, "Embeddings or embeddings metadata missing.")
        emb = np.load(EMBEDDINGS_PATH)
        meta = joblib.load(EMB_META_PATH)
        # Verify dimensions + normalisation
        if emb.ndim != 2 or emb.shape[0] != len(meta):
            raise HTTPException(500, f"Embedding/meta shape mismatch: {emb.shape} vs meta rows {len(meta)}")
        norms = np.linalg.norm(emb, axis=1)
        if not np.allclose(norms, 1.0, atol=1e-3):
            emb = emb / np.clip(norms, 1e-12, None)[:, None]
        _state["emb"] = emb.astype(np.float32)
        _state["emb_meta"] = meta
        _state["emb_dim"] = int(emb.shape[1])
    return _state["emb"], _state["emb_meta"]


def _load_sbert():
    """Lazy-load SBERT. Returns None if dependency is unavailable."""
    if "sbert_tried" in _state:
        return _state.get("sbert")
    _state["sbert_tried"] = True
    try:
        from sentence_transformers import SentenceTransformer
        _state["sbert"] = SentenceTransformer(SBERT_MODEL_NAME)
        return _state["sbert"]
    except Exception as e:
        _state["sbert_error"] = f"{type(e).__name__}: {e}"
        _state["sbert"] = None
        return None


def _load_df() -> pd.DataFrame:
    if "df" not in _state:
        _state["df"] = load_complaints()
    return _state["df"]


# ---------- helpers ----------
def _safety_flag(text: str, top_category: Optional[str]) -> dict:
    t = (text or "").lower()
    hits = sorted(k for k in SAFETY_KEYWORDS if k in t)
    cat_hit = top_category in SAFETY_CATEGORIES if top_category else False
    escalate = bool(hits) or cat_hit
    return {
        "escalate_for_food_safety_review": escalate,
        "reason_keywords": hits,
        "reason_category_in_safety_bucket": cat_hit,
        "note": (
            "Heuristic escalation flag based on keywords and category. "
            "This is NOT a food-safety determination; human review is required."
        ),
    }


def _topk_from_proba(proba: np.ndarray, classes: np.ndarray, k: int):
    idx = np.argsort(-proba)[:k]
    return [
        {"label": str(classes[i]), "probability": float(proba[i])}
        for i in idx
    ]


# ---------- schemas ----------
class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1, description="complaint summary and/or description")
    top_k: int = Field(3, ge=1, le=10)
    predict_subcategory: bool = True


class SimilarRequest(BaseModel):
    text: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=25)
    exclude_complaint_id: Optional[str] = Field(
        None, description="If provided, filter this complaint_id out of similar results"
    )


class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    top_k_similar: int = Field(5, ge=1, le=25)
    exclude_complaint_id: Optional[str] = None


# ---------- endpoints ----------
@app.get("/health")
def health():
    emb_ok = EMBEDDINGS_PATH.exists() and EMB_META_PATH.exists()
    emb_shape = None
    if emb_ok:
        try:
            e = np.load(EMBEDDINGS_PATH, mmap_mode="r")
            emb_shape = list(e.shape)
        except Exception:
            emb_shape = None
    sbert_available = False
    sbert_error = None
    try:
        from sentence_transformers import SentenceTransformer  # noqa: F401
        sbert_available = True
    except Exception as e:
        sbert_error = f"{type(e).__name__}: {e}"
    return {
        "status": "ok",
        "primary_model_loaded": TFIDF_MODEL_PATH.exists(),
        "subcat_model_loaded": SUBCAT_MODEL_PATH.exists(),
        "embeddings_available": emb_ok,
        "embeddings_shape": emb_shape,
        "sbert_model_name": SBERT_MODEL_NAME,
        "sbert_available": sbert_available,
        "sbert_error": sbert_error,
        "disclaimer": SYNTHETIC_DISCLAIMER,
    }


@app.get("/categories")
def categories():
    _, enc = _load_primary()
    out = {"complaint_category": enc.classes_.tolist()}
    _, sub_enc = _load_subcat()
    if sub_enc is not None:
        out["defect_subcategory"] = sub_enc.classes_.tolist()
    out["disclaimer"] = SYNTHETIC_DISCLAIMER
    return out


@app.post("/classify")
def classify(req: ClassifyRequest):
    model, enc = _load_primary()
    text = clean_text(req.text)
    if not text:
        raise HTTPException(400, "Empty text after cleaning")
    proba = model.predict_proba([text])[0]
    cats = _topk_from_proba(proba, enc.classes_, req.top_k)

    subs = None
    if req.predict_subcategory:
        sub_model, sub_enc = _load_subcat()
        if sub_model is not None:
            sproba = sub_model.predict_proba([text])[0]
            subs = _topk_from_proba(sproba, sub_enc.classes_, req.top_k)

    top_cat = cats[0]["label"] if cats else None
    return {
        "input_text": req.text,
        "category_predictions": cats,
        "top_category": top_cat,
        "top_category_confidence": cats[0]["probability"] if cats else None,
        "subcategory_predictions": subs,
        "top_subcategory": subs[0]["label"] if subs else None,
        "top_subcategory_confidence": subs[0]["probability"] if subs else None,
        "food_safety_flag": _safety_flag(req.text, top_cat),
        "disclaimer": SYNTHETIC_DISCLAIMER,
    }


def _similar_impl(text: str, top_k: int, exclude_id: Optional[str]):
    emb, meta = _load_embeddings()
    sbert = _load_sbert()
    if sbert is None:
        raise HTTPException(
            503,
            "sentence-transformers is not installed in this environment. "
            f"Install it (pip install sentence-transformers) to use semantic "
            f"endpoints. Underlying error: {_state.get('sbert_error')}",
        )
    q = sbert.encode([text], convert_to_numpy=True, normalize_embeddings=True).astype(np.float32)
    if q.shape[1] != emb.shape[1]:
        raise HTTPException(
            500,
            f"Query embedding dim {q.shape[1]} != cached dim {emb.shape[1]}. "
            f"Model mismatch; expected {SBERT_MODEL_NAME}.",
        )
    sims = (emb @ q.T).ravel()
    order = np.argsort(-sims)
    results = []
    for i in order:
        row = meta.iloc[int(i)].to_dict()
        if exclude_id is not None and str(row.get("complaint_id")) == str(exclude_id):
            continue
        for k, v in list(row.items()):
            if isinstance(v, pd.Timestamp):
                row[k] = v.isoformat()
            elif isinstance(v, float) and np.isnan(v):
                row[k] = None
        row["similarity"] = float(sims[int(i)])
        results.append(row)
        if len(results) >= top_k:
            break
    return results


@app.post("/similar")
def similar(req: SimilarRequest):
    results = _similar_impl(req.text, req.top_k, req.exclude_complaint_id)
    return {
        "query": req.text,
        "count": len(results),
        "results": results,
        "disclaimer": SYNTHETIC_DISCLAIMER,
    }


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    classification = classify(ClassifyRequest(text=req.text, top_k=3, predict_subcategory=True))
    try:
        sim_results = _similar_impl(req.text, req.top_k_similar, req.exclude_complaint_id)
        sim_error = None
    except HTTPException as e:
        sim_results = []
        sim_error = e.detail
    return {
        "classification": classification,
        "similar": sim_results,
        "similar_error": sim_error,
        "food_safety_flag": classification["food_safety_flag"],
        "disclaimer": SYNTHETIC_DISCLAIMER,
    }


@app.get("/pareto")
def pareto_endpoint(column: str = "complaint_category"):
    df = _load_df()
    if column not in df.columns:
        raise HTTPException(400, f"Unknown column: {column}")
    p = pareto(df, column)
    return {
        "column": column,
        "rows": p.to_dict(orient="records"),
        "disclaimer": SYNTHETIC_DISCLAIMER,
    }


@app.get("/trends")
def trends(group: Optional[str] = "complaint_category"):
    df = _load_df()
    t = monthly_trends(df, group=group)
    rec = recurring_defects(df)
    em = emerging_defects(df)
    return {
        "monthly": t.to_dict(orient="records"),
        "recurring": rec.to_dict(orient="records") if not rec.empty else [],
        "emerging": em.to_dict(orient="records") if not em.empty else [],
        "disclaimer": SYNTHETIC_DISCLAIMER,
    }
