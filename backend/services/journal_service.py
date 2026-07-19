"""Business logic for the Journal module (Module 8).

Route layer (routes/journal.py) stays thin: parse request, call one of
these functions, return the result — same split as every other module
(see `company_service.py`'s docstring for the pattern this follows).

This is the first write layer in the backend. `journal_reviews` is
deliberately untouched — this milestone is `journal_entries` CRUD only
(see `CURRENT_MILESTONE.md`).
"""
from calendar import monthrange
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import text

from db.db import engine
from schemas.journal import JournalEntryCreate, JournalEntryUpdate


class SymbolNotFoundError(ValueError):
    """Raised when a journal entry references a symbol that doesn't
    exist in `companies`. Routes translate this to a 400."""


_SELECT_COLUMNS = """
    id, symbol, title, thesis, fundamental_reasons, technical_reasons,
    sector_reasons, macro_reasons, personal_notes, sell_trigger,
    assumptions, risks_accepted, target_price, expected_return_pct,
    horizon_months, confidence_level, created_at, review_due_at
"""


def _row_to_dict(row) -> dict:
    return {
        "id": str(row["id"]),
        "symbol": row["symbol"],
        "title": row["title"],
        "thesis": row["thesis"],
        "fundamentalReasons": row["fundamental_reasons"],
        "technicalReasons": row["technical_reasons"],
        "sectorReasons": row["sector_reasons"],
        "macroReasons": row["macro_reasons"],
        "personalNotes": row["personal_notes"],
        "sellTrigger": row["sell_trigger"],
        "assumptions": row["assumptions"],
        "risksAccepted": row["risks_accepted"],
        "targetPrice": row["target_price"],
        "expectedReturnPct": row["expected_return_pct"],
        "horizonMonths": row["horizon_months"],
        "confidenceLevel": row["confidence_level"],
        "createdAt": row["created_at"],
        "reviewDueAt": row["review_due_at"],
    }


def _add_months(dt: datetime, months: int) -> datetime:
    """Dependency-free month addition (no python-dateutil in
    requirements.txt) — used to auto-set review_due_at from horizon_months,
    per the schema.sql comment on that column."""
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def _symbol_exists(conn, symbol: str) -> bool:
    row = conn.execute(text("select 1 from companies where symbol = :symbol"), {"symbol": symbol}).first()
    return row is not None


def get_journal_entries() -> List[dict]:
    """GET /journal-entries — all entries, newest first. One query."""
    query = text(f"select {_SELECT_COLUMNS} from journal_entries order by created_at desc")
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
        return [_row_to_dict(row) for row in rows]


def get_journal_entry(entry_id: str) -> Optional[dict]:
    """GET /journal-entries/{id}."""
    query = text(f"select {_SELECT_COLUMNS} from journal_entries where id = :id")
    with engine.connect() as conn:
        row = conn.execute(query, {"id": entry_id}).mappings().first()
        return _row_to_dict(row) if row else None


def create_journal_entry(data: JournalEntryCreate) -> dict:
    """POST /journal-entries. Raises SymbolNotFoundError for an unknown
    symbol (checked explicitly for a clean 400 instead of surfacing a raw
    FK-violation error). review_due_at is auto-set from horizon_months, as
    documented on the column in schema.sql."""
    now = datetime.now(timezone.utc)
    review_due_at = _add_months(now, data.horizonMonths) if data.horizonMonths else None

    insert = text(
        """
        insert into journal_entries (
            symbol, title, thesis, fundamental_reasons, technical_reasons,
            sector_reasons, macro_reasons, personal_notes, sell_trigger,
            assumptions, risks_accepted, target_price, expected_return_pct,
            horizon_months, confidence_level, created_at, review_due_at
        ) values (
            :symbol, :title, :thesis, :fundamentalReasons, :technicalReasons,
            :sectorReasons, :macroReasons, :personalNotes, :sellTrigger,
            :assumptions, :risksAccepted, :targetPrice, :expectedReturnPct,
            :horizonMonths, :confidenceLevel, :createdAt, :reviewDueAt
        )
        returning """
        + _SELECT_COLUMNS
    )

    params = {**data.model_dump(), "createdAt": now, "reviewDueAt": review_due_at}

    with engine.begin() as conn:
        if not _symbol_exists(conn, data.symbol):
            raise SymbolNotFoundError(f'No company found for symbol "{data.symbol}"')
        row = conn.execute(insert, params).mappings().first()
        return _row_to_dict(row)


def update_journal_entry(entry_id: str, data: JournalEntryUpdate) -> Optional[dict]:
    """PUT /journal-entries/{id}. Full replacement of editable fields.
    review_due_at is recomputed from created_at + the (possibly changed)
    horizon_months, keeping the auto-set invariant true after an edit.
    Returns None if the entry doesn't exist (route raises 404)."""
    update = text(
        """
        update journal_entries set
            symbol = :symbol,
            title = :title,
            thesis = :thesis,
            fundamental_reasons = :fundamentalReasons,
            technical_reasons = :technicalReasons,
            sector_reasons = :sectorReasons,
            macro_reasons = :macroReasons,
            personal_notes = :personalNotes,
            sell_trigger = :sellTrigger,
            assumptions = :assumptions,
            risks_accepted = :risksAccepted,
            target_price = :targetPrice,
            expected_return_pct = :expectedReturnPct,
            horizon_months = :horizonMonths,
            confidence_level = :confidenceLevel,
            review_due_at = :reviewDueAt
        where id = :id
        returning """
        + _SELECT_COLUMNS
    )

    with engine.begin() as conn:
        existing = conn.execute(
            text("select created_at from journal_entries where id = :id"), {"id": entry_id}
        ).mappings().first()
        if existing is None:
            return None

        if not _symbol_exists(conn, data.symbol):
            raise SymbolNotFoundError(f'No company found for symbol "{data.symbol}"')

        review_due_at = (
            _add_months(existing["created_at"], data.horizonMonths) if data.horizonMonths else None
        )
        params = {**data.model_dump(), "id": entry_id, "reviewDueAt": review_due_at}
        row = conn.execute(update, params).mappings().first()
        return _row_to_dict(row)


def delete_journal_entry(entry_id: str) -> bool:
    """DELETE /journal-entries/{id}. Returns False if nothing was
    deleted (route raises 404)."""
    with engine.begin() as conn:
        result = conn.execute(text("delete from journal_entries where id = :id"), {"id": entry_id})
        return result.rowcount > 0
