"""Business logic for the Research page's deep-fundamentals sections
(Module 3): Latest Financial Snapshot ("Quarterly Financials" on the
page) and Shareholding, plus the Quarterly/Annual Financial Comparison
tables added for the Bloomberg/TIKR-style redesign.

These are *history* queries (multiple rows per symbol) — the reason
Module 1 kept them off `CompanyListItem` and out of company_service.py's
fixed 3-query budget in the first place (see API_CONTRACT.md). Every
function here is scoped to a single symbol and called only from
GET /company/{symbol}, so cost stays bounded regardless of universe size.

`financials_quarterly` is the one table that holds both quarterly *and*
annual rows (see ingest/seed_fundamentals.py's docstring — yearly and
quarterly CSVs are merged into the same table, keyed by a `quarter`
string that's sometimes a real quarter label, sometimes a fiscal-year
date). There's no schema column flagging which rows are quarterly vs.
annual, so `_classify_periods` below infers it from the spacing between
each company's reported dates — documented there, and again in the
handoff summary, as an assumption to verify once this runs against real
data rather than a guaranteed-correct read of a labeled field.

`get_business_summary` (businessSummary field) was removed along with
the Research page's "Business Summary" section — it always returned ""
(the schema has no description column at all; see the removed
function's own docstring, preserved in git history) and had no other
caller.
"""
from typing import Dict, List, Optional, Tuple

from sqlalchemy import bindparam, text

from db.db import engine
from schemas.company import QuarterlyFinancial, ShareholdingRow

QUARTERLY_HISTORY_LIMIT = 4
SHAREHOLDING_HISTORY_LIMIT = 4

# 'latest' / 'TTM' are point-in-time snapshot rows written by
# seed_fundamentals.py, not a reporting period — company_service.py's
# BASE_QUERY reads the 'latest' row directly for current-snapshot fields
# (pe, roe, ...), but the *history* views below exclude both so a
# snapshot row never gets rendered as if it were a quarter.
_EXCLUDED_PERIODS = ("latest", "TTM")

_QUARTERLY_HISTORY_QUERY = text(
    """
    select quarter, revenue_cr, net_profit_cr, ebitda_margin_pct
    from financials_quarterly
    where symbol = :symbol
      and quarter not in :excluded
    order by fiscal_year_end desc nulls last, quarter desc
    limit :limit
    """
).bindparams(bindparam("excluded", expanding=True))

_SHAREHOLDING_HISTORY_QUERY = text(
    """
    select quarter, promoter_pct, fii_pct, dii_pct, public_pct
    from shareholding_pattern
    where symbol = :symbol
      and quarter not in :excluded
    order by quarter desc
    limit :limit
    """
).bindparams(bindparam("excluded", expanding=True))


def get_quarterly_financials(symbol: str, limit: int = QUARTERLY_HISTORY_LIMIT) -> List[dict]:
    """GET /company/{symbol} 'quarterlyFinancials' — one query, real
    revenue/net-profit/EBITDA-margin history from financials_quarterly.
    No calculation invented: values are read straight off the columns
    ingest/seed_fundamentals.py already writes."""
    with engine.connect() as conn:
        rows = (
            conn.execute(
                _QUARTERLY_HISTORY_QUERY,
                {"symbol": symbol.upper(), "excluded": list(_EXCLUDED_PERIODS), "limit": limit},
            )
            .mappings()
            .all()
        )

    return [
        QuarterlyFinancial(
            quarter=row["quarter"],
            revenueCr=row["revenue_cr"] or 0.0,
            netProfitCr=row["net_profit_cr"] or 0.0,
            ebitdaMarginPct=row["ebitda_margin_pct"] or 0.0,
        ).model_dump()
        for row in rows
    ]


def get_shareholding_trend(symbol: str, limit: int = SHAREHOLDING_HISTORY_LIMIT) -> List[dict]:
    """GET /company/{symbol} 'shareholdingTrend' — one query over
    shareholding_pattern history."""
    with engine.connect() as conn:
        rows = (
            conn.execute(
                _SHAREHOLDING_HISTORY_QUERY,
                {"symbol": symbol.upper(), "excluded": list(_EXCLUDED_PERIODS), "limit": limit},
            )
            .mappings()
            .all()
        )

    results = []
    for row in rows:
        promoter = row["promoter_pct"] or 0.0
        fii = row["fii_pct"] or 0.0
        dii = row["dii_pct"] or 0.0
        public = row["public_pct"]
        if public is None:
            # seed_fundamentals.py sometimes leaves public_pct null; derive
            # it from the other three rather than showing a fabricated
            # number as if it were sourced from the CSV.
            public = max(0.0, 100.0 - promoter - fii - dii)
        results.append(
            ShareholdingRow(quarter=row["quarter"], promoter=promoter, fii=fii, dii=dii, public=public).model_dump()
        )
    return results



# ---------------------------------------------------------------------------
# Quarterly / Annual Financial Comparison tables (Bloomberg/TIKR redesign)
# ---------------------------------------------------------------------------
# Reuses the same financials_quarterly history the "Quarterly Financials"
# section above already reads — no new table, no new ingest step. Every
# metric that has no column anywhere in financials_quarterly (Cash, Debt,
# Operating Cash Flow, Equity, and the absolute EBITDA/Operating Margin
# figures the page spec asked for, which the schema only has as an
# approximate margin %, not an absolute value) is left as None end-to-end
# so the frontend renders N/A rather than a fabricated number — see
# HANDOFF summary for the full list of what's real vs. N/A here.

_FULL_HISTORY_QUERY = text(
    """
    select quarter, fiscal_year_end, revenue_cr, net_profit_cr, eps,
           ebitda_margin_pct, roce_pct, roe_pct, free_cash_flow_cr
    from financials_quarterly
    where symbol = :symbol
      and quarter not in :excluded
      and fiscal_year_end is not null
    order by fiscal_year_end desc
    """
).bindparams(bindparam("excluded", expanding=True))

# Metric label -> financials_quarterly column, or None when no source
# column exists anywhere in the schema for that metric (comment block
# above explains why those stay None rather than being invented).
QUARTERLY_COMPARISON_METRICS: List[Tuple[str, Optional[str]]] = [
    ("Revenue", "revenue_cr"),
    ("Net Profit", "net_profit_cr"),
    ("EPS", "eps"),
    ("EBITDA", None),
    ("EBITDA Margin", "ebitda_margin_pct"),
    ("Operating Margin", None),
    ("Cash", None),
    ("Debt", None),
    ("Free Cash Flow", "free_cash_flow_cr"),
]

ANNUAL_COMPARISON_METRICS: List[Tuple[str, Optional[str]]] = [
    ("Revenue", "revenue_cr"),
    ("Net Profit", "net_profit_cr"),
    ("EPS", "eps"),
    ("ROE", "roe_pct"),
    ("ROCE", "roce_pct"),
    ("Operating Cash Flow", None),
    ("Free Cash Flow", "free_cash_flow_cr"),
    ("Debt", None),
    ("Equity", None),
]

# A gap this small between two of a company's reported periods reads as
# quarterly cadence; a gap this large reads as annual. Anything in
# between is left unclassified (excluded from both tables) rather than
# guessed.
_QUARTERLY_GAP_MAX_DAYS = 120
_ANNUAL_GAP_MIN_DAYS = 250


def _period_rows(symbol: str) -> List[dict]:
    with engine.connect() as conn:
        rows = (
            conn.execute(
                _FULL_HISTORY_QUERY,
                {"symbol": symbol.upper(), "excluded": list(_EXCLUDED_PERIODS)},
            )
            .mappings()
            .all()
        )
    return list(rows)


def _classify_periods(rows: List[dict]) -> Tuple[List[dict], List[dict]]:
    """Splits merged financials_quarterly history into (quarterly_rows,
    annual_rows), newest first, using the gap to each row's nearest
    neighbor by fiscal_year_end. See module docstring — this is an
    inferred split, not a read of a labeled column, because no such
    column exists."""
    dated = sorted(rows, key=lambda r: r["fiscal_year_end"], reverse=True)
    quarterly: List[dict] = []
    annual: List[dict] = []
    for i, row in enumerate(dated):
        gaps = []
        if i > 0:
            gaps.append(abs((dated[i - 1]["fiscal_year_end"] - row["fiscal_year_end"]).days))
        if i < len(dated) - 1:
            gaps.append(abs((row["fiscal_year_end"] - dated[i + 1]["fiscal_year_end"]).days))
        gap = min(gaps) if gaps else None
        if gap is not None and gap <= _QUARTERLY_GAP_MAX_DAYS:
            quarterly.append(row)
        elif gap is not None and gap >= _ANNUAL_GAP_MIN_DAYS:
            annual.append(row)
        # else: ambiguous spacing — excluded from both tables rather than guessed.
    return quarterly, annual


def _metric_row(label: str, column: Optional[str], current: Optional[dict], previous: Optional[dict]) -> dict:
    if column is None:
        return {"metric": label, "current": None, "previous": None, "diff": None, "growthPct": None}

    cur_val = float(current[column]) if current and current[column] is not None else None
    prev_val = float(previous[column]) if previous and previous[column] is not None else None
    diff = cur_val - prev_val if cur_val is not None and prev_val is not None else None
    growth = (diff / abs(prev_val)) * 100 if diff is not None and prev_val else None
    return {"metric": label, "current": cur_val, "previous": prev_val, "diff": diff, "growthPct": growth}


def _comparison_table(period_rows: List[dict], metrics: List[Tuple[str, Optional[str]]]) -> dict:
    current = period_rows[0] if len(period_rows) > 0 else None
    previous = period_rows[1] if len(period_rows) > 1 else None
    return {
        "currentLabel": current["quarter"] if current else None,
        "previousLabel": previous["quarter"] if previous else None,
        "rows": [_metric_row(label, col, current, previous) for label, col in metrics],
    }


def get_quarterly_comparison(symbol: str) -> dict:
    """GET /company/{symbol} 'quarterlyComparison' — Current vs Previous
    Quarter. One query (shared with get_annual_comparison via
    _period_rows); Diff/Growth% computed here, not on the frontend, per
    ENGINEERING_GUIDE.md §7."""
    quarterly, _ = _classify_periods(_period_rows(symbol))
    return _comparison_table(quarterly, QUARTERLY_COMPARISON_METRICS)


def get_annual_comparison(symbol: str) -> dict:
    """GET /company/{symbol} 'annualComparison' — Current vs Previous FY.
    Same data source and query as get_quarterly_comparison, filtered to
    the annual-cadence rows instead."""
    _, annual = _classify_periods(_period_rows(symbol))
    return _comparison_table(annual, ANNUAL_COMPARISON_METRICS)
