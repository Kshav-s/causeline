# Improvement assessment (2026-11-24)

Inspection of the whole codebase (backend `app/`, frontend `src/`, tests, docs, supplied ML project and data) before
implementing the 14 requested improvements. Status after C8: 18,001 complaints (18,000 synthetic historical + 1 genuine
public submission `CL-2026-000029`).

## 1. Existing working features (verified by tests or live checks)

| Area | What works | Evidence |
|---|---|---|
| Complaint submission (item 1) | No-login form, product look-up, up to 6 photos with previews, client + server validation (type, size, decode, count), honeypot, rate limit, upload progress, complaint saved before analysis | `test_public.py`, E2E `workflow.spec.ts` |
| AI analysis (item 2) | Provenance-labelled panels: NLP category (uncalibrated score, shortlist, low-confidence warning), subcategory, similarity (synthetic records labelled), root cause (only after staff confirm category), food-safety rule banner; retry; review (confirm / correct / reject) | `AnalysisResult.tsx`, C2/C4 tests |
| Tracking (item 3) | Reference + private access key (SHA-256, constant-time compare, identical 404 for wrong key / unknown ID), key kept out of URL history | `test_access_key_required_for_details_and_images` |
| Register (item 4) | Public anonymised register and staff register: search, category/severity/status filters, sort, pagination, mobile cards; staff detail page | `Register.tsx`, `Complaints.tsx` |
| Dashboard (item 5) | KPI cards, monthly trend with 3-month average, category Pareto, severity mix, attention list, recurrence hotspots, CAPA effectiveness by dimension with Wilson CI | `insights.py`, `analytics/complaints.py` |
| Product / batch risk (item 7) | Product-level monitoring (rule-based), historical batch-model scores (out-of-sample), score-a-batch form with model warning | `Risk.tsx` |
| HACCP (item 9) | Signals by process step from recorded `potential_haccp_gap_flag` (labelled as review prompts) | `/api/analytics/haccp` |
| Security (item 13) | Image sanitising (GPS/EXIF removed), admin-only originals, random file names, traversal guards | C7 tests |
| NLP / root cause (item 12) | In-process NLP artifacts (parity with direct artifact output), reproduced root-cause model, strict loading, versioned persisted predictions | `test_ml_preprocessing_parity.py`, verification report §1-6 |

## 2. Missing features

| # | Missing | Notes |
|---|---|---|
| 1 | Step-by-step form with progress indicator; server-side duplicate-submission protection | Form is one long page; only the button is disabled during submit - a double submit / resubmit after a network drop can create two complaints |
| 2 | A single at-a-glance summary separating the six evidence types | Panels are labelled individually; no summary of what is recorded vs predicted vs verified |
| 3 | Investigation timeline for the complainant | Staff have an activity log; the complainant sees only current status |
| 6 | Zombie CAPA detector | CAPA list counts recurrences, but no view of *closed* CAPAs followed by identifier-linked recurrences, linked to the earlier investigations |
| 7 | Complaint-linked recurring batches | `batch_id` is on 75.6% of complaints; repeat complaints per batch are not shown |
| 8 | Zero Complaint Path Simulator | Not implemented |
| 9 | HACCP control-point monitoring | Only per-process-step signals; per-control-point view missing. **No HACCP plan** (critical limits, monitoring frequency, corrective actions) was supplied, so true CCP monitoring is not possible |
| 14 | E2E journey through staff review, root cause and reporting | E2E covers submission, privacy and staff view only |

## 3. Broken functionality

| Issue | Status |
|---|---|
| Reference reuse after deletion (`next_manual_id` = max + 1 would re-issue `CL-2026-000030`) | **Fixed** during C8 (`aa73a4e`) |
| E2E runs wrote test complaints into the live database | **Fixed** - isolated E2E backend (`CL_API_TARGET`) |
| No other broken functionality found. Items to re-verify after changes: dashboard KPIs against direct SQL (item 11). |

## 4. Data and model limitations (unchanged, govern what can be built)

- All 18,000 historical records and all model training data are synthetic (`SYNTHETIC_ABT_CPD`).
- NLP classifier trained on templated text: real wording scores low (uncertainty warnings stay).
- Datasets `02`-`05`, `07`-`09` not supplied: no CAPA owner/dates/actions, no batch master, no shipment data, no KPI denominators, no official field definitions.
- **CAPA closure dates are not available.** Closure state is known only through the recorded effectiveness label ("Pending - CAPA not closed" vs Effective/Ineffective) and the open-CAPA watchlist. Recurrence timing is the recorded `capa_follow_up_days` (reference point defined in the unsupplied data guide `09`).
- **No HACCP plan.** Only complaint-level HACCP fields (`haccp_control_id`, `haccp_process_step`, `haccp_monitoring_id`, `potential_haccp_gap_flag`).
- Batch-risk model is weak (test ROC-AUC 0.55) and needs `02` for live batch features.
- Simulator inputs are observational rates from synthetic data - any output is an estimate, not a forecast or causal claim.

## 5. Highest-priority improvements

1. **Duplicate-submission protection** (data integrity - a real defect risk).
2. **Metric verification** (item 11) - every KPI must be proven against the database.
3. **Zombie CAPA detector** (item 6) - fully supported by identifier-linked data.
4. **Complainant investigation timeline** (item 3).
5. **Step-by-step form** (item 1) and **evidence summary** (item 2) - presentation of existing, working logic.
6. **Zero Complaint Path Simulator** (item 8) - supported for complaints with a recorded Confirmed/Probable root cause.
7. Recurring batches (item 7) and HACCP control-point signals (item 9) - within data limits.
8. Full-journey E2E (item 14) and UI-state pass (item 10).

## 6. Implementation order (each step tested before the next)

| Step | Items | Change |
|---|---|---|
| A | 11, 12, 13 | KPI-vs-SQL verification test; re-run NLP/root-cause and security checks |
| B | 1 | Server idempotency token + step-by-step form with progress indicator |
| C | 3 | Public investigation timeline (complainant-safe events only) |
| D | 2 | Evidence summary strip on the analysis result |
| E | 6 | Zombie CAPA detector (API + CAPA page tab + dashboard KPI) |
| F | 8 | Zero Complaint Path Simulator (API + page section, labelled estimate) |
| G | 7, 9 | Recurring batches; HACCP control-point signals with "plan not supplied" disclosure |
| H | 10, 14 | UI states review; full-journey E2E (isolated backend); screenshots; docs |

## 7. Outcome (2026-11-24)
Steps A-H implemented and tested; results in `docs/TECHNICAL_VERIFICATION_REPORT.md` section 13. One more defect was found during step F and fixed: trend windows anchored in the 2026 data gap (every product shown as Falling).
