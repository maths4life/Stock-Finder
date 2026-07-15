"""Business logic for the Research page's deep-fundamentals sections
(Module 3): Latest Financial Snapshot ("Quarterly Financials" on the
page) and Shareholding, plus the Company Summary text.

These are *history* queries (multiple rows per symbol) — the reason
Module 1 kept them off `CompanyListItem` and out of company_service.py's
fixed 3-query budget in the first place (see API_CONTRACT.md). Every
function here is scoped to a single symbol and called only from
GET /company/{symbol}, so cost stays bounded regardless of universe size.

`financials_quarterly` is the one table that holds both quarterly *and*
annual rows (see ingest/seed_fundamentals.py's docstring — yearly and
quarterly CSVs are merged into the same table, keyed by a `quarter`
string that's sometimes a real quarter label, sometimes a fiscal-year
date). "Latest Financial Snapshot" in the Module 3 spec and "Quarterly
Financials" on the page are the same data — this module doesn't
distinguish annual vs quarterly rows beyond ordering by fiscal_year_end,
since there's no schema flag for it and inventing one would be a schema
change, which Module 3's rules disallow.
"""
from typing import List, Optional

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


def get_business_summary(symbol: str) -> Optional[str]:  # noqa: ARG001 — kept for a stable call signature
    """GET /company/{symbol} 'businessSummary'.

    Known data gap, documented rather than silently faked (same spirit as
    API_CONTRACT.md's Module 1 "Known data gaps" table): `companies` has
    no description/about-the-business column at all (symbol, yahoo_ticker,
    exchange, name, sector, isin, is_active, created_at — see
    db/schema.sql). There is no existing descriptive text to return, and
    Module 3's instructions are explicit that this must return existing
    descriptive information only and must not fabricate one or call an
    LLM. Returns "" until a real source (e.g. a company-profile ingestion
    step) is scoped with the user — same treatment as the empty pros/cons/
    etc. defaults Module 1 shipped with.
    """
    return ""
