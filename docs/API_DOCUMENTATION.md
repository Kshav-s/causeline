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
| GET/POST `/api/admin/users` · PATCH `/{id}` · GET `/api/admin/audit` | admin | Users, audit log | last-admin protection |
| GET `/api/reports/templates` · `/api/reports/{template}` | user | Report data | audited |
| GET `/api/notifications` · POST `/{id}/read` · `/read-all` | user | In-app notifications | |

Database operations and tests for each group: see `backend/tests/test_api.py` and `test_ml_engines.py`.

## Public complaint API (no account) - added 2026-11-23

| Method & path | Auth | Purpose | Notes / errors |
|---|---|---|---|
| POST `/api/public/complaints` | none; `PUBLIC_SUBMIT_PER_HOUR` per IP (default 10); honeypot `website` | Multipart: `customer_name`*, `product_name`*, `complaint_date`*, `description`* (20-5000), `organisation`, `email`, `severity` (Routine/Major/Critical), `batch_id`, `additional_info`, `images[]` (≤6, JPG/JPEG/PNG/WEBP, ≤5 MB, verified by full decode) | 201 `{complaint_id, access_key, analysis_status}`; key shown once, only its SHA-256 stored; 413/415/422/429/400. Complaint is committed **before** AI runs; AI failure → `analysis_status=failed`, complaint kept |
| GET `/api/public/complaints/{id}` | header `X-Access-Key` | Submitter's full view: complaint, photos list, newest output per model, human-verified findings | 404 for wrong key or unknown ID (indistinguishable) |
| POST `/api/public/complaints/{id}/analyze` | `X-Access-Key`, 20/hour | Retry AI analysis | 409 if already completed |
| GET `/api/public/complaints/{id}/attachments/{aid}` | `X-Access-Key` | Stream one photo | `Cache-Control: private, no-store`, `nosniff` |
| GET `/api/public/register` | none | Anonymised register: ID, date, product, category (recorded/verified) or labelled AI suggestion, severity, analysis status, investigation status; search/filter/sort/paging | never returns names, emails, customers, descriptions or photos |
| GET `/api/public/products` · `/api/public/meta` | none | Product names for suggestions; limits and model status | |

## Staff additions
| GET `/api/complaints/{id}/attachments/{aid}` | staff | Photo | |
|---|---|---|---|
| GET/POST `/api/complaints/{id}/notes` | staff | Investigation notes | audited |
| GET `/api/complaints/{id}/activity` | staff | Submission, edits, analyses, reviews, notes | |
| PATCH `/api/complaints/{id}` with `root_cause_status: "Confirmed"` | staff | Records who confirmed the cause and when | 422 without a category |
| GET `/api/analytics/haccp` | staff | Recorded HACCP potential-gap flags by process step | flag ≠ failed control |

Reviewing an `nlp-category` prediction as confirmed/corrected now also runs the root-cause model for that complaint (new run; nothing overwritten). The demo-booking endpoints were removed.

## Changes (approved C2/C7, 2026-11-23)
- Similar-complaint results (`nlp-similarity` output) include `is_synthetic` and `data_label` ("SYNTHETIC DEMO DATA") per record, computed at read time.
- `GET /api/complaints/{id}/attachments/{aid}/original` - **admin only**, audited: untouched original upload. All other photo endpoints serve the metadata-stripped display copy.
- Staff complaint detail attachments include `sanitized`, `metadata_removed`, `has_original`, `original_sha256`, `original_size_bytes`.

## Changes (improvement programme, 2026-11-24)
- `POST /api/public/complaints` accepts optional `submission_token` (16-64 chars `[A-Za-z0-9_-]`). A repeat with the same token returns **409** `{detail, complaint_id, duplicate: true}`; nothing is created and no access key is returned.
- `GET /api/public/complaints/{id}` adds `timeline[]` (`at`, `kind` = recorded | ai | human, `title`, `detail`) - complainant-safe events only.
- `GET /api/capa/zombies` (staff): `q`, `cause` (all|same|different), `sort` (recurrences|critical|days_to_first|last_recurrence|capa_id), `order`, `page`, `page_size`. Returns `items`, `total`, `summary`, `rule`.
- `GET /api/capa/{id}` adds a `zombie` block and investigation / root-cause fields on each linked complaint.
- `GET /api/analytics/zero-complaint-path` (staff): `months` (3-60), repeated `cause`, `all_causes`. Returns baseline, attributable, per-cause rows with effectiveness and Wilson range, `path`, `assumptions`, `label: "ESTIMATE"`.
- `GET /api/risk/recurring-batches` (staff): `q`, `recurring_only`, `sort`, `order`, paging.
- `GET /api/analytics/haccp` adds `controls[]`, `plan_available: false`, `plan_note`.
- `GET /api/dashboard` KPIs add `zombie_capas`, `closed_capas`. Recurrence and product endpoints add `reference_note`.

## Changes (public site refresh, 2026-11-24)
- `GET /api/public/register/summary` (public, no auth): `total`, `synthetic`, `public_submissions`, `uncategorised`, `categories[]` (`category`, `complaints`, `critical`, `not_closed`, `subcategory_count`, `subcategories[]` up to 4 - imported dataset labels shared by >= 5 records only), `basis`. Aggregate counts only.
