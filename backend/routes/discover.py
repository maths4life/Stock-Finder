from fastapi import APIRouter

from services.discover_service import (
    get_data_freshness,
    get_discover_groups,
    get_market_indicators,
    get_pipeline,
    get_sector_pulse,
)

router = APIRouter()


@router.get("/discover/groups")
def discover_groups():
    return get_discover_groups()


@router.get("/meta/freshness")
def data_freshness():
    return get_data_freshness()


@router.get("/pipeline")
def pipeline():
    return get_pipeline()


@router.get("/sectors/pulse")
def sectors_pulse():
    return get_sector_pulse()


@router.get("/market/indicators")
def market_indicators():
    return get_market_indicators()
