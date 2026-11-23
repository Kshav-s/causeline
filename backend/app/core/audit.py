from sqlalchemy.orm import Session

from app.models import AuditLog, Notification


def audit(db: Session, action: str, user_id: int | None = None, entity_type: str | None = None,
          entity_id: str | int | None = None, details: dict | None = None, ip: str | None = None) -> None:
    """Append an audit entry. Caller commits."""
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type,
                    entity_id=str(entity_id) if entity_id is not None else None, details=details, ip_address=ip))


def notify(db: Session, kind: str, title: str, body: str | None = None, link: str | None = None,
           user_id: int | None = None, audience_role: str | None = None) -> None:
    """Persist an in-app notification for one user or a whole role. Caller commits."""
    db.add(Notification(kind=kind, title=title, body=body, link=link, user_id=user_id, audience_role=audience_role, read_by=[]))
