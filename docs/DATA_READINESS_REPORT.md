# Data Readiness Report

| Analysis | Supported now? | Evidence / gap |
|---|---|---|
| Complaint analysis (volumes, trends, severity, Pareto) | **Yes** | 18,000 clean records |
| Product analysis | **Yes** (product level) | `product_id` 1:1 with name, 49 products |
| Batch analysis | **Partial** | `batch_id` on 75.6% of complaints (recurring batches computable); batch attributes need `02` |
| Root-cause analysis | **Yes** for recorded causes; hypotheses via reproduced model | 10,179 complaints with a recorded cause (7,217 Confirmed/Probable) |
| CAPA effectiveness | **Partial** | 3,299 CAPAs and identifier-linked recurrences; owner/dates/actions/maturity need `04`. Ineffective rate here 54.4% (n=2,357) vs 53.0% (n=2,334) in the supplied report, which used `04`'s maturity flag |
| Production analysis | **No** | needs `02` |
| Shipment / cold-chain | **No** | needs `05` (shipment IDs present but no attributes) |
| Monthly KPI (complaints per 1000 t, repeat rate) | **No** | needs `08`; volume denominators are not in the complaint file |
| Predictive: complaint classification | **Yes, with caveats** | Templated training text (see quality report) |
| Predictive: batch 30-day risk | **Model yes, data no** | Model loads and scores form input; historical scores shipped; batch table missing |

**Confirmed relationships (by identifier):** complaint→CAPA (`capa_id`), later complaint→earlier CAPA (`prior_capa_id`, 100% resolve), complaint→product, complaint→customer, complaint→batch (where supplied).
**Possible but unverified:** complaint→investigation record, complaint→shipment record (IDs exist, target tables not supplied). No relationship is created that the identifiers do not support.
