from fastapi import APIRouter, HTTPException

from schemas.weekly_intelligence import WeeklyMarketIntelligence, WeeklyRefreshResult
from services.weekly_market_intelligence import get_weekly_market_intelligence_for_company, refresh_weekly_intelligence

router = APIRouter()


@router.get("/company/{symbol}/weekly-market-intelligence", response_model=WeeklyMarketIntelligence)
def company_weekly_market_intelligence(symbol: str):
    result = get_weekly_market_intelligence_for_company(symbol)
    if result is None:
        raise HTTPException(status_code=404, detail=f'No company found for symbol "{symbol}"')
    return result


@router.post("/weekly-market-intelligence/refresh", response_model=WeeklyRefreshResult)
def trigger_weekly_market_intelligence_refresh():
    """Manual refresh endpoint for development/testing (per the Module 7
    spec: "A manual refresh endpoint for development is acceptable").
    In production this pipeline is meant to run on a schedule (see
    `ingest/weekly_news_refresh.py`'s docstring for the suggested weekly
    cadence), not be triggered by user traffic -- this endpoint exists so
    the pipeline can be exercised without shelling into the server.
    """
    return refresh_weekly_intelligence()
