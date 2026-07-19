"""Pydantic response model for the Module 6 AI-style research engine.

Field names follow the exact snake_case shape given in the Module 6
spec (investment_summary, fundamental_analysis, ...) rather than the
camelCase convention schemas/company.py and schemas/discover.py use —
that's an explicit external contract for this endpoint, not a house
style change; every other schema in this project stays camelCase.
"""
from typing import List

from pydantic import BaseModel


class FundamentalAnalysis(BaseModel):
    profitability: List[str]
    growth: List[str]
    valuation: List[str]
    balance_sheet_and_liquidity: List[str]


class TechnicalAnalysis(BaseModel):
    trend: List[str]
    momentum: List[str]
    volume: List[str]
    moving_averages: List[str]


class CompanyAnalysis(BaseModel):
    symbol: str
    name: str
    investment_summary: str
    rating: str  # "Strong Buy" | "Buy" | "Hold" | "Avoid"
    confidence: int  # 0-100

    business_summary: str

    fundamental_analysis: FundamentalAnalysis
    technical_analysis: TechnicalAnalysis

    risk_factors: List[str]
    positive_catalysts: List[str]
    negative_catalysts: List[str]

    valuation_summary: str
    outlook_6_12_month: str
    overall_verdict: str
