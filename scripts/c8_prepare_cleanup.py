"""C8 preparation (approved process, 2026-11-23): back up, verify the backup restores, and list deletion candidates.
NOTHING IS DELETED by this script. Deletion requires the project owner's explicit approval of the generated list.

    backend/.venv/Scripts/python scripts/c8_prepare_cleanup.py
"""
import hashlib
import json
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "backend/data/causeline.db"
ATT = ROOT / "backend/storage/attachments"
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
BK_DIR = ROOT / "backups" / f"pre-C8-{stamp}"
BK_DIR.mkdir(parents=True, exist_ok=True)
BK_DB = BK_DIR / "causeline.db"
BK_ATT = BK_DIR / "attachments"

TABLES = ["users", "uploads", "complaints", "model_versions", "predictions", "prediction_reviews", "historical_root_cause_hypotheses",
          "historical_batch_risk_scores", "capa_watchlist", "audit_logs", "notifications", "demo_bookings", "complaint_attachments", "investigation_notes"]


def counts(conn):
    return {t: conn.execute(f'select count(*) from "{t}"').fetchone()[0] for t in TABLES}


def digest(conn):
    h = hashlib.sha256()
    for row in conn.execute("select complaint_id, updated_at, complaint_status, complaint_category from complaints order by id"):
        h.update(repr(row).encode())
    return h.hexdigest()


def sha(p: Path):
    return hashlib.sha256(p.read_bytes()).hexdigest()


# 1. full backup (SQLite online backup API - consistent even in WAL mode) + attachments
live = sqlite3.connect(LIVE)
bk = sqlite3.connect(BK_DB)
live.backup(bk)
bk.close()
shutil.copytree(ATT, BK_ATT)
print(f"backup written: {BK_DB.relative_to(ROOT)} ({BK_DB.stat().st_size:,} B) + {BK_ATT.relative_to(ROOT)}")

# 2. verify the backup can be restored: restore into a fresh file, then compare with live
restored = BK_DIR / "restore-test.db"
src = sqlite3.connect(BK_DB)
dst = sqlite3.connect(restored)
src.backup(dst)
src.close()
ok_integrity = dst.execute("pragma integrity_check").fetchone()[0]
c_live, c_rest = counts(live), counts(dst)
d_live, d_rest = digest(live), digest(dst)
dst.close()
restored.unlink()
live_files = {p.relative_to(ATT).as_posix(): sha(p) for p in ATT.rglob("*") if p.is_file()}
bk_files = {p.relative_to(BK_ATT).as_posix(): sha(p) for p in BK_ATT.rglob("*") if p.is_file()}
restore_ok = ok_integrity == "ok" and c_live == c_rest and d_live == d_rest and live_files == bk_files
print(f"restore test: integrity={ok_integrity}, row counts identical={c_live == c_rest}, complaints digest identical={d_live == d_rest}, "
      f"attachment files identical={live_files == bk_files} ({len(bk_files)} files) -> {'PASS' if restore_ok else 'FAIL'}")

# 3. candidates: every record not from the supplied historical import
live.row_factory = sqlite3.Row
cands = [dict(r) for r in live.execute("""
  select c.id, c.complaint_id, c.source, c.data_origin, c.is_synthetic, c.created_at, c.submitter_name, c.submitter_email, c.product_name,
         substr(c.complaint_description, 1, 60) as description, u.email as created_by,
         (select a.ip_address from audit_logs a where a.entity_id = c.complaint_id and a.action in ('complaint.public_submit','complaint.create') limit 1) as submit_ip,
         (select count(*) from predictions p where p.complaint_pk = c.id) as predictions,
         (select count(*) from prediction_reviews r join predictions p on p.id = r.prediction_id where p.complaint_pk = c.id) as reviews,
         (select count(*) from complaint_attachments a where a.complaint_pk = c.id) as photos,
         (select count(*) from investigation_notes n where n.complaint_pk = c.id) as notes
  from complaints c left join users u on u.id = c.created_by_id
  where c.source != 'import' order by c.complaint_id""")]
synthetic_in_list = sum(1 for c in cands if c["is_synthetic"] or c["source"] == "import" or (c["data_origin"] or "").startswith("SYNTHETIC"))
non_local = [c["complaint_id"] for c in cands if c["submit_ip"] not in ("127.0.0.1", "testclient", None)]
import_total = live.execute("select count(*) from complaints where source='import'").fetchone()[0]
photo_files = [r[0] for r in live.execute(f"select stored_name from complaint_attachments where complaint_pk in ({','.join(str(c['id']) for c in cands) or 'NULL'})")] + \
              [r[0] for r in live.execute(f"select original_stored_name from complaint_attachments where original_stored_name is not null and complaint_pk in ({','.join(str(c['id']) for c in cands) or 'NULL'})")]
summary = {
    "backup_dir": str(BK_DIR.relative_to(ROOT)), "backup_restore_verified": restore_ok, "row_counts_at_backup": c_live,
    "candidates": len(cands), "by_source": {s: sum(1 for c in cands if c["source"] == s) for s in {c["source"] for c in cands}},
    "synthetic_records_in_list": synthetic_in_list, "historical_import_records_untouched": import_total,
    "candidates_submitted_from_non_local_ip": non_local,
    "dependent_rows_to_remove": {"predictions": sum(c["predictions"] for c in cands), "prediction_reviews": sum(c["reviews"] for c in cands),
                                  "complaint_attachments": sum(c["photos"] for c in cands), "investigation_notes": sum(c["notes"] for c in cands),
                                  "photo_files_on_disk": len(photo_files)},
}
(BK_DIR / "c8_candidates.json").write_text(json.dumps({"summary": summary, "candidates": cands}, indent=2, default=str))
print(json.dumps(summary, indent=2, default=str))
for c in cands:
    print(f"{c['complaint_id']}\t{c['source']}\t{c['created_at'][:16]}\t{(c['submitter_name'] or c['created_by'] or '')[:28]:28s}\t{c['product_name'][:24]:24s}\tip={c['submit_ip']}\tpred={c['predictions']} photos={c['photos']}")
