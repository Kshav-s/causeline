# ML & Predictive Analytics Module (ABT-CPD)
Run: `pip install -r requirements.txt && python main.py` (CSV files in `data/` or `CPD_DATA_DIR`; falls back to `/mnt/project`). Tests: `pytest tests`.
**All source data is synthetic** (`data_origin = SYNTHETIC_ABT_CPD`); results are demonstrations, not real quality findings.

| Module | Output |
|---|---|
| `eda.py` | `outputs/reports/eda_summary.json`, `eda_*.html` |
| `pareto_analysis.py` | 14 Pareto CSVs/HTML (count and severity-weighted) |
| `recurrence_detection.py` | recurring product x defect hotspots (>=3 in 90d, emerging flag), recurring batches, post-CAPA recurrence |
| `risk_prediction.py` | LR / HistGB / XGBoost on 30-day customer-complaint target; best by validation PR-AUC -> `models/batch_risk_model.joblib`; `predict()` scores new batches |
| `model_evaluation.py` | ROC-AUC, PR-AUC, P/R/F1, confusion matrix, Brier, bootstrap CI, tier lift, `model_evaluation.png` |
| `explainability.py` | permutation importance; per-batch what-if top drivers |
| `capa_analysis.py` | ineffective rate by dimension with Wilson CI, trend, open-CAPA watchlist |
| `root_cause.py` | historical cause associations + TF-IDF classifier; **predicted** causes (unconfirmed) |
| `recommendations.py` | `recommendations.md` + per-batch actions in `predictions/` |

## Design decisions
- **Temporal split** from the dataset (`train` 2007-2021, `validation` 2021-23, `test` 2023-25); only matured, eligible rows used.
- **Leakage controls:** shipment temperature/transit fields, `batch_hold_flag`, shipment status, IDs and target fields excluded (see `LEAKAGE_EXCLUDED`). Thresholds and Low/Medium/High cut-offs (validation 70th/90th percentile) set on validation only.
- **Imbalance (~8% positives):** class weights (LR, XGBoost) + validation-tuned threshold + rank-based tiers.
- Root-cause predictions are labelled hypotheses; CAPA effectiveness is a rule-based label in the source data.

## Actual results (see `outputs/reports/results.json`)
- Batch risk (test, n=4,541, prevalence 8.1%): best model logistic regression, ROC-AUC 0.554 (95% CI 0.519-0.586), PR-AUC 0.107. **Predictive signal is weak**; High tier = 11% of batches with 1.5x lift (16.6% of complaints). Univariate checks and train-only target encodings of product/customer/supplier showed no extra signal, so no tuning was done to inflate scores. Use tiers for prioritising checks only.
- Root cause (confirmed/probable labels, random 80/20): top-1 0.40, top-3 0.87 vs 0.30 category baseline.
- CAPA: 53% of 2,334 assessable CAPAs ineffective; design-time predictor CV ROC-AUC 0.66.

## Limitations
Synthetic data; random split for root-cause model; uncalibrated LR probabilities (use ranks/tiers); pending CAPAs excluded from effectiveness stats.
