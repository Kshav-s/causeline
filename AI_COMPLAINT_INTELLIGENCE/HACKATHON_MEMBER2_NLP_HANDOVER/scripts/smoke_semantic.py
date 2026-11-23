"""Smoke-test the cached MiniLM embeddings without re-running SBERT."""
import numpy as np, joblib
from src.config import EMBEDDINGS_PATH, EMB_META_PATH

e = np.load(EMBEDDINGS_PATH)
meta = joblib.load(EMB_META_PATH)
q = e[0:1]
sims = (e @ q.T).ravel()
idx = np.argsort(-sims)[:5]
print("Top-5 cosine neighbours for row 0:")
for i in idx:
    r = meta.iloc[int(i)]
    print(f"  sim={sims[int(i)]:.3f}  cat={r['complaint_category']!r}  sub={r['defect_subcategory']!r}")
print("OK")
