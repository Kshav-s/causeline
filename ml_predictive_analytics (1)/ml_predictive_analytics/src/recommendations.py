"""Evidence-linked, explainable recommendations built only from computed results."""
import pandas as pd
from .preprocessing import OUT

FEATURE_ACTIONS = {
    "process_deviation_count": "Review logged process deviations before release; require QA sign-off when deviations exceed the norm.",
    "incoming_material_quality_score": "Tighten incoming-material acceptance / supplier review for low-score lots.",
    "final_inspection_pass_rate_pct": "Re-inspect or sample more heavily when final pass rate is low.",
    "remaining_shelf_life_days_at_dispatch": "Prioritise short-remaining-shelf-life batches for fast dispatch or reallocation.",
    "shelf_life_used_pct": "Prioritise short-remaining-shelf-life batches for fast dispatch or reallocation.",
    "storage_hours_before_dispatch": "Cut hold time before dispatch; verify cold-chain during storage.",
    "prior_product_complaints_90d": "Product has recent complaints: apply enhanced release checks and link to open CAPAs.",
    "prior_food_family_complaints_90d": "Food-family complaint trend: run a family-level review of controls.",
    "prior_customer_complaints_90d": "Customer has recent complaints: add delivery/condition check and proactive contact.",
    "packaging_integrity_status": "Add packaging seal/integrity re-check before dispatch.",
    "microbiological_test_status": "Confirm micro results before release.",
    "weight_check_status": "Re-check weights before release.",
    "vehicle_pre_cool_check": "Enforce vehicle pre-cool verification before loading.",
    "production_line": "Inspect the line's parameters/changeover records.",
    "plant_id": "Compare plant practices against best-performing plant.",
    "batch_release_precheck": "Escalate pre-release check findings.",
}
TIER_ACTION = {"High": "Hold for enhanced QA review before release / prioritise targeted inspection.",
               "Medium": "Increase sampling and monitor first customer deliveries.", "Low": "Standard release."}


def batch_actions(drivers):
    return drivers.top_feature_1.map(lambda f: FEATURE_ACTIONS.get(f, "Review batch records for this factor."))


def run(R):
    L = ["# Quality Recommendations (auto-generated from computed results)",
         "_All data is synthetic demonstration data. Predicted causes are hypotheses, not confirmed root causes._\n"]
    p = R["pareto"]["complaint_category_severity"]
    L.append(f"## 1. Focus on the vital few\n- {p['n_vital_few']} of {p['n_items']} complaint categories account for ~80% of severity-weighted complaints; "
             f"largest: " + ", ".join(f"{a} ({b}%)" for a, b in p["top5"][:3]) + ".")
    rc = R["pareto"]["root_cause_category_count"]
    L.append(f"- Among assessed root causes, {rc['n_vital_few']} of {rc['n_items']} categories cover ~80%; start CAPA design there: " + ", ".join(a for a, _ in rc["top5"][:3]) + ".")
    r = R["recurrence"]
    L.append(f"\n## 2. Recurrence\n- {r['recurring_groups']} product x defect groups recur (>=3 complaints in 90 days); {r['emerging_groups']} are worsening in the last 12 months (see recurring_product_defects.csv).")
    L.append(f"- {r['post_capa_recurrence_pct_overall']}% of complaints recur after a prior CAPA -> verify effectiveness before closure.")
    L.append("- Top hotspots: " + "; ".join(f"{a} / {b} ({c} complaints)" for a, b, c, _ in r["top_hotspots"][:3]) + ".")
    rp = R["risk"]; t = {x["tier"]: x for x in rp["tier_performance_test"]}
    L.append(f"\n## 3. Batch risk (model: {rp['selected_model']}, test ROC-AUC {rp['test_metrics_at_f1_threshold']['roc_auc']}, CI {rp['test_roc_auc_95ci_bootstrap']})")
    L.append(f"- High tier = {t['High']['share_pct']}% of batches holding {t['High']['share_of_all_complaints_pct']}% of complaints (lift {t['High']['lift_vs_base']}x). Action: {TIER_ACTION['High']}")
    L.append(f"- Medium: {TIER_ACTION['Medium']}  Low: {TIER_ACTION['Low']}")
    L.append("- Top global drivers: " + ", ".join(R["top_features"]) + ".")
    for f in R["top_features"][:4]:
        if f in FEATURE_ACTIONS: L.append(f"  - {f}: {FEATURE_ACTIONS[f]}")
    if rp["test_metrics_at_f1_threshold"]["roc_auc"] < 0.6:
        L.append("- **Caution:** predictive signal is weak (AUC < 0.6). Use tiers only for prioritising extra checks, not as a release/hold decision rule; "
                 "the strongest univariate signal is process_deviation_count. Retrain when real batch data with stronger process variables is available.")
    c = R["capa"]
    L.append(f"\n## 4. CAPA effectiveness\n- {c['overall_ineffective_rate']*100:.1f}% of assessable CAPAs were followed by a similar complaint within the follow-up window (n={c['assessable_matured']}).")
    for col in ("root_cause_category", "responsible_function"):
        w = [x for x in c["by_dimension"][col] if x[3]]
        L.append(f"- Significantly worse than average by {col}: " + (", ".join(f"{x[0]} ({x[2]*100:.0f}%, n={x[1]})" for x in w) if w else "none statistically distinguishable (95% CI)."))
    L.append(f"- Design-time predictor CV ROC-AUC {c['design_time_predictor_cv']['roc_auc']} (base rate {c['design_time_predictor_cv']['base_rate']}): " + c["design_time_predictor_cv"]["interpretation"])
    L.append("- Effectiveness labels are rule-based in the source data; treat as indicative.")
    q = R["root_cause"]
    L.append(f"\n## 5. Root-cause support\n- Text+category model top-1 {q['top1_accuracy']}, top-3 {q['top3_accuracy']} vs category baseline {q['baseline_top1_by_complaint_category']}. "
             f"Use predictions for {q['complaints_scored_without_confirmed_cause']} unconfirmed complaints only to prioritise investigation; confirm with evidence (5-Why / fishbone).")
    L.append("\n## Limitations\n- Synthetic data; temporal split; probabilities not calibrated for decision cost; no causal claims.")
    txt = "\n".join(L)
    (OUT / "reports" / "recommendations.md").write_text(txt)
    return txt
