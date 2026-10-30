"""Tiny in-memory sliding-window rate limiter (per process).

Good enough for a single server. With several workers or servers, each keeps its own
counts, so move this to Redis (or a gateway rule) if you scale out.
"""
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: int) -> bool:
        """Record a hit and return True if it is within the limit."""
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()
