# Data Inventory (2026-11-23)

| File | Location | Rows × cols | Status | Used for |
|---|---|---|---|---|
| `01_ABT_CPD_Complaints_18000.csv` | `AI_COMPLAINT_INTELLIGENCE/HACKATHON_MEMBER2_NLP_HANDOVER/data/` | 18,000 × 53 | **Supplied, imported** (`IMP-SEED1`, 0 rejected rows) | Complaint register, analytics, CAPA derivation, root-cause stats |
| `batch_risk_predictions_oos.csv` | `ml_predictive_analytics (1)/.../outputs/predictions/` | 9,288 × 11 | Supplied (model output) | `historical_batch_risk_scores` |
| `root_cause_predictions_unconfirmed.csv` | same | 10,783 × 11 | Supplied (model output) | `historical_root_cause_hypotheses` |
| `open_capas_watchlist.csv` | same | 965 × 7 | Supplied (derived from unsupplied CAPA table) | `capa_watchlist` (CAPA status for open CAPAs) |
| `outputs/reports/*.csv, *.json` | same | various | Supplied | Reference only - CauseLine recomputes analytics from stored records |
| `02_ABT_CPD_Batch_Risk_Training_40000.csv` | - | - | **Not supplied** | Batch master / production records |
| `03_ABT_CPD_Investigations.csv` | - | - | **Not supplied** | Investigation details, root-cause association table |
| `04_ABT_CPD_CAPA_History.csv` | - | - | **Not supplied** | CAPA owner, dates, actions, follow-up maturity |
| `05_ABT_CPD_Shipment_Operations.csv` | - | - | **Not supplied** | Shipment / cold-chain |
| `07_ABT_CPD_Product_Customer_Supplier_Master.csv` | - | - | **Not supplied** | Master data |
| `08_ABT_CPD_Monthly_KPI_History_2007_2025.csv` | - | - | **Not supplied** | Complaints per 1000 t, repeat-rate KPI |
| `09_ABT_CPD_Data_Guide_and_Validation.csv` | - | - | **Not supplied** | Official field definitions |

Raw files are never modified. Layers: **raw** = supplied files in place / immutable upload copies in `backend/storage/uploads` (read-only, named by SHA-256); **cleaned** = validated rows in `complaints` (unmapped columns kept in `extra`); **processed** = analytics computed on request and persisted predictions.
