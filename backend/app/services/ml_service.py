"""ML orchestration: registry->DB sync, analysis runs, prediction persistence, human review."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import get_settings
from app.ml import engines
from app.ml.engines import EngineResult
from app.ml.preprocessing import nlp_input_text
from app.ml.registry import registry
from app.models import Complaint, ModelVersion, Prediction, PredictionReview, User

REVIEWABLE = {"nlp-category", "nlp-subcategory", "root-cause"}


def sync_model_versions(db: Session) -> None:
    """Upsert one model_versions row per (key, version). Old versions are never deleted."""
    for d in registry.describe():
        mv = db.scalar(select(ModelVersion).where(ModelVersion.model_key == d["model_key"], ModelVersion.version == d["version"]))
        if mv is None:
            mv = ModelVersion(model_key=d["model_key"], version=d["version"])
            db.add(mv)
        for f in ("name", "purpose", "kind", "artifact_paths", "artifact_sha256", "input_schema", "output_schema",
                  "preprocessing_version", "metrics", "limitations", "confidence_supported", "low_confidence_threshold"):
            setattr(mv, f, d[f])
        mv.status, mv.status_reason = d["status"], d["status_reason"]
        mv.last_validated_at = datetime.fromisoformat(d["last_validated_at"]) if d["last_validated_at"] else None
    db.commit()


def _model_version(db: Session, key: str) -> ModelVersion:
    spec = registry.get(key).spec
    mv = db.scalar(select(ModelVersion).where(ModelVersion.model_key == key, ModelVersion.version == spec.version))
    if mv is None:
        sync_model_versions(db)
        mv = db.scalar(select(ModelVersion).where(ModelVersion.model_key == key, ModelVersion.version == spec.version))
    return mv


def _persist(db: Session, run_id: str, r: EngineResult, input_payload: dict, user: User | None,
             complaint: Complaint | None, subject_type: str) -> Prediction:
    out = dict(r.output or {})
    if r.warnings:
        out["warnings"] = r.warnings
    p = Prediction(reference=f"TMP-{uuid.uuid4().hex[:12]}", run_id=run_id, model_version_id=_model_version(db, r.model_key).id,
                   complaint_pk=complaint.id if complaint else None, subject_type=subject_type,
                   input_payload=input_payload, output_payload=out or None, status=r.status,
                   top_label=r.top_label, top_score=r.top_score, low_confidence=r.low_confidence, message=r.message,
                   review_status="pending" if (r.status == "completed" and r.model_key in REVIEWABLE) else "not_applicable",
                   created_by_id=user.id if user else None)
    db.add(p)
    db.flush()
    p.reference = f"PRD-{p.id:06d}"
    return p


def analyze_complaint(db: Session, complaint: Complaint, user: User | None, ip: str | None = None) -> str:
    text = nlp_input_text(complaint.complaint_summary, complaint.complaint_description)
    return _run(db, user, ip, text=text, complaint=complaint,
                rc_fields=dict(complaint_summary=complaint.complaint_summary, complaint_description=complaint.complaint_description,
                               defect_subcategory=complaint.defect_subcategory if complaint.category_source != "model" else None,
                               complaint_category=complaint.complaint_category, food_family=complaint.food_family),
                exclude_id=complaint.complaint_id)


def analyze_text(db: Session, user: User, text: str, complaint_category: str | None, food_family: str | None,
                 ip: str | None = None) -> str:
    return _run(db, user, ip, text=text, complaint=None,
                rc_fields=dict(complaint_summary=None, complaint_description=text, defect_subcategory=None,
                               complaint_category=complaint_category, food_family=food_family), exclude_id=None)


def _remote_analyze(text: str, exclude_id: str | None) -> list[EngineResult]:
    """Call an external NLP service implementing the handover's documented POST /analyze contract (unchanged request
    schema). Response is validated; anything unexpected raises so the caller can fall back to in-process inference."""
    import httpx
    s = get_settings()
    url = s.nlp_service_url.rstrip("/") + "/analyze"
    r = httpx.post(url, json={"text": text, "top_k_similar": 5, "exclude_complaint_id": exclude_id}, timeout=s.nlp_service_timeout_s)
    if r.status_code == 400:
        return [EngineResult(k, "insufficient_data", message="Empty text after cleaning (reported by NLP service)")
                for k in ("nlp-category", "nlp-subcategory", "food-safety-flag", "nlp-similarity")]
    r.raise_for_status()
    j = r.json()
    c = j["classification"]
    served = {"served_by": f"remote:{s.nlp_service_url}", "disclaimer": j.get("disclaimer")}

    def shortlist(key, preds):
        if not isinstance(preds, list) or not preds:
            raise ValueError(f"{key}: missing predictions")
        out = [{"label": str(p["label"]), "probability": round(float(p["probability"]), 4)} for p in preds]
        if any(not 0 <= p["probability"] <= 1 for p in out) or sum(p["probability"] for p in out) > 1.0001:
            raise ValueError(f"{key}: invalid probabilities")
        thr = registry.get(key).spec.low_confidence_threshold
        return EngineResult(key, "completed", top_label=out[0]["label"], top_score=out[0]["probability"], low_confidence=out[0]["probability"] < thr,
                            output={"predictions": out, "confidence_note": "Uncalibrated logistic-regression probability; treat as a ranking.", **served})
    res = [shortlist("nlp-category", c["category_predictions"])]
    res.append(shortlist("nlp-subcategory", c["subcategory_predictions"]) if c.get("subcategory_predictions")
               else EngineResult("nlp-subcategory", "error", message="NLP service returned no subcategory"))
    fs = j["food_safety_flag"]
    res.append(EngineResult("food-safety-flag", "completed", output={**fs, **served},
                            top_label="Escalate for food-safety review" if fs["escalate_for_food_safety_review"] else "No escalation trigger"))
    if j.get("similar_error"):
        res.append(EngineResult("nlp-similarity", "error", message=f"NLP service: {j['similar_error']}"))
    else:
        sims = [{k: row.get(k) for k in ("complaint_id", "complaint_received_date", "complaint_category", "defect_subcategory", "product_name", "complaint_summary")}
                | {"similarity": round(float(row["similarity"]), 4)} for row in j.get("similar", [])]
        res.append(EngineResult("nlp-similarity", "completed", output={"results": sims, "metric": "cosine similarity (not a probability)", **served},
                                top_label=sims[0]["complaint_id"] if sims else None, top_score=sims[0]["similarity"] if sims else None))
    return res


def _nlp_results(text: str, exclude_id: str | None) -> list[EngineResult]:
    if get_settings().nlp_service_url:
        try:
            return _remote_analyze(text, exclude_id)
        except Exception as e:  # noqa: BLE001 - any remote problem -> verified in-process models, and say so
            fallback = f"External NLP service unavailable ({type(e).__name__}); results produced by the identical in-process models."
            out = _local_nlp(text, exclude_id)
            for r in out:
                r.warnings.append(fallback)
            return out
    return _local_nlp(text, exclude_id)


def _local_nlp(text: str, exclude_id: str | None) -> list[EngineResult]:
    cat = engines.classify("nlp-category", text)
    return [cat, engines.classify("nlp-subcategory", text), engines.food_safety(text, cat.top_label), engines.similar(text, 5, exclude_id)]


def analysis_status_of(results: list[EngineResult]) -> str:
    return "partial" if any(r.status == "error" for r in results) else "completed"


def _run(db, user, ip, text, complaint, rc_fields, exclude_id) -> str:
    run_id = str(uuid.uuid4())
    subject = "complaint" if complaint else "text"
    base_in = {"text": text, "complaint_id": complaint.complaint_id if complaint else None}
    results = _nlp_results(text, exclude_id)
    cat = next(r for r in results if r.model_key == "nlp-category")
    extra_in = {"food-safety-flag": {"top_category": cat.top_label}, "nlp-similarity": {"top_k": 5, "exclude_complaint_id": exclude_id}}
    for r in results:
        _persist(db, run_id, r, {**base_in, **extra_in.get(r.model_key, {})}, user, complaint, subject)
    rc = engines.root_cause(**rc_fields)
    _persist(db, run_id, rc, rc_fields, user, complaint, subject)
    if complaint is not None:
        complaint.analysis_status = analysis_status_of([*results, rc])
        complaint.analysis_attempts = (complaint.analysis_attempts or 0) + 1
        complaint.last_analysis_at = datetime.now(timezone.utc)
    audit(db, "ml.analyze", user.id if user else None, "complaint" if complaint else "text",
          complaint.complaint_id if complaint else run_id, {"run_id": run_id, "public": user is None}, ip)
    db.commit()
    return run_id


def score_batch(db: Session, user: User, record: dict, ip: str | None = None) -> Prediction:
    run_id = str(uuid.uuid4())
    r = engines.batch_risk(record)
    serial = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in record.items()}
    p = _persist(db, run_id, r, serial, user, None, "batch")
    audit(db, "ml.batch_risk", user.id, "batch", record.get("batch_id") or run_id, {"run_id": run_id, "tier": r.top_label}, ip)
    db.commit()
    return p


def review_prediction(db: Session, pred: Prediction, user: User, action: str, corrected_label: str | None,
                      reason: str | None, ip: str | None = None) -> Prediction:
    if pred.review_status == "not_applicable":
        raise HTTPException(400, "This output is not reviewable (rule, retrieval, or non-completed result).")
    if action == "corrected":
        if not corrected_label:
            raise HTTPException(422, "corrected_label is required when correcting a prediction")
        valid = _valid_labels(pred.model_version.model_key)
        if valid and corrected_label not in valid:
            raise HTTPException(422, "corrected_label is not a known label for this model")
    if action in ("rejected", "corrected") and not (reason or "").strip():
        raise HTTPException(422, "A reason is required when rejecting or correcting")
    db.add(PredictionReview(prediction_id=pred.id, action=action, corrected_label=corrected_label, reason=reason, reviewer_id=user.id))
    pred.review_status = action
    # Human-verified category flows to the complaint only when no recorded category exists.
    if pred.complaint_pk and pred.model_version.model_key == "nlp-category" and action in ("confirmed", "corrected"):
        c = db.get(Complaint, pred.complaint_pk)
        if c and (not c.complaint_category or c.category_source == "human_verified"):
            c.complaint_category = corrected_label if action == "corrected" else pred.top_label
            c.category_source = "human_verified"
            c.updated_by_id = user.id
    audit(db, f"prediction.{action}", user.id, "prediction", pred.reference,
          {"corrected_label": corrected_label, "reason": reason, "model": pred.model_version.model_key}, ip)
    db.commit()
    db.refresh(pred)
    return pred


def _valid_labels(key: str) -> list[str] | None:
    lm = registry.get(key)
    if key in ("nlp-category", "nlp-subcategory") and lm.obj:
        return lm.obj["classes"]
    if key == "root-cause" and lm.obj:
        return list(lm.obj["classes"])
    return None


def labels_for(key: str) -> list[str]:
    return _valid_labels(key) or []
