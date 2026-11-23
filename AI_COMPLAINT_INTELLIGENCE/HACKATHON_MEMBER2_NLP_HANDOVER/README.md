# Module 02 — AI Complaint Intelligence (FastAPI service)

End-to-end prototype for classifying food-quality complaints, retrieving
semantically similar past complaints, and generating Pareto / trend /
recurring / emerging-defect analytics, exposed over a FastAPI service.

> **Data disclosure:** All complaint records are synthetic demonstration
> data. Results must NOT be presented as verified historical company
> insights. The food-safety escalation flag is a keyword+category
> heuristic, **not** a safety determination — human review is required.

## Layout

```
D:\HACKATHON\
├── data\                             # extracted CSVs (01_ABT_CPD_Complaints_18000.csv + 8 others)
├── models\
│   ├── tfidf_logreg.joblib           # primary classifier (complaint_category)
│   ├── label_encoder.joblib
│   ├── tfidf_logreg_subcat.joblib    # secondary classifier (defect_subcategory)
│   ├── label_encoder_subcat.joblib
│   ├── complaint_embeddings.npy      # 18000 × 384, L2-normalised, all-MiniLM-L6-v2
│   └── complaint_embeddings_index.joblib  # pandas DataFrame with aligned row metadata
├── reports\                          # metrics, confusion matrix, Pareto/trend CSVs & PNG
├── requirements.txt
└── src\
    ├── config.py         # paths, column names, leakage list, SBERT model name
    ├── data_loader.py    # loads 01_ABT_CPD_Complaints_18000.csv, parses complaint_received_date
    ├── preprocess.py     # text cleaning + combines complaint_summary + complaint_description
    ├── train.py          # TF-IDF + LogReg (DO NOT RERUN — artifacts already saved)
    ├── semantic.py       # SBERT index build + search (uses cached embeddings)
    ├── analytics.py      # Pareto, monthly trends, recurring + emerging defects
    └── api.py            # FastAPI service (loads artifacts; never retrains)
```

## Startup — PowerShell commands

```powershell
cd D:\HACKATHON
```

```powershell
python -m venv .venv
```

```powershell
.\.venv\Scripts\Activate.ps1
```

```powershell
pip install -r requirements.txt
```

```powershell
uvicorn src.api:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs for the Swagger UI.

### Note on `sentence-transformers`

If `sentence-transformers` fails to install (e.g. on Python 3.14 where
torch wheels are not yet published), the service **still starts**:
`/health`, `/categories`, `/classify`, `/pareto`, `/trends` work in full.
`/similar` and the `similar` portion of `/analyze` return **HTTP 503**
with a clear install hint instead of crashing. To enable them, use
Python 3.11 or 3.12 and reinstall:

```powershell
pip install sentence-transformers
```

## Endpoints

| Method | Path          | Purpose                                                            |
|--------|---------------|--------------------------------------------------------------------|
| GET    | `/health`     | Liveness + which artifacts loaded + SBERT availability             |
| GET    | `/categories` | List known complaint_category and defect_subcategory labels       |
| POST   | `/classify`   | Predict complaint_category + defect_subcategory + safety flag      |
| POST   | `/similar`    | Top-k semantically similar complaints (cached MiniLM embeddings)  |
| POST   | `/analyze`    | `/classify` + `/similar` in one call                               |
| GET    | `/pareto`     | Pareto table for a categorical column                              |
| GET    | `/trends`     | Monthly counts + recurring + emerging defects                      |

### Key response fields

- `top_category`, `top_category_confidence`
- `top_subcategory`, `top_subcategory_confidence`
- `food_safety_flag.escalate_for_food_safety_review` (bool) + the
  keywords + category reason that triggered it + a disclaimer that the
  flag is **not** a safety determination.
- `similar[*].complaint_id`, `product_id` where present, `batch_id`
  where present, `similarity` (cosine).
- `exclude_complaint_id` on `/similar` and `/analyze` filters that
  complaint_id out of the returned neighbours (useful when the query
  text came from an existing record).

## Test commands — PowerShell

```powershell
curl.exe http://127.0.0.1:8000/health
```

```powershell
curl.exe http://127.0.0.1:8000/categories
```

```powershell
curl.exe -X POST http://127.0.0.1:8000/classify -H "Content-Type: application/json" -d '{\"text\":\"Found a piece of sharp metal inside a sealed bread packet\",\"top_k\":3}'
```

```powershell
curl.exe -X POST http://127.0.0.1:8000/similar -H "Content-Type: application/json" -d '{\"text\":\"Plastic fragment inside sealed pack\",\"top_k\":3}'
```

```powershell
curl.exe -X POST http://127.0.0.1:8000/analyze -H "Content-Type: application/json" -d '{\"text\":\"Sour smell from yogurt before expiry date\",\"top_k_similar\":5}'
```

```powershell
curl.exe "http://127.0.0.1:8000/pareto?column=complaint_category"
```

```powershell
curl.exe "http://127.0.0.1:8000/trends?group=complaint_category"
```

## Error handling

- Empty / whitespace-only `text` → **400** with `Empty text after cleaning`.
- Missing model artifacts → **503**.
- Missing or mis-shaped embeddings → **500**/503 with a clear message.
- SBERT unavailable → semantic endpoints return **503**; classification,
  categories, pareto, trends, health all remain fully functional.
- Pareto requested on unknown column → **400**.
- CORS: `*` for dev; tighten `allow_origins` in `src/api.py` for prod.

## Honest reading of training results

The TF-IDF + LogReg classifier reaches accuracy = 1.0000 and macro-F1 =
1.0000 on both `complaint_category` and `defect_subcategory`. That is a
**synthetic-data artifact** — `complaint_summary` is a template sentence
that deterministically identifies its `defect_subcategory`, so the model
memorises a 1-to-1 mapping. This demonstrates the pipeline works; it
does **not** demonstrate real-world generalisation. Full metrics,
per-class classification report and confusion matrix are in `reports/`.
