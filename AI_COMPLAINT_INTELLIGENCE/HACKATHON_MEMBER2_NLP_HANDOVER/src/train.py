"""Train TF-IDF + Logistic Regression for complaint_category (primary)
and optionally defect_subcategory (secondary). No leaky features are used.
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder

from .config import (
    LABEL_ENCODER_PATH,
    REPORTS_DIR,
    SUBCAT_ENCODER_PATH,
    SUBCAT_MODEL_PATH,
    TARGET_PRIMARY,
    TARGET_SECONDARY,
    TFIDF_MODEL_PATH,
)
from .data_loader import load_complaints
from .preprocess import build_text_series


def _build_pipeline() -> Pipeline:
    return Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.95,
                    max_features=50000,
                    sublinear_tf=True,
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    max_iter=2000,
                    C=4.0,
                    n_jobs=-1,
                    solver="lbfgs",
                    class_weight="balanced",
                ),
            ),
        ]
    )


def _train_one(X_text: pd.Series, y_raw: pd.Series, name: str,
               model_path: Path, enc_path: Path) -> dict:
    mask = y_raw.notna() & (y_raw.astype(str).str.strip() != "")
    X = X_text[mask].reset_index(drop=True)
    y = y_raw[mask].astype(str).reset_index(drop=True)

    enc = LabelEncoder()
    y_enc = enc.fit_transform(y)

    # Stratified split; fall back to non-stratified if a class is too rare
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_enc, test_size=0.2, random_state=42, stratify=y_enc
        )
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_enc, test_size=0.2, random_state=42
        )

    pipe = _build_pipeline()
    pipe.fit(X_train, y_train)

    y_pred = pipe.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1_macro = f1_score(y_test, y_pred, average="macro")
    f1_weighted = f1_score(y_test, y_pred, average="weighted")
    report = classification_report(
        y_test, y_pred, target_names=enc.classes_, zero_division=0
    )
    cm = confusion_matrix(y_test, y_pred).tolist()

    joblib.dump(pipe, model_path)
    joblib.dump(enc, enc_path)

    metrics = {
        "target": name,
        "n_samples": int(len(X)),
        "n_classes": int(len(enc.classes_)),
        "accuracy": float(acc),
        "f1_macro": float(f1_macro),
        "f1_weighted": float(f1_weighted),
        "classes": enc.classes_.tolist(),
        "confusion_matrix": cm,
    }
    (REPORTS_DIR / f"{name}_metrics.json").write_text(
        json.dumps(metrics, indent=2)
    )
    (REPORTS_DIR / f"{name}_classification_report.txt").write_text(report)

    print(f"\n=== {name} ===")
    print(f"samples={len(X)}  classes={len(enc.classes_)}")
    print(f"accuracy={acc:.4f}  f1_macro={f1_macro:.4f}  f1_weighted={f1_weighted:.4f}")
    print(report)
    return metrics


def main() -> None:
    df = load_complaints()
    print(f"Loaded {len(df):,} rows, {df.shape[1]} columns")

    X_text = build_text_series(df)
    empty = (X_text.str.len() == 0).sum()
    if empty:
        print(f"Warning: {empty} rows had empty text after preprocessing")

    _train_one(
        X_text, df[TARGET_PRIMARY], TARGET_PRIMARY,
        TFIDF_MODEL_PATH, LABEL_ENCODER_PATH,
    )

    if TARGET_SECONDARY in df.columns:
        _train_one(
            X_text, df[TARGET_SECONDARY], TARGET_SECONDARY,
            SUBCAT_MODEL_PATH, SUBCAT_ENCODER_PATH,
        )

    print(f"\nSaved models to {TFIDF_MODEL_PATH.parent}")
    print(f"Saved reports to {REPORTS_DIR}")


if __name__ == "__main__":
    main()
