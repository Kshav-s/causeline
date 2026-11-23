# Validation Report — what was actually executed

This file exists so nothing in this handover has to be taken on trust. It
states plainly which checks were run, in what environment, and which could
**not** be run.

Packaged: 2026-11-23.

---

## 1. Validation environment — and how it differs from the target

The packaging and validation ran in a **Linux container**, not on the Windows
development machine and not on Render. The difference matters, so here it is
explicitly:

| | Validation container | Your dev environment (`D:\HACKATHON\.venv312`) |
|---|---|---|
| OS | Linux x86-64 | Windows (win_amd64) |
| Python | 3.13 | 3.12 |
| scikit-learn | **1.9.1** | **1.9.1** |
| numpy | 2.5.3 | 2.5.5 |
| pandas | 3.0.5 | 3.1.1 |
| joblib | 1.6.0 | 1.6.0 |
| scipy | 1.18.1 | 1.18.1 |
| fastapi | **not installable** | 0.165.0 |
| uvicorn | 0.54.0 | 0.54.0 |
| pydantic | 2.13.5 | 2.14.4 |
| sentence-transformers | **not installable** | 6.3.0 |
| torch | **not installable** | 2.15.0 |
| transformers | **not installable** | 5.24.0 |

The container had **no package-install network access**, so `fastapi`, `torch`,
`transformers` and `sentence-transformers` could not be added. The versions in
the right-hand column were read directly from the `dist-info` folders of your
own working virtual environment, and they are what `requirements.txt` pins.

**The decisive match is `scikit-learn==1.9.1` on both sides** — the version
stamped inside `models/tfidf_logreg.joblib`. All four `.joblib` classifier and
encoder artifacts loaded with **no `InconsistentVersionWarning`**, which is the
only compatibility check that actually governs whether the shipped models
deserialize correctly.

---

## 2. What was executed, and how

Because `fastapi` could not be installed, the endpoint functions in
`src/api.py` were executed through a **minimal stand-in for the `FastAPI`
class and `HTTPException`**, and then served over a standard-library HTTP
server that reproduces FastAPI's status mapping (`HTTPException` → its code,
pydantic `ValidationError` → `422`).

What this means:

* **Real:** every line of `src/api.py`, `src/preprocess.py`,
  `src/analytics.py`, `src/data_loader.py` and `src/config.py`; the real
  pydantic schemas; the real `models/` artifacts; the real 18000-row CSV; real
  HTTP request/response round-trips.
* **Not real:** the uvicorn/Starlette ASGI layer. Route registration,
  dependency injection and uvicorn's own behaviour were **not** exercised.
* **Not shipped:** the stand-in. It was a packaging-time harness only, and
  nothing in this package depends on it. `src/` is byte-for-byte your original
  code — no file in `src/` was modified.

**You should still run `scripts/test_deployment_api.py` against a real uvicorn
process once on Windows and once on Render.** It needs nothing but Python.

---

## 3. Results

`scripts/test_deployment_api.py` executed against the real endpoint functions
over HTTP:

```
SUMMARY: 162 PASS   0 FAIL   2 SKIP   (164 checks)
exit code 0
```

The two `SKIP`s are both `/similar`-related and are the **documented**
degradation, not failures:

* `POST /similar` → `HTTP 503` with the message
  `"sentence-transformers is not installed in this environment..."`
* `POST /analyze` → `HTTP 200` with `similar: []` and `similar_error` set,
  while `classification` and `food_safety_flag` returned in full.

Per-endpoint outcome:

| Endpoint | Executed | Outcome |
|---|---|---|
| `GET /health` | yes | 200. All three artifact flags `true`; `embeddings_shape == [18000, 384]`. |
| `GET /categories` | yes | 200. 10 `complaint_category` labels, 74 `defect_subcategory` labels. |
| `POST /classify` | yes | 200 on all five test complaints. Full nested structure and types verified field by field. |
| `POST /similar` | **no — SBERT query encoding** | 503 degradation path verified. Retrieval math verified separately (§5). |
| `POST /analyze` | yes | 200. Five top-level keys present; `classification` nested unchanged; `food_safety_flag` identical to the nested copy; degradation path verified. |
| `GET /pareto` | yes | 200. 10 rows, descending by count, `cum_pct` closes at 99.99999999999999, `is_vital_few` boolean. |
| `GET /trends` | yes | 200. `monthly` 2257 rows, `recurring` 74 rows, `emerging` 22 rows. |
| Invalid input | yes | whitespace → 400; `""` → 422; malformed body → 422; `top_k: 99` → 422; unknown pareto column → 400. |

The complete run log is in `reports/test_run_full.log`.

### Endpoint and field preservation

No endpoint was renamed, no response field was renamed, added or removed, and
no type was changed. All seven endpoints are present at their original paths
with their original methods. `/analyze` returns `classification`, `similar`,
`similar_error`, `food_safety_flag` and `disclaimer`, and the nested
`classification` object is the unmodified `/classify` payload. This was
asserted explicitly, key by key, in the test run.

---

## 4. An honest finding about classifier confidence

This is not a defect introduced by packaging, but you and your team lead should
both know it before the demo.

`reports/` records accuracy = 1.0000 and macro-F1 = 1.0000 on both targets. The
original `README.md` already explains why: `complaint_summary` in the synthetic
data is a template sentence that deterministically identifies its
`defect_subcategory`, so the model memorises a one-to-one mapping.

On **hand-written free-form prose**, which is what a chatbot will actually
send, the measured top-1 confidences were:

| Test complaint | `top_category` | Confidence |
|---|---|---|
| "Packet seal was broken and leaking when the carton was opened" | Packaging issue | **0.7409** |
| "Hard plastic fragment found inside sealed yoghurt cup" | Physical defect / foreign matter | **0.5598** |
| "Milk had a sour smell and strange taste before the expiry date" | Sensory characteristic | **0.2495** |
| "Found a piece of sharp metal inside a sealed bread packet" | Physical defect / foreign matter | **0.2397** |
| "My child vomited... glass pieces... went to hospital" | Weight / quantity issue *(incorrect)* | **0.1485** |

The top label is correct in four of five cases, but the probability mass is
spread widely — the TF-IDF vocabulary comes from templated text, so ordinary
phrasing matches weakly.

Two practical consequences for the chatbot:

1. **Show `category_predictions` as a ranked shortlist**, not a single asserted
   label, and show the confidence. The second and third candidates are often
   informative.
2. **`food_safety_flag` is the reliable signal.** It is keyword-driven, so it
   worked correctly on all five cases — including the one where the classifier
   was wrong. Escalation does not depend on classification being right, which
   is exactly the property you want in a food-safety path.

---

## 5. Model artifacts — verified individually

| File | Size | Verified |
|---|---|---|
| `models/tfidf_logreg.joblib` | 956,908 B | Loads. `Pipeline(TfidfVectorizer(max_features=50000, ngram_range=(1,2), min_df=2, max_df=0.95, sublinear_tf=True) → LogisticRegression(C=4.0, class_weight='balanced', max_iter=2000))`. `predict_proba` executed. |
| `models/label_encoder.joblib` | 747 B | Loads. 10 classes. |
| `models/tfidf_logreg_subcat.joblib` | 5,093,228 B | Loads. `predict_proba` executed. |
| `models/label_encoder_subcat.joblib` | 4,708 B | Loads. 74 classes. |
| `models/complaint_embeddings.npy` | 27,648,128 B | Loads. Shape `(18000, 384)`, dtype `float32`, mean L2 norm `1.0000` (already unit-normalised). |
| `models/complaint_embeddings_index.joblib` | 7,737,414 B | Loads. `pandas.DataFrame`, 18000 rows × 7 columns, aligned 1:1 with the embedding rows. |
| `data/01_ABT_CPD_Complaints_18000.csv` | 21,401,940 B | Loads via `src/data_loader.py`; date column parses; `/pareto` and `/trends` computed from it. |

**Embedding-index metadata columns** (what `/similar` returns, besides
`similarity`):
`complaint_id`, `complaint_received_date`, `complaint_category`,
`defect_subcategory`, `product_name`, `complaint_summary`,
`complaint_description`.

**Retrieval sanity check** — cosine search over the real index, using row 0's
cached vector as the query (no SBERT needed):

```
self-similarity            1.0000
rank 2  sim 0.9293   ABT-CMP-2023-016662   Physical defect / foreign matter
rank 3  sim 0.8993   ABT-CMP-2014-009822   Physical defect / foreign matter
rank 4  sim 0.8896   ABT-CMP-2019-002777   Physical defect / foreign matter
rank 5  sim 0.8832   (same category)
```

Row 0's own subcategory is "A small transparent plastic fragment was
identified"; three of its four nearest neighbours share it, and all four share
its category. The index, its row alignment and the ranking are sound.

---

## 6. What was NOT done

* **`/similar` was never called with live query text.** It needs
  `sentence-transformers` + `torch` to encode the query, and those could not
  be installed. The retrieval half was verified (§5); the encode half was not.
  **Test this first on your own machine** — it is the one endpoint whose
  happy path this report cannot vouch for.
* **No clean Python 3.12 virtual environment was built from the handover
  folder.** `pip install -r requirements.txt` requires package-registry
  access, which the packaging environment did not have. The pinned versions
  come from your own working venv, so the install should reproduce it, but the
  install itself is unverified.
* **Uvicorn was never started against this package** (no `fastapi` available).
  The `src.api:app` import path is correct by inspection — `app = FastAPI(...)`
  at module level in `src/api.py` — but it was not executed through uvicorn.
* **The SBERT weight download was not exercised**, so first-call latency and
  the cache path behaviour described in `DEPLOYMENT_README.md` §B.4 are from
  the library's documented behaviour, not measured here.
* **Memory with torch loaded was not measured.** The 292 MB baseline in
  `DEPLOYMENT_README.md` §E.1 *was* measured; the torch increment there is
  labelled an estimate.
* **No model was retrained and no artifact was regenerated.** `src/train.py`
  and `src/semantic.py` were never run. The artifacts are the originals.
* **No application source file was modified.** The eight files in `src/` are
  byte-identical to `D:\HACKATHON\src\`.

---

## 7. Deliberate packaging decisions

| Decision | Why |
|---|---|
| **`data/01_ABT_CPD_Complaints_18000.csv` (21 MB) is included** | It is not a training-only dataset. `/pareto` and `/trends` call `load_complaints()` on every request, so omitting it would break two of the seven endpoints. |
| **The other eight CSVs in `data/` are excluded** | Nothing in `src/` references them. `src/config.py` names only `PRIMARY_CSV`. Excluding them saves ~90 MB. |
| **`module02/` is excluded** | It is an earlier, superseded copy of the same service: no subcategory model, no `exclude_complaint_id`, and it loads a different artifact set (`tfidf_vectorizer.joblib`, `logreg_classifier.joblib`, `label_classes.joblib`). It also exposes two extra endpoints (`/defects/recurring`, `/defects/emerging`) not in your preserved list. Shipping both would invite the team lead to deploy the wrong one. |
| **`models/tfidf_vectorizer.joblib`, `logreg_classifier.joblib`, `label_classes.joblib` are excluded** | Used only by `module02/`, never by `src/`. |
| **`requirements.txt` is pinned with `==`, not `>=`** | The original used `scikit-learn>=1.3`, which would let pip install a newer scikit-learn and break deserialization of the shipped models. |
| **A lite requirements file is provided** | The full torch install does not fit in 512 MB of RAM, and `src/api.py` already degrades gracefully without it. |
| **`reports/` keeps only metrics and the test log** | The PNG charts and `monthly_trends.csv` are regenerable and are not read at runtime. |
| **`.venv/`, `.venv312/`, `__pycache__/`, `.git/` excluded** | Per the packaging rules; they are environment-specific and would not work on Linux anyway. |

No credentials, API keys, tokens or personal information are present in this
package. The service reads no environment variables and requires no secrets.
