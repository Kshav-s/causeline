from collections.abc import Callable

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ingestion.complaints import next_manual_id
from app.models import Complaint


def add_with_unique_id(db: Session, year: int, build: Callable[[str], Complaint], attempts: int = 5) -> Complaint:
    """Allocate the next CL-YYYY-NNNNNN id and flush; concurrent creators can race for the same id, so retry."""
    for i in range(attempts):
        c = build(next_manual_id(db, year))
        db.add(c)
        try:
            db.flush()
            return c
        except IntegrityError:
            db.rollback()
    raise HTTPException(409, "Could not allocate a complaint ID; please retry")
