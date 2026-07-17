"""Business logic for the Screener module (Module 4).

Architectural decision (see API_CONTRACT.md / MODULE_4_REPORT.md): the spec
originally called for a standalone `POST /screener` endpoint. By the time
this module was built, both `research.tsx` and `screener.tsx` were already
wired against `GET /companies` + `useCompanies(CompanyQueryParams)`,
expecting a `Paginated<Company>` envelope. Forking a second endpoint would
mean filtering/sorting/pagination logic living in two places for the same
resource. Instead, this module extends `GET /companies` in place — one
endpoint, one response shape, no duplicate implementations.

Layering stays API -> Service -> (Repository) -> Database:
- routes/companies.py parses query params and calls `screen_companies`.
- This file owns filtering, sorting, and pagination — the Module 4
  business logic. It does not touch SQL directly; it reuses
  `company_service.get_all_companies`, which already does the one
  search-scoped DB round trip (see that module's scalability notes).
- `scoring_service.py` (Module 1) remains the single source of truth for
  riskLevel / expectedReturnPct / investmentHorizonMonths — this module
  filters on those fields, it doesn't recompute them.

Scalability note: filtering/sorting happens in Python over the full
matching universe (bounded by SCREENER_UNIVERSE_LIMIT), not in SQL. That's
the right tradeoff at today's universe size (see README.md) — several of
the filter fields (riskLevel, horizon bucket, volumeBreakout) are derived
in Python by `company_service._company_fields`, not raw columns, so
pushing filtering into SQL would mean duplicating that derivation logic
in two languages. If the universe grows into the thousands, the derived
fields should move into SQL (or materialized columns) and this function's
filtering should move into the WHERE clause instead.
"""
import math
from typing import Dict, List, Optional

from services.company_service import get_all_companies

# Large enough to cover the whole universe in one shot at today's scale
# (see README.md); revisit per this module's scalability note above if
# the company count grows substantially.
SCREENER_UNIVERSE_LIMIT = 2000

VALID_SORT_FIELDS = {
    "overallScore",
    "fundamentalScore",
    "technicalScore",
    "changePct",
    "marketCapCr",
    "pe",
    "name",
}

DEFAULT_SORT = "overallScore"
DEFAULT_PAGE_SIZE = 20
# Bounded by SCREENER_UNIVERSE_LIMIT, not an arbitrary small UI page size —
# fetchAllCompanies() (dropdowns, symbol lookups) legitimately asks for
# pageSize=1000 to get the whole universe in one page.
MAX_PAGE_SIZE = SCREENER_UNIVERSE_LIMIT


def _horizon_matches(horizon: str, months: int) -> bool:
    if horizon == "short":
        return months <= 6
    if horizon == "medium":
        return 6 < months <= 12
    if horizon == "long":
        return months > 12
    return True


def _matches(
    c: Dict,
    sector: Optional[str],
    risk_level: Optional[str],
    horizon: Optional[str],
    min_roe: Optional[float],
    min_roce: Optional[float],
    min_eps_growth: Optional[float],
    min_sales_growth: Optional[float],
    max_pe: Optional[float],
    max_debt_to_equity: Optional[float],
    min_promoter_holding: Optional[float],
    above_ema_200: Optional[bool],
    above_ema_50: Optional[bool],
    volume_breakout: Optional[bool],
) -> bool:
    if sector and sector != "All" and c["sector"] != sector:
        return False
    if risk_level and risk_level != "Any" and c["riskLevel"] != risk_level:
        return False
    if horizon and horizon != "Any" and not _horizon_matches(horizon, c["investmentHorizonMonths"]):
        return False
    if min_roe is not None and c["roe"] < min_roe:
        return False
    if min_roce is not None and c["roce"] < min_roce:
        return False
    if min_eps_growth is not None and c["epsGrowthPct"] < min_eps_growth:
        return False
    if min_sales_growth is not None and c["salesGrowthPct"] < min_sales_growth:
        return False
    if max_pe is not None and c["pe"] > max_pe:
        return False
    if max_debt_to_equity is not None and c["debtToEquity"] > max_debt_to_equity:
        return False
    if min_promoter_holding is not None and c["promoterHoldingPct"] < min_promoter_holding:
        return False
    if above_ema_200 and not c["aboveEma200"]:
        return False
    if above_ema_50 and not c["aboveEma50"]:
        return False
    if volume_breakout and not c["volumeBreakout"]:
        return False
    return True


def screen_companies(
    search: Optional[str] = None,
    sector: Optional[str] = None,
    risk_level: Optional[str] = None,
    horizon: Optional[str] = None,
    min_roe: Optional[float] = None,
    min_roce: Optional[float] = None,
    min_eps_growth: Optional[float] = None,
    min_sales_growth: Optional[float] = None,
    max_pe: Optional[float] = None,
    max_debt_to_equity: Optional[float] = None,
    min_promoter_holding: Optional[float] = None,
    above_ema_200: Optional[bool] = None,
    above_ema_50: Optional[bool] = None,
    volume_breakout: Optional[bool] = None,
    sort: str = DEFAULT_SORT,
    sort_direction: str = "desc",
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Dict:
    """GET /companies' full implementation once filters/sort/page are
    present. Returns a `Paginated<CompanyListItem>`-shaped dict — see
    frontend/src/shared/api/types.ts's `Paginated<T>`."""
    universe = get_all_companies(search=search, limit=SCREENER_UNIVERSE_LIMIT)

    filtered = [
        c
        for c in universe
        if _matches(
            c,
            sector=sector,
            risk_level=risk_level,
            horizon=horizon,
            min_roe=min_roe,
            min_roce=min_roce,
            min_eps_growth=min_eps_growth,
            min_sales_growth=min_sales_growth,
            max_pe=max_pe,
            max_debt_to_equity=max_debt_to_equity,
            min_promoter_holding=min_promoter_holding,
            above_ema_200=above_ema_200,
            above_ema_50=above_ema_50,
            volume_breakout=volume_breakout,
        )
    ]

    sort_field = sort if sort in VALID_SORT_FIELDS else DEFAULT_SORT
    # "name" desc would read Z->A, which no caller wants (the one UI that
    # exposes a name sort labels it "Name (A-Z)" and always means
    # ascending) — every other field's desc genuinely means "highest
    # first", so only name is pinned.
    reverse = False if sort_field == "name" else sort_direction != "asc"
    filtered.sort(key=lambda c: c[sort_field], reverse=reverse)

    total = len(filtered)
    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    total_pages = math.ceil(total / page_size) if total else 0

    start = (page - 1) * page_size
    items = filtered[start : start + page_size]

    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
    }
