# Database Schema

Defined in `backend/app/models/entities.py` (SQLAlchemy 2). Created with `Base.metadata.create_all` on startup/seed. SQLite enforces foreign keys (`PRAGMA foreign_keys=ON`); the same models run on PostgreSQL.

| Table | Purpose | Key columns / constraints |
|---|---|---|
| `users` | Accounts | `email` unique; `role` admin/analyst; bcrypt `password_hash`; `failed_logins`, `locked_until`; theme, density |
| `uploads` | Every import (incl. seed `IMP-SEED1`) | `reference` unique; `stored_path` (immutable copy, read-only), `sha256`; mapping, validation summary, row counts, status |
| `complaints` | Complaint register | `complaint_id` unique (source ID preserved); FK `upload_id` → uploads (nullable); `source` import/manual; `source_row_number`; `is_synthetic`, `data_origin`; recorded fields mirroring the source columns; `category_source` recorded/human_verified; `extra` JSON (unmapped source columns verbatim); `created_by_id`, `updated_by_id`; indexes on date, status, product, category, severity, batch, capa ids |
| `model_versions` | Model registry snapshot | unique (`model_key`, `version`); artifact paths + SHA-256, input/output schema, preprocessing version, status, metrics, limitations, thresholds, `last_validated_at`. Old versions never deleted |
| `predictions` | Every model/rule output | `reference` unique (`PRD-000001`); `run_id`; FK `model_version_id`; FK `complaint_pk` (nullable, SET NULL); input/output JSON; `status` completed/insufficient_data/error; `top_label`, `top_score`, `low_confidence`; `review_status` |
| `prediction_reviews` | Human decisions | FK `prediction_id` (CASCADE); action confirmed/rejected/corrected; `corrected_label`, `reason`, `reviewer_id` |
| `historical_root_cause_hypotheses` | Pre-computed model output (10,783) | soft `complaint_id` + FK `complaint_pk`; hypotheses JSON; `source_file`; FK `model_version_id` |
| `historical_batch_risk_scores` | Pre-computed model output (9,288) | batch, product, score, tier, **recorded** 30-day outcome, drivers, action, `source_file` |
| `capa_watchlist` | Open-CAPA status from the supplied watchlist (965) | `capa_id` unique, `capa_status` |
| `audit_logs` | Append-only audit | user, action, entity, details JSON, IP, timestamp |
| `notifications` | In-app alerts | per user or per role (`audience_role`), `read_by` JSON |
| `demo_bookings` | Public demo requests | `reference` unique; contact, slot, purpose, consent, status, notes, `notification_status` |

All mutable tables carry `created_at` / `updated_at` (UTC). CAPAs are not a separate table yet: they are derived from `complaints.capa_id` until `04_CAPA_History` is supplied (then add a `capas` table keyed by `capa_id`).

**Migrations:** none yet (schema created from models). Before production on PostgreSQL, add Alembic and generate an initial migration from these models.
