"""Demo bookings: public lead-capture workflow, fully separate from complaint analytics (CLAUDE.md §9).
Booking data is never passed to any model."""
import logging
import secrets
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.audit import audit, notify
from app.core.config import get_settings
from app.core.deps import client_ip, require_admin
from app.core.ratelimit import booking_limiter
from app.database.session import get_db
from app.models import DemoBooking, User
from app.schemas.common import DemoBookingIn, DemoBookingOut, DemoBookingUpdate

router = APIRouter(prefix="/api/demo-bookings", tags=["demo-bookings"])
log = logging.getLogger("causeline.bookings")


def _email_admin(b: DemoBooking) -> str:
    s = get_settings()
    if not (s.smtp_host and s.admin_notify_email and s.smtp_from):
        return "in-app only (SMTP not configured)"
    try:
        msg = EmailMessage()
        msg["Subject"] = f"[CauseLine] New demo request {b.reference}"
        msg["From"], msg["To"] = s.smtp_from, s.admin_notify_email
        msg.set_content(f"{b.full_name} ({b.organisation}) requested a demo on {b.preferred_date} {b.time_slot} {b.timezone}.\n"
                        f"Email: {b.email}\nPurpose: {b.purpose}\n")
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10) as smtp:
            smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
        return "email sent + in-app"
    except Exception as e:  # noqa: BLE001
        log.warning("booking email failed: %s", type(e).__name__)
        return f"in-app only (email failed: {type(e).__name__})"


@router.post("", status_code=201, dependencies=[Depends(booking_limiter)])
def create_booking(body: DemoBookingIn, request: Request, db: Session = Depends(get_db)):
    if body.website:  # honeypot filled -> bot; respond like success without storing
        return {"reference": "DMO-" + secrets.token_hex(3).upper(), "status": "received"}
    ref = "DMO-" + secrets.token_hex(3).upper()
    while db.scalar(select(DemoBooking.id).where(DemoBooking.reference == ref)):
        ref = "DMO-" + secrets.token_hex(3).upper()
    data = body.model_dump(exclude={"website"})
    b = DemoBooking(**data, reference=ref, status="new", ip_address=client_ip(request))
    db.add(b); db.flush()
    notify(db, "demo_booking", f"New demo request {ref}", f"{b.full_name}, {b.organisation} - {b.preferred_date} {b.time_slot}",
           f"/app/admin/bookings?ref={ref}", audience_role="admin")
    b.notification_status = _email_admin(b)
    audit(db, "booking.create", None, "demo_booking", ref, None, client_ip(request))
    db.commit()
    return {"reference": ref, "status": "received", "preferred_date": b.preferred_date.isoformat(), "time_slot": b.time_slot,
            "timezone": b.timezone, "full_name": b.full_name, "organisation": b.organisation, "email": b.email}


@router.get("")
def list_bookings(status: str | None = Query(None, pattern="^(new|contacted|scheduled|completed|cancelled)$"), q: str | None = None,
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = select(DemoBooking)
    if status:
        s = s.where(DemoBooking.status == status)
    if q:
        like = f"%{q}%"
        s = s.where(DemoBooking.full_name.ilike(like) | DemoBooking.organisation.ilike(like) | DemoBooking.reference.ilike(like) | DemoBooking.email.ilike(like))
    counts = dict(db.execute(select(DemoBooking.status, func.count()).group_by(DemoBooking.status)).all())
    return {"items": [DemoBookingOut.model_validate(b) for b in db.scalars(s.order_by(desc(DemoBooking.created_at))).all()],
            "counts": {"all": sum(counts.values()), **counts}}


@router.patch("/{reference}")
def update_booking(reference: str, body: DemoBookingUpdate, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    b = db.scalar(select(DemoBooking).where(DemoBooking.reference == reference))
    if not b:
        raise HTTPException(404, "Booking not found")
    ch = body.model_dump(exclude_none=True)
    for k, v in ch.items():
        setattr(b, k, v)
    audit(db, "booking.update", admin.id, "demo_booking", reference, {"fields": list(ch)}, client_ip(request))
    db.commit()
    return DemoBookingOut.model_validate(b)
