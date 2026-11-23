# CauseLine — ML & NLP Model Audit

Audit date: 2026-11-23 · Auditor: Claude Code (Phase 1, CLAUDE.md §4)
Method: every source file read; every artifact deserialised in a clean venv (Python 3.14.7, scikit-learn 1.9.1, numpy 2.5.5, pandas 3.1.1, joblib 1.6.0) with **warnings promoted to errors**; dataset profiled column by column. No model was retrained.

## 1. What was supplied

| Package | Path | Purpose |
|---|---|---|
| NLP handover ("Module 02") | `AI_COMPLAINT_INTELLIGENCE/HACKATHON_MEMBER2_NLP_HANDOVER/` | Complaint text classification, similar-complaint retrieval, Pareto/trend analytics, food-safety keyword flag. Includes its own FastAPI service (`src/api.py`). |
| ML predictive analytics | `ml_predictive_analytics (1)/ml_predictive_analytics/` | Batch risk model, root-cause support, CAPA effectiveness analysis, recurrence detection, Pareto, explainability, recommendations. Batch pipeline (`main.py`), not a service. |

**All source data is synthetic** (`data_origin = SYNTHETIC_ABT_CPD`, `synthetic_record_flag = 1` on every row). Every result shown in CauseLine must carry the demo/synthetic label.

## 2. Model inventory

| ID (proposed) | Artifact | Algorithm | Trained? | Loads? | Readiness |
|---|---|---|---|---|---|
| `nlp-category` | `models/tfidf_logreg.joblib` + `label_encoder.joblib` | TF-IDF (1–2 grams, 7,988 terms) → LogisticRegression (C=4, balanced) | Yes | Yes, no version warning | **Ready** (with limitation L1) |
| `nlp-subcategory` | `models/tfidf_logreg_subcat.joblib` + `label_encoder_subcat.joblib` | TF-IDF (8,060 terms) → LogisticRegression | Yes | Yes | **Ready** (L1) |
| `nlp-similarity` | `models/complaint_embeddings.npy` (18000×384 float32, unit-norm) + `complaint_embeddings_index.joblib` (DataFrame 18000×7) + `all-MiniLM-L6-v2` (downloaded at runtime) | Sentence-Transformer embeddings, cosine search | Index pre-built | Index loads; query encoder needs `sentence-transformers` + `torch` (installable on Py 3.14, dry-run verified) | **Ready after dependency install**; live query path not yet executed by anyone (per handover VALIDATION_REPORT §6) |
| `food-safety-flag` | rules in `src/api.py` (`SAFETY_KEYWORDS`, `SAFETY_CATEGORIES`) | Keyword + category heuristic | n/a (rule) | n/a | **Ready** — rule-based, not ML |
| `batch-risk` | `models/batch_risk_model.joblib` (dict: pipeline, threshold 0.4547, tier thresholds medium 0.5119 / high 0.5821, feature list, model name) | ColumnTransformer (median-impute+scale / constant-impute+one-hot) → LogisticRegression (balanced) | Yes | Yes, no version warning | **Loadable; weak signal** (L4) |
| `root-cause` | Originally **no artifact** (trained in memory in `src/root_cause.py::run()`). **Reproduced 2026-11-23 with owner approval** → `ml_project/reproduced/root_cause_v1/root_cause_model.joblib` + `provenance.json` | TF-IDF(text) + one-hot(category, food_family) → LogisticRegression, 36 classes | Yes (v1.0.0-reproduced) | Yes | **Ready** - reproduction matched published metrics exactly (top-1 0.4003, top-3 0.874, macro-F1 0.3944) and 100% of the 10,783 published predictions (max probability difference 0.0000) |
| `capa-design-time` | none (cross-validated only, never saved) | HistGradientBoosting | Not persisted | — | **Not deployable**; CV ROC-AUC 0.66, author states "not reliable for individual CAPAs". Use the rule-based effectiveness tables only |

## 3. Input / output schemas

### 3.1 nlp-category and nlp-subcategory
- **Input:** one free-text string (complaint summary and/or description). Training text = `complaint_summary + " " + complaint_description`.
- **Preprocessing (must be preserved exactly):** `src/preprocess.py::clean_text` → lowercase, replace `[^a-z0-9\s]` with space, collapse whitespace. Empty after cleaning → reject (HTTP 400 in original).
- **Output:** `predict_proba` over 10 categories / 74 subcategories. Column *i* maps to `label_encoder.classes_[i]` (verified: `clf.classes_ == arange(n)` for both models).
- **Categories (10):** Contamination / microbiological · Infestation / pest · Labelling / allergen issue · Packaging issue · Physical defect / foreign matter · Process-related defect · Product quality deviation · Sensory characteristic · Storage / transportation issue · Weight / quantity issue.
- **Confidence:** LogisticRegression probabilities are available. **They are not calibrated on realistic text** (see L1). CauseLine shows them as a ranked shortlist with an "uncalibrated" label, never as certainty.

### 3.2 nlp-similarity
- **Input:** free text; encoded with `SentenceTransformer("all-MiniLM-L6-v2").encode(..., normalize_embeddings=True)`. Note: the original API encodes the **raw** text (not `clean_text`) at query time; the index-build script encoded cleaned text. CauseLine will keep the original API behaviour (raw text) to stay consistent with the shipped, tested service, and record this as a known inconsistency (L3).
- **Output:** top-k rows of the index with `complaint_id, complaint_received_date, complaint_category, defect_subcategory, product_name, complaint_summary, complaint_description, similarity` (cosine, 0–1). Similarity is a distance, not a probability.

### 3.3 food-safety-flag
- **Input:** raw text + top predicted category. **Output:** `escalate_for_food_safety_review` (bool), matched keywords, category hit. Substring matching (e.g. "ill" matches "fill", "spill") → expect false positives; it is an escalation prompt only.

### 3.4 batch-risk
- **Input:** one batch record with 25 raw fields → `src/preprocessing.py::build_features` derives 4 more:
  - Numeric (12): `incoming_material_quality_score, process_deviation_count, final_inspection_pass_rate_pct, remaining_shelf_life_days_at_dispatch, shelf_life_days, storage_hours_before_dispatch, prior_product_complaints_90d, prior_food_family_complaints_90d, prior_customer_complaints_90d, production_quantity_tonnes, target_storage_temp_min_c, target_storage_temp_max_c`
  - Categorical (13): `food_family, product_category, storage_profile, plant_id, production_line, microbiological_test_status, packaging_integrity_status, weight_check_status, vehicle_pre_cool_check, destination_customer_segment, destination_region, production_shift, batch_release_precheck`
  - Dates (2, for derived features): `production_date, dispatch_date`
  - Derived (4): `shelf_life_used_pct, dispatch_lag_days, prod_month, storage_temp_range_c`
- Known category levels were extracted from the fitted one-hot encoder (e.g. 4 plants, 24 lines, `batch_release_precheck` has only one level "Pending shipment assignment"). Unknown levels are ignored by the encoder (`handle_unknown="ignore"`); missing values are imputed. CauseLine will validate against the known levels and warn on unknown ones rather than silently accepting.
- **Output:** probability of ≥1 customer complaint within 30 days of dispatch + tier (Low/Medium/High via validation-set 70th/90th percentiles). Top drivers via `explainability.local_drivers` need a training baseline (medians/modes of training rows) — **training rows are not shipped**, so per-batch drivers can be computed only if baseline values are persisted (see §6).
- **Leakage controls:** shipment temperature/transit, hold flag, shipment status, IDs excluded — verified in code and in the fitted feature list.

## 4. Evaluation evidence (as reported by the authors; not re-run)

| Model | Metric | Value | Comment |
|---|---|---|---|
| nlp-category | accuracy / macro-F1 (random 80/20) | 1.000 / 1.000 | **Synthetic artifact**: `complaint_description` literally contains the subcategory phrase (verified on row 0) and `complaint_summary` has only 30 template values |
| nlp-category | top-1 confidence on 5 hand-written complaints | 0.15 – 0.74; 4/5 correct | From VALIDATION_REPORT §4 — the realistic picture |
| nlp-subcategory | accuracy / macro-F1 | 1.000 / 1.000 | Same artifact |
| batch-risk | test ROC-AUC (temporal split, n=4,541, prevalence 8.1%) | 0.554 (95% CI 0.519–0.586) | Weak signal |
| batch-risk | PR-AUC / precision / recall @ thr | 0.107 / 0.085 / 0.643 | |
| batch-risk | High tier | 11% of batches, 16.6% of complaints, lift 1.51× | Usable for prioritising checks only |
| batch-risk | Brier | 0.240 | Probabilities uncalibrated (balanced class weights) — show tier/rank, not % |
| root-cause | top-1 / top-3 (random split, 36 classes) | 0.40 / 0.87 vs 0.30 baseline | Model not persisted |

## 5. Known limitations

- **L1** NLP classifiers learned templates. On real prose, confidence is low and spread; the one safety-critical test case was misclassified. → Show top-3 shortlist, mark "uncalibrated", require human review; low-confidence banner below 0.5 top-1.
- **L2** Food-safety flag is substring-based; false positives expected; it is not a safety determination.
- **L3** Query/index preprocessing mismatch for embeddings (raw vs cleaned text). Minor for MiniLM; documented, not changed.
- **L4** Batch-risk ROC-AUC 0.55 — barely above chance. Display tier only, with explicit "weak predictive signal" warning; never as a release/hold rule.
- **L5** Root-cause classifier was never saved by its author. Resolved: re-run once from the original code (`scripts/reproduce_root_cause_model.py`, verified exact). It needs a recorded or human-verified `complaint_category` and a `food_family`; without them CauseLine returns *insufficient data* rather than chaining on an NLP guess.
- **L6** The predictive pipeline needs 7 more CSVs (`02_…Batch_Risk_Training_40000`, `03_…Investigations`, `04_…CAPA_History`, `05_…Shipment_Operations`, `07_…Master`, `08_…Monthly_KPI_History`, `09_…Data_Guide`) — **none supplied**; `ml_predictive_analytics/data/` is empty. Only its pre-computed `outputs/` are available.
- **L7** All data synthetic; no metric reflects real ABT-CPD performance.
- **L8** Original NLP API has `allow_origins=["*"]` and no auth — will not be exposed; CauseLine wraps the inference functions behind its own authenticated API.
- **L9** Stray empty folder `{data,src,outputs/...}` in the ML package (a failed shell brace expansion) — harmless, ignore.

## 6. Integration approach

1. **Do not run the supplied FastAPI service separately.** CauseLine's backend imports the model artifacts directly into an `app/ml/` service layer, loaded once at startup (singleton registry).
2. **Preprocessing reuse:** copy `clean_text` and `build_features` verbatim into `backend/app/ml/preprocessing/` with a header citing the source file and a unit test asserting byte-identical output against the original modules.
3. **Artifacts** are referenced **in place** in the two supplied folders (never copied, moved or modified); the registry records a SHA-256 per artifact and refuses to load any artifact that raises a scikit-learn version warning. (Earlier plan said 'copy to ml_project/original'; changed to avoid duplicating ~60 MB and risking divergence.)
4. **Model registry** table: id, version, file path, sha256, purpose, input schema, output schema, preprocessing version, status (Ready / Degraded / Blocked), last validated.
5. **Every prediction persisted** with id, timestamp, model id+version, input, output, user, review status.
6. **Pre-computed outputs** (batch OOS scores, root-cause hypotheses for historical complaints, recurrence hotspots, CAPA rate tables) imported as *historical model output* records with their own provenance label, never as live predictions.
7. **Batch drivers:** the original `local_drivers` needs training-set medians that were not shipped, so CauseLine shows the exact log-odds decomposition of the logistic regression instead (numeric features relative to the training mean via the fitted scaler; categorical relative to the average level). Documented on screen.
8. **Implemented in** `backend/app/ml/` (`registry.py`, `preprocessing.py`, `engines.py`, `safety.py`) and `backend/app/services/ml_service.py`. Parity with the original preprocessing is asserted by `backend/tests/test_ml_preprocessing_parity.py`.

## 7. Dependencies (verified)

- Python 3.14.7 venv: scikit-learn 1.9.1, numpy 2.5.5, pandas 3.1.1, scipy 1.18.1, joblib 1.6.0 installed and all artifacts load cleanly.
- `torch==2.15.0`, `sentence-transformers==6.3.0`, `transformers==5.24.0`, `fastapi==0.165.0`, `pydantic==2.14.4` resolve on Python 3.14 (pip dry-run).
- `xgboost` not required for inference (selected batch model is logistic regression).
- SBERT weights (`all-MiniLM-L6-v2`, ~90 MB) are downloaded once from Hugging Face; no complaint data is sent externally.
