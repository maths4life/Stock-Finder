"""Pydantic response models for the Discover page (Module 2).

Shapes mirror `frontend/src/shared/api/types.ts` exactly (camelCase, no
transform layer needed) — same convention as schemas/company.py.
"""
from typing import List

from pydantic import BaseModel, Field


class DiscoverGroup(BaseModel):
    id: str
    label: str
    tagline: str
    layout: str  # "grid" | "list"
    symbols: List[str] = Field(default_factory=list)


class PipelineItem(BaseModel):
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
