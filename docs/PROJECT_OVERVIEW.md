# Project Overview — CauseLine

**Purpose.** Help ABT CPD quality teams analyse historical complaints, find recurring defects, examine recorded root causes, judge whether CAPAs actually worked, and triage new complaints with the supplied NLP/ML models - without ever presenting a prediction as a fact.

## What is implemented (verified 2026-11-23)

| Module | Status | Basis |
|---|---|---|
| Authentication, roles (admin / analyst), session cookie, lockout, audit log | Done | Backend + UI, tested |
| Overview dashboard | Done | Recorded data + rule-based KPIs |
| Complaint register, detail, create, edit (with reason), CSV export | Done | 18,000 imported records + manual entries |
| AI analysis (category, subcategory, food-safety rule, similar complaints, root-cause hypotheses) + review queue | Done | Supplied models; every output persisted with model version; human confirm / correct / reject |
| Root cause intelligence | Done | Recorded causes + reproduced root-cause model + pre-computed hypotheses |
| CAPA effectiveness | Partial | CAPAs derived from complaint records; owner/dates/actions need `04_CAPA_History` |
| Product & batch risk | Partial | Product monitoring (rule), historical batch scores, live batch scoring form; batch master data needs `02_Batch...` |
| Analytics, Pareto, recurrence hotspots | Done | Rule-based, ported from the supplied analysis code |
| Reports (print-to-PDF, CSV) | Done | Stamped with filters, snapshot time, provenance |
| Data upload wizard (CSV/XLSX, mapping, validation, duplicates, history) | Done | Same validator as the seed import |
| Public site, demo booking, admin bookings, in-app notifications | Done | Booking workflow fully separate from models |
| Model registry | Done | Versions, SHA-256, schemas, status, limitations |

## Waiting on
Seven datasets (`02`–`09` except `06`) named by the ML package were not supplied. See `DATA_READINESS_REPORT.md`.
