"""Pydantic response models for the Companies module (Module 1).

Split into a lightweight `CompanyListItem` (GET /companies) and a full
`Company` (GET /company/{symbol}) — see API_CONTRACT.md for why. The two
share `CompanyBase` so the list/detail fields can never drift apart by
accident.
"""
from typing import List

from pydantic import BaseModel, Field


class ShareholdingRow(BaseModel):
    quarter: str
    promoter: float
    fii: float
    dii: float
    public: float


class QuarterlyFinancial(BaseModel):
    quarter: str
    revenueCr: float
    netProfitCr: float
    ebitdaMarginPct: float


class ChecklistItem(BaseModel):
    label: str
    done: bool


class CompanyBase(BaseModel):
    symbol: str
    exchange: str
    name: str
    sector: str

    marketCap: str
    marketCapCr: float
    price: float
    changePct: float

    # Fundamentals
    pe: float
    pb: float
    peg: float
    roe: float
    roce: float
    eps: float
    epsGrowthPct: float
    salesGrowthPct: float
    profitGrowthPct: float
    debtToEquity: float
    currentRatio: float
    divYield: float
    promoterHoldingPct: float
    fiiHoldingPct: float
    diiHoldingPct: float

    # Technicals
    rsi: float
    aboveEma200: bool
    aboveEma50: bool
    goldenCross: bool
    volumeBreakout: bool
    trend: str  # "Uptrend" | "Downtrend" | "Sideways" — see scoring_service.trend_label

    # Scores (0-100)
    fundamentalScore: float
    technicalScore: float
    overallScore: float

    # Discovery metadata (placeholder heuristics — see API_CONTRACT.md
    # and services/scoring_service.py)
    riskLevel: str
    expectedReturnPct: float
    investmentHorizonMonths: int

    verdict: str
    rationale: str
    spark: List[float] = Field(default_factory=list)


class CompanyListItem(CompanyBase):
    """Returned by GET /companies. Deliberately excludes the deep-research
    fields below — no list/search view renders them, and Module 3 will
    make those genuinely expensive (financials/shareholding *history*,
    not a single-row snapshot), so keeping them off the list endpoint
    keeps GET /companies cheap regardless of what Module 3 adds."""


class Company(CompanyBase):
    """Returned by GET /company/{symbol} — the complete object, including
    the deep-research fields Module 3 will populate."""

    pros: List[str] = Field(default_factory=list)
    cons: List[str] = Field(default_factory=list)
    shareholdingTrend: List[ShareholdingRow] = Field(default_factory=list)
    quarterlyFinancials: List[QuarterlyFinancial] = Field(default_factory=list)
    checklist: List[ChecklistItem] = Field(default_factory=list)
    businessSummary: str = ""
    verdictSummary: str = ""


class PaginatedCompanies(BaseModel):
    """Returned by GET /companies (Module 4). Mirrors
    frontend/src/shared/api/types.ts's `Paginated<Company>` exactly —
    keep the two in sync if either changes."""

    items: List[CompanyListItem]
    page: int
    pageSize: int
    total: int
    totalPages: int
