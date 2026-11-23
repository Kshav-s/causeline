# Quality Recommendations (auto-generated from computed results)
_All data is synthetic demonstration data. Predicted causes are hypotheses, not confirmed root causes._

## 1. Focus on the vital few
- 7 of 10 complaint categories account for ~80% of severity-weighted complaints; largest: Physical defect / foreign matter (15.3%), Packaging issue (14.3%), Product quality deviation (13.7%).
- Among assessed root causes, 24 of 36 categories cover ~80%; start CAPA design there: Process parameter drift, Packaging material integrity issue, Raw-material variability.

## 2. Recurrence
- 412 product x defect groups recur (>=3 complaints in 90 days); 133 are worsening in the last 12 months (see recurring_product_defects.csv).
- 11.56% of complaints recur after a prior CAPA -> verify effectiveness before closure.
- Top hotspots: Graded table eggs / Product quality deviation (120 complaints); Pasteurized liquid whole egg / Physical defect / foreign matter (75 complaints); Pasteurized liquid whole egg / Product quality deviation (106 complaints).

## 3. Batch risk (model: logistic_regression, test ROC-AUC 0.5539, CI [0.5194, 0.5858])
- High tier = 11.0% of batches holding 16.6% of complaints (lift 1.51x). Action: Hold for enhanced QA review before release / prioritise targeted inspection.
- Medium: Increase sampling and monitor first customer deliveries.  Low: Standard release.
- Top global drivers: process_deviation_count, vehicle_pre_cool_check, weight_check_status, remaining_shelf_life_days_at_dispatch, production_shift, incoming_material_quality_score.
  - process_deviation_count: Review logged process deviations before release; require QA sign-off when deviations exceed the norm.
  - vehicle_pre_cool_check: Enforce vehicle pre-cool verification before loading.
  - weight_check_status: Re-check weights before release.
  - remaining_shelf_life_days_at_dispatch: Prioritise short-remaining-shelf-life batches for fast dispatch or reallocation.
- **Caution:** predictive signal is weak (AUC < 0.6). Use tiers only for prioritising extra checks, not as a release/hold decision rule; the strongest univariate signal is process_deviation_count. Retrain when real batch data with stronger process variables is available.

## 4. CAPA effectiveness
- 53.0% of assessable CAPAs were followed by a similar complaint within the follow-up window (n=2334).
- Significantly worse than average by root_cause_category: Packaging material integrity issue (76%, n=95), Oxidation / storage exposure (75%, n=56), Processing time / temperature variation (72%, n=58), Inadequate sensory release check (72%, n=65)
- Significantly worse than average by responsible_function: Warehouse & Logistics (59%, n=266)
- Design-time predictor CV ROC-AUC 0.6587 (base rate 0.5296): Design-time attributes carry only modest signal (mainly root-cause category); not reliable for individual CAPAs.
- Effectiveness labels are rule-based in the source data; treat as indicative.

## 5. Root-cause support
- Text+category model top-1 0.4003, top-3 0.874 vs category baseline 0.3026. Use predictions for 10783 unconfirmed complaints only to prioritise investigation; confirm with evidence (5-Why / fishbone).

## Limitations
- Synthetic data; temporal split; probabilities not calibrated for decision cost; no causal claims.