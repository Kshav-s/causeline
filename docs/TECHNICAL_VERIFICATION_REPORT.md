# CauseLine — Technical Verification Report

Date: 2026-11-23 · Branch `feature/public-complaint-flow` (commit `b0bfbe3`) · Scope: the public complaint analysis workflow, end to end.
Method: direct inspection of the live backend (127.0.0.1:8000), the SQLite database, model artifacts, storage and inference code; scripted tests against the live API; a concurrency test against an **isolated copy** of the database on a separate server (port 8010). No model output was altered. One labelled verification complaint was created on the live system (`CL-2026-000030`, submitter "VERIFICATION RUN - delete").

---

## 1. Working functionality (tested, not assumed)

| Function | Evidence | Result |
|---|---|---|
| Public submission without login | Live `POST /api/public/complaints` with a PNG → 201 | ✅ |
| Reference generation | 24 concurrent submissions (12 threads): 24 × 201, references unique and contiguous (`CL-2026-000031…054`), format `CL-YYYY-NNNNNN`, 0 server errors | ✅ |
| Private access keys | 24 unique keys, 32 chars; DB stores only SHA-256 (verified the raw key is not in the DB) | ✅ |
| Complaint tracking | Own key → 200; another complaint's key → 404; unknown ID → 404; the two 404 bodies are identical (no existence leak) | ✅ |
| AI analysis on submit | Every public complaint has 5 stored outputs (category, subcategory, food-safety rule, similarity, root cause) with model versions | ✅ |
| Public register | Lists the new references; row fields contain no name/email/description (checked) | ✅ |
| Photo storage and access | see §7 | ✅ |
| Root cause after staff verification | Live: correction of the category on `CL-2026-000030` triggered the root-cause model (new run) | ✅ |
| Database integrity | `PRAGMA integrity_check` = ok; 0 foreign-key violations; 0 duplicate complaint IDs; 0 predictions without a model version; 0 public complaints without a key hash | ✅ |

## 2. Actual data sources

| Data | Source | Real or synthetic |
|---|---|---|
| Historical complaints (18,000) | `AI_COMPLAINT_INTELLIGENCE/.../data/01_ABT_CPD_Complaints_18000.csv` | **Synthetic** — every row `data_origin = SYNTHETIC_ABT_CPD`, `synthetic_record_flag = 1`, `record_scope` "not a verified ABT-CPD historical record" |
| Training data of all models | Same CSV (NLP, root cause); `02_…Batch_Risk_Training` (batch model, not supplied) | **Synthetic** (per both packages' READMEs) |
| Similarity index | `complaint_embeddings.npy` + `complaint_embeddings_index.joblib` | The same 18,000 synthetic records (§5) |
| Public complaints | Visitors via the form | Real submissions (`CAUSELINE_PUBLIC_SUBMISSION`) — currently 27, all test/verification records |
| Other datasets | Searched the whole project | **No other complaint dataset exists.** No actual ABT CPD historical records have been supplied |

Conclusion: the disclaimer "models were trained on synthetic demonstration data" is **accurate** and must stay. Synthetic records are stored separately (`source=import`, `is_synthetic=1`) from public submissions (`source=public`, `is_synthetic=0`).

## 3. Model integration status

| Model | Artifact | Loaded | Live status | Verified how |
|---|---|---|---|---|
| nlp-category | `tfidf_logreg.joblib` (956,908 B) + encoder | Yes, strict (version warnings = failure) | ready | Live API output identical to direct artifact call (§4) |
| nlp-subcategory | `tfidf_logreg_subcat.joblib` (5,093,228 B) + encoder | Yes | ready | Same path as above |
| nlp-similarity | embeddings 18000×384 + index + `all-MiniLM-L6-v2` | Yes | ready | §5 |
| food-safety-flag | rule (copied verbatim from handover `api.py`) | n/a | ready | Fires on "plastic", "mould" etc. |
| root-cause | `ml_project/reproduced/root_cause_v1/root_cause_model.joblib` (1,367,821 B) | Yes | ready | §6 |
| batch-risk | `batch_risk_model.joblib` | Yes | degraded (weak signal, disclosed) | Not part of this workflow |

**Permanent NLP endpoint: not connected — because none exists.** `NLP_SERVICE_URL` is empty and no `backend/.env` exists; `/api/public/meta` reports `nlp_mode: in-process`. The NLP handover contains no deployed URL (only the placeholder `my-service.onrender.com`). CauseLine runs the handover's **own artifact files** inside the backend. The remote client (`ml_service._remote_analyze`, handover `/analyze` contract, validation + fallback) exists but has only been tested against a simulated service.

## 4. NLP prediction verification

- **Parity (live API vs original code):** for 3 texts, the live API equals `tfidf_logreg.joblib` + the handover's own `clean_text`, to 4 decimals: "Packet seal broken…" → Packaging issue 0.7409; "sharp metal in bread" → Physical defect 0.2397; "Green mould spots…" → **Labelling / allergen issue 0.1922**. The first two equal the handover's VALIDATION_REPORT values. **The predictions shown are the model's real outputs.**
- **Why confidence is low (root cause of the symptom):**
  - Training text is templated: 30 distinct summaries; every description repeats a per-subcategory template. In-sample accuracy is 1.000 — and still 1.000 after removing the summary and the verbatim subcategory phrase, because the remaining template sentences still identify the class. **The supplied data cannot measure real-world accuracy at all.**
  - Free-form public wording overlaps poorly with that vocabulary: median vocabulary coverage of public complaints 0.69; top scores range 0.14–0.47; **100 % of public complaints are below the 0.5 low-confidence threshold**, so all are flagged "uncertain — manual classification recommended".
  - The mould example is a genuine misclassification (contamination text → Labelling at 0.19). The warning is correct and must not be removed.
- **Food-safety rule** behaves as designed (keyword substring heuristic, labelled as not a determination).

## 5. Historical retrieval verification

- Index: 18,000 rows, 384-dim, unit-normalised; all 18,000 IDs exist in the CSV and in the database; index metadata matches the DB 100 % (category, product).
- **All 18,000 indexed records are synthetic** (`SYNTHETIC_ABT_CPD`). Similar complaints shown to users are synthetic demonstration records.
- Public/manual complaints in the index: **0** — new complaints are not searchable (index frozen at build time).
- Retrieval quality is plausible on synthetic data (the mould query returned contamination cases for the same product at 0.48–0.51), but similarity ≠ same cause.

## 6. Root cause model verification

- **Reproduced:** yes (owner-approved, original code, seed 42) — `scripts/reproduce_root_cause_model.py`.
- **Saved:** yes; SHA-256 matches `provenance.json`; scikit-learn 1.9.1.
- **Verified:** published metrics reproduced exactly (top-1 0.4003, top-3 0.874, macro-F1 0.3944); re-check today on 500 random published predictions: **100 % exact top-3 agreement**.
- **Loaded + integrated:** live API with a recorded category returns `completed`, v1.0.0-reproduced, 3 hypotheses; without a category returns `insufficient_data` with the reason.
- **Why "not yet available" on the public page:** by design. The model's required input is a recorded/human-verified `complaint_category` (+ `food_family`); the NLP guess is not fed in. Live proof on `CL-2026-000030`: before review `insufficient_data`; after a staff correction → new run, `completed` (Temperature control deviation 0.26, Supplier microbiological quality issue 0.25, Cross-contamination 0.24); the confirmed-root-cause field stayed empty. On the live data **no staff member had yet verified any public complaint**, which is why all 27 show "not available yet".
- Hypothesis scores are low (~0.25) — consistent with a 0.40 top-1 model; shown with a "low support" note.

## 7. Image storage verification

- 48 attachment rows on 26 complaints, all FK-linked to existing complaints; **48/48 files exist, 48/48 SHA-256 match, 48/48 read-only, 0 orphan files**.
- Stored under random 32-hex names in `backend/storage/attachments/` (outside `frontend/public` and `frontend/dist`); not served statically (`/storage/...` → 404 on the API; Vite returns only the app shell).
- Access: no key → 404; wrong key → 404; staff URL without session → 401. With the key, the returned bytes are **identical** to the upload; headers `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- Validation (automated tests): wrong extension, renamed HTML, truncated PNG, empty file, GIF, >5 MB and >6 files are all rejected; content is fully decoded by Pillow.
- Not analysed by any model (stated in the UI).

## 8. Database persistence verification

Integrity ok; 0 FK violations; complaints 18,000 import + 3 manual + 27 public (counts unchanged by the schema upgrade); all public complaints `analysis_status=completed`; every prediction references a model version; reviews and the follow-up root-cause run are stored as new rows (history not overwritten).

---

## 9. Remaining problems

| # | Problem | Severity |
|---|---|---|
| P1 | No permanent external NLP endpoint is connected (none was supplied); in-process mode is used | Configuration gap |
| P2 | All historical data, training data and similar-complaint results are synthetic; similar-complaint rows and register rows do not carry a per-row "synthetic" label (only page-level notices) | Labelling gap |
| P3 | NLP classifier confidence is low on real wording (100 % of public complaints < 0.5); training data cannot estimate real accuracy | Model limitation (not a code defect) |
| P4 | Root cause appears only after staff verify the category; no public complaint has been verified yet | By design; operational |
| P5 | `model_versions` row for nlp-similarity stays `loading` after the encoder finishes (live registry says `ready`) | Bug (minor) |
| P6 | Similarity index excludes all complaints added after build (0 of 27 public) | Limitation |
| P7 | Photos keep EXIF metadata (may contain GPS location) | Privacy decision needed |
| P8 | Live DB contains 27 public test/verification complaints + 3 manual test complaints | Data hygiene |

## 10. Exact corrections required

| # | Correction | Type | Needs approval? |
|---|---|---|---|
| C1 (P1) | Supply the deployed NLP URL → set `NLP_SERVICE_URL` in `backend/.env`, restart, then run a live contract test (request schema unchanged). If there is no deployed service, record "in-process" as the permanent mode. | Configuration | **Your input** (URL) |
| C2 (P2) | Add the existing "Demo data" provenance badge to each similar-complaint row (`AnalysisResult.tsx`) and to synthetic rows in the public register (`Register.tsx`), using the `is_synthetic` flag the API already returns (similarity results need that flag added). No layout change. | Small UI + API field | Yes (minor) |
| C3 (P3) | Real improvement requires **actual ABT CPD labelled complaints**, then retraining/recalibration and evaluation on a held-out real set. Until then keep the shortlist, scores and uncertainty warnings exactly as they are. | Data + retraining | **Yes — major** |
| C4 (P4) | Operational: staff confirm/correct categories in the review queue; root cause then runs automatically (verified). Optional alternative — run root cause from the NLP guess — **not recommended** (chains two unreliable predictions, changes the model's input contract). | Process | Only if you want the alternative |
| C5 (P5) | Re-sync `model_versions` after the SBERT encoder finishes loading (one call in `registry._load_sbert`). | Bug fix (1–2 lines) | Yes (minor) |
| C6 (P6) | When real data arrives, rebuild the embedding index with the handover's own `semantic.build_index()`; optionally add new complaints incrementally. | Data pipeline | **Yes — major** |
| C7 (P7) | Decide: keep originals (evidence integrity) or strip EXIF GPS on upload. | Policy | **Your decision** |
| C8 (P8) | Delete test complaints `CL-2026-*` created by verification runs (and their photos), or re-seed a clean database before real use. Destructive — not done. | Data cleanup | **Yes** |

Nothing in this report required changing a model result. No uncertainty warning was removed.


---

## 11. Approved changes - implemented and re-verified (2026-11-23, second pass)

Approval received for C1, C2, C4, C5, C7; C3 and C6 deferred; C8 to be prepared but not executed.

| # | Decision | What was done | Verified by |
|---|---|---|---|
| C1 | Built-in NLP = official mode | No URL configured; external client retained. New guard: `NLP_SERVICE_URL` pointing at a temporary tunnel (`*.trycloudflare.com`, ngrok, localtunnel) is rejected at start-up when `ENVIRONMENT=production` (`app/core/config.py`). No Cloudflare URL exists anywhere in the project. | `test_temporary_tunnel_url_refused_in_production`; live `/api/public/meta` → `nlp_mode: in-process` |
| C2 | Label synthetic records | Similar-complaint results carry `is_synthetic` + `data_label: "SYNTHETIC DEMO DATA"`, added **at read time** from the database (stored predictions not rewritten). UI: badge on every synthetic similar-complaint row, every synthetic row of the public and staff registers, a banner on synthetic complaint detail pages, a SYNTHETIC DEMO DATA notice on Overview, Analytics, Root cause, CAPA list/detail, Risk and Reports, and in the top bar. Notices now appear whenever any synthetic records exist (previously only when *all* records were synthetic, which hid them once real submissions arrived - fixed). | `test_similar_results_labelled_synthetic` (also asserts stored output unchanged); unit test; live: similar results `ABT-CMP-…` → `True / SYNTHETIC DEMO DATA`, public submissions → `False`; screenshots |
| C4 | Keep human verification before root cause | Unchanged; re-confirmed live on `CL-2026-000030` (§6). | `test_root_cause_runs_after_staff_verify_category_and_visitor_sees_it` |
| C5 | Similarity status bug | Registry status changes after start-up (SBERT background thread) are persisted to `model_versions` through an `on_status_change` hook (`app/ml/registry.py`, `app/main.py`). | `test_late_status_change_written_to_model_versions`; live: `model_versions.nlp-similarity` = **ready** 7 s after start |
| C7 | Strip location metadata | Each upload is stored twice: a **sanitized display copy** (EXIF incl. GPS, XMP, PNG text chunks removed; EXIF orientation applied so the picture looks the same; ICC colour kept; PNG lossless, JPEG/WEBP q95) and the **untouched original** in `storage/attachments/originals/`. Visitors and analysts only ever receive the display copy; the original is downloadable by administrators only (`GET /api/complaints/{id}/attachments/{aid}/original`), every download audited. What was removed is recorded per photo (`metadata_removed`) and shown to staff. Validation, random naming, access checks and tracking unchanged. | `test_location_metadata_stripped_and_original_restricted` (GPS JPEG + PNG text chunk); live `CL-2026-000031`: upload had GPS → served copy 0 EXIF tags, orientation applied; original byte-identical, analyst 403, anonymous 401, admin 200 |

**Defect found during this pass and fixed:** the Overview KPI "New (last 30 days)" counted rows by database insertion time, so it showed all 18,039 records (the historical import was loaded today). It now counts by `complaint_received_date` (live value 46). Regression test `test_new_last_30_days_counts_received_date_not_import_time`. Also: the wider ID column pushed the Age column out of view on 1440 px screens - Batch/Owner columns now appear only at ≥1536 px.

**Deferred as instructed:** C3 (no retraining without genuine labelled ABT CPD data; model and warnings unchanged), C6 (index not rebuilt).

### Regression results after the changes
| Suite | Result |
|---|---|
| Backend pytest | **67 passed**, 0 warnings (5 new tests) |
| Frontend Vitest | **10 passed** (1 new) |
| Type-check + production build | Pass |
| Playwright E2E (desktop + Pixel 7) | **6 passed** - complaint tracking, reference generation and photo upload behave exactly as before |
| Screenshots | 28 routes × desktop + mobile = **56, 0 overflow, 0 console errors** |
| Live checks | C1, C2, C5, C7 as in the table above |

### C8 status - prepared, NOT executed
Backup `backups/pre-C8-20261123-181036/` (database + all photo files); restore test PASS. Candidate list in `docs/C8_DELETION_CANDIDATES.md`: 46 test complaints proposed, **0 synthetic historical records**, **0 non-local submissions**; `CL-2026-000029` ("karuna") held back because it was not created by a test script. Awaiting explicit approval of the final list.

---

## 12. C8 cleanup - executed (2026-11-23, approved with conditions)

Conditions: preserve `CL-2026-000029` permanently; delete only individually verified test complaints and their linked test predictions, photos and notes; keep the 18,000 synthetic historical records, audit logs and the verified backup; no database reset.

**Method.** `scripts/c8_execute_cleanup.py` - the 46 IDs are hard-coded (not pattern-selected) and each one must also match a known test fixture (submitter, description text, local IP, creating account) or the script aborts without deleting anything. A fresh snapshot of the exact pre-delete state was taken first (`backups/pre-C8-exec-20261123-235641/`); the verified backup `backups/pre-C8-20261123-181036/` was hashed before and after (unchanged). One transaction; the deletion itself is recorded in the audit log (`data.c8_cleanup`).

| Fixture evidence | Complaints |
|---|---|
| `frontend/e2e/workflow.spec.ts:17-21` - "E2E Visitor", "E2E <ts>: hard plastic fragment..." | 28 |
| `frontend/e2e/screenshots.mjs:24-25` - "Screenshot Check", mould on sliced bread | 7 |
| baseline `4b75af4` staff-flow spec - analyst test account, "E2E <ts>: customer found live insects..." | 3 |
| verification script - "VERIFICATION RUN - delete" | 2 |
| **Total deleted** | **46** |

| Records | Deleted | Retained |
|---|---|---|
| Complaints | 46 | 18,001 (18,000 synthetic historical + `CL-2026-000029`) |
| Predictions | 231 | 76 |
| Prediction reviews | 4 | 1 |
| Photo rows / files | 77 rows / 106 files (77 display copies + 29 restricted originals) | 1 row / 1 file (`CL-2026-000029`) |
| Investigation notes | 9 | 0 |
| In-app notifications linking to deleted complaints | 86 | 8 |
| Audit log entries | 0 | 179 (178 + the cleanup entry) |
| Historical hypotheses / batch scores / CAPA watchlist | 0 | unchanged |

**Post-checks (all pass):** `integrity_check` ok; 0 foreign-key violations; 0 predictions pointing at a missing complaint; 0 photo rows without a file and 0 files without a row; 18,000 historical records unchanged; `CL-2026-000029` row digest identical before/after, its photo still served (200, image/webp); deleted references return the same 404 as unknown ones (public and staff); verified backup unchanged.

**Defect found and fixed during cleanup:** reference allocation took `max(existing id) + 1`, so after the deletion the next complaint would have been issued `CL-2026-000030` - a reference already named in the audit trail for a deleted record. The allocator now takes the high-water mark over complaints **and** complaint IDs in the append-only audit log (`app/ingestion/complaints.py::next_manual_id`); format, uniqueness and retry-on-collision unchanged. Next live reference: `CL-2026-000048`. Test: `test_deleted_reference_is_never_reissued`.

**Tests after cleanup:** backend pytest **68 passed**; Vitest **10 passed**; type-check pass; Playwright **6 passed** (desktop + mobile). E2E now runs against an **isolated backend** (port 8001, scratch copy of the database) via `CL_API_TARGET`/`CL_PORT`, so test runs no longer create records in the live database - verified: live complaint count unchanged after the run (18,001), the isolated copy received the 6 test submissions (`CL-2026-000048` onward).


---

## 13. Improvement programme (items 1-14) - implemented and verified (2026-11-24)

Assessment first: `docs/IMPROVEMENT_ASSESSMENT.md`. Each step was tested before the next.

| # | Item | Result | Verified by |
|---|---|---|---|
| 1 | Submission journey | Four steps (About you, Product and problem, Photos, Review and submit) with progress indicator, per-step validation, image previews, review screen. **Duplicate protection**: one-time submission token per form (only its SHA-256 stored, unique index) - a repeat gets 409 with the existing reference, nothing is created, photos are not stored twice; a same-device content signature warns before resending. Fix found while testing: the Next button was being re-used as the Submit button, so revealing the review step could submit the form - they are now separate elements. | `test_same_form_submitted_twice_creates_one_complaint`; E2E duplicate test and step flow (desktop + mobile) |
| 2 | Analysis page | Evidence summary at the top: Recorded information / NLP prediction / Similarity scores / Root-cause hypotheses / Food-safety alert / Human-verified findings, each with its provenance badge; only the last line is a finding. Existing panels unchanged. | 2 Vitest tests; E2E |
| 3 | Tracking | Complainant timeline built only from stored records (submission, analysis runs, quality-team reviews, status changes, root-cause confirmation, closure), labelled Recorded / AI suggestion / Quality team. No staff names, internal notes or change reasons. Reference verification unchanged. | `test_complainant_timeline_shows_progress_but_no_internal_details`; E2E |
| 4 | Register | Already had search, filters, sorting, pagination and details; unchanged. | existing tests |
| 5 | Dashboard | KPI row adds the recorded food-safety count and Zombie CAPAs; Pareto, monthly trend, recurring defects and CAPA effectiveness were already present. | `scripts/verify_metrics.py` |
| 6 | Zombie CAPA detector | New page and API. 1,255 zombie CAPAs of 2,388 closed; 2,081 recurrences (1,084 same recorded cause, 134 different, 863 not recorded); median 65 recorded follow-up days to first recurrence. Each links originating complaints, earlier investigation IDs and recurrences. | 4 tests incl. independent recomputation |
| 7 | Product / batch risk | New "Repeat-complaint batches" (recorded batch_id, 2 or more complaints) - identical to the supplied `recurring_batches.csv` (same batch count, recurring count, maximum). Batch-risk model unchanged (degraded, needs dataset 02). | parity test on the full file; endpoint test |
| 8 | Zero Complaint Path Simulator | New page and API, labelled ESTIMATE, six stated assumptions. 2025 baseline 987 complaints; 404 attributable; estimated avoidable 168 (range 122-216); 583 not reachable on current evidence. Causes with fewer than 10 assessed CAPAs are not estimated. | 4 tests incl. full-dataset independent recount |
| 9 | HACCP | **No HACCP plan supplied**, so control points cannot be monitored against limits - stated on the page. Added complaint signals per recorded control point (gap flags, critical, last flagged). | `test_haccp_states_plan_missing_and_lists_control_points` |
| 10 | UI states | New pages use the existing loading skeletons, empty/error states with retry, mobile card layouts and labelled controls; the simulator table got a mobile card layout after the screenshot review. | screenshots |
| 11 | Metrics from the database | **24/24** dashboard metrics and chart totals equal independent raw SQL on the live database. | `scripts/verify_metrics.py` |
| 12 | NLP + root cause connected | All six models load (batch-risk degraded as before); preprocessing parity tests pass; full-journey E2E: NLP suggestion -> staff correction -> root-cause model runs -> confirmed cause recorded separately. | pytest parity tests; E2E full journey |
| 13 | Tracking + image security | Unchanged and re-tested: access-key 404s, metadata-stripped display copies, admin-only originals. | `test_public.py`; E2E privacy test |
| 14 | Critical journeys | E2E: duplicate protection, submission -> analysis -> register, privacy, staff view, full journey to confirmed cause, complainant timeline, reports, zombie detector and simulator. | **10/10** Playwright (desktop + mobile) |

**Defect found and fixed - analysis windows anchored in a data gap.** The historical import ends 2025-12-31; the only genuine submission is dated 2026-11-23. "Last 12 months" comparisons were anchored on the latest record, so product monitoring showed **all 49 products as Falling** and only **4** emerging hotspots. Windows now end at the last month with complete coverage (2025-12-31) and the response says why; with continuous live data the anchor is the latest date as before. Corrected: 26 Stable / 15 Falling / 8 Rising; 412 recurring and **133** emerging hotspots - matching the supplied report. Tests: `test_reference_date_*`.

**Regression:** backend **83 passed**; Vitest **12 passed**; type-check and production build pass; Playwright **10 passed** (isolated backend); screenshots **64/64** (32 routes x desktop + mobile), no overflow or console errors; live metric check 24/24. No test run modified the live database (18,001 complaints).

**Left for the project owner:** 28 pending-review predictions from 23 Nov testing remain (26 free-text runs on the AI Analysis page, 2 on historical record `ABT-CMP-2007-014934`). They count in "Awaiting review". They were outside the C8 approval and have not been touched.

---

## 14. Public site refresh (2026-11-24)

Requested visual changes to the public site, using the Focus2Work screenshots in `template/` as layout reference only (no copy, brand or imagery taken). Navy/teal palette, IBM Plex type and existing components kept.

| Change | Implementation |
|---|---|
| Larger, bolder text | Public base 16px (was 14px), headings 42px, nav links 15px semibold with underline-on-hover; fixed header turns solid on scroll |
| Full-screen hero | Hero fills the viewport (`100svh`); white sections start on scroll. "Why teams move" label removed |
| Cursor-lit grid | A brighter copy of the hero grid is masked to a circle at the pointer (`.grid-spot`), mouse only |
| Moving preview | Illustrative preview tilts towards the pointer with a parallax chip, idle float |
| Button animation | Lift, light sweep, arrow nudge, soft pulse on the primary |
| Capability pills -> points | Six icon + title + one-line points in a band at the bottom of the hero |
| New sections | Why CauseLine (outlined numerals), closed loop Detect -> Investigate -> Correct -> Verify (animated), complaint journey 1-5 (animated), six modules + engineering panel (live model status from `/api/public/meta`), real screenshot tour, complaint register by category (live counts), features |
| Motion safety | All motion stops under `prefers-reduced-motion`; autoplay pauses off-screen and for 8 s after a click |

**New endpoint** `GET /api/public/register/summary` - aggregate counts per recorded category (no identifiers, names or free text). Subcategory labels are shown only when they come from imported dataset records and are shared by at least 5 records, so a value typed onto one complaint can never appear publicly. Tests: `test_register_summary_is_aggregate_only_and_matches_counts`, `test_register_summary_never_shows_one_off_subcategory_text`.

**Defect found and fixed - first tap on "Next" lost on phones.** The complaint form validates on blur; tapping Next blurred the description, the reflow moved the button 26 px and the tap missed it, so a visitor had to tap twice. The Next button now keeps focus on mousedown (validation still runs). Also added `scroll-padding-top` so the fixed header never hides a focused field. Found by the mobile E2E run.

**Product screenshots** (`frontend/public/product/*.png`) are real captures of the running app, taken from the isolated test copy (`e2e/product-shots.mjs`) so no genuine submission appears in a public image. Replace a file to update it; a missing file hides its tab.

**Regression:** backend **85 passed**; Vitest **12 passed**; type-check and build pass; Playwright **10 passed** (isolated backend); screenshots **64/64** clean. Hover behaviour checked by moving a real pointer in Playwright (`--spot=1`, preview transform applied).

**Observed on the live database:** a second public submission, `CL-2026-000048` (23 Nov 19:18, same product as `CL-2026-000029`), not created by any test run. Treated as genuine and left untouched.
