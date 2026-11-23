"""Initialise the database: create tables, an administrator, and import the supplied data.

    backend/.venv/Scripts/python backend/scripts/seed.py --admin-email you@example.com

- Complaints are imported through the SAME ingestion/validation path as user uploads.
- Pre-computed ML outputs are stored as *historical model output*, separate from live predictions.
- Idempotent: re-running skips data that is already present.
- The admin password is read from ADMIN_PASSWORD or generated and printed once.
"""
import argparse
import os
import secrets
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select  # noqa: E402

from app.core.config import REPO_ROOT, get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database.session import SessionLocal, init_db  # noqa: E402
from app.ingestion import complaints as ing  # noqa: E402
from app.ml.registry import registry  # noqa: E402
from app.models import (CapaWatchlistEntry, Complaint, HistoricalBatchRiskScore, HistoricalRootCauseHypothesis,  # noqa: E402
                        ModelVersion, Upload, User)
from app.services.ml_service import sync_model_versions  # noqa: E402


def rel(p: Path) -> str:
    return p.relative_to(REPO_ROOT).as_posix()


def seed_admin(db, email: str, name: str, role: str = "admin", password: str | None = None) -> None:
    if db.scalar(select(User).where(func.lower(User.email) == email.lower())):
        print(f"user {email} exists - skipped")
        return
    pw = password or secrets.token_urlsafe(12) + "A1"
    db.add(User(email=email.lower(), full_name=name, role=role, password_hash=hash_password(pw)))
    db.commit()
    print(f"created {role} {email}" + ("" if password else f" with generated password: {pw}  (change it after first sign-in)"))


def seed_complaints(db) -> None:
    s = get_settings()
    csv = s.nlp_dir / "data" / "01_ABT_CPD_Complaints_18000.csv"
    if db.scalar(select(func.count(Complaint.id))):
        print("complaints already present - skipped")
        return
    df = ing.read_table(csv)
    mapping = {c: (c if c in ing.FIELDS else None) for c in df.columns}
    res = ing.validate(df, mapping, db)
    print(f"validated {res.rows_total} rows: {len(res.records)} valid, {len({e['row'] for e in res.errors})} with errors, "
          f"{len(res.duplicates_in_file)} duplicates in file")
    if res.errors:
        for e in res.errors[:10]:
            print("  error", e)
    import hashlib
    sha = hashlib.sha256(csv.read_bytes()).hexdigest()
    up = Upload(reference="IMP-SEED1", original_filename=csv.name, stored_path=rel(csv), sha256=sha, size_bytes=csv.stat().st_size,
                file_type="csv", column_mapping=mapping, status="imported", rows_total=res.rows_total, rows_valid=len(res.records),
                rows_failed=len({e["row"] for e in res.errors}), rows_duplicate=len(res.duplicates_in_file),
                validation_summary=res.summary(), is_synthetic_source=True)
    db.add(up); db.flush()
    n = ing.import_records(db, res.records, up.id, None, synthetic=True, data_origin="SYNTHETIC_ABT_CPD")
    up.rows_inserted = n
    db.commit()
    print(f"imported {n} complaints (upload {up.reference})")


def seed_historical(db) -> None:
    s = get_settings()
    out = s.ml_dir / "outputs" / "predictions"
    ids = dict(db.execute(select(Complaint.complaint_id, Complaint.id)).all())
    mv = db.scalar(select(ModelVersion).where(ModelVersion.model_key == "root-cause"))
    if not db.scalar(select(func.count(HistoricalRootCauseHypothesis.id))):
        f = out / "root_cause_predictions_unconfirmed.csv"
        df = pd.read_csv(f)
        db.add_all([HistoricalRootCauseHypothesis(
            complaint_id=r.complaint_id, complaint_pk=ids.get(r.complaint_id), source_file=rel(f), model_version_id=mv.id if mv else None,
            hypotheses=[{"cause": getattr(r, f"predicted_cause_{k}"), "probability": float(getattr(r, f"predicted_prob_{k}"))} for k in (1, 2, 3)])
            for r in df.itertuples()])
        db.commit(); print(f"historical root-cause hypotheses: {len(df)}")
    if not db.scalar(select(func.count(HistoricalBatchRiskScore.id))):
        f = out / "batch_risk_predictions_oos.csv"
        df = pd.read_csv(f, parse_dates=["production_date"])
        db.add_all([HistoricalBatchRiskScore(
            batch_id=r.batch_id, product_id=r.product_id, product_name=r.product_name, production_date=r.production_date.date(),
            model_split=r.model_split, risk_score=float(r.risk_score), risk_tier=r.risk_tier, actual_complaint_30d=bool(r.actual_complaint_30d),
            top_risk_drivers=None if pd.isna(r.top_risk_drivers) else r.top_risk_drivers,
            recommended_action=None if pd.isna(r.recommended_action) else r.recommended_action, source_file=rel(f)) for r in df.itertuples()])
        db.commit(); print(f"historical batch risk scores: {len(df)}")
    if not db.scalar(select(func.count(CapaWatchlistEntry.id))):
        f = out / "open_capas_watchlist.csv"
        df = pd.read_csv(f)
        db.add_all([CapaWatchlistEntry(capa_id=r.capa_id, capa_status=r.capa_status, root_cause_category=None if pd.isna(r.root_cause_category) else r.root_cause_category,
                                       root_cause_status=r.root_cause_status,
                                       historical_ineffective_rate_for_root_cause=None if pd.isna(r.historical_ineffective_rate_for_root_cause) else float(r.historical_ineffective_rate_for_root_cause),
                                       source_file=rel(f)) for r in df.itertuples()])
        db.commit(); print(f"CAPA watchlist entries: {len(df)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--admin-email", default=os.environ.get("ADMIN_EMAIL", "admin@causeline.local"))
    ap.add_argument("--admin-name", default="CauseLine Administrator")
    ap.add_argument("--with-analyst", action="store_true", help="also create analyst@causeline.local")
    a = ap.parse_args()
    init_db()
    registry.load_all(load_sbert=False)
    with SessionLocal() as db:
        sync_model_versions(db)
        seed_admin(db, a.admin_email, a.admin_name, password=os.environ.get("ADMIN_PASSWORD"))
        if a.with_analyst:
            seed_admin(db, "analyst@causeline.local", "Quality Analyst", role="analyst", password=os.environ.get("ANALYST_PASSWORD"))
        seed_complaints(db)
        seed_historical(db)
    print("seed complete")


if __name__ == "__main__":
    main()
