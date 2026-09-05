"""Pydantic response models for the Discover page (Module 2).

Shapes mirror `frontend/src/shared/api/types.ts` exactly (camelCase, no
transform layer needed) — same convention as schemas/company.py.
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class DiscoverGroup(BaseModel):
    id: str
    label: str
    tagline: str
    layout: str  # "grid" | "list"
    symbols: List[str] = Field(default_factory=list)


class PipelineItem(BaseModel):
    id: str
    symbol: str
    note: str
    ago: str


class PipelineColumn(BaseModel):
    stage: str  # "Watching" | "Researching" | "Conviction"
    hint: str
    items: List[PipelineItem] = Field(default_factory=list)


class SectorPulse(BaseModel):
    sector: str
    sentiment: str  # "Bullish" | "Positive" | "Neutral" | "Bearish"
    reason: str
    topSymbols: List[str] = Field(default_factory=list)


class MarketIndicator(BaseModel):
    label: str
    value: str
    change: str
    tone: str  # "positive" | "negative" | "neutral"


class DataFreshness(BaseModel):
    """GET /meta/freshness — when the scoring/technicals data was last
    refreshed, so the frontend can show a genuine 'Updated ... · Fresh'
    indicator instead of inventing a timestamp. `updatedAt` is None only
    when the `scores`/`technical_snapshot` tables are both empty (e.g. a
    freshly created database, before the first ingest run)."""

    updatedAt: Optional[str] = None  # ISO-8601, UTC
    status: str  # "fresh" | "stale" | "unknown"
    staleAfterHours: int
