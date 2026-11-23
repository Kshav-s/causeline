# Deployment Guide

## Prerequisites
- Python 3.12+ (verified 3.14.7) with the pinned `backend/requirements.txt` (scikit-learn **must** be 1.9.1).
- Node 20+ for building the frontend.
- ~2 GB RAM with similarity search (torch + MiniLM); ~400 MB without (`ENABLE_SBERT=false` → similarity shows "unavailable", everything else works).
- The two supplied model folders and `ml_project/reproduced/` at the paths in `backend/app/core/config.py` (or override `NLP_DIR`, `ML_DIR`, `REPRODUCED_DIR`).
- Outbound HTTPS to huggingface.co once, to download `all-MiniLM-L6-v2` (or pre-populate the HF cache). No complaint data is sent.

## Steps
1. `backend/.env` from `.env.example`: set `ENVIRONMENT=production`, a long random `JWT_SECRET` (startup fails without it in production), `COOKIE_SECURE=true`, `CORS_ORIGINS` (only needed if the frontend is on another origin), `DATABASE_URL`.
2. PostgreSQL / Supabase: `pip install "psycopg[binary]"`, set `DATABASE_URL=postgresql+psycopg://...`. Add Alembic and an initial migration before go-live (not yet done).
3. `python -I scripts/reproduce_root_cause_model.py` (once; aborts unless the result matches the published metrics and predictions).
4. `python backend/scripts/seed.py --admin-email <real admin>` with `ADMIN_PASSWORD` set in the environment; do **not** use `--with-analyst` in production.
5. Run the API: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1` behind a reverse proxy with TLS. Use one worker per process (models load per process; rate limits are in-process).
6. `cd frontend && npm ci && npm run build`; serve `frontend/dist` from the same origin and proxy `/api` to the API (cookie is `SameSite=Strict`). Configure SPA fallback to `index.html`.
7. Verify: `GET /api/health` shows `database: ok` and model statuses; sign in; open Model registry; run one analysis.

## Operations
- **Backups:** SQLite - copy `backend/data/causeline.db` (WAL mode; use `sqlite3 .backup`) and `backend/storage/uploads/` daily. PostgreSQL - managed snapshots / `pg_dump`.
- **Logs:** stdout (uvicorn + `causeline.*` loggers). The audit trail is in the `audit_logs` table.
- **Model updates:** add a new spec/version in `app/ml/registry.py`; old versions stay in `model_versions` and existing predictions keep their reference.
- **Security checklist:** HTTPS only, `COOKIE_SECURE=true`, strong `JWT_SECRET`, change seeded passwords, restrict `/api/docs` (auto-disabled in production), keep `backend/.env` out of version control.

## Public complaint workflow settings (2026-11-23)
- `ATTACHMENT_DIR` (default `backend/storage/attachments`): private photo storage. **Back it up with the database**; serve it only through the API, never from a static web root. For multiple instances use shared storage (e.g. S3-compatible bucket) behind the same access checks.
- `PUBLIC_SUBMIT_PER_HOUR`, `MAX_IMAGE_MB`, `MAX_IMAGES_PER_COMPLAINT`; behind a reverse proxy make sure the client IP reaches the app (proxy headers) or rate limits apply to the proxy IP.
- `NLP_SERVICE_URL` (optional) and `NLP_SERVICE_TIMEOUT_S`.
- Pillow is now required (`pip install pillow`, pinned in requirements).
