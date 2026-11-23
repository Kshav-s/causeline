# API Test Examples — Member 2 AI Complaint Intelligence

Every response body below was **captured by executing the real endpoint
functions in `src/api.py` against the real artifacts in `models/` and
`data/`**. Nothing is fabricated. Where a case could not be executed, it is
labelled **NOT EXECUTED** and says why — see `VALIDATION_REPORT.md` for the
full account of what ran and what did not.

Base URL used below: `http://127.0.0.1:8000`.

All responses also carry a `disclaimer` string:

> NOTE: This system was trained on synthetic demonstration data. Results must not be presented as verified historical company insights.

---

## 1. Metal fragment complaint

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/classify` |
| Expected status | `200 OK` |

**Request body**
```json
{
  "text": "Found a piece of sharp metal inside a sealed bread packet",
  "top_k": 3,
  "predict_subcategory": true
}
```

**Measured response** (abridged to the fields that matter; `disclaimer` and
`input_text` are always present and are omitted here for brevity)
```json
{
  "top_category": "Physical defect / foreign matter",
  "top_category_confidence": 0.23969349467843692,
  "category_predictions": [
    {
      "label": "Physical defect / foreign matter",
      "probability": 0.23969349467843692
    },
    {
      "label": "Process-related defect",
      "probability": 0.10937052308827397
    },
    {
      "label": "Infestation / pest",
      "probability": 0.10656023061502903
    }
  ],
  "top_subcategory": "A hard fragment was found inside one retail pack",
  "top_subcategory_confidence": 0.12980627303201978,
  "subcategory_predictions": [
    {
      "label": "A hard fragment was found inside one retail pack",
      "probability": 0.12980627303201978
    },
    {
      "label": "Piece size and processing finish varied across the batch",
      "probability": 0.09300563946112907
    },
    {
      "label": "A small insect was found inside the secondary packaging",
      "probability": 0.07008181019554142
    }
  ],
  "food_safety_flag": {
    "escalate_for_food_safety_review": true,
    "reason_keywords": [
      "metal",
      "sharp"
    ],
    "reason_category_in_safety_bucket": true,
    "note": "Heuristic escalation flag based on keywords and category. This is NOT a food-safety determination; human review is required."
  }
}
```

**Expected response fields**

`input_text`, `category_predictions[]` (`label`, `probability`), `top_category`,
`top_category_confidence`, `subcategory_predictions[]`, `top_subcategory`,
`top_subcategory_confidence`, `food_safety_flag` (`escalate_for_food_safety_review`,
`reason_keywords`, `reason_category_in_safety_bucket`, `note`), `disclaimer`.

**What to verify**

- `top_category` is `"Physical defect / foreign matter"`.
- `food_safety_flag.escalate_for_food_safety_review` is `true`.
- `reason_keywords` contains both `"metal"` and `"sharp"`.
- `reason_category_in_safety_bucket` is `true` — the predicted category is itself in the safety bucket, so this complaint escalates on two independent grounds.
- `category_predictions` has exactly 3 entries (`top_k`) and is sorted by descending `probability`.
- every `probability` is a float in `[0, 1]`.

> Measured top-1 confidence here is only 0.2397. That is expected and is explained in `VALIDATION_REPORT.md` §4 — do not treat a low score as a bug. The escalation flag does not depend on classifier confidence.

---

## 2. Plastic fragment complaint

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/classify` |
| Expected status | `200 OK` |

**Request body**
```json
{
  "text": "Hard plastic fragment found inside sealed yoghurt cup",
  "top_k": 3,
  "predict_subcategory": true
}
```

**Measured response** (abridged to the fields that matter; `disclaimer` and
`input_text` are always present and are omitted here for brevity)
```json
{
  "top_category": "Physical defect / foreign matter",
  "top_category_confidence": 0.559839958677993,
  "category_predictions": [
    {
      "label": "Physical defect / foreign matter",
      "probability": 0.559839958677993
    },
    {
      "label": "Infestation / pest",
      "probability": 0.06844652712005651
    },
    {
      "label": "Process-related defect",
      "probability": 0.05463439788285115
    }
  ],
  "top_subcategory": "A hard fragment was found inside one retail pack",
  "top_subcategory_confidence": 0.4711061915796883,
  "subcategory_predictions": [
    {
      "label": "A hard fragment was found inside one retail pack",
      "probability": 0.4711061915796883
    },
    {
      "label": "A small transparent plastic fragment was identified",
      "probability": 0.13889154716643137
    },
    {
      "label": "A small insect was found inside the secondary packaging",
      "probability": 0.053406073958524106
    }
  ],
  "food_safety_flag": {
    "escalate_for_food_safety_review": true,
    "reason_keywords": [
      "plastic"
    ],
    "reason_category_in_safety_bucket": true,
    "note": "Heuristic escalation flag based on keywords and category. This is NOT a food-safety determination; human review is required."
  }
}
```

**Expected response fields**

`input_text`, `category_predictions[]` (`label`, `probability`), `top_category`,
`top_category_confidence`, `subcategory_predictions[]`, `top_subcategory`,
`top_subcategory_confidence`, `food_safety_flag` (`escalate_for_food_safety_review`,
`reason_keywords`, `reason_category_in_safety_bucket`, `note`), `disclaimer`.

**What to verify**

- `top_category` is `"Physical defect / foreign matter"` with the highest measured confidence of the foreign-matter cases (0.5598).
- `reason_keywords` contains `"plastic"`.
- `escalate_for_food_safety_review` is `true`.
- `top_subcategory` is a non-null string drawn from the `/categories` `defect_subcategory` list.

---

## 3. Packaging defect complaint

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/classify` |
| Expected status | `200 OK` |

**Request body**
```json
{
  "text": "Packet seal was broken and leaking when the carton was opened",
  "top_k": 3,
  "predict_subcategory": true
}
```

**Measured response** (abridged to the fields that matter; `disclaimer` and
`input_text` are always present and are omitted here for brevity)
```json
{
  "top_category": "Packaging issue",
  "top_category_confidence": 0.7409082686879203,
  "category_predictions": [
    {
      "label": "Packaging issue",
      "probability": 0.7409082686879203
    },
    {
      "label": "Process-related defect",
      "probability": 0.039233587726131065
    },
    {
      "label": "Sensory characteristic",
      "probability": 0.03707149898844657
    }
  ],
  "top_subcategory": "The outer carton was crushed and several inner packs were exposed",
  "top_subcategory_confidence": 0.32322432186705496,
  "subcategory_predictions": [
    {
      "label": "The outer carton was crushed and several inner packs were exposed",
      "probability": 0.32322432186705496
    },
    {
      "label": "The top seal was partially open on several packs",
      "probability": 0.13507563189340907
    },
    {
      "label": "A pouch seam had separated during handling",
      "probability": 0.015338481845348787
    }
  ],
  "food_safety_flag": {
    "escalate_for_food_safety_review": false,
    "reason_keywords": [],
    "reason_category_in_safety_bucket": false,
    "note": "Heuristic escalation flag based on keywords and category. This is NOT a food-safety determination; human review is required."
  }
}
```

**Expected response fields**

`input_text`, `category_predictions[]` (`label`, `probability`), `top_category`,
`top_category_confidence`, `subcategory_predictions[]`, `top_subcategory`,
`top_subcategory_confidence`, `food_safety_flag` (`escalate_for_food_safety_review`,
`reason_keywords`, `reason_category_in_safety_bucket`, `note`), `disclaimer`.

**What to verify**

- `top_category` is `"Packaging issue"` — the clearest classification of the set (0.7409).
- `escalate_for_food_safety_review` is **`false`** — this is the key negative control: a genuine defect that must *not* escalate.
- `reason_keywords` is an empty array `[]`.
- `reason_category_in_safety_bucket` is `false`.
- the response still carries the full nested structure despite no escalation.

---

## 4. Sensory defect complaint

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/classify` |
| Expected status | `200 OK` |

**Request body**
```json
{
  "text": "Milk had a sour smell and strange taste before the expiry date",
  "top_k": 3,
  "predict_subcategory": true
}
```

**Measured response** (abridged to the fields that matter; `disclaimer` and
`input_text` are always present and are omitted here for brevity)
```json
{
  "top_category": "Sensory characteristic",
  "top_category_confidence": 0.2494689795983665,
  "category_predictions": [
    {
      "label": "Sensory characteristic",
      "probability": 0.2494689795983665
    },
    {
      "label": "Contamination / microbiological",
      "probability": 0.15165109259325757
    },
    {
      "label": "Packaging issue",
      "probability": 0.10941847386745394
    }
  ],
  "top_subcategory": "Visible spoilage was reported before the stated use-by date",
  "top_subcategory_confidence": 0.21048683582833053,
  "subcategory_predictions": [
    {
      "label": "Visible spoilage was reported before the stated use-by date",
      "probability": 0.21048683582833053
    },
    {
      "label": "An unexpected sour note was noticed after opening",
      "probability": 0.05976177358074293
    },
    {
      "label": "A pouch seam had separated during handling",
      "probability": 0.04072350357015023
    }
  ],
  "food_safety_flag": {
    "escalate_for_food_safety_review": false,
    "reason_keywords": [],
    "reason_category_in_safety_bucket": false,
    "note": "Heuristic escalation flag based on keywords and category. This is NOT a food-safety determination; human review is required."
  }
}
```

**Expected response fields**

`input_text`, `category_predictions[]` (`label`, `probability`), `top_category`,
`top_category_confidence`, `subcategory_predictions[]`, `top_subcategory`,
`top_subcategory_confidence`, `food_safety_flag` (`escalate_for_food_safety_review`,
`reason_keywords`, `reason_category_in_safety_bucket`, `note`), `disclaimer`.

**What to verify**

- `top_category` is `"Sensory characteristic"`.
- `escalate_for_food_safety_review` is `false` — second negative control.
- note that `"spoil"` is a safety keyword but `"sour"` is not, so this text does not trigger the heuristic; `Contamination / microbiological` appears as the #2 candidate instead.

---

## 5. Food-safety escalation example

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/classify` |
| Expected status | `200 OK` |

**Request body**
```json
{
  "text": "My child vomited after eating the biscuit, we found glass pieces and went to hospital",
  "top_k": 3,
  "predict_subcategory": true
}
```

**Measured response** (abridged to the fields that matter; `disclaimer` and
`input_text` are always present and are omitted here for brevity)
```json
{
  "top_category": "Weight / quantity issue",
  "top_category_confidence": 0.1485324729743693,
  "category_predictions": [
    {
      "label": "Weight / quantity issue",
      "probability": 0.1485324729743693
    },
    {
      "label": "Process-related defect",
      "probability": 0.14806401166058114
    },
    {
      "label": "Physical defect / foreign matter",
      "probability": 0.12725009535929707
    }
  ],
  "top_subcategory": "The pack contained fewer pieces than specified",
  "top_subcategory_confidence": 0.10534753171073172,
  "subcategory_predictions": [
    {
      "label": "The pack contained fewer pieces than specified",
      "probability": 0.10534753171073172
    },
    {
      "label": "A hard fragment was found inside one retail pack",
      "probability": 0.08652704005390476
    },
    {
      "label": "Some pieces appeared under-baked",
      "probability": 0.05317566438568268
    }
  ],
  "food_safety_flag": {
    "escalate_for_food_safety_review": true,
    "reason_keywords": [
      "glass",
      "hospital",
      "vomit"
    ],
    "reason_category_in_safety_bucket": false,
    "note": "Heuristic escalation flag based on keywords and category. This is NOT a food-safety determination; human review is required."
  }
}
```

**Expected response fields**

`input_text`, `category_predictions[]` (`label`, `probability`), `top_category`,
`top_category_confidence`, `subcategory_predictions[]`, `top_subcategory`,
`top_subcategory_confidence`, `food_safety_flag` (`escalate_for_food_safety_review`,
`reason_keywords`, `reason_category_in_safety_bucket`, `note`), `disclaimer`.

**What to verify**

- `escalate_for_food_safety_review` is `true`.
- `reason_keywords` is exactly `["glass", "hospital", "vomit"]` — sorted alphabetically, three independent triggers.
- `reason_category_in_safety_bucket` is `false`: escalation here comes **purely** from keywords, proving the two mechanisms are independent.
- `note` states the flag is NOT a food-safety determination and that human review is required — the chatbot must surface this.
- the classifier's own `top_category` (`"Weight / quantity issue"`, 0.1485) is **wrong** for this text, yet the complaint still escalates correctly. This is the single most important behaviour in the service: safety escalation does not depend on the classifier being right.

---

## 6. Empty complaint input

Two distinct cases, two distinct status codes.

### 6a. Whitespace-only text → `400`

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/classify` |
| Expected status | `400 Bad Request` |

**Request body**
```json
{
  "text": "   ",
  "top_k": 3
}
```

**Measured response**
```json
{
  "detail": "Empty text after cleaning"
}
```

**What to verify**

- status is `400`, not `500` — the text passes the schema's `min_length=1` but
  `clean_text()` reduces it to an empty string, and the handler raises
  `HTTPException(400, "Empty text after cleaning")`.
- `detail` is the human-readable string above.
- the same applies to punctuation-only input such as `"!!!"`, because
  `clean_text()` strips all non-alphanumerics.

### 6b. Empty string → `422`

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/classify` |
| Expected status | `422 Unprocessable Entity` |

**Request body**
```json
{
  "text": "",
  "top_k": 3
}
```

**What to verify**

- status is `422`. `ClassifyRequest.text` is declared `Field(..., min_length=1)`,
  so pydantic rejects the body before the handler runs — confirmed: constructing
  the model raises `ValidationError`.
- the body is FastAPI's standard validation-error envelope:
  `{"detail": [{"type": "string_too_short", "loc": ["body", "text"], ...}]}`.
- a chatbot client must handle **both** `400` and `422` for "the user sent nothing useful".

---

## 7. Invalid request body

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/classify` |
| Expected status | `422 Unprocessable Entity` |

**Request body** (required field missing, wrong type on another)
```json
{
  "top_k": "three"
}
```

**What to verify**

- status is `422`. Confirmed: pydantic raises `ValidationError`
  with error types `missing`, `int_parsing` —
  `missing` for the absent `text`, `int_parsing` for `top_k="three"`.
- `detail` is an array with one entry per offending field, each with `loc`,
  `msg` and `type`.
- out-of-range values are also `422`: `top_k` is `ge=1, le=10` on `/classify`
  and `ge=1, le=25` on `/similar` and `/analyze`, so `top_k: 99` is rejected
  by the schema — **verified in the automated run**.
- an unknown `/pareto` column is a `400`, not a `422`, because it is checked in
  the handler:
```json
{
  "detail": "Unknown column: not_a_column"
}
```

---

## 8. Similar complaint retrieval

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/similar` |
| Expected status | `200 OK` (or `503` — see below) |

**Request body**
```json
{
  "text": "Plastic fragment inside sealed pack",
  "top_k": 3
}
```

**Expected response shape**
```json
{
  "query": "Plastic fragment inside sealed pack",
  "count": 3,
  "results": [
    {
      "complaint_id": "<string>",
      "complaint_received_date": "<ISO 8601 string>",
      "complaint_category": "<string>",
      "defect_subcategory": "<string>",
      "product_name": "<string>",
      "complaint_summary": "<string>",
      "complaint_description": "<string>",
      "similarity": "<float, cosine, 0-1>"
    }
  ],
  "disclaimer": "<string>"
}
```

**NOT EXECUTED with a live query.** `/similar` has to encode the query text
with `all-MiniLM-L6-v2`, which needs `sentence-transformers` + `torch`. Those
could not be installed in the validation environment, so this endpoint returned
its documented degradation instead:

```json
{
  "status": 503,
  "detail": "sentence-transformers is not installed in this environment. Install it (pip install sentence-transformers) to use semantic endpoints. Underlying error: ModuleNotFoundError: No module named 'sentence_transformers'"
}
```

**What was executed instead** — the retrieval half of the endpoint, on the real
shipped index, using a cached row vector as the query (so no SBERT is needed).
This verifies the index, the metadata alignment and the cosine ranking:

```json
{
  "index_shape": [
    18000,
    384
  ],
  "meta_rows": 18000,
  "meta_columns": [
    "complaint_id",
    "complaint_received_date",
    "complaint_category",
    "defect_subcategory",
    "product_name",
    "complaint_summary",
    "complaint_description"
  ],
  "self_similarity": 1.0000001192092896,
  "top5": [
    {
      "row": 0,
      "similarity": 1.0,
      "complaint_id": "ABT-CMP-2007-014934",
      "category": "Physical defect / foreign matter",
      "subcategory": "A small transparent plastic fragment was identified"
    },
    {
      "row": 15428,
      "similarity": 0.9293,
      "complaint_id": "ABT-CMP-2023-016662",
      "category": "Physical defect / foreign matter",
      "subcategory": "A dark particle was visible in the product"
    },
    {
      "row": 6027,
      "similarity": 0.8993,
      "complaint_id": "ABT-CMP-2014-009822",
      "category": "Physical defect / foreign matter",
      "subcategory": "A small transparent plastic fragment was identified"
    },
    {
      "row": 10967,
      "similarity": 0.8896,
      "complaint_id": "ABT-CMP-2019-002777",
      "category": "Physical defect / foreign matter",
      "subcategory": "A small transparent plastic fragment was identified"
    },
    {
      "row": 9304,
      "similarity": 0.8832,
      "complaint_id": "ABT-CMP-2017-007750",
      "category": "Physical defect / foreign matter",
      "subcategory": "A hard fragment was found inside one retail pack"
    }
  ]
}
```

**What to verify** once `sentence-transformers` is installed

- status is `200` and `/health` reports `"sbert_available": true`.
- `count` equals `len(results)` and equals `top_k`.
- `results` is sorted by **descending** `similarity`.
- each `similarity` is a float in `[-1, 1]`; near-duplicates sit above ~0.85
  (the cached-vector run above shows 0.9293 / 0.8993 / 0.8896 for true
  near-neighbours, which is the expected band).
- `results[*]` carries the seven metadata columns listed above **plus**
  `similarity`. `product_id` and `batch_id` are *not* present despite the
  original README mentioning them — the shipped index does not contain them.
- passing `exclude_complaint_id` with the top hit's id removes exactly that
  record from the results.
- a query that semantically matches foreign-matter complaints returns
  `complaint_category: "Physical defect / foreign matter"` neighbours — the
  cached-vector run confirms the index groups them that way.

---

## 9. Combined analysis (`/analyze`)

| | |
|---|---|
| Method | `POST` |
| Endpoint | `/analyze` |
| Expected status | `200 OK` |

**Request body**
```json
{
  "text": "Found a piece of sharp metal inside a sealed bread packet",
  "top_k_similar": 3
}
```

**Measured response** — top-level keys and the degradation path, captured
without `sentence-transformers` installed:
```json
{
  "classification": {
    "...": "the full /classify payload, nested unchanged (see example 1)"
  },
  "similar": [],
  "similar_error": "sentence-transformers is not installed in this environment. Install it (pip install sentence-transformers) to use semantic endpoints. Underlying error: ModuleNotFoundError: No module named 'sentence_transformers'",
  "food_safety_flag": {
    "escalate_for_food_safety_review": true,
    "reason_keywords": [
      "metal",
      "sharp"
    ],
    "reason_category_in_safety_bucket": true,
    "note": "Heuristic escalation flag based on keywords and category. This is NOT a food-safety determination; human review is required."
  },
  "disclaimer": "NOTE: This system was trained on synthetic demonstration data. Results must not be presented as verified historical company insights."
}
```

**What to verify**

- exactly these five top-level keys: `classification`, `similar`,
  `similar_error`, `food_safety_flag`, `disclaimer`.
- `classification` is the complete `/classify` object with its nested fields
  and types unchanged — **verified field by field in the automated run**.
- `food_safety_flag` is byte-identical to `classification.food_safety_flag`
  — **verified**.
- **Graceful degradation:** when semantic search is unavailable,
  `similar` is `[]` and `similar_error` holds the 503 detail string, while
  the whole response still returns `200`. Classification is never lost
  because retrieval failed. **Verified.**
- when `sentence-transformers` *is* installed: `similar` is populated and
  `similar_error` is `null`.

---

## 10. `GET /health`

**Measured response** (from the validation environment, which deliberately
had no `sentence-transformers` — on a full install `sbert_available` is `true`
and `sbert_error` is `null`)
```json
{
  "status": "ok",
  "primary_model_loaded": true,
  "subcat_model_loaded": true,
  "embeddings_available": true,
  "embeddings_shape": [
    18000,
    384
  ],
  "sbert_model_name": "all-MiniLM-L6-v2",
  "sbert_available": false,
  "sbert_error": "ModuleNotFoundError: No module named 'sentence_transformers'",
  "disclaimer": "NOTE: This system was trained on synthetic demonstration data. Results must not be presented as verified historical company insights."
}
```

**What to verify**: `status == "ok"`; `primary_model_loaded`,
`subcat_model_loaded` and `embeddings_available` are all `true`;
`embeddings_shape` is `[18000, 384]`; `sbert_model_name` is
`"all-MiniLM-L6-v2"`. This endpoint loads no artifacts, so it is the correct
platform health-check path.

---

## 11. `GET /categories`

**Measured**: 10 `complaint_category` labels and
74 `defect_subcategory` labels.

`complaint_category` (complete list):
```json
[
  "Contamination / microbiological",
  "Infestation / pest",
  "Labelling / allergen issue",
  "Packaging issue",
  "Physical defect / foreign matter",
  "Process-related defect",
  "Product quality deviation",
  "Sensory characteristic",
  "Storage / transportation issue",
  "Weight / quantity issue"
]
```

First five `defect_subcategory` labels of 74:
```json
[
  "A customer reported illness after consuming the product; causation is unconfirmed",
  "A dark particle was visible in the product",
  "A frozen case showed signs of partial thawing",
  "A hard fragment was found inside one retail pack",
  "A measured product-quality attribute was outside the approved acceptance range"
]
```

**What to verify**: both are non-empty arrays of strings; every `top_category`
returned by `/classify` is a member of `complaint_category`, and every
`top_subcategory` a member of `defect_subcategory`. Cold-call latency measured
at 537 ms (it triggers the classifier load); warm calls are ~1 ms.

---

## 12. `GET /pareto?column=complaint_category`

**Measured**: 10 rows, cumulative percentage closing at
100.00. First four rows:
```json
[
  {
    "complaint_category": "Packaging issue",
    "count": 2933,
    "pct": 16.294444444444444,
    "cum_pct": 16.294444444444444,
    "is_vital_few": true
  },
  {
    "complaint_category": "Product quality deviation",
    "count": 2882,
    "pct": 16.011111111111113,
    "cum_pct": 32.30555555555556,
    "is_vital_few": true
  },
  {
    "complaint_category": "Sensory characteristic",
    "count": 2763,
    "pct": 15.35,
    "cum_pct": 47.65555555555556,
    "is_vital_few": true
  },
  {
    "complaint_category": "Process-related defect",
    "count": 2118,
    "pct": 11.766666666666667,
    "cum_pct": 59.422222222222224,
    "is_vital_few": true
  }
]
```

**What to verify**: `column` echoes the query parameter; `rows` is sorted by
descending `count`; `pct` sums to 100 and `cum_pct` is its running total;
`is_vital_few` is `true` while `cum_pct <= 80`. An unknown column gives `400`
(example 7).

---

## 13. `GET /trends?group=complaint_category`

**Measured**: `monthly` has 2257 rows, `recurring` has
74, `emerging` has 22. One row from each:
```json
{
  "monthly": {
    "month": "2007-01",
    "complaint_category": "Contamination / microbiological",
    "count": 1
  },
  "recurring": {
    "defect_subcategory": "Moisture condition varied from the approved process range",
    "total": 54,
    "recurrences": 12,
    "recurrence_rate": 0.2222222222222222
  },
  "emerging": {
    "category": "A small transparent plastic fragment was identified",
    "recent_count": 9,
    "baseline_count": 7,
    "recent_share": 0.0379746835443038,
    "baseline_share": 0.01440329218106996,
    "lift": 2.636528028933092
  }
}
```

**What to verify**: all four keys (`monthly`, `recurring`, `emerging`,
`disclaimer`) are present; `monthly` rows carry `month` (`YYYY-MM`), the group
column and `count`; `recurring` and `emerging` are arrays and may legitimately
be empty on a different dataset. Measured latency 104 ms warm.

---

## Running all of this automatically

```bash
uvicorn src.api:app --host 127.0.0.1 --port 8000     # terminal 1
python scripts/test_deployment_api.py                # terminal 2
```

`scripts/test_deployment_api.py` covers every case above plus the invalid-input
and `exclude_complaint_id` paths, and prints `PASS` / `FAIL` / `SKIP` per check.
It uses the standard library only, so it needs nothing installed beyond Python.
See `VALIDATION_REPORT.md` for the result of the run performed during packaging.
