"""Pydantic response/request models for the Journal Reviews write layer
(TD-017).

Shapes mirror the `journal_reviews` table in `db/schema.sql` section 5
directly (camelCase, no transform layer) — same convention as
`schemas/journal.py` and `schemas/pipeline.py`. This is the
review/retrospective half of the Journal module: one `journal_entries`
row can have zero or more `journal_reviews` rows, linked by `entry_id`.

`aiComparisonSummary` mirrors the `ai_comparison_summary` column exactly
as a plain, optional, freely-writable text field — this module contains
no AI-generation logic of any kind. `PRODUCT_REQUIREMENTS.md` is explicit
that no AI-generated opinion should ever stand in for the product's
deterministic reasoning, and auto-generating this field was never part
of TD-017's approved scope. See `DECISIONS.md` for the recorded decision
and `TECHNICAL_DEBT.md` for the resulting (intentionally deferred) debt
item.
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

ThesisOutcome = Literal["yes", "partially", "no"]

_VALID_OUTCOMES = ("yes", "partially", "no")


class JournalReviewBase(BaseModel):
    entryId: str
    thesisPlayedOut: Optional[ThesisOutcome] = None
    whatActuallyHappened: Optional[str] = None
    mistakes: Optional[str] = None
    lessons: Optional[str] = None
    wouldBuyAgain: Optional[bool] = None
    aiComparisonSummary: Optional[str] = None

    @field_validator("entryId")
    @classmethod
    def entry_id_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("entryId must not be empty")
        return v

    @field_validator("thesisPlayedOut")
    @classmethod
    def outcome_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_OUTCOMES:
            raise ValueError(f"thesisPlayedOut must be one of {_VALID_OUTCOMES}")
        return v


class JournalReviewCreate(JournalReviewBase):
    """Body for POST /journal-reviews."""


class JournalReviewUpdate(BaseModel):
    """Body for PUT /journal-reviews/{id}.

    Deliberately NOT a subclass of `JournalReviewBase` the way
    `JournalEntryUpdate`/`PipelineItemUpdate` reuse their `Create` shape
    exactly — `entryId` is excluded here because a review's parent entry
    is immutable after creation (same treatment as `journal_entries
    .created_at`, which is also never re-sent on update). Every other
    field is a full replacement of the editable content, same as the
    other two write layers.
    """

    thesisPlayedOut: Optional[ThesisOutcome] = None
    whatActuallyHappened: Optional[str] = None
    mistakes: Optional[str] = None
    lessons: Optional[str] = None
    wouldBuyAgain: Optional[bool] = None
    aiComparisonSummary: Optional[str] = None

    @field_validator("thesisPlayedOut")
    @classmethod
    def outcome_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_OUTCOMES:
            raise ValueError(f"thesisPlayedOut must be one of {_VALID_OUTCOMES}")
        return v


class JournalReview(JournalReviewBase):
    """Returned by all GET/POST/PUT journal-review endpoints."""

    id: str
    reviewedAt: datetime
