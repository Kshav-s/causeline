import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import numpy as np, pandas as pd, pytest
from src import pareto_analysis as pa, recurrence_detection as rd, capa_analysis as ca, model_evaluation as ev, preprocessing as pp


def test_pareto_vital_few():
    df = pd.DataFrame({"c": ["a"] * 70 + ["b"] * 20 + ["c"] * 10})
    t = pa.pareto_table(df, "c")
    assert t.cum_pct.iloc[-1] == pytest.approx(100) and list(t.vital_few) == [True, True, False]


def test_window_count():
    d = pd.to_datetime(["2024-01-01", "2024-01-20", "2024-02-10", "2025-01-01"])
    assert rd.max_window_count(d, 90) == 3


def test_wilson_bounds():
    lo, hi = ca.wilson(30, 100); assert 0 < lo < 0.3 < hi < 1


def test_tiers_ordering():
    th = ev.tier_thresholds(np.linspace(0, 1, 1000)); t = ev.assign_tier(np.array([0.05, 0.8, 0.95]), th)
    assert list(t) == ["Low", "Medium", "High"]


def test_no_leakage_columns():
    num, cat = pp.feature_lists()
    assert not set(num + cat) & set(pp.LEAKAGE_EXCLUDED)


@pytest.mark.skipif(not any((pathlib.Path(p) / pp.FILES["batches"]).exists() for p in (pp.ROOT / "data", "/mnt/project")), reason="data absent")
def test_batch_dataset_and_split():
    X, y, split, meta = pp.batch_dataset(pp.load("batches"))
    assert set(y.unique()) <= {0, 1} and set(split.unique()) == {"train", "validation", "test"}
    assert meta[split == "train"].production_date.max() < meta[split == "test"].production_date.min()
    assert pp.make_preprocessor().fit_transform(X.head(500)).shape[0] == 500
