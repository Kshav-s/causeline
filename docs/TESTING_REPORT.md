# Testing Report — 2026-11-23

All results below were produced in this environment (Windows 11, Python 3.14.7, Node 24.20).

| Suite | Command | Result |
|---|---|---|
| Root-cause reproduction check | `python -I scripts/reproduce_root_cause_model.py` | Metrics identical to published; 10,783/10,783 predictions identical (max prob diff 0.0000) |
| Backend (pytest, temp SQLite, real artifacts) | `pytest -q` | **40 passed** |
| Frontend unit (Vitest + Testing Library) | `npm test` | **8 passed** |
| Type-check + production build | `npx tsc -b && vite build` | Pass |
| End-to-end (Playwright, desktop 1440 + Pixel 7) | `npx playwright test` | **4 passed** |
| Visual: 24 routes × desktop 1440×900 + mobile 390×844, full page | `node e2e/screenshots.mjs` | 48/48 rendered, **0 horizontal overflow, 0 console errors** (after fixes below) |
| Live API smoke test (uvicorn + SBERT loaded) | scratch script | All endpoints 200/expected 4xx; similarity search live (top neighbour 0.916) |

## What the tests cover
- **ML parity:** CauseLine's `clean_text`, `combine_text`, root-cause `_text` and batch `build_features` produce identical output to the original modules (imported from the supplied folders).
- **ML integration:** registry status and hashes; classifier output equals the handover's VALIDATION_REPORT reference values (0.7409, 0.2397); empty/short text → insufficient data; food-safety rule; root cause requires category + family; unknown category warning; batch valid/missing/unknown level; **missing artifact → blocked**; **invalid probability vector → error**; unavailable model → error, never a guess; similarity degraded path.
- **API:** 401 on protected routes; generic login errors; httpOnly + SameSite cookie; analyst 403 on admin; validation field errors; persistence + audit on create/update; analysis persists 5 outputs with model versions; history not overwritten; review rules (reason, valid label), human-verified category flows to the complaint, root cause then runs; batch endpoint validation; analytics & reports; upload wizard incl. row errors, in-file and DB duplicates, unmapped columns preserved, bad file types; demo booking creates no predictions; admin booking update + notification; last-admin protection; complaint-ID race.
- **E2E:** UI login → new complaint (client validation, then save & analyse) → stored prediction with model name/version/PRD id visible → root cause shows insufficient data → human confirm → survives reload; public demo booking with validation and confirmation reference.

## Defects found and fixed during verification
1. Pareto serialisation crashed on namedtuple indexing → fixed.
2. NaN values from pandas broke JSON responses (CAPA list) → global NaN-safe response class.
3. Starlette re-raising after the catch-all handler dropped connections → errors handled in middleware.
4. Login rejected `*.local` accounts (email deliverability check) → plain string for sign-in.
5. Concurrent complaint creation produced duplicate `CL-` IDs (500) → retry on integrity conflict + regression test.
6. KPI badges and long KPI values overflowed (13 px desktop, 27 px mobile) → layout fixed.
7. Pareto "100%" label and last cumulative point clipped → axis margin + clamp.
8. 401 console noise on public pages → `/api/auth/session` probe.

## Not tested / known gaps
- PostgreSQL (code is dialect-neutral; only SQLite exercised).
- Load/performance testing; multi-instance rate limiting.
- SMTP email delivery (no SMTP configured; in-app notification path tested).
- Screen-reader pass with real assistive technology (semantic roles, labels and focus states were implemented; not audited with NVDA/JAWS).
- **A passing test proves wiring, not model accuracy** - see ML_MODEL_AUDIT.md for the models' real limitations.

## Re-verification after the public complaint workflow (2026-11-23)
| Suite | Result |
|---|---|
| Backend pytest | **62 passed** (22 new in `test_public.py`) |
| Frontend Vitest | **9 passed** |
| Type-check + production build | Pass |
| Playwright E2E (desktop + Pixel 7) | **6 passed**: visitor raises complaint with photos without login → reference + key → real AI result (model/version/PRD id, food-safety flag, similar complaints, photos, disclaimer) → survives reload → appears in anonymised register; stranger gets "access key needed", API 404/401, `/app` → `/staff`; staff sign in at `/staff`, see photos + complainant, add note |
| Screenshots | 27 routes × desktop + mobile = 54, **0 overflow, 0 console errors** |

New backend coverage: image validation (wrong extension, renamed HTML, truncated PNG, empty, GIF, >5 MB, >6 files), required/optional fields, future date, bad email, honeypot, rate limit (429), access-key gating for details and photos, key scoped to one complaint, anonymised register (no PII), public cannot reach staff endpoints, **AI failure keeps the complaint + retry works**, staff photos/notes/activity, confirmed root cause attributed and never auto-filled from a hypothesis, dashboard counts equal DB counts, HACCP labelling, root cause runs after category verification and the visitor sees it, external NLP contract / fallback / invalid payload rejection.

Defects found and fixed in this round: mobile register cards lacked the category; staff detail tabs overflowed on mobile (16 px); mobile header button wrapped; the rate limiter (correctly) blocked the 11th test submission - limit made configurable.

## Re-verification after approved changes C1/C2/C5/C7 (2026-11-23)
Backend 67 passed (0 warnings) · Vitest 10 passed · type-check + build pass · Playwright 6 passed (desktop + mobile) · 56 screenshots clean. New tests: tunnel URL guard (C1), synthetic labelling at read time without rewriting stored outputs (C2), late status persistence (C5), GPS/EXIF/PNG-text stripping with restricted original (C7), "new in last 30 days" KPI regression. Defect fixed: "New (last 30 days)" counted import time instead of received date.

## Isolated E2E runs (since C8, 2026-11-23)
E2E tests submit real complaints, so they must not run against the live database. Procedure:
1. Copy the database (SQLite backup API) and `storage/attachments` to a scratch folder.
2. `DATABASE_URL=sqlite:///<scratch>/causeline.db ATTACHMENT_DIR=<scratch>/attachments PUBLIC_SUBMIT_PER_HOUR=500 uvicorn app.main:app --port 8001`
3. `CL_API_TARGET=http://127.0.0.1:8001 CL_PORT=5174 npx vite --strictPort`
4. `CL_BASE=http://localhost:5174 CL_EMAIL=... CL_PASSWORD=... npx playwright test`
After C8: backend 68 passed, Vitest 10 passed, Playwright 6 passed; live complaint count unchanged by the run.

## Improvement programme (2026-11-24)
Backend 83 passed (new: duplicate token, timeline, zombie x4, simulator x5 incl. full-dataset recount, reference date x2, recurring batches x2 incl. parity with the supplied report, HACCP). Vitest 12 passed (evidence summary x2). Playwright 10 passed: duplicate protection, step form, timeline, evidence summary, full journey (submission -> staff correction -> root-cause model -> confirmed cause -> complainant timeline -> reports, zombie detector, simulator). Screenshots 64/64 clean. `scripts/verify_metrics.py`: 24/24 dashboard metrics equal raw SQL on live data.
Note: the login limiter (10 per 5 min) blocks back-to-back E2E + screenshot runs; restart the isolated backend between runs.

## Public site refresh (2026-11-24)
Backend 85 passed (new: register summary counts, one-off subcategory text never public). Vitest 12 passed. Playwright 10 passed - the mobile run caught a lost first tap on the form's Next button (fixed). Screenshots 64/64; `e2e/screenshots.mjs` now scrolls each page once so scroll-reveal sections render before capture.
