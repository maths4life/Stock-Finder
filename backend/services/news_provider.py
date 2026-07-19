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
        parsed = feedparser.parse(self.feed_url)
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
# Provider registry -- add new providers here, nowhere else.
# ---------------------------------------------------------------------------

PROVIDERS: List[NewsProvider] = [
    RSSNewsProvider(
        name="google_news",
        # Scoped to Indian stock market news specifically, not general
        # Google News -- avoids pulling in unrelated world news that
        # would never answer this module's "how does this affect the
        # company/sector I'm researching" question.
        feed_url="https://news.google.com/rss/search?q=NSE+OR+BSE+stock+market+India+when:7d&hl=en-IN&gl=IN&ceid=IN:en",
    ),
    RSSNewsProvider(
        name="yahoo_finance",
        feed_url="https://finance.yahoo.com/news/rssindex",
    ),
    RSSNewsProvider(
        name="moneycontrol",
        feed_url="https://www.moneycontrol.com/rss/latestnews.xml",
    ),
    RSSNewsProvider(
        name="economic_times",
        feed_url="https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    ),
    RSSNewsProvider(
        name="business_standard",
        feed_url="https://www.business-standard.com/rss/markets-106.rss",
    ),
]


def fetch_all_recent_articles(days: int = 7) -> List[RawArticle]:
    """Merge -- but do not yet deduplicate or classify -- articles from
    every configured provider published in the last `days` calendar days.
    Deduplication happens one layer up (weekly_market_intelligence.py),
    since it needs to write survivors to the `news_articles` table, which
    this I/O-only module doesn't touch.

    A provider that fails (network error, malformed feed, site down)
    is skipped, not fatal -- Module 7 should degrade to fewer sources
    rather than fail the whole weekly refresh over one provider outage.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    all_articles: List[RawArticle] = []

    for provider in PROVIDERS:
        try:
            all_articles.extend(provider.fetch(since))
        except Exception as exc:  # noqa: BLE001 -- deliberately broad, see docstring
            print(f"[news_provider] {provider.name} failed, skipping: {exc}")
            continue

    return all_articles
