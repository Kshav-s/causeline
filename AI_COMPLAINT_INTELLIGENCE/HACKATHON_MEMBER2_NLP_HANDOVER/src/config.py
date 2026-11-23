from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"

for d in (MODELS_DIR, REPORTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

PRIMARY_CSV = "01_ABT_CPD_Complaints_18000.csv"

TEXT_COLS = ["complaint_summary", "complaint_description"]
TARGET_PRIMARY = "complaint_category"
TARGET_SECONDARY = "defect_subcategory"
DATE_COL = "complaint_received_date"
ID_COL = "complaint_id"

# Columns that would leak the label if included as features
LEAKAGE_COLS = {
    "complaint_category",
    "defect_subcategory",
    "root_cause_category",
    "root_cause_evidence",
    "root_cause_status",
    "root_cause_confidence",
    "investigation_status",
    "capa_effectiveness_status",
    "complaint_severity",
    "severity_score",
    "food_safety_related_flag",
    "health_impact_reported",
    "potential_haccp_gap_flag",
}

TFIDF_MODEL_PATH = MODELS_DIR / "tfidf_logreg.joblib"
LABEL_ENCODER_PATH = MODELS_DIR / "label_encoder.joblib"
SUBCAT_MODEL_PATH = MODELS_DIR / "tfidf_logreg_subcat.joblib"
SUBCAT_ENCODER_PATH = MODELS_DIR / "label_encoder_subcat.joblib"
EMBEDDINGS_PATH = MODELS_DIR / "complaint_embeddings.npy"
EMB_META_PATH = MODELS_DIR / "complaint_embeddings_index.joblib"

SBERT_MODEL_NAME = "all-MiniLM-L6-v2"

SYNTHETIC_DISCLAIMER = (
    "NOTE: This system was trained on synthetic demonstration data. "
    "Results must not be presented as verified historical company insights."
)
