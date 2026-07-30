"""Business logic for Module 7 — Quarterly & Annual Financial Statements.

Reads the real multi-period history in `financial_statements` (written by
`ingest/fetch_financial_statements.py`) and returns the Current/Previous/
Difference/Growth% comparison the Research page's Quarterly Comparison
and Annual Comparison tables render. All arithmetic (diff, growth%)
happens here, never on the frontend — same convention as every other
derived-data service in this codebase (see fundamental_service.py's own
docstring for the same rule).

This supersedes the old `fundamental_service.get_quarterly_comparison` /
`get_annual_comparison`, which inferred quarterly-vs-annual by the gap
between two dated rows in `financials_quarterly` — a heuristic that
never actually worked because nothing wrote more than one dated row per
company (see db/schema.sql's `financial_statements` comment block for
the full explanation). `financial_statements` has an explicit
`period_type` column, so no inference is needed here at all.

Both `get_quarterly_comparison` and `get_annual_comparison` return the
exact same shape the frontend already expects (`ComparisonTable` in
schemas/company.py / shared/api/types.ts) — this module is a drop-in
replacement, not a new contract.
"""
from typing import List, Optional, Tuple

from sqlalchemy import text

from db.db import engine

# Metric label -> financial_statements column. Every metric the brief
# asked for now has a real source column (unlike the old
# fundamental_service table, which was missing EBITDA/Operating
# Margin/Cash/Debt entirely) — see db/schema.sql's financial_statements
# table and ingest/fetch_financial_statements.py for exactly how each
# one is sourced or derived.
COMPARISON_METRICS: List[Tuple[str, str]] = [
    ("Revenue", "revenue_cr"),
    ("Net Profit", "net_profit_cr"),
    ("EPS", "eps"),
    ("EBITDA", "ebitda_cr"),
    ("EBITDA Margin", "ebitda_margin_pct"),
    ("Operating Margin", "operating_margin_pct"),
    ("Cash", "cash_cr"),
    ("Debt", "debt_cr"),
    ("Free Cash Flow", "free_cash_flow_cr"),
]

_HISTORY_QUERY = text(
    """
    select period_end, period_label, revenue_cr, net_profit_cr, eps, ebitda_cr,
           ebitda_margin_pct, operating_margin_pct, cash_cr, debt_cr, free_cash_flow_cr
    from financial_statements
    where symbol = :symbol and period_type = :period_type
    order by period_end desc
    limit :limit
    """
)


def _period_rows(symbol: str, period_type: str, limit: int = 2) -> List[dict]:
    with engine.connect() as conn:
        rows = (
            conn.execute(_HISTORY_QUERY, {"symbol": symbol.upper(), "period_type": period_type, "limit": limit})
            .mappings()
            .all()
        )
    return list(rows)


def _metric_row(label: str, column: str, current: Optional[dict], previous: Optional[dict]) -> dict:
    cur_val = float(current[column]) if current and current[column] is not None else None
    prev_val = float(previous[column]) if previous and previous[column] is not None else None
    diff = cur_val - prev_val if cur_val is not None and prev_val is not None else None
    growth = (diff / abs(prev_val)) * 100 if diff is not None and prev_val else None
    return {"metric": label, "current": cur_val, "previous": prev_val, "diff": diff, "growthPct": growth}


def _comparison_table(symbol: str, period_type: str) -> dict:
    rows = _period_rows(symbol, period_type, limit=2)
    current = rows[0] if rows else None
    previous = rows[1] if len(rows) > 1 else None
    return {
        "currentLabel": current["period_label"] if current else None,
        "previousLabel": previous["period_label"] if previous else None,
        "rows": [_metric_row(label, col, current, previous) for label, col in COMPARISON_METRICS],
    }


def get_quarterly_comparison(symbol: str) -> dict:
    """GET /company/{symbol}/quarterly (and the embedded
    Company.quarterlyComparison field) — Current vs Previous Quarter,
    most recent two `period_type='quarterly'` rows for this symbol."""
    return _comparison_table(symbol, "quarterly")


def get_annual_comparison(symbol: str) -> dict:
    """GET /company/{symbol}/annual (and the embedded
    Company.annualComparison field) — Current vs Previous FY, most
    recent two `period_type='annual'` rows for this symbol."""
    return _comparison_table(symbol, "annual")
