"""Read-only data lookups for the Module 6 analysis engine.

These are additive, not replacements: services/company_service.py's
BASE_QUERY deliberately does not select every column on
technical_snapshot / shareholding_pattern (it only pulls what Modules
1-5 render). Module 6 needs a few more real, already-stored columns
(ma20/ma50/ma200/vwap/high_52w/low_52w, pledge_pct) — this module reads
them with small, single-purpose queries rather than widening
company_service's shared BASE_QUERY (which every other endpoint also
pays for).

No table or column here is new — everything already exists in
db/schema.sql.
"""
from typing import Dict, List, Optional

from sqlalchemy import text

from db.db import engine

_EXTENDED_TECHNICALS_QUERY = text(
    """
    select ma20, ma50, ma200, vwap, high_52w, low_52w
    from technical_snapshot
    where symbol = :symbol
    """
)

_LATEST_PLEDGE_QUERY = text(
    """
    select pledge_pct
    from shareholding_pattern
    where symbol = :symbol and pledge_pct is not null
    order by quarter desc
    limit 1
    """
)


def get_extended_technicals(symbol: str) -> Dict[str, Optional[float]]:
    """ma20/ma50/ma200/vwap/high_52w/low_52w — stored on
    technical_snapshot by ingest/compute_technicals.py but not selected
    by company_service.BASE_QUERY. One query, scoped to one symbol."""
    with engine.connect() as conn:
        row = conn.execute(_EXTENDED_TECHNICALS_QUERY, {"symbol": symbol.upper()}).mappings().first()

    if row is None:
        return {"ma20": None, "ma50": None, "ma200": None, "vwap": None, "high52w": None, "low52w": None}

    return {
        "ma20": float(row["ma20"]) if row["ma20"] is not None else None,
        "ma50": float(row["ma50"]) if row["ma50"] is not None else None,
        "ma200": float(row["ma200"]) if row["ma200"] is not None else None,
        "vwap": float(row["vwap"]) if row["vwap"] is not None else None,
        "high52w": float(row["high_52w"]) if row["high_52w"] is not None else None,
        "low52w": float(row["low_52w"]) if row["low_52w"] is not None else None,
    }


def get_latest_pledge_pct(symbol: str) -> Optional[float]:
    """Latest non-null pledge_pct from shareholding_pattern. The column
    exists in the schema but no route currently exposes it — real data,
    just previously unused."""
    with engine.connect() as conn:
        row = conn.execute(_LATEST_PLEDGE_QUERY, {"symbol": symbol.upper()}).mappings().first()
    if row is None or row["pledge_pct"] is None:
        return None
    return float(row["pledge_pct"])


def promoter_trend(shareholding_trend: List[dict]) -> Dict[str, Optional[float]]:
    """Direction of promoter holding change, derived from the
    `shareholdingTrend` list services/fundamental_service.py already
    builds (ordered most-recent-quarter-first). Pure function, no I/O —
    reuses data the caller already fetched instead of issuing a new
    query.

    Returns {"direction": "increasing"|"decreasing"|"flat"|None,
             "latest": float|None, "previous": float|None}.
    """
    if len(shareholding_trend) < 2:
        return {"direction": None, "latest": None, "previous": None}

    latest = shareholding_trend[0]["promoter"]
    previous = shareholding_trend[1]["promoter"]

    if latest is None or previous is None:
        return {"direction": None, "latest": latest, "previous": previous}

    delta = round(latest - previous, 2)
    if delta > 0.25:
        direction = "increasing"
    elif delta < -0.25:
        direction = "decreasing"
    else:
        direction = "flat"

    return {"direction": direction, "latest": latest, "previous": previous}
