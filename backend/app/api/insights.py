"""Dashboard, analytics, CAPA, root-cause and risk endpoints (read-only, computed from stored data)."""
from datetime import date, timedelta

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, case, desc, func, select
from sqlalchemy.orm import Session

from app.analytics import complaints as an
from app.core.deps import get_current_user
from app.database.session import get_db
from app.models import CapaWatchlistEntry, Complaint, HistoricalBatchRiskScore, HistoricalRootCauseHypothesis, ModelVersion, Prediction, Upload, User

dashboard = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
analytics = APIRouter(prefix="/api/analytics", tags=["analytics"])
capa = APIRouter(prefix="/api/capa", tags=["capa"])
root_cause = APIRouter(prefix="/api/root-cause", tags=["root-cause"])
risk = APIRouter(prefix="/api/risk", tags=["risk"])

PARETO_DIMS = {"complaint_category", "defect_subcategory", "product_name", "food_family", "customer_name", "root_cause_category", "haccp_process_step"}
CAPA_DIMS = {"root_cause_category", "complaint_category", "food_family", "root_cause_status", "product_name"}


def _filters(date_from: date | None = None, date_to: date | None = None, product: list[str] = Query(default=[]),
             category: list[str] = Query(default=[]), severity: list[str] = Query(default=[]), food_family: list[str] = Query(default=[])):
    return dict(date_from=date_from, date_to=date_to, product=product, category=category, severity=severity, food_family=food_family)


def _df(db, f):
    return an.apply_filters(an.frame(db), **f)


# ---------------------------------------------------------------- dashboard
@dashboard.get("")
def overview(f: dict = Depends(_filters), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    df = _df(db, f)
    pending_reviews = db.scalar(select(func.count(Prediction.id)).where(Prediction.review_status == "pending")) or 0
    since = date.today() - timedelta(days=30)
    # complaints RECEIVED in the last 30 days (not rows inserted: the historical import was loaded recently)
    new_30d = db.scalar(select(func.count(Complaint.id)).where(Complaint.complaint_received_date >= since)) or 0
    public_total = db.scalar(select(func.count(Complaint.id)).where(Complaint.source == "public")) or 0
    analysis_open = db.scalar(select(func.count(Complaint.id)).where(Complaint.analysis_status.in_(["pending", "partial", "failed"]))) or 0
    # AI food-safety escalations: complaints whose most recent food-safety rule output escalated
    fs = db.execute(select(Prediction.complaint_pk, Prediction.output_payload, Prediction.created_at).join(ModelVersion, Prediction.model_version_id == ModelVersion.id)
                    .where(ModelVersion.model_key == "food-safety-flag", Prediction.status == "completed", Prediction.complaint_pk.is_not(None))
                    .order_by(Prediction.created_at)).all()
    latest = {pk: (out or {}).get("escalate_for_food_safety_review", False) for pk, out, _ in fs}
    last_upload = db.scalar(select(Upload).where(Upload.status == "imported").order_by(desc(Upload.created_at)).limit(1))
    oldest_open = df[df.complaint_status.isin(an.OPEN_STATUSES)].sort_values("complaint_received_date").head(8)
    capa_df = an.capa_list(df)
    _, zsum = an.zombie_capas(df, _open_capas(db))
    recent_ineffective = capa_df[(capa_df.eff == "Ineffective")].sort_values("last_recurrence", ascending=False).head(5) if len(capa_df) else capa_df
    return {
        "kpis": {**an.kpis(df), "pending_reviews": pending_reviews, "new_last_30_days": new_30d, "public_submissions": public_total,
                 "analysis_incomplete": analysis_open, "ai_food_safety_escalations": sum(1 for v in latest.values() if v),
                 "ai_food_safety_assessed": len(latest), "zombie_capas": zsum["zombies"], "closed_capas": zsum["closed_capas"]},
        "monthly": an.monthly(df),
        "severity_by_year": an.yearly_severity(df),
        "top_products": an.top(df, "product_name", 8),
        "category_pareto": an.pareto(df, "complaint_category"),
        "attention": {
            "oldest_open": [{"complaint_id": r.complaint_id, "product_name": r.product_name, "status": r.complaint_status,
                             "severity": r.complaint_severity, "received": r.complaint_received_date.date().isoformat()} for r in oldest_open.itertuples()],
            "pending_reviews": pending_reviews,
            "ineffective_capas": [{"capa_id": r.capa_id, "product_name": r.product_name, "recurrences": int(r.recurrences),
                                   "last_recurrence": r.last_recurrence.date().isoformat() if pd.notna(r.last_recurrence) else None}
                                  for r in recent_ineffective.itertuples()],
        },
        "data_status": {"last_import": {"reference": last_upload.reference, "file": last_upload.original_filename,
                                        "at": last_upload.created_at.isoformat(), "rows": last_upload.rows_inserted} if last_upload else None,
                        "records": int(len(an.frame(db))), "filtered_records": int(len(df))},
    }


# ---------------------------------------------------------------- analytics
@analytics.get("/pareto")
def pareto(dimension: str = "complaint_category", weighted: bool = False, f: dict = Depends(_filters),
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if dimension not in PARETO_DIMS:
        raise HTTPException(422, f"dimension must be one of {sorted(PARETO_DIMS)}")
    return {"dimension": dimension, "weighted": weighted, **an.pareto(_df(db, f), dimension, weighted)}


@analytics.get("/trends")
def trends(f: dict = Depends(_filters), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    df = _df(db, f)
    top_cats = df.complaint_category.value_counts().head(6).index.tolist()
    years = df.assign(year=df.complaint_received_date.dt.year)
    by_year_cat = years[years.complaint_category.isin(top_cats)].pivot_table(index="year", columns="complaint_category", values="id", aggfunc="count", fill_value=0)
    dow = df.complaint_received_date.dt.day_name().value_counts().reindex(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], fill_value=0)
    moy = df.complaint_received_date.dt.month.value_counts().reindex(range(1, 13), fill_value=0)
    closure = (df.complaint_closed_date - df.complaint_received_date).dt.days.dropna()
    return {"monthly": an.monthly(df), "top_categories": top_cats,
            "yearly_by_category": [{"year": int(i), **{k: int(v) for k, v in r.items()}} for i, r in by_year_cat.iterrows()],
            "day_of_week": [{"label": k, "count": int(v)} for k, v in dow.items()],
            "month_of_year": [{"label": int(k), "count": int(v)} for k, v in moy.items()],
            "closure_days": {"n": int(len(closure)), "median": float(closure.median()) if len(closure) else None,
                             "p90": float(closure.quantile(0.9)) if len(closure) else None,
                             "histogram": [{"bucket": f"{int(b.left)}-{int(b.right)}", "count": int(c)} for b, c in
                                           pd.cut(closure, bins=[-1, 7, 14, 21, 30, 45, 60, 90, 10000]).value_counts(sort=False).items()] if len(closure) else []},
            "product_comparison": an.top(df, "product_name", 12), "category_distribution": an.top(df, "complaint_category", 20)}


@analytics.get("/recurrence")
def recurrence(f: dict = Depends(_filters), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    df = _df(db, f)
    yearly = df.assign(year=df.complaint_received_date.dt.year).groupby("year").agg(
        n=("id", "count"), post=("recurrence_after_prior_capa", lambda s: int(s.fillna(False).astype(bool).sum()))).reset_index()
    yearly["pct"] = (100 * yearly.post / yearly.n).round(2)
    return {**an.recurrence_hotspots(df), "post_capa_by_year": yearly.to_dict(orient="records")}


@analytics.get("/haccp")
def haccp(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """HACCP signals from RECORDED fields only (haccp_process_step, potential_haccp_gap_flag). A flag is a prompt for
    qualified review, never evidence that a control point failed."""
    df = an.frame(db)
    extra = db.execute(select(Complaint.haccp_process_step, Complaint.haccp_control_id, Complaint.potential_haccp_gap_flag,
                              Complaint.complaint_severity, Complaint.food_safety_related_flag).where(Complaint.haccp_process_step.is_not(None))).all()
    if not extra:
        return {"rows": [], "flagged_total": 0, "basis": "No HACCP fields recorded."}
    h = pd.DataFrame(extra, columns=["step", "control", "gap", "sev", "fs"])
    h["gap"] = h.gap.fillna(False).astype(bool)
    h["fs"] = h.fs.fillna(False).astype(bool)
    rows = []
    for step, g in h.groupby("step"):
        rows.append({"process_step": step, "complaints": int(len(g)), "potential_gap_flags": int(g.gap.sum()),
                     "flag_rate": round(float(g.gap.mean()), 4), "critical": int((g.sev == "Critical").sum()), "food_safety_related": int(g.fs.sum()),
                     "controls": int(g.control.nunique()), "requires_review": bool(g.gap.sum() > 0)})
    rows.sort(key=lambda r: (-r["potential_gap_flags"], -r["complaints"]))
    return {"rows": rows, "flagged_total": int(h.gap.sum()), "complaints_with_haccp_step": int(len(h)), "records_total": int(len(df)),
            "controls": an.haccp_controls(df), "plan_available": False, "plan_note": an.HACCP_PLAN_NOTE,
            "basis": "Recorded potential_haccp_gap_flag from the source data. It marks a possible control gap for qualified HACCP review; it does not show that a control point failed."}


@analytics.get("/zero-complaint-path")
def zero_complaint_path(months: int = Query(12, ge=3, le=60), cause: list[str] = Query(default=[]), all_causes: bool = True,
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Zero Complaint Path Simulator - an ESTIMATE from historical cause distribution and recorded CAPA effectiveness."""
    return an.zero_complaint_path(an.frame(db), months, None if (all_causes and not cause) else cause)


@analytics.get("/products")
def products(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return an.product_monitoring(an.frame(db))


# ---------------------------------------------------------------- CAPA
@capa.get("")
def capa_list(tab: str = Query("all", pattern="^(all|pending|effective|ineffective|not_established)$"), q: str | None = None,
              sort: str = Query("first_complaint", pattern="^(first_complaint|recurrences|linked|capa_id)$"),
              order: str = Query("desc", pattern="^(asc|desc)$"), page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = an.capa_list(an.frame(db))
    wl = {w.capa_id: w for w in db.scalars(select(CapaWatchlistEntry)).all()}
    if q:
        ql = q.lower()
        c = c[c.capa_id.str.lower().str.contains(ql, regex=False) | c.product_name.fillna("").str.lower().str.contains(ql, regex=False)]
    groups = {"pending": c.eff == "Pending", "effective": c.eff == "Effective", "ineffective": c.eff == "Ineffective",
              "not_established": ~c.eff.isin(["Pending", "Effective", "Ineffective"])}
    counts = {"all": int(len(c)), **{k: int(v.sum()) for k, v in groups.items()}}
    if tab != "all":
        c = c[groups[tab]]
    c = c.sort_values(sort, ascending=order == "asc")
    total = len(c)
    page_df = c.iloc[(page - 1) * page_size: page * page_size]
    items = []
    for r in page_df.itertuples():
        w = wl.get(r.capa_id)
        items.append({"capa_id": r.capa_id, "product_name": r.product_name, "complaint_category": r.complaint_category,
                      "root_cause_category": r.root_cause_category, "root_cause_status": r.root_cause_status, "linked_complaints": int(r.linked),
                      "first_complaint": r.first_complaint.date().isoformat(), "effectiveness_label": r.status_label,
                      "effectiveness": r.eff if r.eff in ("Effective", "Ineffective", "Pending") else "Not established",
                      "label_consistent": bool(r.consistent), "recurrences_after": int(r.recurrences),
                      "capa_status": w.capa_status if w else None})
    k = an.kpis(an.frame(db))
    return {"items": items, "total": total, "tab_counts": counts,
            "kpis": {"capas_total": k["capas_total"], "capas_pending": k["capas_pending"], "capa_ineffective_rate": k["capa_ineffective_rate"],
                     "capa_assessable": k["capa_assessable"], "recurred_after_prior_capa": k["recurred_after_prior_capa"]},
            "unavailable_fields": ["owner", "capa_open_date", "capa_close_date", "corrective_action", "preventive_action", "responsible_function"],
            "unavailable_reason": "Requires 04_ABT_CPD_CAPA_History.csv (not yet supplied)."}


def _open_capas(db: Session) -> set[str]:
    return {w.capa_id for w in db.scalars(select(CapaWatchlistEntry).where(CapaWatchlistEntry.capa_status != "Closed")).all()}


ZOMBIE_RULE = ("Zombie CAPA = a CAPA recorded as closed (effectiveness label is not 'Pending - CAPA not closed' and it is not open in the "
               "supplied watchlist) with at least one later complaint whose recorded prior_capa_id is this CAPA. Links are by identifier only. "
               "Closure dates are not in the supplied data; 'days to first recurrence' is the recorded capa_follow_up_days.")


@capa.get("/zombies")
def zombies(q: str | None = None, cause: str = Query("all", pattern="^(all|same|different)$"),
            sort: str = Query("recurrences", pattern="^(recurrences|critical|days_to_first|last_recurrence|capa_id)$"),
            order: str = Query("desc", pattern="^(asc|desc)$"), page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Zombie CAPA detector: closed CAPAs followed by identifier-linked recurrences, with the earlier investigations."""
    z, summary = an.zombie_capas(an.frame(db), _open_capas(db))
    if q:
        ql = q.lower()
        z = z[z.capa_id.str.lower().str.contains(ql, regex=False) | z.product_name.fillna("").str.lower().str.contains(ql, regex=False)]
    if cause == "same":
        z = z[z.same_cause > 0]
    elif cause == "different":
        z = z[z.different_cause > 0]
    if sort != "recurrences":
        z = z.sort_values(sort, ascending=order == "asc", na_position="last")
    elif order == "asc":
        z = z.sort_values(["recurrences", "critical"], ascending=True)
    total = len(z)
    rows = z.iloc[(page - 1) * page_size: page * page_size]
    items = [{"capa_id": r.capa_id, "product_name": r.product_name, "complaint_category": r.complaint_category,
              "root_cause_category": r.root_cause_category, "root_cause_status": r.root_cause_status, "effectiveness_label": r.status_label,
              "originating_complaints": int(r.linked), "first_complaint": r.first_complaint.date().isoformat(),
              "investigations": r.investigations, "recurrences": int(r.recurrences), "critical_recurrences": int(r.critical),
              "open_recurrences": int(r.open_recurrences), "first_recurrence": r.first_recurrence.date().isoformat(),
              "last_recurrence": r.last_recurrence.date().isoformat(),
              "days_to_first_recurrence": None if pd.isna(r.days_to_first) else int(r.days_to_first),
              "same_cause": int(r.same_cause), "different_cause": int(r.different_cause), "unknown_cause": int(r.unknown_cause),
              "during_follow_up": bool(r.during_follow_up)} for r in rows.itertuples()]
    return {"items": items, "total": total, "summary": summary, "rule": ZOMBIE_RULE}


@capa.get("/effectiveness")
def capa_effectiveness(dimension: str = "root_cause_category", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if dimension not in CAPA_DIMS:
        raise HTTPException(422, f"dimension must be one of {sorted(CAPA_DIMS)}")
    return {"dimension": dimension, **an.capa_effectiveness_by(an.frame(db), dimension),
            "basis": "Recorded rule-based effectiveness label in the complaint source data; pending CAPAs excluded. 95% Wilson intervals."}


@capa.get("/{capa_id}")
def capa_detail(capa_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    origin = db.scalars(select(Complaint).where(Complaint.capa_id == capa_id).order_by(asc(Complaint.complaint_received_date))).all()
    if not origin:
        raise HTTPException(404, "CAPA not found")
    rec = db.scalars(select(Complaint).where(Complaint.prior_capa_id == capa_id).order_by(asc(Complaint.complaint_received_date))).all()
    w = db.scalar(select(CapaWatchlistEntry).where(CapaWatchlistEntry.capa_id == capa_id))
    labels = sorted({c.capa_effectiveness_status for c in origin if c.capa_effectiveness_status})
    first = origin[0]
    brief = lambda c: {"complaint_id": c.complaint_id, "received": c.complaint_received_date.isoformat(), "product_name": c.product_name,
                       "complaint_category": c.complaint_category, "severity": c.complaint_severity, "status": c.complaint_status,
                       "follow_up_days": c.capa_follow_up_days, "investigation_id": c.investigation_id,
                       "investigation_status": c.investigation_status, "root_cause_category": c.root_cause_category,
                       "root_cause_status": c.root_cause_status}
    # monthly timeline of same product+category complaints around the CAPA (identifier-linked recurrences highlighted)
    df = an.frame(db)
    same = df[(df.product_name == first.product_name) & (df.complaint_category == first.complaint_category)]
    timeline = same.groupby("month").size().reset_index(name="n").to_dict(orient="records")
    eff = labels[0].split(" ")[0] if len(labels) == 1 else ("Inconsistent" if labels else "Not established")
    return {"capa_id": capa_id, "product_name": first.product_name, "complaint_category": first.complaint_category,
            "food_family": first.food_family, "root_cause_category": first.root_cause_category, "root_cause_status": first.root_cause_status,
            "effectiveness_labels": labels, "effectiveness": eff if eff in ("Effective", "Ineffective", "Pending", "Inconsistent") else "Not established",
            "capa_status": w.capa_status if w else None, "capa_status_source": w.source_file if w else None,
            "originating_complaints": [brief(c) for c in origin], "recurrences": [brief(c) for c in rec],
            "first_complaint": first.complaint_received_date.isoformat(),
            "timeline": timeline, "timeline_scope": f"All complaints for {first.product_name} / {first.complaint_category}",
            "rule": "Recurrences are later complaints whose recorded prior_capa_id equals this CAPA (identifier-linked; same product and category verified in source data).",
            "zombie": _zombie_block(capa_id, rec, first.root_cause_category, labels, w),
            "unavailable_fields": ["owner", "open/close dates", "actions"], "unavailable_reason": "Requires 04_ABT_CPD_CAPA_History.csv."}


def _zombie_block(capa_id: str, rec: list, orig_rc: str | None, labels: list[str], w) -> dict:
    closed = not any(an.CAPA_NOT_CLOSED in (lab or "") for lab in labels) and not (w and w.capa_status != "Closed")
    recurred = [c for c in rec if c.recurrence_after_prior_capa]
    days = [c.capa_follow_up_days for c in recurred if c.capa_follow_up_days is not None]
    return {"is_zombie": bool(closed and recurred), "closed": closed, "recurrences": len(recurred),
            "days_to_first_recurrence": int(min(days)) if days else None,
            "same_cause": sum(1 for c in recurred if c.root_cause_category and c.root_cause_category == orig_rc),
            "different_cause": sum(1 for c in recurred if c.root_cause_category and orig_rc and c.root_cause_category != orig_rc),
            "rule": ZOMBIE_RULE}


# ---------------------------------------------------------------- root cause
@root_cause.get("")
def rc_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    df = an.frame(db)
    return {**an.root_cause_stats(df), "pareto": an.pareto(df[df.root_cause_status.isin(an.CONF)], "root_cause_category"),
            "associations": an.root_cause_associations(df)}


@root_cause.get("/associations")
def rc_associations(category: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"category": category, "rows": an.root_cause_associations(an.frame(db), category),
            "basis": "Historical association among Confirmed/Probable recorded root causes - NOT a confirmed cause for a new complaint."}


@root_cause.get("/hypotheses")
def rc_hypotheses(q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = select(HistoricalRootCauseHypothesis, Complaint).join(Complaint, HistoricalRootCauseHypothesis.complaint_pk == Complaint.id)
    if q:
        s = s.where(Complaint.complaint_id.ilike(f"%{q}%") | Complaint.product_name.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(s.subquery()))
    rows = db.execute(s.order_by(desc(Complaint.complaint_received_date)).offset((page - 1) * page_size).limit(page_size)).all()
    mv = db.scalar(select(ModelVersion).where(ModelVersion.model_key == "root-cause"))
    return {"items": [{"complaint_id": c.complaint_id, "product_name": c.product_name, "complaint_category": c.complaint_category,
                       "root_cause_status": c.root_cause_status, "received": c.complaint_received_date.isoformat(), "hypotheses": h.hypotheses}
                      for h, c in rows], "total": total, "source_file": "ml_predictive_analytics/outputs/predictions/root_cause_predictions_unconfirmed.csv",
            "model_version": mv.version if mv else None}


# ---------------------------------------------------------------- risk
@risk.get("/recurring-batches")
def recurring_batches(q: str | None = None, recurring_only: bool = True,
                      sort: str = Query("complaints", pattern="^(complaints|severity_weighted|critical|last|batch_id)$"),
                      order: str = Query("desc", pattern="^(asc|desc)$"), page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Batches named on more than one complaint (recorded batch_id). Batch level only where complaints carry a batch_id."""
    b, summary = an.recurring_batches(an.frame(db))
    if recurring_only:
        b = b[b.recurring_batch_flag]
    if q:
        ql = q.lower()
        b = b[b.batch_id.str.lower().str.contains(ql, regex=False) | b.product_name.fillna("").str.lower().str.contains(ql, regex=False)]
    if sort != "complaints" or order == "asc":
        b = b.sort_values(sort, ascending=order == "asc")
    total = len(b)
    rows = b.iloc[(page - 1) * page_size: page * page_size]
    return {"items": [{"batch_id": r.batch_id, "product_name": r.product_name, "complaints": int(r.complaints), "categories": int(r.categories),
                       "top_category": r.top_category, "severity_weighted": int(r.severity_weighted), "critical": int(r.critical),
                       "food_safety_related": int(r.food_safety), "first": r.first.date().isoformat(), "last": r.last.date().isoformat(),
                       "span_days": int(r.span_days)} for r in rows.itertuples()],
            "total": total, "summary": summary,
            "rule": "Recurring batch = a recorded batch_id named on 2 or more complaints for the same product (same rule as the supplied "
                    "recurrence_detection.py). Complaints without a batch_id cannot be assigned to a batch."}


@risk.get("/batches")
def batch_scores(tier: str | None = Query(None, pattern="^(High|Medium|Low)$"), q: str | None = None, split: str | None = None,
                 page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = select(HistoricalBatchRiskScore)
    if tier: s = s.where(HistoricalBatchRiskScore.risk_tier == tier)
    if split: s = s.where(HistoricalBatchRiskScore.model_split == split)
    if q: s = s.where(HistoricalBatchRiskScore.batch_id.ilike(f"%{q}%") | HistoricalBatchRiskScore.product_name.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(s.subquery()))
    rows = db.scalars(s.order_by(desc(HistoricalBatchRiskScore.risk_score)).offset((page - 1) * page_size).limit(page_size)).all()
    actual = case((HistoricalBatchRiskScore.actual_complaint_30d.is_(True), 1.0), else_=0.0)
    tiers = db.execute(select(HistoricalBatchRiskScore.risk_tier, func.count(), func.avg(actual))
                       .group_by(HistoricalBatchRiskScore.risk_tier)).all()
    return {"items": [{"batch_id": r.batch_id, "product_name": r.product_name, "production_date": r.production_date.isoformat() if r.production_date else None,
                       "model_split": r.model_split, "risk_score": r.risk_score, "risk_tier": r.risk_tier, "actual_complaint_30d": r.actual_complaint_30d,
                       "top_risk_drivers": r.top_risk_drivers, "recommended_action": r.recommended_action} for r in rows],
            "total": total, "tier_summary": [{"tier": t, "batches": int(n), "observed_complaint_rate": round(float(a), 4) if a is not None else None} for t, n, a in tiers],
            "source_file": "ml_predictive_analytics/outputs/predictions/batch_risk_predictions_oos.csv",
            "basis": "Historical model output on out-of-sample (validation + test) batches; actual 30-day outcome is the recorded result."}
