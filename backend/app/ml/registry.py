"""Model registry: specs, one-time artifact loading, integrity hashes and readiness status.

Artifacts are referenced in place (the supplied packages are never modified). Each model's
status is one of: ready | degraded | blocked | loading. The registry is synced into the
model_versions table at startup so every prediction can reference the exact version used.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.core.config import REPO_ROOT, get_settings
from app.ml.preprocessing import PREPROCESSING_VERSIONS

log = logging.getLogger("causeline.ml")

SYNTHETIC_NOTE = "Trained on synthetic demonstration data (SYNTHETIC_ABT_CPD); not verified company performance."


@dataclass
class ModelSpec:
    key: str
    version: str
    name: str
    purpose: str
    kind: str
    preprocessing_version: str
    input_schema: dict
    output_schema: dict
    metrics: dict
    limitations: list[str]
    confidence_supported: bool = False
    low_confidence_threshold: float | None = None
    artifacts: list[Path] = field(default_factory=list)


@dataclass
class LoadedModel:
    spec: ModelSpec
    status: str = "blocked"
    reason: str | None = None
    obj: Any = None
    sha256: dict = field(default_factory=dict)
    validated_at: datetime | None = None


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _rel(p: Path) -> str:
    try:
        return p.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(p)


def build_specs() -> dict[str, ModelSpec]:
    s = get_settings()
    nm, ml, rp = s.nlp_dir / "models", s.ml_dir, s.reproduced_dir
    text_in = {"text": "string, complaint summary and/or description; must be non-empty after cleaning"}
    return {
        "nlp-category": ModelSpec(
            key="nlp-category", version="0.1.0", name="Complaint category classifier",
            purpose="Classifies complaint text into one of 10 complaint categories.",
            kind="ml", preprocessing_version=PREPROCESSING_VERSIONS["nlp"],
            input_schema=text_in,
            output_schema={"predictions": "top-k [{label, probability}] over 10 classes"},
            metrics={"reported_accuracy": 1.0, "reported_macro_f1": 1.0,
                     "note": "Perfect scores are a synthetic-data artifact (template text). On 5 hand-written complaints top-1 confidence ranged 0.15-0.74 with 4/5 correct."},
            limitations=["Learned templated synthetic text; confidence on real wording is low and spread.",
                         "Probabilities are not calibrated - show as a ranked shortlist.", SYNTHETIC_NOTE],
            confidence_supported=True, low_confidence_threshold=0.5,
            artifacts=[nm / "tfidf_logreg.joblib", nm / "label_encoder.joblib"]),
        "nlp-subcategory": ModelSpec(
            key="nlp-subcategory", version="0.1.0", name="Defect subcategory classifier",
            purpose="Classifies complaint text into one of 74 defect subcategories.",
            kind="ml", preprocessing_version=PREPROCESSING_VERSIONS["nlp"], input_schema=text_in,
            output_schema={"predictions": "top-k [{label, probability}] over 74 classes"},
            metrics={"reported_accuracy": 1.0, "reported_macro_f1": 1.0, "note": "Synthetic-data artifact; see category model."},
            limitations=["Subcategory labels are template sentences from the synthetic data.", SYNTHETIC_NOTE],
            confidence_supported=True, low_confidence_threshold=0.5,
            artifacts=[nm / "tfidf_logreg_subcat.joblib", nm / "label_encoder_subcat.joblib"]),
        "nlp-similarity": ModelSpec(
            key="nlp-similarity", version="0.1.0", name="Similar complaint retrieval",
            purpose="Finds historically similar complaints by cosine similarity of all-MiniLM-L6-v2 embeddings.",
            kind="retrieval", preprocessing_version="raw text -> SentenceTransformer.encode(normalize_embeddings=True)",
            input_schema={**text_in, "top_k": "1-25", "exclude_complaint_id": "optional"},
            output_schema={"results": "[{complaint_id, complaint_received_date, complaint_category, defect_subcategory, product_name, complaint_summary, similarity}]"},
            metrics={"index_rows": 18000, "embedding_dim": 384},
            limitations=["Index covers the 18,000 supplied historical complaints only; complaints added later are not searchable until the index is rebuilt.",
                         "Similarity is a cosine score, not a probability.",
                         "Query text is encoded raw (as in the shipped API) while the index was built from cleaned text.", SYNTHETIC_NOTE],
            artifacts=[nm / "complaint_embeddings.npy", nm / "complaint_embeddings_index.joblib"]),
        "food-safety-flag": ModelSpec(
            key="food-safety-flag", version="0.1.0", name="Food-safety escalation rule",
            purpose="Keyword + category heuristic that flags complaints for food-safety review.",
            kind="rule", preprocessing_version="lowercase substring match",
            input_schema={"text": "string", "top_category": "optional string"},
            output_schema={"escalate_for_food_safety_review": "bool", "reason_keywords": "list", "reason_category_in_safety_bucket": "bool"},
            metrics={}, limitations=["Substring matching produces false positives (e.g. 'ill' in 'spill').",
                                     "Not a food-safety determination; human review required."]),
        "root-cause": ModelSpec(
            key="root-cause", version="1.0.0-reproduced", name="Root-cause hypothesis model",
            purpose="Suggests the 3 most likely root-cause categories for a complaint, to prioritise investigation.",
            kind="ml", preprocessing_version=PREPROCESSING_VERSIONS["root_cause"],
            input_schema={"complaint_summary": "string|null", "complaint_description": "string (required)",
                          "defect_subcategory": "string|null", "complaint_category": "string (required, recorded or human-verified)",
                          "food_family": "string (required)"},
            output_schema={"hypotheses": "top-3 [{cause, probability}] over 36 classes"},
            metrics={"top1_accuracy": 0.4003, "top3_accuracy": 0.874, "macro_f1": 0.3944,
                     "baseline_top1_by_complaint_category": 0.3026, "split": "random 80/20 (not temporal)"},
            limitations=["Hypotheses only - never a confirmed root cause.",
                         "Reproduced on 2026-11-23 from the original training code (exact metric and prediction match) because the original was never saved.",
                         "Random split; may overstate performance on future complaints.", SYNTHETIC_NOTE],
            confidence_supported=True, low_confidence_threshold=0.4,
            artifacts=[rp / "root_cause_v1" / "root_cause_model.joblib"]),
        "batch-risk": ModelSpec(
            key="batch-risk", version="0.1.0", name="Batch 30-day complaint risk",
            purpose="Ranks a production batch by risk of >=1 customer complaint within 30 days of dispatch.",
            kind="ml", preprocessing_version=PREPROCESSING_VERSIONS["batch"],
            input_schema={"fields": "12 numeric + 13 categorical batch attributes + production_date + dispatch_date"},
            output_schema={"risk_score": "uncalibrated LR score 0-1", "risk_tier": "Low|Medium|High",
                           "factors": "linear log-odds contributions"},
            metrics={"test_roc_auc": 0.5539, "test_roc_auc_95ci": [0.519, 0.586], "test_pr_auc": 0.1067,
                     "prevalence": 0.0808, "high_tier_lift": 1.51, "split": "temporal (train 2007-21, val 2021-23, test 2023-25)"},
            limitations=["Weak predictive signal (ROC-AUC 0.55). Use tiers only to prioritise extra checks, never as a release/hold rule.",
                         "Scores are not calibrated probabilities (balanced class weights, Brier 0.24).", SYNTHETIC_NOTE],
            artifacts=[ml / "models" / "batch_risk_model.joblib"]),
    }


class ModelRegistry:
    def __init__(self):
        self.models: dict[str, LoadedModel] = {}
        self._lock = threading.Lock()
        self.on_status_change = None  # callable(key) set by the app to persist late status changes (C5)

    # ------------------------------------------------------------ loading
    def load_all(self, load_sbert: bool | None = None) -> None:
        specs = build_specs()
        for key, spec in specs.items():
            self.models[key] = LoadedModel(spec=spec)
        self._load_joblib_pair("nlp-category")
        self._load_joblib_pair("nlp-subcategory")
        self._load_rule("food-safety-flag")
        self._load_root_cause()
        self._load_batch()
        self._load_similarity_index()
        if load_sbert if load_sbert is not None else get_settings().enable_sbert:
            threading.Thread(target=self._load_sbert, daemon=True, name="sbert-loader").start()
        elif self.models["nlp-similarity"].status != "blocked":
            self._set("nlp-similarity", "degraded", "Sentence encoder disabled (ENABLE_SBERT=false); similarity search unavailable.")

    def _hash_artifacts(self, lm: LoadedModel) -> bool:
        missing = [p for p in lm.spec.artifacts if not p.exists()]
        if missing:
            lm.status, lm.reason = "blocked", "Missing artifact(s): " + ", ".join(_rel(p) for p in missing)
            return False
        lm.sha256 = {_rel(p): _sha256(p) for p in lm.spec.artifacts}
        return True

    def _set(self, key, status, reason=None, obj=None):
        lm = self.models[key]
        lm.status, lm.reason = status, reason
        if obj is not None:
            lm.obj = obj
        if status in ("ready", "degraded"):
            lm.validated_at = datetime.now(timezone.utc)
        if self.on_status_change:
            try:
                self.on_status_change(key)
            except Exception:  # noqa: BLE001 - persistence problems must never break model loading
                log.exception("could not persist status change for %s", key)

    def _strict_load(self, path: Path):
        with warnings.catch_warnings():
            warnings.simplefilter("error")  # InconsistentVersionWarning -> refuse to load
            return joblib.load(path)

    def _load_joblib_pair(self, key: str):
        lm = self.models[key]
        if not self._hash_artifacts(lm):
            return
        try:
            model, enc = (self._strict_load(p) for p in lm.spec.artifacts)
            n = len(enc.classes_)
            if not np.array_equal(model.named_steps["clf"].classes_, np.arange(n)):
                raise ValueError("classifier classes do not align with label encoder")
            probe = model.predict_proba(["sealed pack contained a hard plastic fragment"])
            if probe.shape != (1, n) or not np.isclose(probe.sum(), 1.0):
                raise ValueError(f"unexpected probe output shape {probe.shape}")
            self._set(key, "ready", obj={"model": model, "classes": [str(c) for c in enc.classes_]})
        except Exception as e:  # noqa: BLE001
            self._set(key, "blocked", f"Load/validation failed: {type(e).__name__}: {e}")

    def _load_rule(self, key):
        self._set(key, "ready")

    def _load_root_cause(self):
        lm = self.models["root-cause"]
        if not self._hash_artifacts(lm):
            lm.reason += " - run scripts/reproduce_root_cause_model.py"
            return
        try:
            bundle = self._strict_load(lm.spec.artifacts[0])
            prov = json.loads((lm.spec.artifacts[0].parent / "provenance.json").read_text())
            if prov.get("sha256") != lm.sha256[_rel(lm.spec.artifacts[0])]:
                raise ValueError("artifact hash does not match provenance.json")
            if not prov.get("published_metrics_match"):
                raise ValueError("reproduction was not verified against published metrics")
            self._set("root-cause", "ready", obj=bundle)
        except Exception as e:  # noqa: BLE001
            self._set("root-cause", "blocked", f"Load/validation failed: {type(e).__name__}: {e}")

    def _load_batch(self):
        lm = self.models["batch-risk"]
        if not self._hash_artifacts(lm):
            return
        try:
            b = self._strict_load(lm.spec.artifacts[0])
            for k in ("pipeline", "threshold", "tier_thresholds", "features", "model"):
                if k not in b:
                    raise ValueError(f"bundle missing '{k}'")
            pre = b["pipeline"].named_steps["prep"]
            cat_cols = list(pre.transformers_[1][2])
            oh = pre.named_transformers_["cat"].named_steps["oh"]
            levels = {c: [str(x) for x in cats] for c, cats in zip(cat_cols, oh.categories_)}
            b["category_levels"] = levels
            b["feature_names_out"] = list(pre.get_feature_names_out())
            self._set("batch-risk", "degraded",
                      "Loaded and validated. Marked 'degraded' because test ROC-AUC is 0.55 (weak signal): tiers are for prioritisation only.", obj=b)
        except Exception as e:  # noqa: BLE001
            self._set("batch-risk", "blocked", f"Load/validation failed: {type(e).__name__}: {e}")

    def _load_similarity_index(self):
        lm = self.models["nlp-similarity"]
        if not self._hash_artifacts(lm):
            return
        try:
            emb = np.load(lm.spec.artifacts[0])
            meta = joblib.load(lm.spec.artifacts[1])
            if emb.ndim != 2 or emb.shape[0] != len(meta):
                raise ValueError(f"embedding/meta mismatch {emb.shape} vs {len(meta)}")
            norms = np.linalg.norm(emb, axis=1)
            if not np.allclose(norms, 1.0, atol=1e-3):
                emb = emb / np.clip(norms, 1e-12, None)[:, None]
            lm.obj = {"emb": emb.astype(np.float32), "meta": meta.reset_index(drop=True), "encoder": None}
            lm.status, lm.reason = "loading", "Index loaded; sentence encoder not yet loaded."
        except Exception as e:  # noqa: BLE001
            self._set("nlp-similarity", "blocked", f"Index load failed: {type(e).__name__}: {e}")

    def _load_sbert(self):
        lm = self.models["nlp-similarity"]
        if lm.status == "blocked" or lm.obj is None:
            return
        try:
            from sentence_transformers import SentenceTransformer
            enc = SentenceTransformer(get_settings().sbert_model_name)
            q = enc.encode(["probe"], convert_to_numpy=True, normalize_embeddings=True)
            if q.shape[1] != lm.obj["emb"].shape[1]:
                raise ValueError(f"encoder dim {q.shape[1]} != index dim {lm.obj['emb'].shape[1]}")
            with self._lock:
                lm.obj["encoder"] = enc
            self._set("nlp-similarity", "ready")
            log.info("SBERT encoder ready")
        except Exception as e:  # noqa: BLE001
            self._set("nlp-similarity", "degraded", f"Sentence encoder unavailable ({type(e).__name__}: {e}); similarity search disabled.")

    # ------------------------------------------------------------ access
    def get(self, key: str) -> LoadedModel:
        return self.models[key]

    def usable(self, key: str) -> bool:
        lm = self.models.get(key)
        return bool(lm and lm.status in ("ready", "degraded") and (key != "nlp-similarity" or lm.status == "ready"))

    def describe(self) -> list[dict]:
        out = []
        for lm in self.models.values():
            s = lm.spec
            out.append({"model_key": s.key, "version": s.version, "name": s.name, "purpose": s.purpose, "kind": s.kind,
                        "status": lm.status, "status_reason": lm.reason, "artifact_paths": [_rel(p) for p in s.artifacts],
                        "artifact_sha256": lm.sha256, "input_schema": s.input_schema, "output_schema": s.output_schema,
                        "preprocessing_version": s.preprocessing_version, "metrics": s.metrics, "limitations": s.limitations,
                        "confidence_supported": s.confidence_supported, "low_confidence_threshold": s.low_confidence_threshold,
                        "last_validated_at": lm.validated_at.isoformat() if lm.validated_at else None})
        return out


registry = ModelRegistry()
