# Member 2 — AI Complaint Intelligence · Deployment & Integration Guide

FastAPI NLP/ML service for food-quality complaint classification, semantic
retrieval of similar past complaints, food-safety escalation flagging, and
Pareto / trend analytics.

This package is a **handover of an already-built and already-trained
service**. Nothing here needs to be retrained. The model artifacts in
`models/` are the originals; the API contract is unchanged.

> **Data disclosure (carried through every API response as `disclaimer`):**
> all complaint records are synthetic demonstration data and must not be
> presented as verified historical company insights. The food-safety
> escalation flag is a keyword + category heuristic, **not** a food-safety
> determination — human review is required.

---

## 0. What is in this package

```
HACKATHON_MEMBER2_NLP_HANDOVER/
├── src/                                  # the service (import path: src.api:app)
│   ├── __init__.py
│   ├── api.py                            # FastAPI app — 7 endpoints, loads artifacts, never retrains
│   ├── config.py                          # all paths, column names, SBERT model name, disclaimer
│   ├── preprocess.py                      # text cleaning + summary/description combination
│   ├── semantic.py                        # SBERT index build + search helpers
│   ├── analytics.py                       # Pareto, monthly trends, recurring + emerging defects
│   ├── data_loader.py                     # loads the complaints CSV, parses the date column
│   └── train.py                           # TF-IDF + LogReg training — DO NOT RERUN
├── models/                               # pre-trained artifacts (41 MB) — see §4
├── data/
│   └── 01_ABT_CPD_Complaints_18000.csv   # 21 MB — REQUIRED at runtime by /pareto and /trends
├── reports/                              # training metrics + per-class classification reports
├── scripts/
│   ├── test_deployment_api.py            # automated endpoint test, stdlib only
│   └── smoke_semantic.py                 # offline embedding-index sanity check
├── requirements.txt                      # full inference deps (pinned)
├── requirements-inference-lite.txt       # inference without torch / sentence-transformers
├── requirements-train.txt                # training only — not needed to serve
├── render.yaml                           # ready-to-use Render blueprint
├── .python-version                       # pins 3.12.7 for Render / pyenv
├── start_windows.ps1                     # one-line launcher (PowerShell)
├── start_linux.sh                        # one-line launcher (bash)
├── .gitignore
├── API_TEST_EXAMPLES.md                  # request/response examples with measured outputs
├── VALIDATION_REPORT.md                  # exactly what was executed and what was not
├── DEPLOYMENT_README.md                  # this file
└── README.md                             # original project README (kept verbatim)
```

---

## A. Local setup on Windows

Commands are PowerShell, run one per line.

### A.1 Install Python 3.12

The reference environment is **CPython 3.12 (64-bit)**. The shipped
`models/*.joblib` artifacts were serialized by **scikit-learn 1.9.1**, and the
pinned dependency set in `requirements.txt` is the exact set that this service
is known to run on.

Either install from <https://www.python.org/downloads/release/python-3120/>
(tick *Add python.exe to PATH*), or:

```powershell
winget install --id Python.Python.3.12 --source winget
```

Verify — this must print a `3.12.x` version:

```powershell
py -3.12 --version
```

### A.2 Create a virtual environment

```powershell
cd D:\HACKATHON_MEMBER2_NLP_HANDOVER
```

```powershell
py -3.12 -m venv .venv
```

### A.3 Activate it

```powershell
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks the activation script, allow it for this session only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### A.4 Install requirements

```powershell
python -m pip install --upgrade pip
```

Full install (all 7 endpoints, downloads ~2.5 GB of torch wheels):

```powershell
pip install -r requirements.txt
```

Or the lightweight install (everything except `/similar` — see §E.4):

```powershell
pip install -r requirements-inference-lite.txt
```

### A.5 Start the FastAPI server

```powershell
uvicorn src.api:app --host 127.0.0.1 --port 8000
```

**You must run this from the package root** (the folder that contains `src\`),
because `src.api:app` is resolved from the current working directory.
Add `--reload` for development only.

### A.6 Test the API

```powershell
curl.exe http://127.0.0.1:8000/health
```

```powershell
curl.exe -X POST http://127.0.0.1:8000/classify -H "Content-Type: application/json" -d '{\"text\":\"Found a piece of sharp metal inside a sealed bread packet\",\"top_k\":3}'
```

Then run the full automated suite (needs no extra packages):

```powershell
python scripts\test_deployment_api.py
```

It prints `PASS` / `FAIL` / `SKIP` per check and exits non-zero on any failure.
It needs no running-service import and no extra packages.

An offline check of the embedding index — no server and no `sentence-transformers` needed — is also available. Note the `-m` form: this
script imports `src.config`, so it must be run as a module from the package
root, not as `python scripts\smoke_semantic.py`:

```powershell
python -m scripts.smoke_semantic
```

### A.7 Open the Swagger documentation

<http://127.0.0.1:8000/docs> — interactive Swagger UI
<http://127.0.0.1:8000/redoc> — ReDoc
<http://127.0.0.1:8000/openapi.json> — raw OpenAPI schema

---

## B. Local setup on Linux, and deployment on Render

### B.1 Linux / macOS local

```bash
cd HACKATHON_MEMBER2_NLP_HANDOVER
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn src.api:app --host 0.0.0.0 --port 8000
```

```bash
python scripts/test_deployment_api.py --base-url http://127.0.0.1:8000
```

### B.2 Render — build and start commands

| Setting | Value |
|---|---|
| Environment | Python 3 |
| Python version | `3.12.*` (set `PYTHON_VERSION=3.12.7`, or commit a `.python-version` file) |
| Root directory | the folder containing `src/` |
| Build command | `pip install -r requirements.txt` |
| **Start command** | `uvicorn src.api:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/health` |

**The start command is the one line that matters:**

```bash
uvicorn src.api:app --host 0.0.0.0 --port $PORT
```

`0.0.0.0` is required (Render cannot reach a process bound to `127.0.0.1`), and
`$PORT` is injected by Render — do not hard-code `8000`.

On a memory-constrained plan, build with
`pip install -r requirements-inference-lite.txt` instead; see §E.4.

A ready blueprint is included as `render.yaml`:

```yaml
services:
  - type: web
    name: member2-nlp-complaint-intelligence
    runtime: python
    plan: starter
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn src.api:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
    envVars:
      - key: PYTHON_VERSION
        value: 3.12.7
      - key: HF_HOME
        value: /opt/render/project/.cache/huggingface
      - key: OMP_NUM_THREADS
        value: "1"
```

### B.3 How the model files are loaded

All paths are resolved in `src/config.py`:

```python
ROOT        = Path(__file__).resolve().parents[1]   # the package root
MODELS_DIR  = ROOT / "models"
DATA_DIR    = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
```

Consequences you need to know:

1. **Paths are relative to the source tree, not to the shell's working
   directory.** As long as `models/`, `data/` and `src/` stay side by side,
   the service finds its artifacts. Do not move `src/` on its own.
2. **Loading is lazy and cached.** `models/` artifacts are read on the first
   request that needs them (`_load_primary`, `_load_subcat`,
   `_load_embeddings`, `_load_df`) and then held in the module-level `_state`
   dict for the process lifetime. The first `/classify` and the first
   `/pareto` are therefore slower than later ones; `/health` loads nothing.
3. **`config.py` creates `models/` and `reports/` at import time**
   (`d.mkdir(parents=True, exist_ok=True)`). The package root must be
   **writable** at import, or the service will not start. Render's disk is
   writable (and ephemeral), so this is fine there; a read-only container
   image is not.
4. `/pareto` and `/trends` read `data/01_ABT_CPD_Complaints_18000.csv` through
   `src/data_loader.py`. **If that CSV is absent those two endpoints fail** —
   which is why the 21 MB file is shipped in this package rather than treated
   as a training-only dataset.

### B.4 How the Sentence Transformers weights are loaded

**The SBERT model is NOT bundled in this package.** `src/config.py` sets:

```python
SBERT_MODEL_NAME = "all-MiniLM-L6-v2"
```

and `src/api.py` constructs `SentenceTransformer(SBERT_MODEL_NAME)` lazily, on
the first `/similar` (or `/analyze`) call. That is a **model id, not a path**,
so `sentence-transformers` resolves it through the Hugging Face Hub:

* on first use it downloads `sentence-transformers/all-MiniLM-L6-v2`
  (~90 MB) into the Hugging Face cache;
* the cache location is `HF_HOME` if set, otherwise `~/.cache/huggingface`
  (`%USERPROFILE%\.cache\huggingface` on Windows);
* thereafter the weights are read from that cache with no network access.

To make it available in deployment, pick one:

| Option | How |
|---|---|
| **Download at first request** (simplest) | Allow outbound HTTPS to `huggingface.co`. The first `/similar` call pays the download; set `HF_HOME` to a persistent path so a restart does not re-download. |
| **Warm the cache at build time** (recommended for Render) | Add to the build command: `python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"` — the weights land in the image/cache and the first request is fast. |
| **Fully offline / air-gapped** | Pre-populate the cache, then set `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`. Alternatively `git clone https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2` into e.g. `models/all-MiniLM-L6-v2/` and change `SBERT_MODEL_NAME` in `src/config.py` to that local path. **This is the only change to `src/` that may be needed for deployment, and it changes no endpoint or response field.** |

The cached query embedding must stay dimension-compatible with the shipped
index: `models/complaint_embeddings.npy` is `(18000, 384)` float32, L2-normalised,
produced by `all-MiniLM-L6-v2`. `src/api.py` enforces this and returns HTTP 500
with an explicit message if a different model yields a different width — so
**do not swap the SBERT model without rebuilding the embedding index.**

---

## C. Integrating with the main chatbot FastAPI backend

### C.1 Option 1 — mount it inside the main app (single process)

Viable only if the main backend's dependency set is compatible with
`requirements.txt` (notably `scikit-learn==1.9.1`, `numpy==2.5.5`,
`pandas==3.1.1`, `pydantic==2.14.4`). Copy `src/`, `models/` and `data/` into
the main project, keeping them side by side, then:

```python
# main_backend/main.py
from fastapi import FastAPI
from src.api import app as nlp_app          # the Member 2 service

app = FastAPI(title="Food Quality Chatbot")

# every NLP route becomes available under /nlp/...
app.mount("/nlp", nlp_app)
```

`POST /nlp/classify`, `GET /nlp/health`, and so on. Mounting keeps the
sub-application's own `/docs`, so paths and response fields stay identical.

If you would rather merge the routes into the main app's own schema, import the
router-level functions instead of mounting — but note `src/api.py` declares its
endpoints directly on `app`, so mounting is the no-code-change path.

**Recommendation:** if the main backend pins different versions of
scikit-learn, numpy or pandas, do **not** force them together — unpickling the
classifiers under a different scikit-learn version is the most likely cause of
a silent accuracy change or a hard load failure. Use Option 2.

### C.2 Option 2 — run it as a separate service (recommended)

Deploy this package on its own (§B.2) and have the chatbot backend call it over
HTTP. The two processes can then upgrade independently.

### C.3 Working Python integration example

`requests` is **not** in `requirements.txt` — install it in the *chatbot*
service with `pip install requests`.

```python
"""Chatbot-side client for the Member 2 AI Complaint Intelligence service."""
from __future__ import annotations

import os
import requests

NLP_BASE_URL = os.getenv("NLP_SERVICE_URL", "http://127.0.0.1:8000")
TIMEOUT = (5, 120)          # (connect, read) — first call loads models / SBERT


class NlpServiceError(RuntimeError):
    pass


def analyze_complaint(text: str, top_k_similar: int = 5,
                      exclude_complaint_id: str | None = None) -> dict:
    """POST /analyze — classification + similar complaints + safety flag."""
    payload = {"text": text, "top_k_similar": top_k_similar}
    if exclude_complaint_id:
        payload["exclude_complaint_id"] = exclude_complaint_id

    r = requests.post(f"{NLP_BASE_URL}/analyze", json=payload, timeout=TIMEOUT)

    if r.status_code == 400:
        raise NlpServiceError("Complaint text was empty after cleaning.")
    if r.status_code == 422:
        raise NlpServiceError(f"Request body rejected by schema: {r.json()}")
    if r.status_code >= 500:
        raise NlpServiceError(f"NLP service error {r.status_code}: {r.text[:200]}")
    r.raise_for_status()
    return r.json()


def format_for_chat(result: dict) -> str:
    """Turn the /analyze JSON into a chatbot reply."""
    c = result["classification"]
    lines = []

    # --- classification + confidence ---
    lines.append(
        f"Category: {c['top_category']} "
        f"({c['top_category_confidence']:.1%} confidence)"
    )
    if c.get("top_subcategory"):
        lines.append(
            f"Defect type: {c['top_subcategory']} "
            f"({c['top_subcategory_confidence']:.1%})"
        )

    # --- alternatives, useful when confidence is low ---
    alts = c.get("category_predictions") or []
    if len(alts) > 1:
        other = ", ".join(f"{a['label']} {a['probability']:.0%}" for a in alts[1:])
        lines.append(f"Other possibilities: {other}")

    # --- food-safety escalation ---
    flag = result["food_safety_flag"]
    if flag["escalate_for_food_safety_review"]:
        why = []
        if flag["reason_keywords"]:
            why.append("keywords: " + ", ".join(flag["reason_keywords"]))
        if flag["reason_category_in_safety_bucket"]:
            why.append("category is in the food-safety bucket")
        lines.append("ESCALATE FOR FOOD-SAFETY REVIEW (" + "; ".join(why) + ")")
        lines.append(flag["note"])
    else:
        lines.append("No food-safety escalation triggered.")

    # --- similar past complaints ---
    if result.get("similar"):
        lines.append("Similar past complaints:")
        for s in result["similar"]:
            lines.append(
                f"  - {s['complaint_id']} "
                f"({s['similarity']:.2f}) {s['defect_subcategory']}"
            )
    elif result.get("similar_error"):
        # documented degradation: semantic search unavailable in this deployment
        lines.append("Similar-complaint lookup is unavailable right now.")

    lines.append(result["disclaimer"])
    return "\n".join(lines)


if __name__ == "__main__":
    out = analyze_complaint(
        "Found a piece of sharp metal inside a sealed bread packet", top_k_similar=3
    )
    print(format_for_chat(out))
```

### C.4 Parsing contract the chatbot can rely on

`POST /analyze` always returns these five top-level keys:

| Key | Type | Notes |
|---|---|---|
| `classification` | object | the full `/classify` payload, nested unchanged |
| `similar` | array | `[]` when semantic search is unavailable |
| `similar_error` | string or `null` | `null` on success; the 503 detail text otherwise |
| `food_safety_flag` | object | identical object to `classification.food_safety_flag` |
| `disclaimer` | string | synthetic-data notice |

`classification` nested fields and types:

| Field | Type |
|---|---|
| `input_text` | string (the raw text as submitted, not the cleaned form) |
| `category_predictions` | array of `{label: string, probability: float}`, descending |
| `top_category` | string |
| `top_category_confidence` | float, 0–1 |
| `subcategory_predictions` | array of `{label, probability}`, or `null` |
| `top_subcategory` | string or `null` |
| `top_subcategory_confidence` | float or `null` |
| `food_safety_flag.escalate_for_food_safety_review` | bool |
| `food_safety_flag.reason_keywords` | array of strings (sorted, may be empty) |
| `food_safety_flag.reason_category_in_safety_bucket` | bool |
| `food_safety_flag.note` | string |
| `disclaimer` | string |

**`similar[*]`** carries the columns actually present in
`models/complaint_embeddings_index.joblib`, plus `similarity`:
`complaint_id`, `complaint_received_date` (ISO 8601 string),
`complaint_category`, `defect_subcategory`, `product_name`,
`complaint_summary`, `complaint_description`, `similarity` (float, cosine).

> Note: the original `README.md` mentions `product_id` and `batch_id` on
> `similar[*]`. Those columns are **not** in the shipped index — the verified
> column list is the one above. Build the chatbot against these names.

Always treat `similar_error` as a soft failure: classification is still valid.

---

## D. Environment configuration

### D.1 Paths

| What | Where | Set by |
|---|---|---|
| Package root | folder containing `src/` | `ROOT` in `src/config.py` (`parents[1]` of `config.py`) |
| Classifiers / encoders / embeddings | `<root>/models/` | `MODELS_DIR` |
| Complaints CSV | `<root>/data/01_ABT_CPD_Complaints_18000.csv` | `DATA_DIR` + `PRIMARY_CSV` |
| Metrics output | `<root>/reports/` | `REPORTS_DIR` (created at import) |

`src/config.py` has **no environment-variable overrides**; paths are derived
from the source location. To relocate the artifacts, either keep the folders
side by side or edit `config.py`.

### D.2 Environment variables

The application itself reads **no** environment variables. These are the
runtime/library variables that matter in deployment:

| Variable | Purpose | Suggested value |
|---|---|---|
| `PORT` | port Render injects; pass to uvicorn | set by the platform |
| `HF_HOME` | Hugging Face cache root for the SBERT weights | a persistent writable path |
| `SENTENCE_TRANSFORMERS_HOME` | older sentence-transformers cache var | same path as `HF_HOME` |
| `HF_HUB_OFFLINE` / `TRANSFORMERS_OFFLINE` | block hub access once the cache is warm | `1` for air-gapped runs |
| `OMP_NUM_THREADS` / `MKL_NUM_THREADS` | cap BLAS threads on small instances | `1` |
| `PYTHON_VERSION` | pin the interpreter on Render | `3.12.7` |

No credentials, API keys or secrets are required by this service, and none are
present anywhere in this package.

### D.3 Working-directory assumptions

* `uvicorn src.api:app` must be launched **from the package root** so that
  `src` is importable. Running it from a parent folder raises
  `ModuleNotFoundError: No module named 'src'`.
* Artifact discovery does **not** depend on the working directory (§B.3), so
  `WorkingDirectory=` in a systemd unit or Render's "root directory" only has
  to make `src` importable.
* The package root must be writable at import time (§B.3 item 3).

### D.4 External downloads

Exactly one: the `all-MiniLM-L6-v2` SBERT weights (~90 MB) from the Hugging
Face Hub, and only when `/similar` or `/analyze`'s semantic half is first
called. Everything else — classifiers, encoders, embedding index, complaints
CSV — ships inside this package.

---

## E. Deployment considerations

### E.1 Memory — measured

Measured peak RSS, CPython 3.12-equivalent interpreter, loading this package's
own artifacts step by step:

| Stage | Peak RSS |
|---|---|
| Bare interpreter | 11 MB |
| After `import src.api` (fastapi, numpy, pandas, sklearn) | 79 MB |
| After both classifiers + both label encoders | 162 MB |
| After the 18000 × 384 embedding index + metadata | 223 MB |
| After the 18000-row complaints CSV | **292 MB** |

That 292 MB is the steady-state footprint **without** semantic search.
`torch` + `transformers` + the MiniLM weights add substantially more — on CPU
builds, commonly **another 400–800 MB** of resident memory. That figure is an
estimate from typical CPU-wheel footprints, **not** measured here, because
torch could not be installed in the validation environment. Measure it on your
target instance before committing to a plan size.

### E.2 Model-loading time — measured

| Step | Time |
|---|---|
| Load both classifiers + encoders | 0.64 s |
| Load embeddings + metadata | 0.08 s |
| Load the complaints CSV | 0.29 s |
| First `/categories` (cold, triggers classifier load) | 537 ms |
| Warm `/classify` | ~1 ms |
| `/pareto` (cold, triggers the CSV load) | 228 ms |
| `/trends` (warm) | 104–110 ms |

Loading is lazy, so **the first request to each endpoint family pays the
load cost** and later requests are fast. The first `/similar` call additionally
constructs the SBERT model — several seconds warm-cached, far longer if the
weights still have to be downloaded. Set the platform health check to
`/health`, which deliberately loads nothing and answers in milliseconds.

Optional: force the load at boot by calling `/classify` and `/pareto` once from
a post-deploy hook, so the first real user is not the one who waits.

### E.3 Large embedding file handling

`models/complaint_embeddings.npy` is 27 MB (18000 × 384 float32) and
`models/complaint_embeddings_index.joblib` is 7.7 MB.

* Both are loaded fully into RAM by `_load_embeddings()`; `/health` reads only
  the header via `mmap_mode="r"`, which is why it stays cheap.
* `_load_embeddings()` validates the shape against the metadata row count and
  re-normalises the rows if they are not unit-length, so a partially corrupted
  file surfaces as a clear 500 rather than silently wrong neighbours.
* Search is a single dense matrix product over all 18000 rows — about 7 MFLOPs,
  a few milliseconds. No vector database is needed at this size.
* **Git hosting:** 27 MB is under GitHub's 100 MB hard limit but over its
  50 MB warning. If you push this repo, either accept the warning or use
  Git LFS. Do **not** add the artifacts to `.gitignore` and expect the
  deployment to work — `/similar` needs them at runtime.
* If RAM is tight, `np.load(..., mmap_mode="r")` inside `_load_embeddings()`
  would trade a little latency for ~27 MB of resident memory. That is a change
  to `src/api.py` and was **not** applied here, to keep the handover faithful.

### E.4 Free-tier hosting limits

| Constraint | Effect |
|---|---|
| **Render free web service: 512 MB RAM** | The full `requirements.txt` install (torch) will **not** fit beside the 292 MB baseline. Build with `requirements-inference-lite.txt`: the service starts, 5 of 7 endpoints work fully, and `/similar` (plus `/analyze`'s `similar` block) returns HTTP 503 with an install hint instead of crashing. For all 7 endpoints, use a paid plan with ≥ 2 GB. |
| **Free-tier build disk / time** | torch CPU wheels are ~800 MB–2.5 GB to download and unpack; free builds frequently time out or run out of space. |
| **Free services sleep when idle** | The first request after a sleep pays a cold start *plus* the lazy artifact load (§E.2), so it can take tens of seconds. A paid plan or an external keep-alive ping avoids this. |
| **Ephemeral filesystem** | Anything written to `reports/` or the HF cache is lost on redeploy. Set `HF_HOME` to a mounted disk, or warm the cache at build time, or the SBERT weights re-download after every deploy. |
| **Repository / image size** | This package is ~61 MB unpacked, dominated by `models/` (41 MB) and `data/` (21 MB). |

### E.5 Other production notes

* **CORS is wide open** — `allow_origins=["*"]` in `src/api.py`. Restrict it to
  the chatbot's origin before anything public. This is the one change worth
  making, and it touches no endpoint or response field.
* **No authentication.** If the service is internet-facing, put it behind an
  API key, a gateway, or the main backend.
* **Single worker is correct.** Each uvicorn worker loads its own copy of the
  artifacts (~292 MB plus torch). Only scale workers once you have measured
  the per-worker footprint against the instance's RAM.
* **Classifier confidence on free-form text is low** — see `VALIDATION_REPORT.md`
  §4. The training data's `complaint_summary` field is templated, so the
  classifier scores 1.0000 accuracy in `reports/` but spreads probability
  broadly on real prose (measured top-1 confidence between 0.15 and 0.74 on
  hand-written test complaints). Surface `category_predictions` as ranked
  candidates in the chatbot rather than asserting a single label, and lean on
  `food_safety_flag`, which is keyword-driven and therefore robust.
