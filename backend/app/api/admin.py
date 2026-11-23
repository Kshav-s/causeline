from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import client_ip, require_admin
from app.core.security import hash_password, validate_password_strength
from app.database.session import get_db
from app.models import AuditLog, User
from app.schemas.common import UserCreateIn, UserOut, UserUpdateIn

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
def users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"items": [UserOut.model_validate(u) for u in db.scalars(select(User).order_by(User.created_at)).all()]}


@router.post("/users", status_code=201)
def create_user(body: UserCreateIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(func.lower(User.email) == body.email.lower())):
        raise HTTPException(409, "A user with this email already exists")
    if (msg := validate_password_strength(body.password)):
        raise HTTPException(422, msg)
    u = User(email=body.email.lower(), full_name=body.full_name, role=body.role, password_hash=hash_password(body.password))
    db.add(u); db.flush()
    audit(db, "user.create", admin.id, "user", u.id, {"email": u.email, "role": u.role}, client_ip(request)); db.commit()
    return UserOut.model_validate(u)


@router.patch("/users/{uid}")
def update_user(uid: int, body: UserUpdateIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    ch = body.model_dump(exclude_none=True)
    if u.id == admin.id and (ch.get("is_active") is False or ch.get("role") == "analyst"):
        raise HTTPException(400, "You cannot deactivate or demote your own account")
    if u.role == "admin" and (ch.get("is_active") is False or ch.get("role") == "analyst"):
        admins = db.scalar(select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True)))
        if admins <= 1:
            raise HTTPException(400, "At least one active administrator is required")
    for k, v in ch.items():
        setattr(u, k, v)
    audit(db, "user.update", admin.id, "user", u.id, ch, client_ip(request)); db.commit()
    return UserOut.model_validate(u)


@router.get("/audit")
def audit_log(action: str | None = None, user_id: int | None = None, entity_type: str | None = None,
              page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = select(AuditLog)
    if action: s = s.where(AuditLog.action.ilike(f"{action}%"))
    if user_id: s = s.where(AuditLog.user_id == user_id)
    if entity_type: s = s.where(AuditLog.entity_type == entity_type)
    total = db.scalar(select(func.count()).select_from(s.subquery()))
    names = dict(db.execute(select(User.id, User.full_name)).all())
    rows = db.scalars(s.order_by(desc(AuditLog.created_at)).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [{"id": r.id, "user": names.get(r.user_id, "Anonymous / system"), "action": r.action, "entity_type": r.entity_type,
                       "entity_id": r.entity_id, "details": r.details, "ip_address": r.ip_address, "created_at": r.created_at.isoformat()} for r in rows],
            "total": total}
