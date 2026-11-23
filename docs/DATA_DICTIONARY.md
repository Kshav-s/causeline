# CauseLine - Data Dictionary

Generated from `01_ABT_CPD_Complaints_18000.csv` (18,000 rows x 53 columns) on 2026-11-23 by profiling the file directly.
`CauseLine field` shows where each column is stored (`complaints.<field>`); columns without one are preserved verbatim in `complaints.extra` (JSON).

| # | Column | Type | Missing % | Distinct | Example / values | CauseLine field |
|---|---|---|---|---|---|---|
| 1 | `complaint_id` | str | 0.0 | 18,000 | ABT-CMP-2007-014934 | `complaint_id` |
| 2 | `company_name` | str | 0.0 | 1 | ABT-CPD | extra |
| 3 | `data_origin` | str | 0.0 | 1 | SYNTHETIC_ABT_CPD | extra |
| 4 | `record_scope` | str | 0.0 | 1 | Synthetic demonstration-company complaint; not a verified ABT-CPD historical record | extra |
| 5 | `complaint_received_date` | str | 0.0 | 6,357 | 2007-01-08 | `complaint_received_date` |
| 6 | `event_date` | str | 0.0 | 6,305 | 2007-01-02 | `event_date` |
| 7 | `complaint_year` | int64 | 0.0 | 19 | 2007 | extra |
| 8 | `complaint_month` | int64 | 0.0 | 12 | 1 | extra |
| 9 | `complaint_quarter` | str | 0.0 | 4 | Q4, Q2, Q3, Q1 | extra |
| 10 | `complaint_channel` | str | 0.0 | 5 | Email, Customer portal, Sales representative, Phone, Retailer EDI | `complaint_channel` |
| 11 | `customer_id` | str | 0.0 | 180 | ABT-CUST-0112 | `customer_id` |
| 12 | `customer_name` | str | 0.0 | 180 | Retail chain Account 112 | `customer_name` |
| 13 | `customer_segment` | str | 0.0 | 6 | Wholesale distributor, Foodservice distributor, Retail chain, Online grocery, Institutiona | `customer_segment` |
| 14 | `customer_region` | str | 0.0 | 7 | Tamil Nadu, Karnataka, Maharashtra, Andhra Pradesh, Telangana, Other India | `customer_region` |
| 15 | `product_id` | str | 0.0 | 49 | ABT-PROD-0037 | `product_id` |
| 16 | `product_name` | str | 0.0 | 49 | Mixed curry spice blend | `product_name` |
| 17 | `food_family` | str | 0.0 | 10 | Packaged foods | `food_family` |
| 18 | `product_category` | str | 0.0 | 35 | Spice mix | `product_category` |
| 19 | `batch_id` | str | 24.4 | 11,100 | ABT-BAT-2007-020410 | `batch_id` |
| 20 | `shipment_id` | str | 24.4 | 10,191 | ABT-SHP-2007-009724 | `shipment_id` |
| 21 | `dispatch_date` | str | 24.4 | 5,333 | 2007-01-10 | `dispatch_date` |
| 22 | `days_from_dispatch_to_event` | float64 | 24.4 | 119 | 5.0 | extra |
| 23 | `complaint_summary` | str | 0.0 | 30 | Possible extraneous material in pack | `complaint_summary` |
| 24 | `complaint_description` | str | 0.0 | 17,928 | The customer service team logged a report from Retail chain Account 112 about Mixed curry  | `complaint_description` |
| 25 | `complaint_category` | str | 0.0 | 10 | Physical defect / foreign matter | `complaint_category` |
| 26 | `defect_subcategory` | str | 0.0 | 74 | A small transparent plastic fragment was identified | `defect_subcategory` |
| 27 | `reported_units_affected` | int64 | 0.0 | 24 | 5 | `reported_units_affected` |
| 28 | `complaint_severity` | str | 0.0 | 3 | Routine, Major, Critical | `complaint_severity` |
| 29 | `severity_score` | int64 | 0.0 | 10 | 2 | `severity_score` |
| 30 | `food_safety_related_flag` | int64 | 0.0 | 2 | 0, 1 | `food_safety_related_flag` |
| 31 | `health_impact_reported` | int64 | 0.0 | 2 | 0, 1 | `health_impact_reported` |
| 32 | `investigation_id` | str | 35.7 | 5,824 | ABT-INV-000001 | `investigation_id` |
| 33 | `investigation_status` | str | 0.0 | 4 | Completed, Not started, In progress, Awaiting evidence | `investigation_status` |
| 34 | `root_cause_category` | str | 43.5 | 36 | Heat-seal parameter drift | `root_cause_category` |
| 35 | `root_cause_status` | str | 0.0 | 5 | Not assessed, Probable, Confirmed, Hypothesis, Unknown | `root_cause_status` |
| 36 | `root_cause_confidence` | float64 | 43.5 | 69 | 0.35 | `root_cause_confidence` |
| 37 | `root_cause_evidence` | str | 35.7 | 6 | Batch process log and quality inspection, Supplier lot record and incoming inspection, Ret | `root_cause_evidence` |
| 38 | `capa_id` | str | 60.4 | 3,299 | ABT-CAPA-000001 | `capa_id` |
| 39 | `prior_capa_id` | str | 88.4 | 1,255 | ABT-CAPA-000016 | `prior_capa_id` |
| 40 | `recurrence_after_prior_capa` | int64 | 0.0 | 2 | 0, 1 | `recurrence_after_prior_capa` |
| 41 | `capa_follow_up_days` | float64 | 88.4 | 180 | 23.0 | `capa_follow_up_days` |
| 42 | `capa_effectiveness_status` | str | 0.0 | 6 | Not applicable, Ineffective - similar complaint recurred, Pending - CAPA not closed, Effec | `capa_effectiveness_status` |
| 43 | `haccp_control_id` | str | 0.0 | 56 | ABT-HACCP-042 | `haccp_control_id` |
| 44 | `haccp_process_step` | str | 0.0 | 32 | Metal detection / screening | `haccp_process_step` |
| 45 | `haccp_monitoring_id` | str | 24.4 | 11,762 | ABT-MON-0033101 | extra |
| 46 | `potential_haccp_gap_flag` | int64 | 0.0 | 2 | 0, 1 | `potential_haccp_gap_flag` |
| 47 | `complaint_status` | str | 0.0 | 4 | Closed, Under investigation, Open, Awaiting customer information | `complaint_status` |
| 48 | `complaint_closed_date` | str | 17.9 | 6,051 | 2007-02-07 | `complaint_closed_date` |
| 49 | `days_to_complaint_closure` | float64 | 17.9 | 54 | 30.0 | extra |
| 50 | `source_basis` | str | 0.0 | 1 | Public datasets informed schema, taxonomy and plausibility only; no public event is repres | extra |
| 51 | `synthetic_record_flag` | int64 | 0.0 | 1 | 1 | extra |
| 52 | `batch_reference_available` | int64 | 0.0 | 2 | 1, 0 | extra |
| 53 | `shipment_reference_available` | int64 | 0.0 | 2 | 1, 0 | extra |

## Identifier formats

| Identifier | Format | Notes |
|---|---|---|
| complaint_id | `ABT-CMP-YYYY-NNNNNN` | Unique (18,000 distinct). Manual entries in CauseLine use `CL-YYYY-NNNNNN`. |
| product_id | `ABT-PROD-NNNN` | 49 products, 1:1 with product_name. |
| customer_id | `ABT-CUST-NNNN` | 180 customers, 1:1 with customer_name. |
| batch_id | `ABT-BAT-YYYY-NNNNNN` | Present on 75.6% of complaints; links to the (unsupplied) batch table. |
| capa_id / prior_capa_id | `ABT-CAPA-NNNNNN` | 3,299 CAPAs; every prior_capa_id exists as a capa_id (verified). |
| investigation_id | `ABT-INV-NNNNNN` | Present on 64.3%; links to the (unsupplied) investigations table. |
