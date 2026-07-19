"""Pydantic response models for Module 7 (Weekly Market Intelligence).

camelCase field names -- follows schemas/company.py's / schemas/discover.py's
house convention (schemas/analysis.py's snake_case is the documented
exception for Module 6, not the rule; see that file's docstring). No
transform layer on the frontend: what's defined here is exactly what
`frontend/src/shared/api/types.ts`'s `WeeklyMarketIntelligence` type
expects.
"""
from typing import List, Optional

from pydantic import BaseModel

from schemas.company import CompanyListItem


class MajorEvent(BaseModel):
    headline: str
    whyItMatters: str
    expectedImpact: str
    sourceUrl: str


class WeeklyMarketIntelligence(BaseModel):
    symbol: str
    sector: str
    sectorOutlook: str  # "Positive" | "Neutral" | "Negative"
    weekStartDate: str  # ISO date
    weekEndDate: str  # ISO date
    weeklySummary: str
    importantEvents: List[MajorEvent]
    marketImpact: str
    # CompanyListItem (same shape GET /companies returns) -- not the full
    # deep-research Company -- so this endpoint stays cheap and the
    # frontend can reuse CompanyRow.tsx directly without a new component
    # or a new type just for this list. Matches GET /companies' own
    # list-vs-detail payload split (see API_CONTRACT.md).
    sectorResearchCandidates: List[CompanyListItem]
    hasCoverage: bool  # False when no sector intelligence has been generated yet
    lastRefreshedAt: Optional[str] = None


class WeeklyRefreshResult(BaseModel):
    weekStartDate: str
    weekEndDate: str
    sectorsUpdated: List[str]
    articlesFetched: int
    articlesKept: int
    generatedAt: str
