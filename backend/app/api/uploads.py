"""Upload wizard: upload (immutable copy) -> sheets + suggested mapping -> validate & preview -> commit."""
import hashlib
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.analytics.complaints import invalidate_cache
from app.core.audit import audit, notify
from app.core.config import get_settings
from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.ingestion import complaints as ing
from app.models import Upload, User
from app.schemas.common import UploadOut, UploadValidateIn

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
ALLOWED = {".csv": b"", ".xlsx": b"PK\x03\x04"}


def _get(db, uid) -> Upload:
    u = db.get(Upload, uid)
    if not u:
        raise HTTPException(404, "Upload not found")
    return u


def _ref(db) -> str:
    n = (db.scalar(select(Upload.id).order_by(desc(Upload.id)).limit(1)) or 0) + 1
    return f"IMP-{n:05d}"


@router.post("", status_code=201)
async def upload(request: Request, file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_settings()
    name = Path(file.filename or "").name
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(415, "Only .csv and .xlsx files are accepted")
    s.upload_dir.mkdir(parents=True, exist_ok=True)
    tmp = s.upload_dir / f"tmp-{uuid.uuid4().hex}{ext}"
    h, size, limit = hashlib.sha256(), 0, s.max_upload_mb * 1024 * 1024
    with open(tmp, "wb") as out:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > limit:
                out.close(); tmp.unlink(missing_ok=True)
                raise HTTPException(413, f"File exceeds {s.max_upload_mb} MB")
            h.update(chunk); out.write(chunk)
    if size == 0:
        tmp.unlink(missing_ok=True)
        raise HTTPException(400, "File is empty")
    with open(tmp, "rb") as f:
        head = f.read(4)
    if ext == ".xlsx" and head != ALLOWED[".xlsx"]:
        tmp.unlink(missing_ok=True)
        raise HTTPException(415, "File content is not a valid .xlsx workbook")
    if ext == ".csv" and b"\x00" in head:
        tmp.unlink(missing_ok=True)
        raise HTTPException(415, "File content does not look like text CSV")
    sha = h.hexdigest()
    final = s.upload_dir / f"{sha}{ext}"
    if final.exists():
        tmp.unlink(missing_ok=True)
    else:
        shutil.move(tmp, final)
        final.chmod(0o444)  # original is kept read-only
    prior = db.scalar(select(Upload).where(Upload.sha256 == sha, Upload.status == "imported"))
    try:
        sheets = ing.list_sheets(final)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Could not read file: {type(e).__name__}")
    u = Upload(reference=_ref(db), original_filename=name, stored_path=str(final), sha256=sha, size_bytes=size, file_type=ext[1:],
               status="uploaded", created_by_id=user.id)
    db.add(u); db.flush()
    audit(db, "upload.create", user.id, "upload", u.reference, {"file": name, "sha256": sha, "size": size}, client_ip(request))
    db.commit()
    return {"upload": UploadOut.model_validate(u), "sheets": sheets,
            "already_imported": {"reference": prior.reference, "at": prior.created_at.isoformat()} if prior else None}


@router.get("/{uid}/columns")
def columns(uid: int, sheet_name: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = _get(db, uid)
    df = ing.read_table(Path(u.stored_path), sheet_name)
    if df.empty:
        raise HTTPException(422, "The selected sheet has no data rows")
    sample = df.head(3).to_dict(orient="records")
    return {"columns": list(df.columns), "rows": len(df), "suggested_mapping": ing.suggest_mapping(list(df.columns)), "sample": sample,
            "fields": [{"field": f, "label": lbl, "type": t, "required": req} for f, (t, req, lbl, _) in ing.FIELDS.items()]}


@router.post("/{uid}/validate")
def validate(uid: int, body: UploadValidateIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = _get(db, uid)
    if u.status == "imported":
        raise HTTPException(409, "This upload has already been imported")
    df = ing.read_table(Path(u.stored_path), body.sheet_name)
    unknown = [c for c in body.mapping if c not in df.columns]
    bad_targets = [t for t in body.mapping.values() if t and t not in ing.FIELDS]
    if unknown or bad_targets:
        raise HTTPException(422, f"Unknown columns {unknown} or target fields {bad_targets}")
    res = ing.validate(df, body.mapping, db)
    u.sheet_name, u.column_mapping, u.status = body.sheet_name, body.mapping, "validated"
    u.rows_total, u.rows_valid = res.rows_total, len(res.records)
    u.rows_duplicate = len(res.duplicates_existing) + len(res.duplicates_in_file)
    u.rows_failed = len({e["row"] for e in res.errors})
    u.validation_summary = res.summary()
    db.commit()
    preview = []
    err_by_row: dict[int, list] = {}
    for e in res.errors:
        err_by_row.setdefault(e["row"], []).append(e)
    for i, row in enumerate(df.head(100).to_dict(orient="records"), start=2):
        preview.append({"row": i, "values": row, "errors": err_by_row.get(i, [])})
    return {"summary": u.validation_summary, "preview": preview}


@router.get("/{uid}/errors.csv")
def errors_csv(uid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = _get(db, uid)
    errs = (u.validation_summary or {}).get("errors", [])
    lines = ["row,field,message"] + [f'{e["row"]},{e["field"]},"{str(e["message"]).replace(chr(34), chr(39))}"' for e in errs]
    return StreamingResponse(iter(["\n".join(lines)]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={u.reference}_errors.csv"})


@router.post("/{uid}/commit")
def commit(uid: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = _get(db, uid)
    if u.status != "validated" or not u.column_mapping:
        raise HTTPException(409, "Validate the upload before importing")
    df = ing.read_table(Path(u.stored_path), u.sheet_name)
    res = ing.validate(df, u.column_mapping, db)  # re-validate against current DB state
    if not res.records:
        raise HTTPException(422, "No valid rows to import")
    try:
        n = ing.import_records(db, res.records, u.id, user.id)
        u.status, u.rows_inserted = "imported", n
        u.rows_duplicate = len(res.duplicates_existing) + len(res.duplicates_in_file)
        u.rows_failed = len({e["row"] for e in res.errors})
        u.is_synthetic_source = any((r.get("extra") or {}).get("synthetic_record_flag") == "1" for r in res.records[:50])
        audit(db, "upload.commit", user.id, "upload", u.reference, {"inserted": n, "failed": u.rows_failed, "duplicates": u.rows_duplicate}, client_ip(request))
        notify(db, "import_finished", f"Import {u.reference} finished", f"{n} complaints imported from {u.original_filename}; "
               f"{u.rows_failed} rows failed validation; {u.rows_duplicate} duplicates skipped.", f"/app/data?tab=history", user_id=user.id)
        db.commit()
    except Exception:
        db.rollback()
        u = _get(db, uid); u.status = "failed"; db.commit()
        raise HTTPException(500, "Import failed; no rows were written")
    invalidate_cache()
    return {"upload": UploadOut.model_validate(u)}


@router.post("/{uid}/cancel")
def cancel(uid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = _get(db, uid)
    if u.status == "imported":
        raise HTTPException(409, "Imported uploads cannot be cancelled")
    u.status = "cancelled"; db.commit()
    return {"ok": True}


@router.get("")
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    users = dict(db.execute(select(User.id, User.full_name)).all())
    items = db.scalars(select(Upload).order_by(desc(Upload.created_at)).limit(200)).all()
    return {"items": [{**UploadOut.model_validate(u).model_dump(), "created_by": users.get(u.created_by_id, "System seed")} for u in items]}
