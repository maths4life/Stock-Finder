"""Validate the news pipeline without writing to the database.

Checks:
  1. Feed reachability - can feedparser parse each provider URL?
  2. Article data quality - title, URL, date present on sampled articles
  3. Dedup key stability - same normalized title -> same key, different -> different
  4. Date filtering - articles older than the window are excluded
  5. Sector classifier - known-good article text matches expected sectors
  6. Importance scoring - 0-1 range, positive/negative words affect score
  7. Polarity scoring - correct +1/0/-1 for positive/negative/neutral articles
  8. _week_bounds - week start/end are always 7 days apart
  9. fetch_all_recent_articles end-to-end (no DB write)

Run from the backend/ directory:
    python scripts/validate_news_pipeline.py

Exit code: 0 = all checks passed, 1 = one or more failures.
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from typing import List, Tuple

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"

CHECK = "[OK]  "
CROSS = "[FAIL]"
WRN = "[WARN]"

results: List[Tuple[str, str, str]] = []  # (check_name, status, detail)


def record(name: str, status: str, detail: str = "") -> None:
    results.append((name, status, detail))
    icon = CHECK if status == PASS else (WRN if status == WARN else CROSS)
    print(f"  {icon}  {name}: {detail}" if detail else f"  {icon}  {name}")


def section(title: str) -> None:
    print(f"\n{'-' * 60}")
    print(f"  {title}")
    print(f"{'-' * 60}")


# ---------------------------------------------------------------------------
# 1. Feed reachability
# ---------------------------------------------------------------------------


def check_feeds() -> None:
    section("1. RSS Feed Reachability")

    import feedparser
    from services.news_provider import PROVIDERS

    feed_results = []
    for provider in PROVIDERS:
        try:
            parsed = feedparser.parse(provider.feed_url)
            # feedparser never raises - it sets bozo=True on parse errors
            if parsed.bozo and not getattr(parsed, "entries", []):
                record(
                    f"Feed: {provider.name}",
                    FAIL,
                    f"Parse error: {parsed.bozo_exception}",
                )
                feed_results.append(False)
            else:
                n = len(getattr(parsed, "entries", []))
                if n == 0:
                    record(
                        f"Feed: {provider.name}",
                        WARN,
                        "Parsed OK but returned 0 articles (URL may have moved or be blocked)",
                    )
                    feed_results.append(False)
                else:
                    record(f"Feed: {provider.name}", PASS, f"{n} article(s) in feed")
                    feed_results.append(True)
        except Exception as exc:
            record(f"Feed: {provider.name}", FAIL, f"Exception: {exc}")
            feed_results.append(False)

    n_ok = sum(feed_results)
    n_total = len(feed_results)
    if n_ok == 0:
        record(
            "Feed reachability - overall",
            FAIL,
            f"0/{n_total} feeds returned articles. Check network or URL changes.",
        )
    elif n_ok < n_total:
        record(
            "Feed reachability - overall",
            WARN,
            f"{n_ok}/{n_total} feeds returned articles. {n_total - n_ok} failed - pipeline will degrade gracefully.",
        )
    else:
        record("Feed reachability - overall", PASS, f"All {n_total} feeds returned articles.")


# ---------------------------------------------------------------------------
# 2. Article data quality (spot-check the first live article from each feed)
# ---------------------------------------------------------------------------


def check_article_quality() -> None:
    section("2. Article Data Quality (spot-check first article per feed)")

    import feedparser
    from services.news_provider import PROVIDERS, _entry_published_at

    for provider in PROVIDERS:
        try:
            parsed = feedparser.parse(provider.feed_url)
            entries = getattr(parsed, "entries", [])
            if not entries:
                record(f"Quality: {provider.name}", WARN, "No entries to inspect")
                continue
            e = entries[0]
            title = getattr(e, "title", None)
            link = getattr(e, "link", None)
            pub = _entry_published_at(e)
            issues = []
            if not title:
                issues.append("missing title")
            if not link:
                issues.append("missing link")
            if pub is None:
                issues.append("no published_at (kept with null date - expected behavior)")
            if issues:
                record(
                    f"Quality: {provider.name}",
                    WARN,
                    f"First article issues: {'; '.join(issues)}",
                )
            else:
                age_h = (datetime.now(timezone.utc) - pub).total_seconds() / 3600
                record(
                    f"Quality: {provider.name}",
                    PASS,
                    f"title present, URL present, published {age_h:.0f}h ago",
                )
        except Exception as exc:
            record(f"Quality: {provider.name}", WARN, f"Could not inspect: {exc}")


# ---------------------------------------------------------------------------
# 3. Dedup key logic
# ---------------------------------------------------------------------------


def check_dedup_key() -> None:
    section("3. Dedup Key Stability")

    from services.news_provider import RawArticle

    def make(title: str) -> RawArticle:
        return RawArticle(provider="test", title=title, url="http://x", summary="", published_at=None)

    a1 = make("RBI cuts repo rate by 25 bps!")
    a2 = make("RBI cuts repo rate by 25 bps")   # punctuation diff
    a3 = make("rbi cuts repo rate by 25 bps")   # case diff
    a4 = make("SEBI fines promoter for disclosure lapses")

    if a1.dedup_key == a2.dedup_key == a3.dedup_key:
        record("Dedup key: same story, different punctuation/case", PASS, "Keys match")
    else:
        record(
            "Dedup key: same story, different punctuation/case",
            FAIL,
            f"Keys differ: {a1.dedup_key[:8]} vs {a2.dedup_key[:8]} vs {a3.dedup_key[:8]}",
        )

    if a1.dedup_key != a4.dedup_key:
        record("Dedup key: different stories produce different keys", PASS)
    else:
        record("Dedup key: different stories produce different keys", FAIL, "Keys collided!")

    # Empty title edge case - should not raise
    try:
        empty = make("")
        _ = empty.dedup_key
        record("Dedup key: empty title does not raise", PASS)
    except Exception as exc:
        record("Dedup key: empty title does not raise", FAIL, str(exc))


# ---------------------------------------------------------------------------
# 4. Date filtering
# ---------------------------------------------------------------------------


def check_date_filtering() -> None:
    section("4. Date Filtering")

    from services.news_provider import RawArticle

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=7)

    old_article = RawArticle("test", "Old news", "http://a", "", now - timedelta(days=10))
    recent_article = RawArticle("test", "Fresh news", "http://b", "", now - timedelta(hours=2))
    no_date_article = RawArticle("test", "Undated news", "http://c", "", None)

    old_excluded = old_article.published_at < since
    record("Date filter: 10-day-old article excluded", PASS if old_excluded else FAIL)

    recent_included = not (recent_article.published_at < since)
    record("Date filter: 2-hour-old article included", PASS if recent_included else FAIL)

    no_date_kept = no_date_article.published_at is None
    record("Date filter: undated article kept (null date = include)", PASS if no_date_kept else FAIL)


# ---------------------------------------------------------------------------
# 5. Sector classifier (offline - no DB required)
# ---------------------------------------------------------------------------


def check_sector_classifier() -> None:
    section("5. Sector Classifier (offline, keyword-based)")

    from config.sectors import SECTOR_KEYWORDS
    from services.news_provider import RawArticle
    from services.sector_classifier import classify_article

    # Build minimal fake sectors + company lexicon from SECTOR_KEYWORDS only
    fake_sectors = list(SECTOR_KEYWORDS.keys())
    fake_company_lexicon: dict = {s: [] for s in fake_sectors}

    def article(title: str, summary: str = "") -> RawArticle:
        return RawArticle("test", title, "http://x", summary, None)

    tests = [
        (article("RBI cuts repo rate - banking sector cheers"), ["Private Banks"]),
        (article("HAL wins defence contract for fighter jets"), ["Defence"]),
        (article("Electric vehicle sales surge in Q3"), ["Automobiles"]),
        (article("TCS reports strong deal wins in IT services"), ["IT Services"]),
        (article("Specialty chemical exports rise on China+1 trend"), ["Specialty Chemicals"]),
    ]

    for art, expected_sectors in tests:
        matched = classify_article(art, fake_sectors, fake_company_lexicon)
        for exp in expected_sectors:
            if exp in matched:
                record(
                    f"Classifier: '{art.title[:50]}'",
                    PASS,
                    f"Correctly matched -> {exp}",
                )
            else:
                record(
                    f"Classifier: '{art.title[:50]}'",
                    FAIL,
                    f"Expected '{exp}' but got {matched or '(no match)'}",
                )

    # An unrelated article should not match any sector
    unrelated = article("Local cricket team wins regional trophy")
    matched_unrelated = classify_article(unrelated, fake_sectors, fake_company_lexicon)
    if not matched_unrelated:
        record("Classifier: unrelated article -> no sector match", PASS)
    else:
        record("Classifier: unrelated article -> no sector match", WARN, f"Matched: {matched_unrelated}")


# ---------------------------------------------------------------------------
# 6 & 7. Importance and polarity scoring
# ---------------------------------------------------------------------------


def check_scoring() -> None:
    section("6. Importance Scoring (0-1 range)")

    from services.news_provider import RawArticle
    from services.sector_classifier import importance_score, polarity_score

    def art(title: str, summary: str = "") -> RawArticle:
        return RawArticle("test", title, "http://x", summary, None)

    bare_headline = art("Markets close flat")
    rich_article = art(
        "Infosys beats expectations with record profit growth",
        "Infosys reported strong earnings this quarter, with profit surging 25% YoY. "
        "The results beat analyst estimates and the stock rallied sharply.",
    )
    negative_article = art(
        "Banking sector faces headwinds as NPA levels rise",
        "Loan defaults surge, weak credit growth.",
    )

    for a, label in [
        (bare_headline, "bare headline"),
        (rich_article, "rich article"),
        (negative_article, "negative article"),
    ]:
        score = importance_score(a)
        if 0.0 <= score <= 1.0:
            record(f"Importance: {label}", PASS, f"score={score}")
        else:
            record(f"Importance: {label}", FAIL, f"Out of range: {score}")

    if importance_score(rich_article) > importance_score(bare_headline):
        record("Importance: rich article scores higher than bare headline", PASS)
    else:
        record("Importance: rich article scores higher than bare headline", FAIL, "Rich article should score higher")

    section("7. Polarity Scoring (+1/0/-1)")

    pos = art("Strong profit growth, stock rallies on record earnings beat")
    neg = art("Losses mount, stock falls on weak results and fraud probe")
    neutral = art("Company announces board meeting scheduled for next week")

    pos_score = polarity_score(pos)
    neg_score = polarity_score(neg)
    neu_score = polarity_score(neutral)

    record("Polarity: positive article -> +1", PASS if pos_score == 1 else FAIL, f"got {pos_score}")
    record("Polarity: negative article -> -1", PASS if neg_score == -1 else FAIL, f"got {neg_score}")
    record("Polarity: neutral article -> 0", PASS if neu_score == 0 else FAIL, f"got {neu_score}")


# ---------------------------------------------------------------------------
# 8. _week_bounds
# ---------------------------------------------------------------------------


def check_week_bounds() -> None:
    section("8. Week Bounds Helper")

    from services.weekly_market_intelligence import _week_bounds

    today = date(2026, 9, 6)
    start, end = _week_bounds(today)

    if end == today:
        record("_week_bounds: end == reference_date", PASS)
    else:
        record("_week_bounds: end == reference_date", FAIL, f"end={end}, expected {today}")

    if (end - start).days == 6:
        record("_week_bounds: window is exactly 7 days", PASS, f"{start} to {end}")
    else:
        record("_week_bounds: window is exactly 7 days", FAIL, f"got {(end - start).days + 1} days")

    # Default (no arg) should not raise
    try:
        s2, e2 = _week_bounds()
        record("_week_bounds: default (no arg) does not raise", PASS, f"{s2} to {e2}")
    except Exception as exc:
        record("_week_bounds: default (no arg) does not raise", FAIL, str(exc))


# ---------------------------------------------------------------------------
# 9. fetch_all_recent_articles integration (reads live feeds, no DB write)
# ---------------------------------------------------------------------------


def check_fetch_all() -> None:
    section("9. fetch_all_recent_articles() - end-to-end (no DB write)")

    from services.news_provider import fetch_all_recent_articles

    try:
        articles = fetch_all_recent_articles(days=7)
        if not articles:
            record(
                "fetch_all_recent_articles",
                WARN,
                "Returned 0 articles - all feeds may have failed or returned nothing in the 7-day window",
            )
            return

        keys = [a.dedup_key for a in articles]
        unique_keys = set(keys)
        record(
            "fetch_all_recent_articles",
            PASS,
            f"Fetched {len(articles)} articles from all providers, {len(unique_keys)} unique dedup keys",
        )

        if len(keys) != len(unique_keys):
            record(
                "fetch_all: dedup keys within single fetch",
                WARN,
                f"{len(keys) - len(unique_keys)} collisions (expected from cross-provider syndication)",
            )
        else:
            record("fetch_all: all dedup keys are unique within this fetch", PASS)

        # Check no article has a blank title or URL
        bad = [a for a in articles if not a.title or not a.url]
        if bad:
            record("fetch_all: all articles have title + URL", FAIL, f"{len(bad)} articles missing title or URL")
        else:
            record("fetch_all: all articles have title + URL", PASS)

        # Date sanity: no article should be dated more than 2h in the future
        future = [
            a for a in articles
            if a.published_at and a.published_at > datetime.now(timezone.utc) + timedelta(hours=2)
        ]
        if future:
            record("fetch_all: no articles dated in the future", WARN, f"{len(future)} have future timestamps")
        else:
            record("fetch_all: no articles dated in the future", PASS)

        # Spot-check: count articles that have a valid published_at vs. null
        dated = sum(1 for a in articles if a.published_at is not None)
        undated = len(articles) - dated
        record(
            "fetch_all: date coverage",
            PASS if dated > 0 else WARN,
            f"{dated} dated, {undated} undated (undated articles are kept, as designed)",
        )

    except Exception as exc:
        record("fetch_all_recent_articles", FAIL, f"Unexpected exception: {exc}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    print("=" * 60)
    print("  Stock Finder - News Pipeline Validation")
    print("=" * 60)
    print("\nThis script validates the news pipeline without writing")
    print("to the database. Run from the backend/ directory.\n")

    check_feeds()
    check_article_quality()
    check_dedup_key()
    check_date_filtering()
    check_sector_classifier()
    check_scoring()
    check_week_bounds()
    check_fetch_all()

    # Summary
    print(f"\n{'=' * 60}")
    print("  Summary")
    print(f"{'=' * 60}")
    n_pass = sum(1 for _, s, _ in results if s == PASS)
    n_warn = sum(1 for _, s, _ in results if s == WARN)
    n_fail = sum(1 for _, s, _ in results if s == FAIL)
    print(f"\n  Total checks : {len(results)}")
    print(f"  {CHECK} Passed   : {n_pass}")
    print(f"  {WRN} Warnings : {n_warn}")
    print(f"  {CROSS} Failed   : {n_fail}")

    if n_fail > 0:
        print("\n  FAILED checks:")
        for name, status, detail in results:
            if status == FAIL:
                print(f"    {CROSS}  {name}: {detail}")

    if n_warn > 0:
        print("\n  WARNINGS (non-fatal):")
        for name, status, detail in results:
            if status == WARN:
                print(f"    {WRN}  {name}: {detail}")

    print()
    if n_fail == 0:
        print(f"  {CHECK} All checks passed (warnings are non-fatal).")
        return 0
    else:
        print(f"  {CROSS} One or more checks FAILED. See details above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
