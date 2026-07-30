"""Business logic for Module 7.5 — Shareholding Pattern.

Reads `shareholding_pattern`, which `ingest/fetch_shareholding.py`
writes with the full 7-category breakdown (Promoter, FII/FPI, DII,
Mutual Funds, Public, Government, Others) where the underlying source
(NSE disclosure, or the yfinance approximation) provides it. Never
invents a value for a category the source didn't report — see that
ingest script's docstring for exactly which categories the fallback
source can and can't populate.

Two read paths:
  - `get_shareholding_trend`: history rows, one per reporting period
    (used by the existing Research page table — unchanged shape, now
    with the same additive optional fields as the schema, in
    fundamental_service.py — this module doesn't duplicate that query).
  - `get_shareholding_summary`: exactly what the brief asked for under
    "Also include" — latest vs. previous reporting quarter, and the
    percentage-point change for each category.
"""
from typing import List, Optional

from sqlalchemy import text

from db.db import engine

CATEGORY_COLUMNS = [
    ("Promoter", "promoter_pct"),
    ("FII/FPI", "fii_pct"),
    ("DII", "dii_pct"),
    ("Mutual Funds", "mutual_funds_pct"),
    ("Public", "public_pct"),
    ("Government", "government_pct"),
    ("Others", "others_pct"),
]

_LATEST_TWO_QUERY = text(
    """
    select quarter, source, promoter_pct, fii_pct, dii_pct, mutual_funds_pct,
           public_pct, government_pct, others_pct
    from shareholding_pattern
    where symbol = :symbol
    order by period_end desc nulls last, quarter desc
    limit 2
    """
)


def get_shareholding_summary(symbol: str) -> dict:
    """GET /company/{symbol}/shareholding (and the embedded
    Company.shareholdingSummary field). Diff (percentage-point change)
    computed here, never on the frontend."""
    with engine.connect() as conn:
        rows = conn.execute(_LATEST_TWO_QUERY, {"symbol": symbol.upper()}).mappings().all()

    latest = rows[0] if len(rows) > 0 else None
    previous = rows[1] if len(rows) > 1 else None

    categories = []
    for label, column in CATEGORY_COLUMNS:
        latest_val = float(latest[column]) if latest and latest[column] is not None else None
        prev_val = float(previous[column]) if previous and previous[column] is not None else None
        change = (
            round(latest_val - prev_val, 4) if latest_val is not None and prev_val is not None else None
        )
        categories.append(
            {"category": label, "latest": latest_val, "previous": prev_val, "changePct": change}
        )

    return {
        "latestQuarter": latest["quarter"] if latest else None,
        "previousQuarter": previous["quarter"] if previous else None,
        "categories": categories,
        "source": latest["source"] if latest else None,
    }
