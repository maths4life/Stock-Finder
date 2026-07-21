"""Pydantic response/request models for the Pipeline write layer (Milestone 3).

Shapes mirror the `pipeline_items` table in `db/schema.sql` section 5
directly (camelCase, no transform layer) — same convention as
`schemas/journal.py`. The existing grouped read shapes (`PipelineItem`,
`PipelineColumn`) already live in `schemas/discover.py` and back the
existing `GET /pipeline` endpoint; they are left untouched. This module
adds the per-item CRUD shapes needed by the new `routes/pipeline.py`.

Stages are fixed to the three values already used by `pipeline_items.stage`
and `services/discover_service.py`'s `_STAGE_ORDER` — "Watching",
"Researching", "Conviction". Milestone 3 preserves the existing schema
rather than introducing new stages (see `CURRENT_MILESTONE.md`).
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

PipelineStage = Literal["Watching", "Researching", "Conviction"]

_VALID_STAGES = ("Watching", "Researching", "Conviction")


class PipelineItemBase(BaseModel):
    symbol: str
    stage: PipelineStage = "Watching"
    note: Optional[str] = None

    @field_validator("symbol")
    @classmethod
    def symbol_upper(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("symbol must not be empty")
        return v

    @field_validator("stage")
    @classmethod
    def stage_valid(cls, v: str) -> str:
        if v not in _VALID_STAGES:
            raise ValueError(f"stage must be one of {_VALID_STAGES}")
        return v


class PipelineItemCreate(PipelineItemBase):
    """Body for POST /pipeline-items."""


class PipelineItemUpdate(PipelineItemBase):
    """Body for PUT /pipeline-items/{id}. Full replacement of the
    editable fields (symbol, stage, note) — same shape as create."""


class PipelineItemStageUpdate(BaseModel):
    """Body for PATCH /pipeline-items/{id}/stage — moving a card between
    columns without touching its note."""

    stage: PipelineStage

    @field_validator("stage")
    @classmethod
    def stage_valid(cls, v: str) -> str:
        if v not in _VALID_STAGES:
            raise ValueError(f"stage must be one of {_VALID_STAGES}")
        return v


class PipelineItemDetail(PipelineItemBase):
    """Returned by all GET/POST/PUT/PATCH pipeline-item endpoints."""

    id: str
    updatedAt: datetime
