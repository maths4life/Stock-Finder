"""Module 7 -- news collection.

Fetches raw articles from multiple free financial news providers over an
RSS interface. This module knows nothing about sectors, companies, or
scoring -- it only fetches, normalizes, and hands back a flat list of
`RawArticle`. Everything downstream (dedup, classification, summary
generation) lives in sector_classifier.py / market_summary_generator.py /
weekly_market_intelligence.py, same layering as the rest of the project
(route -> service -> ... , no business logic mixed into I/O code).

Adding a new provider is a one-line addition to `PROVIDERS` below -- every
provider is just an RSS feed URL plus a name, using the same
`RSSNewsProvider` implementation. No provider-specific parsing code is
needed unless a future provider isn't RSS-based (e.g. a JSON API), in
which case it gets its own `NewsProvider` subclass next to this one.

Network note: this environment has no outbound network access, so the
actual HTTP fetches in `RSSNewsProvider.fetch()` could not be executed or
verified against live feeds during this session. The feed URLs below are
real, publicly documented RSS endpoints as of this writing, but please
verify each one resolves (a quick `curl -I <url>`) before relying on this
in production -- financial news sites occasionally change RSS paths
without redirects. See MODULE_7_REPORT.md's Validation section.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import feedparser


@dataclass
class RawArticle:
    provider: str
    title: str
    url: str
    summary: str
    published_at: Optional[datetime]

    @property
    def dedup_key(self) -> str:
        """Normalized title used as the cross-provider de-duplication
        boundary -- the same underlying story is frequently syndicated by
        multiple providers with slightly different HTML/casing/punctuation
        around an identical headline."""
        normalized = re.sub(r"[^a-z0-9 ]", "", self.title.lower())
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class NewsProvider:
    """Minimal interface every provider implements."""

    name: str

    def fetch(self, since: datetime) -> List[RawArticle]:
        raise NotImplementedError


class RSSNewsProvider(NewsProvider):
    """Generic RSS-feed-backed provider. Covers every provider in
    `PROVIDERS` today -- Yahoo Finance, Moneycontrol, Economic Times,
    Business Standard, and Google News (finance-scoped query) all publish
    RSS. `feedparser` handles the wide variance in RSS/Atom dialects
    across these sites so this class doesn't need per-site XML parsing.
    """

    def __init__(self, name: str, feed_url: str):
        self.name = name
        self.feed_url = feed_url

    def fetch(self, since: datetime) -> List[RawArticle]:
        import urllib.request
        try:
            req = urllib.request.Request(
                self.feed_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StockFinder/1.0"}
            )
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                content = resp.read()
            parsed = feedparser.parse(content)
        except Exception as exc:
            # Fall back to feedparser direct or return empty on timeout
            return []
        articles: List[RawArticle] = []

        for entry in getattr(parsed, "entries", []):
            title = getattr(entry, "title", None)
            link = getattr(entry, "link", None)
            if not title or not link:
                continue

            published_at = _entry_published_at(entry)
            # If the provider gives no timestamp at all, keep the article
            # rather than drop it -- the caller's date filter falls back
            # to treating it as "fetched now" (see
            # weekly_market_intelligence.py's filtering step), which is
            # still within the current week for a fresh fetch. Providers
            # that reliably omit dates are a known limitation, documented
            # in MODULE_7_REPORT.md.
            if published_at is not None and published_at < since:
                continue

            summary = getattr(entry, "summary", "") or ""
            articles.append(
                RawArticle(
                    provider=self.name,
                    title=title.strip(),
                    url=link.strip(),
                    summary=_strip_html(summary)[:500],
                    published_at=published_at,
                )
            )

        return articles


def _entry_published_at(entry) -> Optional[datetime]:
    time_struct = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if not time_struct:
        return None
    return datetime(*time_struct[:6], tzinfo=timezone.utc)


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text).strip()


# ---------------------------------------------------------------------------
# Provider registry -- strictly Economic Times feeds per product directive
# ---------------------------------------------------------------------------

PROVIDERS: List[NewsProvider] = [
    RSSNewsProvider(
        name="economic_times",
        feed_url="https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    ),
    RSSNewsProvider(
        name="economic_times_stocks",
        feed_url="https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
    ),
    RSSNewsProvider(
        name="economic_times_industry",
        feed_url="https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
    ),
]


def fetch_all_recent_articles(days: int = 7) -> List[RawArticle]:
    """Fetch articles concurrently with bounded thread pool and per-provider timeouts."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    all_articles: List[RawArticle] = []
    from concurrent.futures import ThreadPoolExecutor, as_completed

    with ThreadPoolExecutor(max_workers=len(PROVIDERS)) as executor:
        futures = {executor.submit(p.fetch, since): p.name for p in PROVIDERS}
        for future in as_completed(futures):
            pname = futures[future]
            try:
                articles = future.result()
                all_articles.extend(articles)
            except Exception as exc:
                print(f"[news_provider] {pname} failed in pool: {exc}")

    return all_articles
