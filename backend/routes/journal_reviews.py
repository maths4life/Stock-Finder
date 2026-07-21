import uuid
from typing import List

from fastapi import APIRouter, HTTPException

from schemas.journal_review import JournalReview, JournalReviewCreate, JournalReviewUpdate
from services.journal_review_service import (
    EntryNotFoundError,
    create_journal_review,
    delete_journal_review,
    get_journal_review,
    get_journal_reviews,
    update_journal_review,
)

router = APIRouter()


def _validate_id(review_id: str) -> None:
    """journal_reviews.id is a uuid column — reject a malformed id with a
    clean 404 instead of letting it fall through to a raw DB error."""
    try:
        uuid.UUID(review_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f'No journal review found with id "{review_id}"')


@router.get("/journal-reviews", response_model=List[JournalReview])
def journal_reviews():
    return get_journal_reviews()


@router.get("/journal-reviews/{review_id}", response_model=JournalReview)
def journal_review(review_id: str):
    _validate_id(review_id)
    result = get_journal_review(review_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f'No journal review found with id "{review_id}"')
    return result


@router.post("/journal-reviews", response_model=JournalReview, status_code=201)
def create_review(body: JournalReviewCreate):
    try:
        return create_journal_review(body)
    except EntryNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/journal-reviews/{review_id}", response_model=JournalReview)
def update_review(review_id: str, body: JournalReviewUpdate):
    _validate_id(review_id)
    result = update_journal_review(review_id, body)
    if result is None:
        raise HTTPException(status_code=404, detail=f'No journal review found with id "{review_id}"')
    return result


@router.delete("/journal-reviews/{review_id}", status_code=204)
def delete_review(review_id: str):
    _validate_id(review_id)
    deleted = delete_journal_review(review_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f'No journal review found with id "{review_id}"')
