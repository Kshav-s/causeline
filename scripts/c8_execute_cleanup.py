"""C8 execution - approved by the project owner on 2026-11-23 with conditions:
CL-2026-000029 preserved permanently; only individually verified test complaints deleted; synthetic history, audit logs
and the verified pre-cleanup backup preserved; no database reset.

Every ID below is hard-coded (no pattern-based selection) and must ALSO pass the fixture checks, or the script aborts
before touching anything.

    backend/.venv/Scripts/python scripts/c8_execute_cleanup.py            # dry run (default)
    backend/.venv/Scripts/python scripts/c8_execute_cleanup.py --execute  # delete
"""
import hashlib
import json
import os
import shutil
import sqlite3
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "backend/data/causeline.db"
ATT = ROOT / "backend/storage/attachments"
VERIFIED_BACKUP = ROOT / "backups/pre-C8-20261123-181036/causeline.db"
PRESERVE = "CL-2026-000029"

APPROVED = [f"CL-2026-{n:06d}" for n in range(1, 48) if n != 29]
assert len(APPROVED) == 46 and PRESERVE not in APPROVED

# Fixture evidence (see docs/C8_DELETION_CANDIDATES.md):
#  - frontend/e2e/workflow.spec.ts (public flow): name "E2E Visitor", description "E2E <ts>: hard plastic fragment ..."
#  - frontend/e2e/screenshots.mjs: name "Screenshot Check", description "Green mould spots visible on several slices ..."
#  - baseline 4b75af4 workflow.spec.ts (staff flow): analyst test account, description "E2E <ts>: customer found live insects ..."
#  - verification script: name "VERIFICATION RUN - delete", description "Verification run..."
FIXTURES = [
    lambda r: r["submitter_name"] == "E2E Visitor" and r["description"].startswith("E2E ") and "hard plastic fragment" in r["description"],
    lambda r: r["submitter_name"] == "Screenshot Check" and r["description"].startswith("Green mould spots visible on several slices"),
    lambda r: r["source"] == "manual" and r["created_by"] == "analyst@causeline.local" and r["description"].startswith("E2E ") and "live insects" in r["description"],
    lambda r: r["submitter_name"] == "VERIFICATION RUN - delete" and r["description"].startswith("Verification run"),
]


def sha_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def row_digest(conn, cid):
    row = conn.execute("select * from complaints where complaint_id=?", (cid,)).fetchone()
    return hashlib.sha256(repr(tuple(row)).encode()).hexdigest() if row else None


def main(execute: bool):
    conn = sqlite3.connect(LIVE)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys=ON")

    # ---- 1. verify every approved ID individually; abort on any doubt -------------------------------
    q = ",".join("?" * len(APPROVED))
    rows = {r["complaint_id"]: dict(r) for r in conn.execute(f"""
        select c.id, c.complaint_id, c.source, c.is_synthetic, c.data_origin, c.submitter_name, c.complaint_description as description,
               u.email as created_by,
               (select a.ip_address from audit_logs a where a.entity_id=c.complaint_id and a.action in ('complaint.public_submit','complaint.create') limit 1) as ip
        from complaints c left join users u on u.id=c.created_by_id where c.complaint_id in ({q})""", APPROVED)}
    problems = []
    for cid in APPROVED:
        r = rows.get(cid)
        if not r:
            problems.append(f"{cid}: not found")
            continue
        if r["source"] == "import" or r["is_synthetic"] or (r["data_origin"] or "").upper().startswith("SYNTHETIC"):
            problems.append(f"{cid}: synthetic/imported record")
        if r["ip"] not in ("127.0.0.1",):
            problems.append(f"{cid}: submitted from {r['ip']!r}")
        if not any(f(r) for f in FIXTURES):
            problems.append(f"{cid}: does not match a known test fixture")
    if problems:
        sys.exit("ABORT - not deleting anything:\n  " + "\n  ".join(problems))
    pks = [rows[c]["id"] for c in APPROVED]
    pq = ",".join("?" * len(pks))

    hyp = conn.execute(f"select count(*) from historical_root_cause_hypotheses where complaint_pk in ({pq})", pks).fetchone()[0]
    if hyp:
        sys.exit(f"ABORT - {hyp} historical hypotheses reference candidates")

    pred_ids = [r[0] for r in conn.execute(f"select id from predictions where complaint_pk in ({pq})", pks)]
    files = [r[0] for r in conn.execute(f"select stored_name from complaint_attachments where complaint_pk in ({pq})", pks)]
    files += ["originals/" + r[0] if not r[0].startswith("originals/") else r[0]
              for r in conn.execute(f"select original_stored_name from complaint_attachments where complaint_pk in ({pq}) and original_stored_name is not null", pks)]
    links = [f"/app/complaints/{c}" for c in APPROVED]
    lq = ",".join("?" * len(links))
    plan = {
        "complaints": len(pks),
        "predictions": len(pred_ids),
        "prediction_reviews": conn.execute(f"select count(*) from prediction_reviews where prediction_id in ({','.join('?' * len(pred_ids)) or 'NULL'})", pred_ids).fetchone()[0],
        "complaint_attachments": conn.execute(f"select count(*) from complaint_attachments where complaint_pk in ({pq})", pks).fetchone()[0],
        "investigation_notes": conn.execute(f"select count(*) from investigation_notes where complaint_pk in ({pq})", pks).fetchone()[0],
        "notifications": conn.execute(f"select count(*) from notifications where link in ({lq})", links).fetchone()[0],
        "attachment_files": len(files),
    }
    print("All 46 IDs individually verified against test fixtures.\nPlan:", json.dumps(plan))
    if not execute:
        print("Dry run - nothing deleted. Re-run with --execute.")
        return

    # ---- 2. preserve state: verified backup untouched + fresh snapshot of the exact pre-delete state ----
    vb_hash_before = sha_file(VERIFIED_BACKUP)
    keep_before = row_digest(conn, PRESERVE)
    snap = ROOT / "backups" / f"pre-C8-exec-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    snap.mkdir(parents=True)
    bk = sqlite3.connect(snap / "causeline.db")
    conn.backup(bk)
    bk.close()
    shutil.copytree(ATT, snap / "attachments")
    print("pre-delete snapshot:", snap.relative_to(ROOT))

    # ---- 3. delete in one transaction ------------------------------------------------------------
    import_before = conn.execute("select count(*) from complaints where source='import'").fetchone()[0]
    audit_before = conn.execute("select count(*) from audit_logs").fetchone()[0]
    with conn:
        if pred_ids:
            pi = ",".join("?" * len(pred_ids))
            conn.execute(f"delete from prediction_reviews where prediction_id in ({pi})", pred_ids)
            conn.execute(f"delete from predictions where id in ({pi})", pred_ids)
        conn.execute(f"delete from notifications where link in ({lq})", links)
        conn.execute(f"delete from complaint_attachments where complaint_pk in ({pq})", pks)
        conn.execute(f"delete from investigation_notes where complaint_pk in ({pq})", pks)
        n = conn.execute(f"delete from complaints where id in ({pq})", pks).rowcount
        if n != 46:
            raise RuntimeError(f"expected 46 complaint deletions, got {n} - rolled back")
        conn.execute("insert into audit_logs (user_id, action, entity_type, entity_id, details, ip_address, created_at) values (null, ?, ?, ?, ?, ?, ?)",
                     ("data.c8_cleanup", "complaint", "C8", json.dumps({"approved_by": "project owner", "deleted_complaints": APPROVED,
                      "preserved": [PRESERVE], "removed_rows": plan, "snapshot": str(snap.relative_to(ROOT))}), "script",
                      datetime.now(timezone.utc).replace(tzinfo=None).isoformat(sep=" ")))

    removed_files = 0
    for f in files:
        p = ATT / f
        if p.exists():
            os.chmod(p, stat.S_IWRITE | stat.S_IREAD)
            p.unlink()
            removed_files += 1

    # ---- 4. post-checks ----------------------------------------------------------------------------
    checks = {
        "integrity_check": conn.execute("pragma integrity_check").fetchone()[0],
        "foreign_key_violations": len(conn.execute("pragma foreign_key_check").fetchall()),
        "historical_import_records": conn.execute("select count(*) from complaints where source='import'").fetchone()[0],
        "historical_unchanged": None,
        "preserved_CL-2026-000029_unchanged": row_digest(conn, PRESERVE) == keep_before,
        "remaining_non_import": [r[0] for r in conn.execute("select complaint_id from complaints where source!='import'")],
        "predictions_pointing_at_missing_complaint": conn.execute("select count(*) from predictions p where p.complaint_pk is not null and not exists (select 1 from complaints c where c.id=p.complaint_pk)").fetchone()[0],
        "predictions_of_deleted_ids_remaining": conn.execute(f"select count(*) from predictions where id in ({','.join('?' * len(pred_ids)) or 'NULL'})", pred_ids).fetchone()[0],
        "audit_logs_before_after": [audit_before, conn.execute("select count(*) from audit_logs").fetchone()[0]],
        "verified_backup_unchanged": sha_file(VERIFIED_BACKUP) == vb_hash_before,
        "attachment_files_removed": removed_files,
    }
    checks["historical_unchanged"] = checks["historical_import_records"] == import_before == 18000
    db_files = {r[0] for r in conn.execute("select stored_name from complaint_attachments")} | \
               {("originals/" + r[0]) if not r[0].startswith("originals/") else r[0] for r in conn.execute("select original_stored_name from complaint_attachments where original_stored_name is not null")}
    disk = {p.relative_to(ATT).as_posix() for p in ATT.rglob("*") if p.is_file()}
    checks["attachment_rows_missing_file"] = sorted(db_files - disk)
    checks["files_without_row"] = sorted(disk - db_files)
    checks["row_counts_after"] = {t: conn.execute(f'select count(*) from "{t}"').fetchone()[0] for t in
                                  ["complaints", "predictions", "prediction_reviews", "complaint_attachments", "investigation_notes", "notifications", "audit_logs"]}
    print(json.dumps({"removed": plan, "checks": checks}, indent=2))
    (snap / "c8_result.json").write_text(json.dumps({"removed": plan, "checks": checks}, indent=2))


if __name__ == "__main__":
    main("--execute" in sys.argv)
