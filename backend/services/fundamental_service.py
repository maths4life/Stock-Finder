"""Business logic for the Research page's deep-fundamentals sections
(Module 3): Latest Financial Snapshot ("Quarterly Financials" on the
page) and Shareholding.

The Quarterly/Annual Financial Comparison tables that used to live in
this file moved to services/financial_statements_service.py (Module 7)
— see that module's docstring, and the `financial_statements` table's
comment block in db/schema.sql, for why: this file's old approach
inferred quarterly-vs-annual from the spacing between dated rows in
`financials_quarterly`, which never actually worked because nothing
wrote more than one dated row per company. `get_quarterly_comparison`/
`get_annual_comparison` are re-exported at the bottom of this file so
existing callers don't need to change their import.

These are *history* queries (multiple rows per symbol) — the reason
Module 1 kept them off `CompanyListItem` and out of company_service.py's
fixed 3-query budget in the first place (see API_CONTRACT.md). Every
function here is scoped to a single symbol and called only from
GET /company/{symbol}, so cost stays bounded regardless of universe size.

`get_business_summary` (businessSummary field) was removed along with
the Research page's "Business Summary" section — it always returned ""
(the schema has no description column at all; see the removed
function's own docstring, preserved in git history) and had no other
caller.
"""
from typing import List

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
    select quarter, promoter_pct, fii_pct, dii_pct, public_pct,
           mutual_funds_pct, government_pct, others_pct
    from shareholding_pattern
    where symbol = :symbol
      and quarter not in :excluded
    order by period_end desc nulls last, quarter desc
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
            ShareholdingRow(
                quarter=row["quarter"],
                promoter=promoter,
                fii=fii,
                dii=dii,
                public=public,
                mutualFunds=row["mutual_funds_pct"],
                government=row["government_pct"],
                others=row["others_pct"],
            ).model_dump()
        )
    return results



# ---------------------------------------------------------------------------
# Quarterly / Annual Financial Comparison tables (Module 7)
# ---------------------------------------------------------------------------
# Moved to services/financial_statements_service.py, which reads the new
# `financial_statements` history table (real period_type='quarterly'/
# 'annual' rows from ingest/fetch_financial_statements.py) instead of
# inferring quarterly-vs-annual from row spacing in financials_quarterly
# — see that table's comment block in db/schema.sql for why the old
# gap-classification approach here (kept in git history) never actually
# populated real data. Re-exported below so existing callers
# (services/company_service.py) don't need to change their import.
from services.financial_statements_service import (  # noqa: E402
    get_annual_comparison,
    get_quarterly_comparison,
)
