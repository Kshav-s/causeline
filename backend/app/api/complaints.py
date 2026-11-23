import csv
import io
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import Select, asc, desc, func, or_, select
from sqlalchemy.orm import Session

from app.analytics.complaints import OPEN_STATUSES, invalidate_cache
from app.core.audit import audit
from app.core.deps import client_ip, get_current_user, require_admin
from app.database.session import get_db
from app.models import AuditLog, Complaint, ComplaintAttachment, HistoricalRootCauseHypothesis, InvestigationNote, ModelVersion, Prediction, User
from app.services import attachments as att
from app.services.complaint_ids import add_with_unique_id
from app.schemas.common import ComplaintCreate, ComplaintListItem, ComplaintOut, ComplaintUpdate

router = APIRouter(prefix="/api/complaints", tags=["complaints"])

SORTABLE = {"complaint_received_date", "complaint_id", "product_name", "complaint_severity", "complaint_status", "complaint_category"}
TABS = {"all": None, "open": ["Open"], "investigating": ["Under investigation", "Awaiting customer information"],
        "closed": ["Closed"], "active": OPEN_STATUSES}


def _filtered(q: str | None, date_from: date | None, date_to: date | None, product: list[str], category: list[str],
              severity: list[str], status: list[str], batch: str | None, upload_id: int | None, capa_id: str | None,
              prior_capa_id: str | None, root_cause: str | None) -> Select:
    s = select(Complaint)
    if q:
        like = f"%{q.strip()}%"
        s = s.where(or_(Complaint.complaint_id.ilike(like), Complaint.complaint_description.ilike(like),
                        Complaint.complaint_summary.ilike(like), Complaint.batch_id.ilike(like), Complaint.product_name.ilike(like)))
    if date_from: s = s.where(Complaint.complaint_received_date >= date_from)
    if date_to: s = s.where(Complaint.complaint_received_date <= date_to)
    if product: s = s.where(Complaint.product_name.in_(product))
    if category: s = s.where(Complaint.complaint_category.in_(category))
    if severity: s = s.where(Complaint.complaint_severity.in_(severity))
    if status: s = s.where(Complaint.complaint_status.in_(status))
    if batch: s = s.where(Complaint.batch_id == batch)
    if upload_id: s = s.where(Complaint.upload_id == upload_id)
    if capa_id: s = s.where(Complaint.capa_id == capa_id)
    if prior_capa_id: s = s.where(Complaint.prior_capa_id == prior_capa_id)
    if root_cause: s = s.where(Complaint.root_cause_category == root_cause)
    return s


def _common(q: str | None = Query(None, max_length=200), date_from: date | None = None, date_to: date | None = None,
            product: list[str] = Query(default=[]), category: list[str] = Query(default=[]), severity: list[str] = Query(default=[]),
            status: list[str] = Query(default=[]), batch: str | None = None, upload_id: int | None = None, capa_id: str | None = None,
            prior_capa_id: str | None = None, root_cause: str | None = None):
    return _filtered(q, date_from, date_to, product, category, severity, status, batch, upload_id, capa_id, prior_capa_id, root_cause)


@router.get("")
def list_complaints(base: Select = Depends(_common), tab: str = Query("all", pattern="^(all|open|investigating|closed|active)$"),
                    sort: str = "complaint_received_date", order: str = Query("desc", pattern="^(asc|desc)$"),
                    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if sort not in SORTABLE:
        raise HTTPException(422, f"sort must be one of {sorted(SORTABLE)}")
    sub = base.subquery()
    counts = dict(db.execute(select(sub.c.complaint_status, func.count()).group_by(sub.c.complaint_status)).all())
    tab_counts = {t: (sum(counts.values()) if v is None else sum(counts.get(s, 0) for s in v)) for t, v in TABS.items()}
    s = base if TABS[tab] is None else base.where(Complaint.complaint_status.in_(TABS[tab]))
    total = tab_counts[tab]
    col = getattr(Complaint, sort)
    s = s.order_by((desc if order == "desc" else asc)(col), desc(Complaint.id)).offset((page - 1) * page_size).limit(page_size)
    items = db.scalars(s).all()
    ids = [c.id for c in items]
    predicted = {}
    if ids:
        rows = db.execute(select(Prediction.complaint_pk, Prediction.top_label, Prediction.review_status)
                          .join(ModelVersion, Prediction.model_version_id == ModelVersion.id)
                          .where(Prediction.complaint_pk.in_(ids), Prediction.status == "completed", ModelVersion.model_key == "nlp-category")
                          .order_by(Prediction.created_at)).all()
        for pk, label, rs in rows:
            predicted[pk] = {"label": label, "review_status": rs}
    return {"items": [{**ComplaintListItem.model_validate(c).model_dump(), "nlp_prediction": predicted.get(c.id)} for c in items],
            "total": total, "page": page, "page_size": page_size, "tab_counts": tab_counts}


@router.get("/filters")
def filter_options(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    def distinct(col):
        return [v for v in db.scalars(select(col).distinct().where(col.is_not(None)).order_by(col)).all()]
    return {"products": distinct(Complaint.product_name), "categories": distinct(Complaint.complaint_category),
            "severities": ["Routine", "Major", "Critical"], "statuses": ["Open", "Under investigation", "Awaiting customer information", "Closed"],
            "food_families": distinct(Complaint.food_family), "channels": distinct(Complaint.complaint_channel),
            "segments": distinct(Complaint.customer_segment), "regions": distinct(Complaint.customer_region),
            "root_causes": distinct(Complaint.root_cause_category)}


@router.get("/export.csv")
def export_csv(base: Select = Depends(_common), request: Request = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cols = [c.name for c in Complaint.__table__.columns if c.name not in ("extra",)]
    rows = db.scalars(base.order_by(desc(Complaint.complaint_received_date)).limit(50000)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([getattr(r, c) for c in cols])
    audit(db, "complaints.export", user.id, "complaint", None, {"rows": len(rows)}, client_ip(request)); db.commit()
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=causeline_complaints.csv"})


def _get(db: Session, complaint_id: str) -> Complaint:
    c = db.scalar(select(Complaint).where(Complaint.complaint_id == complaint_id))
    if not c:
        raise HTTPException(404, "Complaint not found")
    return c


@router.get("/{complaint_id}")
def get_complaint(complaint_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    hist = db.scalar(select(HistoricalRootCauseHypothesis).where(HistoricalRootCauseHypothesis.complaint_pk == c.id))
    linked_capa = []
    if c.capa_id:
        linked_capa.append(c.capa_id)
    recurrence_of = c.prior_capa_id
    files = db.scalars(select(ComplaintAttachment).where(ComplaintAttachment.complaint_pk == c.id).order_by(ComplaintAttachment.id)).all()
    names = dict(db.execute(select(User.id, User.full_name)).all())
    return {"complaint": ComplaintOut.model_validate(c).model_dump(), "extra": c.extra or {},
            "historical_root_cause_hypotheses": hist.hypotheses if hist else None,
            "linked_capas": linked_capa, "recurrence_of_capa": recurrence_of,
            "submitter": {"name": c.submitter_name, "organisation": c.submitter_organisation, "email": c.submitter_email,
                          "additional_info": c.additional_info} if c.source == "public" else None,
            "analysis_status": c.analysis_status,
            "root_cause_confirmation": {"by": names.get(c.root_cause_confirmed_by_id), "at": c.root_cause_confirmed_at.isoformat()} if c.root_cause_confirmed_at else None,
            "attachments": [{"id": f.id, "filename": f.original_filename, "content_type": f.content_type, "size_bytes": f.size_bytes,
                             "width": f.width, "height": f.height, "sha256": f.sha256, "created_at": f.created_at.isoformat(),
                             "sanitized": f.sanitized, "metadata_removed": f.metadata_removed, "has_original": bool(f.original_stored_name),
                             "original_sha256": f.original_sha256, "original_size_bytes": f.original_size_bytes} for f in files]}


@router.get("/{complaint_id}/attachments/{attachment_id}")
def staff_attachment(complaint_id: str, attachment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    a = db.scalar(select(ComplaintAttachment).where(ComplaintAttachment.id == attachment_id, ComplaintAttachment.complaint_pk == c.id))
    if not a:
        raise HTTPException(404, "Not found")
    return FileResponse(att.path_for(a.stored_name), media_type=a.content_type,
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline"})


@router.get("/{complaint_id}/attachments/{attachment_id}/original")
def original_attachment(complaint_id: str, attachment_id: int, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """C7: the untouched upload (may contain location metadata). Administrators only; every access is audited."""
    c = _get(db, complaint_id)
    a = db.scalar(select(ComplaintAttachment).where(ComplaintAttachment.id == attachment_id, ComplaintAttachment.complaint_pk == c.id))
    if not a or not a.original_stored_name:
        raise HTTPException(404, "No retained original for this image")
    audit(db, "attachment.original_download", admin.id, "complaint", c.complaint_id, {"attachment_id": a.id}, client_ip(request))
    db.commit()
    return FileResponse(att.original_path_for(a.original_stored_name), media_type=a.content_type, filename=f"ORIGINAL-{a.original_filename}",
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


class NoteIn(BaseModel):
    note: str = Field(min_length=3, max_length=5000)


@router.get("/{complaint_id}/notes")
def list_notes(complaint_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    names = dict(db.execute(select(User.id, User.full_name)).all())
    notes = db.scalars(select(InvestigationNote).where(InvestigationNote.complaint_pk == c.id).order_by(desc(InvestigationNote.created_at))).all()
    return {"items": [{"id": n.id, "note": n.note, "author": names.get(n.author_id), "created_at": n.created_at.isoformat()} for n in notes]}


@router.post("/{complaint_id}/notes", status_code=201)
def add_note(complaint_id: str, body: NoteIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    n = InvestigationNote(complaint_pk=c.id, author_id=user.id, note=body.note.strip())
    db.add(n)
    audit(db, "complaint.note", user.id, "complaint", c.complaint_id, {"chars": len(n.note)}, client_ip(request))
    db.commit()
    return {"id": n.id, "note": n.note, "author": user.full_name, "created_at": n.created_at.isoformat()}


@router.get("/{complaint_id}/activity")
def activity(complaint_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Chronological history: audit events for this complaint (submission, edits, analyses, reviews, notes)."""
    c = _get(db, complaint_id)
    names = dict(db.execute(select(User.id, User.full_name)).all())
    logs = db.scalars(select(AuditLog).where(AuditLog.entity_id == c.complaint_id).order_by(desc(AuditLog.created_at)).limit(200)).all()
    refs = {p.reference for p in db.scalars(select(Prediction).where(Prediction.complaint_pk == c.id)).all()}
    reviews = db.scalars(select(AuditLog).where(AuditLog.entity_type == "prediction", AuditLog.entity_id.in_(refs))).all() if refs else []
    items = [{"at": l.created_at.isoformat(), "action": l.action, "by": names.get(l.user_id) or ("Public submitter" if l.user_id is None else "-"),
              "details": l.details} for l in [*logs, *reviews]]
    items.sort(key=lambda x: x["at"], reverse=True)
    if c.source == "import":
        items.append({"at": c.created_at.isoformat(), "action": "complaint.imported", "by": "Data import", "details": {"upload_id": c.upload_id, "row": c.source_row_number}})
    return {"items": items}


@router.post("", status_code=201)
def create_complaint(body: ComplaintCreate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump()
    c = add_with_unique_id(db, body.complaint_received_date.year, lambda cid: Complaint(
        **data, complaint_id=cid, source="manual", is_synthetic=False, data_origin="CAUSELINE_MANUAL_ENTRY", created_by_id=user.id,
        updated_by_id=user.id, category_source="recorded" if body.complaint_category else None))
    audit(db, "complaint.create", user.id, "complaint", c.complaint_id, None, client_ip(request))
    db.commit(); invalidate_cache()
    return ComplaintOut.model_validate(c)


@router.patch("/{complaint_id}")
def update_complaint(complaint_id: str, body: ComplaintUpdate, request: Request, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    changes = {}
    for k, v in body.model_dump(exclude_unset=True).items():
        if k == "change_reason":
            continue
        old = getattr(c, k)
        if old != v:
            changes[k] = {"from": old.isoformat() if hasattr(old, "isoformat") else old, "to": v.isoformat() if hasattr(v, "isoformat") else v}
            setattr(c, k, v)
    if not changes:
        return ComplaintOut.model_validate(c)
    closed = c.complaint_closed_date
    if closed and closed < c.complaint_received_date:
        raise HTTPException(422, "Closed date cannot be before the received date")
    if c.complaint_status == "Closed" and not c.complaint_closed_date:
        raise HTTPException(422, "A closed complaint needs a closed date")
    if "root_cause_status" in changes and c.root_cause_status == "Confirmed":
        if not c.root_cause_category:
            raise HTTPException(422, "Record the root cause category before marking it Confirmed")
        c.root_cause_confirmed_by_id, c.root_cause_confirmed_at = user.id, datetime.now(timezone.utc)
    elif "root_cause_category" in changes or ("root_cause_status" in changes and c.root_cause_status != "Confirmed"):
        c.root_cause_confirmed_by_id = c.root_cause_confirmed_at = None
    c.updated_by_id = user.id
    audit(db, "complaint.update", user.id, "complaint", c.complaint_id, {"changes": changes, "reason": body.change_reason}, client_ip(request))
    db.commit(); invalidate_cache()
    return ComplaintOut.model_validate(c)
