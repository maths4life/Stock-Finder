"""Shared resilience helpers for ingestion scripts (Module 8: Expand
Universe).

At ~100 companies, a plain sequential `for company in UNIVERSE: fetch();
time.sleep(1.5)` loop (the pattern every ingest script used before this
module) finishes in a few minutes and a single flaky request just fails
that one company. At ~500 companies the same loop takes 4-5x longer,
and — more importantly — a transient failure (a dropped connection, a
momentary Yahoo rate-limit, a DNS hiccup) becomes far more likely to hit
*some* company on *every* run, so "retry transient failures" and
"continue after failures" stop being nice-to-haves.

This module provides exactly two things, kept deliberately small so
every ingest script can adopt them without a rewrite:

- `retry(...)`: a decorator with exponential backoff, for a *single*
  fetch call. Retries only truly-transient exceptions the caller
  specifies (default: everything, since yfinance/NSE don't expose a
  typed exception hierarchy to distinguish "rate limited, try again"
  from "this ticker doesn't exist" — a bad ticker fails all `times`
  attempts and is reported as a normal per-symbol failure, which is
  the correct outcome either way).
- `ConcurrentRunner`: bounded-concurrency + rate-limited fan-out over a
  list of items (companies), reusing a `ThreadPoolExecutor` (fine here
  since every call site is I/O-bound network + a short DB upsert, not
  CPU-bound work) with a minimum delay between *submissions* so the
  aggregate request rate to Yahoo/NSE stays polite regardless of
  `max_workers`. Never raises on a per-item failure — collects it and
  keeps going, per the brief's "pipeline should continue after
  failures" requirement.

Every ingest script keeps its own retry/failure logging detail (what to
print, which exceptions are worth a retry vs. an immediate skip); this
module only owns the generic retry-loop and thread-pool mechanics.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from functools import wraps
from typing import Callable, Generic, List, Optional, Tuple, TypeVar

logger = logging.getLogger("ingest.resilience")

T = TypeVar("T")
R = TypeVar("R")


def retry(times: int = 3, base_delay_seconds: float = 2.0, exceptions: tuple = (Exception,)):
    """Exponential backoff: base_delay * 2^attempt between tries, e.g.
    2s / 4s / 8s for the default times=3. Re-raises the last exception
    if every attempt fails, so the caller's own per-item error handling
    (ConcurrentRunner, or a script's own try/except) still sees it."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(times):
                try:
                    return fn(*args, **kwargs)
                except exceptions as exc:  # noqa: BLE001 — intentionally broad, see module docstring
                    last_exc = exc
                    if attempt < times - 1:
                        delay = base_delay_seconds * (2**attempt)
                        logger.debug("retry %d/%d after %.1fs: %s", attempt + 1, times, delay, exc)
                        time.sleep(delay)
            raise last_exc

        return wrapper

    return decorator


@dataclass
class RunSummary(Generic[T]):
    n_ok: int = 0
    n_failed: int = 0
    failed_keys: List[str] = field(default_factory=list)


class PipelineFailureError(RuntimeError):
    """Raised when a run's failure rate is too high to trust its output --
    distinguishes 'a handful of flaky symbols failed' (normal, tolerated,
    per this module's own docstring) from 'the whole run is broken'
    (rate-limited, expired credentials, upstream API/site down), which
    must fail the calling script (and therefore the GitHub Actions step)
    loudly instead of letting downstream stages compute from mostly-empty
    data while the workflow still reports success.

    Weekly-refresh addition -- see .github/workflows/ingest.yml and
    DATA_STRATEGY.md/HANDOFF.md's "failure handling" notes. Does not
    change retry()/ConcurrentRunner's own per-item behavior at all;
    every ingest script still keeps going through individual symbol
    failures exactly as before, and only refuses to report an
    apparently-successful exit code when the *aggregate* result isn't
    trustworthy."""


def assert_healthy(summary: "RunSummary", label: str, max_failure_rate: float = 0.5) -> None:
    """Call after a ConcurrentRunner.run() completes. Raises
    PipelineFailureError (uncaught -> non-zero process exit -> the
    GitHub Actions step is marked failed) if:
      - at least one item was attempted, and every single one failed, or
      - the failure rate exceeds `max_failure_rate` (default 50%).

    A handful of per-symbol failures (a delisted ticker, one transient
    timeout that survived all retries) is normal and does not trip this
    -- only a run whose result is mostly-or-entirely failures does."""
    total = summary.n_ok + summary.n_failed
    if total == 0:
        return
    if summary.n_ok == 0:
        raise PipelineFailureError(
            f"{label}: 0/{total} succeeded -- refusing to treat this as a "
            f"successful run. Downstream stages would otherwise compute "
            f"from stale/missing data while the workflow still reports "
            f"success. Failed: {', '.join(summary.failed_keys[:10])}"
            f"{'...' if len(summary.failed_keys) > 10 else ''}"
        )
    failure_rate = summary.n_failed / total
    if failure_rate > max_failure_rate:
        raise PipelineFailureError(
            f"{label}: {summary.n_failed}/{total} ({failure_rate:.0%}) failed, "
            f"exceeding the {max_failure_rate:.0%} threshold -- refusing to "
            f"treat this as a successful run. Failed: "
            f"{', '.join(summary.failed_keys[:10])}"
            f"{'...' if len(summary.failed_keys) > 10 else ''}"
        )


class _RateLimiter:
    """Ensures at least `delay_seconds` between successive submissions,
    shared across all worker threads — i.e. the aggregate request rate
    is bounded to ~1/delay_seconds regardless of max_workers, which is
    what "respect API limits" actually requires (limiting worker count
    alone does not bound the request *rate* if each request is fast)."""

    def __init__(self, delay_seconds: float):
        self._delay = delay_seconds
        self._lock = threading.Lock()
        self._next_ok_at = 0.0

    def wait(self):
        with self._lock:
            now = time.monotonic()
            sleep_for = max(0.0, self._next_ok_at - now)
            self._next_ok_at = max(now, self._next_ok_at) + self._delay
        if sleep_for:
            time.sleep(sleep_for)


class ConcurrentRunner(Generic[T, R]):
    """Bounded-concurrency fan-out with a shared rate limiter and
    per-item failure isolation.

    Usage:
        runner = ConcurrentRunner(max_workers=4, delay_seconds=1.5)
        summary = runner.run(
            items=companies,
            fn=lambda company: fetch_something(company),
            on_result=lambda company, result, error: ...,
            key=lambda company: company["symbol"],   # for failure logging
        )
    """

    def __init__(self, max_workers: int = 4, delay_seconds: float = 1.5):
        self.max_workers = max_workers
        self.rate_limiter = _RateLimiter(delay_seconds)

    def run(
        self,
        items: List[T],
        fn: Callable[[T], R],
        on_result: Optional[Callable[[T, Optional[R], Optional[BaseException]], None]] = None,
        key: Optional[Callable[[T], str]] = None,
    ) -> RunSummary:
        key = key or (lambda item: item.get("symbol", str(item)) if isinstance(item, dict) else str(item))
        summary: RunSummary = RunSummary()

        def _call(item: T) -> Tuple[T, Optional[R], Optional[BaseException]]:
            self.rate_limiter.wait()
            try:
                return item, fn(item), None
            except BaseException as exc:  # noqa: BLE001 — isolate this item's failure from the rest of the run
                return item, None, exc

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = [pool.submit(_call, item) for item in items]
            for future in as_completed(futures):
                item, result, error = future.result()
                if error is None:
                    summary.n_ok += 1
                else:
                    summary.n_failed += 1
                    summary.failed_keys.append(key(item))
                if on_result is not None:
                    on_result(item, result, error)

        return summary
