"""Report data endpoints. The frontend renders these as print-ready pages (PDF via the browser's print dialog)
and offers CSV export; every report is stamped with snapshot time, filters and provenance."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.analytics import complaints as an
from app.core.audit import audit
from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.models import User

router = APIRouter(prefix="/api/reports", tags=["reports"])
TEMPLATES = {
    "complaint-summary": "Complaint summary",
    "pareto": "Pareto report",
    "capa-status": "CAPA status report",
    "product-quality": "Product quality report",
}


@router.get("/templates")
def templates(user: User = Depends(get_current_user)):
    return {"templates": [{"id": k, "name": v} for k, v in TEMPLATES.items()]}


@router.get("/{template}")
def build(template: str, request: Request, date_from: date | None = None, date_to: date | None = None,
          product: list[str] = Query(default=[]), category: list[str] = Query(default=[]),
          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if template not in TEMPLATES:
        raise HTTPException(404, "Unknown report template")
    df = an.apply_filters(an.frame(db), date_from=date_from, date_to=date_to, product=product, category=category)
    meta = {"template": template, "title": TEMPLATES[template], "generated_at": datetime.now(timezone.utc).isoformat(),
            "generated_by": user.full_name, "filters": {"date_from": date_from, "date_to": date_to, "product": product, "category": category},
            "records_in_scope": int(len(df)), "synthetic_share": round(float(df.is_synthetic.mean()), 4) if len(df) else None}
    if template == "complaint-summary":
        body = {"kpis": an.kpis(df), "monthly": an.monthly(df), "severity_by_year": an.yearly_severity(df),
                "top_products": an.top(df, "product_name", 10), "top_categories": an.top(df, "complaint_category", 10)}
    elif template == "pareto":
        body = {d: an.pareto(df, d, limit=15) for d in ("complaint_category", "defect_subcategory", "product_name", "root_cause_category")}
        body["severity_weighted_category"] = an.pareto(df, "complaint_category", weighted=True, limit=15)
    elif template == "capa-status":
        c = an.capa_list(df)
        body = {"kpis": an.kpis(df), "by_root_cause": an.capa_effectiveness_by(df, "root_cause_category"),
                "by_category": an.capa_effectiveness_by(df, "complaint_category"),
                "most_recurring": [{"capa_id": r.capa_id, "product_name": r.product_name, "recurrences": int(r.recurrences), "effectiveness": r.status_label}
                                   for r in c.sort_values("recurrences", ascending=False).head(15).itertuples()] if len(c) else []}
    else:
        body = {"products": an.product_monitoring(df), "recurrence": an.recurrence_hotspots(df, limit=20)}
    audit(db, "report.generate", user.id, "report", template, {"records": meta["records_in_scope"]}, client_ip(request)); db.commit()
    return {"meta": meta, "body": body}
