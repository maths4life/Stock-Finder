"""GET /news/market — live market news feed for the Discover page sidebar.

Fetches recent articles from the RSS providers in services/news_provider.py,
deduplicates by title hash, sorts newest-first, and returns the top `limit`
articles. No database involved — purely a live RSS aggregation endpoint.

Response is cached in-process for 5 minutes so rapid page refreshes don't
hammer the RSS feeds on every request. The TTL matches the React Query
staleTime on the frontend.
"""
from __future__ import annotations

import time
from threading import Lock
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from services.news_provider import RawArticle, fetch_all_recent_articles

router = APIRouter()

# ---------------------------------------------------------------------------
# Simple in-process cache — avoids hammering RSS feeds on every request.
# A proper deployment would use Redis but for a single-process dev/staging
# server a module-level dict with a TTL is sufficient and adds no dependency.
# ---------------------------------------------------------------------------
_CACHE_TTL_SECONDS = 300  # 5 minutes
_cache_lock = Lock()
_cache: Dict[str, Any] = {"data": None, "expires_at": 0.0}


def _get_cached_articles() -> Optional[List[RawArticle]]:
    with _cache_lock:
        if time.monotonic() < _cache["expires_at"] and _cache["data"] is not None:
            return _cache["data"]
    return None


def _set_cached_articles(articles: List[RawArticle]) -> None:
    with _cache_lock:
        _cache["data"] = articles
        _cache["expires_at"] = time.monotonic() + _CACHE_TTL_SECONDS


def _source_label(provider: str) -> str:
    """Human-readable source label for the UI."""
    labels = {
        "economic_times": "Economic Times",
        "hindu_business_line": "Hindu BusinessLine",
        "livemint": "Livemint",
        "yahoo_finance": "Yahoo Finance",
        "google_news": "Google News",
    }
    return labels.get(provider, provider.replace("_", " ").title())


def _age_label(article: RawArticle) -> str:
    """Compact relative-time string, e.g. '2h ago', '1d ago'."""
    if article.published_at is None:
        return ""
    from datetime import datetime, timezone

    delta = datetime.now(timezone.utc) - article.published_at
    seconds = max(0, int(delta.total_seconds()))
    if seconds < 3600:
        return f"{max(1, seconds // 60)}m ago"
    if seconds < 86400:
        return f"{seconds // 3600}h ago"
    if seconds < 604800:
        return f"{seconds // 86400}d ago"
    return f"{seconds // 604800}w ago"


# Priority order: Indian financial sources first, then global.
_SOURCE_PRIORITY = {
    "economic_times": 0,
    "hindu_business_line": 1,
    "livemint": 2,
    "yahoo_finance": 3,
    "google_news": 4,
}


@router.get("/news/market")
def get_market_news(limit: int = Query(default=8, ge=1, le=30)):
    """Live market news feed — deduplicated, sorted newest-first.

    Articles are fetched from all RSS providers and cached in-process for
    5 minutes. Only the last 48 hours of articles are returned.
    """
    articles = _get_cached_articles()
    if articles is None:
        articles = fetch_all_recent_articles(days=2)
        # Deduplicate by title hash (same key the DB pipeline uses).
        seen: set = set()
        deduped: List[RawArticle] = []
        for a in articles:
            if a.dedup_key not in seen:
                seen.add(a.dedup_key)
                deduped.append(a)
        _set_cached_articles(deduped)
        articles = deduped

    # Sort: articles with a date come first (newest-first), undated ones last.
    # Within same-timestamp ties, higher-priority source wins.
    def sort_key(a: RawArticle):
        ts = a.published_at.timestamp() if a.published_at else 0
        priority = _SOURCE_PRIORITY.get(a.provider, 99)
        return (-ts, priority)

    sorted_articles = sorted(articles, key=sort_key)[:limit]

    return [
        {
            "title": a.title,
            "url": a.url,
            "source": _source_label(a.provider),
            "provider": a.provider,
            "ageLabel": _age_label(a),
            "publishedAt": a.published_at.isoformat() if a.published_at else None,
        }
        for a in sorted_articles
    ]
