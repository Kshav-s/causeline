# C8 - Test complaint deletion candidates

> **EXECUTED 2026-11-23** after the project owner's conditional approval: the 46 listed complaints were deleted with `scripts/c8_execute_cleanup.py`; `CL-2026-000029` preserved permanently. Results: `docs/TECHNICAL_VERIFICATION_REPORT.md` section 12. Pre-delete snapshot `backups/pre-C8-exec-20261123-235641/`; verified backup below kept unchanged.

Prepared 2026-11-23 by `scripts/c8_prepare_cleanup.py`. **No record has been deleted.** Deletion requires the project owner's explicit approval of this exact list.

## Backup

- Location: `backups/pre-C8-20261123-181036/` (`causeline.db` via the SQLite online-backup API + full copy of `backend/storage/attachments/`, incl. restricted originals). Excluded from git (`backups/` in `.gitignore`).
- Restore verified: **PASS** - restored into a fresh file: `integrity_check` ok, row counts of all 14 tables identical, SHA-256 digest of every complaint identical, all 107 attachment files byte-identical.
- Row counts at backup: users 2, uploads 1, complaints 18,047, model_versions 6, predictions 307, prediction_reviews 5, historical_root_cause_hypotheses 10,783, historical_batch_risk_scores 9,288, capa_watchlist 965, audit_logs 178, notifications 94, demo_bookings 6, complaint_attachments 78, investigation_notes 9

## Safety checks

- Candidates are exactly the complaints whose `source` is not `import`: 47 (44 public, 3 manual).
- Synthetic / historical records in the list: **0**. The 18,000 imported `SYNTHETIC_ABT_CPD` records are not affected.
- Submitted from a non-local IP: **0** (all came from this machine).
- Why 47 and not 30: CL-2026-000001…000030 existed when the verification report was written; 000031…000047 were created by today's verification (000031) and regression runs (000032…000047).
- **Held back for your decision: `CL-2026-000029`** - submitter "karuna", product "Pasteurized toned milk", 12:10 UTC. It was not created by any CauseLine test script (all scripts use "E2E Visitor", "Screenshot Check", "VERIFICATION RUN - delete", "Asha Verma" or the analyst test account) and may be a manual entry of yours. Not on the deletion list unless you say so.

## Proposed deletion list (46 complaints)

| # | Complaint | Source | Created (UTC) | Submitter / creator | Product | Predictions | Photos |
|---|---|---|---|---|---|---|---|
| 1 | `CL-2026-000001` | manual | 2026-11-23 11:04 | analyst@causeline.local | Wheat flour | 5 | 0 |
| 2 | `CL-2026-000002` | manual | 2026-11-23 11:05 | analyst@causeline.local | Wheat flour | 5 | 0 |
| 3 | `CL-2026-000003` | manual | 2026-11-23 11:05 | analyst@causeline.local | Wheat flour | 5 | 0 |
| 4 | `CL-2026-000004` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 5 | `CL-2026-000005` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 6 | `CL-2026-000006` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 7 | `CL-2026-000007` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 8 | `CL-2026-000008` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 9 | `CL-2026-000009` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 10 | `CL-2026-000010` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 11 | `CL-2026-000011` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 12 | `CL-2026-000012` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 13 | `CL-2026-000013` | public | 2026-11-23 11:48 | E2E Visitor | Set yoghurt | 5 | 2 |
| 14 | `CL-2026-000014` | public | 2026-11-23 11:51 | E2E Visitor | Set yoghurt | 5 | 2 |
| 15 | `CL-2026-000015` | public | 2026-11-23 11:51 | E2E Visitor | Set yoghurt | 5 | 2 |
| 16 | `CL-2026-000016` | public | 2026-11-23 11:51 | E2E Visitor | Set yoghurt | 5 | 2 |
| 17 | `CL-2026-000017` | public | 2026-11-23 11:51 | E2E Visitor | Set yoghurt | 5 | 2 |
| 18 | `CL-2026-000018` | public | 2026-11-23 11:51 | E2E Visitor | Set yoghurt | 5 | 2 |
| 19 | `CL-2026-000019` | public | 2026-11-23 11:51 | E2E Visitor | Set yoghurt | 5 | 2 |
| 20 | `CL-2026-000020` | public | 2026-11-23 11:51 | Screenshot Check | Sliced sandwich bread | 5 | 1 |
| 21 | `CL-2026-000021` | public | 2026-11-23 11:56 | E2E Visitor | Set yoghurt | 5 | 2 |
| 22 | `CL-2026-000022` | public | 2026-11-23 11:56 | E2E Visitor | Set yoghurt | 5 | 2 |
| 23 | `CL-2026-000023` | public | 2026-11-23 11:56 | E2E Visitor | Set yoghurt | 5 | 2 |
| 24 | `CL-2026-000024` | public | 2026-11-23 11:56 | E2E Visitor | Set yoghurt | 5 | 2 |
| 25 | `CL-2026-000025` | public | 2026-11-23 11:57 | E2E Visitor | Set yoghurt | 5 | 2 |
| 26 | `CL-2026-000026` | public | 2026-11-23 11:57 | E2E Visitor | Set yoghurt | 5 | 2 |
| 27 | `CL-2026-000027` | public | 2026-11-23 11:57 | Screenshot Check | Sliced sandwich bread | 5 | 1 |
| 28 | `CL-2026-000028` | public | 2026-11-23 11:59 | Screenshot Check | Sliced sandwich bread | 5 | 1 |
| 29 | `CL-2026-000030` | public | 2026-11-23 12:18 | VERIFICATION RUN - delete | Sliced sandwich bread | 6 | 1 |
| 30 | `CL-2026-000031` | public | 2026-11-23 12:30 | VERIFICATION RUN - delete | Sliced sandwich bread | 5 | 1 |
| 31 | `CL-2026-000032` | public | 2026-11-23 12:31 | E2E Visitor | Set yoghurt | 5 | 2 |
| 32 | `CL-2026-000033` | public | 2026-11-23 12:31 | E2E Visitor | Set yoghurt | 5 | 2 |
| 33 | `CL-2026-000034` | public | 2026-11-23 12:31 | E2E Visitor | Set yoghurt | 5 | 2 |
| 34 | `CL-2026-000035` | public | 2026-11-23 12:31 | E2E Visitor | Set yoghurt | 5 | 2 |
| 35 | `CL-2026-000036` | public | 2026-11-23 12:31 | E2E Visitor | Set yoghurt | 5 | 2 |
| 36 | `CL-2026-000037` | public | 2026-11-23 12:31 | E2E Visitor | Set yoghurt | 5 | 2 |
| 37 | `CL-2026-000038` | public | 2026-11-23 12:31 | Screenshot Check | Sliced sandwich bread | 5 | 1 |
| 38 | `CL-2026-000039` | public | 2026-11-23 12:34 | Screenshot Check | Sliced sandwich bread | 5 | 1 |
| 39 | `CL-2026-000040` | public | 2026-11-23 12:36 | E2E Visitor | Set yoghurt | 5 | 2 |
| 40 | `CL-2026-000041` | public | 2026-11-23 12:36 | E2E Visitor | Set yoghurt | 5 | 2 |
| 41 | `CL-2026-000042` | public | 2026-11-23 12:37 | E2E Visitor | Set yoghurt | 5 | 2 |
| 42 | `CL-2026-000043` | public | 2026-11-23 12:37 | E2E Visitor | Set yoghurt | 5 | 2 |
| 43 | `CL-2026-000044` | public | 2026-11-23 12:37 | E2E Visitor | Set yoghurt | 5 | 2 |
| 44 | `CL-2026-000045` | public | 2026-11-23 12:37 | E2E Visitor | Set yoghurt | 5 | 2 |
| 45 | `CL-2026-000046` | public | 2026-11-23 12:37 | Screenshot Check | Sliced sandwich bread | 5 | 1 |
| 46 | `CL-2026-000047` | public | 2026-11-23 12:39 | Screenshot Check | Sliced sandwich bread | 5 | 1 |

## What the deletion would also remove (for the listed complaints only)

- 231 stored predictions and 4 prediction reviews (predictions use `ON DELETE SET NULL`, so they will be deleted explicitly rather than left orphaned)
- 77 attachment rows (cascade) and their files - display copies and, where present, restricted originals
- 9 investigation notes (cascade)
- In-app notifications that link to these complaints
- **Kept:** audit-log entries (append-only trail of what happened, incl. the deletion itself), the 18,000 historical records, users, uploads, demo-booking records.

## Held record

| Complaint | Source | Created (UTC) | Submitter | Product | Predictions | Photos |
|---|---|---|---|---|---|---|
| `CL-2026-000029` | public | 2026-11-23 12:10 | karuna | Pasteurized toned milk | 5 | 1 |
