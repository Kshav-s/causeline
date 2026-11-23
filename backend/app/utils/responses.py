import json
import math
from typing import Any

import numpy as np
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def _clean(o: Any) -> Any:
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    return o


class SafeJSONResponse(JSONResponse):
    """Missing analytic values (pandas NaN/NaT, numpy scalars) are emitted as JSON null instead of failing."""

    def render(self, content: Any) -> bytes:
        enc = jsonable_encoder(content, custom_encoder={np.integer: int, np.floating: float, np.bool_: bool})
        return json.dumps(_clean(enc), ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
