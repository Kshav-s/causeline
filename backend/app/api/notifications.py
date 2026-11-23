from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models import Notification, User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _visible(user: User):
    return or_(Notification.user_id == user.id, Notification.audience_role == user.role)


def _out(n: Notification, user: User) -> dict:
    return {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "link": n.link,
            "read": user.id in (n.read_by or []), "created_at": n.created_at.isoformat()}


@router.get("")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.scalars(select(Notification).where(_visible(user)).order_by(Notification.created_at.desc()).limit(50)).all()
    out = [_out(n, user) for n in items]
    return {"items": out, "unread": sum(1 for n in out if not n["read"])}


@router.post("/{nid}/read")
def mark_read(nid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(Notification).where(Notification.id == nid, _visible(user)))
    if not n:
        raise HTTPException(404, "Notification not found")
    if user.id not in (n.read_by or []):
        n.read_by = [*(n.read_by or []), user.id]
        flag_modified(n, "read_by")
        db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notification).where(_visible(user))).all():
        if user.id not in (n.read_by or []):
            n.read_by = [*(n.read_by or []), user.id]
            flag_modified(n, "read_by")
    db.commit()
    return {"ok": True}
