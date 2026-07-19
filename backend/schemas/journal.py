"""Pydantic response/request models for the Journal module (Module 8).

Shapes mirror the `journal_entries` table in `db/schema.sql` section 5
directly (camelCase, no transform layer) — same convention as
`schemas/company.py` and `schemas/discover.py`. `journal_reviews` is
deliberately not modeled here; it's out of scope for this milestone (see
`CURRENT_MILESTONE.md`).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class JournalEntryBase(BaseModel):
    symbol: str
    title: Optional[str] = None
    thesis: str
    fundamentalReasons: Optional[str] = None
    technicalReasons: Optional[str] = None
    sectorReasons: Optional[str] = None
    macroReasons: Optional[str] = None
    personalNotes: Optional[str] = None
    sellTrigger: Optional[str] = None
    assumptions: Optional[str] = None
    risksAccepted: Optional[str] = None
    targetPrice: Optional[float] = None
    expectedReturnPct: Optional[float] = None
    horizonMonths: Optional[int] = None
    confidenceLevel: Optional[int] = Field(None, ge=1, le=5)

    @field_validator("symbol")
    @classmethod
    def symbol_upper(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("symbol must not be empty")
        return v

    @field_validator("thesis")
    @classmethod
    def thesis_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("thesis must not be empty")
        return v

    @field_validator("horizonMonths")
    @classmethod
    def horizon_positive(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("horizonMonths must be a positive integer")
        return v


class JournalEntryCreate(JournalEntryBase):
    """Body for POST /journal-entries."""


class JournalEntryUpdate(JournalEntryBase):
    """Body for PUT /journal-entries/{id}. Full replacement of the
    editable fields — same shape as create, matching the pattern the
    frontend form already needs for both add/edit."""


class JournalEntry(JournalEntryBase):
    """Returned by all GET/POST/PUT journal endpoints."""

    id: str
    createdAt: datetime
    reviewDueAt: Optional[datetime] = None
