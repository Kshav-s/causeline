# Known Limitations

## Data
1. **All data is synthetic** (`SYNTHETIC_ABT_CPD`). No figure represents real ABT CPD performance; the UI shows a "Demo data" label everywhere.
2. **Seven datasets not supplied** (`02, 03, 04, 05, 07, 08, 09`). Consequences: no CAPA owner/dates/actions, no production or shipment analysis, no monthly KPI per tonne, no batch master records, root-cause association table recomputed from complaint records instead of investigations.
3. CAPA effectiveness uses the **recorded rule-based label** in the complaint file; the supplied report used a follow-up-maturity flag from `04`, so rates differ slightly (54.4% vs 53.0%).
4. "Days open" for open complaints is measured to today; synthetic open complaints from 2007 therefore show ~7,000 days.

## Models
5. **NLP classifiers learned templates** (100% reported accuracy is an artifact). On free-form text, confidence is low and spread; one safety-critical example was misclassified in the handover's own test. Shown as an uncalibrated shortlist with a low-confidence banner and mandatory human review.
6. **Batch-risk model is weak** (test ROC-AUC 0.55, CI 0.52–0.59; High tier lift 1.5×). Status is `degraded`; tiers are for prioritising checks only. Scores are not calibrated probabilities.
7. **Root-cause model was reproduced**, not shipped (exact match verified). It was evaluated on a random split (may overstate future performance) and needs a recorded or human-verified category.
8. **Similarity index is frozen** at the 18,000 supplied complaints; new complaints are not searchable until the index is rebuilt. Query text is encoded raw while the index used cleaned text (as in the original service).
9. **Food-safety flag is a substring heuristic** (e.g. "ill" matches "spill"); it prompts review and is not a determination.
10. Batch "factors" are a linear log-odds decomposition, not the original what-if drivers (training baselines were not shipped).

## Platform
11. SQLite by default; PostgreSQL supported by configuration but not yet exercised; no Alembic migrations yet.
12. Rate limiting is in-process (single instance). Multi-instance deployments need a shared store.
13. Staff are notified of new public complaints in-app only (no email/SMS integration).
14. PDF reports use the browser's print dialog (no server-side PDF).
15. The design-system spec reserved violet for model output only; colour validation showed no colour-blind-safe 6-hue chart palette without violet, so violet also appears as chart series 3. Model output is always identified by badge text, icon and dashed border, never colour alone.
16. Development environment contains test records created by verification runs (an E2E demo booking per run, a few `CL-2026-*` complaints, analysis runs on `ABT-CMP-2007-014934`). Re-seed a fresh database before any real use.

## Public complaint workflow (2026-11-23)
17. **Lost access keys cannot be recovered online** (only a hash is stored, by design). Staff can still see the complaint; there is no self-service recovery.
18. **Photos are stored, not analysed.** No computer-vision model exists; the UI says so. Photos are kept original (EXIF metadata, which may include location, is not stripped) to preserve evidence integrity.
19. **Root-cause suggestions for public complaints appear only after staff confirm the category.** The model was trained on recorded categories; CauseLine does not feed it the NLP classifier's guess. Food family is filled from recorded data only when the product name matches a known product exactly.
20. **The NLP classifier is often wrong on free-form public wording** (e.g. a mould complaint classified as "Labelling / allergen issue" at 0.19). Low scores are flagged "uncertain - manual classification recommended"; staff review is the safeguard.
21. **NLP service:** by default the handover's NLP models run inside the backend. `NLP_SERVICE_URL` switches to an external service using the handover's `POST /analyze` contract (validated, with in-process fallback). No external URL was supplied, so the remote path is tested with a simulated service only.
22. Rate limits and spam protection are per-process and IP-based (honeypot + limits). No CAPTCHA; a shared store is needed for multi-instance deployments.
23. Staff are still invited by an administrator; there is no self-registration for anyone.
24. CAPA owner, actions and open/close dates remain unavailable until `04_ABT_CPD_CAPA_History.csv` is supplied; staff cannot yet create CAPA records in the UI.
