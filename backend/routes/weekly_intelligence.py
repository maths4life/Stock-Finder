from fastapi import APIRouter

from schemas.weekly_intelligence import WeeklyRefreshResult
from services.weekly_market_intelligence import refresh_weekly_intelligence

router = APIRouter()


@router.post("/weekly-market-intelligence/refresh", response_model=WeeklyRefreshResult)
def trigger_weekly_market_intelligence_refresh():
    """Manual refresh endpoint for development/testing (per the Module 7
    spec: "A manual refresh endpoint for development is acceptable").
    In production this pipeline is meant to run on a schedule (see
    `ingest/weekly_news_refresh.py`'s docstring for the suggested weekly
    cadence), not be triggered by user traffic -- this endpoint exists so
    the pipeline can be exercised without shelling into the server.

    The read endpoint that used to live here
    (`GET /company/{symbol}/weekly-market-intelligence`) was removed
    along with the Company Research page's "Weekly Market Intelligence"
    section -- it was used exclusively by that section. This refresh
    endpoint is independent infrastructure for the ingest pipeline and
    stays.
    """
    return refresh_weekly_intelligence()
