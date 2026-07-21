"""Module 7 -- the Weekly Intelligence Engine.

This file owns the weekly refresh pipeline:
`refresh_weekly_intelligence()` (news_provider -> sector_classifier ->
market_summary_generator -> `weekly_sector_intelligence` table). Meant to
run once a week (e.g. every Sunday via cron/Task Scheduler calling
`python -m ingest.weekly_news_refresh`), not per-request -- see that
script and the "Weekly refresh workflow" section of MODULE_7_REPORT.md.

The read path this module used to expose --
`get_weekly_market_intelligence_for_company(symbol)`, backing
GET /company/{symbol}/weekly-market-intelligence -- was removed along
with the Company Research page's "Weekly Market Intelligence" section
(see routes/weekly_intelligence.py). The refresh pipeline and the
`weekly_sector_intelligence` table it writes are untouched, since
`ingest/weekly_news_refresh.py` still calls `refresh_weekly_intelligence`
directly and isn't part of that page.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import text

from db.db import engine
from services.market_summary_generator import build_major_events, sector_outlook_from_articles, weekly_sector_summary
from services.news_provider import RawArticle, fetch_all_recent_articles
from services.sector_classifier import classify_article, get_classification_context, importance_score

REFRESH_WINDOW_DAYS = 7


def _week_bounds(reference_date: Optional[date] = None) -> tuple[date, date]:
    """Monday-Sunday window covering the previous 7 calendar days, ending
    at `reference_date` (defaults to today) -- per the brief's explicit
    "always analyze a full week, never just today/yesterday" requirement."""
    ref = reference_date or datetime.now(timezone.utc).date()
    week_start = ref - timedelta(days=REFRESH_WINDOW_DAYS - 1)
    return week_start, ref


# ---------------------------------------------------------------------------
# 1. Weekly refresh pipeline
# ---------------------------------------------------------------------------


def _insert_and_dedupe_articles(conn, articles: List[RawArticle], week_start: date) -> List[Dict]:
    """Upserts articles into `news_articles` on `dedup_key`, returning the
    full set of *current* rows (including ones already stored from an
    earlier refresh this week) so classification always runs over
    everything in the window, not just this run's fresh fetch."""
    insert_stmt = text(
        """
        insert into news_articles (provider, title, url, summary, published_at, dedup_key)
        values (:provider, :title, :url, :summary, :published_at, :dedup_key)
        on conflict (dedup_key) do nothing
        """
    )
    for article in articles:
        conn.execute(
            insert_stmt,
            {
                "provider": article.provider,
                "title": article.title,
                "url": article.url,
                "summary": article.summary,
                "published_at": article.published_at,
                "dedup_key": article.dedup_key,
            },
        )

    rows = conn.execute(
        text(
            """
            select id, provider, title, url, summary, published_at
            from news_articles
            where published_at is null or published_at::date >= :week_start
            """
        ),
        {"week_start": week_start},
    ).mappings().all()
    return [dict(row) for row in rows]


def refresh_weekly_intelligence(reference_date: Optional[date] = None) -> Dict:
    """Runs the full Module 7 pipeline described in the spec's Core
    Workflow diagram:

    fetch (7 days, all providers) -> merge -> dedupe -> classify into
    sectors -> group similar events -> generate weekly sector
    intelligence -> upsert into `weekly_sector_intelligence`.

    Sector-level output only -- there's no per-company read path in this
    module anymore (see the module docstring for why); this function
    only ever writes sector-level news intelligence.
    """
    week_start, week_end = _week_bounds(reference_date)

    raw_articles = fetch_all_recent_articles(days=REFRESH_WINDOW_DAYS)
    sectors, company_lexicon = get_classification_context()

    with engine.begin() as conn:
        stored_rows = _insert_and_dedupe_articles(conn, raw_articles, week_start)

        # Rebuild RawArticle objects from storage so classification/scoring
        # runs over the full week's deduped set, not just this run's fetch
        # (a mid-week second refresh should still see Monday's articles).
        articles_by_id = {
            row["id"]: RawArticle(
                provider=row["provider"],
                title=row["title"],
                url=row["url"],
                summary=row["summary"] or "",
                published_at=row["published_at"],
            )
            for row in stored_rows
        }

        sector_articles: Dict[str, List[RawArticle]] = {s: [] for s in sectors}
        article_sector_rows = []
        for article_id, article in articles_by_id.items():
            matched_sectors = classify_article(article, sectors, company_lexicon)
            for sector in matched_sectors:
                sector_articles[sector].append(article)
                article_sector_rows.append(
                    {"article_id": article_id, "sector": sector, "importance": importance_score(article)}
                )

        if article_sector_rows:
            conn.execute(
                text(
                    """
                    insert into news_article_sectors (article_id, sector, importance)
                    values (:article_id, :sector, :importance)
                    on conflict (article_id, sector) do update set importance = excluded.importance
                    """
                ),
                article_sector_rows,
            )

        sectors_updated: List[str] = []
        for sector, articles in sector_articles.items():
            if not articles:
                continue
            outlook = sector_outlook_from_articles(articles)
            summary = weekly_sector_summary(sector, articles, outlook)
            major_events = build_major_events(articles)

            conn.execute(
                text(
                    """
                    insert into weekly_sector_intelligence
                        (sector, week_start_date, week_end_date, outlook, summary, major_events, article_count, generated_at)
                    values
                        (:sector, :week_start, :week_end, :outlook, :summary, cast(:major_events as jsonb), :article_count, :generated_at)
                    on conflict (sector, week_start_date) do update set
                        week_end_date = excluded.week_end_date,
                        outlook = excluded.outlook,
                        summary = excluded.summary,
                        major_events = excluded.major_events,
                        article_count = excluded.article_count,
                        generated_at = excluded.generated_at
                    """
                ),
                {
                    "sector": sector,
                    "week_start": week_start,
                    "week_end": week_end,
                    "outlook": outlook,
                    "summary": summary,
                    "major_events": _to_jsonb(major_events),
                    "article_count": len(articles),
                    "generated_at": datetime.now(timezone.utc),
                },
            )
            sectors_updated.append(sector)

    return {
        "weekStartDate": week_start.isoformat(),
        "weekEndDate": week_end.isoformat(),
        "sectorsUpdated": sectors_updated,
        "articlesFetched": len(raw_articles),
        "articlesKept": len(articles_by_id),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def _to_jsonb(value) -> str:
    return json.dumps(value)
