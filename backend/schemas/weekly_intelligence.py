"""Pydantic response models for Module 7 (Weekly Market Intelligence).

Only `WeeklyRefreshResult` remains -- it backs the still-live
`POST /weekly-market-intelligence/refresh` dev/testing endpoint. The
`WeeklyMarketIntelligence`/`MajorEvent` read-path models were removed
along with `GET /company/{symbol}/weekly-market-intelligence`, which was
used exclusively by the Company Research page's now-removed "Weekly
Market Intelligence" section (see routes/weekly_intelligence.py).
"""
from typing import List

from pydantic import BaseModel


class WeeklyRefreshResult(BaseModel):
    weekStartDate: str
    weekEndDate: str
    sectorsUpdated: List[str]
    articlesFetched: int
    articlesKept: int
    generatedAt: str
