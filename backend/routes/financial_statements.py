"""Module 7 — dedicated Quarterly/Annual Financial Statement endpoints.

The same data is also embedded in `GET /company/{symbol}` as
`quarterlyComparison`/`annualComparison` (unchanged, so nothing that
already reads the full Company object breaks). These routes exist
because the brief specifically asked for standalone endpoints — useful
for a client that only wants this one section without paying for the
full company payload. Both call the exact same service functions as the
embedded fields, so the two can never disagree.
"""
from fastapi import APIRouter

from services.financial_statements_service import get_annual_comparison, get_quarterly_comparison
from services.shareholding_service import get_shareholding_summary

router = APIRouter()


@router.get("/company/{symbol}/quarterly")
def company_quarterly_statements(symbol: str):
    return get_quarterly_comparison(symbol)


@router.get("/company/{symbol}/annual")
def company_annual_statements(symbol: str):
    return get_annual_comparison(symbol)


@router.get("/company/{symbol}/shareholding")
def company_shareholding(symbol: str):
    """Module 7.5 — latest vs. previous reporting quarter, full
    7-category breakdown. Same data as the embedded
    Company.shareholdingSummary field."""
    return get_shareholding_summary(symbol)
