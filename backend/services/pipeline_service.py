"""Business logic for the Pipeline write layer (Milestone 3).

Route layer (routes/pipeline.py) stays thin: parse request, call one of
these functions, return the result — same split as every other module
(see `company_service.py`'s docstring for the pattern this follows, and
`journal_service.py` for the most recent write-layer precedent, which
this module mirrors closely).

This module adds full CRUD + a dedicated stage-move operation for
`pipeline_items`. The existing grouped read function `get_pipeline()` in
`discover_service.py` (backing `GET /pipeline`) is untouched and kept
working for backward compatibility — this module is additive, not a
replacement.

Stages are fixed to the three existing values ("Watching", "Researching",
"Conviction") per `CURRENT_MILESTONE.md` — no new stages are introduced.
"""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import text

from db.db import engine
from schemas.pipeline import PipelineItemCreate, PipelineItemUpdate


class SymbolNotFoundError(ValueError):
    """Raised when a pipeline item references a symbol that doesn't
    exist in `companies`. Routes translate this to a 400."""


_SELECT_COLUMNS = "id, symbol, stage, note, updated_at"


def _row_to_dict(row) -> dict:
    return {
        "id": str(row["id"]),
        "symbol": row["symbol"],
        "stage": row["stage"],
        "note": row["note"],
        "updatedAt": row["updated_at"],
    }


def _symbol_exists(conn, symbol: str) -> bool:
    row = conn.execute(text("select 1 from companies where symbol = :symbol"), {"symbol": symbol}).first()
    return row is not None


def get_pipeline_items() -> List[dict]:
    """GET /pipeline-items — all items, most recently updated first. One
    query. This is the flat, per-item counterpart to the existing grouped
    `GET /pipeline` (`discover_service.get_pipeline`), which stays as-is."""
    query = text(f"select {_SELECT_COLUMNS} from pipeline_items order by updated_at desc")
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
        return [_row_to_dict(row) for row in rows]


def get_pipeline_item(item_id: str) -> Optional[dict]:
    """GET /pipeline-items/{id}."""
    query = text(f"select {_SELECT_COLUMNS} from pipeline_items where id = :id")
    with engine.connect() as conn:
        row = conn.execute(query, {"id": item_id}).mappings().first()
        return _row_to_dict(row) if row else None


def create_pipeline_item(data: PipelineItemCreate) -> dict:
    """POST /pipeline-items. Raises SymbolNotFoundError for an unknown
    symbol (checked explicitly for a clean 400 instead of surfacing a raw
    FK-violation error)."""
    now = datetime.now(timezone.utc)

    insert = text(
        f"""
        insert into pipeline_items (symbol, stage, note, updated_at)
        values (:symbol, :stage, :note, :updatedAt)
        returning {_SELECT_COLUMNS}
        """
    )

    params = {**data.model_dump(), "updatedAt": now}

    with engine.begin() as conn:
        if not _symbol_exists(conn, data.symbol):
            raise SymbolNotFoundError(f'No company found for symbol "{data.symbol}"')
        row = conn.execute(insert, params).mappings().first()
        return _row_to_dict(row)


def update_pipeline_item(item_id: str, data: PipelineItemUpdate) -> Optional[dict]:
    """PUT /pipeline-items/{id}. Full replacement of the editable fields
    (symbol, stage, note); `updated_at` is bumped to now. Returns None if
    the item doesn't exist (route raises 404)."""
    now = datetime.now(timezone.utc)

    update = text(
        f"""
        update pipeline_items set
            symbol = :symbol,
            stage = :stage,
            note = :note,
            updated_at = :updatedAt
        where id = :id
        returning {_SELECT_COLUMNS}
        """
    )

    with engine.begin() as conn:
        existing = conn.execute(text("select 1 from pipeline_items where id = :id"), {"id": item_id}).first()
        if existing is None:
            return None

        if not _symbol_exists(conn, data.symbol):
            raise SymbolNotFoundError(f'No company found for symbol "{data.symbol}"')

        params = {**data.model_dump(), "id": item_id, "updatedAt": now}
        row = conn.execute(update, params).mappings().first()
        return _row_to_dict(row)


def move_pipeline_item_stage(item_id: str, stage: str) -> Optional[dict]:
    """PATCH /pipeline-items/{id}/stage. Moves a card between columns
    without touching its note/symbol; `updated_at` is bumped to now.
    Returns None if the item doesn't exist (route raises 404). Stage
    validity is already enforced by `PipelineItemStageUpdate`, so no
    further check is needed here."""
    now = datetime.now(timezone.utc)

    update = text(
        f"""
        update pipeline_items set
            stage = :stage,
            updated_at = :updatedAt
        where id = :id
        returning {_SELECT_COLUMNS}
        """
    )

    with engine.begin() as conn:
        row = conn.execute(update, {"stage": stage, "updatedAt": now, "id": item_id}).mappings().first()
        return _row_to_dict(row) if row else None


def delete_pipeline_item(item_id: str) -> bool:
    """DELETE /pipeline-items/{id}. Returns False if nothing was
    deleted (route raises 404)."""
    with engine.begin() as conn:
        result = conn.execute(text("delete from pipeline_items where id = :id"), {"id": item_id})
        return result.rowcount > 0
