"""Small in-process sliding-window rate limiter (single-instance deployments).
For multi-instance production use a shared store (e.g. Redis) - see docs/DEPLOYMENT_GUIDE.md."""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, max_calls: int, per_seconds: int):
        self.max_calls, self.per = max_calls, per_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.per:
                q.popleft()
            if len(q) >= self.max_calls:
                raise HTTPException(429, "Too many requests. Please wait and try again.")
            q.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def __call__(self, request: Request) -> None:
        self.check(f"{request.url.path}:{request.client.host if request.client else 'anon'}")


login_limiter = RateLimiter(max_calls=10, per_seconds=300)
booking_limiter = RateLimiter(max_calls=5, per_seconds=3600)
inference_limiter = RateLimiter(max_calls=120, per_seconds=60)
