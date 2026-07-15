"""Business logic for the Research page's Price History section
(Module 3). Reuses `prices_daily` — the same table
ingest/compute_technicals.py already reads to build technical_snapshot —
no new table, no invented OHLC values.
"""
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy import text

from db.db import engine
from schemas.technical import PriceBar

DEFAULT_RANGE = "6M"

# Matches the range vocabulary API_CONTRACT.md's Module 5 spec already
# named (`?range=1M|6M|1Y|5Y`), plus 3M/ALL for a slightly finer picker.
_RANGE_DAYS = {
    "1M": 30,
    "3M": 90,
    "6M": 182,
    "1Y": 365,
    "5Y": 1825,
}

_PRICES_QUERY = text(
    """
    select date, open, high, low, close, volume
    from prices_daily
    where symbol = :symbol
      and (:since is null or date >= :since)
    order by date asc
    """
)


def get_price_history(symbol: str, range_: str = DEFAULT_RANGE) -> List[dict]:
    """GET /company/{symbol}/prices — one query, scoped by an optional
    lookback window. An unrecognized or "ALL" range returns the full
    history for the symbol instead of guessing a window."""
    days: Optional[int] = _RANGE_DAYS.get((range_ or "").upper())
    since = date.today() - timedelta(days=days) if days else None

    with engine.connect() as conn:
        rows = conn.execute(_PRICES_QUERY, {"symbol": symbol.upper(), "since": since}).mappings().all()

    return [
        PriceBar(
            date=row["date"].isoformat(),
            open=row["open"] or 0.0,
            high=row["high"] or 0.0,
            low=row["low"] or 0.0,
            close=row["close"] or 0.0,
            volume=row["volume"] or 0,
        ).model_dump()
        for row in rows
    ]
