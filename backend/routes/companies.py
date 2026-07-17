from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.company import PaginatedCompanies
from services.company_service import get_company_by_symbol
from services.screener_service import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, screen_companies
from services.technical_service import DEFAULT_RANGE, get_price_history

router = APIRouter()


@router.get("/companies", response_model=PaginatedCompanies)
def companies(
    search: Optional[str] = Query(None, description="Match against name or symbol"),
    sector: Optional[str] = Query(None),
    riskLevel: Optional[str] = Query(None, description="Low|Moderate|High|Any"),  # noqa: N803 — matches querystring/CompanyQueryParams casing
    horizon: Optional[str] = Query(None, description="short|medium|long|Any"),
    minRoe: Optional[float] = Query(None),  # noqa: N803
    minRoce: Optional[float] = Query(None),  # noqa: N803
    minEpsGrowth: Optional[float] = Query(None),  # noqa: N803
    minSalesGrowth: Optional[float] = Query(None),  # noqa: N803
    maxPe: Optional[float] = Query(None),  # noqa: N803
    maxDebtToEquity: Optional[float] = Query(None),  # noqa: N803
    minPromoterHolding: Optional[float] = Query(None),  # noqa: N803
    aboveEma200: Optional[bool] = Query(None),  # noqa: N803
    aboveEma50: Optional[bool] = Query(None),  # noqa: N803
    volumeBreakout: Optional[bool] = Query(None),  # noqa: N803
    sort: Optional[str] = Query(None, description="overallScore|fundamentalScore|technicalScore|changePct|marketCapCr|pe|name"),
    sortDirection: str = Query("desc", description="asc|desc"),  # noqa: N803
    page: int = Query(1, ge=1),
    pageSize: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),  # noqa: N803
):
    return screen_companies(
        search=search,
        sector=sector,
        risk_level=riskLevel,
        horizon=horizon,
        min_roe=minRoe,
        min_roce=minRoce,
        min_eps_growth=minEpsGrowth,
        min_sales_growth=minSalesGrowth,
        max_pe=maxPe,
        max_debt_to_equity=maxDebtToEquity,
        min_promoter_holding=minPromoterHolding,
        above_ema_200=aboveEma200,
        above_ema_50=aboveEma50,
        volume_breakout=volumeBreakout,
        sort=sort or "overallScore",
        sort_direction=sortDirection,
        page=page,
        page_size=pageSize,
    )


@router.get("/company/{symbol}")
def company(symbol: str):
    result = get_company_by_symbol(symbol)
    if result is None:
        raise HTTPException(status_code=404, detail=f'No company found for symbol "{symbol}"')
    return result


@router.get("/company/{symbol}/prices")
def company_prices(
    symbol: str,
    range: str = Query(DEFAULT_RANGE, description="1M|3M|6M|1Y|5Y|ALL"),  # noqa: A002 — matches the querystring param name
):
    # Deliberately doesn't 404 on an unknown symbol — prices_daily just
    # has no rows for it, so an empty array is the honest response (same
    # as an unknown symbol never having had any price history). The
    # frontend's chart renders its existing empty state for `[]`.
    return get_price_history(symbol, range)
