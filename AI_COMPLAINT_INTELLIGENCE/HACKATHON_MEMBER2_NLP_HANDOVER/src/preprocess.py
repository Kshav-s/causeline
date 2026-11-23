import re
import pandas as pd
from .config import TEXT_COLS

_WS = re.compile(r"\s+")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")

def clean_text(s: str) -> str:
    if not isinstance(s, str):
        return ""
    s = s.lower()
    s = _NON_ALNUM.sub(" ", s)
    s = _WS.sub(" ", s).strip()
    return s

def combine_text(row) -> str:
    parts = []
    for c in TEXT_COLS:
        v = row.get(c)
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
    return " ".join(parts)

def build_text_series(df: pd.DataFrame) -> pd.Series:
    raw = df.apply(combine_text, axis=1)
    return raw.map(clean_text)
