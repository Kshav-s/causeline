"""Data loading + reusable feature engineering (leakage-controlled)."""
import os
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
SEED = 42
FILES = {
    "complaints": "01_ABT_CPD_Complaints_18000.csv",
    "batches": "02_ABT_CPD_Batch_Risk_Training_40000.csv",
    "investigations": "03_ABT_CPD_Investigations.csv",
    "capa": "04_ABT_CPD_CAPA_History.csv",
    "shipments": "05_ABT_CPD_Shipment_Operations.csv",
    "master": "07_ABT_CPD_Product_Customer_Supplier_Master.csv",
    "kpi": "08_ABT_CPD_Monthly_KPI_History_2007_2025.csv",
    "guide": "09_ABT_CPD_Data_Guide_and_Validation.csv",
}
OUT = ROOT / "outputs"
for _d in ("reports", "visualizations", "predictions"):
    (OUT / _d).mkdir(parents=True, exist_ok=True)
(ROOT / "models").mkdir(exist_ok=True)


def find_data_dir():
    for c in (os.environ.get("CPD_DATA_DIR"), ROOT / "data", "/mnt/project"):
        if c and (Path(c) / FILES["complaints"]).exists():
            return Path(c)
    raise FileNotFoundError("Place the CSV files in ml_predictive_analytics/data/ or set CPD_DATA_DIR.")


def load(name):
    df = pd.read_csv(find_data_dir() / FILES[name], encoding="utf-8-sig", low_memory=False)
    for c in df.columns:
        if c.endswith("_date") or c == "kpi_month":
            df[c] = pd.to_datetime(df[c], errors="coerce")
    return df


# ---------------- batch-risk features ----------------
TARGET = "target_customer_complaint_within_30d"
NUM = ["incoming_material_quality_score", "process_deviation_count", "final_inspection_pass_rate_pct",
       "remaining_shelf_life_days_at_dispatch", "shelf_life_days", "storage_hours_before_dispatch",
       "prior_product_complaints_90d", "prior_food_family_complaints_90d", "prior_customer_complaints_90d",
       "production_quantity_tonnes", "target_storage_temp_min_c", "target_storage_temp_max_c"]
CAT = ["food_family", "product_category", "storage_profile", "plant_id", "production_line",
       "microbiological_test_status", "packaging_integrity_status", "weight_check_status",
       "vehicle_pre_cool_check", "destination_customer_segment", "destination_region",
       "production_shift", "batch_release_precheck"]
DERIVED = ["shelf_life_used_pct", "dispatch_lag_days", "prod_month", "storage_temp_range_c"]
# Excluded to avoid leakage: the target, split, and anything only known after dispatch / decided from risk.
LEAKAGE_EXCLUDED = [TARGET, "target_eligible_flag", "target_outcome_window_days", "target_window_matured_flag",
                    "model_split", "shipment_mean_temp_c", "shipment_max_temp_c", "temperature_excursion_minutes",
                    "temperature_excursion_flag", "transit_hours", "shipment_status", "batch_hold_flag",
                    "shipment_id", "batch_id", "dispatch_tonnes"]


def build_features(df):
    X = df[NUM + CAT].copy()
    X["shelf_life_used_pct"] = 100 * (1 - df["remaining_shelf_life_days_at_dispatch"] / df["shelf_life_days"].replace(0, np.nan))
    X["dispatch_lag_days"] = (df["dispatch_date"] - df["production_date"]).dt.days
    X["prod_month"] = df["production_date"].dt.month
    X["storage_temp_range_c"] = df["target_storage_temp_max_c"] - df["target_storage_temp_min_c"]
    return X


def feature_lists():
    return NUM + DERIVED, CAT


def make_preprocessor():
    num, cat = feature_lists()
    return ColumnTransformer([
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), num),
        ("cat", Pipeline([("imp", SimpleImputer(strategy="constant", fill_value="Missing")),
                          ("oh", OneHotEncoder(handle_unknown="ignore", min_frequency=20, sparse_output=False))]), cat),
    ])


def batch_dataset(batches):
    """Eligible (matured, labelled) rows only -> X, y, split, meta."""
    el = batches[(batches["target_eligible_flag"] == 1) & batches[TARGET].notna()].reset_index(drop=True)
    X = build_features(el)
    assert not set(X.columns) & set(LEAKAGE_EXCLUDED), "leakage column in features"
    meta = el[["batch_id", "product_id", "product_name", "production_date", "model_split"]]
    return X, el[TARGET].astype(int), el["model_split"], meta


def severity_weight(s):
    return s.map({"Routine": 1, "Major": 3, "Critical": 5}).fillna(1)
