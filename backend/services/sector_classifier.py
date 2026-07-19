"""Module 7 -- classify a raw news article into one or more sectors and
score its market importance.

Deliberately reuses two things instead of inventing new ones:
- `companies.sector` (via services.company_service.get_all_companies) as
  the closed set of valid sector labels -- this module can never emit a
  sector that doesn't already exist on the platform.
- The keyword lexicon in config/sectors.py for the accuracy boost of
  matching sector *language*, not just company names.

Same "transparent rule-based heuristic, not a trained model" spirit as
services/scoring_service.py and analysis/rules/* -- documented, not
hidden, and easy to replace with a real model later without touching
any caller.
"""
from __future__ import annotations

from typing import Dict, List, Set, Tuple

from config.sectors import MACRO_KEYWORDS, NEGATIVE_WORDS, POSITIVE_WORDS, SECTOR_KEYWORDS
from services.company_service import get_all_companies
from services.news_provider import RawArticle


def _article_text(article: RawArticle) -> str:
    return f"{article.title} {article.summary}".lower()


def _known_sectors_and_company_lexicon() -> Tuple[List[str], Dict[str, List[str]]]:
    """Pulls the real, current sector list + a company-name/symbol -> sector
    lookup straight from the database (via the same company_service
    function every other module uses) -- never hardcoded, so a new
    company/sector added to the DB is classifiable immediately."""
    companies = get_all_companies(limit=2000)
    sectors = sorted({c["sector"] for c in companies if c.get("sector")})

    company_lexicon: Dict[str, List[str]] = {}
    for c in companies:
        sector = c.get("sector")
        if not sector:
            continue
        company_lexicon.setdefault(sector, [])
        company_lexicon[sector].append(c["name"].lower())
        company_lexicon[sector].append(c["symbol"].lower())

    return sectors, company_lexicon


def classify_article(article: RawArticle, sectors: List[str], company_lexicon: Dict[str, List[str]]) -> List[str]:
    """Returns every sector (from the real, DB-backed `sectors` list) whose
    keywords or company names appear in the article. An article can match
    zero, one, or several sectors -- zero-match articles are dropped by
    the caller (weekly_market_intelligence.py), since Module 7's brief is
    explicit: if a story can't be tied to a sector/company, it doesn't
    belong in the output."""
    text = _article_text(article)
    matched: Set[str] = set()

    for sector in sectors:
        for phrase in SECTOR_KEYWORDS.get(sector, []):
            if phrase in text:
                matched.add(sector)
                break
        if sector in matched:
            continue
        for phrase in company_lexicon.get(sector, []):
            if phrase and phrase in text:
                matched.add(sector)
                break

    return sorted(matched)


def is_macro_relevant(article: RawArticle) -> bool:
    """Broad market-moving stories (rate decisions, budget, GDP) that
    matter regardless of sector match -- used by
    market_summary_generator.py to decide whether a sector with a genuine
    macro tailwind/headwind but no sector-specific keyword hit still gets
    a mention."""
    text = _article_text(article)
    return any(term in text for term in MACRO_KEYWORDS)


def importance_score(article: RawArticle) -> float:
    """0-1 heuristic: how much this article should weigh in a sector's
    outlook and in "major events" selection. Deliberately simple and
    explainable -- word-count-based signal strength, not a trained
    salience model. Longer, more detailed coverage (has a real summary)
    and stories using decisive language (clear positive/negative words)
    score higher than a bare headline with no polarity signal."""
    text = _article_text(article)
    polarity_hits = sum(1 for w in POSITIVE_WORDS if w in text) + sum(1 for w in NEGATIVE_WORDS if w in text)
    has_summary = 1 if article.summary and len(article.summary) > 40 else 0
    score = 0.4 + min(polarity_hits, 3) * 0.15 + has_summary * 0.15
    return round(min(score, 1.0), 2)


def polarity_score(article: RawArticle) -> int:
    """+1 / 0 / -1 read of an article's headline+summary language --
    the input `market_summary_generator.sector_outlook_from_articles`
    aggregates into a sector's Positive/Neutral/Negative outlook."""
    text = _article_text(article)
    positives = sum(1 for w in POSITIVE_WORDS if w in text)
    negatives = sum(1 for w in NEGATIVE_WORDS if w in text)
    if positives > negatives:
        return 1
    if negatives > positives:
        return -1
    return 0


def get_classification_context() -> Tuple[List[str], Dict[str, List[str]]]:
    """Thin public wrapper so callers (weekly_market_intelligence.py)
    fetch the sector/company lexicon exactly once per refresh, not once
    per article."""
    return _known_sectors_and_company_lexicon()
