from pathlib import Path
import pandas as pd
from .config import DATA_DIR, PRIMARY_CSV, DATE_COL

def _find_csv(name: str) -> Path:
    candidates = [DATA_DIR / name, *DATA_DIR.rglob(name)]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(
        f"Could not find {name} under {DATA_DIR}. "
        f"Extract the ZIP into {DATA_DIR} first."
    )

def load_complaints(name: str = PRIMARY_CSV) -> pd.DataFrame:
    path = _find_csv(name)
    df = pd.read_csv(path, low_memory=False)
    if DATE_COL in df.columns:
        df[DATE_COL] = pd.to_datetime(df[DATE_COL], errors="coerce")
    return df
