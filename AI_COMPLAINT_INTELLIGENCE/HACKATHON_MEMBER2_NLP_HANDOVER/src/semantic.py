"""Semantic similarity using Sentence Transformers (all-MiniLM-L6-v2)."""
from __future__ import annotations

from typing import List

import joblib
import numpy as np
import pandas as pd

from .config import (
    EMB_META_PATH,
    EMBEDDINGS_PATH,
    ID_COL,
    SBERT_MODEL_NAME,
    TARGET_PRIMARY,
)
from .data_loader import load_complaints
from .preprocess import build_text_series

_model = None


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(SBERT_MODEL_NAME)
    return _model


def build_index() -> None:
    df = load_complaints()
    texts = build_text_series(df).tolist()
    model = get_model()
    emb = model.encode(
        texts, batch_size=64, show_progress_bar=True,
        convert_to_numpy=True, normalize_embeddings=True,
    ).astype(np.float32)

    meta_cols = [c for c in (ID_COL, TARGET_PRIMARY, "defect_subcategory",
                             "complaint_summary", "complaint_received_date",
                             "product_id", "batch_id") if c in df.columns]
    meta = df[meta_cols].copy()

    np.save(EMBEDDINGS_PATH, emb)
    joblib.dump(meta, EMB_META_PATH)
    print(f"Saved embeddings: {emb.shape} -> {EMBEDDINGS_PATH}")


def _load_index():
    emb = np.load(EMBEDDINGS_PATH)
    meta = joblib.load(EMB_META_PATH)
    return emb, meta


def search(query: str, top_k: int = 5) -> List[dict]:
    emb, meta = _load_index()
    model = get_model()
    q = model.encode([query], convert_to_numpy=True,
                     normalize_embeddings=True).astype(np.float32)
    sims = (emb @ q.T).ravel()
    idx = np.argsort(-sims)[:top_k]
    out = []
    for i in idx:
        row = meta.iloc[int(i)].to_dict()
        row["similarity"] = float(sims[int(i)])
        # pandas Timestamp -> str
        for k, v in list(row.items()):
            if isinstance(v, pd.Timestamp):
                row[k] = v.isoformat()
        out.append(row)
    return out


if __name__ == "__main__":
    build_index()
