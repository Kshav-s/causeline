# Data Quality Report — `01_ABT_CPD_Complaints_18000.csv`

Profiled directly with pandas on 2026-11-23. Full column list: `DATA_DICTIONARY.md`.

| Check | Result |
|---|---|
| Duplicate rows / duplicate `complaint_id` | 0 / 0 |
| Encoding | Valid UTF-8 (em dashes in `capa_effectiveness_status` render as "�" only in the Windows console) |
| Date parsing (received, event, dispatch, closed) | 0 unparsable values |
| Received-date range | 2007-01-08 → 2025-12-31 (517–1,174 complaints per year) |
| Closed-date range | 2007-01-31 → 2026-02-23 |
| Received before event / closed before received | 0 / 0 |
| `complaint_status = Closed` without closed date (and the reverse) | 0 / 0 |
| Severity vs `severity_score` | Consistent (Routine 1–3, Major 4–7, Critical 8–10) |
| `batch_reference_available` vs `batch_id` present | Consistent |
| CAPA present without investigation | 0 |
| `prior_capa_id` that does not exist as a `capa_id` | 0 (100% resolve) |
| Recurrence flag ⇔ `prior_capa_id` present | Exact (2,081 rows) |
| Recurrence later than CAPA complaint / same product / same category | 100% / 100% / 100% |
| Effectiveness label consistent across complaints of one CAPA | 98.8% (inconsistent ones flagged with * in the UI) |
| Rows passing CauseLine import validation | 18,000 / 18,000 |

## Missing values (top)
`capa_follow_up_days` 88.4%, `prior_capa_id` 88.4%, `capa_id` 60.4%, `root_cause_category` / `root_cause_confidence` 43.4%, `investigation_id` / `root_cause_evidence` 35.7%, `batch_id` / `shipment_id` / `dispatch_date` / `haccp_monitoring_id` 24.4%, `complaint_closed_date` 17.9%. These are structural (no CAPA raised, no batch supplied by customer, not yet closed), not errors.

## Issues that matter for modelling
1. **Templated text.** `complaint_summary` has only 30 distinct values and every `complaint_description` contains its `defect_subcategory` phrase verbatim (verified on row 0 and by the 1.00 classifier accuracy). Text models therefore learn templates, not language.
2. **Constant columns:** `company_name`, `data_origin`, `record_scope`, `source_basis`, `synthetic_record_flag` (kept in `extra` for provenance).
3. **Synthetic origin** on every row.
