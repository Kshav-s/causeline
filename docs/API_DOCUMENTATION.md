# API Documentation

Interactive OpenAPI: `GET /api/docs` (disabled when `ENVIRONMENT=production`). All endpoints return JSON; validation errors are `422 {"detail":"Validation failed","errors":[{field,message}]}`; unexpected errors are `500 {"detail":"Internal server error"}` (no internals leaked). **Auth** = session cookie from `/api/auth/login` (or `Authorization: Bearer`). Every list endpoint is paginated server-side.

| Method & path | Auth | Purpose | Notes / errors |
|---|---|---|---|
| POST `/api/auth/login` | public, rate-limited 10/5 min | Sign in, sets httpOnly cookie | 401 generic message; 423 locked after 5 failures |
| POST `/api/auth/logout` | any | Clear cookie | |
| GET `/api/auth/session` | public | `{user|null}` session probe | always 200 |
| GET/PATCH `/api/auth/me` | user | Profile, theme, density | |
| POST `/api/auth/change-password` | user | | 400 wrong current; 422 weak |
| GET `/api/meta/capabilities` | user | Enabled modules, model status, data availability, missing datasets | drives navigation |
| GET `/api/health` | public | DB + model status | |
| GET `/api/complaints` | user | List: `q, tab, sort, order, page, page_size, date_from, date_to, product[], category[], severity[], status[], batch, upload_id, capa_id, prior_capa_id, root_cause` | tab counts included; 422 bad sort |
| GET `/api/complaints/filters` | user | Distinct filter values | |
| GET `/api/complaints/export.csv` | user | CSV of filtered records (≤50k) | audited |
| GET `/api/complaints/{id}` | user | Detail + unmapped fields + historical hypotheses | 404 |
| POST `/api/complaints` | user | Create (manual) → `CL-YYYY-NNNNNN` | 422 field errors; ID race retried |
| PATCH `/api/complaints/{id}` | user | Edit operational fields; `change_reason` required | audited with before/after |
| GET `/api/ml/models` | user | Registry + version history + prediction counts | |
| GET `/api/ml/labels/{model}` | user | Valid labels for corrections | |
| POST `/api/ml/analyze/complaint/{id}` | user, 120/min | Run all models on a stored complaint; persists 5 predictions | |
| POST `/api/ml/analyze/text` | user, 120/min | Ad-hoc text (+ optional category, food family) | 422 empty |
| GET `/api/ml/runs/{run_id}` · `/api/ml/complaints/{pk}/runs` | user | Stored results / full history | |
| GET `/api/ml/predictions` | user | Review queue (`review_status`, `model_key`) | |
| POST `/api/ml/predictions/{ref}/review` | user | `confirmed / corrected / rejected` | 400 non-reviewable; 422 reason/label rules |
| GET `/api/ml/batch-risk/options` · POST `/api/ml/batch-risk` | user | Batch model levels / score one batch | 422 ranges, dispatch before production |
| GET `/api/dashboard` | user | KPIs, trend, severity, top products, Pareto, attention lists | date filters |
| GET `/api/analytics/pareto` · `/trends` · `/recurrence` · `/products` | user | Rule-based analytics | 422 unknown dimension |
| GET `/api/capa` · `/api/capa/effectiveness` · `/api/capa/{id}` | user | CAPA list, Wilson-CI rates, detail with recurrences | |
| GET `/api/root-cause` · `/associations` · `/hypotheses` | user | Recorded causes, associations, pre-computed hypotheses | |
| GET `/api/risk/batches` | user | Historical batch scores + tier summary | |
| POST `/api/uploads` | user | Upload CSV/XLSX (type, magic bytes, size ≤ 25 MB) | 415, 413, 400 |
| GET `/api/uploads/{id}/columns` · POST `/validate` · GET `/errors.csv` · POST `/commit` · POST `/cancel` · GET `/api/uploads` | user | Wizard steps + history | 409 commit before validate |
| POST `/api/demo-bookings` | public, 5/hour | Create booking (honeypot, weekday, future, consent) | never reaches a model |
| GET `/api/demo-bookings` · PATCH `/{ref}` | admin | Manage bookings | 403 analyst |
| GET/POST `/api/admin/users` · PATCH `/{id}` · GET `/api/admin/audit` | admin | Users, audit log | last-admin protection |
| GET `/api/reports/templates` · `/api/reports/{template}` | user | Report data | audited |
| GET `/api/notifications` · POST `/{id}/read` · `/read-all` | user | In-app notifications | |

Database operations and tests for each group: see `backend/tests/test_api.py` and `test_ml_engines.py`.
