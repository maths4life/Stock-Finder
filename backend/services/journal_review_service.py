"""Business logic for the Journal Reviews module (TD-017).

Route layer (routes/journal_reviews.py) stays thin: parse request, call
one of these functions, return the result — same split as every other
module (see `company_service.py`'s docstring for the pattern this
follows, and `journal_service.py`/`pipeline_service.py` for the two
existing write-layer precedents this module mirrors most closely).

This is the review/retrospective half of the Journal module:
`journal_reviews.entry_id` references `journal_entries(id)`, so every
review belongs to exactly one entry. Unlike `journal_entries.symbol`
(validated against `companies`) or `pipeline_items.symbol` (same), the
FK check here is against `journal_entries` itself — see
`EntryNotFoundError` below, which plays the same role as
`SymbolNotFoundError` does in the other two write layers.
"""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import text

from db.db import engine
from schemas.journal_review import JournalReviewCreate, JournalReviewUpdate


class EntryNotFoundError(ValueError):
    """Raised when a review references a journal entry id that doesn't
    exist in `journal_entries`. Routes translate this to a 400."""


_SELECT_COLUMNS = """
    id, entry_id, reviewed_at, thesis_played_out, what_actually_happened,
    mistakes, lessons, would_buy_again, ai_comparison_summary
"""


def _row_to_dict(row) -> dict:
    return {
        "id": str(row["id"]),
        "entryId": str(row["entry_id"]),
        "reviewedAt": row["reviewed_at"],
        "thesisPlayedOut": row["thesis_played_out"],
        "whatActuallyHappened": row["what_actually_happened"],
        "mistakes": row["mistakes"],
        "lessons": row["lessons"],
        "wouldBuyAgain": row["would_buy_again"],
        "aiComparisonSummary": row["ai_comparison_summary"],
    }


def _entry_exists(conn, entry_id: str) -> bool:
    row = conn.execute(text("select 1 from journal_entries where id = :id"), {"id": entry_id}).first()
    return row is not None


def get_journal_reviews() -> List[dict]:
    """GET /journal-reviews — all reviews across all entries, most
    recent first. One query, same flat-list shape as
    `get_journal_entries`/`get_pipeline_items`; the frontend groups
    reviews under their parent entry client-side, the same way the
    journal page already groups entries by company via a client-side
    Map rather than a server-side join."""
    query = text(f"select {_SELECT_COLUMNS} from journal_reviews order by reviewed_at desc")
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
        return [_row_to_dict(row) for row in rows]


def get_journal_review(review_id: str) -> Optional[dict]:
    """GET /journal-reviews/{id}."""
    query = text(f"select {_SELECT_COLUMNS} from journal_reviews where id = :id")
    with engine.connect() as conn:
        row = conn.execute(query, {"id": review_id}).mappings().first()
        return _row_to_dict(row) if row else None


def create_journal_review(data: JournalReviewCreate) -> dict:
    """POST /journal-reviews. Raises EntryNotFoundError for an unknown
    entryId (checked explicitly for a clean 400 instead of surfacing a
    raw FK-violation error) — same pattern as SymbolNotFoundError in the
    other two write layers. `reviewed_at` is auto-set to now, same
    treatment as `journal_entries.created_at`."""
    now = datetime.now(timezone.utc)

    insert = text(
        f"""
        insert into journal_reviews (
            entry_id, reviewed_at, thesis_played_out, what_actually_happened,
            mistakes, lessons, would_buy_again, ai_comparison_summary
        ) values (
            :entryId, :reviewedAt, :thesisPlayedOut, :whatActuallyHappened,
            :mistakes, :lessons, :wouldBuyAgain, :aiComparisonSummary
        )
        returning {_SELECT_COLUMNS}
        """
    )

    params = {**data.model_dump(), "reviewedAt": now}

    with engine.begin() as conn:
        if not _entry_exists(conn, data.entryId):
            raise EntryNotFoundError(f'No journal entry found with id "{data.entryId}"')
        row = conn.execute(insert, params).mappings().first()
        return _row_to_dict(row)


def update_journal_review(review_id: str, data: JournalReviewUpdate) -> Optional[dict]:
    """PUT /journal-reviews/{id}. Full replacement of the editable
    content fields (everything except `entryId`/`reviewedAt`, which are
    immutable after creation — see `JournalReviewUpdate`'s docstring).
    Returns None if the review doesn't exist (route raises 404)."""
    update = text(
        f"""
        update journal_reviews set
            thesis_played_out = :thesisPlayedOut,
            what_actually_happened = :whatActuallyHappened,
            mistakes = :mistakes,
            lessons = :lessons,
            would_buy_again = :wouldBuyAgain,
            ai_comparison_summary = :aiComparisonSummary
        where id = :id
        returning {_SELECT_COLUMNS}
        """
    )

    with engine.begin() as conn:
        existing = conn.execute(text("select 1 from journal_reviews where id = :id"), {"id": review_id}).first()
        if existing is None:
            return None

        params = {**data.model_dump(), "id": review_id}
        row = conn.execute(update, params).mappings().first()
        return _row_to_dict(row)


def delete_journal_review(review_id: str) -> bool:
    """DELETE /journal-reviews/{id}. Returns False if nothing was
    deleted (route raises 404)."""
    with engine.begin() as conn:
        result = conn.execute(text("delete from journal_reviews where id = :id"), {"id": review_id})
        return result.rowcount > 0
