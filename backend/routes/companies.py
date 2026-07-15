from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from services.company_service import get_all_companies, get_company_by_symbol
from services.technical_service import DEFAULT_RANGE, get_price_history

router = APIRouter()


@router.get("/companies")
def companies(
    search: Optional[str] = Query(None, description="Match against name or symbol"),
    limit: int = Query(500, ge=1, le=2000),
):
    return get_all_companies(search=search, limit=limit)


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
