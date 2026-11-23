from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import client_ip, get_current_user
from app.core.ratelimit import login_limiter
from app.core.security import create_access_token, hash_password, validate_password_strength, verify_password
from app.database.session import get_db
from app.models import User
from app.schemas.common import LoginIn, PasswordChangeIn, PreferencesIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])
MAX_FAILED, LOCK_MINUTES = 5, 15


@router.post("/login", response_model=UserOut, dependencies=[Depends(login_limiter)])
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    now = datetime.now(timezone.utc)
    generic = HTTPException(401, "Invalid email or password")
    if not user or not user.is_active:
        audit(db, "auth.login_failed", None, "user", body.email.lower(), None, client_ip(request)); db.commit()
        raise generic
    locked = user.locked_until and user.locked_until.replace(tzinfo=user.locked_until.tzinfo or timezone.utc) > now
    if locked:
        raise HTTPException(423, "Account temporarily locked after repeated failed sign-ins. Try again later.")
    if not verify_password(body.password, user.password_hash):
        user.failed_logins += 1
        if user.failed_logins >= MAX_FAILED:
            user.locked_until, user.failed_logins = now + timedelta(minutes=LOCK_MINUTES), 0
        audit(db, "auth.login_failed", user.id, "user", user.id, None, client_ip(request)); db.commit()
        raise generic
    user.failed_logins, user.locked_until, user.last_login_at = 0, None, now
    audit(db, "auth.login", user.id, "user", user.id, None, client_ip(request)); db.commit()
    s = get_settings()
    response.set_cookie(s.cookie_name, create_access_token(user.id, user.role), httponly=True, secure=s.cookie_secure,
                        samesite="strict", max_age=s.access_token_minutes * 60, path="/")
    return user


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    response.delete_cookie(get_settings().cookie_name, path="/")
    return {"ok": True}


@router.get("/session")
def session(request: Request, db: Session = Depends(get_db)):
    """Non-failing session probe for the SPA: 200 with user=null when signed out (avoids 401 noise on public pages)."""
    try:
        return {"user": UserOut.model_validate(get_current_user(request, db))}
    except HTTPException:
        return {"user": None}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: PreferencesIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    db.commit()
    return user


@router.post("/change-password")
def change_password(body: PasswordChangeIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    if (msg := validate_password_strength(body.new_password)):
        raise HTTPException(422, msg)
    user.password_hash = hash_password(body.new_password)
    audit(db, "auth.password_changed", user.id, "user", user.id, None, client_ip(request)); db.commit()
    return {"ok": True}
