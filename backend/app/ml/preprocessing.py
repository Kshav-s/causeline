"""Training-time preprocessing, copied VERBATIM from the supplied ML packages.

Do not edit these functions. tests/test_ml_preprocessing_parity.py asserts identical output
against the original source modules; changing anything here would make inference inconsistent
with how the shipped artifacts were trained.

Sources:
  clean_text        <- AI_COMPLAINT_INTELLIGENCE/.../src/preprocess.py::clean_text
  root_cause_text   <- ml_predictive_analytics/src/root_cause.py::_text
  build_features    <- ml_predictive_analytics/src/preprocessing.py::build_features (+ NUM, CAT, DERIVED)
"""
import re

import numpy as np
import pandas as pd

PREPROCESSING_VERSIONS = {
    "nlp": "nlp-handover/src/preprocess.py@2026-11-23",
    "root_cause": "ml_predictive_analytics/src/root_cause.py::_text@2026-11-23",
    "batch": "ml_predictive_analytics/src/preprocessing.py::build_features@2026-11-23",
}

# ---------------------------------------------------------------- NLP (verbatim)
_WS = re.compile(r"\s+")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")


def clean_text(s: str) -> str:
    if not isinstance(s, str):
        return ""
    s = s.lower()
    s = _NON_ALNUM.sub(" ", s)
    s = _WS.sub(" ", s).strip()
    return s


def nlp_input_text(summary: str | None, description: str | None) -> str:
    """Mirror of preprocess.combine_text: join non-empty summary + description with one space."""
    parts = [v.strip() for v in (summary, description) if isinstance(v, str) and v.strip()]
    return " ".join(parts)


# ---------------------------------------------------------------- root cause (verbatim)
def root_cause_text(df: pd.DataFrame) -> pd.Series:
    return (df.complaint_summary.fillna("") + " " + df.complaint_description.fillna("") + " " + df.defect_subcategory.fillna("")).str.lower()


# ---------------------------------------------------------------- batch risk (verbatim)
NUM = ["incoming_material_quality_score", "process_deviation_count", "final_inspection_pass_rate_pct",
       "remaining_shelf_life_days_at_dispatch", "shelf_life_days", "storage_hours_before_dispatch",
       "prior_product_complaints_90d", "prior_food_family_complaints_90d", "prior_customer_complaints_90d",
       "production_quantity_tonnes", "target_storage_temp_min_c", "target_storage_temp_max_c"]
CAT = ["food_family", "product_category", "storage_profile", "plant_id", "production_line",
       "microbiological_test_status", "packaging_integrity_status", "weight_check_status",
       "vehicle_pre_cool_check", "destination_customer_segment", "destination_region",
       "production_shift", "batch_release_precheck"]
DERIVED = ["shelf_life_used_pct", "dispatch_lag_days", "prod_month", "storage_temp_range_c"]


def build_features(df):
    X = df[NUM + CAT].copy()
    X["shelf_life_used_pct"] = 100 * (1 - df["remaining_shelf_life_days_at_dispatch"] / df["shelf_life_days"].replace(0, np.nan))
    X["dispatch_lag_days"] = (df["dispatch_date"] - df["production_date"]).dt.days
    X["prod_month"] = df["production_date"].dt.month
    X["storage_temp_range_c"] = df["target_storage_temp_max_c"] - df["target_storage_temp_min_c"]
    return X
