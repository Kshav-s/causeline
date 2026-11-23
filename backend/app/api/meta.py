from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.session import get_db
from app.ml.registry import registry
from app.models import Complaint, HistoricalBatchRiskScore, Notification, User

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok", "models": {k: m.status for k, m in registry.models.items()}}


@router.get("/meta/capabilities")
def capabilities(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What the frontend may show. Modules without supporting data/models are hidden or marked partial."""
    n = db.scalar(select(func.count(Complaint.id))) or 0
    syn = db.scalar(select(func.count(Complaint.id)).where(Complaint.is_synthetic.is_(True))) or 0
    rc_recorded = db.scalar(select(func.count(Complaint.id)).where(Complaint.root_cause_category.is_not(None))) or 0
    capa = db.scalar(select(func.count(func.distinct(Complaint.capa_id)))) or 0
    batch_hist = db.scalar(select(func.count(HistoricalBatchRiskScore.id))) or 0
    m = {k: v.status for k, v in registry.models.items()}
    ai_ready = registry.usable("nlp-category")
    unread = db.scalar(select(func.count(Notification.id)).where(
        or_(Notification.user_id == user.id, Notification.audience_role == user.role))) or 0
    return {
        "role": user.role,
        "data": {"complaints": n, "synthetic_complaints": syn, "demo_data": n > 0 and syn == n,
                 "complaints_with_root_cause": rc_recorded, "capas": capa, "historical_batch_scores": batch_hist},
        "models": m,
        "modules": {
            "overview": True, "complaints": True,
            "ai_analysis": ai_ready,
            "root_cause": rc_recorded > 0 or registry.usable("root-cause"),
            "capa": capa > 0,
            "risk": True,
            "risk_level": "batch" if registry.usable("batch-risk") else "product",
            "analytics": n > 0, "reports": n > 0, "data_management": True,
            "admin": user.role == "admin",
        },
        "missing_datasets": ["02_ABT_CPD_Batch_Risk_Training_40000.csv", "03_ABT_CPD_Investigations.csv", "04_ABT_CPD_CAPA_History.csv",
                             "05_ABT_CPD_Shipment_Operations.csv", "07_ABT_CPD_Product_Customer_Supplier_Master.csv",
                             "08_ABT_CPD_Monthly_KPI_History_2007_2025.csv", "09_ABT_CPD_Data_Guide_and_Validation.csv"],
        "notifications_total": unread,
    }
