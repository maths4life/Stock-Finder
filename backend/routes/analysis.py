from fastapi import APIRouter, HTTPException

from schemas.analysis import CompanyAnalysis
from services.analysis_service import get_company_analysis

router = APIRouter()


@router.get("/company/{symbol}/analysis", response_model=CompanyAnalysis)
def company_analysis(symbol: str):
    result = get_company_analysis(symbol)
    if result is None:
        raise HTTPException(status_code=404, detail=f'No company found for symbol "{symbol}"')
    return result
