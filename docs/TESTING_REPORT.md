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
