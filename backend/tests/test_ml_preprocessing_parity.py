"""CauseLine's copied preprocessing must produce byte-identical output to the original supplied modules."""
import importlib.util
import sys
import types

import numpy as np
import pandas as pd
import pytest

from app.core.config import get_settings
from app.ml import preprocessing as cl


def _load_pkg(alias: str, src_dir, modules: list[str]):
    """Import an original `src` package under an alias (both supplied packages are named `src`)."""
    pkg = types.ModuleType(alias)
    pkg.__path__ = [str(src_dir)]
    sys.modules[alias] = pkg
    out = {}
    for m in modules:
        spec = importlib.util.spec_from_file_location(f"{alias}.{m}", src_dir / f"{m}.py")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[f"{alias}.{m}"] = mod
        spec.loader.exec_module(mod)
        out[m] = mod
    return out


@pytest.fixture(scope="module")
def originals():
    s = get_settings()
    nlp = _load_pkg("orig_nlp", s.nlp_dir / "src", ["config", "preprocess"])
    ml = _load_pkg("orig_ml", s.ml_dir / "src", ["preprocessing", "root_cause"])
    return nlp, ml


TEXTS = ["Found a piece of SHARP metal inside a sealed bread packet!!", "   ", "", "Café-style  yoghurt\t\tsmelt sour (2x)", None, 12345,
         "Seal integrity concern on pack — leaking"]


def test_clean_text_identical(originals):
    nlp, _ = originals
    for t in TEXTS:
        assert cl.clean_text(t) == nlp["preprocess"].clean_text(t)


def test_combine_text_identical(originals):
    nlp, _ = originals
    rows = [{"complaint_summary": "Possible extraneous material", "complaint_description": "Hard fragment found."},
            {"complaint_summary": None, "complaint_description": " desc only "}, {"complaint_summary": "  ", "complaint_description": ""}]
    for r in rows:
        assert cl.nlp_input_text(r["complaint_summary"], r["complaint_description"]) == nlp["preprocess"].combine_text(r)


def test_root_cause_text_identical(originals):
    _, ml = originals
    df = pd.DataFrame({"complaint_summary": ["A", None, "Seal"], "complaint_description": ["B c", "Desc", None],
                       "defect_subcategory": [None, "Sub", "X"]})
    pd.testing.assert_series_equal(cl.root_cause_text(df), ml["root_cause"]._text(df))


def test_batch_features_identical(originals):
    _, ml = originals
    rng = np.random.default_rng(0)
    n = 20
    df = pd.DataFrame({c: rng.uniform(0, 50, n) for c in cl.NUM})
    df["shelf_life_days"] = [0.0] + list(rng.uniform(1, 30, n - 1))  # exercises the divide-by-zero guard
    for c in cl.CAT:
        df[c] = rng.choice(["a", "b", None], n)
    df["production_date"] = pd.to_datetime("2024-01-01") + pd.to_timedelta(rng.integers(0, 300, n), unit="D")
    df["dispatch_date"] = df["production_date"] + pd.to_timedelta(rng.integers(0, 10, n), unit="D")
    assert cl.NUM == ml["preprocessing"].NUM and cl.CAT == ml["preprocessing"].CAT and cl.DERIVED == ml["preprocessing"].DERIVED
    pd.testing.assert_frame_equal(cl.build_features(df), ml["preprocessing"].build_features(df))
