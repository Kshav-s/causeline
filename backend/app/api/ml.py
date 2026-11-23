from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import client_ip, get_current_user
from app.core.ratelimit import inference_limiter
from app.database.session import get_db
from app.ml.preprocessing import CAT
from app.ml.registry import registry
from app.models import Complaint, ModelVersion, Prediction, User
from app.schemas.common import AnalyzeTextIn, BatchRiskIn, ReviewIn
from app.services import ml_service

router = APIRouter(prefix="/api/ml", tags=["ml"])


def prediction_out(p: Prediction, users: dict[int, str] | None = None) -> dict:
    mv = p.model_version
    return {"id": p.id, "reference": p.reference, "run_id": p.run_id, "status": p.status, "subject_type": p.subject_type,
            "complaint_pk": p.complaint_pk,
            "model": {"key": mv.model_key, "version": mv.version, "name": mv.name, "kind": mv.kind, "status": mv.status,
                      "confidence_supported": mv.confidence_supported, "low_confidence_threshold": mv.low_confidence_threshold,
                      "limitations": mv.limitations, "metrics": mv.metrics},
            "input": p.input_payload, "output": p.output_payload, "top_label": p.top_label, "top_score": p.top_score,
            "low_confidence": p.low_confidence, "message": p.message, "review_status": p.review_status,
            "reviews": [{"action": r.action, "corrected_label": r.corrected_label, "reason": r.reason,
                         "reviewer": (users or {}).get(r.reviewer_id, r.reviewer_id), "created_at": r.created_at.isoformat()} for r in p.reviews],
            "created_at": p.created_at.isoformat()}


def _users(db: Session) -> dict[int, str]:
    return dict(db.execute(select(User.id, User.full_name)).all())


@router.get("/models")
def list_models(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    live = {d["model_key"]: d for d in registry.describe()}
    hist = db.scalars(select(ModelVersion).order_by(ModelVersion.model_key, desc(ModelVersion.created_at))).all()
    counts = dict(db.execute(select(Prediction.model_version_id, func.count()).group_by(Prediction.model_version_id)).all())
    versions = [{"model_key": v.model_key, "version": v.version, "status": v.status, "predictions": counts.get(v.id, 0),
                 "created_at": v.created_at.isoformat()} for v in hist]
    return {"models": list(live.values()), "versions": versions}


@router.get("/labels/{model_key}")
def labels(model_key: str, user: User = Depends(get_current_user)):
    if model_key not in registry.models:
        raise HTTPException(404, "Unknown model")
    return {"model_key": model_key, "labels": ml_service.labels_for(model_key)}


@router.post("/analyze/complaint/{complaint_id}", dependencies=[Depends(inference_limiter)])
def analyze_complaint(complaint_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == complaint_id))
    if not c:
        raise HTTPException(404, "Complaint not found")
    run_id = ml_service.analyze_complaint(db, c, user, client_ip(request))
    return get_run(run_id, user, db)


@router.post("/analyze/text", dependencies=[Depends(inference_limiter)])
def analyze_text(body: AnalyzeTextIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not body.text.strip():
        raise HTTPException(422, "Complaint text cannot be empty")
    run_id = ml_service.analyze_text(db, user, body.text, body.complaint_category, body.food_family, client_ip(request))
    return get_run(run_id, user, db)


@router.get("/runs/{run_id}")
def get_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    preds = db.scalars(select(Prediction).options(selectinload(Prediction.reviews)).where(Prediction.run_id == run_id).order_by(Prediction.id)).all()
    if not preds:
        raise HTTPException(404, "Analysis run not found")
    u = _users(db)
    return {"run_id": run_id, "created_at": preds[0].created_at.isoformat(), "created_by": u.get(preds[0].created_by_id),
            "complaint_pk": preds[0].complaint_pk, "predictions": {p.model_version.model_key: prediction_out(p, u) for p in preds}}


@router.get("/complaints/{complaint_pk}/runs")
def complaint_runs(complaint_pk: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Full prediction history for a complaint - every model version, never overwritten."""
    preds = db.scalars(select(Prediction).options(selectinload(Prediction.reviews)).where(Prediction.complaint_pk == complaint_pk)
                       .order_by(desc(Prediction.created_at), Prediction.id)).all()
    u = _users(db)
    runs: dict[str, dict] = {}
    for p in preds:
        r = runs.setdefault(p.run_id, {"run_id": p.run_id, "created_at": p.created_at.isoformat(), "created_by": u.get(p.created_by_id), "predictions": {}})
        r["predictions"][p.model_version.model_key] = prediction_out(p, u)
    return {"runs": list(runs.values())}


@router.get("/predictions")
def list_predictions(review_status: str | None = Query(None, pattern="^(pending|confirmed|rejected|corrected)$"),
                     model_key: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = select(Prediction).join(ModelVersion, Prediction.model_version_id == ModelVersion.id)
    if review_status:
        s = s.where(Prediction.review_status == review_status)
    if model_key:
        s = s.where(ModelVersion.model_key == model_key)
    total = db.scalar(select(func.count()).select_from(s.subquery()))
    items = db.scalars(s.options(selectinload(Prediction.reviews)).order_by(desc(Prediction.created_at)).offset((page - 1) * page_size).limit(page_size)).all()
    cids = {p.complaint_pk for p in items if p.complaint_pk}
    cmap = dict(db.execute(select(Complaint.id, Complaint.complaint_id).where(Complaint.id.in_(cids))).all()) if cids else {}
    u = _users(db)
    return {"items": [{**prediction_out(p, u), "complaint_id": cmap.get(p.complaint_pk)} for p in items], "total": total}


@router.post("/predictions/{reference}/review")
def review(reference: str, body: ReviewIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.scalar(select(Prediction).where(Prediction.reference == reference))
    if not p:
        raise HTTPException(404, "Prediction not found")
    p = ml_service.review_prediction(db, p, user, body.action, body.corrected_label, body.reason, client_ip(request))
    return prediction_out(p, _users(db))


@router.get("/batch-risk/options")
def batch_options(user: User = Depends(get_current_user)):
    lm = registry.get("batch-risk")
    if not lm.obj:
        raise HTTPException(503, f"Batch risk model unavailable: {lm.reason}")
    return {"categorical_levels": {c: lm.obj["category_levels"][c] for c in CAT}, "tier_thresholds": lm.obj["tier_thresholds"],
            "status": lm.status, "status_reason": lm.reason, "metrics": lm.spec.metrics, "limitations": lm.spec.limitations}


@router.post("/batch-risk", dependencies=[Depends(inference_limiter)])
def batch_risk(body: BatchRiskIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = ml_service.score_batch(db, user, body.model_dump(), client_ip(request))
    return prediction_out(p, _users(db))
