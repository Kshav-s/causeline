#!/usr/bin/env python3
"""Automated endpoint test for Member 2 - AI Complaint Intelligence.

Read-only: it only sends requests and asserts on the responses. It does not
import or modify application code, so it cannot change production behaviour.

Standard library only - no extra pip install needed.

Usage
-----
    # 1. start the service in another terminal
    uvicorn src.api:app --host 127.0.0.1 --port 8000

    # 2. run the tests
    python scripts/test_deployment_api.py
    python scripts/test_deployment_api.py --base-url https://my-service.onrender.com

Exit code 0 = all required tests passed, 1 = at least one required failure.
Tests for /similar are reported as SKIP (not FAIL) when the deployment was
installed without sentence-transformers, because HTTP 503 there is the
documented, intended degradation - not a defect.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
_results: list[tuple[str, str, str]] = []
_sbert_available: bool | None = None


# --------------------------------------------------------------------------
# transport
# --------------------------------------------------------------------------
def call(base: str, method: str, path: str, body: dict | None = None,
         params: dict | None = None, timeout: float = 120.0):
    """Return (status_code, parsed_json_or_text, elapsed_seconds)."""
    url = base.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:            # 4xx / 5xx are expected cases
        raw = e.read().decode("utf-8", "replace")
        status = e.code
    except urllib.error.URLError as e:
        raise SystemExit(
            f"\nCannot reach {url}\n  {e}\n\n"
            "Is the service running? Start it with:\n"
            "  uvicorn src.api:app --host 127.0.0.1 --port 8000\n"
        )
    elapsed = time.time() - t0
    try:
        return status, json.loads(raw), elapsed
    except json.JSONDecodeError:
        return status, raw, elapsed


def report(name: str, outcome: str, detail: str = "") -> None:
    _results.append((name, outcome, detail))
    print(f"  [{outcome}] {name}" + (f"  -  {detail}" if detail else ""))


def check(name: str, condition: bool, detail: str = "") -> bool:
    report(name, PASS if condition else FAIL, detail)
    return bool(condition)


# --------------------------------------------------------------------------
# tests
# --------------------------------------------------------------------------
def t_health(base: str) -> None:
    global _sbert_available
    print("\n1. GET /health")
    status, b, dt = call(base, "GET", "/health")
    if not check("status code is 200", status == 200, f"got {status}"):
        return
    check("status field == 'ok'", isinstance(b, dict) and b.get("status") == "ok")
    check("primary_model_loaded is True", b.get("primary_model_loaded") is True,
          "models/tfidf_logreg.joblib must be present")
    check("subcat_model_loaded is True", b.get("subcat_model_loaded") is True,
          "models/tfidf_logreg_subcat.joblib must be present")
    check("embeddings_available is True", b.get("embeddings_available") is True,
          "models/complaint_embeddings.npy + _index.joblib must be present")
    shape = b.get("embeddings_shape")
    check("embeddings_shape is [18000, 384]", shape == [18000, 384], f"got {shape}")
    check("sbert_model_name == 'all-MiniLM-L6-v2'",
          b.get("sbert_model_name") == "all-MiniLM-L6-v2")
    check("disclaimer present", bool(b.get("disclaimer")))
    _sbert_available = bool(b.get("sbert_available"))
    print(f"      sentence-transformers available in this deployment: {_sbert_available}")
    if not _sbert_available:
        print(f"      sbert_error: {b.get('sbert_error')}")
    print(f"      response time: {dt*1000:.0f} ms")


def t_categories(base: str) -> None:
    print("\n2. GET /categories")
    status, b, _ = call(base, "GET", "/categories")
    if not check("status code is 200", status == 200, f"got {status}"):
        return
    cats = b.get("complaint_category")
    check("complaint_category is a non-empty list", isinstance(cats, list) and len(cats) > 0)
    check("complaint_category has 10 labels", isinstance(cats, list) and len(cats) == 10,
          f"got {len(cats) if isinstance(cats, list) else 'n/a'}")
    check("'Physical defect / foreign matter' is a known label",
          isinstance(cats, list) and "Physical defect / foreign matter" in cats)
    subs = b.get("defect_subcategory")
    check("defect_subcategory is a non-empty list", isinstance(subs, list) and len(subs) > 0,
          f"{len(subs) if isinstance(subs, list) else 'n/a'} labels")


def _assert_classification_shape(prefix: str, b: dict) -> None:
    for field in ("input_text", "category_predictions", "top_category",
                  "top_category_confidence", "subcategory_predictions",
                  "top_subcategory", "top_subcategory_confidence",
                  "food_safety_flag", "disclaimer"):
        check(f"{prefix}: field '{field}' present", field in b)
    preds = b.get("category_predictions")
    check(f"{prefix}: category_predictions is a list", isinstance(preds, list))
    if isinstance(preds, list) and preds:
        check(f"{prefix}: prediction has label+probability",
              "label" in preds[0] and "probability" in preds[0])
        check(f"{prefix}: probability is a float in [0,1]",
              isinstance(preds[0]["probability"], float) and 0.0 <= preds[0]["probability"] <= 1.0)
        check(f"{prefix}: predictions sorted descending by probability",
              all(preds[i]["probability"] >= preds[i + 1]["probability"]
                  for i in range(len(preds) - 1)))
    check(f"{prefix}: top_category is a string", isinstance(b.get("top_category"), str))
    flag = b.get("food_safety_flag") or {}
    for field in ("escalate_for_food_safety_review", "reason_keywords",
                  "reason_category_in_safety_bucket", "note"):
        check(f"{prefix}: food_safety_flag.{field} present", field in flag)
    check(f"{prefix}: escalate flag is a bool",
          isinstance(flag.get("escalate_for_food_safety_review"), bool))


def t_classify(base: str) -> None:
    print("\n3. POST /classify")
    cases = [
        ("metal fragment",
         "Found a piece of sharp metal inside a sealed bread packet", True),
        ("plastic fragment",
         "Hard plastic fragment found inside sealed yoghurt cup", True),
        ("packaging defect",
         "Packet seal was broken and leaking when the carton was opened", False),
        ("sensory defect",
         "Milk had a sour smell and strange taste before the expiry date", False),
    ]
    for label, text, expect_escalation in cases:
        status, b, _ = call(base, "POST", "/classify",
                            {"text": text, "top_k": 3, "predict_subcategory": True})
        if not check(f"{label}: status code is 200", status == 200, f"got {status}"):
            continue
        _assert_classification_shape(label, b)
        got = (b.get("food_safety_flag") or {}).get("escalate_for_food_safety_review")
        check(f"{label}: escalation flag == {expect_escalation}", got is expect_escalation,
              f"top_category={b.get('top_category')!r} "
              f"conf={b.get('top_category_confidence')}")
        check(f"{label}: top_k honoured (3 predictions)",
              isinstance(b.get("category_predictions"), list)
              and len(b["category_predictions"]) == 3)


def t_food_safety_escalation(base: str) -> None:
    print("\n4. POST /classify  -  food-safety escalation")
    text = ("My child vomited after eating the biscuit, we found glass pieces "
            "and went to hospital")
    status, b, _ = call(base, "POST", "/classify", {"text": text, "top_k": 3})
    if not check("status code is 200", status == 200, f"got {status}"):
        return
    flag = b.get("food_safety_flag") or {}
    check("escalate_for_food_safety_review is True",
          flag.get("escalate_for_food_safety_review") is True)
    kws = flag.get("reason_keywords") or []
    check("reason_keywords is a non-empty list", isinstance(kws, list) and len(kws) > 0,
          f"matched {kws}")
    check("'glass' detected as a safety keyword", "glass" in kws)
    check("note states this is not a safety determination",
          isinstance(flag.get("note"), str) and "NOT" in flag["note"])


def t_invalid_input(base: str) -> None:
    print("\n5. Invalid input handling")
    status, b, _ = call(base, "POST", "/classify", {"text": "   ", "top_k": 3})
    check("whitespace-only text -> HTTP 400", status == 400, f"got {status}")
    check("400 detail mentions empty text",
          isinstance(b, dict) and "empty" in str(b.get("detail", "")).lower(),
          str(b)[:90])

    status, _, _ = call(base, "POST", "/classify", {"text": "", "top_k": 3})
    check("empty-string text -> HTTP 422 (schema min_length=1)", status == 422,
          f"got {status}")

    status, _, _ = call(base, "POST", "/classify", {"top_k": "three"})
    check("malformed body -> HTTP 422", status == 422, f"got {status}")

    status, _, _ = call(base, "POST", "/classify", {"text": "metal shard", "top_k": 99})
    check("top_k above le=10 -> HTTP 422", status == 422, f"got {status}")

    status, _, _ = call(base, "GET", "/pareto", params={"column": "not_a_column"})
    check("unknown pareto column -> HTTP 400", status == 400, f"got {status}")


def t_similar(base: str) -> None:
    print("\n6. POST /similar")
    status, b, dt = call(base, "POST", "/similar",
                         {"text": "Plastic fragment inside sealed pack", "top_k": 3})
    if status == 503 and not _sbert_available:
        report("similar: documented 503 degradation (sentence-transformers absent)",
               SKIP, "install sentence-transformers to enable this endpoint")
        return
    if not check("status code is 200", status == 200, f"got {status} - {str(b)[:120]}"):
        return
    check("field 'query' present", "query" in b)
    check("field 'count' present", "count" in b)
    check("field 'results' present", isinstance(b.get("results"), list))
    check("count matches len(results)", b.get("count") == len(b.get("results") or []))
    check("top_k honoured (3 results)", len(b.get("results") or []) == 3)
    res = (b.get("results") or [None])[0]
    if isinstance(res, dict):
        for field in ("complaint_id", "complaint_category", "defect_subcategory",
                      "similarity"):
            check(f"result field '{field}' present", field in res)
        sim = res.get("similarity")
        check("similarity is a float in [-1,1]",
              isinstance(sim, float) and -1.0 <= sim <= 1.0, f"top similarity={sim}")
        sims = [r.get("similarity") for r in b["results"]]
        check("results sorted descending by similarity",
              all(sims[i] >= sims[i + 1] for i in range(len(sims) - 1)), f"{sims}")
    print(f"      response time: {dt*1000:.0f} ms")

    status, b2, _ = call(base, "POST", "/similar",
                         {"text": "Plastic fragment inside sealed pack", "top_k": 3,
                          "exclude_complaint_id": (res or {}).get("complaint_id")})
    if status == 200 and isinstance(res, dict):
        ids = [r.get("complaint_id") for r in b2.get("results") or []]
        check("exclude_complaint_id filters that id out",
              res.get("complaint_id") not in ids)


def t_analyze(base: str) -> None:
    print("\n7. POST /analyze  (combined)")
    status, b, dt = call(base, "POST", "/analyze",
                         {"text": "Found a piece of sharp metal inside a sealed bread packet",
                          "top_k_similar": 3})
    if not check("status code is 200", status == 200, f"got {status}"):
        return
    for field in ("classification", "similar", "similar_error",
                  "food_safety_flag", "disclaimer"):
        check(f"top-level field '{field}' present", field in b)
    check("classification is a nested object", isinstance(b.get("classification"), dict))
    if isinstance(b.get("classification"), dict):
        _assert_classification_shape("analyze.classification", b["classification"])
        check("analyze.food_safety_flag mirrors classification.food_safety_flag",
              b.get("food_safety_flag") == b["classification"].get("food_safety_flag"))
    check("similar is a list", isinstance(b.get("similar"), list))
    if _sbert_available:
        check("similar is populated when SBERT is available",
              len(b.get("similar") or []) > 0)
        check("similar_error is null when SBERT is available", b.get("similar_error") is None)
    else:
        report("analyze: similar=[] + similar_error set (documented degradation)",
               SKIP if (b.get("similar") == [] and b.get("similar_error")) else FAIL,
               str(b.get("similar_error"))[:80])
    print(f"      response time: {dt*1000:.0f} ms")


def t_pareto(base: str) -> None:
    print("\n8. GET /pareto")
    status, b, dt = call(base, "GET", "/pareto", params={"column": "complaint_category"})
    if not check("status code is 200", status == 200, f"got {status}"):
        return
    check("field 'column' echoes the request",
          b.get("column") == "complaint_category")
    rows = b.get("rows")
    check("field 'rows' is a non-empty list", isinstance(rows, list) and len(rows) > 0)
    if isinstance(rows, list) and rows:
        for field in ("complaint_category", "count", "pct", "cum_pct", "is_vital_few"):
            check(f"row field '{field}' present", field in rows[0])
        check("rows sorted descending by count",
              all(rows[i]["count"] >= rows[i + 1]["count"] for i in range(len(rows) - 1)))
        check("cum_pct reaches ~100 on the last row",
              abs(float(rows[-1]["cum_pct"]) - 100.0) < 0.01,
              f"got {rows[-1]['cum_pct']}")
        check("is_vital_few is a bool", isinstance(rows[0]["is_vital_few"], bool))
    print(f"      response time: {dt*1000:.0f} ms")


def t_trends(base: str) -> None:
    print("\n9. GET /trends")
    status, b, dt = call(base, "GET", "/trends", params={"group": "complaint_category"})
    if not check("status code is 200", status == 200, f"got {status}"):
        return
    for field in ("monthly", "recurring", "emerging", "disclaimer"):
        check(f"field '{field}' present", field in b)
    m = b.get("monthly")
    check("monthly is a non-empty list", isinstance(m, list) and len(m) > 0,
          f"{len(m) if isinstance(m, list) else 'n/a'} rows")
    if isinstance(m, list) and m:
        for field in ("month", "complaint_category", "count"):
            check(f"monthly row field '{field}' present", field in m[0])
    check("recurring is a list", isinstance(b.get("recurring"), list))
    check("emerging is a list", isinstance(b.get("emerging"), list))
    print(f"      response time: {dt*1000:.0f} ms")


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Test the Member 2 NLP service.")
    ap.add_argument("--base-url", default="http://127.0.0.1:8000",
                    help="service base URL (default: http://127.0.0.1:8000)")
    args = ap.parse_args()

    print("=" * 74)
    print(" Member 2 - AI Complaint Intelligence : deployment API test")
    print(f" target: {args.base_url}")
    print("=" * 74)

    t_health(args.base_url)
    t_categories(args.base_url)
    t_classify(args.base_url)
    t_food_safety_escalation(args.base_url)
    t_invalid_input(args.base_url)
    t_similar(args.base_url)
    t_analyze(args.base_url)
    t_pareto(args.base_url)
    t_trends(args.base_url)

    npass = sum(1 for _, o, _ in _results if o == PASS)
    nfail = sum(1 for _, o, _ in _results if o == FAIL)
    nskip = sum(1 for _, o, _ in _results if o == SKIP)
    print("\n" + "=" * 74)
    print(f" SUMMARY: {npass} PASS   {nfail} FAIL   {nskip} SKIP   "
          f"({len(_results)} checks)")
    if nfail:
        print("\n Failures:")
        for name, outcome, detail in _results:
            if outcome == FAIL:
                print(f"   - {name}" + (f"  -  {detail}" if detail else ""))
    print("=" * 74)
    return 1 if nfail else 0


if __name__ == "__main__":
    sys.exit(main())
