import uuid
from typing import List

from fastapi import APIRouter, HTTPException

from schemas.pipeline import (
    PipelineItemCreate,
    PipelineItemDetail,
    PipelineItemStageUpdate,
    PipelineItemUpdate,
)
from services.pipeline_service import (
    SymbolNotFoundError,
    create_pipeline_item,
    delete_pipeline_item,
    get_pipeline_item,
    get_pipeline_items,
    move_pipeline_item_stage,
    update_pipeline_item,
)

router = APIRouter()


def _validate_id(item_id: str) -> None:
    """pipeline_items.id is a uuid column — reject a malformed id with a
    clean 404 instead of letting it fall through to a raw DB error."""
    try:
        uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f'No pipeline item found with id "{item_id}"')


@router.get("/pipeline-items", response_model=List[PipelineItemDetail])
def pipeline_items():
    return get_pipeline_items()


@router.get("/pipeline-items/{item_id}", response_model=PipelineItemDetail)
def pipeline_item(item_id: str):
    _validate_id(item_id)
    result = get_pipeline_item(item_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f'No pipeline item found with id "{item_id}"')
    return result


@router.post("/pipeline-items", response_model=PipelineItemDetail, status_code=201)
def create_item(body: PipelineItemCreate):
    try:
        return create_pipeline_item(body)
    except SymbolNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/pipeline-items/{item_id}", response_model=PipelineItemDetail)
def update_item(item_id: str, body: PipelineItemUpdate):
    _validate_id(item_id)
    try:
        result = update_pipeline_item(item_id, body)
    except SymbolNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail=f'No pipeline item found with id "{item_id}"')
    return result


@router.patch("/pipeline-items/{item_id}/stage", response_model=PipelineItemDetail)
def move_item_stage(item_id: str, body: PipelineItemStageUpdate):
    _validate_id(item_id)
    result = move_pipeline_item_stage(item_id, body.stage)
    if result is None:
        raise HTTPException(status_code=404, detail=f'No pipeline item found with id "{item_id}"')
    return result


@router.delete("/pipeline-items/{item_id}", status_code=204)
def delete_item(item_id: str):
    _validate_id(item_id)
    deleted = delete_pipeline_item(item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f'No pipeline item found with id "{item_id}"')
