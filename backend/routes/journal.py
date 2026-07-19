import uuid
from typing import List

from fastapi import APIRouter, HTTPException

from schemas.journal import JournalEntry, JournalEntryCreate, JournalEntryUpdate
from services.journal_service import (
    SymbolNotFoundError,
    create_journal_entry,
    delete_journal_entry,
    get_journal_entries,
    get_journal_entry,
    update_journal_entry,
)

router = APIRouter()


def _validate_id(entry_id: str) -> None:
    """journal_entries.id is a uuid column — reject a malformed id with a
    clean 404 instead of letting it fall through to a raw DB error."""
    try:
        uuid.UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f'No journal entry found with id "{entry_id}"')


@router.get("/journal-entries", response_model=List[JournalEntry])
def journal_entries():
    return get_journal_entries()


@router.get("/journal-entries/{entry_id}", response_model=JournalEntry)
def journal_entry(entry_id: str):
    _validate_id(entry_id)
    result = get_journal_entry(entry_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f'No journal entry found with id "{entry_id}"')
    return result


@router.post("/journal-entries", response_model=JournalEntry, status_code=201)
def create_entry(body: JournalEntryCreate):
    try:
        return create_journal_entry(body)
    except SymbolNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/journal-entries/{entry_id}", response_model=JournalEntry)
def update_entry(entry_id: str, body: JournalEntryUpdate):
    _validate_id(entry_id)
    try:
        result = update_journal_entry(entry_id, body)
    except SymbolNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail=f'No journal entry found with id "{entry_id}"')
    return result


@router.delete("/journal-entries/{entry_id}", status_code=204)
def delete_entry(entry_id: str):
    _validate_id(entry_id)
    deleted = delete_journal_entry(entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f'No journal entry found with id "{entry_id}"')
