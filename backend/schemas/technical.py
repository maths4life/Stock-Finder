"""Pydantic response models for the Research page's Price History
section (Module 3). Shape mirrors `frontend/src/shared/api/types.ts`
(camelCase, no transform layer needed) — same convention as
schemas/company.py and schemas/discover.py.
"""
from pydantic import BaseModel


class PriceBar(BaseModel):
    date: str  # ISO date, e.g. "2026-06-30"
    open: float
    high: float
    low: float
    close: float
    volume: int
