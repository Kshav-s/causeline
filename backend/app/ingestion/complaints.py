"""Complaint ingestion: read CSV/XLSX, suggest column mapping, validate rows, import.

Used by both the initial seed and the Data Management upload wizard, so the same rules apply
everywhere. Invalid rows are never silently accepted; unmapped source columns are preserved in
Complaint.extra; the uploaded file itself is never modified.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Complaint

SEVERITIES = ["Routine", "Major", "Critical"]
STATUSES = ["Open", "Under investigation", "Awaiting customer information", "Closed"]
RC_STATUSES = ["Confirmed", "Probable", "Hypothesis", "Unknown", "Not assessed"]
ID_RE = re.compile(r"^[A-Za-z0-9._\-/]{1,40}$")

# field -> (type, required, label, aliases)
FIELDS: dict[str, tuple[str, bool, str, list[str]]] = {
    "complaint_id": ("id", False, "Complaint ID", ["id", "complaint_no", "complaint_number", "reference"]),
    "complaint_received_date": ("date", True, "Received date", ["received_date", "date_received", "complaint_date", "date"]),
    "event_date": ("date", False, "Event date", []),
    "complaint_channel": ("str", False, "Channel", ["channel", "source_channel"]),
    "customer_id": ("str", False, "Customer ID", []),
    "customer_name": ("str", False, "Customer name", ["customer"]),
    "customer_segment": ("str", False, "Customer segment", ["segment"]),
    "customer_region": ("str", False, "Customer region", ["region"]),
    "product_id": ("str", False, "Product ID", ["sku", "product_code"]),
    "product_name": ("str", True, "Product name", ["product"]),
    "food_family": ("str", False, "Food family", ["family"]),
    "product_category": ("str", False, "Product category", []),
    "batch_id": ("str", False, "Batch ID", ["batch", "lot", "lot_number", "batch_number"]),
    "shipment_id": ("str", False, "Shipment ID", ["shipment"]),
    "dispatch_date": ("date", False, "Dispatch date", []),
    "complaint_summary": ("str", False, "Summary", ["summary", "title", "subject"]),
    "complaint_description": ("text", True, "Description", ["description", "details", "complaint_text", "text"]),
    "complaint_category": ("str", False, "Category (recorded)", ["category"]),
    "defect_subcategory": ("str", False, "Defect subcategory (recorded)", ["subcategory"]),
    "reported_units_affected": ("int", False, "Units affected", ["units_affected", "quantity"]),
    "complaint_severity": ("enum:severity", False, "Severity", ["severity"]),
    "severity_score": ("int", False, "Severity score", []),
    "food_safety_related_flag": ("bool", False, "Food-safety related", []),
    "health_impact_reported": ("bool", False, "Health impact reported", []),
    "investigation_id": ("str", False, "Investigation ID", []),
    "investigation_status": ("str", False, "Investigation status", []),
    "root_cause_category": ("str", False, "Root cause (recorded)", ["root_cause"]),
    "root_cause_status": ("enum:rc_status", False, "Root cause status", []),
    "root_cause_confidence": ("float", False, "Root cause confidence", []),
    "root_cause_evidence": ("str", False, "Root cause evidence", []),
    "capa_id": ("str", False, "CAPA ID", ["capa"]),
    "prior_capa_id": ("str", False, "Prior CAPA ID", []),
    "recurrence_after_prior_capa": ("bool", False, "Recurrence after prior CAPA", []),
    "capa_follow_up_days": ("float", False, "CAPA follow-up days", []),
    "capa_effectiveness_status": ("str", False, "CAPA effectiveness (recorded)", []),
    "haccp_control_id": ("str", False, "HACCP control ID", []),
    "haccp_process_step": ("str", False, "HACCP process step", []),
    "potential_haccp_gap_flag": ("bool", False, "Potential HACCP gap", []),
    "complaint_status": ("enum:status", False, "Status", ["status"]),
    "complaint_closed_date": ("date", False, "Closed date", ["closed_date"]),
    "owner": ("str", False, "Owner", ["assigned_to"]),
}
ENUMS = {"severity": SEVERITIES, "status": STATUSES, "rc_status": RC_STATUSES}
STR_LIMITS = {"complaint_summary": 300, "product_name": 200, "customer_name": 200, "defect_subcategory": 200,
              "root_cause_category": 120, "capa_effectiveness_status": 80}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(s).strip().lower()).strip("_")


def read_table(path: Path, sheet: str | None = None) -> pd.DataFrame:
    ext = path.suffix.lower()
    if ext == ".csv":
        df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    elif ext in (".xlsx", ".xlsm"):
        df = pd.read_excel(path, sheet_name=sheet or 0, dtype=str, keep_default_na=False, engine="openpyxl")
    else:
        raise ValueError(f"Unsupported file type {ext}")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def list_sheets(path: Path) -> list[dict]:
    if path.suffix.lower() == ".csv":
        df = read_table(path)
        return [{"name": None, "rows": len(df), "columns": len(df.columns)}]
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True)
    out = [{"name": ws.title, "rows": max((ws.max_row or 1) - 1, 0), "columns": ws.max_column or 0} for ws in wb.worksheets]
    wb.close()
    return out


def suggest_mapping(columns: list[str]) -> dict[str, dict]:
    """source column -> {target, score}. Exact/alias matches score 1.0; fuzzy >= 0.8 suggested."""
    used, out = set(), {}
    for col in columns:
        n = _norm(col)
        best, score = None, 0.0
        for f, (_, _, _, aliases) in FIELDS.items():
            if f in used:
                continue
            if n == f or n in aliases:
                best, score = f, 1.0
                break
            r = SequenceMatcher(None, n, f).ratio()
            if r > score:
                best, score = f, r
        if best and score >= 0.8:
            out[col] = {"target": best, "score": round(score, 2)}
            used.add(best)
        else:
            out[col] = {"target": None, "score": round(score, 2)}
    return out


def _parse(value: str, ftype: str):
    v = (value or "").strip()
    if v == "" or v.lower() in ("nan", "null", "none", "n/a"):
        return None
    if ftype in ("str", "text", "id"):
        return v
    if ftype == "date":
        d = pd.to_datetime(v, errors="coerce", dayfirst=False)
        if pd.isna(d):
            raise ValueError(f"'{v}' is not a valid date")
        return d.date()
    if ftype == "int":
        f = float(v)
        if not f.is_integer():
            raise ValueError(f"'{v}' is not a whole number")
        return int(f)
    if ftype == "float":
        return float(v)
    if ftype == "bool":
        lv = v.lower()
        if lv in ("1", "true", "yes", "y", "1.0"):
            return True
        if lv in ("0", "false", "no", "n", "0.0"):
            return False
        raise ValueError(f"'{v}' is not yes/no")
    if ftype.startswith("enum:"):
        allowed = ENUMS[ftype[5:]]
        m = {a.lower(): a for a in allowed}
        if v.lower() not in m:
            raise ValueError(f"'{v}' must be one of: {', '.join(allowed)}")
        return m[v.lower()]
    raise ValueError("unknown type")


@dataclass
class ValidationResult:
    records: list[dict] = field(default_factory=list)  # valid, ready to import (row_number included)
    errors: list[dict] = field(default_factory=list)  # {row, field, message}
    warnings: list[dict] = field(default_factory=list)
    duplicates_in_file: list[dict] = field(default_factory=list)
    duplicates_existing: list[dict] = field(default_factory=list)
    rows_total: int = 0

    def summary(self, preview_rows: int = 0) -> dict:
        err_rows = {e["row"] for e in self.errors}
        return {"rows_total": self.rows_total, "rows_valid": len(self.records), "rows_with_errors": len(err_rows),
                "duplicates_in_file": len(self.duplicates_in_file), "duplicates_existing": len(self.duplicates_existing),
                "errors": self.errors[:500], "errors_truncated": len(self.errors) > 500, "warnings": self.warnings[:200],
                "duplicate_examples": (self.duplicates_in_file + self.duplicates_existing)[:50]}


def validate(df: pd.DataFrame, mapping: dict[str, str | None], db: Session, today: date | None = None) -> ValidationResult:
    """mapping: source column -> target field (or None to keep in `extra`)."""
    today = today or date.today()
    res = ValidationResult(rows_total=len(df))
    targets = {t: c for c, t in mapping.items() if t}
    if len(targets) != len([t for t in mapping.values() if t]):
        res.errors.append({"row": 0, "field": "mapping", "message": "Two source columns are mapped to the same target field."})
        return res
    for f, (_, req, label, _) in FIELDS.items():
        if req and f not in targets:
            res.errors.append({"row": 0, "field": f, "message": f"Required field '{label}' is not mapped."})
    if res.errors:
        return res
    unmapped = [c for c, t in mapping.items() if not t]
    existing = set()
    if "complaint_id" in targets:
        ids = [x.strip() for x in df[targets["complaint_id"]].tolist() if x and x.strip()]
        for chunk in range(0, len(ids), 900):
            existing |= set(db.scalars(select(Complaint.complaint_id).where(Complaint.complaint_id.in_(ids[chunk:chunk + 900]))))
    seen: dict[str, int] = {}
    for i, row in enumerate(df.to_dict(orient="records"), start=2):  # row 1 = header
        rec, row_errs = {"source_row_number": i}, []
        for f, col in targets.items():
            ftype = FIELDS[f][0]
            try:
                val = _parse(row.get(col, ""), ftype)
            except (ValueError, TypeError) as e:
                row_errs.append({"row": i, "field": f, "message": str(e)})
                continue
            if val is not None and f in STR_LIMITS and len(val) > STR_LIMITS[f]:
                row_errs.append({"row": i, "field": f, "message": f"Longer than {STR_LIMITS[f]} characters"})
            rec[f] = val
        for f, (_, req, label, _) in FIELDS.items():
            if req and rec.get(f) in (None, "") and not any(e["field"] == f for e in row_errs):
                row_errs.append({"row": i, "field": f, "message": f"{label} is required"})
        cid = rec.get("complaint_id")
        if cid and not ID_RE.match(cid):
            row_errs.append({"row": i, "field": "complaint_id", "message": "Only letters, digits and . _ - / allowed (max 40)"})
        d = rec.get("complaint_received_date")
        if isinstance(d, date):
            if d > today:
                row_errs.append({"row": i, "field": "complaint_received_date", "message": "Received date is in the future"})
            cd = rec.get("complaint_closed_date")
            if isinstance(cd, date) and cd < d:
                row_errs.append({"row": i, "field": "complaint_closed_date", "message": "Closed date is before received date"})
            ed = rec.get("event_date")
            if isinstance(ed, date) and ed > d:
                res.warnings.append({"row": i, "field": "event_date", "message": "Event date is after received date"})
        desc = rec.get("complaint_description")
        if desc is not None and len(desc.strip()) < 5:
            row_errs.append({"row": i, "field": "complaint_description", "message": "Description must be at least 5 characters"})
        if row_errs:
            res.errors.extend(row_errs)
            continue
        if cid:
            if cid in existing:
                res.duplicates_existing.append({"row": i, "complaint_id": cid, "message": "Already in database - will be skipped"})
                continue
            if cid in seen:
                res.duplicates_in_file.append({"row": i, "complaint_id": cid, "message": f"Duplicate of row {seen[cid]} - will be skipped"})
                continue
            seen[cid] = i
        rec["complaint_status"] = rec.get("complaint_status") or "Open"
        if unmapped:
            rec["extra"] = {c: row.get(c) for c in unmapped if row.get(c) not in (None, "")}
        res.records.append(rec)
    return res


def next_manual_id(db: Session, year: int) -> str:
    prefix = f"CL-{year}-"
    last = db.scalar(select(Complaint.complaint_id).where(Complaint.complaint_id.like(f"{prefix}%")).order_by(Complaint.complaint_id.desc()).limit(1))
    n = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{n:06d}"


def import_records(db: Session, records: list[dict], upload_id: int | None, user_id: int | None,
                   synthetic: bool = False, data_origin: str | None = None) -> int:
    counters: dict[int, int] = {}
    objs = []
    for r in records:
        r = dict(r)
        if not r.get("complaint_id"):
            y = r["complaint_received_date"].year
            if y not in counters:
                last = next_manual_id(db, y)
                counters[y] = int(last.rsplit("-", 1)[1])
            r["complaint_id"] = f"CL-{y}-{counters[y]:06d}"
            counters[y] += 1
        extra = r.get("extra") or {}
        is_syn = synthetic or str(extra.get("synthetic_record_flag", "")).strip() == "1" or extra.get("data_origin", "").startswith("SYNTHETIC")
        objs.append(Complaint(**r, source="import", upload_id=upload_id, created_by_id=user_id,
                              is_synthetic=is_syn, data_origin=extra.get("data_origin") or data_origin,
                              category_source="recorded" if r.get("complaint_category") else None))
    db.add_all(objs)
    db.flush()
    return len(objs)
