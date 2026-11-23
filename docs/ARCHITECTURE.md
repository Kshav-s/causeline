# Architecture

```
Browser (React SPA)  --/api (same origin, httpOnly cookie)-->  FastAPI
                                                                |-- api/        routers (auth, complaints, ml, dashboard, analytics, capa,
                                                                |                root-cause, risk, uploads, demo-bookings, admin, reports, notifications)
                                                                |-- core/       config, security (bcrypt, JWT), deps (auth/roles), audit, rate limits
                                                                |-- services/   ml_service: registry sync, analysis runs, persistence, review
                                                                |-- ml/         registry (load once, hash, validate), preprocessing (verbatim copies),
                                                                |                engines (validated inference), safety rule
                                                                |-- analytics/  pandas analytics over stored complaints (cached by table version)
                                                                |-- ingestion/  CSV/XLSX read, mapping, row validation, import
                                                                `-- models/     SQLAlchemy ORM  -->  SQLite / PostgreSQL
Model artifacts (read-only, in place):
  AI_COMPLAINT_INTELLIGENCE/.../models/*           nlp-category, nlp-subcategory, embeddings index
  ml_predictive_analytics (1)/.../models/*.joblib  batch-risk
  ml_project/reproduced/root_cause_v1/             root-cause (reproduced, provenance.json)
  Hugging Face all-MiniLM-L6-v2 (downloaded once)  query encoder for similarity
```

## Key decisions
- **One backend process hosts inference.** The NLP package's own FastAPI service (no auth, `CORS *`) is not deployed; its functions and rules were integrated behind CauseLine's authenticated API.
- **Preprocessing is copied verbatim** and a parity test imports the original modules to prove identical output.
- **Registry refuses unsafe artifacts:** missing file → `blocked`; scikit-learn version warning → `blocked`; probe prediction must have the right shape and sum to 1. Batch-risk is marked `degraded` to disclose weak signal. SBERT loads in a background thread; similarity reports `loading` until ready.
- **Every model call is persisted** (`predictions`), grouped by `run_id`, referencing `model_versions`. Re-running never overwrites; reviews are appended (`prediction_reviews`).
- **Human-verified category** flows to the complaint only when no recorded category exists (`category_source = human_verified`). Recorded source labels are never overwritten.
- **Capability gating:** `/api/meta/capabilities` tells the UI which modules are supported; unsupported ones are hidden, partly supported ones show *Insufficient data*.
- **Auth:** bcrypt (12 rounds), HS256 JWT in an httpOnly `SameSite=Strict` cookie; 5 failed sign-ins → 15-minute lock; in-process rate limits on login, booking and inference.
- **Frontend:** lazy-loaded routes, URL-held filter state, design tokens as CSS variables (light/dark), charts read theme variables. See `DESIGN_SYSTEM.md`.
