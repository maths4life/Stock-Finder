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
from services.sector_classifier import importance_score

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


# Providers whose content is scoped to Indian markets.
# yahoo_finance is a global feed and is deliberately excluded from the
# sidebar — it's kept in the weekly intelligence pipeline (which needs
# broad coverage) but filtered out here so only Indian news is shown.
_INDIA_PROVIDERS = {"economic_times", "hindu_business_line", "livemint", "google_news"}

# Minimum importance score to surface in the sidebar. Articles below this
# are bare headlines with no polarity signal and no real summary — not
# worth showing. 0.55 = base(0.40) + at least one polarity word(0.15).
_MIN_IMPORTANCE = 0.55

# Priority order within Indian sources.
_SOURCE_PRIORITY = {
    "economic_times": 0,
    "hindu_business_line": 1,
    "livemint": 2,
    "google_news": 3,
}


@router.get("/news/market")
def get_market_news(limit: int = Query(default=8, ge=1, le=30)):
    """Live Indian market news feed — quality-filtered, deduplicated, sorted newest-first.

    Pipeline applied before caching:
      1. Indian providers only (drops yahoo_finance global feed)
      2. Deduplicate by title hash
      3. importance_score >= 0.55 — drops bare headlines with no
         polarity signal and no real summary

    Cached in-process for 5 minutes to match the React Query staleTime.
    """
    articles = _get_cached_articles()
    if articles is None:
        raw = fetch_all_recent_articles(days=2)
        # 1. Keep only Indian-market providers.
        india_only = [a for a in raw if a.provider in _INDIA_PROVIDERS]
        # 2. Deduplicate by title hash (same key the DB pipeline uses).
        seen: set = set()
        deduped: List[RawArticle] = []
        for a in india_only:
            if a.dedup_key not in seen:
                seen.add(a.dedup_key)
                deduped.append(a)
        # 3. Quality gate — drop bare headlines with no substance.
        quality = [a for a in deduped if importance_score(a) >= _MIN_IMPORTANCE]
        _set_cached_articles(quality)
        articles = quality

    # Sort: newest-first; within same timestamp, higher importance wins;
    # within same importance, higher-priority source wins.
    def sort_key(a: RawArticle):
        ts = a.published_at.timestamp() if a.published_at else 0
        score = importance_score(a)
        priority = _SOURCE_PRIORITY.get(a.provider, 99)
        return (-ts, -score, priority)

    sorted_articles = sorted(articles, key=sort_key)[:limit]

    return [
        {
            "title": a.title,
            "url": a.url,
            "source": _source_label(a.provider),
            "provider": a.provider,
            "ageLabel": _age_label(a),
            "publishedAt": a.published_at.isoformat() if a.published_at else None,
            "importance": importance_score(a),
        }
        for a in sorted_articles
    ]
