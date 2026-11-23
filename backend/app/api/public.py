"""Public complaint workflow - no account required (CLAUDE.md change request, 2026-11-23).

Privacy model: a submitter receives a reference ID plus a random access key, shown once. Only a SHA-256 hash of the key
is stored. Full details, photographs and AI results are returned only when the key matches (constant-time compare);
a wrong key gets the same 404 as a missing complaint. The public register exposes no personal data or descriptions.
"""
import hashlib
import hmac
import logging
import secrets
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.analytics.complaints import invalidate_cache
from app.core.audit import audit, notify
from app.core.config import get_settings
from app.core.deps import client_ip
from app.core.ratelimit import RateLimiter
from app.database.session import get_db
from app.models import AuditLog, Complaint, ComplaintAttachment, ModelVersion, Prediction
from app.services import attachments as att
from app.services import ml_service
from app.services.complaint_ids import add_with_unique_id

router = APIRouter(prefix="/api/public", tags=["public"])
log = logging.getLogger("causeline.public")
submit_limiter = RateLimiter(max_calls=get_settings().public_submit_per_hour, per_seconds=3600)
retry_limiter = RateLimiter(max_calls=20, per_seconds=3600)
view_limiter = RateLimiter(max_calls=240, per_seconds=3600)
SEVERITIES = ["Routine", "Major", "Critical"]


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _authorised(db: Session, complaint_id: str, key: str | None) -> Complaint:
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == complaint_id))
    if not c or not c.access_key_hash or not key or not hmac.compare_digest(c.access_key_hash, _hash(key)):
        raise HTTPException(404, "Complaint not found, or the access key is not valid")
    return c


def _duplicate(db: Session, token_hash: str) -> JSONResponse | None:
    """Same form submitted again (double click, network retry, back + resubmit): nothing new is created. The existing
    reference is returned (references are public in the register); the access key is never re-issued."""
    cid = db.scalar(select(Complaint.complaint_id).where(Complaint.submission_token_hash == token_hash))
    if not cid:
        return None
    return JSONResponse(status_code=409, content={
        "detail": f"This complaint has already been submitted as {cid}. It was not created a second time.",
        "complaint_id": cid, "duplicate": True})


def _run_analysis(db: Session, c: Complaint, ip: str | None) -> None:
    """Never lets an analysis problem lose the complaint: on any failure the record stays, status = failed."""
    try:
        ml_service.analyze_complaint(db, c, None, ip)
    except Exception:  # noqa: BLE001
        log.exception("analysis failed for %s", c.complaint_id)
        db.rollback()
        c = db.get(Complaint, c.id)
        c.analysis_status = "failed"
        c.analysis_attempts = (c.analysis_attempts or 0) + 1
        c.last_analysis_at = datetime.now(timezone.utc)
        db.commit()


@router.post("/complaints", status_code=201)
async def submit(request: Request,
                 customer_name: str = Form(..., min_length=2, max_length=120),
                 product_name: str = Form(..., min_length=2, max_length=200),
                 complaint_date: date = Form(...),
                 description: str = Form(..., min_length=20, max_length=5000),
                 organisation: str | None = Form(None, max_length=160),
                 email: str | None = Form(None, max_length=255),
                 severity: Literal["Routine", "Major", "Critical"] | None = Form(None),
                 batch_id: str | None = Form(None, max_length=40),
                 additional_info: str | None = Form(None, max_length=2000),
                 website: str | None = Form(None),  # honeypot: humans never see this field
                 submission_token: str | None = Form(None, pattern=r"^[A-Za-z0-9_-]{16,64}$"),  # one per form session (idempotency)
                 images: list[UploadFile] = File(default=[]),
                 db: Session = Depends(get_db)):
    submit_limiter.check(f"submit:{client_ip(request)}")
    if website:
        raise HTTPException(400, "Submission rejected")
    token_hash = _hash(submission_token) if submission_token else None
    if token_hash and (dup := _duplicate(db, token_hash)):
        return dup
    if complaint_date > date.today():
        raise HTTPException(422, "Complaint date cannot be in the future")
    if (date.today() - complaint_date).days > 3650:
        raise HTTPException(422, "Complaint date is more than 10 years ago")
    if email:
        try:
            email = str(TypeAdapter(EmailStr).validate_python(email.strip()))
        except ValidationError:
            raise HTTPException(422, "Enter a valid email address")
    description = description.strip()
    if len(description) < 20:
        raise HTTPException(422, "Describe the problem in at least 20 characters")
    product_name = product_name.strip()
    known = db.execute(select(Complaint.product_id, Complaint.food_family, Complaint.product_category, func.count())
                       .where(func.lower(Complaint.product_name) == product_name.lower(), Complaint.food_family.is_not(None))
                       .group_by(Complaint.product_id, Complaint.food_family, Complaint.product_category).order_by(desc(func.count())).limit(1)).first()
    validated = await att.validate_images(images)  # all images checked before anything is written
    stored = att.store(validated)
    key = secrets.token_urlsafe(24)
    try:
        c = add_with_unique_id(db, complaint_date.year, lambda cid: Complaint(
            complaint_id=cid, source="public", is_synthetic=False, data_origin="CAUSELINE_PUBLIC_SUBMISSION",
            complaint_received_date=date.today(), event_date=complaint_date, complaint_channel="CauseLine web form",
            product_name=product_name, batch_id=(batch_id or "").strip() or None, complaint_description=description,
            product_id=known[0] if known else None, food_family=known[1] if known else None, product_category=known[2] if known else None,
            complaint_summary=description[:120], complaint_severity=severity, complaint_status="Open",
            customer_name=(organisation or "").strip() or None, submitter_name=customer_name.strip(),
            submitter_organisation=(organisation or "").strip() or None, submitter_email=email, additional_info=(additional_info or "").strip() or None,
            access_key_hash=_hash(key), submission_token_hash=token_hash, analysis_status="pending", analysis_attempts=0))
        for s in stored:
            db.add(ComplaintAttachment(complaint_pk=c.id, stored_name=s.stored_name, original_filename=s.original_filename, content_type=s.content_type,
                                       size_bytes=s.size_bytes, width=s.width, height=s.height, sha256=s.sha256, sanitized=True,
                                       metadata_removed=s.metadata_removed, original_stored_name=s.original_stored_name,
                                       original_sha256=s.original_sha256, original_size_bytes=s.original_size_bytes))
        audit(db, "complaint.public_submit", None, "complaint", c.complaint_id, {"images": len(stored)}, client_ip(request))
        for role in ("analyst", "admin"):
            notify(db, "public_complaint", f"New complaint {c.complaint_id}", f"{product_name} - submitted on the public form",
                   f"/app/complaints/{c.complaint_id}", audience_role=role)
        db.commit()  # the complaint is durable BEFORE any model runs
    except Exception as exc:
        db.rollback()
        att.remove([s.stored_name for s in stored])
        for s in stored:
            try:
                p = att.original_path_for(s.original_stored_name); p.chmod(0o644); p.unlink(missing_ok=True)
            except Exception:  # noqa: BLE001
                pass
        # two identical requests at the same moment: the unique token index rejects the second one
        if token_hash and (dup := _duplicate(db, token_hash)):
            return dup
        raise exc
    invalidate_cache()
    _run_analysis(db, c, client_ip(request))
    db.refresh(c)
    return {"complaint_id": c.complaint_id, "access_key": key, "analysis_status": c.analysis_status,
            "message": "Keep this reference and access key. The key is shown only once and is needed to view your complaint."}


FAILED = {"failed", "error", "unavailable"}
STATUS_FIELDS = {"complaint_status": "Status changed to {to}", "investigation_status": "Investigation status: {to}"}


def _timeline(db: Session, c: Complaint, preds: list, n_files: int) -> list[dict]:
    """Complainant-safe history, oldest first. Built only from stored records: submission, analysis runs, quality-team
    reviews, status changes, root-cause confirmation and closure. Never includes staff identities, internal
    investigation notes, exports or admin actions. Each event says who it came from (recorded / AI / quality team)."""
    ev = [{"at": c.created_at, "kind": "recorded", "title": "Complaint received",
           "detail": f"Reference issued. {n_files} photo{'s' if n_files != 1 else ''} attached." if n_files else "Reference issued. No photos attached."}]
    runs: dict[str, list] = {}
    for p in preds:
        runs.setdefault(p.run_id, []).append(p)
    for run in runs.values():
        keys = {p.model_version.model_key for p in run}
        at = min(p.created_at for p in run)
        bad = sum(p.status in FAILED for p in run)
        if keys == {"root-cause"}:
            ev.append({"at": at, "kind": "ai", "title": "Root-cause suggestions generated",
                       "detail": "Run after the quality team confirmed the category. Suggestions only - not a confirmed cause."})
        else:
            ev.append({"at": at, "kind": "ai", "title": "AI analysis completed" if not bad else "AI analysis partly completed",
                       "detail": f"{len(run) - bad} of {len(run)} checks produced a result. Results are suggestions for the quality team."})
        for p in run:
            for r in p.reviews:
                key = p.model_version.model_key
                if key == "nlp-category":
                    title = {"confirmed": f"Category confirmed by the quality team: {p.top_label}",
                             "corrected": f"Category set by the quality team: {r.corrected_label}",
                             "rejected": "AI category suggestion rejected by the quality team"}.get(r.action, "Category reviewed")
                elif key == "root-cause":
                    title = "Root-cause suggestions reviewed by the quality team"
                else:
                    continue
                ev.append({"at": r.created_at, "kind": "human", "title": title, "detail": None})
    if c.analysis_status == "failed" and c.last_analysis_at and not runs:
        ev.append({"at": c.last_analysis_at, "kind": "recorded", "title": "AI analysis could not run", "detail": "Your complaint is saved. The analysis can be retried."})
    closed_logged = False
    for log in db.scalars(select(AuditLog).where(AuditLog.entity_type == "complaint", AuditLog.entity_id == c.complaint_id,
                                                 AuditLog.action == "complaint.update").order_by(AuditLog.created_at)).all():
        for field, tmpl in STATUS_FIELDS.items():
            ch = ((log.details or {}).get("changes") or {}).get(field)
            if ch and ch.get("to"):
                closed_logged |= field == "complaint_status" and ch["to"] == "Closed"
                ev.append({"at": log.created_at, "kind": "human", "title": tmpl.format(to=ch["to"]), "detail": None})
    if c.root_cause_status == "Confirmed" and c.root_cause_confirmed_at:
        ev.append({"at": c.root_cause_confirmed_at, "kind": "human", "title": f"Root cause confirmed: {c.root_cause_category}",
                   "detail": "Confirmed by an investigator from evidence, separate from any AI suggestion."})
    if c.complaint_status == "Closed" and c.complaint_closed_date and not closed_logged:
        ev.append({"at": datetime.combine(c.complaint_closed_date, datetime.min.time(), timezone.utc), "kind": "human", "title": "Complaint closed", "detail": None})
    for e in ev:
        if e["at"].tzinfo is None:
            e["at"] = e["at"].replace(tzinfo=timezone.utc)
    ev.sort(key=lambda e: e["at"])
    return [{**e, "at": e["at"].isoformat()} for e in ev]


def _public_view(db: Session, c: Complaint) -> dict:
    files = db.scalars(select(ComplaintAttachment).where(ComplaintAttachment.complaint_pk == c.id).order_by(ComplaintAttachment.id)).all()
    preds = db.scalars(select(Prediction).options(selectinload(Prediction.reviews)).where(Prediction.complaint_pk == c.id)
                       .order_by(desc(Prediction.created_at), Prediction.id)).all()
    latest_run = preds[0].run_id if preds else None
    from app.api.ml import prediction_out
    run: dict = {}
    from app.analytics.complaints import synthetic_ids
    syn = synthetic_ids(db)
    for p in preds:  # newest first -> keep the first (newest) output per model
        run.setdefault(p.model_version.model_key, prediction_out(p, {}, syn))
    for p in run.values():  # never expose staff identities publicly
        for r in p["reviews"]:
            r["reviewer"] = "CauseLine staff"
    confirmed = c.root_cause_status == "Confirmed" and c.root_cause_confirmed_at is not None
    return {
        "complaint": {"complaint_id": c.complaint_id, "submitted_at": c.created_at.isoformat(), "complaint_date": c.event_date.isoformat() if c.event_date else None,
                      "product_name": c.product_name, "batch_id": c.batch_id, "description": c.complaint_description, "severity": c.complaint_severity,
                      "additional_info": c.additional_info, "submitter_name": c.submitter_name, "organisation": c.submitter_organisation,
                      "status": c.complaint_status, "investigation_status": c.investigation_status, "analysis_status": c.analysis_status,
                      "analysis_attempts": c.analysis_attempts, "last_analysis_at": c.last_analysis_at.isoformat() if c.last_analysis_at else None,
                      "verified_category": c.complaint_category if c.category_source == "human_verified" else None,
                      "confirmed_root_cause": c.root_cause_category if confirmed else None},
        "attachments": [{"id": f.id, "filename": f.original_filename, "content_type": f.content_type, "size_bytes": f.size_bytes,
                         "width": f.width, "height": f.height} for f in files],
        "analysis": {"run_id": latest_run, "created_at": preds[0].created_at.isoformat(), "predictions": run} if run else None,
        "timeline": _timeline(db, c, preds, len(files)),
    }


@router.get("/complaints/{complaint_id}")
def view(complaint_id: str, request: Request, x_access_key: str | None = Header(None), db: Session = Depends(get_db)):
    view_limiter.check(f"view:{client_ip(request)}")
    return _public_view(db, _authorised(db, complaint_id, x_access_key))


@router.post("/complaints/{complaint_id}/analyze")
def retry(complaint_id: str, request: Request, x_access_key: str | None = Header(None), db: Session = Depends(get_db)):
    retry_limiter.check(f"retry:{client_ip(request)}")
    c = _authorised(db, complaint_id, x_access_key)
    if c.analysis_status == "completed":
        raise HTTPException(409, "Analysis already completed")
    _run_analysis(db, c, client_ip(request))
    db.refresh(c)
    return _public_view(db, c)


@router.get("/complaints/{complaint_id}/attachments/{attachment_id}")
def attachment(complaint_id: str, attachment_id: int, request: Request, x_access_key: str | None = Header(None), db: Session = Depends(get_db)):
    view_limiter.check(f"view:{client_ip(request)}")
    c = _authorised(db, complaint_id, x_access_key)
    a = db.scalar(select(ComplaintAttachment).where(ComplaintAttachment.id == attachment_id, ComplaintAttachment.complaint_pk == c.id))
    if not a:
        raise HTTPException(404, "Not found")
    return FileResponse(att.path_for(a.stored_name), media_type=a.content_type,
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline"})


SORTS = {"date": Complaint.complaint_received_date, "id": Complaint.complaint_id, "product": Complaint.product_name, "severity": Complaint.complaint_severity}


@router.get("/register")
def register(q: str | None = Query(None, max_length=100), category: list[str] = Query(default=[]), severity: list[str] = Query(default=[]),
             status: list[str] = Query(default=[]), source: Literal["all", "public"] = "all", sort: Literal["date", "id", "product", "severity"] = "date",
             order: Literal["asc", "desc"] = "desc", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    """Anonymised register: no names, emails, customers, descriptions or free text."""
    s = select(Complaint)
    if q:
        like = f"%{q.strip()}%"
        s = s.where(or_(Complaint.complaint_id.ilike(like), Complaint.product_name.ilike(like)))
    if category: s = s.where(Complaint.complaint_category.in_(category))
    if severity: s = s.where(Complaint.complaint_severity.in_(severity))
    if status: s = s.where(Complaint.complaint_status.in_(status))
    if source == "public": s = s.where(Complaint.source == "public")
    total = db.scalar(select(func.count()).select_from(s.subquery()))
    rows = db.scalars(s.order_by((desc if order == "desc" else asc)(SORTS[sort]), desc(Complaint.id)).offset((page - 1) * page_size).limit(page_size)).all()
    ids = [c.id for c in rows]
    predicted: dict[int, str] = {}
    if ids:
        for pk, label in db.execute(select(Prediction.complaint_pk, Prediction.top_label).join(ModelVersion, Prediction.model_version_id == ModelVersion.id)
                                    .where(Prediction.complaint_pk.in_(ids), ModelVersion.model_key == "nlp-category", Prediction.status == "completed")
                                    .order_by(Prediction.created_at)).all():
            predicted[pk] = label
    items = []
    for c in rows:
        recorded = c.complaint_category if c.category_source in ("recorded", "human_verified") else None
        items.append({"complaint_id": c.complaint_id, "submitted": c.complaint_received_date.isoformat(), "product_name": c.product_name,
                      "category": recorded, "category_source": c.category_source if recorded else None,
                      "predicted_category": None if recorded else predicted.get(c.id),
                      "severity": c.complaint_severity, "status": c.complaint_status,
                      "analysis_status": c.analysis_status or ("analysed" if c.id in predicted else "not_run"),
                      "source": c.source, "is_synthetic": c.is_synthetic})
    cats = [x for x in db.scalars(select(Complaint.complaint_category).distinct().where(Complaint.complaint_category.is_not(None))
                                  .order_by(Complaint.complaint_category)).all()]
    return {"items": items, "total": total, "page": page, "page_size": page_size, "categories": cats,
            "severities": SEVERITIES, "statuses": ["Open", "Under investigation", "Awaiting customer information", "Closed"]}


@router.get("/products")
def products(db: Session = Depends(get_db)):
    """Known product names (catalogue data, not personal data) for form suggestions."""
    return {"products": list(db.scalars(select(Complaint.product_name).where(Complaint.source == "import").distinct().order_by(Complaint.product_name)))}


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    from app.ml.registry import registry
    from app.core.config import get_settings
    s = get_settings()
    return {"models": {k: m.status for k, m in registry.models.items()}, "max_images": s.max_images_per_complaint, "max_image_mb": s.max_image_mb,
            "image_types": ["JPG", "JPEG", "PNG", "WEBP"], "nlp_mode": "external service" if s.nlp_service_url else "in-process",
            "severities": SEVERITIES}
