"""ML integration tests against the real artifacts. A passing test proves correct wiring, not model accuracy."""
from pathlib import Path

import numpy as np
import pytest

from app.ml import engines
from app.ml.registry import ModelRegistry, registry


@pytest.fixture(scope="module", autouse=True)
def loaded(client):  # client fixture runs the app lifespan -> registry.load_all()
    yield


def test_registry_status():
    assert registry.get("nlp-category").status == "ready"
    assert registry.get("nlp-subcategory").status == "ready"
    assert registry.get("root-cause").status == "ready"
    assert registry.get("batch-risk").status == "degraded"  # weak signal is disclosed, not hidden
    for key in ("nlp-category", "root-cause", "batch-risk"):
        assert registry.get(key).sha256, f"{key} artifacts must be hashed"


@pytest.mark.parametrize("text,label,conf", [
    # Reference values from the handover's VALIDATION_REPORT.md section 4 (same artifacts, same preprocessing)
    ("Packet seal was broken and leaking when the carton was opened", "Packaging issue", 0.7409),
    ("Found a piece of sharp metal inside a sealed bread packet", "Physical defect / foreign matter", 0.2397),
])
def test_classify_matches_handover_reference(text, label, conf):
    r = engines.classify("nlp-category", text)
    assert r.status == "completed" and r.top_label == label
    assert r.top_score == pytest.approx(conf, abs=1e-4)
    assert r.low_confidence == (conf < 0.5)
    probs = [p["probability"] for p in r.output["predictions"]]
    assert len(probs) == 3 and probs == sorted(probs, reverse=True) and sum(probs) <= 1.0001


@pytest.mark.parametrize("text", ["", "   ", "!!! ???", "a"])
def test_classify_empty_or_short_is_insufficient(text):
    r = engines.classify("nlp-category", text)
    assert r.status == "insufficient_data" and r.top_label is None


def test_food_safety_flag_rule():
    r = engines.food_safety("glass pieces found, child went to hospital", "Weight / quantity issue")
    assert r.output["escalate_for_food_safety_review"] is True
    assert {"glass", "hospital"} <= set(r.output["reason_keywords"])


def test_root_cause_requires_category_and_family():
    r = engines.root_cause(None, "mould on bread", None, None, None)
    assert r.status == "insufficient_data" and "complaint_category" in r.message


def test_root_cause_hypotheses_and_unknown_category_warning():
    ok = engines.root_cause(None, "Mould spots visible on bread", None, "Contamination / microbiological", "Bakery products")
    assert ok.status == "completed" and len(ok.output["hypotheses"]) == 3
    assert "not a confirmed" in ok.output["basis"].lower()
    unk = engines.root_cause(None, "Mould spots", None, "Made-up category", "Bakery products")
    assert unk.status == "completed" and any("not a complaint category" in w for w in unk.warnings)


def _batch(levels, **over):
    rec = {"production_date": __import__("datetime").date(2025, 6, 1), "dispatch_date": __import__("datetime").date(2025, 6, 4),
           "incoming_material_quality_score": 82, "process_deviation_count": 1, "final_inspection_pass_rate_pct": 98,
           "remaining_shelf_life_days_at_dispatch": 8, "shelf_life_days": 10, "storage_hours_before_dispatch": 12,
           "prior_product_complaints_90d": 0, "prior_food_family_complaints_90d": 2, "prior_customer_complaints_90d": 0,
           "production_quantity_tonnes": 4, "target_storage_temp_min_c": 0, "target_storage_temp_max_c": 4,
           **{k: v[0] for k, v in levels.items()}}
    rec.update(over)
    return rec


def test_batch_risk_valid_missing_unknown():
    levels = registry.get("batch-risk").obj["category_levels"]
    ok = engines.batch_risk(_batch(levels))
    assert ok.status == "completed" and ok.top_label in ("Low", "Medium", "High") and 0 <= ok.top_score <= 1
    assert ok.output["factors"] and all("contribution" in f for f in ok.output["factors"])
    high = engines.batch_risk(_batch(levels, process_deviation_count=6))
    assert high.top_score > ok.top_score  # strongest global driver moves the score up
    miss = engines.batch_risk({k: v for k, v in _batch(levels).items() if k != "plant_id"})
    assert miss.status == "insufficient_data" and "plant_id" in miss.message
    unk = engines.batch_risk(_batch(levels, plant_id="ABT-PLANT-99"))
    assert unk.status == "completed" and any("plant_id" in w for w in unk.warnings)


def test_model_loading_failure_is_reported(monkeypatch, tmp_path):
    from app.ml import registry as regmod
    real = regmod.build_specs

    def broken():
        specs = real()
        specs["nlp-category"].artifacts = [Path(tmp_path / "missing.joblib"), Path(tmp_path / "missing_enc.joblib")]
        return specs
    monkeypatch.setattr(regmod, "build_specs", broken)
    r = ModelRegistry(); r.load_all(load_sbert=False)
    assert r.get("nlp-category").status == "blocked" and "Missing artifact" in r.get("nlp-category").reason
    assert not r.usable("nlp-category")


def test_invalid_model_output_is_rejected(monkeypatch):
    lm = registry.get("nlp-category")

    class Bad:
        named_steps = lm.obj["model"].named_steps

        def predict_proba(self, X):
            return np.array([[0.9, 0.9] + [0.0] * 8])  # does not sum to 1
    monkeypatch.setitem(lm.obj, "model", Bad())
    r = engines.classify("nlp-category", "hard plastic fragment in pack")
    assert r.status == "error" and r.top_label is None


def test_unavailable_model_returns_error_not_guess(monkeypatch):
    monkeypatch.setattr(registry.get("root-cause"), "status", "blocked")
    r = engines.root_cause(None, "x" * 20, None, "Packaging issue", "Bakery products")
    assert r.status == "error" and r.top_label is None


def test_similarity_unavailable_without_encoder():
    r = engines.similar("plastic fragment in sealed pack")
    if registry.usable("nlp-similarity"):
        assert r.status == "completed" and len(r.output["results"]) == 5
    else:
        assert r.status == "error" and "not available" in r.message
