"""Metrics, tiers and evaluation plots (matplotlib)."""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score, roc_curve, precision_recall_curve)
from sklearn.calibration import calibration_curve
from .preprocessing import OUT

VIZ = OUT / "visualizations"


def best_f1_threshold(y, p):
    pr, rc, th = precision_recall_curve(y, p)
    f1 = 2 * pr[:-1] * rc[:-1] / np.clip(pr[:-1] + rc[:-1], 1e-12, None)
    return float(th[np.argmax(f1)])


def tier_thresholds(p_val, high_q=0.90, med_q=0.70):
    return {"medium": float(np.quantile(p_val, med_q)), "high": float(np.quantile(p_val, high_q))}


def assign_tier(p, th):
    return np.where(p >= th["high"], "High", np.where(p >= th["medium"], "Medium", "Low"))


def metrics(y, p, thr):
    yhat = (p >= thr).astype(int)
    return {"n": int(len(y)), "prevalence": round(float(np.mean(y)), 4), "threshold": round(thr, 4),
            "roc_auc": round(roc_auc_score(y, p), 4), "pr_auc": round(average_precision_score(y, p), 4),
            "precision": round(precision_score(y, yhat, zero_division=0), 4), "recall": round(recall_score(y, yhat), 4),
            "f1": round(f1_score(y, yhat), 4), "brier": round(brier_score_loss(y, np.clip(p, 0, 1)), 4),
            "confusion_matrix [[TN,FP],[FN,TP]]": confusion_matrix(y, yhat).tolist()}


def bootstrap_auc(y, p, n=200, seed=42):
    rng = np.random.default_rng(seed); y = np.asarray(y); p = np.asarray(p); a = []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if y[i].min() != y[i].max():
            a.append(roc_auc_score(y[i], p[i]))
    return [round(float(np.percentile(a, 2.5)), 4), round(float(np.percentile(a, 97.5)), 4)]


def tier_table(y, tiers):
    base = float(np.mean(y)); rows = []
    for t in ("High", "Medium", "Low"):
        m = tiers == t
        r = float(np.mean(np.asarray(y)[m])) if m.sum() else float("nan")
        rows.append({"tier": t, "batches": int(m.sum()), "share_pct": round(100 * m.mean(), 1), "complaints": int(np.asarray(y)[m].sum()),
                     "observed_complaint_rate": round(r, 4), "lift_vs_base": round(r / base, 2) if base else None,
                     "share_of_all_complaints_pct": round(100 * np.asarray(y)[m].sum() / max(np.sum(y), 1), 1)})
    return rows


def plots(y, p, thr, name):
    fig, ax = plt.subplots(1, 4, figsize=(20, 4.5))
    fpr, tpr, _ = roc_curve(y, p); ax[0].plot(fpr, tpr); ax[0].plot([0, 1], [0, 1], "--", c="grey")
    ax[0].set(title=f"ROC (AUC={roc_auc_score(y, p):.3f})", xlabel="FPR", ylabel="TPR")
    pr, rc, _ = precision_recall_curve(y, p); ax[1].plot(rc, pr); ax[1].axhline(np.mean(y), ls="--", c="grey")
    ax[1].set(title=f"PR (AP={average_precision_score(y, p):.3f})", xlabel="Recall", ylabel="Precision")
    cm = confusion_matrix(y, (p >= thr).astype(int)); ax[2].imshow(cm, cmap="Blues")
    for (i, j), v in np.ndenumerate(cm): ax[2].text(j, i, v, ha="center", va="center")
    ax[2].set(title="Confusion matrix (test)", xticks=[0, 1], yticks=[0, 1], xlabel="Predicted", ylabel="Actual")
    fp, mp = calibration_curve(y, np.clip(p, 0, 1), n_bins=10, strategy="quantile"); ax[3].plot(mp, fp, "o-"); ax[3].plot([0, 1], [0, 1], "--", c="grey")
    ax[3].set(title="Calibration", xlabel="Mean predicted", ylabel="Observed")
    fig.suptitle(f"{name} - hold-out test set"); fig.tight_layout(); fig.savefig(VIZ / "model_evaluation.png", dpi=110); plt.close(fig)
